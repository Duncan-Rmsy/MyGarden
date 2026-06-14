import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  blockCapacity,
  cellsAcross,
  computeRegion,
  cropCellsNeeded,
  footprintsOverlap,
  isFootprintOccupied,
  plantingCalendar,
  plantsPerCell,
  rowCount,
} from './planner';

describe('plantsPerCell', () => {
  it('derives square-foot-style density from spacing in a 30cm cell', () => {
    expect(plantsPerCell(7, 30)).toBe(16); // carrots: floor(30/7)=4 -> 16
    expect(plantsPerCell(15, 30)).toBe(4); // lettuce: floor(30/15)=2 -> 4
    expect(plantsPerCell(30, 30)).toBe(1); // exactly one
  });

  it('returns 0 for a crop that needs more than one cell', () => {
    expect(plantsPerCell(45, 30)).toBe(0); // broccoli @45cm in a 30cm cell -> needs a block
  });

  it('guards against non-positive inputs', () => {
    expect(plantsPerCell(0, 30)).toBe(0);
    expect(plantsPerCell(7, 0)).toBe(0);
    expect(plantsPerCell(-7, 30)).toBe(0);
  });
});

describe('rowCount', () => {
  it('fits plants along a row at the given spacing', () => {
    expect(rowCount(7, 120)).toBe(17); // floor(120/7)
    expect(rowCount(25, 100)).toBe(4);
  });

  it('guards against non-positive inputs', () => {
    expect(rowCount(0, 100)).toBe(0);
    expect(rowCount(7, 0)).toBe(0);
  });
});

describe('blockCapacity', () => {
  it('multiplies per-cell density across a block of cells', () => {
    expect(blockCapacity(15, 30, 2, 2)).toBe(16); // 4 per cell * 4 cells
  });

  it('handles a multi-cell crop via the surrounding block (0 per single cell)', () => {
    // A 45cm crop yields 0 per 30cm cell, so block density is 0 here; multi-cell
    // crops are placed by claiming whole cells, handled at a higher layer.
    expect(blockCapacity(45, 30, 2, 2)).toBe(0);
  });

  it('returns 0 for empty blocks', () => {
    expect(blockCapacity(15, 30, 0, 2)).toBe(0);
  });
});

describe('cellsAcross', () => {
  it('counts whole cells that fit across a bed dimension', () => {
    expect(cellsAcross(120, 30)).toBe(4);
    expect(cellsAcross(125, 30)).toBe(4); // remainder strip ignored
  });

  it('guards against non-positive inputs', () => {
    expect(cellsAcross(0, 30)).toBe(0);
    expect(cellsAcross(120, 0)).toBe(0);
  });
});

// Property-based tests pin the planner geometry invariants the plan specifies
// (PLAN.md §4a), searching the input space rather than trusting examples. The cm
// values are integers because spacing/cell sizes are whole centimetres in the model.
describe('planner geometry invariants (property-based, PLAN.md §4a)', () => {
  const cm = fc.integer({ min: 1, max: 1000 });
  const cells = fc.integer({ min: 1, max: 50 });

  it('plantsPerCell is never negative and never crashes on any sizing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 1000 }),
        fc.integer({ min: -100, max: 1000 }),
        (s, c) => {
          expect(plantsPerCell(s, c)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it('matches floor(cell/spacing)² when the crop fits a cell (§4a), else 0', () => {
    fc.assert(
      fc.property(cm, cm, (spacingCm, cellCm) => {
        const perCell = plantsPerCell(spacingCm, cellCm);
        if (spacingCm > cellCm) {
          expect(perCell).toBe(0);
        } else {
          const perSide = Math.floor(cellCm / spacingCm);
          expect(perCell).toBe(perSide * perSide);
          expect(perCell).toBeGreaterThanOrEqual(1); // a crop that fits holds ≥1
        }
      }),
    );
  });

  it('blockCapacity is per-cell density tiled across the block', () => {
    fc.assert(
      fc.property(cm, cm, cells, cells, (spacingCm, cellCm, w, h) => {
        expect(blockCapacity(spacingCm, cellCm, w, h)).toBe(
          plantsPerCell(spacingCm, cellCm) * w * h,
        );
      }),
    );
  });

  it('rowCount equals floor(length/spacing) and grows monotonically with length', () => {
    fc.assert(
      fc.property(cm, cm, fc.integer({ min: 0, max: 500 }), (spacingCm, rowLengthCm, extra) => {
        expect(rowCount(spacingCm, rowLengthCm)).toBe(Math.floor(rowLengthCm / spacingCm));
        expect(rowCount(spacingCm, rowLengthCm + extra)).toBeGreaterThanOrEqual(
          rowCount(spacingCm, rowLengthCm),
        );
      }),
    );
  });

  it('cellsAcross never exceeds the true ratio and is non-negative', () => {
    fc.assert(
      fc.property(cm, cm, (bedDimCm, cellCm) => {
        const n = cellsAcross(bedDimCm, cellCm);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n * cellCm).toBeLessThanOrEqual(bedDimCm); // whole cells never overflow the bed
      }),
    );
  });
});

describe('cropCellsNeeded', () => {
  it('returns 1×1 for a crop that fits in one cell', () => {
    expect(cropCellsNeeded(15, 30)).toEqual({ w: 1, h: 1 }); // lettuce in 30cm cell
    expect(cropCellsNeeded(30, 30)).toEqual({ w: 1, h: 1 }); // exactly one cell
  });

  it('returns a square multi-cell block for large crops', () => {
    expect(cropCellsNeeded(45, 30)).toEqual({ w: 2, h: 2 }); // broccoli
    expect(cropCellsNeeded(90, 30)).toEqual({ w: 3, h: 3 }); // courgette / squash
  });

  it('always returns at least 1×1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (spacing, cell) => {
          const { w, h } = cropCellsNeeded(spacing, cell);
          expect(w).toBeGreaterThanOrEqual(1);
          expect(h).toBeGreaterThanOrEqual(1);
        },
      ),
    );
  });
});

