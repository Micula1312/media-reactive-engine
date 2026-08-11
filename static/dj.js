let library = null;
let audioContext = null;
let analyser = null;
let masterGain = null;
let pendingTrack = null;
let lastBeatAt = 0;
let energyHistory = [];
let lastPost = 0;

const baseBpm = {a: null, b: null};
const bpmAnalysisToken = {a: 0, b: 0};
const cuePoints = {a: null, b: null};
const loopState = {
  a: {active: false, beats: 0, start: 0, end: 0},
  b: {active: false, beats: 0, start: 0, end: 0},
};

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
    const low = audioContext.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 20000;
    low.Q.value = 0.7;

    const high = audioContext.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 20;
    high.Q.value = 0.7;

    const gain = audioContext.createGain();

    source.connect(low);
    low.connect(high);
    high.connect(gain);
    gain.connect(masterGain);

    deckNodes[deck] = {source, low, high, gain};
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

function applyFilter(deck) {
  ensureAudioGraph();
  const value = Number(document.querySelector(`#dj-filter-${deck}`).value);
  const {low, high} = deckNodes[deck];

  if (value < 0) {
    const t = Math.abs(value);
    low.frequency.value = 20000 * Math.pow(120 / 20000, t);
    high.frequency.value = 20;
  } else if (value > 0) {
    const t = value;
    high.frequency.value = 20 * Math.pow(6000 / 20, t);
    low.frequency.value = 20000;
  } else {
    low.frequency.value = 20000;
    high.frequency.value = 20;
  }
}

function currentBpm(deck) {
  const bpm = baseBpm[deck];
  if (!bpm) return null;
  return bpm * Number(document.querySelector(`#dj-speed-${deck}`).value || 1);
}

function updatePitchDisplay(deck) {
  const speed = Number(document.querySelector(`#dj-speed-${deck}`).value || 1);
  const pct = (speed - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  document.querySelector(`#dj-pitch-${deck}`).textContent = `${sign}${pct.toFixed(1)}%`;
}

function updateBpmDisplay(deck) {
  const el = document.querySelector(`#dj-bpm-${deck}`);
  const bpm = currentBpm(deck);
  if (!bpm) {
    if (!el.dataset.status) el.textContent = "—";
    updatePitchDisplay(deck);
    return;
  }
  el.dataset.status = "ready";
  el.textContent = bpm.toFixed(1);
  updatePitchDisplay(deck);
}

function normalizeBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return bpm;
}

function estimateBpmFromBuffer(buffer) {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const step = 1024;
  const envelope = [];

  for (let start = 0; start < length; start += step) {
    const end = Math.min(length, start + step);
    let sum = 0;
    let count = 0;
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = start; i < end; i += 4) {
        sum += Math.abs(data[i]);
        count++;
      }
    }
    envelope.push(count ? sum / count : 0);
  }

  if (envelope.length < 20) return null;

  const smooth = envelope.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(envelope.length - 1, i + 2); k++) {
      s += envelope[k];
      n++;
    }
    return s / n;
  });

  const mean = smooth.reduce((a, b) => a + b, 0) / smooth.length;
  const variance = smooth.reduce((a, b) => a + (b - mean) ** 2, 0) / smooth.length;
  const threshold = mean + Math.sqrt(variance) * 0.75;

  const peaks = [];
  const minPeakDistanceFrames = Math.max(1, Math.floor((60 / 190) * sampleRate / step));
  let lastPeak = -minPeakDistanceFrames;

  for (let i = 1; i < smooth.length - 1; i++) {
    if (
      smooth[i] > threshold &&
      smooth[i] >= smooth[i - 1] &&
      smooth[i] > smooth[i + 1] &&
      i - lastPeak >= minPeakDistanceFrames
    ) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 4) return null;

  const histogram = new Map();
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < Math.min(peaks.length, i + 9); j++) {
      const intervalFrames = peaks[j] - peaks[i];
      const seconds = (intervalFrames * step) / sampleRate;
      if (!seconds) continue;
      let bpm = normalizeBpm((60 / seconds) * (j - i));
      if (!bpm || bpm < 70 || bpm > 180) continue;
      const bucket = Math.round(bpm * 2) / 2;
      histogram.set(bucket, (histogram.get(bucket) || 0) + 1);
    }
  }

  if (!histogram.size) return null;
  const ranked = [...histogram.entries()].sort((a, b) => b[1] - a[1]);
  const winner = ranked[0][0];
  const nearby = ranked.filter(([bpm]) => Math.abs(bpm - winner) <= 2).slice(0, 5);
  const weight = nearby.reduce((sum, [, count]) => sum + count, 0);
  const weighted = nearby.reduce((sum, [bpm, count]) => sum + bpm * count, 0) / weight;
  return normalizeBpm(weighted);
}

function drawWaveform(deck, buffer) {
  const canvas = document.querySelector(`#waveform-${deck}`);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  const data = buffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(data.length / width));
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(data.length, start + samplesPerPixel);
    let min = 1;
    let max = -1;
    const stride = Math.max(1, Math.floor(samplesPerPixel / 20));
    for (let i = start; i < end; i += stride) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = (1 - max) * height / 2;
    const y2 = (1 - min) * height / 2;
    ctx.moveTo(x + 0.5, y1);
    ctx.lineTo(x + 0.5, y2);
  }
  ctx.stroke();
}

