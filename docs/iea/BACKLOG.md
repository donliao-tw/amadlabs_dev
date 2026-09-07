# Industrial Excel AI — Backlog

Ordered roughly by what should come next. Nothing here is scheduled — this
is a list of known gaps, not a commitment.

## Next up (deterministic analyzer, deeper)

- Data-layer analysis: column data types, null ratios, duplicate detection,
  identifier-candidate detection (needs pandas — see DECISIONS.md).
- Logic-layer analysis: data validation rules, conditional formatting,
  calculated-field detection beyond "is a formula."
- Relationship-layer analysis: candidate keys/foreign-key-like overlaps
  between sheets within one workbook.
- Multi-workbook upload: analyze several related files together and surface
  cross-workbook relationship candidates.
- Real VBA static analysis (`oletools`/`olevba`): modules, subs, event
  handlers, branching, range references — still never executed. Needs its
  own security review before it's added (parsing untrusted OLE binaries has
  its own history of parser vulnerabilities).

## Later (business reasoning layer — not started)

- Evidence layer + LLM reasoning (`LLMProvider` abstraction, no
  vendor-specific code in business logic).
- FACT / INFERENCE / UNKNOWN + confidence tagging on any generated claim.
- Clarification Q&A flow (few, high-value questions, not a requirements
  questionnaire).
- System Blueprint generation (entities, tables, keys, rules, workflow,
  suggested screens).
- Interactive prototype generation.

## Housekeeping / known gaps in V0.1

- `/iea/` page has no i18n (zh-only) — see DECISIONS.md.
- No automated UI/browser test — verified manually via a throwaway local
  proxy mimicking the production nginx routing (no browser tooling was
  available in the environment this was built in). Worth adding a real
  browser check (Playwright or similar) before this grows further.
- No rate limiting on `/api/iea/analyze` — fine for a demo page with no
  meaningful traffic yet; revisit if this gets linked anywhere with real
  reach.
- If this ever takes real customer data (not just a public demo), revisit
  the "no persistence, no retention" decision explicitly — it was chosen
  because the current use case doesn't need memory across requests, not
  because retention would be unsafe to add correctly.
