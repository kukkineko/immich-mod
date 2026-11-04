#!/usr/bin/env python3
"""
Encode the videos of an immich-mod server on this PC's GPU, on request.

The server lists the videos that have no encoded copy yet. For each one this script downloads the original, encodes it
with the fastest encoder it can find (NVIDIA NVENC, Intel Quick Sync, AMD AMF, else the CPU), and uploads the result.
The server checks the file and stores it exactly like its own encoding, so the "e" badge and stored-copy playback
pick it up straight away. Nothing is changed on the server until an upload has finished and passed its check.

Needs: Python 3.9+, ffmpeg on PATH (Windows: winget install Gyan.FFmpeg), and an Immich API key
(Account Settings -> API Keys) of the account that owns the videos.

    python immich_gpu_encode.py --server http://truenas.local:30041 --key <api key>
"""

import argparse
import http.client
import json
import os
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import queue
import time
import urllib.parse
import urllib.request

CHUNK = 4 * 1024 * 1024


def fail(message):
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


class Server:
    def __init__(self, base, key, insecure):
        self.base = base.rstrip("/")
        self.key = key
        parsed = urllib.parse.urlparse(self.base)
        self.parsed = parsed
        self.context = ssl._create_unverified_context() if insecure and parsed.scheme == "https" else None

    def _connection(self, timeout=600):
        cls = http.client.HTTPSConnection if self.parsed.scheme == "https" else http.client.HTTPConnection
        kwargs = {"timeout": timeout}
        if self.context:
            kwargs["context"] = self.context
        return cls(self.parsed.netloc, **kwargs)

    @staticmethod
    def _tune(connection):
        # big socket buffers keep a fast link full
        connection.connect()
        for option in (socket.SO_RCVBUF, socket.SO_SNDBUF):
            try:
                connection.sock.setsockopt(socket.SOL_SOCKET, option, 8 * 1024 * 1024)
            except OSError:
                pass

    def _path(self, path):
        return self.parsed.path.rstrip("/") + path

    def get_json(self, path):
        connection = self._connection(60)
        connection.request("GET", self._path(path), headers={"x-api-key": self.key, "Accept": "application/json"})
        response = connection.getresponse()
        body = response.read()
        if response.status != 200:
            fail(f"GET {path} -> {response.status} {body[:200]!r}")
        return json.loads(body)

    def download(self, path, target, total, on_progress):
        connection = self._connection()
        self._tune(connection)
        connection.request("GET", self._path(path), headers={"x-api-key": self.key})
        response = connection.getresponse()
        if response.status != 200:
            raise RuntimeError(f"download -> {response.status}")
        done = 0
        with open(target, "wb") as handle:
            while True:
                block = response.read(CHUNK)
                if not block:
                    break
                handle.write(block)
                done += len(block)
                on_progress(done, total)
        connection.close()

    def upload(self, path, source, on_progress):
        size = os.path.getsize(source)
        connection = self._connection(3600)
        self._tune(connection)
        connection.putrequest("PUT", self._path(path))
        connection.putheader("x-api-key", self.key)
        connection.putheader("Content-Type", "video/mp4")
        connection.putheader("Content-Length", str(size))
        connection.endheaders()
        done = 0
        with open(source, "rb") as handle:
            while True:
                block = handle.read(CHUNK)
                if not block:
                    break
                connection.send(block)
                done += len(block)
                on_progress(done, size)
        response = connection.getresponse()
        body = response.read()
        connection.close()
        if response.status not in (200, 204):
            raise RuntimeError(f"upload -> {response.status} {body[:300]!r}")


def human(size):
    value = float(size or 0)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
        value /= 1024


def progress_line(label, done, total):
    if total:
        text = f"\r  {label} {human(done)} / {human(total)} ({done * 100 // total}%)   "
    else:
        text = f"\r  {label} {human(done)}   "
    sys.stdout.write(text)
    sys.stdout.flush()


# ---------------------------------------------------------------- encoders

