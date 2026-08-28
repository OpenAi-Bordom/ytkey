const $ = (selector) => document.querySelector(selector);
const urlInput = $('#urlInput');
const urlMessage = $('#urlMessage');
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const progressPanel = $('#progressPanel');
const progressBar = $('#progressBar');
const progressLabel = $('#progressLabel');
const progressPercent = $('#progressPercent');
const results = $('#results');

function youtubeId(value) {
  try {
    const url = new URL(value.trim());
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1).split('/')[0];
    if (url.hostname.includes('youtube.com')) return url.searchParams.get('v') || url.pathname.match(/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
  } catch (_) {}
  return null;
}

function message(text, isError = false) {
  urlMessage.textContent = text;
  urlMessage.classList.toggle('error', isError);
}

$('#analyzeUrl').addEventListener('click', async () => {
  const id = youtubeId(urlInput.value);
  if (!id) return message('That does not look like a YouTube URL.', true);
  message('Fetching audio securely on the server…');
  $('#analyzeUrl').disabled = true;
  try {
    const response = await fetch('/api/analyze', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({url: urlInput.value.trim()})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Analysis failed');
    $('#trackName').textContent = `YouTube track · ${id}`; $('#bpmValue').textContent = data.bpm; $('#keyValue').textContent = data.key; $('#scaleValue').textContent = `${data.mode} · estimated`; $('#confidence').textContent = `Estimated from ${data.seconds} seconds of audio · audio was processed temporarily and was not sent to your browser.`;
    results.hidden = false; results.scrollIntoView({behavior:'smooth', block:'nearest'}); message('Done. The audio was analyzed server-side.');
  } catch (error) { message(error.message, true); }
  finally { $('#analyzeUrl').disabled = false; }
});

['dragenter','dragover'].forEach(type => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
dropzone.addEventListener('drop', (event) => { const file = event.dataTransfer.files[0]; if (file) analyzeFile(file); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) analyzeFile(fileInput.files[0]); });
$('#reset').addEventListener('click', () => { results.hidden = true; fileInput.value = ''; urlInput.value = ''; window.scrollTo({top: 0, behavior: 'smooth'}); });

function setProgress(percent, label) { progressBar.style.width = `${percent}%`; progressPercent.textContent = `${Math.round(percent)}%`; progressLabel.textContent = label; }

async function analyzeFile(file) {
  if (!file.type.startsWith('audio/') && !/\.(webm|wav|mp3|m4a|ogg|flac)$/i.test(file.name)) return message('Please choose an audio file.', true);
  progressPanel.hidden = false; results.hidden = true; setProgress(8, 'Reading your track…');
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    setProgress(36, 'Finding the pulse…');
    const bpm = estimateBpm(buffer);
    setProgress(72, 'Listening for the key…');
    const key = estimateKey(buffer);
    setProgress(100, 'Done');
    await new Promise(resolve => setTimeout(resolve, 220));
    $('#trackName').textContent = file.name.replace(/\.[^/.]+$/, '');
    $('#bpmValue').textContent = bpm;
    $('#keyValue').textContent = key.name;
    $('#scaleValue').textContent = `${key.mode} · estimated`;
    $('#confidence').textContent = `Estimated from ${Math.min(60, Math.floor(buffer.duration))} seconds of audio · results can vary with intros, vocals, and live recordings.`;
    results.hidden = false; progressPanel.hidden = true;
    results.scrollIntoView({behavior:'smooth', block:'nearest'});
    context.close();
  } catch (error) {
    progressPanel.hidden = true;
    message('This file could not be decoded by your browser. Try WAV, MP3, or M4A.', true);
  }
}

function monoSamples(buffer, seconds = 60) {
  const length = Math.min(buffer.length, Math.floor(buffer.sampleRate * seconds));
  const data = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] += source[i] / buffer.numberOfChannels;
  }
  return data;
}

function estimateBpm(buffer) {
  const data = monoSamples(buffer); const rate = buffer.sampleRate; const hop = Math.max(1, Math.floor(rate / 100));
  const envelope = []; let previous = 0;
  for (let i = 0; i + hop < data.length; i += hop) { let energy = 0; for (let j = 0; j < hop; j += 8) energy += Math.abs(data[i+j] || 0); const value = Math.max(0, energy - previous * .92); envelope.push(value); previous = energy; }
  const minLag = Math.floor(60 * 100 / 180), maxLag = Math.floor(60 * 100 / 60); let bestLag = minLag, best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) { let score = 0; for (let i = lag; i < envelope.length; i++) score += envelope[i] * envelope[i-lag]; if (score > best) { best = score; bestLag = lag; } }
  let bpm = Math.round(6000 / bestLag); while (bpm < 70) bpm *= 2; while (bpm > 160) bpm /= 2; return Math.round(bpm);
}

function estimateKey(buffer) {
  const data = monoSamples(buffer, 45); const rate = buffer.sampleRate; const size = 4096; const chroma = new Array(12).fill(0); const step = Math.max(size, Math.floor(rate * .45));
  for (let start = 0, frames = 0; start + size < data.length && frames < 90; start += step, frames++) {
    for (let bin = 3; bin < size / 2; bin++) { let real = 0, imag = 0; const frequency = bin * rate / size; if (frequency < 65 || frequency > 2100) continue; for (let n = 0; n < size; n += 8) { const sample = data[start+n] || 0; const angle = 2 * Math.PI * bin * n / size; real += sample * Math.cos(angle); imag -= sample * Math.sin(angle); } const power = real*real + imag*imag; const midi = Math.round(69 + 12 * Math.log2(frequency / 440)); chroma[(midi % 12 + 12) % 12] += power; }
  }
  const names = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B']; const major = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]; const minor = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17]; let best = {score:-Infinity,name:'C',mode:'major'};
  for (let root = 0; root < 12; root++) for (const [mode, profile] of [['major',major],['minor',minor]]) { let score=0; for(let i=0;i<12;i++) score += chroma[(i+root)%12] * profile[i]; if(score > best.score) best={score,name:names[root],mode}; }
  return best;
}
