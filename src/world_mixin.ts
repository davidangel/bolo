// Common logic between all bolo world classes.

import type WorldMap from './world_map';
import type { WorldMapCell } from './world_map';
import type BoloObject from './object';


interface MapObject {
  owner_idx: number;
  owner: { $: unknown } | null;
  cell: WorldMapCell | null;
  world: unknown;
  spawn(): void;
  anySpawn(): void;
  ref(attribute: string, value: unknown): unknown;
  retile?(): void;
}

interface Tank extends BoloObject {
  tank_idx: number;
}

export interface BoloWorld {
  tanks: Tank[];
  map: WorldMap;
  authority?: boolean;
  boloInit(): void;
  addTank(tank: Tank): void;
  removeTank(tank: Tank): void;
  insert(obj: BoloObject): BoloObject;
  getAllMapObjects(): MapObject[];
  spawnMapObjects(): void;
  resolveMapObjectOwners(): void;
}

export const BoloWorldMixin = {

  boloInit(this: BoloWorld): void {
    this.tanks = [];
  },

  addTank(this: BoloWorld, tank: Tank): void {
    tank.tank_idx = this.tanks.length;
    this.tanks.push(tank);
    if (this.authority) this.resolveMapObjectOwners();
  },

  removeTank(this: BoloWorld, tank: Tank): void {
    this.tanks.splice(tank.tank_idx, 1);
    for (let i = tank.tank_idx; i < this.tanks.length; i++) {
      this.tanks[i].tank_idx = i;
    }
    if (this.authority) this.resolveMapObjectOwners();
  },

  getAllMapObjects(this: BoloWorld): MapObject[] {
    return (this.map.pills as unknown as MapObject[]).concat(this.map.bases as unknown as MapObject[]);
  },

  spawnMapObjects(this: BoloWorld & { insert(obj: BoloObject): BoloObject }): void {
    for (const obj of this.getAllMapObjects()) {
      obj.world = this as unknown as BoloObject['world'];
      this.insert(obj as unknown as BoloObject);
      obj.spawn();
      obj.anySpawn();
    }
  },

  resolveMapObjectOwners(this: BoloWorld): void {
    for (const obj of this.getAllMapObjects()) {
      obj.ref('owner', this.tanks[obj.owner_idx]);
      obj.cell?.retile();
    }
  },
};

export default BoloWorldMixin;
