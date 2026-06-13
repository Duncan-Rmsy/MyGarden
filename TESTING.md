# Testing requirements

MyGarden's value lives in its logic — the planner geometry, the growing-degree-day twin, the weed
and pest models, and the task engine. The architecture (PLAN.md §3) keeps that logic as **pure
TypeScript in `src/domain/`, with no React or storage imports**, precisely so it can be tested
exhaustively and cheaply. These requirements encode that, and extend it so the suite also catches
**security regressions** and **drift from the plan**, not just functional bugs.

The job of this suite is to answer three questions on every change:

1. **Does it work, and will a future change that breaks it be caught?** (bugs & regressions)
2. **Did we just ship a vulnerability?** (security)
3. **Does the code still do what PLAN.md says it does?** (failures vs the plan)

## Principles

1. **Domain logic is tested rigorously.** Every exported function in `src/domain/` has unit tests
   covering its normal cases _and_ its edge/guard cases (zero, negative, empty, boundary), plus
   **property-based tests** (fast-check) that encode the invariant the plan specifies, so the input
   space is searched rather than spot-checked.
2. **The domain layer stays pure.** Domain code must not import React, Dexie, the network, `Date.now()`,
   or anything non-deterministic. Time and weather are passed in as arguments so tests are
   reproducible. This is what makes rule 1 affordable.
3. **UI is thin and gets smoke tests.** Screens and components get at least a render test that
   asserts they mount and show their key content. Components with real interaction or state get
   interaction tests (React Testing Library + `user-event`). UI is intentionally **not** held to the
   coverage gate — push meaningful logic down into `src/domain/` and test it there instead.
4. **Tests are deterministic and offline.** No test hits the network or a real clock. Weather and
   dates are supplied via fixtures. The Open-Meteo client (from milestone 1) is tested against
   recorded fixtures, never the live API. Property tests run a fixed case count and print a
   reproducible seed on failure.
5. **A bug fix ships with a regression test** that fails before the fix and passes after.
6. **Untrusted input is tested as hostile.** Anything from outside the pure core — the weather API
   response, data read back from IndexedDB, user-entered numbers — is treated as untrusted and has
   tests for malformed, missing, and out-of-range values (see "Catching security issues").
7. **Every plan invariant has a test.** When you implement something PLAN.md specifies a rule or
   formula for, that rule gets a named test, and the traceability table below is updated.

## The test taxonomy

A deliberately bottom-heavy pyramid: most assertions live in fast, pure domain tests; the slower,
browser-dependent tiers stay thin and cover only what the lower tiers _can't_.

| Tier                      | What it covers                                         | Tools                               | Gated in CI?                   |
| ------------------------- | ------------------------------------------------------ | ----------------------------------- | ------------------------------ |
| **Domain unit**           | Pure logic in `src/domain/` — example + property-based | Vitest, fast-check                  | **Yes** (coverage gate)        |
| **Storage / integration** | Dexie schema, migrations, query round-trips            | Vitest + `fake-indexeddb`           | Yes, as it lands (M1+)         |
| **Component / UI**        | Screens render; interactive components behave          | RTL + `user-event`                  | Runs in CI; not coverage-gated |
| **End-to-end / browser**  | Browser-only promises & critical journeys              | Playwright _(deferred — see below)_ | Not yet                        |

### End-to-end / browser tests — scope and trigger

jsdom cannot reach several things the app actually promises, so these are the _only_ things E2E
exists to cover — it must never re-test domain logic the unit tier already owns:

- **Offline / PWA shell** — service worker registration, offline load, install/update flow (PLAN.md
  §3, §7). There is no service worker in jsdom.
- **Persistence across reload** — real IndexedDB write → reload → read (Dexie in a real browser).
- **Touch placement** — tap-to-place, drag-to-fill, pinch-zoom on the bed grid (PLAN.md §4a), which
  depend on real pointer/touch events and hit-testing.
- A handful of **critical-journey smoke tests** end-to-end: onboarding → frost dates → add bed →
  place a crop → see the plan.

**Decision: not yet.** At milestone 0 the screens are placeholders, so Playwright would test stubs
while adding browser binaries, CI time, and flake. **Introduce it when the first real journey lands**
(onboarding in M1, or the planner grid in M3), kept to the scopes above. For component tests
that genuinely need a real browser (touch, layout) but not a full journey, prefer **Vitest browser
mode** (Playwright provider) over a separate E2E harness — it reuses this same Vitest setup.

## Catching bugs

Coverage proves a line _ran_; it does not prove a test would _fail_ if that line were wrong. Three
practices close that gap:

- **Property-based tests** (fast-check, in the domain `*.test.ts`) assert the invariant from the
  plan over generated inputs — e.g. GDD is `max(0, mean − base)` for _all_ temperatures, packing is
  `floor(cell/spacing)²` for _all_ sizings — and shrink any failure to a minimal counterexample.
  This is where edge-case bugs surface. A property must be **numerically sound** or it becomes
  flaky: assert exact equality only where the maths is exact (integer / half-degree domains), and
  use `≥`/`≤` or a tolerance for floating-point results — never bit-equality across a different
  summation order. (The GDD accumulation property was caught over-claiming exactly this — by the
  mutation run's dry-run under a fresh seed — and corrected; floating-point addition is not
  associative.)
