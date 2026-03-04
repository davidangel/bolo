// The Tank class contains all the logic you need to tread well.

const { round, floor, ceil, min, sqrt, max, sin, cos, PI } = Math;
import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Explosion from './explosion';
import MineExplosion from './mine_explosion';
import Shell from './shell';
import Fireball from './fireball';
import Builder from './builder';
import type { SerializationCallback } from 'villain/world/net/object';
import type { ObjectRef } from 'villain/world/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';
import type { WorldPillbox } from './world_pillbox';

// The turn rate multiplier is a bit of a hack to make the game feel more responsive.
// The original game has a turn rate of 1, but it feels very sluggish. Increasing it
// to 2 makes the game feel much better without breaking anything.
const TANK_TURN_RATE_MULTIPLIER = 2;


interface TankWorld {
  authority?: boolean;
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  soundEffect(sfx: number, x: number | null, y: number | null, source: BoloObject): void;
  addTank(tank: Tank): void;
  removeTank(tank: Tank): void;
  map: WorldMap;
  tanks: Tank[];
}


export class Tank extends BoloObject {
  readonly styled = true;

  team: number = 0;
  armour: number = 0;
  shells: number = 0;
  mines: number = 0;
  trees: number = 0;
  direction: number = 0;
  speed: number = 0;
  slideTicks: number = 0;
  slideDirection: number = 0;
  accelerating: boolean = false;
  braking: boolean = false;
  turningClockwise: boolean = false;
  turningCounterClockwise: boolean = false;
  turnSpeedup: number = 0;
  reload: number = 0;
  shooting: boolean = false;
  firingRange: number = 7;
  waterTimer: number = 0;
  onBoat: boolean = false;
  respawnTimer?: number;

  builder: ObjectRef<Builder> | null = null;
  fireball: ObjectRef<Fireball> | null = null;
  cell: WorldMapCell | null = null;
  tank_idx: number = 0;

  private _finalizeListenerAdded: boolean = false;

