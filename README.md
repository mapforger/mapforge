# MapForge

A modern, open-source ECU map editor for TunerPro XDF-based calibration files.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-orange)
![Python](https://img.shields.io/badge/python-3.11%2B-blue)
![React](https://img.shields.io/badge/react-18-61dafb)

---

## What it does

MapForge loads an ECU binary (`.bin`) paired with a TunerPro RT XDF definition file, lets you view and edit all calibration tables and constants, then exports the modified binary — with checksum validation built in.

- **2D table editor** — heatmap-coloured cells, keyboard navigation, undo/redo
- **3D surface view** — interactive WebGL surface with wireframe overlay and cage grid
- **Constants panel** — inline editing for all scalar values defined in the XDF
- **Diff view** — full change log with original → new values, sortable and filterable, click to navigate to the cell
- **Checksum management** — reads XDFCHECKSUM blocks from the XDF, verifies the original file on load, verifies after each modification, one-click correction before export
- **Export guard** — warns and offers to fix checksums if any are invalid when exporting

---

## Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Backend  | Python · FastAPI · simpleeval · lxml            |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS     |
| 3D       | Three.js · @react-three/fiber · @react-three/drei |

---

## Quick start

**Requirements:** Python 3.11+, Node.js 18+

```bash
git clone https://github.com/mapforger/mapforge.git
cd mapforge

# Backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r backend/requirements.txt
PYTHONPATH=backend uvicorn backend.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — drop in a `.bin` and its `.xdf`, start editing.

---

## XDF compatibility

MapForge targets the **TunerPro RT v5** XDF format. It parses:

- `XDFTABLE` — 2D and 3D calibration maps
- `XDFCONSTANT` — scalar values
- `XDFCHECKSUM` — checksum block definitions (sum8, sum16, CRC16/32, Bosch EDC16)
- `XDFHEADER` — base offset, categories

MATH equations (`X*0.1`, `X/4+40`, etc.) are evaluated safely via `simpleeval`.

---

## License

[AGPL-3.0](LICENSE) — free to use, modify, and distribute. If you run a modified version as a service, you must release the source.
