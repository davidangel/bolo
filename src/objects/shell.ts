// You shoot these. Many, in fact. With intent.

const { round, floor, cos, sin, PI } = Math;
import { distance } from '../helpers';
import BoloObject from '../object';
import { TILE_SIZE_WORLD } from '../constants';
import Explosion from './explosion';
import MineExplosion from './mine_explosion';
import type { SerializationCallback } from 'villain/world/net/object';
import type { ObjectRef } from 'villain/world/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';


interface ShellWorld {
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  soundEffect(sfx: number, x: number | null, y: number | null, source: BoloObject): void;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike extends BoloObject {
  armour: number;
  cell: WorldMapCell;
  builder: ObjectRef<BuilderLike>;
  isAlly?(other: TankLike): boolean;
}

interface BuilderLike extends BoloObject {
  states: { inTank: number; parachuting: number };
  order: number;
  cell: WorldMapCell;
  kill(): void;
}

interface Hittable {
  takeShellHit(shell: Shell): number;
}


export class Shell extends BoloObject {
  updatePriority = 20;
  styled = false as const;

  direction: number = 0;
  lifespan: number = 0;
  onWater: boolean = false;
  owner: ObjectRef<BoloObject> | null = null;
  attribution: ObjectRef<TankLike> | null = null;
  cell: WorldMapCell | null = null;
  radians: number | undefined;

  constructor(world: unknown) {
    super(world);
    this.on('netSync', () => this.updateCell());
  }

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('B', 'direction');
      p('O', 'owner');
      p('O', 'attribution');
      p('f', 'onWater');
    }
    p('H', 'x');
    p('H', 'y');
    p('B', 'lifespan');
  }

  updateCell(): void {
    const w = this.world as unknown as ShellWorld;
    this.cell = w.map.cellAtWorld(this.x!, this.y!);
  }

  getDirection16th(): number { return round((this.direction - 1) / 16) % 16; }

  getTile(): [number, number] {
    return [this.getDirection16th(), 4];
  }

  spawn(owner: BoloObject, options?: { direction?: number; range?: number; onWater?: boolean }): void {
    if (!options) options = {};

    this.ref('owner', owner);
    const ownerObj = this.owner!.$;
    if (Object.prototype.hasOwnProperty.call(ownerObj, 'owner_idx')) {
      this.ref('attribution', (ownerObj as { owner?: ObjectRef<TankLike> | null }).owner?.$ ?? null);
    } else {
      this.ref('attribution', ownerObj as unknown as TankLike);
    }

    this.direction = options.direction ?? (ownerObj as unknown as { direction: number }).direction;
    this.lifespan = (((options.range ?? 7) * TILE_SIZE_WORLD) / 32) - 2;
    this.onWater = options.onWater ?? false;
    this.x = (ownerObj as { x: number }).x;
    this.y = (ownerObj as { y: number }).y;
    this.move();
  }

  update(): void {
    this.move();
    const collision = this.collide();
    if (collision) {
      const [mode, victim] = collision;
      const sfx = (victim as Hittable).takeShellHit(this);
      let x: number, y: number;
      if (mode === 'cell') {
        [x, y] = this.cell!.getWorldCoordinates();
        (this.world as unknown as ShellWorld).soundEffect(sfx, x, y, this);
      } else {
        x = this.x!;
        y = this.y!;
        (victim as unknown as BoloObject).soundEffect(sfx);
      }
      this.asplode(x, y, mode);
    } else if (this.lifespan-- === 0) {
      this.asplode(this.x!, this.y!, 'eol');
    }
  }

  move(): void {
    if (!this.radians) this.radians = ((256 - this.direction) * 2 * PI) / 256;
    this.x = (this.x ?? 0) + round(cos(this.radians) * 32);
    this.y = (this.y ?? 0) + round(sin(this.radians) * 32);
    this.updateCell();
  }

  collide(): ['cell' | 'tank', Hittable] | null {
    const pill = this.cell!.pill as (Hittable & { armour: number }) | null | undefined;
    if (pill && pill.armour > 0 && (pill as unknown) !== this.owner?.$) {
      const [x, y] = this.cell!.getWorldCoordinates();
      if (distance({ x, y }, { x: this.x!, y: this.y! }) <= 127) return ['cell', pill];
    }

    const w = this.world as unknown as ShellWorld;
    for (const tank of w.tanks) {
      if (tank !== this.owner?.$ && tank.armour !== 255) {
        if (distance({ x: tank.x!, y: tank.y! }, { x: this.x!, y: this.y! }) <= 127) return ['tank', tank as unknown as Hittable];
      }
    }

    const attribution = this.attribution?.$;
    const owner = this.owner?.$;
    const base = this.cell!.base as (Hittable & { armour: number; owner?: ObjectRef<TankLike> | null }) | undefined;
    if ((attribution as unknown) === (owner as unknown) && base && base.armour > 4) {
      if (this.onWater || (base.owner != null && !base.owner.$.isAlly?.(attribution as unknown as TankLike))) {
        return ['cell', base];
      }
    }

    const terrainCollision = this.onWater
      ? !this.cell!.isType('^', ' ', '%')
      : this.cell!.isType('|', '}', '#', 'b');
    if (terrainCollision) return ['cell', this.cell! as unknown as Hittable];

    return null;
  }

  asplode(x: number, y: number, mode: string): void {
    const w = this.world as unknown as ShellWorld;
    for (const tank of w.tanks) {
      const builder = tank.builder?.$;
      if (builder) {
        if (![builder.states.inTank, builder.states.parachuting].includes(builder.order)) {
          if (mode === 'cell') {
            if (builder.cell === this.cell) builder.kill();
          } else {
            if (distance({ x: builder.x!, y: builder.y! }, { x: this.x!, y: this.y! }) < (TILE_SIZE_WORLD / 2)) builder.kill();
          }
        }
      }
    }
    w.spawn(Explosion, x, y);
    w.spawn(MineExplosion, this.cell);
    w.destroy(this);
  }
}

export default Shell;
