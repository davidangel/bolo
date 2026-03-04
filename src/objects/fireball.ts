// A fireball is the trail of fire left by a dying tank.

const { round, cos, sin, PI } = Math;
import { TILE_SIZE_WORLD } from '../constants';
import * as sounds from '../sounds';
import BoloObject from '../object';
import Explosion from './explosion';
import type { SerializationCallback } from 'villain/world/net/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';


interface FireballWorld {
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike {
  armour: number;
  builder: { $: BuilderLike };
}

interface BuilderLike {
  states: { inTank: number; parachuting: number };
  order: number;
  cell: unknown;
  kill(): void;
}


export class Fireball extends BoloObject {
  readonly styled = null;

  direction: number = 0;
  largeExplosion: boolean = false;
  lifespan: number = 0;
  dx: number | undefined;
  dy: number | undefined;

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('B', 'direction');
      p('f', 'largeExplosion');
    }
    p('H', 'x');
    p('H', 'y');
    p('B', 'lifespan');
  }

  getDirection16th(): number { return round((this.direction - 1) / 16) % 16; }

  spawn(x: number, y: number, direction: number, largeExplosion: boolean): void {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.largeExplosion = largeExplosion;
    this.lifespan = 80;
  }

  update(): void {
    if ((this.lifespan-- % 2) === 0) {
      if (this.wreck()) return;
      this.move();
    }
    if (this.lifespan === 0) {
      this.explode();
      (this.world as unknown as FireballWorld).destroy(this);
    }
  }

  wreck(): boolean {
    const w = this.world as unknown as FireballWorld;
    w.spawn(Explosion, this.x, this.y);
    const cell = w.map.cellAtWorld(this.x!, this.y!);
    if (cell.isType('^')) {
      w.destroy(this);
      this.soundEffect(sounds.TANK_SINKING);
      return true;
    } else if (cell.isType('b')) {
      cell.setType(' ');
      this.soundEffect(sounds.SHOT_BUILDING);
    } else if (cell.isType('#')) {
      cell.setType('.');
      this.soundEffect(sounds.SHOT_TREE);
    }
    return false;
  }

  move(): void {
    if (this.dx == null) {
      const radians = ((256 - this.direction) * 2 * PI) / 256;
      this.dx = round(cos(radians) * 48);
      this.dy = round(sin(radians) * 48);
    }
    const { dx, dy } = this;
    const newx = this.x! + dx;
    const newy = this.y! + dy!;
    const w = this.world as unknown as FireballWorld;

    if (dx !== 0) {
      const ahead = w.map.cellAtWorld(dx > 0 ? newx + 24 : newx - 24, newy);
      if (!ahead.isObstacle()) this.x = newx;
    }
    if (dy! !== 0) {
      const ahead = w.map.cellAtWorld(newx, dy! > 0 ? newy + 24 : newy - 24);
      if (!ahead.isObstacle()) this.y = newy;
    }
  }

  explode(): void {
    const w = this.world as unknown as FireballWorld;
    const cells = [w.map.cellAtWorld(this.x!, this.y!)];
    if (this.largeExplosion) {
      const dx = (this.dx ?? 0) > 0 ? 1 : -1;
      const dy = (this.dy ?? 0) > 0 ? 1 : -1;
      cells.push(cells[0].neigh(dx, 0) as unknown as WorldMapCell);
      cells.push(cells[0].neigh(0, dy) as unknown as WorldMapCell);
      cells.push(cells[0].neigh(dx, dy) as unknown as WorldMapCell);
      this.soundEffect(sounds.BIG_EXPLOSION);
    } else {
      this.soundEffect(sounds.MINE_EXPLOSION);
    }

    for (const cell of cells) {
      cell.takeExplosionHit();
      for (const tank of w.tanks) {
        const builder = tank.builder.$;
        if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
          if (builder.cell === cell) builder.kill();
        }
      }
      const [x, y] = cell.getWorldCoordinates();
      w.spawn(Explosion, x, y);
    }
  }
}

export default Fireball;
