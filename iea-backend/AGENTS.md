# AGENTS.md — iea-backend

Persistent context for AI agents working in this directory. Read
[`../docs/iea/VISION.md`](../docs/iea/VISION.md),
[`ARCHITECTURE.md`](../docs/iea/ARCHITECTURE.md), and
[`DECISIONS.md`](../docs/iea/DECISIONS.md) first — this file assumes them.

## Current scope (V0.1)

Deterministic structural analysis only: sheets, dimensions, headers,
formula counts, hidden-sheet detection, named ranges, VBA-project presence.
**No** business inference, no LLM calls, no macro execution, no multi-file
upload, no persistence. Do not add any of those without the user explicitly
asking — this repo has a documented history of over-scoping being corrected
back to a vertical slice.

## Non-negotiable rules

- **Never execute, evaluate, or dynamically parse uploaded workbook
  content beyond openpyxl's static object model.** No `Shell()`, no VBA
  execution, no formula evaluation, no following external references/links,
  no COM automation. See `docs/iea/ARCHITECTURE.md` § Security boundary.
- Every upload is untrusted input: validate extension, magic bytes, size,
  and uncompressed-zip size *before* calling `load_workbook`.
- Nothing gets written to disk. Analysis happens on an in-memory
  `BytesIO`, and nothing survives past the response.
- Keep `app/analyzer.py` (deterministic facts) and any future reasoning
  layer strictly separate — the analyzer must never import or call an LLM
  client.

## Coding conventions

- Python, FastAPI, Pydantic v2 models (`app/models.py`).
- One library per job, not one library for everything — see DECISIONS.md
  for why pandas isn't here yet.
- Pydantic models are the schema contract with the frontend
  (`iea/script.js`) — if you change a field name, update both sides.

## How to run

```bash
cd iea-backend
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## How to test

```bash
pytest
```

Tests use fixtures in `tests/conftest.py` plus the synthetic sample
workbooks in `samples/` (regenerate with `samples/generate_sample*.py` if
you change what they need to cover). Cover valid files, invalid extensions,
malformed/non-zip content, oversized files, zip-bomb-shaped archives, empty
sheets, hidden sheets, formulas, named ranges, and VBA detection (both
present and absent) — not just the happy path.

## Definition of done for a change here

- [ ] Tests pass (`pytest`)
- [ ] New behavior has a new test, not just a manual check
- [ ] No new dependency added without checking it's actually needed for
      what's in scope right now
- [ ] Security boundary above still holds (nothing executes untrusted
      content)
- [ ] If the response schema changed, `iea/script.js` was updated to match
