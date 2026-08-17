from pathlib import Path
import json
import os
import subprocess

from flask import Flask, jsonify, render_template, request, send_file
from media_library import scan_media_library, resolve_media_path

app = Flask(__name__)

APP_NAME = "Media Reactive Engine"
if os.name == "nt":
    APP_DATA_ROOT = Path(os.environ.get("LOCALAPPDATA", Path.home())) / APP_NAME
else:
    APP_DATA_ROOT = Path.home() / ".media-reactive-engine"

CONFIG_FILE = APP_DATA_ROOT / "config.json"
DEFAULT_COLLECTION_ROOT = Path.home() / "Documents" / APP_NAME / "Media Collection"
DEFAULT_VISUAL_ROOT = DEFAULT_COLLECTION_ROOT / "video"
DEFAULT_AUDIO_ROOT = DEFAULT_COLLECTION_ROOT / "audio"


def ensure_app_folders():
    APP_DATA_ROOT.mkdir(parents=True, exist_ok=True)
    DEFAULT_VISUAL_ROOT.mkdir(parents=True, exist_ok=True)
    DEFAULT_AUDIO_ROOT.mkdir(parents=True, exist_ok=True)


def load_config():
    ensure_app_folders()
    data = {}
    try:
        if CONFIG_FILE.exists():
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        data = {}

    collection = Path(data.get("collection_root") or DEFAULT_COLLECTION_ROOT).expanduser().resolve()
    visual = Path(data.get("visual_root") or (collection / "video")).expanduser().resolve()
    audio = Path(data.get("audio_root") or (collection / "audio")).expanduser().resolve()

    collection.mkdir(parents=True, exist_ok=True)
    visual.mkdir(parents=True, exist_ok=True)
    audio.mkdir(parents=True, exist_ok=True)
    return collection, visual, audio


def save_config():
    APP_DATA_ROOT.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(
        json.dumps({
            "collection_root": str(MEDIA_ROOT),
            "visual_root": str(VISUAL_ROOT),
            "audio_root": str(AUDIO_ROOT),
        }, indent=2),
        encoding="utf-8",
    )


def choose_folder(initial_dir: Path | None = None, title: str = "Choose Media Folder"):
    initial = str(initial_dir or Path.home())

    if os.name == "nt":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            f"$d.Description = {json.dumps(title)}; "
            f"$d.SelectedPath = {json.dumps(initial)}; "
            "$d.ShowNewFolderButton = $true; "
            "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) "
            "{ [Console]::Write($d.SelectedPath) }"
        )
        try:
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-STA", "-Command", script],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            selected = result.stdout.strip()
            return Path(selected).expanduser().resolve() if selected else None
        except (OSError, subprocess.SubprocessError):
            return None

    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(initialdir=initial, title=title)
        root.destroy()
        return Path(selected).expanduser().resolve() if selected else None
    except Exception:
        return None


MEDIA_ROOT, VISUAL_ROOT, AUDIO_ROOT = load_config()


def empty_deck():
    return {
        "source_folder": None,
        "media": None,
        "playing": True,
        "opacity": 1.0,
        "scale": 1.0,
        "speed": 1.0,
        "cut_token": None,
        "cut_position": None,
    }


VISUAL_STATE = {
    "decks": {"a": empty_deck(), "b": empty_deck()},
    "crossfader": 0.0,
    "blackout": False,
    "audio_reactive": True,
    "reactivity": 0.55,
    "master_opacity": 1.0,
    "master_brightness": 1.0,
    "master_contrast": 1.0,
    "master_saturation": 1.0,
    "master_hue": 0.0,
    "master_blur": 0.0,
    "common_intensity": 0.0,
    "common_filter": 0.0,
    "common_pulse": 0.0,
    "common_strobe": 0.0,
}

AUDIO_STATE = {
    "level": 0.0,
    "bass": 0.0,
    "mid": 0.0,
    "high": 0.0,
    "beat": False,
    "beat_count": 0,
    "crossfader": 0.0,
    "deck_a": None,
    "deck_b": None,
}


def merge_visual_state(payload):
    top_level_keys = (
        "crossfader", "blackout", "audio_reactive", "reactivity",
        "master_opacity", "master_brightness", "master_contrast",
        "master_saturation", "master_hue", "master_blur",
        "common_intensity", "common_filter", "common_pulse", "common_strobe",
    )
    for key in top_level_keys:
        if key in payload:
            VISUAL_STATE[key] = payload[key]

    decks = payload.get("decks")
    if isinstance(decks, dict):
        for deck_name in ("a", "b"):
            patch = decks.get(deck_name)
            if isinstance(patch, dict):
                for key in empty_deck():
                    if key in patch:
                        VISUAL_STATE["decks"][deck_name][key] = patch[key]


