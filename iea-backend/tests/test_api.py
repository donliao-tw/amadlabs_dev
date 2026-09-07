from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_analyze_valid_xlsx(minimal_xlsx_bytes):
    resp = client.post(
        "/analyze",
        files={"file": ("data.xlsx", minimal_xlsx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["file_type"] == "xlsx"
    assert body["vba_detected"] is False


def test_analyze_valid_xlsm(synthetic_xlsm_bytes):
    resp = client.post(
        "/analyze",
        files={"file": ("macro.xlsm", synthetic_xlsm_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 200
    assert resp.json()["vba_detected"] is True


def test_analyze_rejects_invalid_extension(minimal_xlsx_bytes):
    resp = client.post(
        "/analyze",
        files={"file": ("data.csv", minimal_xlsx_bytes, "text/csv")},
    )
    assert resp.status_code == 400


def test_analyze_rejects_malformed_workbook(malformed_xlsx_bytes):
    resp = client.post(
        "/analyze",
        files={"file": ("data.xlsx", malformed_xlsx_bytes, "application/octet-stream")},
    )
    assert resp.status_code == 400


def test_analyze_rejects_oversized_file():
    oversized = b"PK\x03\x04" + b"0" * (16 * 1024 * 1024)
    resp = client.post(
        "/analyze",
        files={"file": ("big.xlsx", oversized, "application/octet-stream")},
    )
    assert resp.status_code in (400, 413)


def test_analyze_no_file_provided():
    resp = client.post("/analyze")
    assert resp.status_code == 422
