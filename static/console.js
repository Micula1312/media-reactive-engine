const mediaRootEl = document.querySelector('#media-root');
const chooseFolderButton = document.querySelector('#choose-folder');
const reloadButton = document.querySelector('#reload-all');
const statusEl = document.querySelector('#folder-status');

const frames = [
  document.querySelector('#output-frame'),
  document.querySelector('#dj-frame'),
  document.querySelector('#vj-frame'),
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
        css += `
          .dj-console { display:block !important; }
          .dj-console > .library-panel { display:block !important; width:220px !important; max-height:none !important; border:0 !important; }
          .dj-console > .dj-mixer { display:none !important; }
        `;
      } else if (isLibrary && isVj) {
        css += `
          .visual-console { display:block !important; }
          .visual-console > .library-panel { display:block !important; width:220px !important; max-height:none !important; border:0 !important; }
          .visual-console > .visual-mixer { display:none !important; }
        `;
      } else if (!isLibrary && isDj) {
        css += `
          .dj-console { display:block !important; }
          .dj-console > .library-panel { display:none !important; }
          .dj-console > .dj-mixer { display:block !important; width:100% !important; padding:12px !important; }
          .dj-decks { grid-template-columns:minmax(0,1fr) 150px minmax(0,1fr) !important; gap:10px !important; }
        `;
      } else if (!isLibrary && isVj) {
        css += `
          .visual-console { display:block !important; }
          .visual-console > .library-panel { display:none !important; }
          .visual-console > .visual-mixer { display:block !important; width:100% !important; }
          .decks-grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important; }
          .live-output-panel { display:none !important; }
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
