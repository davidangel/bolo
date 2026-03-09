// The base is a map object, and thus a slightly special case of world object.

const { min, max } = Math;
import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import type { SerializationCallback } from 'villain/world/net/object';
import type { ObjectRef } from 'villain/world/object';
import type WorldMap from '../world_map';
import type { WorldMapCell } from '../world_map';
import type WorldPillbox from './world_pillbox';


interface WorldBaseWorld {
  authority?: boolean;
  destroy(obj: BoloObject): void;
  spawn(type: unknown, ...args: unknown[]): BoloObject;
  map: WorldMap;
  tanks: TankLike[];
}

interface TankLike extends BoloObject {
  armour: number;
  shells: number;
  mines: number;
  cell: WorldMapCell;
  tank_idx: number;
  team: number;
  isAlly?(other: TankLike): boolean;
}


export class WorldBase extends BoloObject {
  static readonly OWNERSHIP_REGEN_DELAY_TICKS = 1500;
  static readonly OWNERSHIP_REGEN_INTERVAL_TICKS = 50;

  // MapObject constructor fields (set when loaded from map)
  owner_idx: number = 255;
  armour: number = 0;
  shells: number = 0;
  mines: number = 0;

  owner: ObjectRef<TankLike> | null = null;
  refueling: ObjectRef<TankLike> | null = null;
  refuelCounter: number = 0;
  cell: WorldMapCell | null = null;
  owningTeam: number = 255;
  ownedTicks: number = 0;
  regenCounter: number = 0;

  // Dual constructor: world-only (1 arg) or map-loaded (7 args)
  constructor(
    world_or_map: unknown,
    x?: number,
    y?: number,
    owner_idx?: number,
    armour?: number,
    shells?: number,
    mines?: number,
  ) {
    super(world_or_map);
    if (owner_idx !== undefined) this.owner_idx = owner_idx;
    if (armour !== undefined) this.armour = armour;
    if (shells !== undefined) this.shells = shells;
    if (mines !== undefined) this.mines = mines;

    if (x !== undefined && y !== undefined) {
      this.x = (x + 0.5) * TILE_SIZE_WORLD;
      this.y = (y + 0.5) * TILE_SIZE_WORLD;
      // Override the cell's type when loaded from map.
      (world_or_map as { cellAtTile(x: number, y: number): { setType(t: string, mine: boolean, r: number): void } })
        .cellAtTile(x, y)
        .setType('=', false, -1);
    }

    this.on('netUpdate', (changes: Record<string, unknown>) => {
      if (Object.prototype.hasOwnProperty.call(changes, 'owner')) {
        this.updateOwner();
      }
    });
    this.on('netSync', () => this.updateOwner());
  }

  serialization(_isCreate: boolean, p: SerializationCallback): void {
    if (_isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    p('O', 'owner');
    p('O', 'refueling');
    if (this.refueling) {
      p('B', 'refuelCounter');
    }
    p('B', 'armour');
    p('B', 'shells');
    p('B', 'mines');
  }

  updateOwner(): void {
    const newTeam = this.owner?.$.team ?? 255;
    if (newTeam !== this.owningTeam) {
      this.ownedTicks = 0;
      this.regenCounter = 0;
      this.owningTeam = newTeam;
    }

    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      (this as { team: number | null }).team = this.owner.$.team;
    } else {
      this.owner_idx = 255;
      (this as { team: number | null }).team = 255;
    }
    this.cell?.retile();
  }

  anySpawn(): void {
    const w = this.world as unknown as WorldBaseWorld;
    this.cell = w.map.cellAtWorld(this.x!, this.y!);
    (this.cell as unknown as { base: WorldBase }).base = this;
  }

  update(): void {
    this.updateOwnedRegen();

    if (this.refueling &&
        ((this.refueling.$.cell !== this.cell) || (this.refueling.$.armour === 255))) {
      this.ref('refueling', null);
    }
    if (!this.refueling) {
      this.findSubject();
      return;
    }
    if (--this.refuelCounter !== 0) return;

    const tank = this.refueling.$;
    if (this.armour > 0 && tank.armour < 40) {
      const amount = min(5, this.armour, 40 - tank.armour);
      tank.armour += amount;
      this.armour -= amount;
      this.refuelCounter = 46;
    } else if (this.shells > 0 && tank.shells < 40) {
      tank.shells += 1;
      this.shells -= 1;
      this.refuelCounter = 7;
    } else if (this.mines > 0 && tank.mines < 40) {
      tank.mines += 1;
      this.mines -= 1;
      this.refuelCounter = 7;
    } else {
      this.refuelCounter = 1;
    }
  }

  updateOwnedRegen(): void {
    const w = this.world as unknown as WorldBaseWorld;
    if (!w.authority) return;

    const team = this.owner?.$.team;
    if (team === undefined || team === null) {
      this.ownedTicks = 0;
      this.regenCounter = 0;
      this.owningTeam = 255;
      return;
    }

    if (team !== this.owningTeam) {
      this.ownedTicks = 0;
      this.regenCounter = 0;
      this.owningTeam = team;
      return;
    }

    if (++this.ownedTicks < WorldBase.OWNERSHIP_REGEN_DELAY_TICKS) return;
    if (++this.regenCounter < WorldBase.OWNERSHIP_REGEN_INTERVAL_TICKS) return;

    this.regenCounter = 0;
    this.armour = min(255, this.armour + 1);
    this.shells = min(255, this.shells + 1);
    this.mines = min(255, this.mines + 1);
  }

  findSubject(): void {
    const w = this.world as unknown as WorldBaseWorld;
    const tanks = w.tanks.filter(tank => tank.armour !== 255 && tank.cell === this.cell);

    for (const tank of tanks) {
      if (this.owner?.$.isAlly?.(tank)) {
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        let canClaim = true;
        for (const other of tanks) {
          if (other !== tank && !tank.isAlly?.(other)) {
            canClaim = false;
          }
        }
        if (canClaim) {
          this.ref('owner', tank);
          this.updateOwner();
          this.owner!.on('destroy', () => { this.ref('owner', null); this.updateOwner(); });
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        }
      }
    }
  }

  takeShellHit(_shell: unknown): number {
    if (this.owner) {
      const w = this.world as unknown as WorldBaseWorld;
      for (const pill of w.map.pills as unknown as WorldPillbox[]) {
        if (!pill.inTank && !pill.carried && pill.armour > 0) {
          if (pill.owner?.$.isAlly?.(this.owner.$ as any) &&
              distance({ x: this.x!, y: this.y! }, { x: pill.x!, y: pill.y! }) <= 2304) {
            pill.aggravate();
          }
        }
      }
    }
    this.armour = max(0, this.armour - 5);
    return sounds.SHOT_BUILDING;
  }
}

export default WorldBase;
