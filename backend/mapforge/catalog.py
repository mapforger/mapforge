"""
MapForge — XDF Catalog

SQLAlchemy model + DB initialisation + seeding from catalog/index.json.
The SQLite DB is auto-generated at startup from the committed index.json.
"""

from __future__ import annotations

import datetime
import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

# ---------------------------------------------------------------------------
# Paths (relative to repo root, where uvicorn is launched)
# ---------------------------------------------------------------------------

CATALOG_DIR = Path("catalog")
XDF_DIR     = CATALOG_DIR / "xdf"
INDEX_FILE  = CATALOG_DIR / "index.json"
DB_PATH     = CATALOG_DIR / "catalog.db"


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


class XDFEntry(Base):
    __tablename__ = "xdf_catalog"

    id               = Column(String,  primary_key=True)
    title            = Column(String,  nullable=False)
    car_manufacturer = Column(String,  nullable=False)
    car_models       = Column(String,  nullable=False)   # JSON-encoded list
    year_from        = Column(Integer, nullable=True)
    year_to          = Column(Integer, nullable=True)
    engine           = Column(String,  nullable=True)
    power_hp         = Column(Integer, nullable=True)
    ecu              = Column(String,  nullable=False)
    firmware_version = Column(String,  nullable=False)
    bin_size         = Column(Integer, nullable=True)
    filename         = Column(String,  nullable=False)   # relative to catalog/xdf/
    sha256           = Column(String,  nullable=False, unique=True)
    contributor      = Column(String,  nullable=False, default="official")
    trust_level      = Column(String,  nullable=False, default="unverified")
    use_count        = Column(Integer, nullable=False, default=0)
    notes            = Column(Text,    nullable=True)
    created_at       = Column(DateTime, default=datetime.datetime.utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id":               self.id,
            "title":            self.title,
            "car_manufacturer": self.car_manufacturer,
            "car_models":       json.loads(self.car_models),
            "year_from":        self.year_from,
            "year_to":          self.year_to,
            "engine":           self.engine,
            "power_hp":         self.power_hp,
            "ecu":              self.ecu,
            "firmware_version": self.firmware_version,
            "bin_size":         self.bin_size,
            "contributor":      self.contributor,
            "trust_level":      self.trust_level,
            "use_count":        self.use_count,
            "notes":            self.notes,
        }


# ---------------------------------------------------------------------------
# Engine (module-level singleton)
# ---------------------------------------------------------------------------

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        CATALOG_DIR.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
    return _engine


def init_db() -> None:
    """Create tables and seed from index.json if the DB is empty."""
    engine = get_engine()
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        existing = session.query(XDFEntry).count()
        if existing == 0 and INDEX_FILE.exists():
            _seed_from_index(session)


def _seed_from_index(session: Session) -> None:
    index = json.loads(INDEX_FILE.read_text())
    for entry in index.get("entries", []):
        xdf_path = XDF_DIR / entry["filename"]
        # Compute sha256 from the actual file if present
        sha256 = entry.get("sha256", "")
        if xdf_path.exists():
            sha256 = _sha256_file(xdf_path)

        obj = XDFEntry(
            id               = entry["id"],
            title            = entry["title"],
            car_manufacturer = entry["car_manufacturer"],
            car_models       = json.dumps(entry.get("car_models", [])),
            year_from        = entry.get("year_from"),
            year_to          = entry.get("year_to"),
            engine           = entry.get("engine"),
            power_hp         = entry.get("power_hp"),
            ecu              = entry["ecu"],
            firmware_version = entry["firmware_version"],
            bin_size         = entry.get("bin_size"),
            filename         = entry["filename"],
            sha256           = sha256,
            contributor      = entry.get("contributor", "official"),
            trust_level      = entry.get("trust_level", "verified"),
            use_count        = 0,
            notes            = entry.get("notes", ""),
            created_at       = datetime.datetime.utcnow(),
        )
        session.add(obj)
    session.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def get_xdf_path(filename: str) -> Path:
    """Return absolute path to a catalog XDF file."""
    return XDF_DIR / filename


def get_session() -> Session:
    return Session(get_engine())
