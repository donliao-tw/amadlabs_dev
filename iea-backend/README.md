# iea-backend

Deterministic Excel structure analyzer for the "Industrial Excel AI" demo
page at `amadlabs.com/iea/`. See [`../docs/iea/`](../docs/iea/) for product
vision, architecture, and decisions.

## What it does (V0.1)

Accepts an uploaded `.xlsx`/`.xlsm`, safely parses it in memory with
`openpyxl`, and returns a structural overview: sheet names, row/column
counts, column headers, formula counts, hidden-sheet detection, named-range
detection, and VBA-project presence detection. No business inference, no
LLM, no macro execution — see `docs/iea/ARCHITECTURE.md` for the security
boundary this enforces.

## Run locally

```bash
python -m venv .venv
.venv/Scripts/activate   # or `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: `curl http://127.0.0.1:8000/health`

Analyze a file:

```bash
curl -F "file=@samples/synthetic_manufacturing.xlsx" http://127.0.0.1:8000/analyze
```

## Test

```bash
pip install pytest httpx
pytest
```

## Regenerate sample fixtures

```bash
python samples/generate_sample.py       # synthetic_manufacturing.xlsx
python samples/generate_sample_xlsm.py  # synthetic_manufacturing_macro.xlsm
```

All sample data is synthetic (fabricated for testing/demo — see the
`(SYNTHETIC)` markers in the generated cell values), never real company data.

## Deploy

Built as the `iea-backend` service in the repo-root `docker-compose.yml`,
proxied by the host Nginx at `/api/iea/*`. Deploy the same way as the rest
of the site: commit, push, then on the server run
`cd /opt/amadlabs_dev && git pull && docker compose up -d --build`.
