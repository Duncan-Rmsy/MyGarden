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

- **Garden setup**: define beds (name, dimensions, sun exposure), set location → derive local
  first/last frost dates from historical weather (§4c).
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
  twin; flags problems (pests, nutrient deficiency, disease) with suggested actions — the
  *reactive* counterpart to §5b's predictive pest prompts.
- **Pest & predation pressure** (§5b): predictive slug and bird risk → timely protective prompts
  (dusk slug patrol, net fruit before it ripens), driven by weather and the twin's stage data;
  extensible to other pests as data + a small driver each.
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
              pestSusceptibility?: { pest, stages: Stage[], severity }[],  // for §5b (V2)
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
WeedState   { bedId, cohortStartedAt?, lastWeededAt?, seedBankFactor }      // per-bed weed twin (§5a)
Cultivation { id, bedId, at, amount: 'none'|'some'|'lots' }  // "hoed bed X"; re-anchors weed clock
PestSighting{ id, bedId, plantingId?, at, pest, severity }   // §5b (V2); raises local pest factor
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

## 4b. Crop catalog

The catalog is the dataset every other system reads from (planner spacing, twin GDD, weeds' canopy,
pests' susceptibility), so getting its shape right matters more than its initial size.

**How it ships and lives.** A curated `crops.json` ships with the app and is loaded into Dexie on
first run. Catalog entries are read-only seed data; a user can **clone** one to make a personal
variety (e.g. "Gardener's Delight tomato") with tweaked numbers — which is also the landing spot
for V2's seed-packet photo intake (a scanned packet pre-fills a cloned entry).

**Per-crop data** (fields defined in §4, `Crop`): name/variety/family, `spacingCm`/`rowSpacingCm`,
`habit`, sow depth, days-to-germinate and days-to-maturity ranges, `baseTempC` + optional GDD stage
thresholds, frost tolerance, pest susceptibility (V2), care rules, and **sow windows expressed
relative to frost dates** — this is the key idea: a crop says "sow indoors `lastFrost −6w..−4w`,
transplant `lastFrost +1w..+3w`," so the same catalog auto-localises to any garden once frost dates
are known (§4c). Nothing in the catalog hard-codes calendar dates.

**Data quality strategy** (from the §8 risk): every crop gets day-range fallbacks immediately;
GDD base temps and per-stage thresholds are added first for the ~10 crops actually grown, with
everything else running on day-ranges until upgraded. Each estimate carries its confidence so the
UI can be honest about which crops are precisely modelled.

**Proposed v1 starter set (~40), temperate/UK-leaning — to be confirmed/pruned:**
tomato, chilli/pepper, courgette, cucumber, winter squash/pumpkin, aubergine, runner bean,
bush/French bean, pea, broad bean, lettuce, spinach, chard, kale, cabbage, broccoli/calabrese,
cauliflower, Brussels sprout, pak choi, rocket, carrot, beetroot, parsnip, radish, turnip, onion,
shallot, garlic, leek, spring onion, potato, sweetcorn, celery/celeriac, fennel, strawberry,
basil, coriander, parsley, dill, mint, thyme, rosemary, chives.

## 4c. Onboarding & climate derivation

The whole calendar is relative to frost dates (§4b), so onboarding's job is to establish a location
and derive good local frost dates — then create the first bed.

1. **Location** — browser geolocation *or* place-name search → store `lat/lon` only (stays
   on-device; no account).
2. **Derive frost dates from history, not a zone table.** Pull ~10 years of daily minimum
   temperatures for that point from Open-Meteo's free historical API (no key), then compute the
   average **last spring** and **first autumn** dates the daily min crosses 0°C. This gives real
   local frost dates *anywhere in the world* without a US-centric hardiness-zone database, and uses
   the same weather source the twin already depends on. (An approximate hardiness zone can be shown
   for reference, but the planner runs on the frost dates.)
3. **Confirm/adjust** — present the derived dates as editable; gardeners often know their own
   microclimate and a frost pocket or warm wall can shift these by weeks.
4. **Notifications & units** — request notification permission (best-effort, §8); units are metric.
5. **First bed** — name, `widthCm × lengthCm`, sun exposure → straight into the planner (§4a).

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
- `weed_window` — a weed flush is reaching the easy-to-hoe stage in a bed (see §5a): "hoe bed X
  in the next ~N days while the weeds are tiny."
- `pest_alert` (V2, §5b) — driver risk crosses threshold with a vulnerable planting present, e.g.
  `slug_watch` (high-risk night + young seedlings) or `bird_net` (before fruit ripens).

## 5a. Modelling weeds

A second, lightweight twin running per **bed** (not per planting), because the actionable insight
is "go hoe this bed now." It reuses the same weather feed and the observation-anchoring pattern as
the crop twin, so it adds one bed-level state, one rule, and one kind of check-in — not a new
engine.

**The insight being modelled:** weeds are trivially killed with a hoe at the "white thread" /
cotyledon stage and become a chore once rooted, and germination comes in **flushes** triggered by
moisture and warmth. So the goal is to predict the start of each easy-to-hoe window and prompt
then, with a frequency that rises and falls with the weather — exactly as in the field.

**How it works:**

1. **Flush trigger**: a rainfall (or logged irrigation) event over a threshold starts a weed
   cohort for that bed.
2. **Flush clock**: the cohort accumulates GDD (weeds have a low base temp) from the moisture
   event; after a small threshold it reaches the hoeable thread stage — the **start of the
   optimal window** — and after a larger one it's established and needs hand-pulling (window
   closed). Warm + moist → window opens in days and recurs often; cool or dry → slow or paused.
   This is what makes the prompt frequency track the weather.
