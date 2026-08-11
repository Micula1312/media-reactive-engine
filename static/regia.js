let library = null;
let state = null;
let pendingItem = null;

const visualKinds = new Set(["video", "image", "svg"]);

async function getJSON(url) {
  const r = await fetch(url, {cache: "no-store"});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function patchState(patch) {
  const r = await fetch("/api/visual-state", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(patch),
  });
  state = await r.json();
  syncControls();
}

function deckPatch(deck, patch) {
  return patchState({decks: {[deck]: patch}});
}

function preview(deck, item) {
  const el = document.querySelector(`#preview-${deck}`);
  el.innerHTML = "";
  if (!item) return;
  if (item.kind === "video") {
    const v = document.createElement("video");
    Object.assign(v, {src: item.url, autoplay: true, muted: true, loop: true});
    el.append(v);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    el.append(img);
  }
}

async function loadToDeck(deck, item, folder) {
  await deckPatch(deck, {
    source_folder: folder,
    media: item,
    playing: true,
  });
  preview(deck, item);
  document.querySelector(`#now-${deck}`).textContent = item.path;
  document.querySelector(`#deck-${deck}-folder`).textContent = folder;
}

function renderLibrary() {
  const host = document.querySelector("#folders");
  host.innerHTML = "";
  const folders = library.folders
    .map(folder => ({...folder, items: folder.items.filter(x => visualKinds.has(x.kind))}))
    .filter(folder => folder.items.length);

  for (const folder of folders) {
    const section = document.createElement("section");
    section.className = "folder";
    const head = document.createElement("button");
    head.className = "folder-head";
    head.innerHTML = `<span>${folder.name}</span><span>${folder.items.length}</span>`;
    const list = document.createElement("div");
    list.className = "media-list";
    head.onclick = () => list.classList.toggle("open");

    for (const item of folder.items) {
      const b = document.createElement("button");
      b.className = "media-item";
      b.textContent = item.name;
      b.onclick = () => {
        pendingItem = {item, folder: folder.name};
        document.querySelector("#deck-picker").classList.remove("hidden");
      };
      list.append(b);
    }
    section.append(head, list);
    host.append(section);
  }
}

function allVisualItems() {
  return library.folders.flatMap(folder =>
    folder.items.filter(i => visualKinds.has(i.kind)).map(item => ({item, folder: folder.name}))
  );
}

function bindDeck(deck) {
  for (const [id, key] of [
    [`opacity-${deck}`, "opacity"],
    [`scale-${deck}`, "scale"],
    [`speed-${deck}`, "speed"],
  ]) {
    document.querySelector(`#${id}`).oninput = e => deckPatch(deck, {[key]: Number(e.target.value)});
  }
  document.querySelector(`#play-${deck}`).onclick = () => deckPatch(deck, {playing: !state.decks[deck].playing});
  document.querySelector(`#random-${deck}`).onclick = () => {
    const items = allVisualItems();
    if (!items.length) return;
    const choice = items[Math.floor(Math.random() * items.length)];
    loadToDeck(deck, choice.item, choice.folder);
  };
}

function syncControls() {
  if (!state) return;
  for (const deck of ["a", "b"]) {
    const d = state.decks[deck];
    document.querySelector(`#opacity-${deck}`).value = d.opacity;
    document.querySelector(`#scale-${deck}`).value = d.scale;
    document.querySelector(`#speed-${deck}`).value = d.speed;
    document.querySelector(`#play-${deck}`).textContent = d.playing ? "PAUSE" : "PLAY";
    if (d.media) {
      document.querySelector(`#now-${deck}`).textContent = d.media.path;
      document.querySelector(`#deck-${deck}-folder`).textContent = d.source_folder || "—";
    }
  }
  document.querySelector("#crossfader").value = state.crossfader;
  document.querySelector("#audio-reactive").checked = state.audio_reactive;
  document.querySelector("#reactivity").value = state.reactivity;
  document.querySelector("#blackout").classList.toggle("active", state.blackout);
}

async function updateMeters() {
  try {
    const a = await getJSON("/api/audio-state");
    for (const key of ["level", "bass", "mid", "high"]) {
      document.querySelector(`#meter-${key}`).style.width = `${Math.min(100, (a[key] || 0) * 100)}%`;
    }
  } catch {}
}

async function init() {
  const config = await getJSON("/api/config");
  library = await getJSON("/api/library");
  state = await getJSON("/api/visual-state");

  const count = library.folders.flatMap(f => f.items).filter(x => visualKinds.has(x.kind)).length;
  document.querySelector("#library-status").textContent =
    config.exists ? `${count} visual — ${config.media_root}` : `Cartella non trovata: ${config.media_root}`;

  renderLibrary();
  syncControls();

  for (const deck of ["a", "b"]) {
    bindDeck(deck);
    if (state.decks[deck].media) preview(deck, state.decks[deck].media);
  }

  document.querySelector("#crossfader").oninput = e => patchState({crossfader: Number(e.target.value)});
  document.querySelector("#reactivity").oninput = e => patchState({reactivity: Number(e.target.value)});
  document.querySelector("#audio-reactive").onchange = e => patchState({audio_reactive: e.target.checked});
  document.querySelector("#blackout").onclick = () => patchState({blackout: !state.blackout});

  document.querySelectorAll("#deck-picker button").forEach(button => {
    button.onclick = () => {
      const target = button.dataset.target;
      document.querySelector("#deck-picker").classList.add("hidden");
      if (pendingItem && (target === "a" || target === "b")) {
        loadToDeck(target, pendingItem.item, pendingItem.folder);
      }
      pendingItem = null;
    };
  });

  setInterval(updateMeters, 100);
}
init().catch(console.error);
