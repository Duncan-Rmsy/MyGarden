# MyGarden — Project Plan

A mobile-first app for planning a vegetable garden, then running a **digital twin** of it: a
simulation of each plant's progress that drives timely reminders ("harden off your tomatoes this
week", "first zucchini harvest expected ~June 20", "thin the carrots").

## 1. Vision

Three connected experiences:

1. **Plan** — lay out beds, choose crops and varieties, and get a planting calendar that respects
   your climate, frost dates, spacing, and succession planting.
2. **Simulate** — once planted, a digital twin estimates each plant's growth stage from elapsed
   time, local weather, and your observations. You correct the twin via quick check-ins (and,
   later, photos).
3. **Act** — the twin generates a task feed and reminders: water, fertilize, thin, trellis,
   harden off, transplant, harvest. Each task explains *why* and links to the plant.

## 2. Scope by version

### V1 — Planner + basic twin (this build)

- **Garden setup**: define beds (name, dimensions, sun exposure), set location → derive hardiness
  zone and average first/last frost dates.
- **Crop catalog**: a curated, local JSON/SQLite database of ~40 common vegetables and herbs with
  per-crop data (spacing, sowing depth, days to germination/maturity, frost tolerance, base
  temperature for growth, growth stages, common tasks).
- **Planting planner**: drag crops onto a simple grid layout of each bed (square-foot style cells),
  with spacing validation and a generated planting calendar (sow indoors / direct sow /
  transplant windows computed from frost dates).
- **Plantings**: when you actually sow/transplant, record it — this instantiates a plant (or row)
  in the twin.
- **Digital twin (rules-based)**:
  - Growth model driven by **growing degree days (GDD)** accumulated from daily weather
    (Open-Meteo, free, no API key) with a calendar-days fallback when offline.
  - Each planting advances through stages: *seed → germinated → seedling → vegetative →
    flowering → fruiting → harvest-ready → done*.
  - Manual check-ins ("it germinated today", "first flower") **re-anchor** the simulation so it
    stays honest.
- **Task engine**: stage transitions and crop rules emit tasks with due dates; recurring care
  tasks (watering cadence by crop and recent rainfall); frost warnings from the forecast.
- **Today view**: the home screen — what needs doing today/this week, plus a status card per bed.
- **Reminders**: web push notifications (PWA) with an in-app fallback feed.

### V2 — Smarter twin + photos

- Photo check-ins: snap a seedling, Claude vision API estimates stage/health and re-anchors the
  twin; flags problems (pests, nutrient deficiency, disease) with suggested actions.