ENCODERS = {
    # name: (ffmpeg video encoder per codec, quality options that read well at a modest size)
    "nvenc": {"h264": "h264_nvenc", "hevc": "hevc_nvenc", "av1": "av1_nvenc"},
    "qsv": {"h264": "h264_qsv", "hevc": "hevc_qsv", "av1": "av1_qsv"},
    "amf": {"h264": "h264_amf", "hevc": "hevc_amf", "av1": "av1_amf"},
    "cpu": {"h264": "libx264", "hevc": "libx265", "av1": "libsvtav1"},
}


def rate_bits(text):
    unit = 1000 if text[-1] in "kK" else 1_000_000
    return int(float(text[:-1]) * unit)


def encoder_options(kind, codec, bitrate):
    """Options for one encoder: constant-quality leaning, capped at the chosen bitrate."""
    cap = ["-maxrate", bitrate, "-bufsize", str(2 * rate_bits(bitrate))]
    if kind == "nvenc":
        return ["-preset", "p5", "-rc", "vbr", "-cq", "24", "-b:v", "0", *cap]
    if kind == "qsv":
        return ["-preset", "medium", "-global_quality", "24", *cap]
    if kind == "amf":
        return ["-quality", "quality", "-rc", "vbr_peak", "-qp_i", "24", "-qp_p", "26", *cap]
    return ["-preset", "medium", "-crf", "23", *cap]


def works(ffmpeg, kind, codec):
    """True when the encoder exists and really starts on this machine (a driver can be missing)."""
    name = ENCODERS[kind][codec]
    command = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=black:s=256x256:d=0.2",
        "-frames:v", "2", "-pix_fmt", "yuv420p", "-c:v", name, "-f", "null", "-",
    ]
    try:
        return subprocess.run(command, capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def pick_encoder(ffmpeg, wanted, codec):
    order = ["nvenc", "qsv", "amf", "cpu"] if wanted == "auto" else [wanted]
    for kind in order:
        if works(ffmpeg, kind, codec):
            return kind
    fail(f"no working {codec} encoder found (tried: {', '.join(order)})")


def encode(ffmpeg, source, target, kind, codec, height, bitrate, hwaccel):
    # never enlarge; even sizes; 8-bit 4:2:0 so every browser can play it
    scale = f"scale=-2:min(ih\\,{height}),format=yuv420p"
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-nostats"]
    if hwaccel:
        command += ["-hwaccel", "auto"]
    command += [
        "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
        "-c:v", ENCODERS[kind][codec], *encoder_options(kind, codec, bitrate),
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    ]
    if codec == "hevc":
        command += ["-tag:v", "hvc1"]
    command.append(target)
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-400:])


class Stats:
    """Counters shared by all workers; the status line reads them once a second."""

    def __init__(self, total):
        self.lock = threading.Lock()
        self.total = total
        self.down_bytes = 0
        self.up_bytes = 0
        self.active = {"down": 0, "enc": 0, "up": 0}
        self.done = 0
        self.failed = 0
        self.saved = 0
        self.finished = threading.Event()

    def add(self, field, amount):
        with self.lock:
            setattr(self, field, getattr(self, field) + amount)

    def move(self, stage, delta):
        with self.lock:
            self.active[stage] += delta

    def finish(self, ok):
        with self.lock:
            if ok:
                self.done += 1
            else:
                self.failed += 1
            if self.done + self.failed >= self.total:
                self.finished.set()


def log(message):
    sys.stdout.write("\r" + " " * 110 + "\r" + message + "\n")
    sys.stdout.flush()


