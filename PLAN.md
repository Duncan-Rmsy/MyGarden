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

### V1 — core loop (this build): the shortest path to a trustworthy daily prompt

The guiding cut: ship the smallest thing that earns a gardener's trust with *timely, correct
prompts*, then add depth. Everything below is on the critical path to that; richer modelling
(weeds, pests, capacity planning, the full-catalog GDD upgrade) is deliberately held for V1.5.

- **Garden setup**: define beds (name, dimensions, sun exposure), set location → derive local
  first/last frost dates **and per-garden climate normals** from the same historical-weather pull
  (§4c). Location is always asked at onboarding and never hard-coded.
- **Crop catalog**: the full curated set of ~40 crops ships for the *planner* (spacing, frost-
  relative windows, habit — the cheap fields), but only the **~10 crops actually grown first are
  hand-tuned with real GDD + per-stage thresholds**; the rest run day-range fallbacks until
  upgraded (§4b, §8). Depth where it's used, breadth where it's not.
- **Planting planner**: tap-to-place crops onto a to-scale grid layout of each bed (see §4a),
  with spacing respected via per-crop density and a generated planting calendar (sow indoors /
  direct sow / transplant windows computed from frost dates).
- **Plantings & start method**: when you actually sow/transplant, record it — this instantiates a
  plant (or row) in the twin. The start-method choice and the indoor→transplant lifecycle with a
  frost-free indoor climate are in scope (§4e); *capacity warnings* for propagation zones are held
  for V1.5.
- **Mid-season start**: the app must be usable by gardeners who already have crops in the ground
  when they discover it — this is the majority of early adopters and it cannot be deferred.
  During onboarding (or any time from the Beds screen), tapping "I already have this planted"
  opens a quick-entry form: approximate sow/plant date (can be left vague — "about 4 weeks ago")
  and current visual stage (a simple picture picker: seedling / small plant / bushy / flowering /
  fruiting). These are saved as observation anchors that re-anchor the twin at the selected stage;
  the twin then projects forward from that point as normal. The twin records the entry as
  user-supplied, not model-derived, so the UI shows stage confidently rather than estimating from
  day zero. V2 upgrades this to a photo of the bed — Claude vision estimates the stage for each
  visible planting without manual entry.
- **Digital twin (rules-based)**:
  - Growth model driven by **growing degree days (GDD)** accumulated from daily weather
    (Open-Meteo, free, no API key), with a **daily upper cap** so heat doesn't over-accumulate and
    a calendar-days fallback when offline.
  - **Projects past the 16-day forecast** by blending the live forecast into the garden's climate
    normals (§4c), so harvest dates months out are estimable — with a confidence band that widens
    the further ahead it projects.
  - Each planting advances through stages: *seed → germinated → seedling → vegetative →
    flowering → fruiting → harvest-ready → done*.
  - Manual check-ins ("it germinated today", "first flower") **re-anchor** the simulation, and the
    twin **records what it had predicted vs. what you observed** and surfaces the delta — honesty
    as a feature that builds trust over the season.
- **Task engine**: stage transitions and crop rules emit tasks with due dates; recurring care
  tasks (watering cadence by crop and recent rainfall); **per-crop** frost warnings from the
  forecast (threshold by `frostTolerance`, not a flat 0°C).
- **Today view**: the home screen — a **"your garden today" narrative card** that turns the twin's
  state into one human sentence, what needs doing today/this week, a status card per bed, and
  celebratory moments (first sprout, first harvest).
- **Reminders**: a **tiny daily email cron** is the primary, reliable channel (it sidesteps flaky
  PWA/iOS push); the in-app Today feed always works; web push is best-effort on top (§3, §8).

### V1.5 — depth (fast follows, each additive and off the critical path)

- **Full-catalog GDD upgrade**: extend precise base temps + per-stage thresholds across the ~40
  crops, prioritised by what users actually plant (favourites + history, §4d, §8).
