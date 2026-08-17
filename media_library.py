from pathlib import Path
from urllib.parse import quote

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
SVG_EXTENSIONS = {".svg"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}
SUPPORTED_EXTENSIONS = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS | SVG_EXTENSIONS | AUDIO_EXTENSIONS


def media_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in SVG_EXTENSIONS:
        return "svg"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "unknown"


def scan_media_library(root: Path, source: str | None = None) -> dict:
    data = {
        "root": str(root),
        "exists": root.exists(),
        "source": source,
        "folders": [],
        "total_files": 0,
    }

    if not root.exists():
        return data

    folders = {}

    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        relative = path.relative_to(root)
        folder = relative.parent.as_posix()
        if folder == ".":
            folder = "_root"

        source_arg = f"&source={quote(source)}" if source else ""
        item = {
            "name": path.name,
            "path": relative.as_posix(),
            "kind": media_kind(path),
            "source": source,
            "url": f"/media?path={quote(relative.as_posix())}{source_arg}",
        }

        folders.setdefault(folder, []).append(item)
        data["total_files"] += 1

    data["folders"] = [
        {"name": folder, "count": len(items), "items": items}
        for folder, items in folders.items()
    ]
    return data


def resolve_media_path(root: Path, relative_path: str):
    try:
        root = root.resolve()
        target = (root / relative_path).resolve()
        target.relative_to(root)
        return target
    except (ValueError, OSError):
        return None
