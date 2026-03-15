"""
Tests for the binary reader and writer.
We construct synthetic binaries that match our test XDF.
"""

import struct
import pytest
from pathlib import Path

from backend.mapforge.xdf_parser import parse_xdf
from backend.mapforge.bin_reader import read_table, read_constant, BinReadError
from backend.mapforge.bin_writer import BinEditor, BinWriteError
from backend.mapforge.math_eval import raw_to_phys, phys_to_raw

import textwrap

MINIMAL_XDF = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?>
    <XDFFORMAT version="1.70">
      <XDFHEADER>
        <deftitle>Test</deftitle>
        <BASEOFFSET offset="0" subtract="0"/>
      </XDFHEADER>
      <XDFTABLE uniqueid="0x1000" flags="0x0">
        <title>Fuel Map</title>
        <XDFAXIS id="x">
          <indexcount>4</indexcount>
          <units>RPM</units>
          <MATH equation="X*100"/>
          <EMBEDDEDDATA mmedaddress="0x00" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
        <XDFAXIS id="y">
          <indexcount>3</indexcount>
          <units>mg</units>
          <MATH equation="X"/>
          <EMBEDDEDDATA mmedaddress="0x08" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
        <XDFAXIS id="z">
          <indexcount>12</indexcount>
          <units>ms</units>
          <MATH equation="X*0.1"/>
          <EMBEDDEDDATA mmedaddress="0x20" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
      </XDFTABLE>
      <XDFCONSTANT uniqueid="0x2000">
        <title>Rev Limiter</title>
        <units>RPM</units>
        <MATH equation="X*10"/>
        <EMBEDDEDDATA mmedaddress="0x50" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
      </XDFCONSTANT>
    </XDFFORMAT>
