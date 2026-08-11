# Media Reactive Engine

Local browser-based visual + DJ performance engine driven by a media library.

## URLs

- Visual mixer: http://127.0.0.1:5000/regia
- Visual output: http://127.0.0.1:5000/output
- DJ console: http://127.0.0.1:5000/dj

## Media library

Default:

```text
C:\Users\<USER>\Desktop\MEDIATECA
```

Supported visual formats: mp4, mov, mkv, webm, avi, jpg, jpeg, png, gif, webp, svg.

Supported audio formats: mp3, wav, flac, ogg, m4a, aac.

Suggested structure:

```text
MEDIATECA/
├── thematic/
├── icons/
├── porno/
└── audio/
    ├── tracks/
    ├── loops/
    └── samples/
```

The scan is recursive: folders can be organized however you want.

## Run

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

## V2

Visual mixer:
- Deck A + Deck B
- independent media, opacity, scale, speed and play/pause
- random load per deck
- equal-power crossfader
- blackout
- master audio reactivity

DJ:
- two real browser audio decks
- track browser
- play/pause/restart
- seek
- volume
- playback speed
- equal-power crossfader
- master volume
- real-time Web Audio FFT
- level / bass / mid / high / beat
- audio analysis is published to the visual output automatically

First reactive mapping:
- bass → scale pulse
- highs → brightness
- beat → white flash
