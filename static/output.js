const layers = {
  a: {
    host: document.querySelector("#layer-a"),
    video: document.querySelector("#layer-a video"),
    image: document.querySelector("#layer-a img"),
    last: null,
    lastCutToken: null,
  },
  b: {
    host: document.querySelector("#layer-b"),
    video: document.querySelector("#layer-b video"),
    image: document.querySelector("#layer-b img"),
    last: null,
    lastCutToken: null,
  },
};

const blackout = document.querySelector("#blackout-layer");
const beatFlash = document.querySelector("#beat-flash");

async function json(url) {
  const r = await fetch(url, {cache: "no-store"});
  return r.json();
}

function loadLayer(layer, media) {
  if (!media) {
    layer.video.style.display = "none";
    layer.image.style.display = "none";
    layer.last = null;
    return;
  }
  if (layer.last === media.path) return;

  if (media.kind === "video") {
    layer.image.style.display = "none";
    layer.video.style.display = "block";
    layer.video.src = media.url;
    layer.video.load();
    layer.video.play().catch(() => {});
  } else {
    layer.video.style.display = "none";
    layer.image.style.display = "block";
    layer.image.src = media.url;
  }
  layer.last = media.path;
  layer.lastCutToken = null;
}

function applyRandomCut(layer, deck) {
  if (deck.media?.kind !== "video") return;
  if (!deck.cut_token || deck.cut_token === layer.lastCutToken) return;
  if (!Number.isFinite(layer.video.duration) || layer.video.duration <= 0) return;

  const ratio = Math.max(0, Math.min(0.98, Number(deck.cut_position ?? Math.random())));
  layer.video.currentTime = ratio * layer.video.duration;
  layer.lastCutToken = deck.cut_token;
}

function buildMasterFilter(visual, audio) {
  const intensity = Number(visual.common_intensity || 0);
  const sharedFilter = Number(visual.common_filter || 0);
  const brightness = Number(visual.master_brightness ?? 1) * (1 + intensity * 0.18);
  const contrast = Number(visual.master_contrast ?? 1) * (1 + intensity * 0.35);
  const saturationBase = Number(visual.master_saturation ?? 1);
  const saturation = saturationBase * (sharedFilter < 0 ? 1 - Math.abs(sharedFilter) * 0.8 : 1 + sharedFilter * 1.2);
  const hue = Number(visual.master_hue || 0) + Math.max(0, sharedFilter) * 80;
  const blur = Number(visual.master_blur || 0) + Math.max(0, -sharedFilter) * 2.5;
  const reactiveBrightness = visual.audio_reactive ? (audio.high || 0) * visual.reactivity * 0.45 : 0;

  return `brightness(${Math.max(0, brightness + reactiveBrightness)}) contrast(${Math.max(0, contrast)}) saturate(${Math.max(0, saturation)}) hue-rotate(${hue}deg) blur(${Math.max(0, blur)}px)`;
}

function applyDeck(name, deck, opacity, audio, visual) {
  const layer = layers[name];
  loadLayer(layer, deck.media);
  applyRandomCut(layer, deck);

  const target = deck.media?.kind === "video" ? layer.video : layer.image;
  if (!target) return;

  const reactive = visual.audio_reactive ? visual.reactivity : 0;
  const commonPulse = Number(visual.common_pulse || 0);
  const beatPulse = audio.beat ? commonPulse * 0.09 : 0;
  const bassScale = 1 + (audio.bass || 0) * reactive * 0.12 + beatPulse;

  layer.host.style.opacity = opacity * deck.opacity * Number(visual.master_opacity ?? 1);
  target.style.transform = `scale(${deck.scale * bassScale})`;
  target.style.filter = buildMasterFilter(visual, audio);

  if (deck.media?.kind === "video") {
    layer.video.playbackRate = deck.speed;
    if (deck.playing && layer.video.paused) layer.video.play().catch(() => {});
    if (!deck.playing && !layer.video.paused) layer.video.pause();
  }
}

async function tick() {
  try {
    const [visual, audio] = await Promise.all([
      json("/api/visual-state"),
      json("/api/audio-state"),
    ]);

    const x = Math.max(0, Math.min(1, visual.crossfader));
    const opacityA = Math.cos(x * Math.PI / 2);
    const opacityB = Math.sin(x * Math.PI / 2);

    applyDeck("a", visual.decks.a, opacityA, audio, visual);
    applyDeck("b", visual.decks.b, opacityB, audio, visual);

    blackout.classList.toggle("on", visual.blackout);

    const reactiveFlash = visual.audio_reactive && audio.beat
      ? Math.min(.35, visual.reactivity * .35)
      : 0;
    const macroStrobe = audio.beat ? Number(visual.common_strobe || 0) * .85 : 0;
    beatFlash.style.opacity = Math.max(reactiveFlash, macroStrobe);
  } catch (e) {
    console.error(e);
  }
}
setInterval(tick, 70);
tick();
