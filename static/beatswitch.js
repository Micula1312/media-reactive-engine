let lastVisualBeatCount = null;
const beatSwitchCursor = {a: 0, b: 0};

function beatSwitchConfig(deck) {
  return {
    enabled: document.querySelector(`#beat-switch-${deck}`)?.checked ?? false,
    every: Number(document.querySelector(`#beat-every-${deck}`)?.value || 4),
    mode: document.querySelector(`#beat-mode-${deck}`)?.value || 'random',
    folder: document.querySelector(`#beat-folder-${deck}`)?.value || '',
  };
}

function visualItemsForFolder(folderName) {
  if (!library) return [];
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
    beatSwitchCursor[deck] = (beatSwitchCursor[deck] + 1) % items.length;
    item = items[beatSwitchCursor[deck]];
  } else {
    item = items[Math.floor(Math.random() * items.length)];
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
    select.innerHTML = folders.map(name => `<option value="${name}">${name}</option>`).join('');

    const currentFolder = state?.decks?.[deck]?.source_folder;
    if (currentFolder && folders.includes(currentFolder)) select.value = currentFolder;
  }
}

async function pollVisualBeatClock() {
  try {
    const audio = await getJSON('/api/audio-state');
    const count = Number(audio.beat_count || 0);

    if (lastVisualBeatCount === null) {
      lastVisualBeatCount = count;
      return;
    }

    if (count !== lastVisualBeatCount) {
      lastVisualBeatCount = count;
      document.querySelector('#visual-beat-count').textContent = String(count);
      await Promise.all([
        triggerBeatSwitch('a', count),
        triggerBeatSwitch('b', count),
      ]);
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