def status_loop(stats):
    last = (time.time(), 0, 0)
    while not stats.finished.wait(1.0):
        now = time.time()
        with stats.lock:
            down, up = stats.down_bytes, stats.up_bytes
            active = dict(stats.active)
            done, failed = stats.done, stats.failed
        span = max(now - last[0], 0.001)
        down_rate = (down - last[1]) / span
        up_rate = (up - last[2]) / span
        last = (now, down, up)
        sys.stdout.write(
            f"\r  down {down_rate * 8 / 1e6:6.0f} Mbit/s ({active['down']})  "
            f"encode ({active['enc']})  up {up_rate * 8 / 1e6:6.0f} Mbit/s ({active['up']})  "
            f"| {done}/{stats.total} done, {failed} failed   "
        )
        sys.stdout.flush()


def fetch_queue(server, limit):
    """The whole list, in pages, because the server caps one answer."""
    items, seen = [], []
    while True:
        skip = urllib.parse.quote(",".join(seen))
        page = server.get_json(f"/api/view/encode-queue?limit=500&skip={skip}")
        if not page:
            break
        items.extend(page)
        seen.extend(item["id"] for item in page)
        if limit and len(items) >= limit:
            break
    return items[:limit] if limit else items


def run_pipeline(args, server, queue_items, kind, work):
    """Downloads, encodes and uploads at the same time: each stage has its own workers and the stages are chained."""
    stats = Stats(len(queue_items))
    to_download, to_encode, to_upload = queue.Queue(), queue.Queue(), queue.Queue()
    # how many videos may sit on disk at once (downloaded, encoding, or waiting to upload)
    slots = threading.Semaphore(args.inflight)

    def cleanup(*paths):
        for path in paths:
            try:
                os.remove(path)
            except OSError:
                pass

    def downloader():
        while True:
            item = to_download.get()
            slots.acquire()
            name = item["originalFileName"]
            source = os.path.join(work, f"{item['id']}.src")
            stats.move("down", 1)
            last = [0]

            def progress(done, total):
                stats.add("down_bytes", done - last[0])
                last[0] = done

            try:
                server.download(f"/api/assets/{item['id']}/original", source, item.get("size"), progress)
                to_encode.put((item, source))
            except Exception as error:
                log(f"  {name}: download failed: {error}")
                cleanup(source)
                slots.release()
                stats.finish(False)
            finally:
                stats.move("down", -1)

    def encoder():
        while True:
            item, source = to_encode.get()
            name = item["originalFileName"]
            target = os.path.join(work, f"{item['id']}.mp4")
            stats.move("enc", 1)
            try:
                try:
                    encode(args.ffmpeg, source, target, kind, args.codec, args.height, args.bitrate, True)
                except RuntimeError:
                    # some sources do not like hardware decoding; decode in software then
                    encode(args.ffmpeg, source, target, kind, args.codec, args.height, args.bitrate, False)
                to_upload.put((item, target))
            except Exception as error:
                log(f"  {name}: encoding failed: {error}")
                cleanup(target)
                slots.release()
                stats.finish(False)
            finally:
                cleanup(source)
                stats.move("enc", -1)

    def uploader():
        while True:
            item, target = to_upload.get()
            name = item["originalFileName"]
            stats.move("up", 1)
            last = [0]

            def progress(done, total):
                stats.add("up_bytes", done - last[0])
                last[0] = done

            try:
                server.upload(f"/api/view/encoded/{item['id']}", target, progress)
                new_size = os.path.getsize(target)
                stats.add("saved", (item.get("size") or 0) - new_size)
                log(f"  {name}: stored ({human(new_size)}, was {human(item.get('size'))})")
                stats.finish(True)
            except Exception as error:
                log(f"  {name}: upload failed: {error}")
                stats.finish(False)
            finally:
                cleanup(target)
                slots.release()
                stats.move("up", -1)

    for count, function in ((args.downloads, downloader), (args.encoders, encoder), (args.uploads, uploader)):
        for _ in range(count):
            threading.Thread(target=function, daemon=True).start()
    threading.Thread(target=status_loop, args=(stats,), daemon=True).start()

    # biggest first: the long jobs start early and the run ends with small ones, so no worker idles at the end
    for item in sorted(queue_items, key=lambda entry: entry.get("size") or 0, reverse=True):
        to_download.put(item)
    started = time.time()
    while not stats.finished.wait(0.5):
        pass
    minutes = (time.time() - started) / 60
    sys.stdout.write("\r" + " " * 110 + "\r")
    print(
        f"Done in {minutes:.1f} min: {stats.done} stored, {stats.failed} failed, "
        f"{human(stats.down_bytes)} downloaded, {human(stats.up_bytes)} uploaded, {human(max(stats.saved, 0))} saved."
    )


