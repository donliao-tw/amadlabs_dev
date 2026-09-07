"""Generates a SYNTHETIC .xlsm fixture with a VBA project marker.

We don't hand-author a real, executable VBA project (out of scope and not
needed) — we only need a workbook that legitimately carries an
`xl/vbaProject.bin` archive entry and macro-enabled content type, matching
what a real .xlsm produced by Excel looks like structurally, so the
detector's "VBA present" check (openpyxl's vba_archive, populated purely
from the zip entry — never parsed or executed) has something real to find.

Run with: python samples/generate_sample_xlsm.py
"""

import shutil
import zipfile
from pathlib import Path

from openpyxl import Workbook

SRC_XLSX = Path(__file__).parent / "_tmp_base_for_xlsm.xlsx"
OUT_PATH = Path(__file__).parent / "synthetic_manufacturing_macro.xlsm"

CONTENT_TYPES_MACRO = (
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
)


def build_base_workbook() -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Production"
    ws.append(["OrderID", "PartNo", "Qty", "Status"])
    ws.append(["ORD-001", "P-1001", 500, "=IF(C2>0,\"OPEN\",\"CLOSED\") (SYNTHETIC)"])
    wb.save(SRC_XLSX)


def convert_to_macro_enabled() -> None:
    shutil.copyfile(SRC_XLSX, OUT_PATH)

    with zipfile.ZipFile(SRC_XLSX) as src:
        entries = {name: src.read(name) for name in src.namelist()}

    content_types = entries["[Content_Types].xml"].decode("utf-8")
    content_types = content_types.replace(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
        CONTENT_TYPES_MACRO,
    )
    content_types = content_types.replace(
        "</Types>",
        '<Override PartName="/xl/vbaProject.bin" '
        'ContentType="application/vnd.ms-office.vbaProject"/></Types>',
    )
    entries["[Content_Types].xml"] = content_types.encode("utf-8")

    # Placeholder bytes only — never parsed as a real OLE/VBA binary by this
    # project. It exists solely so the zip entry is present for detection.
    entries["xl/vbaProject.bin"] = b"SYNTHETIC-PLACEHOLDER-NOT-A-REAL-VBA-PROJECT"

    with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED) as out:
        for name, data in entries.items():
            out.writestr(name, data)

    SRC_XLSX.unlink()


if __name__ == "__main__":
    build_base_workbook()
    convert_to_macro_enabled()
    print(f"Wrote {OUT_PATH}")
