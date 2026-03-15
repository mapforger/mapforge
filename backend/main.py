"""
MapForge — FastAPI backend

Endpoints:
  POST /api/xdf/parse          Upload + parse an XDF file
  POST /api/bin/load           Upload a BIN file (returns file_id)
  GET  /api/tables/{file_id}   List all tables from loaded BIN+XDF
  GET  /api/table/{file_id}/{table_id}   Read a single table's values
  GET  /api/constants/{file_id}          List all constants
  PUT  /api/table/{file_id}/{table_id}   Write modified values
  GET  /api/export/{file_id}             Download modified BIN
  GET  /api/diff/{file_id}               Get modification diff
  POST /api/checksum/verify/{file_id}    Verify checksums
  POST /api/checksum/correct/{file_id}   Correct checksums
"""

from __future__ import annotations

import io
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from mapforge.xdf_parser import parse_xdf, XDFParseError
from mapforge.bin_reader import BinReadError, read_table, read_constant
from mapforge.bin_writer import BinEditor, BinWriteError
from mapforge.checksum import ChecksumBlock, verify_all, correct_all
from mapforge.catalog import init_db, get_session as get_db_session, get_xdf_path, XDFEntry

app = FastAPI(title="MapForge API", version="0.2.0")


@app.on_event("startup")
def startup():
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory session store (replace with Redis/DB for multi-user production)
# ---------------------------------------------------------------------------

_sessions: dict[str, dict[str, Any]] = {}


def _get_session(file_id: str) -> dict[str, Any]:
    session = _sessions.get(file_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{file_id}' not found. Load a BIN file first.")
    return session


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


@app.post("/api/session/create")
async def create_session(
    bin_file: UploadFile = File(...),
    xdf_file: UploadFile = File(...),
) -> dict:
    """
    Upload a BIN + XDF pair and create a session.
    Returns a file_id to use in subsequent requests.
    """
    bin_data = await bin_file.read()
    xdf_data = await xdf_file.read()

    # Parse XDF
    with tempfile.NamedTemporaryFile(suffix=".xdf", delete=False) as tmp:
        tmp.write(xdf_data)
        tmp_path = Path(tmp.name)

    try:
        xdf = parse_xdf(tmp_path)
    except XDFParseError as e:
        raise HTTPException(status_code=400, detail=f"XDF parse error: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)

    editor = BinEditor(bin_data)

    # Convert XDF checksum blocks to the dict format used by checksum endpoints
    checksum_blocks = [
        {
            "data_start": b.data_start,
            "data_end": b.data_end,
            "store_address": b.store_address,
            "store_size": b.store_size,
            "algorithm": b.algorithm,
            "store_lsb_first": b.lsb_first,
            "label": b.title,
        }
        for b in xdf.checksums
    ]

    file_id = str(uuid.uuid4())
    _sessions[file_id] = {
        "xdf": xdf,
        "editor": editor,
        "original_data": bytes(bin_data),   # kept for original-vs-current comparison
        "checksum_blocks": checksum_blocks,
        "bin_name": bin_file.filename or "file.bin",
        "xdf_name": xdf_file.filename or "file.xdf",
    }

    return {
        "file_id": file_id,
        "bin_name": bin_file.filename,
        "xdf_name": xdf_file.filename,
        "bin_size": len(bin_data),
        "xdf_title": xdf.header.title,
        "table_count": len(xdf.tables),
        "constant_count": len(xdf.constants),
    }


@app.get("/api/tables/{file_id}")
def list_tables(file_id: str) -> dict:
    """List all tables defined in the XDF (metadata only, no values)."""
    session = _get_session(file_id)
    xdf = session["xdf"]

    tables = []
    for t in xdf.tables:
        tables.append({
            "id": t.unique_id,
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "is_3d": t.is_3d,
            "rows": t.rows,
            "cols": t.cols,
        })

    return {"tables": tables, "count": len(tables)}


@app.get("/api/table/{file_id}/{table_id}")
def get_table(file_id: str, table_id: str) -> dict:
    """Read a table's values from the binary."""
    session = _get_session(file_id)
    xdf = session["xdf"]
    editor: BinEditor = session["editor"]

    table = xdf.get_table(table_id)
    if table is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_id}' not found in XDF")

    try:
        result = read_table(editor.data, table)
    except BinReadError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result


@app.get("/api/constants/{file_id}")
def list_constants(file_id: str) -> dict:
    """Read all constant values."""
    session = _get_session(file_id)
    xdf = session["xdf"]
    editor: BinEditor = session["editor"]

    constants = []
    for c in xdf.constants:
        try:
            constants.append(read_constant(editor.data, c))
        except BinReadError as e:
            constants.append({
                "id": c.unique_id,
                "title": c.title,
                "error": str(e),
            })

    return {"constants": constants, "count": len(constants)}


class TableWriteRequest(BaseModel):
    """Matrix of physical values to write into a table."""
    values: list[list[float]]


@app.put("/api/table/{file_id}/{table_id}")
def write_table(file_id: str, table_id: str, body: TableWriteRequest) -> dict:
    """Write new values into a table."""
    session = _get_session(file_id)
    xdf = session["xdf"]
    editor: BinEditor = session["editor"]

    table = xdf.get_table(table_id)
    if table is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_id}' not found in XDF")

    try:
        editor.write_table_all(table, body.values)
    except BinWriteError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"status": "ok", "modifications": len(editor.modifications)}


