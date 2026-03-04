// An invisible object implementing slow flooding when a crater or river tile is created.

import BoloObject from '../object';
import type { SerializationCallback } from 'villain/world/net/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';


interface FloodFillWorld {
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  map: WorldMap;
}


export class FloodFill extends BoloObject {
  readonly styled = null;

  lifespan: number = 0;
  cell: WorldMapCell | null = null;
  neighbours: WorldMapCell[] = [];

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    p('B', 'lifespan');
  }

  spawn(cell: WorldMapCell): void {
    [this.x, this.y] = cell.getWorldCoordinates();
    this.lifespan = 16;
  }

  anySpawn(): void {
    const w = this.world as unknown as FloodFillWorld;
    this.cell = w.map.cellAtWorld(this.x!, this.y!);
    this.neighbours = [
      this.cell.neigh(1, 0) as unknown as WorldMapCell,
      this.cell.neigh(0, 1) as unknown as WorldMapCell,
      this.cell.neigh(-1, 0) as unknown as WorldMapCell,
      this.cell.neigh(0, -1) as unknown as WorldMapCell,
    ];
  }

  update(): void {
    if (this.lifespan-- === 0) {
      this.flood();
      (this.world as unknown as FloodFillWorld).destroy(this);
    }
  }

  canGetWet(): boolean {
    for (const n of this.neighbours) {
      if (!(n.base || n.pill) && n.isType(' ', '^', 'b')) return true;
    }
    return false;
  }

  flood(): void {
    if (this.canGetWet()) {
      this.cell!.setType(' ', false);
      this.spread();
    }
  }

  spread(): void {
    const w = this.world as unknown as FloodFillWorld;
    for (const n of this.neighbours) {
      if (!(n.base || n.pill) && n.isType('%')) {
        w.spawn(FloodFill, n);
      }
    }
  }
}

export default FloodFill;
