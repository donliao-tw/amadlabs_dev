# Industrial Excel AI — Architecture

## Component placement

```
amadlabs_dev/
├── iea/              frontend page — served as a static page at /iea/ on amadlabs.com
├── iea-backend/       Python/FastAPI analysis service — proxied at /api/iea/*
└── docs/iea/          this documentation
```

Deployed as a third container alongside the existing `frontend` (nginx,
static site) and `backend` (Node, unrelated theme-settings stub) services in
`docker-compose.yml`, reverse-proxied by the same host Nginx that already
terminates TLS for amadlabs.com. See [DECISIONS.md](DECISIONS.md) for why it
is a separate service rather than folded into the existing Node backend.

## Deterministic analysis vs. LLM reasoning

This is the most important structural boundary in the whole product, and it
holds regardless of how small V0.1 is:

```
Excel file
  → Parser (openpyxl, static/safe)
  → Deterministic Analyzer          ← V0.1 stops here
  → Structured Workbook Model
  → Evidence Layer                  ← not built yet
  → LLM Reasoning                   ← not built yet
  → Business Model                  ← not built yet
  → System Blueprint                ← not built yet
  → Prototype Generator             ← not built yet
```

The deterministic layer only ever reports exact, checkable facts: sheet
names, row/column counts, formula presence, named ranges, hidden state, VBA
presence. It never guesses what any of it *means*. An LLM reasoning layer is
future work and must consume the Structured Workbook Model as its only input
— never raw workbook bytes — so every business claim it produces can be
traced back to a specific piece of evidence.

## Structured Workbook Model

`iea-backend/app/models.py` (`WorkbookOverview`, `SheetOverview`) is
deliberately scoped to V0.1's actual fields (structure only), but is meant to
grow into the full evidence model without a reshape:

```
Workbook
├── Structure       (V0.1: sheets, hidden state, dimensions, named ranges)
├── Data            (future: types, nulls, duplicates, identifier candidates)
├── Logic           (future: formulas in detail, validation, conditional formatting)
├── Relationships   (future: sheet/cross-workbook key candidates)
├── Automation      (V0.1: VBA presence only; future: modules/subs/static analysis)
└── External Deps   (future: external links, DB references — detect + report only, never followed)
```

Do not add fields for future layers speculatively — add them when the layer
that produces them is actually built.

## Security boundary

All uploads are untrusted input, full stop. Specifically:

- **VBA is never executed, parsed for logic, or unzipped as an OLE binary in
  V0.1.** `openpyxl`'s `keep_vba=True` only preserves the `xl/vbaProject.bin`
  zip entry so its *presence* can be reported — it never interprets its
  contents. (Static source-level VBA analysis is future work, and even then
  stays static-analysis-only per the product spec.)
- No formulas are evaluated. No external references, database connections,
  or links referenced by the workbook are ever followed.
- File type is validated by extension **and** by zip magic bytes
  (`PK\x03\x04`) — an extension alone is not trusted.
- File size is capped (15 MB) before any parsing happens.
- The zip archive's total *uncompressed* size is capped (200 MB) before
  openpyxl expands it, as a zip-bomb guard.
- Formula-counting is skipped (with a reported warning, not a silent gap)
  for any sheet whose cell count exceeds a fixed cap, so a huge worksheet
  can't turn a request into unbounded CPU work.
- Nothing is written to disk. The upload is read into memory, analyzed, and
  discarded when the request ends — see [DECISIONS.md](DECISIONS.md) on data
  retention.

See `iea-backend/app/analyzer.py` for where each of these is enforced.

## Technology choices

- **Backend:** Python + FastAPI + Pydantic + openpyxl. See DECISIONS.md.
- **Frontend:** plain HTML/CSS/vanilla JS, matching the rest of the static
  amadlabs_dev site (no framework/build step introduced for one page).
- **Database:** none. V0.1 is stateless — nothing needs to persist between
  requests.
- **LLM:** none in V0.1. When the reasoning layer is built, it must sit
  behind a provider-abstraction interface (`LLMProvider`) so business logic
  never depends on a specific model/vendor — not needed until that layer
  exists, so not built now.

## Future compatibility notes

- Cross-workbook relationships (multiple files uploaded together) are not
  supported yet; the model is per-workbook. Extending to multi-workbook
  analysis should not require reshaping `WorkbookOverview` — it would wrap
  a list of them plus a separate relationships object.
- Confidence/evidence tagging (`FACT | INFERENCE | UNKNOWN`,
  `HIGH | MEDIUM | LOW`) belongs to the future business-inference layer, not
  V0.1's deterministic output — V0.1 has no inference, only facts.