3. **Reset on action**: logging a "hoed/weeded bed X" check-in re-anchors the clock (like a crop
   observation re-anchors growth). The user also reports how much was there (lots/some/none),
   which tunes a **per-bed seed-bank intensity factor** over time — the same correction-factor
   idea used for crops, since weed pressure is wildly garden-specific and can't be known up front.
4. **Canopy suppression**: weed pressure in a planting's footprint falls once that crop's canopy
   closes — and the crop twin already tracks each plant's simulated size, so suppression falls out
   of existing state. Weeding prompts taper as beds fill in.

**Caveat:** the model predicts *timing of flushes*, not which species or how dense your seed bank
is; early estimates lean on the per-bed factor learned from your weeding check-ins, and the prompt
is always framed as "worth a quick look," never a guarantee.

**Scope note:** the core flush-clock + `weed_window` prompt is small enough to land in the v1 twin
since it reuses the GDD/rainfall engine. The seed-bank learning and canopy-based suppression are
natural early-V2 refinements. The advanced *stale-seedbed* workflow (deliberately flush-and-kill a
bed before sowing) is a V2/V3 technique.

## 5b. Pest & predation pressure

Same idea as weeds — risk = environmental/stage **driver** × per-crop **vulnerability** → a timely,
specific prompt — but generalised so any pest is "data + a small driver function." This is the
*predictive/preventive* half of pest handling; it pairs with the *reactive* photo diagnosis in V2
(snap the damage → identify → treat). Two worked examples, deliberately different shapes:

- **Slugs — weather-driven.** A risk index rises with recent moisture, mild temperatures (active
  roughly 5–20°C), and humidity, peaks at night, and concentrates in spring/autumn; it collapses
  in drought and frost. It only *matters* where vulnerable targets exist — soft young seedlings
  (lettuce, brassicas, beans, basil), and the crop twin already knows which plantings are young,
  so vulnerability falls out of existing state and fades as plants toughen. Prompt has tight
  timing: on a high-risk evening with susceptible seedlings present → "go out after dusk to
  hand-pick, or set traps / wool pellets / copper tape tonight."
- **Birds — stage-driven, two windows.** Risk isn't really weather-led; it's tied to stages the
  twin already projects: (1) at germination/seedling, pigeons pull brassicas, peas, lettuce →
  prompt to net/cloche from sowing until established; (2) at the ripening/harvest window for
  strawberries, currants, cherries, tomatoes → prompt to net *before* fruit colours up. The twin's
  projected dates make both prompts land at the right time, not too late.

**Mechanism (shared):** each pest = a `driver(weather, season, time-of-day)` function + a target
map (`Crop.pestSusceptibility` weighted by stage). Per bed/planting, `risk = driver × vulnerability`;
when it crosses a threshold and a vulnerable planting is present, emit a specific protective task.
A **pest-sighting check-in** ("found slugs / bird damage on bed X") raises that bed's local pest
factor and can escalate prompts immediately — the same per-bed learning used for weeds. This makes
the system extensible: aphids and cabbage-white (GDD-driven), carrot fly (calendar/companion),
etc. are each just another driver + susceptibility data, no new engine.

**Scope note:** the framework plus slugs and birds sit in **early V2**, grouped with the photo
pest-ID already planned there to form one coherent pest module — and because per-crop
`pestSusceptibility` is best authored once the v1 catalog exists. The lift is small (it reuses the
weather feed and twin stage data), so slugs in particular could pull into v1 if you want pest
prompts from day one.

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
| 1 | Garden setup | Onboarding, location → frost dates from historical weather (§4c), bed CRUD | small |
| 2 | Crop catalog | `crops.json` seed data for ~40 crops + clone-to-customise, catalog browsing UI (§4b) | medium (data entry heavy) |
| 3 | Planner | Bed grid, crop placement, spacing validation, planting calendar | medium |
| 4 | Twin core | Weather client + cache, GDD engine, stage estimation, observations/anchoring, weed flush-clock (§5a) — pure TS + tests first | medium |
| 5 | Task engine | Rules above (incl. `weed_window`), idempotent generation, Today view | medium |
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
- **Weed pressure is garden-specific** (§5a). The flush *timing* model is generic, but how many
  weeds actually appear depends on your unedited seed bank. Mitigation: learn a per-bed intensity
  factor from weeding check-ins and frame prompts as "worth a look," not certainties.
- **Where is the garden?** Onboarding derives frost dates from historical weather at runtime
  (§4c), so no static defaults are needed — but knowing your location now lets me sanity-check the
  derivation and the catalog's sow windows against a real climate.
