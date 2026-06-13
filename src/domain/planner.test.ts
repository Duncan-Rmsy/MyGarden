import { describe, expect, it } from 'vitest';
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
});
