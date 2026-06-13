# Testing requirements

MyGarden's value lives in its logic — the planner geometry, the growing-degree-day twin, the weed
and pest models, and the task engine. The architecture (PLAN.md §3) keeps that logic as **pure
TypeScript in `src/domain/`, with no React or storage imports**, precisely so it can be tested
exhaustively and cheaply. These requirements encode that.

## Principles

1. **Domain logic is tested rigorously.** Every exported function in `src/domain/` has unit tests
   covering its normal cases *and* its edge/guard cases (zero, negative, empty, boundary).
2. **The domain layer stays pure.** Domain code must not import React, Dexie, the network, `Date.now()`,
   or anything non-deterministic. Time and weather are passed in as arguments so tests are
   reproducible. This is what makes rule 1 affordable.
3. **UI is thin and gets smoke tests.** Screens and components get at least a render test that
   asserts they mount and show their key content. Components with real interaction or state get
   interaction tests (React Testing Library + `user-event`). UI is intentionally **not** held to the
   coverage gate — push meaningful logic down into `src/domain/` and test it there instead.
4. **Tests are deterministic and offline.** No test hits the network or a real clock. Weather and
   dates are supplied via fixtures. The Open-Meteo client (from milestone 1) is tested against
   recorded fixtures, never the live API.
5. **A bug fix ships with a regression test** that fails before the fix and passes after.

## The coverage gate

CI runs `npm run test:coverage`, which enforces thresholds **scoped to `src/domain/**`** (configured
in `vite.config.ts`):

| Metric | Threshold |
| --- | --- |
| Statements | 95% |
| Lines | 95% |
| Branches | 90% |
| Functions | 100% |

If you add a domain function, you add its tests — or CI fails. New domain modules (twin staging,
task rules, weed/pest models) inherit the same bar as they land.

## Conventions

- **Location:** tests are co-located with the code as `*.test.ts` / `*.test.tsx`.
- **Framework:** [Vitest](https://vitest.dev) with `@testing-library/react` and `jest-dom` matchers
  (set up in `src/test/setup.ts`). `globals: true`, so `describe`/`it`/`expect` need no import.
- **Naming:** describe the unit, then state behaviour — `it('clamps to zero on cold days')`.

## Running

```bash
npm test              # run the suite once
npm run test:watch    # watch mode while developing
npm run test:coverage # run with the domain coverage gate (what CI runs)
```

## Definition of done (every PR)

- New/changed domain logic has tests; the coverage gate passes.
- New screens/components have at least a render test.
- `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and `npm run build` all pass — these
  are the CI gates, and `main` should only ever be green.
