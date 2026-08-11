let library = null;
let audioContext = null;
let analyser = null;
let masterGain = null;
let pendingTrack = null;
let lastBeatAt = 0;
let energyHistory = [];
let lastPost = 0;

const audioEls = {
  a: document.querySelector("#audio-a"),
  b: document.querySelector("#audio-b"),
};

const deckNodes = {};

function fmt(sec) {
  if (!Number.isFinite(sec)) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

async function getJSON(url) {
  const r = await fetch(url, {cache: "no-store"});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function ensureAudioGraph() {
  if (audioContext) {
    if (audioContext.state === "suspended") audioContext.resume();
    return;
  }

  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.78;

  masterGain = audioContext.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(analyser);
  analyser.connect(audioContext.destination);

  for (const deck of ["a", "b"]) {
    const source = audioContext.createMediaElementSource(audioEls[deck]);
    const gain = audioContext.createGain();
    source.connect(gain);
    gain.connect(masterGain);
    deckNodes[deck] = {source, gain};
  }
  applyCrossfader();
}

function applyCrossfader() {
  if (!audioContext) return;
  const x = Number(document.querySelector("#dj-crossfader").value);
  deckNodes.a.gain.gain.value =
    Number(document.querySelector("#dj-volume-a").value) * Math.cos(x * Math.PI / 2);
  deckNodes.b.gain.gain.value =
    Number(document.querySelector("#dj-volume-b").value) * Math.sin(x * Math.PI / 2);
}

function loadTrack(deck, item) {
  ensureAudioGraph();
  const audio = audioEls[deck];
  audio.src = item.url;
  audio.load();
  audio.dataset.path = item.path;
  document.querySelector(`#dj-title-${deck}`).textContent = item.name;
  audio.play().catch(console.error);
  document.querySelector(`#dj-play-${deck}`).textContent = "PAUSE";
}

function renderLibrary() {
  const host = document.querySelector("#audio-folders");
  host.innerHTML = "";
  const folders = library.folders
    .map(folder => ({...folder, items: folder.items.filter(x => x.kind === "audio")}))
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
        pendingTrack = item;
        document.querySelector("#audio-picker").classList.remove("hidden");
      };
      list.append(b);
    }
    section.append(head, list);
    host.append(section);
  }
}

function bindDeck(deck) {
  const audio = audioEls[deck];
  const play = document.querySelector(`#dj-play-${deck}`);
  const seek = document.querySelector(`#seek-${deck}`);
  const speed = document.querySelector(`#dj-speed-${deck}`);

  play.onclick = () => {
    ensureAudioGraph();
    if (!audio.src) return;
    if (audio.paused) audio.play();
    else audio.pause();
  };
  document.querySelector(`#dj-restart-${deck}`).onclick = () => {
    audio.currentTime = 0;
    if (audio.src) audio.play();
  };
  document.querySelector(`#dj-volume-${deck}`).oninput = applyCrossfader;
  speed.oninput = () => audio.playbackRate = Number(speed.value);

  seek.oninput = () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) * audio.duration;
  };

  audio.addEventListener("play", () => play.textContent = "PAUSE");
  audio.addEventListener("pause", () => play.textContent = "PLAY");
  audio.addEventListener("timeupdate", () => {
    const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
    seek.value = ratio || 0;
    document.querySelector(`#dj-time-${deck}`).textContent =
      `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  });
}

function bandAverage(data, fromHz, toHz) {
  const nyquist = audioContext.sampleRate / 2;
  const start = Math.floor((fromHz / nyquist) * data.length);
  const end = Math.min(data.length, Math.ceil((toHz / nyquist) * data.length));
  if (end <= start) return 0;
  let sum = 0;
  for (let i=start; i<end; i++) sum += data[i];
  return (sum / (end - start)) / 255;
}

function analyze() {
  if (!analyser) {
    requestAnimationFrame(analyze);
    return;
  }

  const freq = new Uint8Array(analyser.frequencyBinCount);
  const time = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freq);
  analyser.getByteTimeDomainData(time);

  let rms = 0;
  for (const v of time) {
    const n = (v - 128) / 128;
    rms += n * n;
  }
  const level = Math.min(1, Math.sqrt(rms / time.length) * 2.4);
  const bass = Math.min(1, bandAverage(freq, 35, 180) * 1.35);
  const mid = Math.min(1, bandAverage(freq, 180, 2500) * 1.25);
  const high = Math.min(1, bandAverage(freq, 2500, 12000) * 1.45);

  const now = performance.now();
  energyHistory.push(bass);
  if (energyHistory.length > 30) energyHistory.shift();
  const avg = energyHistory.reduce((a,b)=>a+b,0) / Math.max(1, energyHistory.length);
  const beat = bass > Math.max(.25, avg * 1.38) && (now - lastBeatAt) > 180;
  if (beat) lastBeatAt = now;

  document.querySelector("#master-meter").style.height = `${level * 100}%`;
  document.querySelector("#dj-bass").textContent = bass.toFixed(2);
  document.querySelector("#dj-mid").textContent = mid.toFixed(2);
  document.querySelector("#dj-high").textContent = high.toFixed(2);
  document.querySelector("#dj-beat").textContent = beat ? "●" : "—";

  if (now - lastPost > 80) {
    lastPost = now;
    fetch("/api/audio-state", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        level, bass, mid, high, beat,
        crossfader: Number(document.querySelector("#dj-crossfader").value),
        deck_a: audioEls.a.dataset.path || null,
        deck_b: audioEls.b.dataset.path || null,
      }),
    }).catch(()=>{});
  }
  requestAnimationFrame(analyze);
}

async function init() {
  library = await getJSON("/api/library");
  const tracks = library.folders.flatMap(f => f.items).filter(x => x.kind === "audio");
  document.querySelector("#audio-library-status").textContent = `${tracks.length} tracce`;
  renderLibrary();

  bindDeck("a");
  bindDeck("b");

  document.querySelector("#dj-crossfader").oninput = applyCrossfader;
  document.querySelector("#master-volume").oninput = e => {
    ensureAudioGraph();
    masterGain.gain.value = Number(e.target.value);
  };

  document.querySelectorAll("#audio-picker button").forEach(b => {
    b.onclick = () => {
      const target = b.dataset.target;
      document.querySelector("#audio-picker").classList.add("hidden");
      if (pendingTrack && (target === "a" || target === "b")) loadTrack(target, pendingTrack);
      pendingTrack = null;
    };
  });

  analyze();
}
init().catch(console.error);
