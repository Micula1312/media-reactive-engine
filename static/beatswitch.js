let lastVisualBeatCount = null;
const beatSwitchCursor = {a: 0, b: 0};

function beatSwitchConfig(deck) {
  const select = document.querySelector(`#beat-folder-${deck}`);
  const selectedFolder = select?.value || '';
  const deckFolder = state?.decks?.[deck]?.source_folder || '';
  return {
    enabled: document.querySelector(`#beat-switch-${deck}`)?.checked ?? false,
    every: Number(document.querySelector(`#beat-every-${deck}`)?.value || 4),
    mode: document.querySelector(`#beat-mode-${deck}`)?.value || 'random',
    folder: selectedFolder === '__auto__' || !selectedFolder ? deckFolder : selectedFolder,
  };
}

function visualItemsForFolder(folderName) {
  if (!library || !folderName) return [];
  const folder = library.folders.find(f => f.name === folderName);
  if (!folder) return [];
  return folder.items.filter(item => visualKinds.has(item.kind));
}

async function triggerBeatSwitch(deck, beatCount) {
  const cfg = beatSwitchConfig(deck);
  if (!cfg.enabled || !cfg.every || beatCount % cfg.every !== 0) return;

  if (cfg.mode === 'cut') {
    const current = state?.decks?.[deck]?.media;
    if (!current || current.kind !== 'video') return;
    await deckPatch(deck, {
      cut_token: `${beatCount}-${Date.now()}`,
      cut_position: Math.random(),
    });
    return;
  }

  const items = visualItemsForFolder(cfg.folder);
  if (!items.length) return;

  let item;
  if (cfg.mode === 'next') {
    item = items[beatSwitchCursor[deck] % items.length];
    beatSwitchCursor[deck] = (beatSwitchCursor[deck] + 1) % items.length;
  } else {
    const currentPath = state?.decks?.[deck]?.media?.path;
    const candidates = items.length > 1 ? items.filter(x => x.path !== currentPath) : items;
    item = candidates[Math.floor(Math.random() * candidates.length)];
  }

  await loadToDeck(deck, item, cfg.folder);
}

function populateBeatFolders() {
  if (!library) return;
  const folders = library.folders
    .filter(folder => folder.items.some(item => visualKinds.has(item.kind)))
    .map(folder => folder.name);

  for (const deck of ['a', 'b']) {
    const select = document.querySelector(`#beat-folder-${deck}`);
    if (!select) continue;
    select.innerHTML = `<option value="__auto__">AUTO — DECK FOLDER</option>` +
      folders.map(name => `<option value="${name}">${name}</option>`).join('');
    select.value = '__auto__';
  }
}

function syncAutoFolderLabel(deck) {
  const select = document.querySelector(`#beat-folder-${deck}`);
  if (!select || select.value !== '__auto__') return;
  const folder = state?.decks?.[deck]?.source_folder;
  const option = select.querySelector('option[value="__auto__"]');
  if (option) option.textContent = folder ? `AUTO — ${folder}` : 'AUTO — DECK FOLDER';
}

async function pollVisualBeatClock() {
  try {
    const audio = await getJSON('/api/audio-state');
    const count = Number(audio.beat_count || 0);
    syncAutoFolderLabel('a');
    syncAutoFolderLabel('b');

    if (lastVisualBeatCount === null) {
      lastVisualBeatCount = count;
      return;
    }

    if (count !== lastVisualBeatCount) {
      lastVisualBeatCount = count;
      const counter = document.querySelector('#visual-beat-count');
      if (counter) counter.textContent = String(count);
      await Promise.all([triggerBeatSwitch('a', count), triggerBeatSwitch('b', count)]);
    }
  } catch (error) {
    console.warn('Beat switch clock error', error);
  }
}

window.addEventListener('load', () => {
  const waitForLibrary = setInterval(() => {
    if (!library || !state) return;
    clearInterval(waitForLibrary);
    populateBeatFolders();
    setInterval(pollVisualBeatClock, 60);
  }, 50);
});