async function analyzeTrack(deck, item) {
  const token = ++bpmAnalysisToken[deck];
  const el = document.querySelector(`#dj-bpm-${deck}`);
  baseBpm[deck] = null;
  el.dataset.status = "analyzing";
  el.textContent = "…";

  try {
    const response = await fetch(item.url, {cache: "force-cache"});
    if (!response.ok) throw new Error(`Track fetch failed: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const decodeContext = new AudioContext();
    const decoded = await decodeContext.decodeAudioData(bytes.slice(0));
    if (token !== bpmAnalysisToken[deck]) {
      await decodeContext.close();
      return;
    }

    drawWaveform(deck, decoded);
    const bpm = estimateBpmFromBuffer(decoded);
    baseBpm[deck] = bpm;
    el.dataset.status = bpm ? "ready" : "failed";
    el.textContent = bpm ? bpm.toFixed(1) : "?";
    updateBpmDisplay(deck);
    await decodeContext.close();
  } catch (error) {
    console.warn("Track analysis failed", error);
    if (token !== bpmAnalysisToken[deck]) return;
    baseBpm[deck] = null;
    el.dataset.status = "failed";
    el.textContent = "?";
  }
}

function resetDeckRuntime(deck) {
  cuePoints[deck] = null;
  loopState[deck] = {active: false, beats: 0, start: 0, end: 0};
  document.querySelector(`#dj-cue-${deck}`).textContent = "SET CUE";
  document.querySelectorAll(`.loop-strip button[data-deck="${deck}"]`).forEach(b => b.classList.remove("active"));
  document.querySelector(`#loop-off-${deck}`).classList.remove("active");
  document.querySelector(`#waveform-playhead-${deck}`).style.left = "0%";
}

function loadTrack(deck, item) {
  ensureAudioGraph();
  resetDeckRuntime(deck);
  const audio = audioEls[deck];
  audio.src = item.url;
  audio.load();
  audio.dataset.path = item.path;
  document.querySelector(`#dj-title-${deck}`).textContent = item.name;
  analyzeTrack(deck, item);
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

function setLoop(deck, beats) {
  const bpm = currentBpm(deck);
  const audio = audioEls[deck];
  if (!bpm || !audio.src) return;

  const duration = (60 / bpm) * beats;
  const start = audio.currentTime;
  loopState[deck] = {active: true, beats, start, end: start + duration};

  document.querySelectorAll(`.loop-strip button[data-deck="${deck}"]`).forEach(b => {
    b.classList.toggle("active", Number(b.dataset.beats) === Number(beats));
  });
  document.querySelector(`#loop-off-${deck}`).classList.remove("active");
}

function disableLoop(deck) {
  loopState[deck].active = false;
  document.querySelectorAll(`.loop-strip button[data-deck="${deck}"]`).forEach(b => b.classList.remove("active"));
  document.querySelector(`#loop-off-${deck}`).classList.add("active");
}

function syncDeck(deck, targetDeck) {
  const ownBaseBpm = baseBpm[deck];
  const targetBpm = currentBpm(targetDeck);
  if (!ownBaseBpm || !targetBpm) return;

  const speed = Math.max(0.5, Math.min(1.5, targetBpm / ownBaseBpm));
  const speedEl = document.querySelector(`#dj-speed-${deck}`);
  speedEl.value = speed;
  audioEls[deck].playbackRate = speed;
  updateBpmDisplay(deck);
  speedEl.classList.add("synced");
  setTimeout(() => speedEl.classList.remove("synced"), 450);
}

function bindWaveform(deck) {
  const canvas = document.querySelector(`#waveform-${deck}`);
  canvas.addEventListener("click", e => {
    const audio = audioEls[deck];
    if (!Number.isFinite(audio.duration)) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  });
}

function bindDeck(deck) {
  const other = deck === "a" ? "b" : "a";
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

  document.querySelector(`#dj-cue-${deck}`).onclick = () => {
    if (!audio.src) return;
    cuePoints[deck] = audio.currentTime;
    document.querySelector(`#dj-cue-${deck}`).textContent = `CUE ${fmt(cuePoints[deck])}`;
  };

  document.querySelector(`#dj-cue-go-${deck}`).onclick = () => {
    if (cuePoints[deck] == null) return;
    audio.currentTime = cuePoints[deck];
  };

  document.querySelector(`#dj-sync-${deck}`).onclick = () => syncDeck(deck, other);
  document.querySelector(`#dj-volume-${deck}`).oninput = applyCrossfader;
  document.querySelector(`#dj-filter-${deck}`).oninput = () => applyFilter(deck);

  speed.oninput = () => {
    audio.playbackRate = Number(speed.value);
    updateBpmDisplay(deck);
  };

  seek.oninput = () => {
    if (Number.isFinite(audio.duration)) audio.currentTime = Number(seek.value) * audio.duration;
  };

  document.querySelectorAll(`.loop-strip button[data-deck="${deck}"]`).forEach(button => {
    button.onclick = () => setLoop(deck, Number(button.dataset.beats));
  });
  document.querySelector(`#loop-off-${deck}`).onclick = () => disableLoop(deck);

  audio.addEventListener("play", () => play.textContent = "PAUSE");
  audio.addEventListener("pause", () => play.textContent = "PLAY");
  audio.addEventListener("timeupdate", () => {
    const loop = loopState[deck];
    if (loop.active && audio.currentTime >= loop.end) audio.currentTime = loop.start;

    const ratio = audio.duration ? audio.currentTime / audio.duration : 0;
    seek.value = ratio || 0;
    document.querySelector(`#waveform-playhead-${deck}`).style.left = `${(ratio || 0) * 100}%`;
    document.querySelector(`#dj-time-${deck}`).textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
  });

  bindWaveform(deck);
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
  document.querySelector("#dj-level").textContent = level.toFixed(2);
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

  updatePitchDisplay("a");
  updatePitchDisplay("b");
  analyze();
}
init().catch(console.error);
