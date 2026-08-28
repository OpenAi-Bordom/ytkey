# ytkey

URL-only BPM and musical-key estimation with a static frontend and Node backend.

## Local

```bash
node server.js
```

Open <http://localhost:8787>. The backend needs `yt-dlp` and `ffmpeg` on your PATH.

## Render

Push this folder to GitHub, then create a Render **Blueprint** from the repository. Render will use `render.yaml` and build the Docker image. If creating the service manually, choose **Web Service → Docker** and leave the Dockerfile path as `./Dockerfile`.

The Docker image installs Node 22, Deno, `yt-dlp[default]`, and ffmpeg. It processes up to 60 seconds of audio in memory and returns only BPM/key JSON; it does not expose an audio download endpoint. Use only videos/audio you are authorized to process and follow YouTube’s terms and applicable law.
