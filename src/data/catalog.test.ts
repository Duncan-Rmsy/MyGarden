// Schema validation for crops.json (PLAN.md §4b, §8). Data-entry errors are the
// product's biggest risk — this catches them at CI time rather than at runtime.
import { describe, expect, it } from 'vitest';
import catalog from './crops.json';
import type { Crop, Stage, StartMethod } from './types';
import { cropConfidence } from '../domain/confidence';

const crops = catalog as Crop[];

const VALID_STAGES: Stage[] = [
  'seed', 'germinated', 'seedling', 'vegetative', 'flowering', 'fruiting', 'harvest', 'done',
];
const STAGE_ORDER = new Map(VALID_STAGES.map((s, i) => [s, i]));
const VALID_METHODS: StartMethod[] = ['direct', 'indoor', 'buy-seedling'];
const VALID_HABITS = ['compact', 'row', 'sprawling', 'climbing'] as const;
const VALID_TOLERANCE = ['hardy', 'semi', 'tender'] as const;
const VALID_ANCHORS = ['lastFrost', 'firstFrost'] as const;

describe('crops.json schema', () => {
  it('contains at least 30 crops', () => {
    expect(crops.length).toBeGreaterThanOrEqual(30);
  });

  it('has no duplicate ids', () => {
    const ids = crops.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const crop of crops) {
    describe(`"${crop.id}"`, () => {
      it('has required string fields', () => {
        expect(typeof crop.id).toBe('string');
        expect(crop.id.length).toBeGreaterThan(0);
        expect(typeof crop.name).toBe('string');
        expect(crop.name.length).toBeGreaterThan(0);
        expect(typeof crop.family).toBe('string');
        expect(crop.family.length).toBeGreaterThan(0);
      });

      it('has valid positive numeric fields', () => {
        expect(crop.spacingCm).toBeGreaterThan(0);
        expect(crop.sowDepthCm).toBeGreaterThanOrEqual(0);
        expect(crop.baseTempC).toBeGreaterThanOrEqual(0);
        if (crop.maxTempC !== undefined) {
          expect(crop.maxTempC).toBeGreaterThan(crop.baseTempC);
        }
      });

      it('has valid daysToGerminate range', () => {
        const [min, max] = crop.daysToGerminate;
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      });

      it('has valid daysToMaturity range', () => {
        const [min, max] = crop.daysToMaturity;
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      });

      it('has valid frostTolerance', () => {
        expect(VALID_TOLERANCE).toContain(crop.frostTolerance);
      });

      it('has valid habit', () => {
        expect(VALID_HABITS).toContain(crop.habit);
      });

      it('has at least one valid startMethod', () => {
        expect(crop.startMethods.length).toBeGreaterThan(0);
        for (const m of crop.startMethods) {
          expect(VALID_METHODS).toContain(m);
        }
      });

      it('has at least one valid sowWindow', () => {
        expect(crop.sowWindows.length).toBeGreaterThan(0);
        for (const w of crop.sowWindows) {
          expect(VALID_ANCHORS).toContain(w.anchor);
          expect(w.startWeeks).toBeLessThanOrEqual(w.endWeeks);
          expect(VALID_METHODS).toContain(w.method);
        }
      });

      if (crop.stages) {
        it('has stages in biological order with valid day ranges', () => {
          let prevOrder = -1;
          for (const s of crop.stages!) {
            expect(VALID_STAGES).toContain(s.stage);
            const order = STAGE_ORDER.get(s.stage)!;
            expect(order).toBeGreaterThan(prevOrder);
            prevOrder = order;
            if (s.days) {
              const [min, max] = s.days;
              expect(min).toBeGreaterThan(0);
              expect(max).toBeGreaterThanOrEqual(min);
            }
          }
        });

        it('has monotonically increasing GDD thresholds (for tuned crops)', () => {
          const gddStages = crop.stages!.filter((s) => s.gdd !== undefined);
          if (gddStages.length === 0) return;
          let prev = -1;
          for (const s of gddStages) {
            expect(s.gdd!).toBeGreaterThan(prev);
            prev = s.gdd!;
          }
        });
      }

      it('indoorWeeks range is valid when present', () => {
        if (crop.indoorWeeks === undefined) return;
        const [min, max] = crop.indoorWeeks;
        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      });
    });
  }
});

describe('cropConfidence', () => {
  it('returns "precise" for crops with GDD stage thresholds', () => {
    const tuned = crops.find((c) => c.id === 'tomato')!;
    expect(cropConfidence(tuned)).toBe('precise');
  });

  it('returns "estimated" for crops with day-range stages only', () => {
    const untuned = crops.find((c) => c.id === 'pepper')!;
    expect(cropConfidence(untuned)).toBe('estimated');
  });

  it('returns "estimated" for crops with no stages at all', () => {
    expect(cropConfidence({ stages: undefined } as unknown as Crop)).toBe('estimated');
  });
});