- **Mutation testing** (Stryker) is the check on the tests themselves: it injects faults into
  `src/domain/` and re-runs the suite; a **surviving mutant** is a spot where a real bug would pass
  unnoticed. It is **opt-in**, run before merging significant domain changes:

  ```bash
  npm run test:mutation   # uses npx; config in stryker.config.json, scoped to src/domain
  ```

  It is deliberately _not_ a committed dependency or a blocking CI gate — at the time of writing it
  pulls a transitive dev advisory and ~80 packages, which we keep out of the lockfile and the
  security gate. Treat its score (break threshold 70%) as a quality signal, not a wall.

- **A regression test per bug fix** (Principle 5): reproduce the bug as a failing test first.

## Catching security issues

The threat model is small but real: a static, local-first PWA with **one external input (the weather
API)**, on-device storage, and a service worker. The controls match that surface.

- **Dependency audit gate.** CI runs `npm run audit:ci` (`npm audit --audit-level=high`) and fails on
  high/critical advisories. Shipped runtime dependencies are the priority; the `high` threshold keeps
  moderate dev-tool noise from blocking while still catching anything serious.
- **Automated updates.** `.github/dependabot.yml` raises security and version PRs for npm and the CI
  actions, so known vulnerabilities don't sit in the tree and pinned actions stay current.
- **SAST.** `.github/workflows/codeql.yml` runs CodeQL (`security-extended`) on pushes to `main`,
  PRs, and weekly — catching injection, unsafe DOM sinks, prototype pollution, and similar.
- **Untrusted input is validated and tested as hostile** (Principle 6). The weather client must
  schema-validate every Open-Meteo response and reject/shape malformed data rather than trusting it;
  data read back from IndexedDB is treated the same way. Each such boundary ships with tests for
  missing fields, wrong types, NaN/Infinity, and absurd ranges — a malformed response must never
  crash the twin or corrupt stored state. (Lands with the weather client in M1.)
- **No injection sinks.** No `dangerouslySetInnerHTML`, `eval`, or building DOM/URLs from raw input;
  rely on React's escaping. Lint should flag regressions here.
- **No secrets.** Open-Meteo is keyless and there is no backend in v1, so nothing secret should ever
  enter the repo or the bundle; keep it that way and leave GitHub secret-scanning enabled.

## Catching failures vs the plan

PLAN.md specifies concrete, testable formulas and rules. Each is encoded as a named test, so a change
that silently diverges from the plan fails CI. Keep this table current as modules land:

| PLAN.md                | Invariant under test                                                                                                                       | Where                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| §5.1 — GDD             | `dailyGdd = max(0, (tMin+tMax)/2 − baseTempC)`; accumulation is non-negative & monotone in days; order-independent for whole-degree inputs | `src/domain/gdd.test.ts`     |
| §4a — planner geometry | `plantsPerCell = floor(cell/spacing)²` (else 0); `blockCapacity = perCell × cells`; `rowCount = floor(len/spacing)`                        | `src/domain/planner.test.ts` |
| §4c — frost dates      | avg last-spring / first-autumn 0 °C crossings from history                                                                                 | _M1 — `climate.test.ts`_     |
| §4e — start method     | direct / indoor / buy selection by date vs frost window; indoor→transplant phase switch                                                    | _M4_                         |
| §5.2–5.3 — twin        | accumulated GDD → stage + projections; observation re-anchors baseline; drift bias                                                         | _M4 — `twin.test.ts`_        |
| §5.5 — task engine     | idempotent generation/expiry via `generatedBy` keys                                                                                        | _M5 — `tasks.test.ts`_       |
| §5a — weeds            | flush trigger on rain threshold; hoeable window opens then closes; reset on action                                                         | _M4_                         |

## The coverage gate

CI runs `npm run test:coverage`, which enforces thresholds **scoped to `src/domain/**`** (configured
in `vite.config.ts`):

| Metric     | Threshold |
| ---------- | --------- |
| Statements | 95%       |
| Lines      | 95%       |
| Branches   | 90%       |
| Functions  | 100%      |

If you add a domain function, you add its tests — or CI fails. New domain modules (twin staging,
task rules, weed/pest models) inherit the same bar as they land. Coverage is a **floor, not a
ceiling**: 100% covered code can still be under-tested, which is what mutation testing exists to
expose.

## Conventions

- **Location:** tests are co-located with the code as `*.test.ts` / `*.test.tsx`.
- **Framework:** [Vitest](https://vitest.dev) with `@testing-library/react` and `jest-dom` matchers
  and [fast-check](https://fast-check.dev) for property tests (set up in `src/test/setup.ts`).
  `globals: true`, so `describe`/`it`/`expect` need no import.
- **Naming:** describe the unit, then state behaviour — `it('clamps to zero on cold days')`.
  Property-based blocks name the invariant and cite the plan section, e.g.
  `describe('GDD invariants (property-based, PLAN.md §5.1)')`.

## Running

```bash
npm test               # run the suite once
npm run test:watch     # watch mode while developing
npm run test:coverage  # run with the domain coverage gate (what CI runs)
npm run audit:ci       # the CI security gate (fails on high/critical advisories)
npm run test:mutation  # opt-in: mutation-test the domain to validate test strength
```

## CI gates (what `main` must always pass)

`npm run lint` · `npm run typecheck` · `npm run test:coverage` · `npm run build` ·
`npm run audit:ci` (all in `.github/workflows/ci.yml`), plus **CodeQL** in its own workflow.

## Definition of done (every PR)

- New/changed domain logic has example **and** property tests; the coverage gate passes.
- Any plan-specified rule touched is covered by a named test and the traceability table is updated.
- New external-input boundaries validate hostile input and have tests for it.
- New screens/components have at least a render test.
- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`, and
  `npm run audit:ci` all pass — these are the CI gates, and `main` should only ever be green.
