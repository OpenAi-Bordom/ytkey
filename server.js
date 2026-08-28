const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const MAX_BODY = 16 * 1024;

function youtubeId(value) {
  try {
    const url = new URL(value.trim());
    if (url.hostname === 'youtu.be' || url.hostname.endsWith('.youtu.be')) return url.pathname.slice(1).split('/')[0];
    if (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) return url.searchParams.get('v') || url.pathname.match(/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
  } catch (_) {}
  return null;
}

function json(res, status, body) {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(body));
}

function runAnalysis(id) {
  return new Promise((resolve, reject) => {
    // Audio is streamed through two short-lived processes and held only in RAM.
    const downloader = spawn('yt-dlp', ['--no-playlist', '--no-warnings', '-f', 'bestaudio/best', '-o', '-', `https://www.youtube.com/watch?v=${id}`], {stdio: ['ignore', 'pipe', 'pipe']});
    const decoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-t', '60', '-vn', '-ac', '1', '-ar', '22050', '-f', 'f32le', 'pipe:1'], {stdio: ['pipe', 'pipe', 'pipe']});
    let chunks = [], total = 0, errors = '';
    downloader.stdout.pipe(decoder.stdin);
    decoder.stdin.on('error', () => {});
    decoder.stdout.on('data', chunk => { total += chunk.length; if (total <= 8 * 1024 * 1024) chunks.push(chunk); });
    downloader.stderr.on('data', chunk => { errors += chunk.toString(); });
    decoder.stderr.on('data', chunk => { errors += chunk.toString(); });
    const fail = (error) => { downloader.kill('SIGKILL'); decoder.kill('SIGKILL'); reject(error); };
    downloader.on('error', fail); decoder.on('error', fail);
    decoder.on('close', code => {
      if (code !== 0 || !chunks.length) return reject(new Error(errors.trim() || 'Could not decode audio'));
      resolve(analyzePCM(Buffer.concat(chunks, Math.min(total, 8 * 1024 * 1024)), 22050));
    });
    downloader.on('close', code => { if (code !== 0) decoder.stdin.destroy(); });
  });
}

function samplesFromPCM(buffer) { const out = new Float32Array(Math.floor(buffer.length / 4)); for (let i = 0; i < out.length; i++) out[i] = buffer.readFloatLE(i * 4); return out; }
function estimateBpm(data, rate) {
  const hop = Math.max(1, Math.floor(rate / 100)), envelope = []; let previous = 0;
  for (let i = 0; i + hop < data.length; i += hop) { let energy = 0; for (let j = 0; j < hop; j += 8) energy += Math.abs(data[i+j] || 0); const value = Math.max(0, energy - previous * .92); envelope.push(value); previous = energy; }
  const minLag = 34, maxLag = 100, scores = []; for (let lag = minLag; lag <= maxLag; lag++) { let score = 0; for (let i = lag; i < envelope.length; i++) score += envelope[i] * envelope[i-lag]; scores.push(score); }
  let bestLag = minLag; scores.forEach((score, i) => { if (score > scores[bestLag-minLag]) bestLag = i + minLag; }); let bpm = Math.round(6000 / bestLag); while (bpm < 70) bpm *= 2; while (bpm > 160) bpm /= 2; return Math.round(bpm);
}
function estimateKey(data, rate) {
  const size = 4096, chroma = new Array(12).fill(0), step = Math.floor(rate * .45);
  for (let start = 0, frames = 0; start + size < data.length && frames < 90; start += step, frames++) for (let bin = 3; bin < size / 2; bin++) { const frequency = bin * rate / size; if (frequency < 65 || frequency > 2100) continue; let real = 0, imag = 0; for (let n = 0; n < size; n += 8) { const angle = 2 * Math.PI * bin * n / size, sample = data[start+n] || 0; real += sample * Math.cos(angle); imag -= sample * Math.sin(angle); } const midi = Math.round(69 + 12 * Math.log2(frequency / 440)); chroma[(midi % 12 + 12) % 12] += real*real + imag*imag; }
  const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'], major = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], minor = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]; let best = {score:-Infinity,name:'C',mode:'major'};
  for (let root = 0; root < 12; root++) for (const [mode, profile] of [['major',major],['minor',minor]]) { let score=0; for(let i=0;i<12;i++) score += chroma[(i+root)%12] * profile[i]; if(score > best.score) best={score,name:names[root],mode}; } return best;
}
function analyzePCM(buffer, rate) { const data = samplesFromPCM(buffer), key = estimateKey(data, rate); return {bpm: estimateBpm(data, rate), key: key.name, mode: key.mode, seconds: Math.min(60, Math.floor(data.length / rate))}; }

function serveFile(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(ROOT, requested));
  if ((file !== ROOT && !file.startsWith(ROOT + path.sep)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, {error:'Not found'});
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'};
  res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'}); if (req.method === 'HEAD') return res.end(); fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') {
    let body = ''; req.on('data', chunk => { body += chunk; if (body.length > MAX_BODY) req.destroy(); });
    req.on('end', async () => { try { const id = youtubeId(JSON.parse(body).url || ''); if (!id) return json(res, 400, {error:'Please provide a valid YouTube URL.'}); const result = await runAnalysis(id); return json(res, 200, result); } catch (error) { return json(res, 502, {error:'Could not read that video’s audio. It may be private, age-restricted, unavailable, or blocked by yt-dlp.'}); } }); return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res);
  json(res, 405, {error:'Method not allowed'});
});
server.listen(PORT, () => console.log(`ytkey running at http://localhost:${PORT}`));
