# Design skills: token ledger

Skills installed in `.claude/skills/` (project level).

All numbers are estimates: English text at about 4 characters per token,
images at width x height / 750. The real count is in the session usage
readout; use these to compare skills, not to bill.

## What each skill costs

| Skill | File | Size | Estimated tokens | When it is paid |
|---|---|---|---|---|
| frontend-design (Anthropic, Apache-2.0) | SKILL.md | 9,390 B | about 2,300 | Each time the skill is invoked |
| unslop (heydamir, CC BY 4.0) | SKILL.md | 32,059 B | about 8,000 | Each time the skill is invoked |
| unslop | references/signs.md | 8,711 B | about 2,200 | Only when read in an audit |
| unslop | references/tokens.md | 6,633 B | about 1,700 | Only when read in a pass |
| unslop | references/visuals.md | 8,306 B | about 2,100 | Only when read in the visuals pass |
| unslop | references/effects.md | 4,864 B | about 1,200 | Optional |
| unslop | references/rtl.md | 7,073 B | about 1,800 | Only for Arabic, Persian, Urdu, Hebrew |
| unslop | references/refs.md | 2,458 B | about 600 | Optional |

Standing cost, every session: each installed skill adds its one-line
description to the skill list (roughly 100 to 200 tokens each).

A full unslop run (SKILL.md plus signs, tokens, visuals) is about
14,000 tokens before any screen is read or code is written.

## Log

| Date | Task | Skill context read | Other cost | Notes |
|---|---|---|---|---|
| 2026-11-25 | Homepage scene (Excel pile merging into one system), light/dark toggle | frontend-design SKILL.md (about 2,300), unslop SKILL.md (about 8,000) | 9 screenshots read, about 1,500 to 2,000 each at desktop size | unslop references were not read in this pass. The brief set the direction, so audit and polish rules came from SKILL.md only. |

Add one row per run. When a reference file is read, add its tokens to
that row.
