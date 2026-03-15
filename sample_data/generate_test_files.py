"""
Generates a synthetic ECU binary + matching XDF for UI testing.
Simulates a Bosch EDC16-style diesel ECU with realistic map names.
Run: python sample_data/generate_test_files.py
"""

import struct
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path

# ---------------------------------------------------------------------------
# Binary layout — we decide where everything lives
# ---------------------------------------------------------------------------
BIN_SIZE = 0x10000  # 64 KB

# Tables: (address, rows, cols, base_value, scale)
MAPS = {
    "fuel_main":       (0x1000, 16, 16, 40,  0.5),
    "fuel_idle":       (0x1200, 8,  8,  15,  0.3),
    "injection_start": (0x1400, 16, 16, 10,  0.1),
    "boost_target":    (0x1800, 8,  12, 120, 0.5),
    "egr_map":         (0x1C00, 8,  8,  30,  0.4),
    "rail_pressure":   (0x2000, 16, 16, 800, 2.0),
    "torque_limit":    (0x2400, 8,  12, 180, 1.0),
    "smoke_limiter":   (0x2800, 8,  16, 60,  0.5),
}

# Axis breakpoints: (address, count, start, step, scale_equation)
AXES = {
    "rpm_16":  (0x0100, 16, 800,  200,  10),   # 800..3800 RPM → raw = RPM/10
    "rpm_8":   (0x0120, 8,  800,  400,  10),   # 800..3600 RPM
    "rpm_12":  (0x0140, 12, 800,  267,  10),
    "load_16": (0x0160, 16, 10,   20,   1),    # 10..310 mg
    "load_8":  (0x0180, 8,  10,   40,   1),
    "load_12": (0x01A0, 12, 10,   30,   1),
    "temp_8":  (0x01C0, 8,  -20,  20,   1),    # -20..120°C
}

# Constants: (address, raw_value)
CONSTANTS = {
    "rev_limiter":     (0x0300, 450),   # × 10 → 4500 RPM
    "idle_target":     (0x0302, 85),    # × 10 → 850 RPM
    "boost_max":       (0x0304, 180),   # × 1  → 180 kPa
    "rail_pressure_idle": (0x0306, 250),# × 2  → 500 bar
    "smoke_limit":     (0x0308, 60),    # × 1  → 60 mm³
    "egr_temp_limit":  (0x030A, 65),    # + 20 → 85°C
}

buf = bytearray(BIN_SIZE)

def write_u16be(buf, addr, val):
    val = max(0, min(0xFFFF, int(val)))
    struct.pack_into(">H", buf, addr, val)

# Write axes
for name, (addr, count, start, step, scale) in AXES.items():
    for i in range(count):
        raw = (start + i * step) // scale if scale > 1 else start + i * step
        write_u16be(buf, addr + i * 2, raw)

# Write map Z values
import math
for name, (addr, rows, cols, base, noise_scale) in MAPS.items():
    for r in range(rows):
        for c in range(cols):
            # Realistic-looking values with a curve shape
            val = base + c * 2 + r * 1.5 + math.sin(c * 0.4 + r * 0.3) * base * 0.15
            raw = int(val / noise_scale)
            write_u16be(buf, addr + (r * cols + c) * 2, raw)

# Write constants
for name, (addr, raw) in CONSTANTS.items():
    write_u16be(buf, addr, raw)

# Byte-sum checksum at 0xFF00 over range 0x0000–0xFEFF (matches sum16_be algorithm)
chk = sum(buf[:0xFF00]) & 0xFFFF
write_u16be(buf, 0xFF00, chk)

Path("sample_data/test_ecu.bin").write_bytes(buf)
print(f"Written: sample_data/test_ecu.bin ({len(buf)//1024} KB)")

# ---------------------------------------------------------------------------
# XDF generation
# ---------------------------------------------------------------------------

def el(parent, tag, **attrib):
    e = ET.SubElement(parent, tag, **attrib)
    return e

def text_el(parent, tag, text):
    e = ET.SubElement(parent, tag)
    e.text = text
    return e