describe('footprintsOverlap / isFootprintOccupied', () => {
  it('detects overlapping footprints', () => {
    expect(footprintsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
  });

  it('returns false for adjacent (non-overlapping) footprints', () => {
    expect(footprintsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
    expect(footprintsOverlap({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 })).toBe(false);
  });

  it('isFootprintOccupied returns true when any existing footprint overlaps', () => {
    const existing = [{ x: 2, y: 0, w: 1, h: 1 }, { x: 0, y: 3, w: 2, h: 2 }];
    expect(isFootprintOccupied({ x: 2, y: 0, w: 1, h: 1 }, existing)).toBe(true);
    expect(isFootprintOccupied({ x: 5, y: 5, w: 1, h: 1 }, existing)).toBe(false);
  });
});

describe('plantingCalendar', () => {
  const FROST = { lastFrostDate: '04-15', firstFrostDate: '10-28' };

  it('marks a window as open when today falls within it', () => {
    // lastFrost = 2026-04-15; window: -6w to 0 = 2026-03-04 to 2026-04-15
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: -6, endWeeks: 0, method: 'direct' }],
      [60, 90],
      FROST,
      '2026-03-20',
    );
    expect(entries[0].status).toBe('open');
  });

  it('marks a window as upcoming when it opens within 28 days', () => {
    // window opens 2026-03-04; today is 2026-02-20 → 12 days out
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: -6, endWeeks: 0, method: 'direct' }],
      [60, 90],
      FROST,
      '2026-02-20',
    );
    expect(entries[0].status).toBe('upcoming');
  });

  it('marks a window as closed when it has passed', () => {
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: -6, endWeeks: -4, method: 'direct' }],
      [60, 90],
      FROST,
      '2026-05-01', // well after the window closed on Apr 15 - 4*7 = Mar 18
    );
    expect(entries[0].status).toBe('closed');
  });

  it('marks a window as too-late when maturity would fall after first frost', () => {
    // lastFrost 2026-04-15, window: +2w to +6w = May 1 to Jun 12
    // daysToMaturity [180, 200] → earliest harvest = May 1 + 180 = Nov 1, after firstFrost Oct 28
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: 2, endWeeks: 6, method: 'direct' }],
      [180, 200],
      FROST,
      '2026-05-10',
    );
    expect(entries[0].status).toBe('too-late');
  });

  it('omits windows when the relevant frost date is absent', () => {
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: -4, endWeeks: 0, method: 'direct' }],
      [60, 90],
      {}, // no frost dates
      '2026-04-01',
    );
    expect(entries).toHaveLength(0);
  });

  it('harvestFrom/harvestTo are after their respective sow dates', () => {
    const entries = plantingCalendar(
      [{ anchor: 'lastFrost', startWeeks: 0, endWeeks: 4, method: 'direct' }],
      [50, 70],
      FROST,
      '2026-04-15',
    );
    if (entries[0].harvestFrom) {
      expect(entries[0].harvestFrom > entries[0].opensDate).toBe(true);
    }
    if (entries[0].harvestTo) {
      expect(entries[0].harvestTo > entries[0].closesDate).toBe(true);
    }
  });
});

describe('computeRegion (drag selection, §4a)', () => {
  it('returns a 1×1 region for a single-cell tap', () => {
    expect(computeRegion({ x: 2, y: 3 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 3, w: 1, h: 1 });
  });

  it('spans from the top-left corner regardless of drag direction', () => {
    const forward = computeRegion({ x: 1, y: 1 }, { x: 3, y: 2 });
    const reverse = computeRegion({ x: 3, y: 2 }, { x: 1, y: 1 });
    expect(forward).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    expect(reverse).toEqual(forward); // order-independent
  });

  // Property: width/height are always ≥ 1, the origin is the min corner, and the span is
  // inclusive of both endpoints — for any two cells, in any order.
  it('is order-independent with inclusive, positive extents', () => {
    const cell = fc.record({ x: fc.integer({ min: 0, max: 50 }), y: fc.integer({ min: 0, max: 50 }) });
    fc.assert(
      fc.property(cell, cell, (a, b) => {
        const r = computeRegion(a, b);
        expect(r).toEqual(computeRegion(b, a));
        expect(r.x).toBe(Math.min(a.x, b.x));
        expect(r.y).toBe(Math.min(a.y, b.y));
        expect(r.w).toBe(Math.abs(a.x - b.x) + 1);
        expect(r.h).toBe(Math.abs(a.y - b.y) + 1);
        expect(r.w).toBeGreaterThanOrEqual(1);
        expect(r.h).toBeGreaterThanOrEqual(1);
      }),
    );
  });
});
