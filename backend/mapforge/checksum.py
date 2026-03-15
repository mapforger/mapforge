"""
Checksum detection and correction.

ECU binaries often have one or more checksum blocks that must be recomputed
after any modification. This module provides:

  1. Known checksum algorithms (simple sum, CRC8/16/32, Bosch-specific)
  2. A ChecksumBlock descriptor that points to:
       - The data region to checksum
       - The location in the binary where the checksum is stored
  3. Auto-detection (heuristic) and correction utilities

NOTE: Checksum algorithms are highly ECU-specific. This initial version
implements the most common ones. New algorithms can be registered via
register_algorithm().
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Callable, Optional


# ---------------------------------------------------------------------------
# Algorithm registry
# ---------------------------------------------------------------------------

ChecksumFn = Callable[[bytes], int]
_ALGORITHMS: dict[str, ChecksumFn] = {}


def register_algorithm(name: str, fn: ChecksumFn) -> None:
    _ALGORITHMS[name] = fn


def get_algorithm(name: str) -> Optional[ChecksumFn]:
    return _ALGORITHMS.get(name)


def list_algorithms() -> list[str]:
    return list(_ALGORITHMS.keys())


# ---------------------------------------------------------------------------
# Built-in algorithms
# ---------------------------------------------------------------------------

def _sum8(data: bytes) -> int:
    return sum(data) & 0xFF

def _sum16_be(data: bytes) -> int:
    return sum(data) & 0xFFFF

def _xor8(data: bytes) -> int:
    result = 0
    for b in data:
        result ^= b
    return result

def _crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc <<= 1
        crc &= 0xFFFF
    return crc

def _crc32(data: bytes) -> int:
    import binascii
    return binascii.crc32(data) & 0xFFFFFFFF

def _bosch_edc16_sum(data: bytes) -> int:
    """
    Bosch EDC16 uses a simple 32-bit additive checksum over specific regions.
    The actual implementation is ECU-variant specific; this is the common form.
    """
    result = 0
    for i in range(0, len(data) - 1, 2):
        word = struct.unpack_from(">H", data, i)[0]
        result = (result + word) & 0xFFFFFFFF
    return result


register_algorithm("sum8", _sum8)
register_algorithm("sum16_be", _sum16_be)
register_algorithm("xor8", _xor8)
register_algorithm("crc16_ccitt", _crc16_ccitt)
register_algorithm("crc32", _crc32)
register_algorithm("bosch_edc16_sum", _bosch_edc16_sum)


# ---------------------------------------------------------------------------
# ChecksumBlock descriptor
# ---------------------------------------------------------------------------

@dataclass
class ChecksumBlock:
    """
    Describes a single checksum entry in an ECU binary.

    data_start / data_end : the region over which the checksum is computed
    store_address         : where the checksum value is stored in the binary
    store_size            : size of the stored checksum in bytes (1, 2, or 4)
    algorithm             : name of the algorithm to use
    store_lsb_first       : byte order of the stored value
    """
    data_start: int
    data_end: int
    store_address: int
    store_size: int
    algorithm: str
    store_lsb_first: bool = False
    label: str = ""


# ---------------------------------------------------------------------------
# Read / Verify / Correct
# ---------------------------------------------------------------------------

class ChecksumError(Exception):
    pass


def read_stored(data: bytes, block: ChecksumBlock) -> int:
    """Read the currently stored checksum value from the binary."""
    end = block.store_address + block.store_size
    if end > len(data):
        raise ChecksumError(f"Checksum store address 0x{block.store_address:X} out of bounds")
    raw = data[block.store_address:end]
    byteorder = "little" if block.store_lsb_first else "big"
    return int.from_bytes(raw, byteorder=byteorder)


def compute(data: bytes, block: ChecksumBlock) -> int:
    """Compute the expected checksum over the data region."""
    fn = get_algorithm(block.algorithm)
    if fn is None:
        raise ChecksumError(f"Unknown checksum algorithm: '{block.algorithm}'")
    region = data[block.data_start:block.data_end]
    if len(region) != block.data_end - block.data_start:
        raise ChecksumError(
            f"Data region 0x{block.data_start:X}-0x{block.data_end:X} out of bounds "
            f"(file size: {len(data)})"
        )
    return fn(region)


def verify(data: bytes, block: ChecksumBlock) -> tuple[bool, int, int]:
    """
    Verify a checksum block.

    Returns:
        (is_valid, stored_value, computed_value)
    """
    stored = read_stored(data, block)
    computed = compute(data, block)
    return stored == computed, stored, computed


def correct(buf: bytearray, block: ChecksumBlock) -> int:
    """
    Recompute and write the correct checksum into the buffer.

    Returns the new checksum value.
    """
    computed = compute(bytes(buf), block)
    byteorder = "little" if block.store_lsb_first else "big"
    new_bytes = computed.to_bytes(block.store_size, byteorder=byteorder)

    end = block.store_address + block.store_size
    if end > len(buf):
        raise ChecksumError(f"Checksum store address 0x{block.store_address:X} out of bounds")

    buf[block.store_address:end] = new_bytes
    return computed


def verify_all(data: bytes, blocks: list[ChecksumBlock]) -> list[dict]:
    """Verify a list of checksum blocks. Returns a status report."""
    results = []
    for block in blocks:
        try:
            valid, stored, computed = verify(data, block)
            results.append({
                "label": block.label or f"0x{block.store_address:X}",
                "algorithm": block.algorithm,
                "store_address": f"0x{block.store_address:X}",
                "valid": valid,
                "stored": f"0x{stored:X}",
                "computed": f"0x{computed:X}",
            })
        except ChecksumError as e:
            results.append({
                "label": block.label or f"0x{block.store_address:X}",
                "algorithm": block.algorithm,
                "store_address": f"0x{block.store_address:X}",
                "valid": False,
                "error": str(e),
            })
    return results


def correct_all(buf: bytearray, blocks: list[ChecksumBlock]) -> list[dict]:
    """Recompute and correct all checksum blocks in-place."""
    results = []
    for block in blocks:
        try:
            new_val = correct(buf, block)
            results.append({
                "label": block.label or f"0x{block.store_address:X}",
                "corrected": True,
                "new_value": f"0x{new_val:X}",
            })
        except ChecksumError as e:
            results.append({
                "label": block.label or f"0x{block.store_address:X}",
                "corrected": False,
                "error": str(e),
            })
    return results
