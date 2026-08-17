(() => {
  const isDj = document.body.classList.contains("dj-page");
  const isVisual = document.body.classList.contains("regia-page");
  if (!isDj && !isVisual) return;

  let library = null;
  const itemMap = new Map();
  const keyFor = (folder, name) => `${folder}::${name}`;

  async function loadLibrary() {
    const endpoint = isDj ? "/api/library/audio" : "/api/library/visual";
    const response = await fetch(endpoint, {cache: "no-store"});
    library = await response.json();
    itemMap.clear();
    for (const folder of library.folders || []) {
      for (const item of folder.items || []) {
        itemMap.set(keyFor(folder.name, item.name), {folder: folder.name, item});
      }
    }
  }

  function decorateLibraryItems() {
    document.querySelectorAll(".folder").forEach(folderEl => {
      const head = folderEl.querySelector(".folder-head span");
      const folderName = head?.textContent?.trim();
      if (!folderName) return;

      folderEl.querySelectorAll(".media-item").forEach(button => {
        if (button.dataset.dragReady === "1") return;
        const record = itemMap.get(keyFor(folderName, button.textContent.trim()));
        if (!record) return;

        const valid = isDj ? record.item.kind === "audio" : ["video", "image", "svg"].includes(record.item.kind);
        if (!valid) return;

        button.draggable = true;
        button.dataset.dragReady = "1";
        button.style.cursor = "grab";

        button.addEventListener("dragstart", event => {
          const payload = JSON.stringify(record);
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("application/x-media-reactive", payload);
          event.dataTransfer.setData("text/plain", payload);
          button.style.opacity = ".45";
        });

        button.addEventListener("dragend", () => { button.style.opacity = ""; });
      });
    });
  }

  function deckNameFromElement(deckEl) {
    if (isVisual) return deckEl.dataset.deck;
    if (deckEl.classList.contains("deck-a")) return "a";
    if (deckEl.classList.contains("deck-b")) return "b";
    return null;
  }

  function setDropState(deckEl, active) {
    deckEl.style.outline = active ? "2px solid #fff" : "";
    deckEl.style.outlineOffset = active ? "-2px" : "";
    deckEl.style.background = active ? "#151515" : "";
  }

  function bindDeckTargets() {
    const selector = isDj ? ".dj-deck" : ".deck-panel[data-deck]";
    document.querySelectorAll(selector).forEach(deckEl => {
      if (deckEl.dataset.dropReady === "1") return;
      deckEl.dataset.dropReady = "1";

      deckEl.addEventListener("dragenter", event => { event.preventDefault(); setDropState(deckEl, true); });
      deckEl.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropState(deckEl, true); });
      deckEl.addEventListener("dragleave", event => { if (!deckEl.contains(event.relatedTarget)) setDropState(deckEl, false); });
      deckEl.addEventListener("drop", event => {
        event.preventDefault();
        setDropState(deckEl, false);
        const raw = event.dataTransfer.getData("application/x-media-reactive") || event.dataTransfer.getData("text/plain");
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch { return; }
        const deck = deckNameFromElement(deckEl);
        if (!deck || !payload?.item) return;

        if (isDj && payload.item.kind === "audio" && typeof window.loadTrack === "function") {
          window.loadTrack(deck, payload.item);
        }
        if (isVisual && ["video", "image", "svg"].includes(payload.item.kind) && typeof window.loadToDeck === "function") {
          window.loadToDeck(deck, payload.item, payload.folder);
        }
      });
    });
  }

  async function init() {
    try {
      await loadLibrary();
      decorateLibraryItems();
      bindDeckTargets();
      const observer = new MutationObserver(() => { decorateLibraryItems(); bindDeckTargets(); });
      observer.observe(document.body, {childList: true, subtree: true});
    } catch (error) {
      console.error("Drag/drop init failed", error);
    }
  }

  init();
})();
