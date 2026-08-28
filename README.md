# ytkey

YouTube URL-to-BPM/key analyzer, with a static frontend and Render-ready backend.

## Deploy on Render

Push this folder to GitHub, then create a Render **Blueprint** from the repository. Render uses `render.yaml` and the included Dockerfile.

Check a deployment at `https://YOUR-SERVICE.onrender.com/api/health`. It should return `build: "2026.08.27-cookie-support"` and report `ytDlp` as a version number.

## Required for YouTube bot checks

YouTube may reject cloud-server traffic with “Sign in to confirm you’re not a bot.” For your own authorized account, export a Netscape-format `cookies.txt`, Base64-encode it locally, and add the resulting value in Render as the secret environment variable `YOUTUBE_COOKIES_B64`—never commit or paste the cookie value into the repository or chat.

Use a separate low-privilege Google account for this purpose and keep the Render service private/rate-limited: a public service sharing your authenticated cookies can abuse that account. Cookies can expire and need replacing. Use only videos you are authorized to process and follow YouTube’s terms and applicable law.
