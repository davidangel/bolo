// The Builder class: a tiny man that runs out of the tank to do construction work.

const { round, floor, ceil, min, cos, sin } = Math;
import { TILE_SIZE_WORLD } from '../constants';
import { distance, heading } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import MineExplosion from './mine_explosion';
import type { SerializationCallback } from 'villain/world/net/object';
import type { ObjectRef } from 'villain/world/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';
import type { WorldPillbox } from './world_pillbox';


interface BuilderWorld {
  authority?: boolean;
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike extends BoloObject {
  armour: number;
  mines: number;
  trees: number;
  shells: number;
  onBoat: boolean;
  cell: WorldMapCell;
  x: number | null;
  y: number | null;
  isAlly?(other: TankLike): boolean;
  getCarryingPillboxes(): WorldPillbox[];
}


const STATES = {
  inTank:      0,
  waiting:     1,
  returning:   2,
  parachuting: 3,
  actions: {
    _min:      10,
    forest:    10,
    road:      11,
    repair:    12,
    boat:      13,
    building:  14,
    pillbox:   15,
    mine:      16,
  },
} as const;


export class Builder extends BoloObject {
  readonly styled = true;

  readonly states = STATES;

  order: number = STATES.inTank;
  x: number | null = null;
  y: number | null = null;
  targetX: number = 0;
  targetY: number = 0;
  trees: number = 0;
  hasMine: boolean = false;
  waitTimer: number = 0;
  animation: number = 0;
  owner: ObjectRef<TankLike> | null = null;
  pillbox: ObjectRef<WorldPillbox> | null = null;
  cell: WorldMapCell | null = null;

  constructor(world: unknown) {
    super(world);
    this.on('netUpdate', (changes: Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(changes, 'x') ||
          Object.prototype.hasOwnProperty.call(changes, 'y')) {
        this.updateCell();
      }
    });
  }

