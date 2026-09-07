# Industrial Excel AI — Architecture Decisions

## 2026-09-07 — Built as a feature page inside amadlabs_dev, not a standalone repo

**Decision:** `iea/` (frontend) + `iea-backend/` (Python service) live inside
the existing `amadlabs_dev` repo and deploy as part of its existing
`docker-compose.yml` / host-Nginx stack, reachable at `amadlabs.com/iea/`.

**Reason:** User explicitly redirected from the original standalone-product
spec to "build this as a feature on one page of my AMADLABS site" — this is
currently a marketing/demo showcase for the studio's capabilities, not a
product being sold to its own customers yet.

**Alternatives considered:** A fully separate `industrial-excel-ai` repo with
its own deploy pipeline (the original spec's structure), linked to or
iframed from amadlabs.com.

**Trade-offs:** Coupling this feature's deploys to the marketing site's
deploy cadence and its single small VPS. If this ever becomes a real product
with its own customers/data/security requirements, it should be split out
into its own repo and infrastructure at that point — don't let it grow
in-place past a demo without revisiting this.

## 2026-09-07 — Python/FastAPI as a third container, not folded into the existing Node backend

**Decision:** New `iea-backend` service (Python), separate from the existing
`backend` (Node, theme-settings stub), proxied at `/api/iea/*`.

**Reason:** The user chose this explicitly, accepting the RAM trade-off
below. Rewriting the Excel analysis in Node would also fight the "excel
analysis needs the right tool per job" principle from the product
spec — `openpyxl` is the right tool here and is Python-only.

**Trade-offs:** The VPS is 1 vCPU / ~1GB RAM already running two containers
with limited headroom. A third container (FastAPI + openpyxl) adds real
memory pressure. Mitigations applied: single uvicorn worker, no persistent
volume, 15MB upload cap bounding per-request memory, and the service is
otherwise stateless so it can be killed/restarted freely. If production
memory pressure becomes a real problem, the next lever is upgrading the VPS
tier, not adding complexity here.

## 2026-09-07 — openpyxl only, no pandas, for V0.1

**Decision:** V0.1's analyzer uses only `openpyxl`.

**Reason:** Every V0.1 fact (sheet names, dimensions, formulas, named
ranges, hidden state, VBA archive presence) is available directly from
openpyxl's object model. Adding pandas now would be for a job nothing in
V0.1 does (no dataframe-level operations — dtype inference, null-ratio,
duplicate detection — are in scope yet). Add it when the Data-layer analysis
that actually needs it is built, per the product spec's own instruction not
to force one library across every responsibility.

## 2026-09-07 — VBA: presence detection only, never parsed or executed

**Decision:** `keep_vba=True` is used solely to detect whether
`wb.vba_archive` is populated. The archive's contents are never read,
unzipped, or passed to any VBA-parsing library.

**Reason:** Matches the product's hard security boundary (VBA must never be
executed; even static source extraction is a deliberately separate, later
scope). A `.xlsm`'s VBA project blob is also a legitimate target for
malformed/oversized-payload abuse, so not touching its contents at all is
the safest possible V0.1 behavior.

**Alternatives considered:** `oletools`/`olevba` for real static VBA source
extraction — deferred to the deterministic-analyzer phase (see BACKLOG.md),
where it can get proper sandboxing consideration rather than being bolted
onto a structure-overview endpoint.

## 2026-09-07 — No database in V0.1

**Decision:** No persistence layer. Each `/analyze` request is stateless;
nothing survives past the response.

**Reason:** Nothing in V0.1's scope needs to be retrieved later — there's no
user session, no history, no multi-step clarification flow yet. Matches both
YAGNI and the product's own "minimal data retention" privacy principle,
since a spreadsheet a company uploads is inherently sensitive even in a demo
context.

## 2026-09-07 — No i18n on the /iea/ page

**Decision:** The page is Traditional Chinese only, unlike the rest of the
site which has a zh/en toggle.

**Reason:** Scope control for a V0.1 demo page. Revisit if/when this
graduates past a preview feature (see BACKLOG.md).
