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
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

CHUNK = 1024 * 1024


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


def encode(ffmpeg, source, target, kind, codec, height, bitrate, duration):
    # never enlarge; even sizes; 8-bit 4:2:0 so every browser can play it
    scale = f"scale=-2:min(ih\\,{height}),format=yuv420p"
    command = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats",
        "-i", source, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale,
        "-c:v", ENCODERS[kind][codec], *encoder_options(kind, codec, bitrate),
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
    ]
    if codec == "hevc":
        command += ["-tag:v", "hvc1"]
    command.append(target)
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    started = time.time()
    for line in process.stdout:
        if line.startswith("out_time_us=") and duration:
            try:
                seconds = int(line.split("=")[1]) / 1_000_000
            except ValueError:
                continue
            speed = seconds / max(time.time() - started, 0.001)
            sys.stdout.write(f"\r  encoding {min(100, int(seconds * 100 / duration))}%  ({speed:.1f}x)   ")
            sys.stdout.flush()
    process.wait()
    if process.returncode != 0:
        raise RuntimeError(process.stderr.read()[-400:])


def main():
    parser = argparse.ArgumentParser(description="Encode immich-mod videos on this PC's GPU, on request.")
    parser.add_argument("--server", default=os.environ.get("IMMICH_URL"), help="e.g. http://truenas.local:30041")
    parser.add_argument("--key", default=os.environ.get("IMMICH_API_KEY"), help="Immich API key")
    parser.add_argument("--limit", type=int, default=0, help="stop after this many videos (default: all)")
    parser.add_argument("--height", type=int, default=1080, help="longest side limit is the height; default 1080")
    parser.add_argument("--bitrate", default="8M", help="maximum bitrate, e.g. 4M or 8000k (default 8M)")
    parser.add_argument("--codec", choices=["h264", "hevc", "av1"], default="h264", help="h264 plays everywhere")
    parser.add_argument("--encoder", choices=["auto", "nvenc", "qsv", "amf", "cpu"], default="auto")
    parser.add_argument("--workdir", default=None, help="folder for temporary files (needs room for one video twice)")
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
    queue = server.get_json("/api/view/encode-queue?limit=500")
    if args.limit:
        queue = queue[: args.limit]
    if not queue:
        print("Every video already has an encoded copy.")
        return
    total_size = sum(item.get("size") or 0 for item in queue)
    print(f"{len(queue)} video(s) without an encoded copy, {human(total_size)} of originals.")
    if args.dry_run:
        for item in queue:
            print(f"  {item['originalFileName']}  {human(item.get('size'))}  {item.get('width')}x{item.get('height')}")
        return

    kind = pick_encoder(args.ffmpeg, args.encoder, args.codec)
    print(f"Encoder: {ENCODERS[kind][args.codec]}  |  up to {args.height}p, {args.bitrate} max, {args.codec}")
    if not args.yes and input("Start? [y/N] ").strip().lower() not in ("y", "yes"):
        print("Cancelled.")
        return

    work = tempfile.mkdtemp(prefix="immich-encode-", dir=args.workdir)
    done = failed = 0
    try:
        for number, item in enumerate(queue, 1):
            name = item["originalFileName"]
            print(f"[{number}/{len(queue)}] {name}")
            source = os.path.join(work, "source" + os.path.splitext(name)[1])
            target = os.path.join(work, "encoded.mp4")
            try:
                server.download(f"/api/assets/{item['id']}/original", source, item.get("size"),
                                lambda d, t: progress_line("downloading", d, t))
                print()
                encode(args.ffmpeg, source, target, kind, args.codec, args.height, args.bitrate,
                       (item.get("duration") or 0) / 1000)
                print()
                server.upload(f"/api/view/encoded/{item['id']}", target, lambda d, t: progress_line("uploading", d, t))
                print(f"\n  stored ({human(os.path.getsize(target))}, was {human(item.get('size'))})")
                done += 1
            except Exception as error:  # one bad video must not stop the rest
                print(f"\n  failed: {error}")
                failed += 1
            finally:
                for path in (source, target):
                    if os.path.exists(path):
                        os.remove(path)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(f"Done: {done} stored, {failed} failed.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
