// Pure planner geometry (PLAN.md §4a). No UI or storage imports — these are the
// spacing functions the grid layout is built on, and they are unit-tested.

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