@app.get("/")
@app.get("/console")
def console():
    return render_template("console.html")


@app.get("/regia")
def regia():
    return render_template("regia.html")


@app.get("/output")
def output():
    return render_template("output.html")


@app.get("/dj")
def dj():
    return render_template("dj.html")


@app.get("/api/library")
def library():
    # Backwards-compatible endpoint used by the DJ view.
    return jsonify(scan_media_library(AUDIO_ROOT, source="audio"))


@app.get("/api/library/visual")
def visual_library():
    return jsonify(scan_media_library(VISUAL_ROOT, source="visual"))


@app.get("/api/library/audio")
def audio_library():
    return jsonify(scan_media_library(AUDIO_ROOT, source="audio"))


@app.get("/api/config")
def config():
    return jsonify({
        "media_root": str(MEDIA_ROOT),
        "visual_root": str(VISUAL_ROOT),
        "audio_root": str(AUDIO_ROOT),
        "app_data_root": str(APP_DATA_ROOT),
        "exists": MEDIA_ROOT.exists(),
        "saved": CONFIG_FILE.exists(),
    })


@app.post("/api/select-media-root")
def select_media_root():
    global MEDIA_ROOT, VISUAL_ROOT, AUDIO_ROOT

    selected = choose_folder(MEDIA_ROOT, "Choose Media Collection Folder")
    if not selected:
        return jsonify({"cancelled": True, "media_root": str(MEDIA_ROOT)})

    MEDIA_ROOT = selected
    VISUAL_ROOT = MEDIA_ROOT / "video"
    AUDIO_ROOT = MEDIA_ROOT / "audio"
    VISUAL_ROOT.mkdir(parents=True, exist_ok=True)
    AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    save_config()

    return jsonify({
        "cancelled": False,
        "media_root": str(MEDIA_ROOT),
        "visual_root": str(VISUAL_ROOT),
        "audio_root": str(AUDIO_ROOT),
    })


@app.post("/api/select-library-root/<kind>")
def select_library_root(kind):
    global VISUAL_ROOT, AUDIO_ROOT
    if kind not in {"visual", "audio"}:
        return jsonify({"error": "Unknown library type"}), 400

    current = VISUAL_ROOT if kind == "visual" else AUDIO_ROOT
    selected = choose_folder(current, f"Choose {kind.title()} Library Folder")
    if not selected:
        return jsonify({"cancelled": True, "kind": kind, "path": str(current)})

    if kind == "visual":
        VISUAL_ROOT = selected
    else:
        AUDIO_ROOT = selected
    save_config()

    scanned = scan_media_library(selected, source=kind)
    return jsonify({
        "cancelled": False,
        "kind": kind,
        "path": str(selected),
        "total_files": scanned.get("total_files", 0),
        "folders": len(scanned.get("folders", [])),
    })


@app.get("/api/state")
@app.get("/api/visual-state")
def get_visual_state():
    return jsonify(VISUAL_STATE)


@app.post("/api/state")
@app.post("/api/visual-state")
def update_visual_state():
    payload = request.get_json(silent=True) or {}
    merge_visual_state(payload)
    return jsonify(VISUAL_STATE)


@app.get("/api/audio-state")
def get_audio_state():
    return jsonify(AUDIO_STATE)


@app.post("/api/audio-state")
def update_audio_state():
    payload = request.get_json(silent=True) or {}
    for key in AUDIO_STATE:
        if key in payload:
            AUDIO_STATE[key] = payload[key]
    return jsonify(AUDIO_STATE)


@app.get("/media")
def media_file():
    relative_path = request.args.get("path", "")
    source = request.args.get("source")
    root = AUDIO_ROOT if source == "audio" else VISUAL_ROOT if source == "visual" else MEDIA_ROOT
    target = resolve_media_path(root, relative_path)
    if not target or not target.is_file():
        return jsonify({"error": "Media not found"}), 404
    return send_file(target, conditional=True)


if __name__ == "__main__":
    print(f"MEDIA COLLECTION: {MEDIA_ROOT}")
    print(f"VISUAL LIBRARY:   {VISUAL_ROOT}")
    print(f"AUDIO LIBRARY:    {AUDIO_ROOT}")
    print("CONSOLE: http://127.0.0.1:5000/console")
    print("REGIA:   http://127.0.0.1:5000/regia")
    print("OUTPUT:  http://127.0.0.1:5000/output")
    print("DJ:      http://127.0.0.1:5000/dj")
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True,
        use_debugger=False,
        use_reloader=True,
    )
