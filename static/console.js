const mediaRootEl = document.querySelector('#media-root');
const chooseFolderButton = document.querySelector('#choose-folder');
const reloadButton = document.querySelector('#reload-all');
const statusEl = document.querySelector('#folder-status');
const djFrame = document.querySelector('#dj-frame');
const vjFrame = document.querySelector('#vj-frame');

const frames = [
  document.querySelector('#output-frame'),
  djFrame,
  vjFrame,
  document.querySelector('#dj-library-frame'),
  document.querySelector('#vj-library-frame'),
].filter(Boolean);

function showStatus(message, timeout = 2600) {
  statusEl.textContent = message;
  statusEl.classList.remove('hidden');
  window.clearTimeout(showStatus.timer);
  showStatus.timer = window.setTimeout(() => statusEl.classList.add('hidden'), timeout);
}

async function loadConfig() {
  const response = await fetch('/api/config', {cache: 'no-store'});
  const config = await response.json();
  mediaRootEl.textContent = config.media_root;
  mediaRootEl.title = config.media_root;
  if (!config.exists) showStatus('Media folder not found — choose another folder.', 5000);
  return config;
}

function frameBase(frame) {
  if (frame.id === 'output-frame') return '/output';
  if (frame.id.startsWith('dj')) return '/dj';
  return '/regia';
}

function reloadFrames() {
  const stamp = Date.now();
  for (const frame of frames) frame.src = `${frameBase(frame)}?embedded=1&t=${stamp}`;
}

function prepareEmbeddedFrame(frame) {
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const style = doc.createElement('style');
      const isLibrary = frame.id.endsWith('library-frame');
      const isDj = frame.id.startsWith('dj');
      const isVj = frame.id.startsWith('vj');

      let css = `
        .topbar { display:none !important; }
        body { min-height:100vh !important; overflow:auto !important; }
        .visual-console, .dj-console { min-height:100vh !important; }
      `;

      if (isLibrary && isDj) {
        css += `.dj-console{display:block!important}.dj-console>.library-panel{display:block!important;width:220px!important;max-height:none!important;border:0!important}.dj-console>.dj-mixer{display:none!important}`;
      } else if (isLibrary && isVj) {
        css += `.visual-console{display:block!important}.visual-console>.library-panel{display:block!important;width:220px!important;max-height:none!important;border:0!important}.visual-console>.visual-mixer{display:none!important}`;
      } else if (!isLibrary && isDj) {
        css += `
          .dj-console{display:block!important}.dj-console>.library-panel{display:none!important}.dj-console>.dj-mixer{display:flex!important;flex-direction:column!important;width:100%!important;padding:12px!important;gap:10px!important}
          .dj-crossfader-wrap{order:-2!important;position:sticky!important;top:0!important;z-index:20!important;background:#080808!important;margin:0!important;padding:10px 12px!important;border:1px solid #333!important}
          .dj-decks{order:0!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:10px!important}
          .dj-master{display:none!important}.dj-hint{display:none!important}
        `;
      } else if (!isLibrary && isVj) {
        css += `
          .visual-console{display:block!important}.visual-console>.library-panel{display:none!important}.visual-console>.visual-mixer{display:flex!important;flex-direction:column!important;width:100%!important}
          .master-strip{order:-2!important;position:sticky!important;top:0!important;z-index:20!important;background:#080808!important;border-bottom:1px solid #333!important}
          .decks-grid{order:0!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
          .output-preview-panel{order:1!important;margin-top:0!important}
        `;
      }

      style.textContent = css;
      doc.head.appendChild(style);
    } catch (error) {
      console.warn('Could not prepare embedded frame', error);
    }
  });
}

for (const frame of frames) prepareEmbeddedFrame(frame);

function postToDj(type, payload = {}) {
  if (!djFrame?.contentWindow) return;
  djFrame.contentWindow.postMessage({source: 'media-reactive-console', type, ...payload}, '*');
}

const masterVolume = document.querySelector('#console-master-volume');
const micToggle = document.querySelector('#mic-toggle');
const micGain = document.querySelector('#mic-gain');
const micMonitor = document.querySelector('#mic-monitor');
const recordToggle = document.querySelector('#record-toggle');
const recordStatus = document.querySelector('#record-status');
let micEnabled = false;
let recording = false;

masterVolume?.addEventListener('input', e => postToDj('master-volume', {value: Number(e.target.value)}));
micGain?.addEventListener('input', e => postToDj('mic-gain', {value: Number(e.target.value)}));
micMonitor?.addEventListener('change', e => postToDj('mic-monitor', {enabled: e.target.checked}));
micToggle?.addEventListener('click', () => {
  micEnabled = !micEnabled;
  postToDj('mic-enable', {enabled: micEnabled});
  micToggle.textContent = micEnabled ? 'MIC ON' : 'MIC OFF';
  micToggle.classList.toggle('active', micEnabled);
});
recordToggle?.addEventListener('click', () => {
  recording = !recording;
  postToDj(recording ? 'record-start' : 'record-stop');
});

window.addEventListener('message', event => {
  const data = event.data;
  if (!data || data.source !== 'media-reactive-dj') return;
  if (data.type === 'mic-status') {
    micEnabled = Boolean(data.enabled);
    micToggle.textContent = micEnabled ? 'MIC ON' : 'MIC OFF';
    micToggle.classList.toggle('active', micEnabled);
  }
  if (data.type === 'record-status') {
    recording = Boolean(data.recording);
    recordToggle.textContent = recording ? 'STOP REC' : 'REC';
    recordToggle.classList.toggle('active', recording);
    recordStatus.textContent = recording ? 'RECORDING…' : 'READY';
  }
  if (data.type === 'audio-master-error') showStatus(`AUDIO ERROR: ${data.message}`, 6000);
});

chooseFolderButton.addEventListener('click', async () => {
  chooseFolderButton.disabled = true;
  chooseFolderButton.textContent = 'SELECTING…';
  showStatus('Choose any media folder on this computer…', 120000);
  try {
    const response = await fetch('/api/select-media-root', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Folder selection failed');
    if (data.cancelled) { showStatus('Folder selection cancelled.'); return; }
    mediaRootEl.textContent = data.media_root;
    mediaRootEl.title = data.media_root;
    showStatus(`Loaded ${data.total_files ?? 0} media files from ${data.folders ?? 0} folders.`);
    reloadFrames();
  } catch (error) {
    console.error(error);
    showStatus(`ERROR: ${error.message}`, 6000);
  } finally {
    chooseFolderButton.disabled = false;
    chooseFolderButton.textContent = 'CHOOSE FOLDER';
  }
});

reloadButton.addEventListener('click', () => {
  reloadFrames();
  loadConfig().catch(console.error);
  showStatus('Media library rescanned.');
});

loadConfig().catch(error => {
  console.error(error);
  showStatus(`ERROR: ${error.message}`, 6000);
});
