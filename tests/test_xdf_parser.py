"""
Tests for the XDF parser.
We build minimal XDF XML strings in memory rather than requiring real files.
"""

import textwrap
import tempfile
from pathlib import Path
import pytest

from backend.mapforge.xdf_parser import parse_xdf, XDFParseError, XDFFile


MINIMAL_XDF = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?>
    <XDFFORMAT version="1.70">
      <XDFHEADER>
        <deftitle>Test ECU Definition</deftitle>
        <description>Unit test XDF</description>
        <author>MapForge Tests</author>
        <BASEOFFSET offset="0" subtract="0"/>
        <CATEGORY index="0x0" name="Fuelling"/>
        <CATEGORY index="0x1" name="Ignition"/>
      </XDFHEADER>

      <XDFTABLE uniqueid="0x1000" flags="0x0" categoryindex="0x0">
        <title>Fuel Map</title>
        <description>Main injection map</description>
        <XDFAXIS id="x">
          <indexcount>4</indexcount>
          <units>RPM</units>
          <MATH equation="X*100"/>
          <EMBEDDEDDATA mmedaddress="0x100" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
        <XDFAXIS id="y">
          <indexcount>3</indexcount>
          <units>mg</units>
          <MATH equation="X*0.5"/>
          <EMBEDDEDDATA mmedaddress="0x108" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
        <XDFAXIS id="z">
          <indexcount>12</indexcount>
          <units>ms</units>
          <MATH equation="X*0.01"/>
          <EMBEDDEDDATA mmedaddress="0x200" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
        </XDFAXIS>
      </XDFTABLE>

      <XDFCONSTANT uniqueid="0x2000" categoryindex="0x1">
        <title>Rev Limiter</title>
        <description>Maximum RPM cutoff</description>
        <units>RPM</units>
        <MATH equation="X*10"/>
        <EMBEDDEDDATA mmedaddress="0x300" mmedelementsize="2" mmedmajorstridebits="0" mmedminorstridebits="0"/>
      </XDFCONSTANT>
    </XDFFORMAT>
""")


@pytest.fixture
def xdf_file(tmp_path: Path) -> Path:
    f = tmp_path / "test.xdf"
    f.write_text(MINIMAL_XDF)
    return f


def test_parse_header(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    assert xdf.header.title == "Test ECU Definition"
    assert xdf.header.author == "MapForge Tests"
    assert xdf.header.base_offset == 0


def test_parse_tables_count(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    assert len(xdf.tables) == 1


def test_parse_table_metadata(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    table = xdf.tables[0]
    assert table.unique_id == "0x1000"
    assert table.title == "Fuel Map"
    assert table.description == "Main injection map"
    assert table.category == "Fuelling"


def test_parse_table_dimensions(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    table = xdf.tables[0]
    assert table.cols == 4   # X axis count
    assert table.rows == 3   # Y axis count
    assert table.is_3d is True


def test_parse_axis_details(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    table = xdf.tables[0]
    x = table.axes["x"]
    assert x.units == "RPM"
    assert x.math_equation == "X*100"
    assert x.embedded is not None
    assert x.embedded.address == 0x100
    assert x.embedded.element_size == 2


def test_parse_constants(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    assert len(xdf.constants) == 1
    c = xdf.constants[0]
    assert c.title == "Rev Limiter"
    assert c.units == "RPM"
    assert c.math_equation == "X*10"
    assert c.embedded.address == 0x300


def test_get_table_by_id(xdf_file: Path):
    xdf = parse_xdf(xdf_file)
    assert xdf.get_table("0x1000") is not None
    assert xdf.get_table("0x9999") is None


def test_parse_nonexistent_file():
    with pytest.raises(XDFParseError, match="not found"):
        parse_xdf("/tmp/does_not_exist_xyz.xdf")


def test_parse_invalid_xml(tmp_path: Path):
    bad = tmp_path / "bad.xdf"
    bad.write_text("<this is not valid xml")
    with pytest.raises(XDFParseError, match="Invalid XML"):
        parse_xdf(bad)


def test_parse_wrong_root(tmp_path: Path):
    bad = tmp_path / "bad.xdf"
    bad.write_text("<WRONGROOT/>")
    with pytest.raises(XDFParseError, match="Not a valid XDF"):
        parse_xdf(bad)


def test_base_offset_applied(tmp_path: Path):
    xdf_text = MINIMAL_XDF.replace(
        '<BASEOFFSET offset="0" subtract="0"/>',
        '<BASEOFFSET offset="0x100" subtract="0"/>'
    )
    f = tmp_path / "offset.xdf"
    f.write_text(xdf_text)
    xdf = parse_xdf(f)
    # Address 0x100 + base_offset 0x100 = 0x200
    table = xdf.tables[0]
    assert table.axes["x"].embedded.address == 0x100 + 0x100
