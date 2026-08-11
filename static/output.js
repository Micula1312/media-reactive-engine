const video = document.querySelector("#video-layer");
const image = document.querySelector("#image-layer");
const blackout = document.querySelector("#blackout-layer");

let lastMediaPath = null;

async function readState() {
  const response = await fetch("/api/state", {cache: "no-store"});
  return response.json();
}

function showMedia(media) {
  if (!media) {
    video.style.display = "none";
    image.style.display = "none";
    return;
  }

  if (media.kind === "video") {
    image.style.display = "none";
    video.style.display = "block";

    if (lastMediaPath !== media.path) {
      video.src = media.url;
      video.load();
      video.play().catch(() => {});
    }
  } else {
    video.style.display = "none";
    image.style.display = "block";

    if (lastMediaPath !== media.path) {
      image.src = media.url;
    }
  }

  lastMediaPath = media.path;
}

function applyState(state) {
  showMedia(state.media);

  const layer = state.media?.kind === "video" ? video : image;

  layer.style.opacity = state.opacity;
  layer.style.transform = `scale(${state.scale})`;

  if (state.media?.kind === "video") {
    video.playbackRate = state.speed;

    if (state.playing && video.paused) {
      video.play().catch(() => {});
    } else if (!state.playing && !video.paused) {
      video.pause();
    }
  }

  blackout.classList.toggle("on", state.blackout);
}

async function tick() {
  try {
    const state = await readState();
    applyState(state);
  } catch (error) {
    console.error(error);
  }
}

setInterval(tick, 100);
tick();
