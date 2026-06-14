// Storage-tier tests (TESTING.md — Vitest + fake-indexeddb). Cover the createPlanting
// branching the M4 planner relies on: a planned crop vs. an already-in-the-ground crop
// whose stage re-anchors the twin.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createPlanting, type NewPlanting } from './repo';

const baseInput: NewPlanting = {
  bedId: 'bed-1',
  cropId: 'tomato',
  footprint: { x: 0, y: 0, w: 1, h: 1 },
  plantCount: 4,
  startMethod: 'direct',
};

beforeEach(async () => {
  await db.plantings.clear();
});

describe('createPlanting', () => {
  it('defaults status to "planned" and omits twin anchors for a planned crop', async () => {
    const planting = await createPlanting(baseInput);
    expect(planting.status).toBe('planned');
    expect(planting.sownAt).toBeUndefined();
    expect(planting.currentStage).toBeUndefined();

    const stored = await db.plantings.get(planting.id);
    expect(stored?.status).toBe('planned');
    expect(stored?.sownAt).toBeUndefined();
    expect(stored?.currentStage).toBeUndefined();
  });

  it('persists status, sownAt and currentStage for an already-planted crop', async () => {
    const planting = await createPlanting({
      ...baseInput,
      status: 'active',
      sownAt: '2026-05-01',
      currentStage: 'fruiting',
    });
    expect(planting.status).toBe('active');

    const stored = await db.plantings.get(planting.id);
    expect(stored).toMatchObject({
      status: 'active',
      sownAt: '2026-05-01',
      currentStage: 'fruiting',
    });
  });

  it('assigns a unique id to each planting', async () => {
    const a = await createPlanting(baseInput);
    const b = await createPlanting(baseInput);
    expect(a.id).not.toBe(b.id);
    expect(await db.plantings.count()).toBe(2);
  });
});
