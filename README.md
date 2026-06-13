# MyGarden

A mobile-first PWA for planning a vegetable garden and running a **digital twin** of it — estimating
each plant's progress from local weather and your observations, and driving timely reminders.

See [`PLAN.md`](./PLAN.md) for the full product and architecture plan.

## Stack

- **React + TypeScript + Vite** — the app shell and UI
- **Tailwind CSS** — styling
- **Dexie (IndexedDB)** — local-first storage; the only network calls in v1 are to the weather API
- **Zustand + TanStack Query** — state and weather caching
- **vite-plugin-pwa** — offline shell and installability
- **Vitest** — the planner, twin, and task engine are pure functions and are tested heavily

The architectural rule (PLAN.md §3): the planner, twin, and task engine in `src/domain/` are pure
TypeScript with no React or storage imports, so they are trivially testable. Testing requirements
and the domain coverage gate are documented in [`TESTING.md`](./TESTING.md).

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm test           # run unit tests
npm run typecheck  # type-check
npm run lint       # lint
npm run build      # production build
npm run test:coverage  # tests with the domain coverage gate (what CI enforces)
```

## Layout

```
src/
  domain/      pure logic — planner geometry (§4a), GDD twin (§5); fully unit-tested
  data/        types (§4) and the Dexie database
  components/  app shell (layout, bottom nav)
  screens/     Today, Planner, Beds, Settings
```

## Status

Milestone 0 (scaffold) — running PWA shell, local DB schema, tested domain core, and CI.
Next: garden setup and onboarding (milestone 1).