def make_axis(table_el, axis_id, count, units, equation, addr):
    ax = el(table_el, "XDFAXIS", id=axis_id)
    text_el(ax, "indexcount", str(count))
    text_el(ax, "units", units)
    m = el(ax, "MATH", equation=equation)
    el(ax, "EMBEDDEDDATA",
       mmedaddress=f"0x{addr:X}",
       mmedelementsize="2",
       mmedmajorstridebits="0",
       mmedminorstridebits="0")
    return ax

def make_static_axis(table_el, axis_id, count, units, equation, addr):
    return make_axis(table_el, axis_id, count, units, equation, addr)

root = ET.Element("XDFFORMAT", version="1.70")
header = el(root, "XDFHEADER")
text_el(header, "deftitle", "Test EDC16 — Synthetic Definition")
text_el(header, "description", "Synthetic XDF for MapForge UI testing. Simulates a Bosch EDC16-style diesel ECU.")
text_el(header, "author", "MapForge")
el(header, "BASEOFFSET", offset="0", subtract="0")
el(header, "FILESIZE", ).text = str(BIN_SIZE)

# Categories
cats = [
    ("0x0", "Fuelling"),
    ("0x1", "Boost & EGR"),
    ("0x2", "Injection Timing"),
    ("0x4", "Limiters"),
]
for idx, name in cats:
    el(header, "CATEGORY", index=idx, name=name)

uid = 0x1000

def add_table(parent, title, desc, category_index, addr, rows, cols,
              x_addr, x_count, x_units, x_eq,
              y_addr, y_count, y_units, y_eq,
              z_units, z_eq):
    global uid
    t = el(parent, "XDFTABLE", uniqueid=f"0x{uid:X}", flags="0x0", categoryindex=category_index)
    uid += 0x10
    text_el(t, "title", title)
    text_el(t, "description", desc)

    make_axis(t, "x", x_count, x_units, x_eq, x_addr)
    if rows > 1:
        make_axis(t, "y", y_count, y_units, y_eq, y_addr)

    z = el(t, "XDFAXIS", id="z")
    text_el(z, "indexcount", str(rows * cols))
    text_el(z, "units", z_units)
    el(z, "MATH", equation=z_eq)
    el(z, "EMBEDDEDDATA",
       mmedaddress=f"0x{addr:X}",
       mmedelementsize="2",
       mmedmajorstridebits="0",
       mmedminorstridebits="0")
    return t

rpm16_addr,  rpm16_count  = AXES["rpm_16"][:2]
rpm8_addr,   rpm8_count   = AXES["rpm_8"][:2]
rpm12_addr,  rpm12_count  = AXES["rpm_12"][:2]
load16_addr, load16_count = AXES["load_16"][:2]
load8_addr,  load8_count  = AXES["load_8"][:2]
load12_addr, load12_count = AXES["load_12"][:2]
temp8_addr,  temp8_count  = AXES["temp_8"][:2]

# ── Fuelling ────────────────────────────────────────────────────────────────
add_table(root,
    "Main Injection Quantity", "Primary fuelling map — quantity vs RPM and load",
    "0x0", MAPS["fuel_main"][0], 16, 16,
    rpm16_addr,  16, "RPM",  "X*10",
    load16_addr, 16, "mg",   "X",
    "mm³/stroke", "X*0.5")

add_table(root,
    "Idle Injection Quantity", "Fuelling map at idle conditions",
    "0x0", MAPS["fuel_idle"][0], 8, 8,
    rpm8_addr,  8, "RPM", "X*10",
    load8_addr, 8, "mg",  "X",
    "mm³/stroke", "X*0.3")

add_table(root,
    "Rail Pressure Map", "Target common rail pressure vs RPM and load",
    "0x0", MAPS["rail_pressure"][0], 16, 16,
    rpm16_addr,  16, "RPM", "X*10",
    load16_addr, 16, "mg",  "X",
    "bar", "X*2")

add_table(root,
    "Smoke Limiter", "Maximum fuelling limit to prevent smoke",
    "0x0", MAPS["smoke_limiter"][0], 8, 16,
    rpm16_addr, 16, "RPM", "X*10",
    temp8_addr, 8,  "°C",  "X",
    "mm³/stroke", "X*0.5")

add_table(root,
    "Torque Limit Map", "Maximum torque output limit",
    "0x0", MAPS["torque_limit"][0], 8, 12,
    rpm12_addr, 12, "RPM", "X*10",
    load8_addr, 8,  "mg",  "X",
    "Nm", "X")

