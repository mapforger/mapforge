"""
Binary reader — extracts values from an ECU .bin file using XDF definitions.

For a given table or constant, reads raw bytes from the binary at the
address specified by EmbeddedData, then applies the MATH conversion.
"""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Union

from .xdf_parser import XDFFile, XDFTable, XDFConstant, EmbeddedData, Axis
from .math_eval import raw_to_phys


class BinReadError(Exception):
    pass


def _read_element(data: bytes, address: int, element_size: int, signed: bool, lsb_first: bool) -> int:
    """Read a single integer element from the binary buffer."""
    end = address + element_size
    if end > len(data):
        raise BinReadError(
            f"Address 0x{address:X} + {element_size} bytes out of bounds "
            f"(file size: {len(data)} bytes)"
        )

    raw_bytes = data[address:end]

    # Byte order
    byteorder: str = "little" if lsb_first else "big"
    return int.from_bytes(raw_bytes, byteorder=byteorder, signed=signed)


def _read_axis_values(data: bytes, axis: Axis) -> list[float]:
    """Read all values for a given axis from the binary."""
    if axis.embedded is None:
        # Static labels or no embedded data — return indices
        if axis.labels:
            # Try parsing labels as numbers, fallback to index
            result = []
            for i, label in enumerate(axis.labels):
                try:
                    result.append(float(label))
                except ValueError:
                    result.append(float(i))
            return result
        return [float(i) for i in range(axis.count)]

    emb = axis.embedded
    values: list[float] = []

    for i in range(axis.count):
        if emb.minor_stride > 0:
            # Elements are not packed — stride in bits
            bit_offset = i * emb.minor_stride
            byte_offset = emb.address + bit_offset // 8
        else:
            byte_offset = emb.address + i * emb.element_size

        raw = _read_element(data, byte_offset, emb.element_size, emb.signed, emb.lsb_first)
        values.append(raw_to_phys(axis.math_equation, raw))

    return values


def read_table(data: bytes, table: XDFTable) -> dict:
    """
    Read all values for a table and return a structured dict:
    {
        "id": "0x1234",
        "title": "Fuel Map",
        "x_axis": {"units": "RPM",   "values": [800, 1200, ...]},
        "y_axis": {"units": "Load",  "values": [20, 40, ...]},   # None for 1D
        "z_values": [[...], [...], ...],  # rows × cols matrix
        "z_units": "mg/stroke",
    }
    """
    axes = table.axes

    x_axis = axes.get("x")
    y_axis = axes.get("y")
    z_axis = axes.get("z")

    if z_axis is None:
        raise BinReadError(f"Table '{table.title}' has no Z axis (data axis)")

    x_values = _read_axis_values(data, x_axis) if x_axis else []
    y_values = _read_axis_values(data, y_axis) if y_axis else []

    # Z values: stored as a flat array, row-major (y varies slowest)
    rows = table.rows
    cols = table.cols

    emb = z_axis.embedded
    if emb is None:
        raise BinReadError(f"Table '{table.title}' Z axis has no embedded data")

    z_flat: list[float] = []
    for i in range(rows * cols):
        if emb.major_stride > 0 and emb.minor_stride > 0:
            row = i // cols
            col = i % cols
            bit_offset = row * emb.major_stride + col * emb.minor_stride
            byte_offset = emb.address + bit_offset // 8
        elif emb.major_stride > 0:
            row = i // cols
            col = i % cols
            byte_offset = emb.address + row * (emb.major_stride // 8) + col * emb.element_size
        else:
            byte_offset = emb.address + i * emb.element_size

        raw = _read_element(data, byte_offset, emb.element_size, emb.signed, emb.lsb_first)
        z_flat.append(raw_to_phys(z_axis.math_equation, raw))

    # Reshape to matrix [rows][cols]
    if rows == 1:
        z_matrix = [z_flat]
    else:
        z_matrix = [z_flat[r * cols:(r + 1) * cols] for r in range(rows)]

    return {
        "id": table.unique_id,
        "title": table.title,
        "description": table.description,
        "category": table.category,
        "is_3d": table.is_3d,
        "x_axis": {
            "units": x_axis.units if x_axis else "",
            "values": x_values,
        },
        "y_axis": {
            "units": y_axis.units if y_axis else "",
            "values": y_values,
        } if y_axis and table.is_3d else None,
        "z_values": z_matrix,
        "z_units": z_axis.units,
    }


def read_constant(data: bytes, constant: XDFConstant) -> dict:
    """Read a scalar constant value."""
    if constant.embedded is None:
        raise BinReadError(f"Constant '{constant.title}' has no embedded data")

    emb = constant.embedded
    raw = _read_element(data, emb.address, emb.element_size, emb.signed, emb.lsb_first)
    phys = raw_to_phys(constant.math_equation, raw)

    return {
        "id": constant.unique_id,
        "title": constant.title,
        "description": constant.description,
        "category": constant.category,
        "value": phys,
        "units": constant.units,
    }


class BinFile:
    """Wraps a binary ECU file for reading and modification."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        if not self.path.exists():
            raise BinReadError(f"Binary file not found: {self.path}")
        self._data = bytearray(self.path.read_bytes())

    @property
    def size(self) -> int:
        return len(self._data)

    @property
    def data(self) -> bytes:
        return bytes(self._data)

    def read_all_tables(self, xdf: XDFFile) -> list[dict]:
        results = []
        for table in xdf.tables:
            try:
                results.append(read_table(self._data, table))
            except BinReadError as e:
                results.append({
                    "id": table.unique_id,
                    "title": table.title,
                    "error": str(e),
                })
        return results

    def read_all_constants(self, xdf: XDFFile) -> list[dict]:
        results = []
        for constant in xdf.constants:
            try:
                results.append(read_constant(self._data, constant))
            except BinReadError as e:
                results.append({
                    "id": constant.unique_id,
                    "title": constant.title,
                    "error": str(e),
                })
        return results
