# Media Reactive Engine

Local visual mixer controlled from a browser.

## URLs

- Regia: http://127.0.0.1:5000/regia
- Output: http://127.0.0.1:5000/output

## Setup

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

By default the engine scans:

```text
C:\Users\<USER>\Desktop\mediateca
```

To use another folder:

```powershell
$env:MEDIA_REACTIVE_ROOT="D:\path\to\your\mediateca"
python main.py
```

## First prototype

The regia currently supports:

- automatic recursive scan of media folders
- videos, images and SVG files
- folder browser
- media selection
- random media
- play/pause
- blackout
- opacity
- scale
- playback speed
- reactivity parameter placeholder

The next step is audio analysis (level, bass, mid, high, beat) and using those values to drive the visual parameters.
