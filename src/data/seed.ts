// Catalog seeding (PLAN.md §4b). crops.json ships with the app and is loaded into
// Dexie on first run. Built-in entries are read-only seed data; user clones live
// alongside them with isCustom:true. A version marker lets a catalog update re-seed
// without clobbering clones.

import { db } from './db';
import catalogData from './crops.json';
import type { Crop } from './types';

const CATALOG_VERSION = '1';
const VERSION_KEY = 'catalogVersion';

/** Seed the built-in crop catalog if it hasn't been loaded yet (or if the version changed). */
export async function seedCatalog(): Promise<void> {
  const stored = localStorage.getItem(VERSION_KEY);
  if (stored === CATALOG_VERSION) return;

  const crops = catalogData as Crop[];
  await db.transaction('rw', db.crops, async () => {
    // Remove old built-in entries (isCustom is absent/false) and re-seed.
    // User clones (isCustom: true) are left untouched.
    await db.crops.filter((c) => !c.isCustom).delete();
    await db.crops.bulkAdd(crops);
  });
  localStorage.setItem(VERSION_KEY, CATALOG_VERSION);
}