# ── Boost & EGR ─────────────────────────────────────────────────────────────
add_table(root,
    "Boost Target Map", "Target boost pressure vs RPM and load",
    "0x1", MAPS["boost_target"][0], 8, 12,
    rpm12_addr,  12, "RPM", "X*10",
    load8_addr,  8,  "mg",  "X",
    "kPa", "X*0.5")

add_table(root,
    "EGR Map", "Exhaust Gas Recirculation rate vs RPM and load",
    "0x1", MAPS["egr_map"][0], 8, 8,
    rpm8_addr,  8, "RPM", "X*10",
    load8_addr, 8, "mg",  "X",
    "%", "X*0.4")

# ── Injection Timing ─────────────────────────────────────────────────────────
add_table(root,
    "Injection Start Angle", "Start of injection timing vs RPM and load",
    "0x2", MAPS["injection_start"][0], 16, 16,
    rpm16_addr,  16, "RPM", "X*10",
    load16_addr, 16, "mg",  "X",
    "°BTDC", "X*0.1")

# ── Constants ────────────────────────────────────────────────────────────────
def add_const(parent, title, desc, cat_idx, addr, units, eq):
    global uid
    c = el(parent, "XDFCONSTANT", uniqueid=f"0x{uid:X}", categoryindex=cat_idx)
    uid += 0x10
    text_el(c, "title", title)
    text_el(c, "description", desc)
    text_el(c, "units", units)
    el(c, "MATH", equation=eq)
    el(c, "EMBEDDEDDATA",
       mmedaddress=f"0x{addr:X}",
       mmedelementsize="2",
       mmedmajorstridebits="0",
       mmedminorstridebits="0")

add_const(root, "Rev Limiter", "Maximum engine RPM cut-off", "0x4",
          CONSTANTS["rev_limiter"][0], "RPM", "X*10")
add_const(root, "Idle Target RPM", "Target RPM at idle", "0x4",
          CONSTANTS["idle_target"][0], "RPM", "X*10")
add_const(root, "Maximum Boost", "Absolute boost pressure limit", "0x1",
          CONSTANTS["boost_max"][0], "kPa", "X")
add_const(root, "Idle Rail Pressure", "Rail pressure target at idle", "0x1",
          CONSTANTS["rail_pressure_idle"][0], "bar", "X*2")
add_const(root, "Smoke Limit Scalar", "Global smoke limit scalar", "0x0",
          CONSTANTS["smoke_limit"][0], "mm³", "X")
add_const(root, "EGR Temperature Limit", "Max exhaust temp before EGR closes", "0x1",
          CONSTANTS["egr_temp_limit"][0], "°C", "X+20")

# ── Checksum block ───────────────────────────────────────────────────────────
# Mirrors the checksum written into the binary above:
#   algorithm : sum16_be (byte sum, keep low 16 bits) → TunerPro code 0x2
#   range     : 0x0000 – 0xFF00 (exclusive end → covers 0x0000..0xFEFF)
#   store     : 0xFF00, 2 bytes big-endian
ck = el(root, "XDFCHECKSUM", uniqueid="0xC001", flags="0x0")
text_el(ck, "title", "ROM Checksum")
checksum_el = el(ck, "CHECKSUM", algorithm="0x2", checksumlength="2")
el(checksum_el, "RANGEADDRESS", startaddress="0x0000", endaddress="0xFF00")
el(checksum_el, "STORELOCATION", address="0xFF00", length="2")

# Pretty print XML
xml_str = minidom.parseString(ET.tostring(root, encoding="unicode")).toprettyxml(indent="  ")
# Remove the <?xml ?> declaration line added by toprettyxml
xml_str = "\n".join(xml_str.split("\n")[1:])

Path("sample_data/test_ecu.xdf").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n{xml_str}')
print("Written: sample_data/test_ecu.xdf")
print(f"  {len([l for l in open('sample_data/test_ecu.xdf')])} lines")
print(f"  {sum(1 for _ in root.iter('XDFTABLE'))} tables, {sum(1 for _ in root.iter('XDFCONSTANT'))} constants")
