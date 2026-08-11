let mediaReactiveBeatCount = 0;
let beatWasOn = false;

function postBeatCount() {
  fetch('/api/audio-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({beat_count: mediaReactiveBeatCount}),
  }).catch(() => {});
}

function watchDetectedBeat() {
  const beatEl = document.querySelector('#dj-beat');
  const isBeat = beatEl && beatEl.textContent.trim() === '●';

  if (isBeat && !beatWasOn) {
    mediaReactiveBeatCount += 1;
    postBeatCount();
  }

  beatWasOn = Boolean(isBeat);
  requestAnimationFrame(watchDetectedBeat);
}

watchDetectedBeat();
