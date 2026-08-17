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

  function post(type, payload = {}) {
    window.parent.postMessage({source: 'media-reactive-dj', type, ...payload}, '*');
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

  function setMicGain(value) {
    if (micGain) micGain.gain.value = Number(value);
  }

  function setMonitor(enabled) {
    if (micMonitorGain) micMonitorGain.gain.value = enabled ? 1 : 0;
    post('mic-monitor-status', {enabled});
  }

  function setMasterVolume(value) {
    ensureAudioGraph();
    masterGain.gain.value = Number(value);
    const slider = document.querySelector('#master-volume');
    if (slider) slider.value = Number(value);
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

  function stopRecording() {
    if (recorder?.state === 'recording') recorder.stop();
  }

  window.addEventListener('message', async event => {
    const data = event.data;
    if (!data || data.source !== 'media-reactive-console') return;
    try {
      switch (data.type) {
        case 'mic-enable': data.enabled ? await enableMic() : disableMic(); break;
        case 'mic-gain': setMicGain(data.value); break;
        case 'mic-monitor': setMonitor(Boolean(data.enabled)); break;
        case 'master-volume': setMasterVolume(data.value); break;
        case 'record-start': startRecording(); break;
        case 'record-stop': stopRecording(); break;
      }
    } catch (error) {
      console.error(error);
      post('audio-master-error', {message: error.message || String(error)});
    }
  });
})();
