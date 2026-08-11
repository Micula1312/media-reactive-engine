(() => {
  const hotCues = { a: [null, null, null, null], b: [null, null, null, null] };

  function audio(deck) { return document.querySelector(`#audio-${deck}`); }
  function cueButton(deck) { return document.querySelector(`#dj-cue-${deck}`); }

  function reset(deck) {
    hotCues[deck] = [null, null, null, null];
    document.querySelectorAll(`.hotcue-button[data-deck="${deck}"]`).forEach((b) => {
      b.classList.remove("active");
      b.title = "Click: set / jump. Shift+click: clear";
    });
  }

  function bindClassicCue(deck) {
    const a = audio(deck);
    const btn = cueButton(deck);
    if (!a || !btn) return;
    let cue = null;
    let auditioning = false;

    btn.textContent = "CUE";
    btn.onclick = null;

    btn.addEventListener("click", (e) => {
      if (e.detail === 0) return;
      if (a.paused) {
        if (cue === null) cue = a.currentTime;
        else a.currentTime = cue;
      }
      btn.classList.toggle("active", cue !== null);
    });

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || cue === null) return;
      e.preventDefault();
      a.currentTime = cue;
      auditioning = true;
      a.play().catch(() => {});
    });

    const release = () => {
      if (!auditioning) return;
      auditioning = false;
      a.pause();
      if (cue !== null) a.currentTime = cue;
    };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);

    a.addEventListener("emptied", () => {
      cue = null;
      btn.classList.remove("active");
    });
  }

  function bindHotCues(deck) {
    const a = audio(deck);
    document.querySelectorAll(`.hotcue-button[data-deck="${deck}"]`).forEach((btn) => {
      const index = Number(btn.dataset.hotcue) - 1;
      btn.addEventListener("click", (e) => {
        if (!a.src) return;
        if (e.shiftKey) {
          hotCues[deck][index] = null;
          btn.classList.remove("active");
          return;
        }
        const stored = hotCues[deck][index];
        if (stored === null) {
          hotCues[deck][index] = a.currentTime;
          btn.classList.add("active");
          btn.title = `Hot cue ${index + 1}: ${a.currentTime.toFixed(2)}s`;
        } else {
          a.currentTime = stored;
          a.play().catch(() => {});
        }
      });
    });
    a.addEventListener("emptied", () => reset(deck));
  }

  for (const deck of ["a", "b"]) {
    bindClassicCue(deck);
    bindHotCues(deck);
  }
})();
