# Evals v0 (6.6)

Unit tests prove the code does what we wrote. Evals measure whether the
**agent** makes good choices when the model is free to choose: the right
dataset, the right metric, the right time grain, a reachable dimension, a safe
failure when the question cannot be answered.

An eval is a real question plus a declared expectation. Running the set answers
every question with the real LLM and the real core-api, scores each answer, and
writes a report. The point is not a one-time grade: it is a repeatable
regression gate for prompt, model, context, and semantic-model changes.

## The golden set

`apps/ai-service/evals/golden.json` is the committed dataset:

| Field        | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `version`    | Format version (currently `1`)                                   |
| `today`      | Frozen date used for every run — relative questions stay stable  |
| `cases[]`    | `id`, `tag`, `question`, `expected`, optional `notes`            |

Tags are one per case: `hr`, `sales`, or `tricky`. The v0 set has **30 cases**:
9 HR, 13 sales, 8 tricky. Twenty-six are expected to answer, three to fail
safely, and one to be out of scope.

`today` is frozen at **2026-06-01** so "last 12 months" or "this year" means the
same window on every run. The Acme seed spans Jan 2024 through 2026.

### What `expected` declares

For an `answered` case, the expectation describes the query *shape* and a few
result checks:

```json
{
  "outcome": "answered",
  "dataset": "employees",
  "metrics": ["headcount"],
  "dimensions": ["department"],
  "time_grain": null,
  "filters": [],
  "order_by": [{ "field": "headcount", "direction": "desc" }],
  "limit": 5,
  "result": {
    "min_rows": 1,
    "row_count": 5,
    "includes": [{ "department": "Engineering", "headcount": 11 }]
  }
}
```

`failed` and `out_of_scope` cases declare only the outcome. A failed case must
carry a safe technical error and no rows; an out-of-scope case must not draft a
QuerySpec or execute a query.

## Scoring

A case passes only when **every** declared check passes. The run score is
`passed / total`, overall and per tag.

| Check       | Rule                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `outcome`   | Exact match. A wrong outcome short-circuits the rest.                |
| `dataset`   | Exact name.                                                          |
| `metrics`   | Same set; order does not matter.                                     |
| `dimensions`| Same set; order does not matter.                                     |
| `time_grain`| Exact dimension + grain.                                             |
| `filters`   | Required subset: every expected filter must be present; extras are allowed. Operator/value are optional. |
| `order_by`  | Expected entries must be the prefix of the actual ordering.          |
| `limit`     | Exact when declared.                                                 |
| `result`    | `row_count` exact, `min_rows`, and each `includes` row must match a **distinct** returned row. Numbers compare numerically, so `38` matches `"38"` (D42). |

Not graded in v0: prose quality (the answer only has to be non-empty), date
boundary values, extra filters, column order, full row order, chart rendering,
or latency. Those are deliberate omissions; adding a check means adding it to
the golden schema and to `tests/test_evaluation.py`, not just to the JSON.

## Running

Prerequisites:

1. Docker Postgres up (`docker compose up -d`) and the Acme source seeded
   (`pnpm db:seed`, then `pnpm db:seed:semantic`).
2. core-api running on `127.0.0.1:3001` with the same `INTERNAL_API_TOKEN` as
   `apps/ai-service/.env`.
3. `LLM_API_KEY` and `LLM_MODEL` set in `apps/ai-service/.env`.

```bash
pnpm ai:eval          # score; writes evals/last-run.json (gitignored)
pnpm ai:eval:record   # same, then overwrites evals/baseline.json (committed)
```

The session preflight loads core-api's validated context and checks every
expected dataset, metric, dimension, time grain, filter, and output column
against it **before** spending tokens. A typo in the golden file therefore
fails cheaply, with the case id and the unknown name.

The runner calls `Agent.run()` in-process — not the SSE endpoint — with
`today` fixed to the golden date. One question is one test; a failure prints
the failed checks. A full report lands in `evals/last-run.json`.

If the LLM key/model or token is missing, the whole module is skipped
(`30 skipped`) so `pnpm ai:eval` is harmless on a fresh checkout. Once
configuration is present, an unreachable core-api or missing model is a hard
failure with instructions, not a skip.

## Baseline

`evals/baseline.json` is a snapshot of one recorded run: timestamp, model,
frozen date, overall and per-tag score, token/cost usage, and every case with
its failures. It is committed so a later run can be compared against it; the
summary prints `baseline X/Y, delta +N passed` automatically.

The baseline is **not** a gate that must be 100%. Some cases are genuinely hard
("average order value" is unsupported in QuerySpec v0), and a low score is a
diagnosis, not a build failure. Re-record only when the golden set or the model
changes on purpose, and review the diff like code: a changed case or a changed
model makes the old score incomparable.

`evals/last-run.json` is gitignored because it changes on every run.

## Limits

- 30 cases is a smoke detector, not a benchmark. Per-tag percentages are
  indicative, not statistically meaningful.
- One tag per case; no weighting.
- The agent is nondeterministic even at temperature 0. A one-case swing between
  runs is normal; investigate repeated failures, not a single flip.
- Expectations are code. If a golden case is wrong, fix it in a reviewed commit
  and say why; do not "fix" it by weakening the check after a red run.
