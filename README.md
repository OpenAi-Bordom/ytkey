# ytkey

A static, browser-side BPM and musical-key estimator.

## Run locally

Because browser modules and local audio decoding are more reliable over HTTP, serve this folder with any static server:

```bash
node server.js
```

Then open <http://localhost:8787>.

The backend requires `yt-dlp` and `ffmpeg` on the server's PATH. It streams up to 60 seconds of audio through `ffmpeg`, keeps the decoded samples in memory, and returns only BPM/key JSON. Nothing is exposed as a download endpoint and the temporary child processes are closed after each request.

## YouTube URLs

The server-side route is intended only for videos/audio you are authorized to process and must be deployed in line with YouTube's terms and applicable copyright law.

## Deploy on Render

This repo includes a `Dockerfile` and `render.yaml`. In Render, create a new Blueprint and point it at this repository; Render will detect `render.yaml` and build the Docker image. The image installs both `ffmpeg` and `yt-dlp`, and Render provides the `PORT` environment variable automatically.

If creating the service manually, choose **Web Service → Docker**, leave the Dockerfile path as `./Dockerfile`, and do not add a separate build or start command. The site and API must be served by `node server.js`, not a static-site service.

The bundled `ffmpeg-webm.js` and `ffmpeg-worker-webm.js` remain available for a browser-worker fallback, but the backend uses the installed native `ffmpeg` binary for more reliable server-side decoding.
