let lastVisualBeatCount = null;
const beatSwitchCursor = {a: 0, b: 0};

function beatSwitchConfig(deck) {
  const select = document.querySelector(`#beat-folder-${deck}`);
  const selectedFolder = select?.value || '__auto__';
  const deckFolder = state?.decks?.[deck]?.source_folder || '';
  return {
    enabled: document.querySelector(`#beat-switch-${deck}`)?.checked ?? false,
    every: Math.max(1, Number(document.querySelector(`#beat-every-${deck}`)?.value || 4)),
    mode: document.querySelector(`#beat-mode-${deck}`)?.value || 'random',
    folder: selectedFolder === '__auto__' ? deckFolder : selectedFolder,
  };
}

function visualItemsForFolder(folderName) {
  if (!library || !folderName) return [];
  const folder = library.folders.find(f => f.name === folderName);
  return folder ? folder.items.filter(item => visualKinds.has(item.kind)) : [];
}

async function triggerBeatSwitch(deck, beatCount) {
  const cfg = beatSwitchConfig(deck);
  if (!cfg.enabled || !cfg.folder || beatCount <= 0 || beatCount % cfg.every !== 0) return;

  if (cfg.mode === 'cut') {
    const current = state?.decks?.[deck]?.media;
    if (!current || current.kind !== 'video') return;
    await deckPatch(deck, {cut_token: `${beatCount}-${Date.now()}`, cut_position: Math.random()});
    return;
  }

  const items = visualItemsForFolder(cfg.folder);
  if (!items.length) return;
  let item;
  if (cfg.mode === 'next') {
    const currentPath = state?.decks?.[deck]?.media?.path;
    let index = items.findIndex(x => x.path === currentPath);
    index = index < 0 ? beatSwitchCursor[deck] : index + 1;
    item = items[index % items.length];
    beatSwitchCursor[deck] = (index + 1) % items.length;
  } else {
    const currentPath = state?.decks?.[deck]?.media?.path;
    const candidates = items.length > 1 ? items.filter(x => x.path !== currentPath) : items;
    item = candidates[Math.floor(Math.random() * candidates.length)];
  }
  if (item) await loadToDeck(deck, item, cfg.folder);
}

function populateBeatFolders() {
  if (!library) return;
  const folders = library.folders.filter(folder => folder.items.some(item => visualKinds.has(item.kind))).map(folder => folder.name);
  for (const deck of ['a', 'b']) {
    const select = document.querySelector(`#beat-folder-${deck}`);
    if (!select) continue;
    const previous = select.value || '__auto__';
    select.innerHTML = `<option value="__auto__">AUTO — DECK FOLDER</option>` + folders.map(name => `<option value="${name}">${name}</option>`).join('');
    select.value = folders.includes(previous) ? previous : '__auto__';
    syncAutoFolderLabel(deck);
  }
}

function syncAutoFolderLabel(deck) {
  const select = document.querySelector(`#beat-folder-${deck}`);
  if (!select) return;
  const option = select.querySelector('option[value="__auto__"]');
  const folder = state?.decks?.[deck]?.source_folder;
  if (option) option.textContent = folder ? `AUTO — ${folder}` : 'AUTO — DECK FOLDER';
}

async function pollVisualBeatClock() {
  try {
    const audio = await getJSON('/api/audio-state');
    const count = Number(audio.beat_count || 0);
    syncAutoFolderLabel('a'); syncAutoFolderLabel('b');
    if (lastVisualBeatCount === null) { lastVisualBeatCount = count; return; }
    if (count > lastVisualBeatCount) {
      for (let beat = lastVisualBeatCount + 1; beat <= count; beat++) {
        await Promise.all([triggerBeatSwitch('a', beat), triggerBeatSwitch('b', beat)]);
      }
      lastVisualBeatCount = count;
    } else if (count < lastVisualBeatCount) {
      lastVisualBeatCount = count;
    }
  } catch (error) { console.warn('Beat switch clock error', error); }
}

window.addEventListener('load', () => {
  const waitForLibrary = setInterval(() => {
    if (!library || !state) return;
    clearInterval(waitForLibrary);
    populateBeatFolders();
    setInterval(pollVisualBeatClock, 80);
  }, 50);
});
