(() => {
  let micStream = null;
  let micSource = null;
  let micGain = null;
  let micMonitorGain = null;
  let micRecordGain = null;
  let recordBus = null;
  let recordDest = null;
  let recorder = null;
  let chunks = [];

  let masterVolumeBase = 1;
  let globalMaster = 1;
  let commonIntensity = 0;
  let commonFilter = 0;
  let commonPulse = 0;
  let lastPulseAt = 0;

  function post(type, payload = {}) {
    window.parent.postMessage({source: 'media-reactive-dj', type, ...payload}, '*');
  }

  function effectiveMasterGain() {
    return masterVolumeBase * globalMaster * (1 + commonIntensity * 0.18);
  }

  function applyMasterGain(immediate = true) {
    ensureAudioGraph();
    const value = effectiveMasterGain();
    if (immediate) masterGain.gain.value = value;
    else masterGain.gain.setTargetAtTime(value, audioContext.currentTime, 0.035);
  }

  function applyCommonFilter(value) {
    ensureAudioGraph();
    commonFilter = Math.max(-1, Math.min(1, Number(value) || 0));
    for (const deck of ['a', 'b']) {
      const nodes = deckNodes[deck];
      if (!nodes) continue;
      if (commonFilter < 0) {
        const t = Math.abs(commonFilter);
        nodes.low.frequency.setTargetAtTime(20000 * Math.pow(180 / 20000, t), audioContext.currentTime, 0.025);
        nodes.high.frequency.setTargetAtTime(20, audioContext.currentTime, 0.025);
      } else if (commonFilter > 0) {
        const t = commonFilter;
        nodes.high.frequency.setTargetAtTime(20 * Math.pow(5200 / 20, t), audioContext.currentTime, 0.025);
        nodes.low.frequency.setTargetAtTime(20000, audioContext.currentTime, 0.025);
      } else {
        nodes.low.frequency.setTargetAtTime(20000, audioContext.currentTime, 0.025);
        nodes.high.frequency.setTargetAtTime(20, audioContext.currentTime, 0.025);
      }
    }
  }

  function ensureRecordBus() {
    ensureAudioGraph();
    if (recordBus) return;
    recordBus = audioContext.createGain();
    recordDest = audioContext.createMediaStreamDestination();
    recordBus.connect(recordDest);
    masterGain.connect(recordBus);
  }

  async function enableMic() {
    ensureRecordBus();
    if (micStream) return;
    micStream = await navigator.mediaDevices.getUserMedia({audio: true});
    micSource = audioContext.createMediaStreamSource(micStream);
    micGain = audioContext.createGain();
    micMonitorGain = audioContext.createGain();
    micRecordGain = audioContext.createGain();
    micGain.gain.value = 1;
    micMonitorGain.gain.value = 0;
    micRecordGain.gain.value = 1;
    micSource.connect(micGain);
    micGain.connect(micMonitorGain);
    micGain.connect(micRecordGain);
    micMonitorGain.connect(analyser);
    micRecordGain.connect(recordBus);
    post('mic-status', {enabled: true});
  }

  function disableMic() {
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    for (const node of [micSource, micGain, micMonitorGain, micRecordGain]) {
      try { node?.disconnect(); } catch {}
    }
    micStream = micSource = micGain = micMonitorGain = micRecordGain = null;
    post('mic-status', {enabled: false});
  }

  function setMicGain(value) { if (micGain) micGain.gain.value = Number(value); }
  function setMonitor(enabled) {
    if (micMonitorGain) micMonitorGain.gain.value = enabled ? 1 : 0;
    post('mic-monitor-status', {enabled});
  }
  function setMasterVolume(value) {
    masterVolumeBase = Number(value);
    applyMasterGain();
    const slider = document.querySelector('#master-volume');
    if (slider) slider.value = Number(value);
  }
  function setGlobalMaster(value) {
    globalMaster = Math.max(0, Math.min(1, Number(value) || 0));
    applyMasterGain(false);
  }
  function setCommonIntensity(value) {
    commonIntensity = Math.max(0, Math.min(1, Number(value) || 0));
    applyMasterGain(false);
  }
  function setCommonPulse(value) { commonPulse = Math.max(0, Math.min(1, Number(value) || 0)); }
  function setCrossfader(value) {
    const slider = document.querySelector('#dj-crossfader');
    if (!slider) return;
    slider.value = Math.max(0, Math.min(1, Number(value)));
    if (typeof applyCrossfader === 'function') applyCrossfader();
    post('audio-crossfader', {value: Number(slider.value)});
  }

  function startRecording() {
    ensureRecordBus();
    if (recorder?.state === 'recording') return;
    chunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    recorder = new MediaRecorder(recordDest.stream, {mimeType});
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, {type: recorder.mimeType});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `media-reactive-mix-${stamp}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      post('record-status', {recording: false});
    };
    recorder.start(250);
    post('record-status', {recording: true});
  }
  function stopRecording() { if (recorder?.state === 'recording') recorder.stop(); }

  setInterval(() => {
    if (!audioContext || commonPulse <= 0) return;
    const beatOn = document.querySelector('#dj-beat')?.textContent === '●';
    const now = performance.now();
    if (!beatOn || now - lastPulseAt < 160) return;
    lastPulseAt = now;
    const base = effectiveMasterGain();
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);
    masterGain.gain.setValueAtTime(Math.max(.001, base * (1 + commonPulse * .22)), audioContext.currentTime);
    masterGain.gain.exponentialRampToValueAtTime(Math.max(.001, base), audioContext.currentTime + .11);
  }, 30);

  window.addEventListener('message', async event => {
    const data = event.data;
    if (!data || data.source !== 'media-reactive-console') return;
    try {
      switch (data.type) {
        case 'mic-enable': data.enabled ? await enableMic() : disableMic(); break;
        case 'mic-gain': setMicGain(data.value); break;
        case 'mic-monitor': setMonitor(Boolean(data.enabled)); break;
        case 'master-volume': setMasterVolume(data.value); break;
        case 'global-master': setGlobalMaster(data.value); break;
        case 'crossfader': setCrossfader(data.value); break;
        case 'common-intensity': setCommonIntensity(data.value); break;
        case 'common-filter': applyCommonFilter(data.value); break;
        case 'common-pulse': setCommonPulse(data.value); break;
        case 'record-start': startRecording(); break;
        case 'record-stop': stopRecording(); break;
      }
    } catch (error) {
      console.error(error);
      post('audio-master-error', {message: error.message || String(error)});
    }
  });
})();
