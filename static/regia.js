let library = null;
let state = null;

const foldersEl = document.querySelector("#folders");
const statusEl = document.querySelector("#library-status");
const previewEl = document.querySelector("#preview");
const nowPlayingEl = document.querySelector("#now-playing");

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function patchState(patch) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(patch),
  });
  state = await response.json();
  syncControls();
  return state;
}

function renderPreview(item) {
  previewEl.innerHTML = "";

  if (item.kind === "video") {
    const video = document.createElement("video");
    video.src = item.url;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.controls = false;
    previewEl.append(video);
  } else {
    const img = document.createElement("img");
    img.src = item.url;
    previewEl.append(img);
  }
}

async function selectMedia(folder, item) {
  await patchState({
    source_folder: folder,
    media: item,
    playing: true,
    blackout: false,
  });

  renderPreview(item);
  nowPlayingEl.textContent = item.path;
}

function renderLibrary() {
  foldersEl.innerHTML = "";

  for (const folder of library.folders) {
    const section = document.createElement("section");
    section.className = "folder";

    const button = document.createElement("button");
    button.className = "folder-head";
    button.innerHTML = `<span>${folder.name}</span><span>${folder.count}</span>`;

    const list = document.createElement("div");
    list.className = "media-list";

    button.addEventListener("click", () => {
      list.classList.toggle("open");
    });

    for (const item of folder.items) {
      const mediaButton = document.createElement("button");
      mediaButton.className = "media-item";
      mediaButton.textContent = item.name;
      mediaButton.addEventListener("click", () => selectMedia(folder.name, item));
      list.append(mediaButton);
    }

    section.append(button, list);
    foldersEl.append(section);
  }
}

function bindSlider(id, key) {
  const el = document.querySelector(`#${id}`);
  el.addEventListener("input", () => patchState({[key]: Number(el.value)}));
}

function allItems() {
  return library.folders.flatMap(folder =>
    folder.items.map(item => ({folder: folder.name, item}))
  );
}

function syncControls() {
  if (!state) return;
  document.querySelector("#opacity").value = state.opacity;
  document.querySelector("#scale").value = state.scale;
  document.querySelector("#speed").value = state.speed;
  document.querySelector("#reactivity").value = state.reactivity;
  document.querySelector("#play-toggle").textContent = state.playing ? "PAUSE" : "PLAY";
  document.querySelector("#blackout").classList.toggle("active", state.blackout);

  if (state.media) {
    nowPlayingEl.textContent = state.media.path;
  }
}

async function init() {
  const config = await getJSON("/api/config");
  library = await getJSON("/api/library");
  state = await getJSON("/api/state");

  statusEl.textContent = config.exists
    ? `${library.total_files} media — ${config.media_root}`
    : `Cartella non trovata: ${config.media_root}`;

  renderLibrary();
  syncControls();

  if (state.media) renderPreview(state.media);

  bindSlider("opacity", "opacity");
  bindSlider("scale", "scale");
  bindSlider("speed", "speed");
  bindSlider("reactivity", "reactivity");

  document.querySelector("#play-toggle").addEventListener("click", () => {
    patchState({playing: !state.playing});
  });

  document.querySelector("#blackout").addEventListener("click", () => {
    patchState({blackout: !state.blackout});
  });

  document.querySelector("#random").addEventListener("click", () => {
    const items = allItems();
    if (!items.length) return;
    const choice = items[Math.floor(Math.random() * items.length)];
    selectMedia(choice.folder, choice.item);
  });
}

init().catch(error => {
  console.error(error);
  statusEl.textContent = `ERRORE: ${error.message}`;
});
