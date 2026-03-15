"""Tests for the checksum module."""

import struct
import pytest
from backend.mapforge.checksum import (
    ChecksumBlock, compute, verify, correct, verify_all, correct_all,
    list_algorithms, ChecksumError
)


def make_buf_with_sum8(data_region: bytes, store_offset: int) -> bytearray:
    """Build a buffer where store_offset holds the correct sum8 of data_region."""
    buf = bytearray(store_offset + 1 + len(data_region))
    buf[0:len(data_region)] = data_region
    buf[store_offset] = sum(data_region) & 0xFF
    return buf


def test_list_algorithms_contains_builtins():
    algos = list_algorithms()
    for name in ("sum8", "sum16_be", "xor8", "crc16_ccitt", "crc32"):
        assert name in algos


def test_compute_sum8():
    data = bytes([0x01, 0x02, 0x03, 0x04])
    block = ChecksumBlock(
        data_start=0, data_end=4,
        store_address=4, store_size=1,
        algorithm="sum8"
    )
    buf = bytearray(5)
    buf[0:4] = data
    assert compute(bytes(buf), block) == 0x0A


def test_verify_valid_sum8():
    data = bytes([0x10, 0x20, 0x30])
    buf = bytearray(4)
    buf[0:3] = data
    buf[3] = sum(data) & 0xFF
    block = ChecksumBlock(data_start=0, data_end=3, store_address=3, store_size=1, algorithm="sum8")
    valid, stored, computed = verify(bytes(buf), block)
    assert valid
    assert stored == computed


def test_verify_invalid_sum8():
    buf = bytearray([0x01, 0x02, 0x03, 0xFF])  # 0xFF is wrong checksum
    block = ChecksumBlock(data_start=0, data_end=3, store_address=3, store_size=1, algorithm="sum8")
    valid, stored, computed = verify(bytes(buf), block)
    assert not valid
    assert stored == 0xFF
    assert computed == 0x06


def test_correct_sum8():
    buf = bytearray([0xAA, 0xBB, 0xCC, 0x00])  # 0x00 is placeholder
    block = ChecksumBlock(data_start=0, data_end=3, store_address=3, store_size=1, algorithm="sum8")
    new_val = correct(buf, block)
    assert new_val == (0xAA + 0xBB + 0xCC) & 0xFF
    assert buf[3] == new_val
    # Now verify it passes
    valid, _, _ = verify(bytes(buf), block)
    assert valid


def test_crc16_known_value():
    # CRC16-CCITT of empty string should be 0xFFFF
    buf = bytearray(2)
    block = ChecksumBlock(data_start=0, data_end=0, store_address=0, store_size=2, algorithm="crc16_ccitt")
    val = compute(bytes(buf), block)
    assert val == 0xFFFF


def test_verify_all():
    buf = bytearray(10)
    buf[0:4] = [1, 2, 3, 4]
    buf[4] = sum([1, 2, 3, 4]) & 0xFF  # valid
    buf[5:9] = [10, 20, 30, 40]
    buf[9] = 0xFF  # intentionally wrong

    blocks = [
        ChecksumBlock(data_start=0, data_end=4, store_address=4, store_size=1, algorithm="sum8", label="block_a"),
        ChecksumBlock(data_start=5, data_end=9, store_address=9, store_size=1, algorithm="sum8", label="block_b"),
    ]
    results = verify_all(bytes(buf), blocks)
    assert results[0]["valid"] is True
    assert results[1]["valid"] is False
    assert results[0]["label"] == "block_a"


def test_correct_all():
    buf = bytearray(10)
    buf[0:4] = [0xAA, 0xBB, 0xCC, 0xDD]
    buf[4] = 0x00  # wrong
    buf[5:9] = [0x11, 0x22, 0x33, 0x44]
    buf[9] = 0x00  # wrong

    blocks = [
        ChecksumBlock(data_start=0, data_end=4, store_address=4, store_size=1, algorithm="sum8"),
        ChecksumBlock(data_start=5, data_end=9, store_address=9, store_size=1, algorithm="sum8"),
    ]
    correct_all(buf, blocks)

    # Both should now verify
    results = verify_all(bytes(buf), blocks)
    assert all(r["valid"] for r in results)


def test_unknown_algorithm_raises():
    buf = bytearray(4)
    block = ChecksumBlock(data_start=0, data_end=3, store_address=3, store_size=1, algorithm="nonexistent_algo")
    with pytest.raises(ChecksumError, match="Unknown checksum algorithm"):
        compute(bytes(buf), block)


def test_out_of_bounds_raises():
    buf = bytearray(4)
    block = ChecksumBlock(data_start=0, data_end=100, store_address=3, store_size=1, algorithm="sum8")
    with pytest.raises(ChecksumError, match="out of bounds"):
        compute(bytes(buf), block)