def main():
    parser = argparse.ArgumentParser(description="Encode immich-mod videos on this PC's GPU, on request.")
    parser.add_argument("--server", default=os.environ.get("IMMICH_URL"), help="e.g. http://truenas.local:30041")
    parser.add_argument("--key", default=os.environ.get("IMMICH_API_KEY"), help="Immich API key")
    parser.add_argument("--limit", type=int, default=0, help="stop after this many videos (default: all)")
    parser.add_argument("--height", type=int, default=1080, help="height limit; default 1080")
    parser.add_argument("--bitrate", default="8M", help="maximum bitrate, e.g. 4M or 8000k (default 8M)")
    parser.add_argument("--codec", choices=["h264", "hevc", "av1"], default="h264", help="h264 plays everywhere")
    parser.add_argument("--encoder", choices=["auto", "nvenc", "qsv", "amf", "cpu"], default="auto")
    parser.add_argument("--downloads", type=int, default=4, help="parallel downloads (default 4)")
    parser.add_argument("--encoders", type=int, default=0, help="parallel encodes (default: 3 on a GPU, 1 on the CPU)")
    parser.add_argument("--uploads", type=int, default=3, help="parallel uploads (default 3)")
    parser.add_argument("--inflight", type=int, default=0, help="videos on disk at once (default: encoders + 4)")
    parser.add_argument("--workdir", default=None, help="folder for temporary files, fastest disk you have")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
    parser.add_argument("--insecure", action="store_true", help="accept a self-signed https certificate")
    parser.add_argument("--yes", action="store_true", help="do not ask before starting")
    parser.add_argument("--dry-run", action="store_true", help="only list what would be encoded")
    args = parser.parse_args()

    if not args.server or not args.key:
        fail("--server and --key are required (or set IMMICH_URL and IMMICH_API_KEY)")
    if not shutil.which(args.ffmpeg) and not os.path.exists(args.ffmpeg):
        fail("ffmpeg not found. On Windows: winget install Gyan.FFmpeg  (then open a new terminal)")
    if args.bitrate[-1] not in "kKmM":
        fail("--bitrate needs a unit, like 4M or 8000k")

    server = Server(args.server, args.key, args.insecure)
    queue_items = fetch_queue(server, args.limit)
    if not queue_items:
        print("Every video already has an encoded copy.")
        return
    total_size = sum(item.get("size") or 0 for item in queue_items)
    print(f"{len(queue_items)} video(s) without an encoded copy, {human(total_size)} of originals.")
    if args.dry_run:
        for item in queue_items:
            print(f"  {item['originalFileName']}  {human(item.get('size'))}  {item.get('width')}x{item.get('height')}")
        return

    kind = pick_encoder(args.ffmpeg, args.encoder, args.codec)
    if not args.encoders:
        args.encoders = 1 if kind == "cpu" else 3
    if not args.inflight:
        args.inflight = args.encoders + 4
    print(
        f"Encoder: {ENCODERS[kind][args.codec]}  |  up to {args.height}p, {args.bitrate} max, {args.codec}\n"
        f"Parallel: {args.downloads} downloads, {args.encoders} encodes, {args.uploads} uploads, "
        f"up to {args.inflight} videos on disk"
    )
    if not args.yes and input("Start? [y/N] ").strip().lower() not in ("y", "yes"):
        print("Cancelled.")
        return

    work = tempfile.mkdtemp(prefix="immich-encode-", dir=args.workdir)
    try:
        run_pipeline(args, server, queue_items, kind, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
        os._exit(130)