  updateCell(): void {
    const w = this.world as unknown as BuilderWorld;
    this.cell = (this.x != null && this.y != null)
      ? w.map.cellAtWorld(this.x, this.y)
      : null;
  }

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('O', 'owner');
    }
    p('B', 'order');
    if (this.order === this.states.inTank) {
      this.x = null; this.y = null;
    } else {
      p('H', 'x');
      p('H', 'y');
      p('H', 'targetX');
      p('H', 'targetY');
      p('B', 'trees');
      p('O', 'pillbox');
      p('f', 'hasMine');
    }
    if (this.order === this.states.waiting) {
      p('B', 'waitTimer');
    }
  }

  getTile(): [number, number] {
    if (this.order === this.states.parachuting) return [16, 1];
    return [17, floor(this.animation / 3)];
  }

  performOrder(action: string, trees: number, cell: WorldMapCell): void {
    if (this.order !== this.states.inTank) return;
    const owner = this.owner!.$;
    if (!owner.onBoat && owner.cell !== cell &&
        !(cell.getManSpeed(this as any) > 0)) return;

    let pill: WorldPillbox | null = null;
    if (action === 'mine') {
      if (owner.mines === 0) return;
      trees = 0;
    } else {
      if (owner.trees < trees) return;
      if (action === 'pillbox') {
        pill = owner.getCarryingPillboxes().pop() ?? null;
        if (!pill) return;
        pill.inTank = false; pill.carried = true;
      }
    }

    this.trees = trees;
    this.hasMine = (action === 'mine');
    this.ref('pillbox', pill as unknown as WorldPillbox);
    if (this.hasMine) owner.mines--;
    owner.trees -= trees;

    this.order = (this.states.actions as Record<string, number>)[action];
    this.x = owner.x; this.y = owner.y;
    [this.targetX, this.targetY] = cell.getWorldCoordinates();
    this.updateCell();
  }

  kill(): void {
    const w = this.world as unknown as BuilderWorld;
    if (!w.authority) return;
    this.soundEffect(sounds.MAN_DYING);
    this.order = this.states.parachuting;
    this.trees = 0; this.hasMine = false;
    if (this.pillbox) {
      this.pillbox.$.placeAt(this.cell!);
      this.ref('pillbox', null);
    }
    const owner = this.owner!.$;
    if (owner.armour === 255) {
      this.targetX = this.x!; this.targetY = this.y!;
    } else {
      this.targetX = owner.x!; this.targetY = owner.y!;
    }
    const startingPos = w.map.getRandomStart();
    [this.x, this.y] = (startingPos.cell as unknown as WorldMapCell).getWorldCoordinates();
  }

  spawn(owner: TankLike): void {
    this.ref('owner', owner);
    this.order = this.states.inTank;
  }

  anySpawn(): void {
    (this as { team: number | null }).team = this.owner!.$.team;
    this.animation = 0;
  }

  update(): void {
    if (this.order === this.states.inTank) return;
    this.animation = (this.animation + 1) % 9;

    switch (this.order) {
      case this.states.waiting:
        if (this.waitTimer-- === 0) this.order = this.states.returning;
        break;
      case this.states.parachuting:
        this.parachutingIn({ x: this.targetX, y: this.targetY });
        break;
      case this.states.returning:
        if (this.owner!.$.armour !== 255) this.move(this.owner!.$, 128, 160);
        break;
      default:
        this.move({ x: this.targetX, y: this.targetY }, 16, 144);
        break;
    }
  }

  move(target: { x: number | null; y: number | null }, targetRadius: number, boatRadius: number): void {
    const w = this.world as unknown as BuilderWorld;
    const manLike = { owner: this.owner! } as { owner: ObjectRef<TankLike> };
    let speed = this.cell!.getManSpeed(manLike as any);
    let onBoat = false;
    const targetCell = w.map.cellAtWorld(this.targetX, this.targetY);

    if (speed === 0 && this.cell === targetCell) speed = 16;

    const owner = this.owner!.$;
    if (owner.armour !== 255 && owner.onBoat &&
        distance({ x: this.x!, y: this.y! }, { x: owner.x!, y: owner.y! }) < boatRadius) {
      onBoat = true; speed = 16;
    }

    speed = min(speed, distance({ x: this.x!, y: this.y! }, { x: target.x!, y: target.y! }));
    const rad = heading({ x: this.x!, y: this.y! }, { x: target.x!, y: target.y! });
    const dx = round(cos(rad) * ceil(speed));
    const dy = round(sin(rad) * ceil(speed));
    const newx = this.x! + dx;
    const newy = this.y! + dy;

    let movementAxes = 0;
    if (dx !== 0) {
      const ahead = w.map.cellAtWorld(newx, this.y!);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(manLike as any) > 0) {
        this.x = newx; movementAxes++;
      }
    }
    if (dy !== 0) {
      const ahead = w.map.cellAtWorld(this.x!, newy);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(manLike as any) > 0) {
        this.y = newy; movementAxes++;
      }
    }

    if (movementAxes === 0) {
      this.order = this.states.returning;
    } else {
      this.updateCell();
      if (distance({ x: this.x!, y: this.y! }, { x: target.x!, y: target.y! }) <= targetRadius) {
        this.reached();
      }
    }
  }

  reached(): void {
    if (this.order === this.states.returning) {
      this.order = this.states.inTank;
      this.x = null; this.y = null;
      if (this.pillbox) {
        this.pillbox.$.inTank = true; this.pillbox.$.carried = false;
        this.ref('pillbox', null);
      }
      const owner = this.owner!.$;
      owner.trees = min(40, owner.trees + this.trees);
      this.trees = 0;
      if (this.hasMine) owner.mines = min(40, owner.mines + 1);
      this.hasMine = false;
      return;
    }

    const w = this.world as unknown as BuilderWorld;

    if (this.cell!.mine) {
      w.spawn(MineExplosion, this.cell);
      this.order = this.states.waiting;
      this.waitTimer = 20;
      return;
    }

    switch (this.order) {
      case this.states.actions.forest:
        if (this.cell!.base || this.cell!.pill || !this.cell!.isType('#')) break;
        this.cell!.setType('.'); this.trees = 4;
        this.soundEffect(sounds.FARMING_TREE);
        break;
      case this.states.actions.road:
        if (this.cell!.base || this.cell!.pill || this.cell!.isType('|', '}', 'b', '^', '#', '=')) break;
        if (this.cell!.isType(' ') && this.cell!.hasTankOnBoat()) break;
        this.cell!.setType('='); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.repair:
        if (this.cell!.pill) {
          const used = (this.cell!.pill as unknown as WorldPillbox).repair(this.trees); this.trees -= used;
        } else if (this.cell!.isType('}')) {
          this.cell!.setType('|'); this.trees = 0;
        } else {
          break;
        }
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.boat:
        if (!this.cell!.isType(' ') || this.cell!.hasTankOnBoat()) break;
        this.cell!.setType('b'); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.building:
        if (this.cell!.base || this.cell!.pill || this.cell!.isType('b', '^', '#', '}', '|', ' ')) break;
        this.cell!.setType('|'); this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.pillbox:
        if (this.cell!.pill || this.cell!.base || this.cell!.isType('b', '^', '#', '|', '}', ' ')) break;
        this.pillbox!.$.armour = 15; this.trees = 0;
        this.pillbox!.$.placeAt(this.cell!); this.ref('pillbox', null);
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.mine:
        if (this.cell!.base || this.cell!.pill || this.cell!.isType('^', ' ', '|', 'b', '}')) break;
        (this.cell! as { mineOwner: number | null }).mineOwner = this.team;
        this.cell!.setType(null, true, 0);
        this.hasMine = false;
        this.soundEffect(sounds.MAN_LAY_MINE);
        break;
    }

    this.order = this.states.waiting;
    this.waitTimer = 20;
  }

  parachutingIn(target: { x: number; y: number }): void {
    if (distance({ x: this.x!, y: this.y! }, target) <= 16) {
      this.order = this.states.returning;
    } else {
      const rad = heading({ x: this.x!, y: this.y! }, target);
      this.x = this.x! + round(cos(rad) * 3);
      this.y = this.y! + round(sin(rad) * 3);
      this.updateCell();
    }
  }
}

export default Builder;
