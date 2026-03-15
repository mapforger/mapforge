"""
MapForge — XDF contribution validator.

Checks that a submitted XDF:
  1. Parses without error
  2. Has a <FILESIZE> tag
  3. Required metadata fields are provided
  4. Is not already in the catalog (sha256 uniqueness)
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy.orm import Session

from mapforge.xdf_parser import parse_xdf, XDFParseError
from mapforge.catalog import XDFEntry, sha256_bytes


REQUIRED_METADATA = ["car_manufacturer", "ecu", "firmware_version", "car_models"]


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    extracted: dict = field(default_factory=dict)   # auto-extracted fields from XDF


def validate_contribution(
    xdf_data: bytes,
    metadata: dict,
    db_session: Session,
) -> ValidationResult:
    result = ValidationResult(ok=False)

    # 1. Check required metadata fields
    for key in REQUIRED_METADATA:
        val = metadata.get(key)
        if not val or (isinstance(val, list) and len(val) == 0):
            result.errors.append(f"Missing required field: {key}")

    # 2. Parse XDF
    with tempfile.NamedTemporaryFile(suffix=".xdf", delete=False) as tmp:
        tmp.write(xdf_data)
        tmp_path = Path(tmp.name)

    try:
        xdf = parse_xdf(tmp_path)
    except XDFParseError as e:
        result.errors.append(f"XDF parse error: {e}")
        tmp_path.unlink(missing_ok=True)
        return result
    finally:
        tmp_path.unlink(missing_ok=True)

    # 3. Extract info from XDF header
    result.extracted["title"] = xdf.header.title or metadata.get("title", "")
    result.extracted["bin_size"] = xdf.header.file_size  # may be None
    result.extracted["table_count"] = len(xdf.tables)
    result.extracted["constant_count"] = len(xdf.constants)

    # 4. FILESIZE recommended
    if xdf.header.file_size is None:
        result.warnings.append(
            "XDF has no <FILESIZE> tag — cannot verify bin size at load time"
        )

    # 5. At least one table or constant
    if len(xdf.tables) == 0 and len(xdf.constants) == 0:
        result.errors.append("XDF defines no tables and no constants")

    # 6. sha256 uniqueness
    digest = sha256_bytes(xdf_data)
    result.extracted["sha256"] = digest
    existing = db_session.query(XDFEntry).filter_by(sha256=digest).first()
    if existing:
        result.errors.append(
            f"This XDF is already in the catalog: '{existing.title}'"
        )

    if not result.errors:
        result.ok = True

    return result
