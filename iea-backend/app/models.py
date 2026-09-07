"""Structured Workbook Model — the deterministic-analysis output shape.

Deliberately mirrors the concept model in docs/iea/ARCHITECTURE.md so that
future analysis layers (Data / Logic / Relationships / Automation / External
Dependencies) can be added as new fields without reshaping what's already
here. V0.1 only fills in Structure-level facts.
"""

from typing import List, Optional

from pydantic import BaseModel


class SheetOverview(BaseModel):
    name: str
    hidden: bool
    row_count: int
    column_count: int
    column_names: List[str]
    formula_count: int
    row_count_truncated: bool = False
    """True if row/column counts are the sheet's declared dimensions but
    formula scanning was skipped for this sheet because it exceeded the
    cell-scan cap (see analyzer.MAX_CELLS_FOR_FORMULA_SCAN)."""


class WorkbookOverview(BaseModel):
    filename: str
    file_type: str  # "xlsx" | "xlsm"
    sheet_count: int
    sheets: List[SheetOverview]
    total_formula_count: int
    hidden_sheet_count: int
    named_range_count: int
    named_range_names: List[str]
    vba_detected: bool
    warnings: List[str] = []
    """Non-fatal notes about the analysis itself, e.g. a sheet was too large
    to scan for formulas. Not business findings — those come in a later
    (LLM reasoning) layer, not V0.1."""


class AnalyzeError(BaseModel):
    status: str = "error"
    message: str
