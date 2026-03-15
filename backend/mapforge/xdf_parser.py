"""
XDF Parser — TunerPro RT format
Spec: https://www.tunerpro.net/downloadApp.htm (XDF format documentation)

An XDF file is an XML document describing how to interpret a binary ECU dump.
It defines tables (2D/3D maps), constants (scalars), and axis data:
  - Where values live in the binary (address, element size, stride)
  - How to convert raw bytes to human-readable values (MATH equation)
  - Metadata: units, labels, min/max, axis breakpoints
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Data classes — represent the parsed XDF structure
# ---------------------------------------------------------------------------

@dataclass
class EmbeddedData:
    """Describes where and how values are stored in the binary."""
    address: int          # Absolute address in binary (after base offset applied)
    element_size: int     # Size of each element in bytes (1, 2, 4)
    major_stride: int     # Bits to advance between rows (0 = packed)
    minor_stride: int     # Bits to advance between columns (0 = packed)
    signed: bool = False  # Signed integer?
    lsb_first: bool = False  # Little-endian?


@dataclass
class Axis:
    """One axis of a table (x, y, or z/data)."""
    id: str                          # "x", "y", or "z"
    count: int                       # Number of elements
    units: str = ""
    math_equation: str = "X"        # Raw→human conversion (TunerPro MATH)
    embedded: Optional[EmbeddedData] = None
    labels: list[str] = field(default_factory=list)  # Static labels if no embedded data


@dataclass
class XDFTable:
    unique_id: str
    title: str
    description: str = ""
    category: str = ""
    axes: dict[str, Axis] = field(default_factory=dict)  # keys: "x", "y", "z"

    @property
    def is_3d(self) -> bool:
        return "y" in self.axes and self.axes["y"].count > 1

    @property
    def rows(self) -> int:
        return self.axes["y"].count if "y" in self.axes else 1

    @property
    def cols(self) -> int:
        return self.axes["x"].count if "x" in self.axes else 1


@dataclass
class XDFConstant:
    unique_id: str
    title: str
    description: str = ""
    category: str = ""
    units: str = ""
    math_equation: str = "X"
    embedded: Optional[EmbeddedData] = None


@dataclass
class XDFHeader:
    title: str = ""
    description: str = ""
    author: str = ""
    base_offset: int = 0       # Added to all embedded addresses
    file_size: Optional[int] = None


@dataclass
class XDFFile:
    header: XDFHeader
    tables: list[XDFTable] = field(default_factory=list)
    constants: list[XDFConstant] = field(default_factory=list)

    def get_table(self, unique_id: str) -> Optional[XDFTable]:
        for t in self.tables:
            if t.unique_id == unique_id:
                return t
        return None

    def get_constant(self, unique_id: str) -> Optional[XDFConstant]:
        for c in self.constants:
            if c.unique_id == unique_id:
                return c
        return None


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

class XDFParseError(Exception):
    pass


def _parse_int(value: str) -> int:
    """Parse hex (0x...) or decimal string to int."""
    value = value.strip()
    if value.startswith("0x") or value.startswith("0X"):
        return int(value, 16)
    return int(value)


def _text(element: Optional[ET.Element], tag: str, default: str = "") -> str:
    if element is None:
        return default
    child = element.find(tag)
    if child is None or child.text is None:
        return default
    return child.text.strip()


def _parse_embedded_data(elem: ET.Element, base_offset: int) -> EmbeddedData:
    """
    <EMBEDDEDDATA
        mmedaddress="0x1234"
        mmedelementsize="2"
        mmedmajorstridebits="16"
        mmedminorstridebits="0"
        mmedcolcount="16"
        mmedrowcount="16"
    />
    Flags byte encodes signed/endian:
      bit 0: signed
      bit 1: lsb first (little-endian)
    """
    attrib = elem.attrib

    raw_addr = _parse_int(attrib.get("mmedaddress", "0x0"))
    address = raw_addr + base_offset

    element_size = int(attrib.get("mmedelementsize", "1"))
    major_stride = int(attrib.get("mmedmajorstridebits", "0"))
    minor_stride = int(attrib.get("mmedminorstridebits", "0"))

    # Flags: some XDF versions encode signed/endian in a flags attribute
    flags = _parse_int(attrib.get("mmedtypeflags", "0x00"))
    signed = bool(flags & 0x01)
    lsb_first = bool(flags & 0x02)

    return EmbeddedData(
        address=address,
        element_size=element_size,
        major_stride=major_stride,
        minor_stride=minor_stride,
        signed=signed,
        lsb_first=lsb_first,
    )


def _parse_axis(elem: ET.Element, base_offset: int) -> Axis:
    axis_id = elem.attrib.get("id", "z")

    count_elem = elem.find("indexcount")
    count = int(count_elem.text.strip()) if count_elem is not None and count_elem.text else 1

    units = _text(elem, "units")

    math_elem = elem.find("MATH")
    equation = math_elem.attrib.get("equation", "X") if math_elem is not None else "X"

    embedded = None
    emb_elem = elem.find("EMBEDDEDDATA")
    if emb_elem is not None:
        embedded = _parse_embedded_data(emb_elem, base_offset)

    # Static labels (some axes have <label index="0" value="800"/> etc.)
    labels: list[str] = []
    for label_elem in elem.findall("label"):
        labels.append(label_elem.attrib.get("value", ""))

    return Axis(
        id=axis_id,
        count=count,
        units=units,
        math_equation=equation,
        embedded=embedded,
        labels=labels,
    )


def _parse_table(elem: ET.Element, base_offset: int, categories: dict[str, str]) -> XDFTable:
    unique_id = elem.attrib.get("uniqueid", "0x0")

    # Category from flags (some XDFs use categoryindex attribute)
    cat_index = elem.attrib.get("categoryindex", "")
    category = categories.get(cat_index, "")

    title = _text(elem, "title", f"Table {unique_id}")
    description = _text(elem, "description")

    axes: dict[str, Axis] = {}
    for axis_elem in elem.findall("XDFAXIS"):
        axis = _parse_axis(axis_elem, base_offset)
        axes[axis.id] = axis

    return XDFTable(
        unique_id=unique_id,
        title=title,
        description=description,
        category=category,
        axes=axes,
    )


def _parse_constant(elem: ET.Element, base_offset: int, categories: dict[str, str]) -> XDFConstant:
    unique_id = elem.attrib.get("uniqueid", "0x0")

    cat_index = elem.attrib.get("categoryindex", "")
    category = categories.get(cat_index, "")

    title = _text(elem, "title", f"Constant {unique_id}")
    description = _text(elem, "description")
    units = _text(elem, "units")

    math_elem = elem.find("MATH")
    equation = math_elem.attrib.get("equation", "X") if math_elem is not None else "X"

    embedded = None
    emb_elem = elem.find("EMBEDDEDDATA")
    if emb_elem is not None:
        embedded = _parse_embedded_data(emb_elem, base_offset)

    return XDFConstant(
        unique_id=unique_id,
        title=title,
        description=description,
        category=category,
        units=units,
        math_equation=equation,
        embedded=embedded,
    )


def parse_xdf(path: str | Path) -> XDFFile:
    """Parse an XDF file and return a structured XDFFile object."""
    path = Path(path)
    if not path.exists():
        raise XDFParseError(f"XDF file not found: {path}")

    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        raise XDFParseError(f"Invalid XML in XDF file: {e}") from e

    root = tree.getroot()
    if root.tag != "XDFFORMAT":
        raise XDFParseError(f"Not a valid XDF file (root tag: {root.tag})")

    # --- Header ---
    header_elem = root.find("XDFHEADER")
    if header_elem is None:
        raise XDFParseError("Missing XDFHEADER in XDF file")

    base_offset_elem = header_elem.find("BASEOFFSET")
    if base_offset_elem is not None:
        # <BASEOFFSET offset="0" subtract="0"/>
        raw = _parse_int(base_offset_elem.attrib.get("offset", "0"))
        subtract = int(base_offset_elem.attrib.get("subtract", "0"))
        base_offset = -raw if subtract else raw
    else:
        base_offset = 0

    file_size_elem = header_elem.find("FILESIZE")
    file_size = _parse_int(file_size_elem.text) if file_size_elem is not None and file_size_elem.text else None

    header = XDFHeader(
        title=_text(header_elem, "deftitle"),
        description=_text(header_elem, "description"),
        author=_text(header_elem, "author"),
        base_offset=base_offset,
        file_size=file_size,
    )

    # --- Categories (optional, used to group tables) ---
    categories: dict[str, str] = {}
    for i, cat_elem in enumerate(header_elem.findall("CATEGORY")):
        index = cat_elem.attrib.get("index", str(i))
        name = cat_elem.attrib.get("name", "")
        categories[index] = name

    # --- Tables ---
    tables: list[XDFTable] = []
    for table_elem in root.findall("XDFTABLE"):
        try:
            tables.append(_parse_table(table_elem, base_offset, categories))
        except Exception as e:
            uid = table_elem.attrib.get("uniqueid", "?")
            raise XDFParseError(f"Error parsing table {uid}: {e}") from e

    # --- Constants ---
    constants: list[XDFConstant] = []
    for const_elem in root.findall("XDFCONSTANT"):
        try:
            constants.append(_parse_constant(const_elem, base_offset, categories))
        except Exception as e:
            uid = const_elem.attrib.get("uniqueid", "?")
            raise XDFParseError(f"Error parsing constant {uid}: {e}") from e

    return XDFFile(header=header, tables=tables, constants=constants)
