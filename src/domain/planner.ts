// Pure planner geometry and calendar logic (PLAN.md §4a, §4b). No UI or storage
// imports — these are the functions the grid layout and calendar are built on.

/**
 * Plants of a crop that fit in one square grid cell, derived from the crop's
 * in-row spacing. Square packing: `floor(cell / spacing)` per side. A cell always
 * holds at least one plant of a crop that fits at all.
 */
export function plantsPerCell(spacingCm: number, cellCm: number): number {
  if (spacingCm <= 0 || cellCm <= 0) return 0;
  if (spacingCm > cellCm) return 0; // does not fit a single cell; needs a multi-cell block
  const perSide = Math.floor(cellCm / spacingCm);
  return Math.max(1, perSide * perSide);
}

/**
 * Plants that fit along a single row of the given length at the crop spacing,
 * assuming a half-spacing margin at each end.
 */
export function rowCount(spacingCm: number, rowLengthCm: number): number {
  if (spacingCm <= 0 || rowLengthCm <= 0) return 0;
  return Math.floor(rowLengthCm / spacingCm);
}

/**
 * Total capacity of a rectangular block of cells for a crop, in plants.
 * Used to validate placement and show remaining capacity as the user fills a bed.
 */
export function blockCapacity(
  spacingCm: number,
  cellCm: number,
  cellsWide: number,
  cellsTall: number,
): number {
  if (cellsWide <= 0 || cellsTall <= 0) return 0;
  return plantsPerCell(spacingCm, cellCm) * cellsWide * cellsTall;
}

/** Whole grid cells that fit across a bed dimension at the configured cell size. */
export function cellsAcross(bedDimCm: number, cellCm: number): number {
  if (bedDimCm <= 0 || cellCm <= 0) return 0;
  return Math.floor(bedDimCm / cellCm);
}

/**
 * Cells the crop needs along one axis. If the crop's spacing fits inside a single
 * cell it gets {w:1, h:1}; larger crops claim a square multi-cell block (§4a).
 */
export function cropCellsNeeded(spacingCm: number, cellCm: number): { w: number; h: number } {
  if (spacingCm <= 0 || cellCm <= 0) return { w: 1, h: 1 };
  if (spacingCm <= cellCm) return { w: 1, h: 1 };
  const n = Math.ceil(spacingCm / cellCm);
  return { w: n, h: n };
}

/** True if two grid footprints (in cell coordinates) overlap. */
export function footprintsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/**
 * Normalised footprint covering the two corner cells of a drag selection (§4a). Order-
 * independent: the result spans from the min corner and always has w,h ≥ 1, so a tap on
 * a single cell yields a 1×1 region.
 */
export function computeRegion(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x) + 1,
    h: Math.abs(b.y - a.y) + 1,
  };
}

/**
 * True if the proposed footprint overlaps any existing planting footprint.
 * Used to prevent double-placing a crop on an occupied cell block.
 */
export function isFootprintOccupied(
  proposed: { x: number; y: number; w: number; h: number },
  existing: { x: number; y: number; w: number; h: number }[],
): boolean {
  return existing.some((e) => footprintsOverlap(proposed, e));
}

// ── Planting calendar (§4b, §4d) ─────────────────────────────────────────────

import type { RelativeWindow, StartMethod } from '../data/types';

export type WindowStatus = 'open' | 'upcoming' | 'closed' | 'too-late';

export interface CalendarEntry {
  method: StartMethod;
  opensDate: string; // ISO yyyy-mm-dd
  closesDate: string;
  harvestFrom?: string; // from opensDate + daysToMaturity[0]
  harvestTo?: string; // from closesDate + daysToMaturity[1]
  status: WindowStatus;
}

const MS = 86_400_000;
const UPCOMING_DAYS = 28;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Date(d.getTime() + days * MS).toISOString().slice(0, 10);
}

/** Resolve an MM-DD frost date to a yyyy-mm-dd for planning purposes. */
function resolveMmdd(mmdd: string, todayIso: string, isSpring: boolean): string {
  const year = Number(todayIso.slice(0, 4));
  const candidate = `${year}-${mmdd}`;
  if (!isSpring && candidate < todayIso) {
    // Autumn frost already passed this calendar year; next year's is relevant.
    return `${year + 1}-${mmdd}`;
  }
  return candidate;
}

/**
 * Absolute sow/transplant windows for a crop at the garden's location (§4b). Each
 * window has its status relative to today: open (sow now), upcoming (< 4 weeks),
 * closed (passed), or too-late (open but crop can't mature before first frost).
 *
 * Frost dates that are absent → windows anchored to that frost are omitted.
 */
export function plantingCalendar(
  sowWindows: RelativeWindow[],
  daysToMaturity: [number, number],
  frostDates: { lastFrostDate?: string; firstFrostDate?: string },
  today: string,
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const w of sowWindows) {
    const mmdd =
      w.anchor === 'lastFrost' ? frostDates.lastFrostDate : frostDates.firstFrostDate;
    if (!mmdd) continue;

    const anchor = resolveMmdd(mmdd, today, w.anchor === 'lastFrost');
    const opens = addDays(anchor, w.startWeeks * 7);
    const closes = addDays(anchor, w.endWeeks * 7);

    // Harvest projection from the start of the window (earliest realistic sow).
    const sowDate = opens > today ? opens : today;
    const harvestFrom = addDays(opens, daysToMaturity[0]);
    const harvestTo = addDays(closes, daysToMaturity[1]);

    let status: WindowStatus;
    if (closes < today) {
      status = 'closed';
    } else if (opens <= today && today <= closes) {
      // Window is open — but check if there's still enough time to mature.
      const firstFrost = frostDates.firstFrostDate
        ? resolveMmdd(frostDates.firstFrostDate, today, false)
        : undefined;
      const earliestHarvest = addDays(sowDate, daysToMaturity[0]);
      status =
        firstFrost && earliestHarvest > firstFrost ? 'too-late' : 'open';
    } else {
      // Window hasn't opened yet.
      const daysUntilOpen =
        (new Date(opens + 'T00:00:00Z').getTime() -
          new Date(today + 'T00:00:00Z').getTime()) /
        MS;
      status = daysUntilOpen <= UPCOMING_DAYS ? 'upcoming' : 'closed';
    }

    entries.push({ method: w.method, opensDate: opens, closesDate: closes, harvestFrom, harvestTo, status });
  }

  return entries;
}
