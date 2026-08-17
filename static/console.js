const mediaRootEl = document.querySelector('#media-root');
const chooseFolderButton = document.querySelector('#choose-folder');
const chooseVisualRootButton = document.querySelector('#choose-visual-root');
const chooseAudioRootButton = document.querySelector('#choose-audio-root');
const visualRootLabel = document.querySelector('#visual-root-label');
const audioRootLabel = document.querySelector('#audio-root-label');
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

function shortPath(path) {
  if (!path) return 'CHANGE ↗';
  const chunks = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return `${chunks.at(-1) || path} ↗`;
}

async function loadConfig() {
  const response = await fetch('/api/config', {cache: 'no-store'});
  const config = await response.json();
  mediaRootEl.textContent = config.media_root;
  mediaRootEl.title = config.media_root;
  visualRootLabel.textContent = shortPath(config.visual_root);
  visualRootLabel.title = config.visual_root;
  audioRootLabel.textContent = shortPath(config.audio_root);
  audioRootLabel.title = config.audio_root;
  if (!config.exists) showStatus('Media Collection not found.', 5000);
  return config;
}

async function getVisualState() {
  const response = await fetch('/api/visual-state', {cache: 'no-store'});
  return response.json();
}

async function patchVisualState(patch) {
  const response = await fetch('/api/visual-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Visual state update failed: ${response.status}`);
  return response.json();
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
        html, body, * { scrollbar-width:none !important; }
        ::-webkit-scrollbar { width:0 !important; height:0 !important; display:none !important; }
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

function bindRange(id, key, {audioMessage = null} = {}) {
  const el = document.querySelector(`#${id}`);
  if (!el) return;
  el.addEventListener('input', async event => {
    const value = Number(event.target.value);
    try {
      await patchVisualState({[key]: value});
    } catch (error) {
      console.error(error);
    }
    if (audioMessage) postToDj(audioMessage, {value});
  });
}

async function selectLibrary(kind, button) {
  button.disabled = true;
  showStatus(`Choose ${kind} folder…`, 120000);
  try {
    const response = await fetch(`/api/select-library-root/${kind}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Folder selection failed');
    if (data.cancelled) {
      showStatus('Folder selection cancelled.');
      return;
    }
    showStatus(`${kind.toUpperCase()} library: ${data.total_files ?? 0} media files.`);
    await loadConfig();
    reloadFrames();
  } catch (error) {
    console.error(error);
    showStatus(`ERROR: ${error.message}`, 6000);
  } finally {
    button.disabled = false;
  }
}

chooseVisualRootButton?.addEventListener('click', () => selectLibrary('visual', chooseVisualRootButton));
chooseAudioRootButton?.addEventListener('click', () => selectLibrary('audio', chooseAudioRootButton));

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

bindRange('video-master-opacity', 'master_opacity');
bindRange('video-master-brightness', 'master_brightness');
bindRange('video-master-contrast', 'master_contrast');
bindRange('video-master-saturation', 'master_saturation');
bindRange('video-master-hue', 'master_hue');
bindRange('video-master-blur', 'master_blur');
bindRange('common-intensity', 'common_intensity', {audioMessage: 'common-intensity'});
bindRange('common-filter', 'common_filter', {audioMessage: 'common-filter'});
bindRange('common-pulse', 'common_pulse', {audioMessage: 'common-pulse'});
bindRange('common-strobe', 'common_strobe');

async function hydrateMasterControls() {
  const state = await getVisualState();
  const mapping = {
    'video-master-opacity': 'master_opacity',
    'video-master-brightness': 'master_brightness',
    'video-master-contrast': 'master_contrast',
    'video-master-saturation': 'master_saturation',
    'video-master-hue': 'master_hue',
    'video-master-blur': 'master_blur',
    'common-intensity': 'common_intensity',
    'common-filter': 'common_filter',
    'common-pulse': 'common_pulse',
    'common-strobe': 'common_strobe',
  };
  for (const [id, key] of Object.entries(mapping)) {
    const el = document.querySelector(`#${id}`);
    if (el && state[key] != null) el.value = state[key];
  }
  setTimeout(() => {
    postToDj('common-intensity', {value: Number(state.common_intensity || 0)});
    postToDj('common-filter', {value: Number(state.common_filter || 0)});
    postToDj('common-pulse', {value: Number(state.common_pulse || 0)});
  }, 500);
}

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
  showStatus('Choose a Media Collection folder. VIDEO and AUDIO subfolders will be created automatically.', 120000);
  try {
    const response = await fetch('/api/select-media-root', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Folder selection failed');
    if (data.cancelled) { showStatus('Folder selection cancelled.'); return; }
    await loadConfig();
    showStatus('Media Collection changed. video/ and audio/ are ready.');
    reloadFrames();
  } catch (error) {
    console.error(error);
    showStatus(`ERROR: ${error.message}`, 6000);
  } finally {
    chooseFolderButton.disabled = false;
    chooseFolderButton.textContent = 'CHOOSE COLLECTION';
  }
});

reloadButton.addEventListener('click', () => {
  reloadFrames();
  loadConfig().catch(console.error);
  hydrateMasterControls().catch(console.error);
  showStatus('Media libraries rescanned.');
});

Promise.all([loadConfig(), hydrateMasterControls()]).catch(error => {
  console.error(error);
  showStatus(`ERROR: ${error.message}`, 6000);
});