- Natural-language check-ins and Q&A ("the leaves are yellowing at the edges — what's wrong?").
- Weather-adjusted watering (evapotranspiration model rather than fixed cadence).
- Succession planting suggestions and bed-rotation warnings (don't follow tomatoes with potatoes).

### V3 — Ideas parking lot

- Harvest logging and yield history; year-over-year variety comparison.
- Seed inventory with "sow by" expiry tracking.
- Sharing/printing the garden plan; multi-garden support.
- Companion-planting hints in the planner.

## 3. Architecture

**Local-first PWA.** All data lives on-device (IndexedDB); the only network calls in v1 are to the
weather API. No accounts, no backend to run — which suits a single-user garden app and keeps it
free to operate. A sync backend can be added later without changing the data model.

```
┌─────────────────────────────────────────────┐
│  PWA (React + TypeScript + Vite)            │
│                                             │
│  UI: Today / Planner / Beds / Plant detail  │
│        │                                    │
│  Domain layer (pure TS, fully unit-tested)  │
│   ├─ planner: calendar + spacing rules      │
│   ├─ twin: GDD growth simulation            │
│   └─ tasks: rule engine → task feed         │
│        │                                    │
│  Storage: Dexie (IndexedDB)  ← crop catalog │
│  Weather: Open-Meteo client (cached daily)  │
│  Service worker: offline + web push         │
└─────────────────────────────────────────────┘
```

**Stack choices**

| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Fast iteration, huge ecosystem, PWA plugin |
| Storage | Dexie.js over IndexedDB | Typed queries, migrations, works offline |
| State | Zustand + TanStack Query | Light; Query handles weather caching |
| UI | Tailwind CSS | Quick to make mobile layouts feel native |
| Dates | date-fns | Tree-shakeable, plays well with TS |
| Weather | Open-Meteo | Free, keyless, historical + 14-day forecast |
| Tests | Vitest | The twin and task engine are pure functions — test heavily |
| Hosting | Static (GitHub Pages / Netlify / Vercel) | It's just files |

The key architectural rule: **the planner, twin, and task engine are pure TypeScript modules with
no React or storage imports.** Given (catalog, plantings, weather history, observations) they
return (stage estimates, tasks). This makes them trivially testable and lets V2 swap in smarter
models without touching the UI.

## 4. Data model

```ts
Garden      { id, name, lat, lon, lastFrostDate, firstFrostDate, hardinessZone }
Bed         { id, gardenId, name, widthCm, lengthCm, sunExposure: 'full'|'partial'|'shade' }
Crop        { id, name, variety?, family,            // catalog entry (read-only seed data)
              spacingCm, sowDepthCm, daysToGerminate: [min,max],
              daysToMaturity: [min,max], gddToMaturity?, baseTempC,
              frostTolerance: 'hardy'|'semi'|'tender',
              sowWindows: RelativeWindow[],           // e.g. indoors: lastFrost-6w..-4w
              stages: StageDef[],                     // gdd or day thresholds per stage
              careRules: CareRule[] }                 // watering cadence, feeding, thinning…
Planting    { id, bedId, cropId, cell: {x,y}, method: 'direct'|'transplant'|'indoors',
              sownAt?, transplantedAt?, status: 'planned'|'active'|'done'|'failed' }
Observation { id, plantingId, at, kind: 'stage_reached'|'note'|'photo'(v2),
              stage?, note? }                         // re-anchors the twin
WeatherDay  { date, tMinC, tMaxC, rainMm, source: 'history'|'forecast' }   // cached per garden
Task        { id, plantingId?, bedId?, type, title, why, dueDate,
              status: 'pending'|'done'|'snoozed'|'obsolete', generatedBy }  // rule id, for dedupe
```

## 5. The digital twin — how the simulation works

1. **Accumulate heat**: for each active planting, sum daily GDD =
   `max(0, (tMin + tMax)/2 − baseTempC)` from its anchor date, using cached weather history and
   the forecast for the days ahead.
2. **Map to stage**: compare accumulated GDD against the crop's stage thresholds → current
   estimated stage + projected dates for upcoming stages (e.g. harvest window).
3. **Anchor on reality**: an observation like "germinated on May 3" resets the baseline — the twin
   trusts you over the model. Drift between predicted and observed stages is stored and used to
   bias that planting's future predictions (a simple per-planting correction factor).
4. **Fallback**: if a crop has no GDD data or weather is unavailable, fall back to
   days-to-maturity ranges. Every estimate carries a confidence level shown in the UI.
5. **Emit tasks**: a nightly recompute (on app open + background sync where supported) diffs the
   twin state against existing tasks and creates/expires tasks idempotently via `generatedBy` keys.

Example task rules for v1:

- `sow_window_open` — planting calendar says it's time to sow crop X indoors.
- `germination_check` — expected germination window reached, ask user to confirm (this doubles as
  the check-in that anchors the twin).
- `thin_seedlings`, `transplant_window`, `harden_off` (7 days before transplant window).
- `water` — cadence per crop, skipped if recent rainfall > threshold.
- `frost_warning` — forecast min temp below tolerance of any active tender planting.
- `harvest_window` — projected maturity reached.

## 6. Screens (v1)

1. **Today** (home): task list for today/this week with done/snooze; weather strip; frost alerts.
2. **Planner**: pick a bed → grid of cells → tap to assign crops; calendar view of sow/transplant
   windows for everything planned.
3. **Beds**: bed list → bed detail showing each planting with a stage progress bar and projected
   harvest date.
4. **Plant detail**: twin timeline (past stages, current estimate, projections), check-in button,
   observation history, crop care notes.
5. **Settings/Onboarding**: location (geolocate or search), frost dates (suggested, editable),
   notification permission.

## 7. Milestones

| # | Milestone | Contents | Rough size |
|---|---|---|---|
| 0 | Skaffold | Vite + React + TS + Tailwind + Dexie + PWA shell, CI (lint, typecheck, vitest) | small |
| 1 | Garden setup | Onboarding, location → frost dates, bed CRUD | small |
| 2 | Crop catalog | Seed data for ~40 crops, catalog browsing UI | medium (data entry heavy) |
| 3 | Planner | Bed grid, crop placement, spacing validation, planting calendar | medium |
| 4 | Twin core | Weather client + cache, GDD engine, stage estimation, observations/anchoring — pure TS + tests first | medium |
| 5 | Task engine | Rules above, idempotent generation, Today view | medium |
| 6 | Notifications | Web push + in-app feed, nightly recompute | small |
| 7 | Polish | Plant detail timeline, empty states, install prompt, offline hardening | small |

Each milestone ends usable: after M3 you have a real planning tool even with no twin; after M5
the app fulfils the core promise.

## 8. Risks & open questions

- **Crop data quality is the product.** GDD thresholds per stage are scattered across extension
  publications and vary by variety. Mitigation: start with day-range fallbacks for all crops and
  add GDD data for the ~10 crops you actually grow first. *(Question: what do you typically grow?
  That list should drive catalog priorities.)*
- **iOS web push** requires the PWA to be installed to the home screen (iOS 16.4+) and is less
  reliable than native. The in-app Today feed is the dependable channel; push is best-effort.
- **Background recompute** on a pure PWA is limited — the twin mainly updates on app open. Daily
  use is expected for a gardener, so acceptable for v1; a tiny cron + push server is the v2 escape
  hatch if needed.
- **Indoor seedlings** don't experience outdoor weather. V1 models the indoor phase on calendar
  days at an assumed room temperature; GDD starts at transplant.
- **Where is the garden?** Frost dates and the weather feed need a location — onboarding asks, but
  if you tell me now I can tune the default catalog windows.
