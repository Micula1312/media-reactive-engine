const mediaRootEl = document.querySelector('#media-root');
const chooseFolderButton = document.querySelector('#choose-folder');
const reloadButton = document.querySelector('#reload-all');
const statusEl = document.querySelector('#folder-status');
const grid = document.querySelector('#console-grid');
const frames = [
  document.querySelector('#output-frame'),
  document.querySelector('#dj-frame'),
  document.querySelector('#vj-frame'),
];

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

function reloadFrames() {
  const stamp = Date.now();
  for (const frame of frames) {
    const base = frame.id === 'output-frame' ? '/output' : frame.id === 'dj-frame' ? '/dj' : '/regia';
    frame.src = `${base}?embedded=1&t=${stamp}`;
  }
}

function prepareEmbeddedFrame(frame) {
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const style = doc.createElement('style');
      style.textContent = `
        .topbar { display:none !important; }
        .visual-console, .dj-console { min-height:100vh !important; }
        .library-panel { max-height:100vh !important; }
        body { min-height:100vh; }
      `;
      doc.head.appendChild(style);
    } catch (error) {
      console.warn('Could not prepare embedded frame', error);
    }
  });
}

for (const frame of frames) prepareEmbeddedFrame(frame);

chooseFolderButton.addEventListener('click', async () => {
  chooseFolderButton.disabled = true;
  chooseFolderButton.textContent = 'SELECTING…';
  showStatus('Choose any media folder on this computer…', 120000);

  try {
    const response = await fetch('/api/select-media-root', {
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

    mediaRootEl.textContent = data.media_root;
    mediaRootEl.title = data.media_root;
    showStatus(`Loaded ${data.total_files ?? 0} media files from ${data.folders ?? 0} folders.`);
    reloadFrames();
  } catch (error) {
    console.error(error);
    showStatus(`ERROR: ${error.message}`, 6000);
  } finally {
    chooseFolderButton.disabled = false;
    chooseFolderButton.textContent = 'CHOOSE MEDIA FOLDER';
  }
});

reloadButton.addEventListener('click', () => {
  reloadFrames();
  loadConfig().catch(console.error);
  showStatus('Media library rescanned.');
});

document.querySelectorAll('[data-layout]').forEach(button => {
  button.addEventListener('click', () => {
    const layout = button.dataset.layout;
    grid.className = `console-grid layout-${layout}`;
    document.querySelectorAll('[data-layout]').forEach(b => b.classList.toggle('active', b === button));
  });
});

loadConfig().catch(error => {
  console.error(error);
  showStatus(`ERROR: ${error.message}`, 6000);
});