""")


@pytest.fixture
def xdf(tmp_path: Path):
    f = tmp_path / "test.xdf"
    f.write_text(MINIMAL_XDF)
    return parse_xdf(f)


def make_binary(x_axis: list[int], y_axis: list[int], z_values: list[int], rev_limit: int) -> bytes:
    """
    Build a synthetic binary matching MINIMAL_XDF:
      0x00 — 4×uint16 BE  : X axis breakpoints
      0x08 — 3×uint16 BE  : Y axis breakpoints
      0x20 — 12×uint16 BE : Z values (3 rows × 4 cols)
      0x50 — 1×uint16 BE  : constant
    """
    buf = bytearray(0x60)
    for i, v in enumerate(x_axis):
        struct.pack_into(">H", buf, 0x00 + i * 2, v)
    for i, v in enumerate(y_axis):
        struct.pack_into(">H", buf, 0x08 + i * 2, v)
    for i, v in enumerate(z_values):
        struct.pack_into(">H", buf, 0x20 + i * 2, v)
    struct.pack_into(">H", buf, 0x50, rev_limit)
    return bytes(buf)


X_RAW = [8, 12, 16, 20]      # → 800, 1200, 1600, 2000 RPM
Y_RAW = [20, 40, 60]          # → 20, 40, 60 mg
Z_RAW = list(range(12))       # raw 0..11 → phys 0.0..1.1 ms
REV_RAW = 680                  # → 6800 RPM

BIN_DATA = make_binary(X_RAW, Y_RAW, Z_RAW, REV_RAW)


# ---------------------------------------------------------------------------
# math_eval tests
# ---------------------------------------------------------------------------

def test_raw_to_phys_identity():
    assert raw_to_phys("X", 42) == 42.0

def test_raw_to_phys_multiply():
    assert raw_to_phys("X*100", 8) == pytest.approx(800.0)

def test_raw_to_phys_linear():
    assert raw_to_phys("X*0.1", 100) == pytest.approx(10.0)

def test_phys_to_raw_invert():
    assert phys_to_raw("X*100", 800.0) == pytest.approx(8.0)

def test_phys_to_raw_identity():
    assert phys_to_raw("X", 42.0) == pytest.approx(42.0)


# ---------------------------------------------------------------------------
# bin_reader tests
# ---------------------------------------------------------------------------

def test_read_table_x_axis(xdf):
    table = xdf.get_table("0x1000")
    result = read_table(BIN_DATA, table)
    assert result["x_axis"]["values"] == pytest.approx([800, 1200, 1600, 2000])

def test_read_table_y_axis(xdf):
    table = xdf.get_table("0x1000")
    result = read_table(BIN_DATA, table)
    assert result["y_axis"]["values"] == pytest.approx([20, 40, 60])

def test_read_table_z_values(xdf):
    table = xdf.get_table("0x1000")
    result = read_table(BIN_DATA, table)
    # Z raw = 0..11, equation X*0.1 → 0.0, 0.1, ..., 1.1
    expected = [[0.0, 0.1, 0.2, 0.3], [0.4, 0.5, 0.6, 0.7], [0.8, 0.9, 1.0, 1.1]]
    # pytest.approx ne supporte pas les listes imbriquées — comparaison ligne par ligne
    for r, row in enumerate(expected):
        assert result["z_values"][r] == pytest.approx(row)

def test_read_table_metadata(xdf):
    table = xdf.get_table("0x1000")
    result = read_table(BIN_DATA, table)
    assert result["title"] == "Fuel Map"
    assert result["z_units"] == "ms"
    assert result["is_3d"] is True

def test_read_constant(xdf):
    constant = xdf.get_constant("0x2000")
    result = read_constant(BIN_DATA, constant)
    assert result["value"] == pytest.approx(6800.0)
    assert result["units"] == "RPM"

def test_read_table_out_of_bounds(xdf):
    table = xdf.get_table("0x1000")
    tiny_bin = b"\x00" * 10  # Too small
    with pytest.raises(BinReadError):
        read_table(tiny_bin, table)


# ---------------------------------------------------------------------------
# bin_writer tests
# ---------------------------------------------------------------------------

def test_write_single_value(xdf):
    editor = BinEditor(BIN_DATA)
    table = xdf.get_table("0x1000")
    editor.write_table_value(table, row=0, col=0, phys_value=0.5)

    result = read_table(editor.data, table)
    assert result["z_values"][0][0] == pytest.approx(0.5, abs=0.05)

def test_write_records_modification(xdf):
    editor = BinEditor(BIN_DATA)
    table = xdf.get_table("0x1000")
    editor.write_table_value(table, row=1, col=2, phys_value=9.9)
    assert len(editor.modifications) == 1
    assert "Fuel Map" in editor.modifications[0].description

def test_write_and_read_roundtrip(xdf):
    editor = BinEditor(BIN_DATA)
    table = xdf.get_table("0x1000")
    new_matrix = [[float(r * 4 + c) * 0.1 for c in range(4)] for r in range(3)]
    editor.write_table_all(table, new_matrix)
    result = read_table(editor.data, table)
    for r in range(3):
        for c in range(4):
            assert result["z_values"][r][c] == pytest.approx(new_matrix[r][c], abs=0.05)

def test_write_constant(xdf):
    editor = BinEditor(BIN_DATA)
    constant = xdf.get_constant("0x2000")
    editor.write_constant(constant, 7200.0)
    from backend.mapforge.bin_reader import read_constant
    result = read_constant(editor.data, constant)
    assert result["value"] == pytest.approx(7200.0, abs=10)

def test_write_out_of_bounds_row(xdf):
    editor = BinEditor(BIN_DATA)
    table = xdf.get_table("0x1000")
    with pytest.raises(BinWriteError):
        editor.write_table_value(table, row=99, col=0, phys_value=1.0)

def test_diff_reflects_changes(xdf):
    editor = BinEditor(BIN_DATA)
    table = xdf.get_table("0x1000")
    editor.write_table_value(table, row=0, col=0, phys_value=5.0)
    diff = editor.get_diff()
    assert len(diff) == 1
    assert diff[0]["address"] == "0x20"

def test_is_modified_flag(xdf):
    editor = BinEditor(BIN_DATA)
    assert not editor.is_modified
    table = xdf.get_table("0x1000")
    editor.write_table_value(table, row=0, col=0, phys_value=9.9)
    assert editor.is_modified
