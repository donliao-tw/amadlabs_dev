# Industrial Excel AI — Vision

## What this is

Not an Excel viewer. Not "Excel → pretty dashboard." Not a full ERP.

> Reverse engineer the business system hidden inside a company's spreadsheets.

Small manufacturing-adjacent companies (suppliers, purchasing, quality,
production, inventory) run their real operations across a pile of loosely
connected Excel workbooks. Those workbooks, taken together, already encode a
business system — entities, rules, workflow — nobody wrote down. The product
reads that evidence and shows the company what a real system built from it
could look like.

## North Star

**"Show me the system hidden inside your spreadsheets."**

- Time to first insight: < 60 seconds (fast structural scan)
- Time to prototype: < 10 minutes (upload → analyze → clarify → blueprint → interactive prototype)

10 minutes is not a promise of a production-ready system — it's a promise of
a believable, interactive sketch of one.

## Pipeline (target end state, not V0.1)

```
Upload → Fast Scan → Deep Analysis → Business Understanding
       → Clarification (few, high-value questions) → System Blueprint
       → Prototype
```

Every inference the tool makes must be labeled as one of: **FACT**,
**EVIDENCE**, **INFERENCE**, or **UNKNOWN**. AI inference is never presented
as a confirmed fact. See [ARCHITECTURE.md](ARCHITECTURE.md) for how this is
enforced structurally.

## Where this lives right now

This is being built as a demo/showcase feature on the AMAD Labs marketing
site (amadlabs.com), not as a standalone product repo — see
[DECISIONS.md](DECISIONS.md) for why, and [../../iea-backend/README.md](../../iea-backend/README.md)
for the current implementation status. The long-term product vision above
still holds; V0.1 (this repo, today) is only the first vertical slice of it.