class ConstantWriteRequest(BaseModel):
    value: float


@app.put("/api/constant/{file_id}/{constant_id}")
def write_constant(file_id: str, constant_id: str, body: ConstantWriteRequest) -> dict:
    """Write a new value for a constant."""
    session = _get_session(file_id)
    xdf = session["xdf"]
    editor: BinEditor = session["editor"]

    constant = xdf.get_constant(constant_id)
    if constant is None:
        raise HTTPException(status_code=404, detail=f"Constant '{constant_id}' not found in XDF")

    try:
        editor.write_constant(constant, body.value)
    except BinWriteError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {"status": "ok"}


@app.get("/api/diff/{file_id}")
def get_diff(file_id: str) -> dict:
    """Get a list of all modifications made in this session."""
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]
    return {"diff": editor.get_diff(), "count": len(editor.modifications)}


@app.get("/api/checksum/status/{file_id}")
def checksum_status(file_id: str) -> dict:
    """
    Return checksum verification for both the original binary and the current
    (potentially modified) binary, using blocks defined in the XDF.
    If the XDF has no XDFCHECKSUM blocks, returns has_blocks=False.
    """
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]
    blocks_raw = session.get("checksum_blocks", [])

    if not blocks_raw:
        return {"has_blocks": False, "original": [], "current": []}

    blocks = _parse_checksum_blocks(blocks_raw)
    original_data = session.get("original_data", editor.data)

    return {
        "has_blocks": True,
        "original": verify_all(original_data, blocks),
        "current": verify_all(editor.data, blocks),
    }


@app.post("/api/checksum/fix/{file_id}")
def checksum_fix(file_id: str) -> dict:
    """
    Recompute and write all checksums using the blocks defined in the XDF.
    No request body needed — uses the session's stored block definitions.
    """
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]
    blocks_raw = session.get("checksum_blocks", [])

    if not blocks_raw:
        raise HTTPException(status_code=400, detail="No checksum blocks defined in this XDF")

    blocks = _parse_checksum_blocks(blocks_raw)
    buf = bytearray(editor.data)
    results = correct_all(buf, blocks)
    editor._buf = buf
    return {"results": results}


@app.get("/api/export/{file_id}")
def export_bin(file_id: str) -> StreamingResponse:
    """Download the modified binary file."""
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]
    bin_name = session["bin_name"]

    stem = Path(bin_name).stem
    export_name = f"{stem}_modified.bin"

    return StreamingResponse(
        io.BytesIO(editor.data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{export_name}"'},
    )


class ChecksumRequest(BaseModel):
    blocks: list[dict]  # serialised ChecksumBlock fields


def _parse_checksum_blocks(raw_blocks: list[dict]) -> list[ChecksumBlock]:
    blocks = []
    for b in raw_blocks:
        blocks.append(ChecksumBlock(
            data_start=int(b["data_start"], 16) if isinstance(b["data_start"], str) else b["data_start"],
            data_end=int(b["data_end"], 16) if isinstance(b["data_end"], str) else b["data_end"],
            store_address=int(b["store_address"], 16) if isinstance(b["store_address"], str) else b["store_address"],
            store_size=b["store_size"],
            algorithm=b["algorithm"],
            store_lsb_first=b.get("store_lsb_first", False),
            label=b.get("label", ""),
        ))
    return blocks


@app.post("/api/checksum/verify/{file_id}")
def checksum_verify(file_id: str, body: ChecksumRequest) -> dict:
    """Verify checksum blocks against the current binary state."""
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]

    blocks = _parse_checksum_blocks(body.blocks)
    results = verify_all(editor.data, blocks)
    all_valid = all(r.get("valid", False) for r in results)
    return {"all_valid": all_valid, "results": results}


