import pytest

from app.analyzer import UnsafeWorkbookError, analyze_workbook, validate_upload


class TestValidateUpload:
    def test_rejects_bad_extension(self, minimal_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError, match="Unsupported file type"):
            validate_upload("data.csv", minimal_xlsx_bytes)

    def test_rejects_no_extension(self, minimal_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError, match="no extension"):
            validate_upload("data", minimal_xlsx_bytes)

    def test_rejects_empty_file(self):
        with pytest.raises(UnsafeWorkbookError, match="empty"):
            validate_upload("data.xlsx", b"")

    def test_rejects_oversized_file(self, minimal_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError, match="size limit"):
            validate_upload("data.xlsx", b"PK\x03\x04" + b"0" * (16 * 1024 * 1024))

    def test_rejects_non_zip_content(self, not_a_zip_bytes):
        with pytest.raises(UnsafeWorkbookError, match="zip"):
            validate_upload("data.xlsx", not_a_zip_bytes)

    def test_rejects_malformed_zip(self, malformed_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError):
            validate_upload("data.xlsx", malformed_xlsx_bytes)

    def test_rejects_mime_extension_mismatch_via_magic_bytes(self):
        # A .xlsx extension on content that isn't actually zip-based.
        with pytest.raises(UnsafeWorkbookError):
            validate_upload("fake.xlsx", b"%PDF-1.4 not an excel file at all")

    def test_rejects_zip_bomb_like_archive(self, zip_bomb_like_bytes):
        with pytest.raises(UnsafeWorkbookError, match="expands beyond"):
            validate_upload("bomb.xlsx", zip_bomb_like_bytes)

    def test_accepts_valid_xlsx(self, minimal_xlsx_bytes):
        assert validate_upload("data.xlsx", minimal_xlsx_bytes) == "xlsx"

    def test_accepts_valid_xlsm_extension(self, synthetic_xlsm_bytes):
        assert validate_upload("data.xlsm", synthetic_xlsm_bytes) == "xlsm"


class TestAnalyzeWorkbook:
    def test_valid_xlsx_basic_overview(self, minimal_xlsx_bytes):
        result = analyze_workbook("data.xlsx", minimal_xlsx_bytes)
        assert result.file_type == "xlsx"
        assert result.sheet_count == 1
        assert result.vba_detected is False

    def test_valid_xlsm_detects_vba(self, synthetic_xlsm_bytes):
        result = analyze_workbook("synthetic_manufacturing_macro.xlsm", synthetic_xlsm_bytes)
        assert result.file_type == "xlsm"
        assert result.vba_detected is True

    def test_xlsx_never_reports_vba(self, minimal_xlsx_bytes):
        result = analyze_workbook("data.xlsx", minimal_xlsx_bytes)
        assert result.vba_detected is False

    def test_multiple_worksheets(self, synthetic_xlsx_bytes):
        result = analyze_workbook("synthetic_manufacturing.xlsx", synthetic_xlsx_bytes)
        names = {s.name for s in result.sheets}
        assert {"Suppliers", "Parts", "Inspections"}.issubset(names)
        assert result.sheet_count == len(result.sheets)

    def test_empty_worksheet(self, empty_worksheet_bytes):
        result = analyze_workbook("empty.xlsx", empty_worksheet_bytes)
        assert result.sheets[0].row_count == 1  # openpyxl reports 1x1 min dimensions for a blank sheet
        assert result.sheets[0].column_names == [""] or result.sheets[0].column_names == []

    def test_hidden_worksheet_detected(self, workbook_with_hidden_sheet_bytes):
        result = analyze_workbook("hidden.xlsx", workbook_with_hidden_sheet_bytes)
        hidden_sheets = [s for s in result.sheets if s.hidden]
        assert len(hidden_sheets) == 1
        assert hidden_sheets[0].name == "Hidden"
        assert result.hidden_sheet_count == 1

    def test_formula_count(self, workbook_with_formulas_bytes):
        result = analyze_workbook("formulas.xlsx", workbook_with_formulas_bytes)
        assert result.total_formula_count == 2

    def test_named_range_detected(self, workbook_with_named_range_bytes):
        result = analyze_workbook("named.xlsx", workbook_with_named_range_bytes)
        assert result.named_range_count == 1
        assert "MyRange" in result.named_range_names

    def test_synthetic_sample_has_expected_shape(self, synthetic_xlsx_bytes):
        result = analyze_workbook("synthetic_manufacturing.xlsx", synthetic_xlsx_bytes)
        inspections = next(s for s in result.sheets if s.name == "Inspections")
        assert inspections.formula_count == 4
        scratch = next(s for s in result.sheets if s.name == "_ScratchCalc")
        assert scratch.hidden is True
        assert result.named_range_count == 1

    def test_rejects_invalid_extension_end_to_end(self, minimal_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError):
            analyze_workbook("data.txt", minimal_xlsx_bytes)

    def test_rejects_malformed_workbook_end_to_end(self, malformed_xlsx_bytes):
        with pytest.raises(UnsafeWorkbookError):
            analyze_workbook("data.xlsx", malformed_xlsx_bytes)
