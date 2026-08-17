from pathlib import Path
import json
import os
import subprocess

from flask import Flask, jsonify, render_template, request, send_file
from media_library import scan_media_library, resolve_media_path

app = Flask(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent
CONFIG_FILE = PROJECT_ROOT / ".media-reactive-config.json"
DEFAULT_MEDIA_ROOT = Path.home() / "Desktop" / "media-collection" / "mediateca"


def load_saved_media_root():
    env_root = os.environ.get("MEDIA_REACTIVE_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()

    try:
        if CONFIG_FILE.exists():
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            saved = data.get("media_root")
            if saved:
                return Path(saved).expanduser().resolve()
    except (OSError, json.JSONDecodeError, TypeError):
        pass

    return DEFAULT_MEDIA_ROOT.expanduser().resolve()


def save_media_root(path: Path):
    CONFIG_FILE.write_text(
        json.dumps({"media_root": str(path)}, indent=2),
        encoding="utf-8",
    )


def choose_folder(initial_dir: Path | None = None):
    """Open the native folder picker on the computer running Flask."""
    initial = str(initial_dir or Path.home())

    if os.name == "nt":
        # Native Windows folder picker in a separate STA PowerShell process.
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$d.Description = 'Choose Media Collection Folder'; "
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
            if selected:
                return Path(selected).expanduser().resolve()
            return None
        except (OSError, subprocess.SubprocessError):
            return None

    # Fallback for macOS/Linux Python installations with Tk available.
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        selected = filedialog.askdirectory(initialdir=initial)
        root.destroy()
        return Path(selected).expanduser().resolve() if selected else None
    except Exception:
        return None


MEDIA_ROOT = load_saved_media_root()


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
    "decks": {
        "a": empty_deck(),
        "b": empty_deck(),
    },
    "crossfader": 0.0,
    "blackout": False,
    "audio_reactive": True,
    "reactivity": 0.55,
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
    for key in ("crossfader", "blackout", "audio_reactive", "reactivity"):
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
    return jsonify(scan_media_library(MEDIA_ROOT))


@app.get("/api/config")
def config():
    return jsonify({
        "media_root": str(MEDIA_ROOT),
        "exists": MEDIA_ROOT.exists(),
        "saved": CONFIG_FILE.exists(),
    })


@app.post("/api/select-media-root")
def select_media_root():
    global MEDIA_ROOT

    selected = choose_folder(MEDIA_ROOT if MEDIA_ROOT.exists() else Path.home())
    if not selected:
        return jsonify({"cancelled": True, "media_root": str(MEDIA_ROOT)})

    if not selected.exists() or not selected.is_dir():
        return jsonify({"error": "Selected path is not a folder"}), 400

    MEDIA_ROOT = selected
    try:
        save_media_root(MEDIA_ROOT)
    except OSError as error:
        return jsonify({"error": f"Folder selected but could not save config: {error}"}), 500

    scanned = scan_media_library(MEDIA_ROOT)
    return jsonify({
        "cancelled": False,
        "media_root": str(MEDIA_ROOT),
        "exists": True,
        "total_files": scanned.get("total_files", 0),
        "folders": len(scanned.get("folders", [])),
    })


@app.post("/api/media-root")
def set_media_root():
    global MEDIA_ROOT

    payload = request.get_json(silent=True) or {}
    raw_path = payload.get("path")
    if not raw_path:
        return jsonify({"error": "Missing path"}), 400

    candidate = Path(raw_path).expanduser().resolve()
    if not candidate.exists() or not candidate.is_dir():
        return jsonify({"error": "Path is not an existing folder"}), 400

    MEDIA_ROOT = candidate
    save_media_root(MEDIA_ROOT)
    return jsonify({"media_root": str(MEDIA_ROOT), "exists": True})


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
    target = resolve_media_path(MEDIA_ROOT, relative_path)
    if not target or not target.is_file():
        return jsonify({"error": "Media not found"}), 404
    return send_file(target, conditional=True)


if __name__ == "__main__":
    print(f"MEDIA ROOT: {MEDIA_ROOT}")
    print("CONSOLE: http://127.0.0.1:5000/console")
    print("REGIA:   http://127.0.0.1:5000/regia")
    print("OUTPUT:  http://127.0.0.1:5000/output")
    print("DJ:      http://127.0.0.1:5000/dj")
    app.run(host="127.0.0.1", port=5000, debug=True)
