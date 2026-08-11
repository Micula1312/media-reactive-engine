from pathlib import Path
import os

from flask import Flask, jsonify, render_template, request, send_file
from media_library import scan_media_library, resolve_media_path

app = Flask(__name__)

DEFAULT_MEDIA_ROOT = Path.home() / "Desktop" / "MEDIATECA"
MEDIA_ROOT = Path(
    os.environ.get("MEDIA_REACTIVE_ROOT", DEFAULT_MEDIA_ROOT)
).expanduser().resolve()

def empty_deck():
    return {
        "source_folder": None,
        "media": None,
        "playing": True,
        "opacity": 1.0,
        "scale": 1.0,
        "speed": 1.0,
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
def index():
    return render_template("regia.html")

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
    target = resolve_media_path(MEDIA_ROOT, relative_path)
    if not target or not target.is_file():
        return jsonify({"error": "Media not found"}), 404
    return send_file(target, conditional=True)

if __name__ == "__main__":
    print(f"MEDIA ROOT: {MEDIA_ROOT}")
    print("REGIA:  http://127.0.0.1:5000/regia")
    print("OUTPUT: http://127.0.0.1:5000/output")
    print("DJ:     http://127.0.0.1:5000/dj")
    app.run(host="127.0.0.1", port=5000, debug=True)
