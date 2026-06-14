import Dexie, { type EntityTable } from 'dexie';
import type { Bed, Crop, Garden, Planting, PropagationZone, WeatherDay } from './types';

// Local-first storage (PLAN.md §3). All garden data lives on-device in IndexedDB;
// later milestones add observations, tasks, cultivations, pest sightings, crop prefs.
export class MyGardenDB extends Dexie {
  gardens!: EntityTable<Garden, 'id'>;
  beds!: EntityTable<Bed, 'id'>;
  propagationZones!: EntityTable<PropagationZone, 'id'>;
  crops!: EntityTable<Crop, 'id'>;
  plantings!: EntityTable<Planting, 'id'>;
  weatherDays!: EntityTable<WeatherDay, 'date'>;

  constructor() {
    super('mygarden');
    this.version(1).stores({
      gardens: 'id, name',
      beds: 'id, gardenId',
      propagationZones: 'id, gardenId',
      crops: 'id, family, name',
      plantings: 'id, bedId, cropId, status',
      weatherDays: '[gardenId+date], gardenId, date',
    });
    // v2: index clonedFromId so user clones are queryable by their source crop.
    this.version(2).stores({
      crops: 'id, family, name, clonedFromId',
    });
  }
}

export const db = new MyGardenDB();
