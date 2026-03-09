// The pillbox is a map object, and thus a slightly special case of world object.

const { min, max, round, ceil, PI, cos, sin } = Math;
import { TILE_SIZE_WORLD } from '../constants';
import { distance, heading } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Shell from './shell';
import type { SerializationCallback } from 'villain/world/net/object';
import type { ObjectRef } from 'villain/world/object';
import type { Map as BoloMap } from '../map';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';


interface WorldPillboxWorld {
  authority?: boolean;
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  soundEffect(sfx: number, x: number | null, y: number | null, source: BoloObject): void;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike extends BoloObject {
  armour: number;
  cell: WorldMapCell;
  tank_idx: number;
  team: number;
  isAlly?(other: TankLike): boolean;
  getDirection16th(): number;
  speed: number;
}


export class WorldPillbox extends BoloObject {
  // MapObject constructor fields (set when loaded from map)
  owner_idx: number = 255;
  armour: number = 0;
  speed: number = 0;

  // World-side state
  inTank: boolean = false;
  carried: boolean = false;
  haveTarget: boolean = false;
  coolDown: number = 0;
  reload: number = 0;

  owner: ObjectRef<TankLike> | null = null;
  cell: WorldMapCell | null = null;

  // Dual constructor: world-only (1 arg) or map-loaded (6 args)
  constructor(
    world_or_map: unknown,
    x?: number,
    y?: number,
    owner_idx?: number,
    armour?: number,
    speed?: number,
  ) {
    super(world_or_map);
    if (owner_idx !== undefined) this.owner_idx = owner_idx;
    if (armour !== undefined) this.armour = armour;
    if (speed !== undefined) this.speed = speed;

    if (x !== undefined && y !== undefined) {
      this.x = (x + 0.5) * TILE_SIZE_WORLD;
      this.y = (y + 0.5) * TILE_SIZE_WORLD;
    }

    this.on('netUpdate', (changes: Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(changes, 'x') ||
          Object.prototype.hasOwnProperty.call(changes, 'y')) {
        this.updateCell();
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'inTank') ||
          Object.prototype.hasOwnProperty.call(changes, 'carried')) {
        this.updateCell();
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'owner')) {
        this.updateOwner();
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'armour')) {
        this.cell?.retile();
      }
    });
  }

  updateCell(): void {
    if (this.cell) {
      delete (this.cell as { pill?: WorldPillbox }).pill;
      this.cell.retile();
    }
    if (this.inTank || this.carried) {
      this.cell = null;
    } else {
      const w = this.world as unknown as WorldPillboxWorld;
      this.cell = w.map.cellAtWorld(this.x!, this.y!);
      (this.cell as unknown as { pill: WorldPillbox }).pill = this;
      this.cell.retile();
    }
  }

  updateOwner(): void {
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      (this as { team: number | null }).team = this.owner.$.team;
    } else {
      this.owner_idx = 255;
      (this as { team: number | null }).team = 255;
    }
    this.cell?.retile();
  }

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    p('O', 'owner');
    p('f', 'inTank');
    p('f', 'carried');
    p('f', 'haveTarget');
    if (!this.inTank && !this.carried) {
      p('H', 'x');
      p('H', 'y');
    } else {
      this.x = null;
      this.y = null;
    }
    p('B', 'armour');
    p('B', 'speed');
    p('B', 'coolDown');
    p('B', 'reload');
  }

  placeAt(cell: WorldMapCell): void {
    this.inTank = false;
    this.carried = false;
    [this.x, this.y] = cell.getWorldCoordinates();
    this.updateCell();
    this.reset();
  }

  spawn(): void {
    this.reset();
  }

  reset(): void {
    this.coolDown = 32;
    this.reload = 0;
  }

  anySpawn(): void {
    this.updateCell();
  }

  update(): void {
    if (this.inTank || this.carried) return;
    const w = this.world as unknown as WorldPillboxWorld;

    if (this.armour === 0) {
      this.haveTarget = false;
      for (const tank of w.tanks) {
        if (tank.armour !== 255 && tank.cell === this.cell) {
          this.inTank = true; this.x = null; this.y = null; this.updateCell();
          this.ref('owner', tank); this.updateOwner();
          break;
        }
      }
      return;
    }

    this.reload = min(this.speed, this.reload + 1);
    if (--this.coolDown === 0) {
      this.coolDown = 32;
      this.speed = min(100, this.speed + 1);
    }
    if (!(this.reload >= this.speed)) return;

    let target: TankLike | null = null;
    let targetDistance = Infinity;
    for (const tank of w.tanks) {
      if (tank.armour !== 255 && !this.owner?.$.isAlly?.(tank)) {
        const d = distance({ x: this.x!, y: this.y! }, { x: tank.x!, y: tank.y! });
        if (d <= 1919 && d < targetDistance) {
          target = tank; targetDistance = d;
        }
      }
    }
    if (!target) { this.haveTarget = false; return; }

    if (this.haveTarget) {
      const rad = ((256 - (target.getDirection16th() * 16)) * 2 * PI) / 256;
      const tx = target.x! + ((targetDistance / 32) * round(cos(rad) * ceil(target.speed)));
      const ty = target.y! + ((targetDistance / 32) * round(sin(rad) * ceil(target.speed)));
      const direction = 256 - ((heading({ x: this.x!, y: this.y! }, { x: tx, y: ty }) * 256) / (2 * PI));
      w.spawn(Shell, this, { direction });
      this.soundEffect(sounds.SHOOTING);
    }
    this.haveTarget = true;
    this.reload = 0;
  }

  aggravate(): void {
    this.coolDown = 32;
    this.speed = max(6, round(this.speed / 2));
  }

  takeShellHit(_shell: unknown): number {
    this.aggravate();
    this.armour = max(0, this.armour - 1);
    this.cell!.retile();
    return sounds.SHOT_BUILDING;
  }

  takeExplosionHit(): void {
    this.armour = max(0, this.armour - 5);
    this.cell!.retile();
  }

  repair(trees: number): number {
    const used = min(trees, ceil((15 - this.armour) / 4));
    this.armour = min(15, this.armour + (used * 4));
    this.cell!.retile();
    return used;
  }
}

export default WorldPillbox;