@app.post("/api/checksum/correct/{file_id}")
def checksum_correct(file_id: str, body: ChecksumRequest) -> dict:
    """Recompute and correct all checksum blocks in-place."""
    session = _get_session(file_id)
    editor: BinEditor = session["editor"]

    blocks = _parse_checksum_blocks(body.blocks)
    buf = bytearray(editor.data)
    results = correct_all(buf, blocks)
    # Update editor buffer
    editor._buf = buf
    return {"results": results}


# ---------------------------------------------------------------------------
# Catalog routes
# ---------------------------------------------------------------------------

@app.get("/api/catalog/search")
def catalog_search(
    q:            str | None = None,
    manufacturer: str | None = None,
    ecu:          str | None = None,
    year:         int | None = None,
) -> dict:
    """
    Search the XDF catalog.
    Supports free-text (q) and filters: manufacturer, ecu, year.
    """
    with get_db_session() as session:
        query = session.query(XDFEntry)

        if manufacturer:
            query = query.filter(XDFEntry.car_manufacturer.ilike(f"%{manufacturer}%"))
        if ecu:
            query = query.filter(XDFEntry.ecu.ilike(f"%{ecu}%"))
        if year:
            query = query.filter(
                (XDFEntry.year_from <= year) | (XDFEntry.year_from == None),  # noqa: E711
                (XDFEntry.year_to >= year)   | (XDFEntry.year_to == None),    # noqa: E711
            )
        if q:
            like = f"%{q}%"
            query = query.filter(
                XDFEntry.title.ilike(like)
                | XDFEntry.car_manufacturer.ilike(like)
                | XDFEntry.car_models.ilike(like)
                | XDFEntry.ecu.ilike(like)
                | XDFEntry.engine.ilike(like)
            )

        entries = query.order_by(XDFEntry.use_count.desc(), XDFEntry.title).all()
        return {"entries": [e.to_dict() for e in entries], "count": len(entries)}


@app.get("/api/catalog/{entry_id}")
def catalog_get(entry_id: str) -> dict:
    with get_db_session() as session:
        entry = session.get(XDFEntry, entry_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="Catalog entry not found")
        return entry.to_dict()


@app.post("/api/session/create_from_catalog")
async def create_session_from_catalog(
    catalog_id: str,
    bin_file: UploadFile = File(...),
) -> dict:
    """
    Create an editing session using a catalog XDF + an uploaded BIN.
    Increments the use_count for the catalog entry.
    """
    with get_db_session() as session:
        entry = session.get(XDFEntry, catalog_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="Catalog entry not found")

        xdf_path = get_xdf_path(entry.filename)
        if not xdf_path.exists():
            raise HTTPException(status_code=500, detail="XDF file missing from catalog")

        # Increment use count
        entry.use_count += 1
        session.commit()

        xdf_filename = entry.filename
        xdf_title = entry.title

    bin_data = await bin_file.read()

    try:
        xdf = parse_xdf(xdf_path)
    except XDFParseError as e:
        raise HTTPException(status_code=400, detail=f"XDF parse error: {e}")

    editor = BinEditor(bin_data)
    checksum_blocks = [
        {
            "data_start":      b.data_start,
            "data_end":        b.data_end,
            "store_address":   b.store_address,
            "store_size":      b.store_size,
            "algorithm":       b.algorithm,
            "store_lsb_first": b.lsb_first,
            "label":           b.title,
        }
        for b in xdf.checksums
    ]

    file_id = str(uuid.uuid4())
    _sessions[file_id] = {
        "xdf":              xdf,
        "editor":           editor,
        "original_data":    bytes(bin_data),
        "checksum_blocks":  checksum_blocks,
        "bin_name":         bin_file.filename or "file.bin",
        "xdf_name":         xdf_filename,
    }

    return {
        "file_id":         file_id,
        "bin_name":        bin_file.filename,
        "xdf_name":        xdf_filename,
        "bin_size":        len(bin_data),
        "xdf_title":       xdf_title,
        "table_count":     len(xdf.tables),
        "constant_count":  len(xdf.constants),
    }



@app.delete("/api/session/{file_id}")
def delete_session(file_id: str) -> dict:
    """Clean up a session."""
    if file_id in _sessions:
        del _sessions[file_id]
    return {"status": "deleted"}
