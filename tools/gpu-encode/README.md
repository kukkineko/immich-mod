# GPU encoding on your PC

Encodes the videos that have no encoded copy yet on this PC's GPU, then hands the result to the server.

1. Install ffmpeg once: `winget install Gyan.FFmpeg` (open a new terminal afterwards).
2. In Immich: Account Settings, API Keys, create a key.
3. Run it when you want it to work:

```
python immich_gpu_encode.py --server http://truenas.local:30041 --key <api key>
```

It lists how many videos are waiting, picks NVENC, Quick Sync or AMF (CPU as a last resort), and asks before it starts.

Useful options: `--dry-run` (just list), `--limit 5`, `--height 720`, `--bitrate 4M`, `--codec hevc`, `--yes`.

Run it once per server (`immich-public` and `immich-mod` have their own videos). The server checks every upload (it
must be a playable video of about the same length) before it is stored, so a broken run changes nothing.
