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
- **Planting planner**: tap-to-place crops onto a to-scale grid layout of each bed (see §4a),
  with spacing respected via per-crop density and a generated planting calendar (sow indoors /
  direct sow / transplant windows computed from frost dates).
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
- **Photo intake**: snap a seed packet or the tag on a bought seedling — Claude vision extracts
  variety, days to maturity, spacing, and sowing instructions, then creates/matches a catalog
  entry and pre-fills the planting. (Same vision capability as photo check-ins, different entry
  point — intake vs. progress tracking.)
- **Background twin + reliable reminders**: a tiny companion notification service (a daily cron
  job) recomputes the twin server-side and delivers reminders via web push *or email*, so nothing
  is missed even when the app hasn't been opened. Email doubles as the fallback channel where
  push is flaky (iOS).
- Natural-language check-ins and Q&A ("the leaves are yellowing at the edges — what's wrong?").
- Weather-adjusted watering (evapotranspiration model rather than fixed cadence).
- Succession planting suggestions and bed-rotation warnings (don't follow tomatoes with potatoes).

### V3 — Ideas parking lot

- **Variety advisor**: recommends specific varieties for your climate, space, and goals, and
  searches which nearby garden centres or seed retailers stock them (web search / retailer
  integrations).
- **Rotation-aware season kick-off**: at the start of a season, proposes which crop families go
  in which beds based on previous seasons' plantings (the `Crop.family` field and per-bed
  planting history in the data model already support this). Builds on V2's rotation warnings:
  V2 warns, V3 proposes.
- Harvest logging and yield history; year-over-year variety comparison.
- Seed inventory with "sow by" expiry tracking.
- Sharing/printing the garden plan; multi-garden support.
- Companion-planting hints in the planner.

## 3. Architecture

**Local-first PWA.** All data lives on-device (IndexedDB); the only network calls in v1 are to the
weather API. No accounts, no backend to run — which suits a single-user garden app and keeps it
free to operate. The one planned exception is v2's notification service: a deliberately small
cron job that recomputes the twin daily and sends push/email reminders. It only needs the task
feed, not the full dataset, so the local-first data model is unchanged.

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
              spacingCm, rowSpacingCm?, sowDepthCm,
              habit: 'compact'|'row'|'sprawling'|'climbing',  // default placement + which sprite
              daysToGerminate: [min,max],
              daysToMaturity: [min,max], gddToMaturity?, baseTempC,
              frostTolerance: 'hardy'|'semi'|'tender',
              sowWindows: RelativeWindow[],           // e.g. indoors: lastFrost-6w..-4w
              stages: StageDef[],                     // gdd or day thresholds per stage
              careRules: CareRule[] }                 // watering cadence, feeding, thinning…
Planting    { id, bedId, cropId,
              footprint: {x,y,w,h},                   // rect of grid cells the planting occupies
              plantCount,                             // derived from spacing × area, then stored
              method: 'direct'|'transplant'|'indoors',
              sownAt?, transplantedAt?, status: 'planned'|'active'|'done'|'failed' }
Observation { id, plantingId, at, kind: 'stage_reached'|'note'|'photo'(v2),
              stage?, note? }                         // re-anchors the twin
WeatherDay  { date, tMinC, tMaxC, rainMm, source: 'history'|'forecast' }   // cached per garden
Task        { id, plantingId?, bedId?, type, title, why, dueDate,
              status: 'pending'|'done'|'snoozed'|'obsolete', generatedBy }  // rule id, for dedupe
```

## 4a. Garden layout & the planner

Units are **metric** (cm/m) throughout; bed dimensions and spacing are stored in cm. The chosen
placement model is **a grid scaffold backed by each crop's true spacing** — accurate underneath,
thumb-friendly on top.

**The model**

- A bed is drawn to scale from its real `widthCm × lengthCm`, overlaid with a grid of cells
  (default 30cm — the classic "square-foot" feel; cell size is a per-garden setting).
- Spacing is respected by *deriving* density from real spacing, never hand-placing plants. For a
  crop with in-row `spacingCm`, plants that fit in one cell = `floor(cellSize / spacingCm)²`
  (e.g. 30cm cell → 16 carrots @7cm, 4 lettuce @15cm, 1 broccoli @45cm).
- Crops larger than a cell (sprawling/climbing habits) claim a multi-cell block (e.g. a 2×2
  footprint for squash).
- **Rows** fall out of the same model: a 1-cell-wide footprint dragged along the bed holds
  `rowLength / spacingCm` plants.
- All of this is **pure functions over `spacingCm`** living in the planner module (no UI/storage
  coupling, heavily unit-tested): `plantsPerCell(crop, cellCm)`, `capacity(footprint, crop)`.

**Interaction (mobile-first)**

- Primary gesture is **tap-to-place**, not drag: tap a crop in the bottom tray, then tap or drag
  across cells to fill them. A slide-up cell sheet shows contents and lets you adjust count/clear.
- Pinch-zoom and pan the bed; large touch targets; haptic tick on placement.
- The crop tray is **filtered to what's plantable now** given the garden's frost dates, so the UI
  steers good choices instead of allowing out-of-season plantings.
- Live validation: can't over-fill a cell; per-bed remaining capacity shown as you go.

**Engagement — the layout *is* the twin's living map**

Rather than a static diagram, the bed renders each plant at its **current simulated size and
stage** (from the digital twin in §5): sprouts in spring, full plants by midsummer, fruit when
fruiting. This reuses the simulation instead of building a separate render path, and unlocks a
**season scrubber** — a time slider that animates the bed filling in and maturing across the
season from the twin's projections ("what will this bed look like in August? will the squash
smother the lettuce?"). Supporting touches: crop-family colour coding, a sun/shade gradient per
bed, illustrated per-habit plant sprites, and celebratory moments on first planting and first
harvest.

(Free-form resizable "patches" on a to-scale canvas are a richer desktop/V2 interaction; the
grid model above is the v1 build.)

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
  reliable than native. In v1 the in-app Today feed is the dependable channel; v2's notification
  service resolves this properly, with email as the channel that always works.
- **Background recompute** on a pure PWA is limited — in v1 the twin mainly updates on app open.
  Daily use is expected for a gardener, so acceptable; v2's notification service moves the daily
  recompute server-side so reminders arrive even when the app stays closed.
- **Indoor seedlings** don't experience outdoor weather. V1 models the indoor phase on calendar
  days at an assumed room temperature; GDD starts at transplant.
- **Where is the garden?** Frost dates and the weather feed need a location — onboarding asks, but
  if you tell me now I can tune the default catalog windows.
