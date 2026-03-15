"""
Binary writer — writes modified values back into a binary ECU dump.

Key design decisions:
- Modifications are stored in a dict keyed by address → deduplication
- A cell written multiple times: original_bytes stays from first write,
  new_bytes reflects the latest value
- If a cell is reverted to its original value, the modification is removed
- Only cells whose bytes actually change are recorded
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .xdf_parser import XDFTable, XDFConstant
from .math_eval import phys_to_raw, raw_to_phys
from .bin_reader import BinReadError, _read_element


class BinWriteError(Exception):
    pass


@dataclass
class Modification:
    address: int
    original_bytes: bytes
    new_bytes: bytes
    description: str
    # Structured info for frontend navigation
    table_id: str = ""
    table_title: str = ""
    row: int = -1
    col: int = -1
    original_phys: Optional[float] = None
    new_phys: Optional[float] = None
    units: str = ""


def _write_element(
    buf: bytearray,
    address: int,
    element_size: int,
    value: int,
    lsb_first: bool,
) -> bytes:
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
    def __init__(self, data: bytes):
        self._buf = bytearray(data)
        self._original = bytes(data)
        # Keyed by address — deduplicates multiple writes to same cell
        self._mods: dict[int, Modification] = {}

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
    def modifications(self) -> list[Modification]:
        return list(self._mods.values())

    @property
    def is_modified(self) -> bool:
        return bool(self._mods)

    def _record(
        self,
        address: int,
        original: bytes,
        new_bytes: bytes,
        description: str,
        table_id: str = "",
        table_title: str = "",
        row: int = -1,
        col: int = -1,
        original_phys: Optional[float] = None,
        new_phys: Optional[float] = None,
        units: str = "",
    ) -> None:
        """Record a modification with deduplication and revert detection."""
        if original == new_bytes:
            return  # No actual change

        if address in self._mods:
            existing = self._mods[address]
            if existing.original_bytes == new_bytes:
                # Reverted to original value — remove modification
                del self._mods[address]
            else:
                # Update: keep original_bytes from first write
                self._mods[address] = Modification(
                    address=address,
                    original_bytes=existing.original_bytes,
                    new_bytes=new_bytes,
                    description=description,
                    table_id=table_id,
                    table_title=table_title,
                    row=row,
                    col=col,
                    original_phys=existing.original_phys,
                    new_phys=new_phys,
                    units=units,
                )
        else:
            self._mods[address] = Modification(
                address=address,
                original_bytes=original,
                new_bytes=new_bytes,
                description=description,
                table_id=table_id,
                table_title=table_title,
                row=row,
                col=col,
                original_phys=original_phys,
                new_phys=new_phys,
                units=units,
            )

    def write_table_value(self, table: XDFTable, row: int, col: int, phys_value: float) -> None:
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
        max_val = (1 << (emb.element_size * 8)) - 1 if not emb.signed else (1 << (emb.element_size * 8 - 1)) - 1
        min_val = -(1 << (emb.element_size * 8 - 1)) if emb.signed else 0
        raw_int = max(min_val, min(max_val, raw_int))

        original = _write_element(self._buf, byte_offset, emb.element_size, raw_int, emb.lsb_first)
        new_bytes = bytes(self._buf[byte_offset:byte_offset + emb.element_size])

        # Compute original physical value for readable diff
        orig_raw = int.from_bytes(original, byteorder="little" if emb.lsb_first else "big", signed=emb.signed)
        original_phys = raw_to_phys(z_axis.math_equation, orig_raw)

        self._record(
            address=byte_offset,
            original=original,
            new_bytes=new_bytes,
            description=f"{table.title} [{row},{col}]",
            table_id=table.unique_id,
            table_title=table.title,
            row=row,
            col=col,
            original_phys=round(original_phys, 6),
            new_phys=round(phys_value, 6),
            units=z_axis.units,
        )

    def write_table_row(self, table: XDFTable, row: int, phys_values: list[float]) -> None:
        for col, val in enumerate(phys_values):
            self.write_table_value(table, row, col, val)

    def write_table_all(self, table: XDFTable, phys_matrix: list[list[float]]) -> None:
        for row, row_values in enumerate(phys_matrix):
            self.write_table_row(table, row, row_values)

    def write_constant(self, constant: XDFConstant, phys_value: float) -> None:
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
        new_bytes = bytes(self._buf[emb.address:emb.address + emb.element_size])

        orig_raw = int.from_bytes(original, byteorder="little" if emb.lsb_first else "big", signed=emb.signed)
        original_phys = raw_to_phys(constant.math_equation, orig_raw)

        self._record(
            address=emb.address,
            original=original,
            new_bytes=new_bytes,
            description=f"{constant.title}",
            table_id="",
            table_title=constant.title,
            row=-1,
            col=-1,
            original_phys=round(original_phys, 6),
            new_phys=round(phys_value, 6),
            units=constant.units,
        )

    def get_diff(self) -> list[dict]:
        return [
            {
                "address": f"0x{m.address:X}",
                "original_hex": m.original_bytes.hex(),
                "modified_hex": m.new_bytes.hex(),
                "description": m.description,
                "table_id": m.table_id,
                "table_title": m.table_title,
                "row": m.row,
                "col": m.col,
                "original_phys": m.original_phys,
                "new_phys": m.new_phys,
                "units": m.units,
            }
            for m in self._mods.values()
        ]

    def save(self, path: str | Path) -> None:
        Path(path).write_bytes(self._buf)
