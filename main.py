from pathlib import Path
import os

from flask import Flask, jsonify, render_template, request, send_file
from media_library import scan_media_library, resolve_media_path

app = Flask(__name__)

DEFAULT_MEDIA_ROOT = Path.home() / "Desktop" / "mediateca"
MEDIA_ROOT = Path(
    os.environ.get("MEDIA_REACTIVE_ROOT", DEFAULT_MEDIA_ROOT)
).expanduser().resolve()

STATE = {
    "source_folder": None,
    "media": None,
    "playing": True,
    "opacity": 1.0,
    "scale": 1.0,
    "speed": 1.0,
    "reactivity": 0.5,
    "blackout": False,
}

@app.get("/")
def index():
    return render_template("regia.html")

@app.get("/regia")
def regia():
    return render_template("regia.html")

@app.get("/output")
def output():
    return render_template("output.html")

@app.get("/api/library")
def library():
    return jsonify(scan_media_library(MEDIA_ROOT))

@app.get("/api/state")
def get_state():
    return jsonify(STATE)

@app.post("/api/state")
def update_state():
    payload = request.get_json(silent=True) or {}
    allowed = set(STATE.keys())
    for key, value in payload.items():
        if key in allowed:
            STATE[key] = value
    return jsonify(STATE)

@app.get("/media")
def media_file():
    relative_path = request.args.get("path", "")
    target = resolve_media_path(MEDIA_ROOT, relative_path)
    if not target or not target.is_file():
        return jsonify({"error": "Media not found"}), 404
    return send_file(target, conditional=True)

@app.get("/api/config")
def config():
    return jsonify({
        "media_root": str(MEDIA_ROOT),
        "exists": MEDIA_ROOT.exists(),
    })

if __name__ == "__main__":
    print(f"MEDIA ROOT: {MEDIA_ROOT}")
    print("REGIA:  http://127.0.0.1:5000/regia")
    print("OUTPUT: http://127.0.0.1:5000/output")
    app.run(host="127.0.0.1", port=5000, debug=True)