- **Weed flush-clock twin (§5a)**: per-bed hoeing prompts driven by the same GDD/rainfall engine.
- **Season scrubber (§4a)**: the time-slider animation over the twin's projections — *pull this
  forward the moment the bed renders from the twin, it's cheap delight on work already done.*
- **Propagation-zone capacity planning**: time-phased slot warnings ("8 trays planned, windowsill
  holds 4"), beyond v1's peak-occupancy approximation (§4e).

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
- **Background twin (server-side recompute)**: V1 already ships the tiny daily email cron for
  reminders; V2 grows it into a fuller server-side recompute of the twin so richer prompts (pest
  risk, evapotranspiration watering) arrive even when the app stays closed, still delivered by
  email with web push best-effort.
- Natural-language check-ins and Q&A ("the leaves are yellowing at the edges — what's wrong?").
- Weather-adjusted watering (evapotranspiration model rather than fixed cadence).
- Succession planting suggestions and bed-rotation warnings (don't follow tomatoes with potatoes).
- **Cross-season learning**: the per-garden calibration offset (§5 step 3) is surfaced to the user
  ("your garden typically runs ~5 days ahead of the model — applying this to this season's
  projections") and extended to a full per-garden profile. Per-bed depth and cultivation-method
  adjustments are also refined from observed vs. predicted timing across seasons.
- **Sun exposure auto-suggestion**: given the garden's `aspect`, lat/lon, and bed positions,
  compute approximate daily insolation per bed and pre-fill each bed's `sunExposure` rating as a
  suggestion the user can override. A scan of the garden (photo or short video) lets Claude vision
  identify shade-casting structures (fences, trees, buildings) and refine the estimates.

### V3 — Ideas parking lot

- **Variety advisor**: recommends specific varieties for your climate, space, and goals, and
  searches which nearby garden centres or seed retailers stock them (web search / retailer
  integrations).
- **Rotation-aware season kick-off**: at the start of a season, proposes which crop families go
  in which beds based on previous seasons' plantings (the `Crop.family` field and per-bed
  planting history in the data model already support this). Builds on V2's rotation warnings:
  V2 warns, V3 proposes.
- **Monetisation — phase 1 (affiliate)**: when a task recommends a product ("apply slug pellets",
  "feed with liquid tomato fertiliser"), link to a curated, tested product via an affiliate
  programme. Task-triggered and context-specific — feels like expert advice, not a store. The
  variety advisor (above) extends the same affiliate channel to seed/seedling sourcing.
- **Monetisation — phase 2 (curated retail)**: if affiliate volume justifies it, stock and ship a
  small, edited selection of gardening supplies directly — transforming the task feed into a
  one-tap supply chain. Only worthwhile at meaningful scale.
- **Cross-user model calibration**: with sufficient opted-in anonymous observations (§8 data
  flywheel), cluster gardens by climate signature and soil type, then use aggregated per-stage
  deltas to improve the catalog's GDD thresholds — the catalog gets more precise without any
  single user maintaining it.
- **Precision sun mapping**: a short video walk around the garden at three times of day lets Claude
  vision construct a per-bed shade map tied to the season, replacing manual `sunExposure` input
  and enabling micro-climate-aware crop suggestions (e.g. "the north end of bed 2 gets < 4 hours
  — lettuce and spinach only").
- Harvest logging and yield history; year-over-year variety comparison.
- Seed inventory with "sow by" expiry tracking.
- Sharing/printing the garden plan; multi-garden support.
- Companion-planting hints in the planner.

## 3. Architecture

**Local-first PWA.** All data lives on-device (IndexedDB); the app's own state never leaves the
device and there are no accounts. The only network calls are to the weather API and to one
**deliberately tiny notification cron** (pulled into v1) that recomputes the day's tasks and sends
an email reminder — the reliable channel that PWA/iOS push can't guarantee. The cron needs only
the task feed, not the full dataset, so the local-first model is unchanged. (A future, strictly
opt-in "contribute anonymous stage observations" channel — the one piece of cloud that would let
the catalog's GDD data improve across gardens — is noted as a deliberate fork in §8, not built in
v1.)

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
| Notifications | One scheduled serverless function (cron) → email | Reliable where push isn't; tiny, stateless |

The key architectural rule: **the planner, twin, and task engine are pure TypeScript modules with
no React or storage imports.** Given (catalog, plantings, weather history, observations) they
return (stage estimates, tasks). This makes them trivially testable and lets V2 swap in smarter
models without touching the UI.

## 4. Data model

```ts
Garden      { id, name, lat, lon, lastFrostDate, firstFrostDate, hardinessZone,
              aspect?: 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW' }  // garden orientation; used for per-bed sun suggestions
Bed         { id, gardenId, name, widthCm, lengthCm, sunExposure: 'full'|'partial'|'shade',
              depthCm?,                                // raised beds/containers; affects root depth, drainage, watering
              cultivationMethod: 'no-dig'|'in-ground'|'raised-bed'|'container' }
PropagationZone { id, gardenId, name, kind: 'windowsill'|'propagator'|'greenhouse',  // §4e nursery
              slotCount, climate: 'indoor'|'greenhouse' }   // frost-free; greenhouse = outdoor + offset
Crop        { id, name, variety?, family,            // catalog entry (read-only seed data)
              spacingCm, rowSpacingCm?, sowDepthCm,
              habit: 'compact'|'row'|'sprawling'|'climbing',  // default placement + which sprite
              daysToGerminate: [min,max],
              daysToMaturity: [min,max], gddToMaturity?, baseTempC, maxTempC?,  // maxTempC caps daily GDD
              frostTolerance: 'hardy'|'semi'|'tender', frostKillTempC?,  // damage threshold; falls back from tolerance
              photoperiodSensitive?: boolean,          // bolts/bulbs by daylength — GDD-only mispredicts (§5)
              pestSusceptibility?: { pest, stages: Stage[], severity }[],  // for §5b (V2)
              startMethods: ('direct'|'indoor'|'buy')[],  // viable ways to start this crop (§4e)
              indoorWeeks?: [min,max],                 // weeks raised in propagation before plant-out
              sowWindows: RelativeWindow[],           // indoor vs direct windows, frost-relative
              stages: StageDef[],                     // gdd or day thresholds per stage
              careRules: CareRule[] }                 // watering cadence, feeding, thinning…
Planting    { id, bedId, cropId,
              footprint: {x,y,w,h},                   // rect of grid cells the planting occupies
              plantCount,                             // derived from spacing × area, then stored
              startMethod: 'direct'|'indoor'|'buy-seedling',          // §4e
              propagationZoneId?, slots?,             // nursery home + slots used during indoor phase
              sownAt?, transplantedAt?, status: 'planned'|'active'|'done'|'failed' }
Observation { id, plantingId, at, kind: 'stage_reached'|'note'|'photo'(v2),
              stage?, note? }                         // re-anchors the twin
WeedState   { bedId, cohortStartedAt?, lastWeededAt?, seedBankFactor }      // per-bed weed twin (§5a)
Cultivation { id, bedId, plantingId?, at,
              kind: 'hoed'|'fertilised'|'watered-manually',
              amount?: 'none'|'some'|'lots',           // for hoed
              fertType?: 'organic'|'liquid'|'granular'|'slow-release' }  // for fertilised
PestSighting{ id, bedId, plantingId?, at, pest, severity }   // §5b (V2); raises local pest factor
CropPref    { gardenId, cropId, favourite?, hidden? }        // §4d; history-derived favourites computed from Plantings
WeatherDay  { date, tMinC, tMaxC, rainMm, source: 'history'|'forecast'|'normal' }  // 'normal' = day-of-year climatology for forward projection (§4c)
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
- The crop tray is the **what-to-plant picker** (§4d) — in-season suggestions for the location,
  favourites first, plus search to add anything — so the UI steers good choices without blocking
  out-of-season ones the user deliberately adds.
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

**Multiple beds and shapes.** A garden typically has several beds — the planner supports any number
per garden, each independently sized, named, and sun-rated. V1 bed shapes are rectangles (the vast
majority of real beds); irregular shapes (L-shaped, keyhole, circular) are a V2 canvas extension.

**Bed depth.** `depthCm` is recorded for raised beds and containers — it doesn't affect the 2D plan
view, but it does affect the twin: shallower beds warm faster in spring (earlier sow dates) and dry
out faster (higher watering frequency). Containers (≤ ~30 cm deep) flag crops with deep root
systems as unsuitable.

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

The full set below **ships with the app**; the user never prunes it up front — personalisation
happens in-app through suggestions and favourites (§4d).

**v1 catalog set (~40), temperate/UK-leaning:**
tomato, chilli/pepper, courgette, cucumber, winter squash/pumpkin, aubergine, runner bean,
bush/French bean, pea, broad bean, lettuce, spinach, chard, kale, cabbage, broccoli/calabrese,
cauliflower, Brussels sprout, pak choi, rocket, carrot, beetroot, parsnip, radish, turnip, onion,
shallot, garlic, leek, spring onion, potato, sweetcorn, celery/celeriac, fennel, strawberry,
basil, coriander, parsley, dill, mint, thyme, rosemary, chives.

## 4c. Onboarding & climate derivation

The setup journey is **where → how big → what to plant**: establish location (which pulls the
weather and derives frost dates), size up the growing space, then choose crops.

1. **Location** — browser geolocation *or* place-name search → store `lat/lon` only (stays
   on-device; no account). This single answer drives everything downstream: the weather feed and
   the frost dates the whole calendar is relative to (§4b).
2. **Derive frost dates *and* climate normals from history, not a zone table.** Pull ~10 years of
   daily min/max temperatures for that point from Open-Meteo's free historical API (no key). From
   it, compute (a) the average **last spring** and **first autumn** dates the daily min crosses a
   frost threshold, and (b) **per-garden climate normals** — a day-of-year average tMin/tMax curve.
   The frost dates anchor the calendar; the normals let the twin **project GDD past the 16-day
   forecast** (§5) — one pull, used three ways (frost dates, forward projection, confidence). This
   gives real local figures *anywhere in the world* without a US-centric hardiness-zone database.
   (An approximate hardiness zone can be shown for reference, but the planner runs on the frost
   dates.) Present the result as **editable** — gardeners know their own microclimate, and a frost
   pocket or warm wall shifts these by weeks.
3. **Growing space** — first bed: name, `widthCm × lengthCm`, sun exposure, cultivation style
   (No-dig / In-ground / Raised bed / Container — this adjusts the weed model's starting seed-bank
   factor and the watering/fertilising task cadence), and optionally `depthCm` for raised beds or
   containers. Also ask: *which direction does your garden face?* (N/S/E/W — optional; used to
   suggest per-bed sun exposure and, in V2, to auto-compute approximate insolation per bed). Add
   more beds any time; the planner is not locked to one bed. Optionally add a **propagation zone**
   (windowsill / propagator / greenhouse) with a slot capacity (§4e); can be added later.
3b. **Already planted?** — if crops are already in the ground, the app prompts: "Do you have
   anything growing right now?" If yes, a condensed quick-entry form appears for each existing
   crop: approximate date planted (a calendar with a "roughly N weeks ago" shortcut) and current
   stage from a picture-picker (seedling / small plant / vegetative / flowering / fruiting). These
   seed the twin with observation anchors so it projects forward from *now* rather than from day
   zero. Optional and skippable — users can also add existing plantings any time from the Beds
   screen. V2: a photo of the bed lets Claude vision estimate the stage automatically.
4. **What to plant** — the crop-selection step (§4d): suggestions for the season and location,
   plus add-your-own and favourites → straight into the planner (§4a).
5. **Notifications** — request permission (best-effort, §8). Can be deferred.

## 4d. Choosing what to plant

The crop step isn't a list the user types up front — the app ships the full catalog (§4b) and its
job is to surface the *right* subset, while always letting the user add anything. The picker blends
three sources:

- **In-season suggestions for this location** — catalog crops whose frost-relative sow/plant window
  (§4b) is open now or opening soon for *this* garden's derived frost dates. Purely computed from
  data already present (today's date + frost dates), so it needs no extra input and naturally
  changes through the year. Each suggestion also carries its recommended **start method** for right
  now — seed indoors, direct sow, or buy a seedling (§4e).
- **Add what you have** — full-catalog search to drop in any crop regardless of season (you may
  already be holding the seeds), plus clone-to-customise for a specific variety (and, in V2, the
  seed-packet/tag photo scan that pre-fills the entry).
- **Favourites** — surfaced first, from two origins: **user-starred** crops, and **history-derived**
  ones that recur from prior seasons' plantings (grew tomatoes last year → suggested again). Both
  feed the same favourites rail.

The chosen crops populate the planner's tray (§4a) and the planting calendar. Favourites and
history also rank the suggestions over time, so the app gets more personal each season without ever
asking the user to maintain a list.

**It's a recurring tool, not a one-time step.** The same picker is reachable any time from an
established garden. When a planting finishes — harvested or done — its cells free up, and the app
surfaces a "what next for this space?" prompt: in-season suggestions for the *now-empty* cells,
filtered by what can still mature before the first-frost date, and respecting **rotation** (don't
follow a crop with the same family — the V2 rotation warning, building toward the V3 rotation
planner). This is the entry point for **succession planting** (V2): a freed summer bed becomes
autumn salad or a cover crop. So §4d is used at onboarding to fill the garden, and revisited all
season as space opens up.

## 4e. Start method & the propagation (nursery) space

Choosing a crop (§4d) isn't enough — *how* you start it decides what the twin simulates and where
the plant physically lives early on. For each chosen crop, given the date and the garden's frost
dates, the picker recommends the best start method:

- **Direct seed** — sow straight into the bed once its direct-sow window opens; the twin tracks it
  outdoors from sowing.
- **Seed indoors** — for tender or slow crops started before it's warm enough outside (tomato,
  chilli, brassicas…). The seedling is raised in a **propagation zone** and only planted out once
  frost risk passes *and* it's big enough, with a harden-off step first.
- **Buy a seedling** — when it's too late to start from seed in time (or the crop is simply easier
  bought in), the picker says so and schedules a "buy seedling" task near the plant-out window; the
  twin starts at the seedling stage, skipping sowing and germination.

**The propagation zone is a first-class place in the twin** — a lightweight indoor/greenhouse
location with a **slot capacity** (module trays / pots) and a **climate assumption** (indoor room
temp, frost-free; or a greenhouse modelled as outdoor weather plus a warmth offset and frost
protection). A seed-started plant therefore has **two homes over its life**: it occupies a nursery
slot from sowing until plant-out, then **moves** to its bed footprint at transplant — at which
point the twin switches from the zone's climate to the bed's outdoor weather. The destination bed
space is reserved in the plan from the start but only fills on the season scrubber (§4a) at the
transplant date, while the nursery shows the seedlings beforehand.

**Capacity at both ends.** Like a bed's area, a propagation zone has finite slots, so the plan can
warn "you've planned 8 trays of indoor seedlings but your windowsill holds 4." Because seedlings
vacate their slots at plant-out, this is time-phased (v1 approximates with peak concurrent
occupancy).

**Scope:** start-method choice, the indoor→transplant lifecycle, and a simple frost-free indoor
climate are **v1** (the §8 indoor-seedling note already commits to modelling the indoor phase).
Propagation-zone **capacity warnings** (and the time-phased version of them) and greenhouse
weather-offset modelling are **V1.5 / early V2** — v1 ships the lifecycle without the slot-limit
prompts.

## 5. The digital twin — how the simulation works

1. **Accumulate heat**: for each active planting, sum daily GDD =
   `max(0, min((tMin + tMax)/2, maxTempC) − baseTempC)` from its anchor date — the `maxTempC` cap
   stops a heatwave over-accumulating. Use cached weather history and the live forecast, and
   **beyond the ~16-day forecast horizon fall back to the garden's climate normals (§4c)** so
   projections can reach a harvest months out. While a seed-started plant is in its propagation
   zone (§4e), the twin uses that zone's climate (frost-free indoor temp, or greenhouse = outdoor
   + offset) instead of outdoor weather, switching to the bed's outdoor weather at transplant.
2. **Map to stage**: compare accumulated GDD against the crop's stage thresholds → current
   estimated stage + projected dates for upcoming stages (e.g. harvest window). Projected dates
   carry a **confidence band that widens with distance** (near-term on real forecast, far-term on
   normals).
3. **Anchor on reality**: an observation like "germinated on May 3" resets the baseline — the twin
   trusts you over the model. The twin **stores what it had predicted alongside what you observed**
   and shows the delta ("predicted Jun 18, you saw Jun 22"); that drift both builds visible trust
   and biases the planting's future predictions (a simple per-planting correction factor).
   **Learning across seasons.** After a full growing season the per-planting deltas accumulate into
   a per-garden calibration offset — "your conditions consistently run 5 days ahead of the base
   model" — which is pre-applied to all next-season estimates for that garden, improving accuracy
   year-on-year without any extra input. This is user-level learning that stays on-device. (V2
   extends it to a full per-garden profile; V3 opens an opt-in anonymous contribution channel —
   see §8 data flywheel note.)
4. **Fallback**: if a crop has no GDD data or weather is unavailable, fall back to
   days-to-maturity ranges. Every estimate carries a confidence level shown in the UI.
5. **Photoperiod caveat**: pure GDD doesn't capture **daylength-driven** behaviour — onion bulbing,
   and bolting in lettuce/spinach/brassicas. Crops flagged `photoperiodSensitive` (§4) mark their
   bolt/bulb timing as approximate (and can fold a daylength signal in later, since lat + date are
   known). Don't let the twin promise a precise date it can't model.
6. **Emit tasks**: a nightly recompute (the v1 email cron, plus on app open / background sync where
   supported) diffs the twin state against existing tasks and creates/expires tasks idempotently
   via `generatedBy` keys.

Example task rules for v1:

- `sow_indoors` / `direct_sow` — the crop's indoor or direct-sow window is open (per its chosen
  start method, §4e).
- `buy_seedling` — for buy-seedling crops, prompt to acquire a plant near its plant-out window.
- `propagation_capacity` — planned indoor seedlings exceed a propagation zone's slots (§4e).
- `germination_check` — expected germination window reached, ask user to confirm (this doubles as
  the check-in that anchors the twin).
- `thin_seedlings`, `transplant_window`, `harden_off` (7 days before transplant window).
- `water` — cadence per crop, skipped if recent rainfall > threshold.
- `frost_warning` — forecast min temp below the planting's **per-crop** threshold (from
  `frostTolerance`/`frostKillTempC`), not a flat 0°C.
- `harvest_window` — projected maturity reached.
- `fertilise` — based on crop care rules and elapsed time since the last logged fertilisation (or
  since potting for containers); liquid feeds for fast crops, slow-release for long-season ones.
  In V2, a logged fertilisation event adds a temporary growth-rate multiplier to the twin's forward
  projection for that planting (similar to the observation correction factor).
- `weed_window` (V1.5, §5a) — a weed flush is reaching the easy-to-hoe stage in a bed: "hoe bed X
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

**Cultivation method adjusts starting pressure.** A no-dig bed (compost mulch, no tillage) starts
with a substantially lower `seedBankFactor` than an in-ground bed, because disturbing the soil
surface is what brings buried weed seeds into the germination zone. In-ground beds start moderate
and learn downward from check-ins. Containers start near-zero. This means the model's first
weed-window prompts are calibrated to the bed's actual management style from day one.

**Caveat:** the model predicts *timing of flushes*, not which species or how dense your seed bank
is; early estimates lean on the per-bed factor learned from your weeding check-ins, and the prompt
is always framed as "worth a quick look," never a guarantee.

**Scope note:** the core flush-clock + `weed_window` prompt is a **V1.5** fast-follow — it reuses
the v1 GDD/rainfall engine, so it's cheap to add once the crop twin is solid, but it's off the
critical path to the core loop. The seed-bank learning and canopy-based suppression are early-V2
refinements; the advanced *stale-seedbed* workflow (deliberately flush-and-kill a bed before
sowing) is a V2/V3 technique.

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

1. **Today** (home): a **"your garden today" narrative card** (twin state → one human sentence) up
   top, then the task list for today/this week with done/snooze; weather strip; frost alerts;
   celebratory moments on first sprout/first harvest.
2. **Planner**: pick a bed → grid of cells → tap to assign crops; calendar view of sow/transplant
   windows for everything planned.
3. **Beds**: bed list → bed detail showing each planting with a stage progress bar and projected
   harvest date.
4. **Plant detail**: twin timeline (past stages, current estimate, projections with a widening
   confidence band), **predicted-vs-observed deltas**, check-in button, observation history, crop
   care notes.
5. **Settings/Onboarding**: location (geolocate or search), frost dates (suggested, editable),
   notification permission.

## 7. Milestones

| # | Milestone | Contents | Rough size |
|---|---|---|---|
| 0 | Scaffold | Vite + React + TS + Tailwind + Dexie + PWA shell, CI (lint, typecheck, vitest) | small |
| 1 | Garden setup | Onboarding, location → frost dates **+ climate normals** from historical weather (§4c), bed CRUD | small |
| 2 | Crop catalog | `crops.json` for ~40 crops (planner fields) with **~10 hand-tuned for GDD**, clone-to-customise, browsing UI (§4b) | medium (data entry heavy) |
| 3 | Planner | Bed grid, what-to-plant picker (§4d), crop placement, spacing validation, planting calendar, **mid-season quick-entry** (existing plantings from current stage — §4c step 3b) | medium |
| 4 | Twin core | Weather client + cache + **normals projection**, capped GDD engine, stage estimation, propagation→transplant (§4e), observations/anchoring + **predicted-vs-actual** — pure TS + tests first | medium |
| 5 | Task engine | Core rules (sow, harden_off, transplant, water, **per-crop** frost_warning, harvest_window), idempotent generation, Today view + **narrative card** | medium |
| 6 | Notifications | **Daily email cron (primary)** + in-app feed + best-effort web push, nightly recompute | small |
| 7 | Polish | Plant detail timeline, empty states, install prompt, offline hardening | small |

**V1.5 (fast follows, §2):** full-catalog GDD upgrade · weed flush-clock twin (§5a) · season
scrubber (§4a) · propagation-zone capacity warnings (§4e). Pest module (§5b) remains V2.

**M_IMG — crop SVG icons (deferred, post-M4):** replace the colored-initial `CropAvatar`
placeholders with proper SVG illustrations. Source artwork from OpenMoji/Twemoji for the ~20
crops that have a matching emoji (tomato, carrot, lettuce, broccoli, courgette, aubergine, potato,
onion, garlic, sweetcorn, pepper, pumpkin, strawberry, bean…); hand-create matching-style SVGs
for the remaining ~20 (beetroot, spinach, basil, parsnip, turnip, radish, cauliflower, Brussels
sprouts, celery, fennel, pea, spring onion, raspberry, chard, etc.). Store as
`/public/crops/{cropId}.svg`; `CropAvatar` falls back to the colored initial when the file is
absent. All SVGs must be offline-safe (bundled, not CDN).

**M0.5 — scaffold reconciliation (do first, before M1):** the shipped M0 scaffold predates this
plan revision, so align it with the updated data model (§4) and twin (§5) before building on it —
add `maxTempC` (and apply the GDD upper cap in `src/domain/gdd.ts`), `frostKillTempC`,
`photoperiodSensitive`, and the `'normal'` `WeatherDay.source` to `src/data/types.ts`. Small,
mechanical, and keeps code and plan from drifting.

Each milestone ends usable: after M3 you have a real planning tool even with no twin; after M5
the app fulfils the core promise.

## 8. Risks & open questions

- **Crop data quality is the product.** GDD thresholds per stage are scattered across extension
  publications and vary by variety. Mitigation: start with day-range fallbacks for all crops and
  upgrade to precise GDD data for the crops users actually plant first — and the app already knows
  those from favourites and planting history (§4d), so the priority list is self-revealing rather
  than something the user must declare.
- **iOS web push** requires the PWA installed to the home screen (iOS 16.4+) and is unreliable.
  Resolved in v1, not deferred: the **daily email cron is the primary channel** and the in-app
  Today feed always works, so reminders don't depend on push at all; web push is a best-effort
  bonus. V2 grows the same cron into a richer server-side recompute.
- **Background recompute** on a pure PWA is limited, so v1's **email cron does the daily recompute
  server-side** (just the task feed) and the app also recomputes on open. Reminders therefore
  arrive even when the app stays closed; V2 deepens what the server recompute models.
- **Indoor seedlings** don't experience outdoor weather (§4e). V1 models the propagation phase on
  the zone's assumed (frost-free) climate; the twin switches to outdoor weather at transplant.
- **Weed pressure is garden-specific** (§5a). The flush *timing* model is generic, but how many
  weeds actually appear depends on your unedited seed bank. Mitigation: learn a per-bed intensity
  factor from weeding check-ins and frame prompts as "worth a look," not certainties.
- **Photoperiod, not just heat.** Onion bulbing and bolting (lettuce, spinach, brassicas) are
  daylength-driven, and pure GDD will mispredict them. Mitigation: flag `photoperiodSensitive`
  crops, label their bolt/bulb timing "approximate," and optionally fold a daylength term in later
  (lat + date are already known). Affects when, not whether, those crops are usable.
- **Data flywheel vs. local-first (a deliberate fork).** With no accounts or telemetry, the stage
  observations that would calibrate the catalog's GDD data never leave the device — so the catalog
  can't learn across gardens. For a single-garden tool that's fine. If the ambition grows, the one
  compounding cloud feature worth adding is a **strictly opt-in, anonymous "contribute stage
  observations"** channel. Flagged now so observations are modelled as a potential asset, not built
  in v1.
- **Cultivation method mismatch.** The weed model assumes a generic outdoor soil profile; no-dig
  and container growing behave very differently. Mitigation: `cultivationMethod` initialises the
  `seedBankFactor` appropriately from day one, and check-in learning refines it quickly.
- **Fertilisation complexity.** A logged fertilisation event is easy to capture but hard to model
  precisely (nutrient release curves vary by product and soil). V1 records the event and shows it
  in history; V2 applies a simple growth-rate multiplier for liquid feeds (fast uptake) and a
  duration-weighted boost for slow-release. Don't over-claim the twin's precision here.
- **Sun exposure accuracy.** User-reported `sunExposure` is a rough self-assessment; `aspect` gives
  a directional prior but ignores local obstructions (neighbour's tree, a shed). The model uses
  exposure as a coarse filter (suggest shade-tolerant crops for shaded beds), not a precise
  insolation figure. V2's auto-suggestion and V3's video mapping progressively improve this.
- **Where is the garden?** Location is **always asked at onboarding and never a fixed variable** —
  onboarding derives frost dates and climate normals from historical weather at runtime (§4c), so
  the app needs no static defaults and works anywhere. The developer's own reference garden
  (**Sevenoaks, Kent, UK**) is used only to sanity-check the derivation and the catalog's sow
  windows against a real temperate climate during development; it is not baked into the app.
