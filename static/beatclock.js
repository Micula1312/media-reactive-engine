let mediaReactiveBeatCount = 0;
let lastBeatStamp = 0;

function postBeatCount() {
  fetch('/api/audio-state', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({beat_count: mediaReactiveBeatCount}),
  }).catch(() => {});
}

function countBeat() {
  const now = performance.now();
  if (now - lastBeatStamp < 140) return;
  lastBeatStamp = now;
  mediaReactiveBeatCount += 1;
  postBeatCount();
}

function initBeatObserver() {
  const beatEl = document.querySelector('#dj-beat');
  if (!beatEl) return setTimeout(initBeatObserver, 50);
  let wasOn = beatEl.textContent.trim() === '●';
  const observer = new MutationObserver(() => {
    const isOn = beatEl.textContent.trim() === '●';
    if (isOn && !wasOn) countBeat();
    wasOn = isOn;
  });
  observer.observe(beatEl, {childList: true, characterData: true, subtree: true});
}

initBeatObserver();
