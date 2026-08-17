from pathlib import Path
import json
import re

PRESETS_DIR = Path(__file__).resolve().parent / "presets"


def ensure_presets_dir():
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)


def safe_name(name):
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", (name or "preset").strip()).strip("-._")
    return name or "preset"


def list_presets():
    ensure_presets_dir()
    result = []
    for path in sorted(PRESETS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            result.append({"id": path.stem, "name": data.get("name", path.stem), "description": data.get("description", "")})
        except (OSError, json.JSONDecodeError):
            continue
    return result


def load_preset(preset_id):
    ensure_presets_dir()
    path = PRESETS_DIR / f"{safe_name(preset_id)}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_preset(name, visual_state, audio_state=None):
    ensure_presets_dir()
    preset_id = safe_name(name)
    payload = {
        "name": name.strip() or preset_id,
        "description": "magic-mic performance preset",
        "version": 1,
        "visual_state": visual_state,
        "audio_state": audio_state or {},
    }
    path = PRESETS_DIR / f"{preset_id}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"id": preset_id, "name": payload["name"], "path": str(path)}
