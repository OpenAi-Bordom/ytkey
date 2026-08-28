const $ = (selector) => document.querySelector(selector);
const urlInput = $('#urlInput');
const urlMessage = $('#urlMessage');
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

$('#reset').addEventListener('click', () => { results.hidden = true; urlInput.value = ''; window.scrollTo({top: 0, behavior: 'smooth'}); });
