import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { blockCapacity, cellsAcross, plantsPerCell, rowCount } from './planner';

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
