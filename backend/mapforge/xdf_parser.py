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
class XDFChecksumBlock:
    """Checksum block parsed from an XDFCHECKSUM element."""
    unique_id: str
    title: str
    algorithm: str       # Named: sum8, sum16_be, crc16_ccitt, crc32, bosch_edc16_sum
    data_start: int      # Absolute address — start of region to checksum
    data_end: int        # Absolute address — end of region (exclusive)
    store_address: int   # Where the checksum bytes are stored in the binary
    store_size: int      # 1, 2, or 4 bytes
    lsb_first: bool = False


@dataclass
class XDFFile:
    header: XDFHeader
    tables: list[XDFTable] = field(default_factory=list)
    constants: list[XDFConstant] = field(default_factory=list)
    checksums: list[XDFChecksumBlock] = field(default_factory=list)

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


# TunerPro numeric algorithm codes → our named algorithms (best-effort mapping)
_ALGO_CODES: dict[int, str] = {
    0x1: "sum8",
    0x2: "sum16_be",
    0x3: "sum16_be",    # most common Bosch-style word sum
    0x5: "crc16_ccitt",
    0x6: "crc32",
    0x7: "bosch_edc16_sum",
}


def _map_algorithm(value: str) -> str:
    """Map a TunerPro algorithm code (numeric or string) to our named algorithm."""
    v = value.strip().lower()
    try:
        code = int(v, 0)
        return _ALGO_CODES.get(code, "sum16_be")
    except ValueError:
        pass
    if "crc32" in v:
        return "crc32"
    if "crc16" in v:
        return "crc16_ccitt"
    if "bosch" in v or "edc" in v:
        return "bosch_edc16_sum"
    if "sum16" in v:
        return "sum16_be"
    if "sum8" in v:
        return "sum8"
    return "sum16_be"  # safe default


def _parse_checksum_blocks(root: ET.Element, base_offset: int) -> list[XDFChecksumBlock]:
    """
    Parse XDFCHECKSUM elements from the XDF root.
    TunerPro uses several slightly different layouts across versions; we try
    multiple attribute patterns and silently skip blocks we cannot parse.

    Most common format:
        <XDFCHECKSUM uniqueid="0x1">
          <title>Checksum</title>
          <CHECKSUM algorithm="0x3" checksumlength="2">
            <RANGEADDRESS startaddress="0x2000" endaddress="0x7FFF"/>
            <STORELOCATION address="0x1FFC" length="2"/>
          </CHECKSUM>
        </XDFCHECKSUM>
    """
    blocks: list[XDFChecksumBlock] = []

    for elem in root.findall("XDFCHECKSUM"):
        try:
            uid = elem.attrib.get("uniqueid", "0x0")
            title = _text(elem, "title", f"Checksum {uid}")

            data_start = data_end = store_address = 0
            store_size = 2
            algorithm = "sum16_be"
            lsb_first = False

            checksum_el = elem.find("CHECKSUM")
            if checksum_el is not None:
                algorithm = _map_algorithm(checksum_el.attrib.get("algorithm", "0x3"))
                clen = checksum_el.attrib.get("checksumlength", "2")
                store_size = _parse_int(clen)

                # RANGEADDRESS — supports start/end or startaddress/endaddress or address+length
                range_el = checksum_el.find("RANGEADDRESS")
                if range_el is not None:
                    attrib = range_el.attrib
                    if "startaddress" in attrib and "endaddress" in attrib:
                        data_start = _parse_int(attrib["startaddress"]) + base_offset
                        data_end   = _parse_int(attrib["endaddress"])   + base_offset
                    elif "start" in attrib and "end" in attrib:
                        data_start = _parse_int(attrib["start"]) + base_offset
                        data_end   = _parse_int(attrib["end"])   + base_offset
                    elif "address" in attrib and "length" in attrib:
                        data_start = _parse_int(attrib["address"]) + base_offset
                        data_end   = data_start + _parse_int(attrib["length"])

                store_el = checksum_el.find("STORELOCATION")
                if store_el is not None:
                    store_address = _parse_int(store_el.attrib.get("address", "0x0")) + base_offset
                    if "length" in store_el.attrib:
                        store_size = _parse_int(store_el.attrib["length"])
                    # addrtype 0 = little-endian store, 1 = big-endian (default)
                    lsb_first = store_el.attrib.get("addrtype", "1") == "0"
            else:
                # Fallback: some XDFs put everything on XDFCHECKSUM directly
                algorithm = _map_algorithm(elem.attrib.get("algorithm", "0x3"))
                for attr_start in ("start", "startaddress", "rangestart"):
                    if attr_start in elem.attrib:
                        data_start = _parse_int(elem.attrib[attr_start]) + base_offset
                        break
                for attr_end in ("end", "endaddress", "rangeend"):
                    if attr_end in elem.attrib:
                        data_end = _parse_int(elem.attrib[attr_end]) + base_offset
                        break
                for attr_store in ("store", "storeaddress", "checkaddress"):
                    if attr_store in elem.attrib:
                        store_address = _parse_int(elem.attrib[attr_store]) + base_offset
                        break
                store_size = _parse_int(elem.attrib.get("size", elem.attrib.get("storesize", "2")))

            if data_start == 0 and data_end == 0:
                continue  # could not determine a valid range — skip

            blocks.append(XDFChecksumBlock(
                unique_id=uid,
                title=title,
                algorithm=algorithm,
                data_start=data_start,
                data_end=data_end,
                store_address=store_address,
                store_size=store_size,
                lsb_first=lsb_first,
            ))
        except Exception:
            continue  # skip any block we cannot parse cleanly

    return blocks


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

    checksums = _parse_checksum_blocks(root, base_offset)
    return XDFFile(header=header, tables=tables, constants=constants, checksums=checksums)
