// An invisible object that triggers a mine after a short delay.

import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Explosion from './explosion';
import type { SerializationCallback } from 'villain/world/net/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';


interface MineExplosionWorld {
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike {
  armour: number;
  x: number | null;
  y: number | null;
  builder: { $: BuilderLike };
  takeMineHit(): void;
}

interface BuilderLike {
  states: { inTank: number; parachuting: number };
  order: number;
  x: number | null;
  y: number | null;
  kill(): void;
}


export class MineExplosion extends BoloObject {
  readonly styled = null;

  lifespan: number = 0;
  cell: WorldMapCell | null = null;

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    p('B', 'lifespan');
  }

  spawn(cell: WorldMapCell): void {
    [this.x, this.y] = cell.getWorldCoordinates();
    this.lifespan = 10;
  }

  anySpawn(): void {
    const w = this.world as unknown as MineExplosionWorld;
    this.cell = w.map.cellAtWorld(this.x!, this.y!);
  }

  update(): void {
    if (this.lifespan-- === 0) {
      if (this.cell!.mine) this.asplode();
      (this.world as unknown as MineExplosionWorld).destroy(this);
    }
  }

  asplode(): void {
    const w = this.world as unknown as MineExplosionWorld;
    this.cell!.setType(null, false, 0);
    this.cell!.takeExplosionHit();

    for (const tank of w.tanks) {
      if (tank.armour !== 255 && distance({ x: this.x!, y: this.y! }, { x: tank.x!, y: tank.y! }) < 384) {
        tank.takeMineHit();
      }
      const builder = tank.builder.$;
      if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
        if (distance({ x: this.x!, y: this.y! }, { x: builder.x!, y: builder.y! }) < (TILE_SIZE_WORLD / 2)) {
          builder.kill();
        }
      }
    }

    w.spawn(Explosion, this.x, this.y);
    this.soundEffect(sounds.MINE_EXPLOSION);
    this.spread();
  }

  spread(): void {
    const w = this.world as unknown as MineExplosionWorld;
    let n = this.cell!.neigh(1, 0);  if (!n.isEdgeCell()) w.spawn(MineExplosion, n);
    n = this.cell!.neigh(0, 1);      if (!n.isEdgeCell()) w.spawn(MineExplosion, n);
    n = this.cell!.neigh(-1, 0);     if (!n.isEdgeCell()) w.spawn(MineExplosion, n);
    n = this.cell!.neigh(0, -1);     if (!n.isEdgeCell()) w.spawn(MineExplosion, n);
  }
}

export default MineExplosion;
