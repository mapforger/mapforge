"""
Binary writer — writes modified values back into a binary ECU dump.

Operates on a mutable bytearray copy of the original binary.
All modifications are tracked so the caller can compute a diff.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Union

from .xdf_parser import XDFTable, XDFConstant, EmbeddedData, Axis
from .math_eval import phys_to_raw
from .bin_reader import BinReadError, _read_element


class BinWriteError(Exception):
    pass


@dataclass
class Modification:
    """Records a single write operation for diff/audit purposes."""
    address: int
    original_bytes: bytes
    new_bytes: bytes
    description: str


def _write_element(
    buf: bytearray,
    address: int,
    element_size: int,
    value: int,
    lsb_first: bool,
) -> bytes:
    """Write a single integer element into the buffer. Returns original bytes."""
    end = address + element_size
    if end > len(buf):
        raise BinWriteError(
            f"Address 0x{address:X} + {element_size} bytes out of bounds "
            f"(buffer size: {len(buf)} bytes)"
        )

    original = bytes(buf[address:end])
    byteorder = "little" if lsb_first else "big"
    new_bytes = value.to_bytes(element_size, byteorder=byteorder, signed=(value < 0))
    buf[address:end] = new_bytes
    return original


class BinEditor:
    """
    Wraps a binary buffer and allows modifying table/constant values.

    Usage:
        editor = BinEditor.from_file("ecu.bin")
        editor.write_table_value(table, row=2, col=5, phys_value=14.5)
        editor.save("ecu_modified.bin")
    """

    def __init__(self, data: bytes):
        self._buf = bytearray(data)
        self._original = bytes(data)
        self.modifications: list[Modification] = []

    @classmethod
    def from_file(cls, path: str | Path) -> "BinEditor":
        path = Path(path)
        if not path.exists():
            raise BinWriteError(f"File not found: {path}")
        return cls(path.read_bytes())

    @property
    def data(self) -> bytes:
        return bytes(self._buf)

    @property
    def is_modified(self) -> bool:
        return self._buf != bytearray(self._original)

    def write_table_value(
        self,
        table: XDFTable,
        row: int,
        col: int,
        phys_value: float,
    ) -> None:
        """
        Write a single physical value into the Z (data) axis of a table.

        row: 0-based row index (Y axis direction)
        col: 0-based column index (X axis direction)
        """
        z_axis = table.axes.get("z")
        if z_axis is None:
            raise BinWriteError(f"Table '{table.title}' has no Z axis")
        if z_axis.embedded is None:
            raise BinWriteError(f"Table '{table.title}' Z axis has no embedded data")

        rows = table.rows
        cols = table.cols

        if row < 0 or row >= rows:
            raise BinWriteError(f"Row {row} out of bounds (table has {rows} rows)")
        if col < 0 or col >= cols:
            raise BinWriteError(f"Col {col} out of bounds (table has {cols} cols)")

        emb = z_axis.embedded
        flat_index = row * cols + col

        if emb.major_stride > 0 and emb.minor_stride > 0:
            bit_offset = row * emb.major_stride + col * emb.minor_stride
            byte_offset = emb.address + bit_offset // 8
        elif emb.major_stride > 0:
            byte_offset = emb.address + row * (emb.major_stride // 8) + col * emb.element_size
        else:
            byte_offset = emb.address + flat_index * emb.element_size

        try:
            raw_float = phys_to_raw(z_axis.math_equation, phys_value)
        except NotImplementedError as e:
            raise BinWriteError(str(e)) from e

        raw_int = int(round(raw_float))

        # Clamp to valid range for element_size
        max_val = (1 << (emb.element_size * 8)) - 1 if not emb.signed else (1 << (emb.element_size * 8 - 1)) - 1
        min_val = -(1 << (emb.element_size * 8 - 1)) if emb.signed else 0
        raw_int = max(min_val, min(max_val, raw_int))

        original = _write_element(self._buf, byte_offset, emb.element_size, raw_int, emb.lsb_first)
        self.modifications.append(Modification(
            address=byte_offset,
            original_bytes=original,
            new_bytes=bytes(self._buf[byte_offset:byte_offset + emb.element_size]),
            description=f"{table.title}[{row},{col}] = {phys_value} {z_axis.units}",
        ))

    def write_table_row(self, table: XDFTable, row: int, phys_values: list[float]) -> None:
        """Write a full row of physical values."""
        for col, val in enumerate(phys_values):
            self.write_table_value(table, row, col, val)

    def write_table_all(self, table: XDFTable, phys_matrix: list[list[float]]) -> None:
        """Write all values of a table (matrix of physical values)."""
        for row, row_values in enumerate(phys_matrix):
            self.write_table_row(table, row, row_values)

    def write_constant(self, constant: XDFConstant, phys_value: float) -> None:
        """Write a scalar constant value."""
        if constant.embedded is None:
            raise BinWriteError(f"Constant '{constant.title}' has no embedded data")

        emb = constant.embedded

        try:
            raw_float = phys_to_raw(constant.math_equation, phys_value)
        except NotImplementedError as e:
            raise BinWriteError(str(e)) from e

        raw_int = int(round(raw_float))

        max_val = (1 << (emb.element_size * 8)) - 1 if not emb.signed else (1 << (emb.element_size * 8 - 1)) - 1
        min_val = -(1 << (emb.element_size * 8 - 1)) if emb.signed else 0
        raw_int = max(min_val, min(max_val, raw_int))

        original = _write_element(self._buf, emb.address, emb.element_size, raw_int, emb.lsb_first)
        self.modifications.append(Modification(
            address=emb.address,
            original_bytes=original,
            new_bytes=bytes(self._buf[emb.address:emb.address + emb.element_size]),
            description=f"{constant.title} = {phys_value} {constant.units}",
        ))

    def get_diff(self) -> list[dict]:
        """Return a list of all modifications as serialisable dicts."""
        return [
            {
                "address": f"0x{m.address:X}",
                "original": m.original_bytes.hex(),
                "modified": m.new_bytes.hex(),
                "description": m.description,
            }
            for m in self.modifications
        ]

    def save(self, path: str | Path) -> None:
        """Write the modified binary to disk."""
        Path(path).write_bytes(self._buf)
