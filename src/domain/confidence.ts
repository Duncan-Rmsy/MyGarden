// Crop data confidence (PLAN.md §4b, §8). Every estimate carries its confidence level
// so the UI can be honest about which crops are precisely modelled vs. running on day
// ranges. M4 uses the same check to pick GDD vs. day-range growth estimation.

import type { Crop } from '../data/types';

/**
 * 'precise'   — the crop has at least one stage with a GDD threshold; the twin can
 *               accumulate heat and give a date with a meaningful confidence band.
 * 'estimated' — day-range fallback only; the twin counts calendar days from sowing
 *               and the confidence band is wider.
 */
export type CropConfidence = 'precise' | 'estimated';

export function cropConfidence(crop: Crop): CropConfidence {
  return crop.stages?.some((s) => s.gdd !== undefined) ? 'precise' : 'estimated';
}