  constructor(world: unknown) {
    super(world);
    this.on('netUpdate', (changes: Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(changes, 'x') ||
          Object.prototype.hasOwnProperty.call(changes, 'y') ||
          (changes['armour'] as number) === 255) {
        this.updateCell();
      }
    });
  }

  anySpawn(): void {
    const w = this.world as unknown as TankWorld;
    this.updateCell();
    w.addTank(this);
    this.setMaxListeners(50);
    if (!this._finalizeListenerAdded) {
      this._finalizeListenerAdded = true;
      this.on('finalize', () => w.removeTank(this));
    }
  }

  updateCell(): void {
    const w = this.world as unknown as TankWorld;
    this.cell = (this.x != null && this.y != null)
      ? w.map.cellAtWorld(this.x, this.y)
      : null;
  }

  reset(): void {
    const w = this.world as unknown as TankWorld;
    const startingPos = w.map.getRandomStart();
    [this.x, this.y] = (startingPos.cell as unknown as WorldMapCell).getWorldCoordinates();
    this.direction = startingPos.direction * 16;
    this.updateCell();

    this.speed          = 0;
    this.slideTicks     = 0;
    this.slideDirection = 0;
    this.accelerating   = false;
    this.braking        = false;
    this.turningClockwise        = false;
    this.turningCounterClockwise = false;
    this.turnSpeedup             = 0;

    // FIXME: gametype dependant.
    this.shells = 40;
    this.mines  = 0;
    this.armour = 40;
    this.trees  = 0;

    this.reload      = 0;
    this.shooting    = false;
    this.firingRange = 7;
    this.waterTimer  = 0;
    this.onBoat      = true;
  }

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('B', 'team');
      p('O', 'builder');
    }

    p('B', 'armour');

    if (this.armour === 255) {
      p('O', 'fireball');
      this.x = null; this.y = null;
      return;
    } else {
      (this.fireball?.$ as any)?.clear?.();
    }

    p('H', 'x');
    p('H', 'y');
    p('B', 'direction');
    p('B', 'speed', { tx: (v: unknown) => (v as number) * 4, rx: (v: unknown) => (v as number) / 4 });
    p('B', 'slideTicks');
    p('B', 'slideDirection');
    p('B', 'turnSpeedup', { tx: (v: unknown) => (v as number) + 50, rx: (v: unknown) => (v as number) - 50 });
    p('B', 'shells');
    p('B', 'mines');
    p('B', 'trees');
    p('B', 'reload');
    p('B', 'firingRange', { tx: (v: unknown) => (v as number) * 2, rx: (v: unknown) => (v as number) / 2 });
    p('B', 'waterTimer');
    p('f', 'accelerating');
    p('f', 'braking');
    p('f', 'turningClockwise');
    p('f', 'turningCounterClockwise');
    p('f', 'shooting');
    p('f', 'onBoat');
  }

  getDirection16th(): number { return round((this.direction - 1) / 16) % 16; }
  getSlideDirection16th(): number { return round((this.slideDirection - 1) / 16) % 16; }

  getCarryingPillboxes(): WorldPillbox[] {
    const w = this.world as unknown as TankWorld;
    return (w.map.pills as unknown as WorldPillbox[]).filter(
      pill => pill.inTank && pill.owner?.$ === this
    );
  }

  getTile(): [number, number] {
    return [this.getDirection16th(), this.onBoat ? 1 : 0];
  }

  isAlly(other: Tank): boolean {
    return (other === this) || ((this.team !== 255) && (other.team === this.team));
  }

  increaseRange(): void { this.firingRange = min(7, this.firingRange + 0.5); }
  decreaseRange(): void { this.firingRange = max(1, this.firingRange - 0.5); }

  takeShellHit(shell: { direction: number }): number {
    const w = this.world as unknown as TankWorld;
    this.armour -= 5;
    if (this.armour < 0) {
      const largeExplosion = (this.shells + this.mines) > 20;
      this.ref('fireball', w.spawn(Fireball, this.x, this.y, shell.direction, largeExplosion) as Fireball);
      this.kill();
    } else {
      this.slideTicks = 8;
      this.slideDirection = shell.direction;
      if (this.onBoat) {
        this.onBoat = false;
        this.speed = 0;
        if (this.cell!.isType('^')) this.sink();
      }
    }
    return sounds.HIT_TANK;
  }

  takeMineHit(): void {
    const w = this.world as unknown as TankWorld;
    this.armour -= 10;
    if (this.armour < 0) {
      const largeExplosion = (this.shells + this.mines) > 20;
      this.ref('fireball', w.spawn(Fireball, this.x, this.y, this.direction, largeExplosion) as Fireball);
      this.kill();
    } else if (this.onBoat) {
      this.onBoat = false;
      this.speed = 0;
      if (this.cell!.isType('^')) this.sink();
    }
  }

  spawn(team: number): void {
    const w = this.world as unknown as TankWorld;
    this.team = team;
    this.reset();
    this.ref('builder', w.spawn(Builder, this) as Builder);
  }

  update(): void {
    if (this.death()) return;
    this.shootOrReload();
    this.turn();
    this.accelerate();
    this.fixPosition();
    this.move();
  }

  destroy(): void {
    this.dropPillboxes();
    (this.world as unknown as TankWorld).destroy(this.builder!.$);
  }

  death(): boolean {
    if (this.armour !== 255) return false;
    const w = this.world as unknown as TankWorld;
    if (w.authority && this.respawnTimer !== undefined && --this.respawnTimer === 0) {
      delete this.respawnTimer;
      this.reset();
      return false;
    }
    return true;
  }

  shootOrReload(): void {
    if (this.reload > 0) this.reload--;
    if (!this.shooting || this.reload !== 0 || !(this.shells > 0)) return;
    const w = this.world as unknown as TankWorld;
    this.shells--; this.reload = 13;
    w.spawn(Shell, this, { range: this.firingRange, onWater: this.onBoat });
    this.soundEffect(sounds.SHOOTING);
  }

  turn(): void {
    const maxTurn = this.cell!.getTankTurn(this as any) * TANK_TURN_RATE_MULTIPLIER;
    if (this.turningClockwise === this.turningCounterClockwise) {
      this.turnSpeedup = 0;
      return;
    }

    let acceleration: number;
    if (this.turningCounterClockwise) {
      acceleration = maxTurn;
      if (this.turnSpeedup < 10) acceleration /= 2;
      if (this.turnSpeedup < 0) this.turnSpeedup = 0;
      this.turnSpeedup++;
    } else {
      acceleration = -maxTurn;
      if (this.turnSpeedup > -10) acceleration /= 2;
      if (this.turnSpeedup > 0) this.turnSpeedup = 0;
      this.turnSpeedup--;
    }

    this.direction += acceleration;
    while (this.direction < 0) this.direction += 256;
    if (this.direction >= 256) this.direction %= 256;
  }

  accelerate(): void {
    const maxSpeed = this.cell!.getTankSpeed(this as any);
    let acceleration: number;
    if (this.speed > maxSpeed)                       acceleration = -0.25;
    else if (this.accelerating === this.braking)     acceleration =  0.00;
    else if (this.accelerating)                      acceleration =  0.25;
    else                                             acceleration = -0.25;

    if (acceleration > 0 && this.speed < maxSpeed) {
      this.speed = min(maxSpeed, this.speed + acceleration);
    } else if (acceleration < 0 && this.speed > 0) {
      this.speed = max(0, this.speed + acceleration);
    }
  }

  fixPosition(): void {
    const w = this.world as unknown as TankWorld;
    if (this.cell!.getTankSpeed(this as any) === 0) {
      const halftile = TILE_SIZE_WORLD / 2;
      this.x = (this.x! % TILE_SIZE_WORLD) >= halftile ? this.x! + 1 : this.x! - 1;
      this.y = (this.y! % TILE_SIZE_WORLD) >= halftile ? this.y! + 1 : this.y! - 1;
      this.speed = max(0, this.speed - 1);
    }

    for (const other of w.tanks) {
      if (other !== this && other.armour !== 255) {
        if (!(distance({ x: this.x!, y: this.y! }, { x: other.x!, y: other.y! }) > 255)) {
          this.x = other.x! < this.x! ? this.x! + 1 : this.x! - 1;
          this.y = other.y! < this.y! ? this.y! + 1 : this.y! - 1;
        }
      }
    }
  }

  move(): void {
    const w = this.world as unknown as TankWorld;
    let dx = 0, dy = 0;

    if (this.speed > 0) {
      const rad = ((256 - (this.getDirection16th() * 16)) * 2 * PI) / 256;
      dx += round(cos(rad) * ceil(this.speed));
      dy += round(sin(rad) * ceil(this.speed));
    }
    if (this.slideTicks > 0) {
      const rad = ((256 - (this.getSlideDirection16th() * 16)) * 2 * PI) / 256;
      dx += round(cos(rad) * 16);
      dy += round(sin(rad) * 16);
      this.slideTicks--;
    }

    const newx = this.x! + dx;
    const newy = this.y! + dy;
    let slowDown = true;

    if (dx !== 0) {
      const aheadCell = w.map.cellAtWorld(dx > 0 ? newx + 64 : newx - 64, newy);
      if (aheadCell.getTankSpeed(this as any) !== 0) {
        slowDown = false;
        if (!this.onBoat || !!aheadCell.isType(' ', '^') || !(this.speed < 16)) this.x = newx;
      }
    }

    if (dy !== 0) {
      const aheadCell = w.map.cellAtWorld(newx, dy > 0 ? newy + 64 : newy - 64);
      if (aheadCell.getTankSpeed(this as any) !== 0) {
        slowDown = false;
        if (!this.onBoat || !!aheadCell.isType(' ', '^') || !(this.speed < 16)) this.y = newy;
      }
    }

    if ((dx !== 0) || (dy !== 0)) {
      if (slowDown) this.speed = max(0, this.speed - 1);
      const oldcell = this.cell;
      this.updateCell();
      if (oldcell !== this.cell) this.checkNewCell(oldcell);
    }

    if (!this.onBoat && this.speed <= 3 && this.cell!.isType(' ')) {
      if (++this.waterTimer === 15) {
        if (this.shells !== 0 || this.mines !== 0) this.soundEffect(sounds.BUBBLES);
        this.shells = max(0, this.shells - 1);
        this.mines  = max(0, this.mines  - 1);
        this.waterTimer = 0;
      }
    } else {
      this.waterTimer = 0;
    }
  }

  checkNewCell(oldcell: WorldMapCell | null): void {
    const w = this.world as unknown as TankWorld;
    if (this.onBoat) {
      if (!this.cell!.isType(' ', '^')) this.leaveBoat(oldcell);
    } else {
      if (this.cell!.isType('^')) { this.sink(); return; }
      if (this.cell!.isType('b')) this.enterBoat();
    }
    if (this.cell!.mine) w.spawn(MineExplosion, this.cell);
  }

  leaveBoat(oldcell: WorldMapCell | null): void {
    const w = this.world as unknown as TankWorld;
    if (this.cell!.isType('b')) {
      this.cell!.setType(' ', false, 0);
      const x = (this.cell!.x + 0.5) * TILE_SIZE_WORLD;
      const y = (this.cell!.y + 0.5) * TILE_SIZE_WORLD;
      w.spawn(Explosion, x, y);
      w.soundEffect(sounds.SHOT_BUILDING, x, y, this);
    } else {
      if (oldcell?.isType(' ')) {
        oldcell.setType('b', false, 0);
      }
      this.onBoat = false;
    }
  }

  enterBoat(): void {
    this.cell!.setType(' ', false, 0);
    this.onBoat = true;
  }

  sink(): void {
    const w = this.world as unknown as TankWorld;
    w.soundEffect(sounds.TANK_SINKING, this.x, this.y, this);
    this.kill();
  }

  kill(): void {
    this.dropPillboxes();
    this.x = null; this.y = null;
    this.armour = 255;
    this.respawnTimer = 255;
  }

  dropPillboxes(): void {
    const w = this.world as unknown as TankWorld;
    const pills = this.getCarryingPillboxes();
    if (pills.length === 0) return;

    let x = this.cell!.x;
    let sy = this.cell!.y;
    let width = sqrt(pills.length);
    const delta = floor(width / 2);
    width = round(width);
    x -= delta; sy -= delta;
    const ey = sy + width;

    while (pills.length !== 0) {
      for (let y = sy; y < ey; y++) {
        const cell = w.map.cellAtTile(x, y);
        if (cell.base != null || cell.pill != null || cell.isType('|', '}', 'b')) continue;
        const pill = pills.pop();
        if (!pill) return;
        pill.placeAt(cell as unknown as WorldMapCell);
      }
      x += 1;
    }
  }
}

export default Tank;
