const layers = {
  a: {
    host: document.querySelector("#layer-a"),
    video: document.querySelector("#layer-a video"),
    image: document.querySelector("#layer-a img"),
    last: null,
  },
  b: {
    host: document.querySelector("#layer-b"),
    video: document.querySelector("#layer-b video"),
    image: document.querySelector("#layer-b img"),
    last: null,
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
}

function applyDeck(name, deck, opacity, audio, visual) {
  const layer = layers[name];
  loadLayer(layer, deck.media);

  const target = deck.media?.kind === "video" ? layer.video : layer.image;
  const reactive = visual.audio_reactive ? visual.reactivity : 0;
  const bassScale = 1 + (audio.bass || 0) * reactive * 0.12;
  const highBrightness = 1 + (audio.high || 0) * reactive * 0.45;

  layer.host.style.opacity = opacity * deck.opacity;
  target.style.transform = `scale(${deck.scale * bassScale})`;
  target.style.filter = `brightness(${highBrightness})`;

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
    beatFlash.style.opacity = visual.audio_reactive && audio.beat
      ? Math.min(.35, visual.reactivity * .35)
      : 0;
  } catch (e) {
    console.error(e);
  }
}
setInterval(tick, 70);
tick();
