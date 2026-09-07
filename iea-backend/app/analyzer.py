"""Deterministic, safe workbook analysis.

Everything here is exact structural fact-extraction — no interpretation, no
business inference. See docs/iea/ARCHITECTURE.md for why this layer is kept
strictly separate from any future LLM reasoning layer.

Security boundary (see docs/iea/ARCHITECTURE.md section on security):
  - VBA is NEVER executed. `keep_vba=True` only makes openpyxl preserve the
    raw vba_archive blob so we can report its *presence* — it does not parse
    or run macro code.
  - No formulas are evaluated (data_only=False, and openpyxl never evaluates
    formulas anyway).
  - External references/links are not followed.
  - Everything happens on an in-memory BytesIO; nothing is written to disk.
"""

import io
import zipfile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from .models import SheetOverview, WorkbookOverview

ALLOWED_EXTENSIONS = {"xlsx", "xlsm"}
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB — generous for spreadsheet-sized files, bounds memory use
ZIP_MAGIC = b"PK\x03\x04"

# xlsx/xlsm are zip containers; a hostile file could claim a small size on
# disk but expand enormously once decompressed ("zip bomb"). Cap the total
# uncompressed size we're willing to read out of the archive.
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # 200 MB

# Scanning every cell of a huge sheet for formulas is the one operation here
# that scales with content rather than file size. Cap it per sheet and report
# the counts we can get cheaply (dimensions) regardless.
MAX_CELLS_FOR_FORMULA_SCAN = 300_000


class UnsafeWorkbookError(ValueError):
    """Raised when the upload fails a safety check before/instead of parsing."""


def validate_upload(filename: str, content: bytes) -> str:
    """Returns the validated file type ("xlsx" | "xlsm"), or raises UnsafeWorkbookError."""
    if not filename or "." not in filename:
        raise UnsafeWorkbookError("Filename has no extension.")

    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsafeWorkbookError(f"Unsupported file type '.{ext}'. Only .xlsx and .xlsm are accepted.")

    if len(content) == 0:
        raise UnsafeWorkbookError("File is empty.")

    if len(content) > MAX_FILE_SIZE_BYTES:
        raise UnsafeWorkbookError(
            f"File exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB size limit."
        )

    if content[:4] != ZIP_MAGIC:
        raise UnsafeWorkbookError(
            "File content does not match a valid .xlsx/.xlsm (zip) structure."
        )

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            bad_entry = zf.testzip()
            if bad_entry is not None:
                raise UnsafeWorkbookError(f"Corrupt archive entry: {bad_entry}")

            total_uncompressed = sum(info.file_size for info in zf.infolist())
            if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                raise UnsafeWorkbookError("Archive expands beyond the allowed size limit.")
    except zipfile.BadZipFile as exc:
        raise UnsafeWorkbookError("File is not a valid zip-based Excel workbook.") from exc

    return ext


def analyze_workbook(filename: str, content: bytes) -> WorkbookOverview:
    file_type = validate_upload(filename, content)

    try:
        wb = load_workbook(
            io.BytesIO(content),
            data_only=False,
            keep_vba=(file_type == "xlsm"),
            read_only=False,
        )
    except InvalidFileException as exc:
        raise UnsafeWorkbookError(f"Could not parse workbook: {exc}") from exc
    except Exception as exc:  # openpyxl raises a variety of errors on malformed input
        raise UnsafeWorkbookError(f"Could not parse workbook: {exc}") from exc

    warnings: list[str] = []
    sheets: list[SheetOverview] = []

    for ws in wb.worksheets:
        max_row = ws.max_row or 0
        max_col = ws.max_column or 0
        column_names = _read_header_row(ws, max_col)

        cell_count = max_row * max_col
        if cell_count > MAX_CELLS_FOR_FORMULA_SCAN:
            formula_count = 0
            truncated = True
            warnings.append(
                f"Sheet '{ws.title}' has {cell_count:,} cells — formula scan skipped "
                f"(cap: {MAX_CELLS_FOR_FORMULA_SCAN:,})."
            )
        else:
            formula_count = _count_formulas(ws)
            truncated = False

        sheets.append(
            SheetOverview(
                name=ws.title,
                hidden=ws.sheet_state != "visible",
                row_count=max_row,
                column_count=max_col,
                column_names=column_names,
                formula_count=formula_count,
                row_count_truncated=truncated,
            )
        )

    named_range_names = sorted(wb.defined_names.keys())
    vba_detected = getattr(wb, "vba_archive", None) is not None

    return WorkbookOverview(
        filename=filename,
        file_type=file_type,
        sheet_count=len(sheets),
        sheets=sheets,
        total_formula_count=sum(s.formula_count for s in sheets),
        hidden_sheet_count=sum(1 for s in sheets if s.hidden),
        named_range_count=len(named_range_names),
        named_range_names=named_range_names,
        vba_detected=vba_detected,
        warnings=warnings,
    )


def _read_header_row(ws, max_col: int) -> list[str]:
    if ws.max_row == 0 or max_col == 0:
        return []
    header_cells = next(ws.iter_rows(min_row=1, max_row=1, max_col=max_col), ())
    return [str(cell.value) if cell.value is not None else "" for cell in header_cells]


def _count_formulas(ws) -> int:
    count = 0
    for row in ws.iter_rows():
        for cell in row:
            if cell.data_type == "f":
                count += 1
    return count
