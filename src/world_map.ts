// This module extends the Map classes with logic, data and hooks needed for a full game.

const { round, random, floor } = Math;
import { TILE_SIZE_WORLD, TILE_SIZE_PIXELS } from './constants';
import { Map, TERRAIN_TYPES, MapCell, TerrainType, Pillbox, Base } from './map';
import * as net from './net';
import * as sounds from './sounds';
import WorldPillbox from './objects/world_pillbox';
import WorldBase from './objects/world_base';
import FloodFill from './objects/flood_fill';


//# Terrain data

interface TerrainAttributes {
  tankSpeed: number;
  tankTurn: number;
  manSpeed: number;
}

const TERRAIN_TYPE_ATTRIBUTES: Record<string, TerrainAttributes> = {
  '|': { tankSpeed:  0, tankTurn: 0.00, manSpeed:  0 },
  ' ': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  0 },
  '~': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '%': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '=': { tankSpeed: 16, tankTurn: 1.00, manSpeed: 16 },
  '#': { tankSpeed:  6, tankTurn: 0.50, manSpeed:  8 },
  ':': { tankSpeed:  3, tankTurn: 0.25, manSpeed:  4 },
  '.': { tankSpeed: 12, tankTurn: 1.00, manSpeed: 16 },
  '}': { tankSpeed:  0, tankTurn: 0.00, manSpeed:  0 },
  'b': { tankSpeed: 16, tankTurn: 1.00, manSpeed: 16 },
  '^': { tankSpeed:  3, tankTurn: 0.50, manSpeed:  0 },
};

for (const ascii in TERRAIN_TYPE_ATTRIBUTES) {
  const attributes = TERRAIN_TYPE_ATTRIBUTES[ascii];
  const type = TERRAIN_TYPES[ascii] as TerrainType & TerrainAttributes;
  Object.assign(type, attributes);
}

// Tank/man speed types extended onto TerrainType
export interface WorldTerrainType extends Omit<TerrainType, 'tankSpeed' | 'tankTurn' | 'manSpeed'>, TerrainAttributes {}


//# WorldMapCell

// Minimal typing for objects that use these cells
interface TankLike {
  armour: number;
  cell: WorldMapCell;
  onBoat: boolean;
  isAlly?: (other: TankLike) => boolean;
}

interface ManLike {
  owner: { $: TankLike };
}

export class WorldMapCell extends MapCell {
  declare map: WorldMap;
  life: number = 0;

  isObstacle(): boolean {
    return ((this.pill as WorldPillbox | undefined)?.armour ?? 0) > 0 ||
           ((this.type as WorldTerrainType).tankSpeed === 0);
  }

  hasTankOnBoat(): boolean {
    for (const tank of (this.map.world as { tanks: TankLike[] }).tanks) {
      if (tank.armour !== 255 && tank.cell === this) {
        if (tank.onBoat) return true;
      }
    }
    return false;
  }

  getTankSpeed(tank: TankLike): number {
    if (((this.pill as WorldPillbox | undefined)?.armour ?? 0) > 0) return 0;
    const base = this.base as WorldBase | undefined;
    if (base?.owner) {
      if (!base.owner.$.isAlly?.(tank as any) && !(base.armour <= 9)) return 0;
    }
    if (tank.onBoat && this.isType('^', ' ')) return 16;
    return (this.type as WorldTerrainType).tankSpeed;
  }

  getTankTurn(tank: TankLike): number {
    if (((this.pill as WorldPillbox | undefined)?.armour ?? 0) > 0) return 0.00;
    const base = this.base as WorldBase | undefined;
    if (base?.owner) {
      if (!base.owner.$.isAlly?.(tank as any) && !(base.armour <= 9)) return 0.00;
    }
    if (tank.onBoat && this.isType('^', ' ')) return 1.00;
    return (this.type as WorldTerrainType).tankTurn;
  }

  getManSpeed(man: ManLike): number {
    const tank = man.owner.$;
    if (((this.pill as WorldPillbox | undefined)?.armour ?? 0) > 0) return 0;
    const base = this.base as WorldBase | undefined;
    if (base?.owner) {
      if (!base.owner.$.isAlly?.(tank as any) && !(base.armour <= 9)) return 0;
    }
    return (this.type as WorldTerrainType).manSpeed;
  }

  getPixelCoordinates(): [number, number] {
    return [(this.x + 0.5) * TILE_SIZE_PIXELS, (this.y + 0.5) * TILE_SIZE_PIXELS];
  }

  getWorldCoordinates(): [number, number] {
    return [(this.x + 0.5) * TILE_SIZE_WORLD, (this.y + 0.5) * TILE_SIZE_WORLD];
  }

  setType(newType: string | number | TerrainType | null, mine?: boolean, retileRadius?: number): void {
    const oldType = this.type;
    const oldMine = this.mine;
    const oldLife = this.life;
    super.setType(newType, mine, retileRadius);

    switch (this.type.ascii) {
      case '.': this.life = 5; break;
      case '}': this.life = 5; break;
      case ':': this.life = 5; break;
      case '~': this.life = 4; break;
      default:  this.life = 0; break;
    }

    (this.map.world as { mapChanged?: (cell: WorldMapCell, oldType: TerrainType, mine: boolean, oldLife?: number) => void })
      ?.mapChanged?.(this, oldType, oldMine, oldLife);
  }

  takeShellHit(shell: { direction: number }): number {
    let sfx = sounds.SHOT_BUILDING;
    if (this.isType('.', '}', ':', '~')) {
      if (--this.life === 0) {
        let nextType: string = ' ';
        switch (this.type.ascii) {
          case '.': nextType = '~'; break;
          case '}': nextType = ':'; break;
          case ':': nextType = ' '; break;
          case '~': nextType = ' '; break;
        }
        this.setType(nextType);
      } else {
        (this.map.world as { mapChanged?: (cell: WorldMapCell, type: TerrainType, mine: boolean) => void })
          ?.mapChanged?.(this, this.type, this.mine);
      }
    } else if (this.isType('#')) {
      this.setType('.');
      sfx = sounds.SHOT_TREE;
    } else if (this.isType('=')) {
      const d = shell.direction;
      const neigh =
        (d >= 224) || (d < 32)   ? this.neigh( 1,  0)
        : (d >= 32) && (d < 96)  ? this.neigh( 0, -1)
        : (d >= 96) && (d < 160) ? this.neigh(-1,  0)
        : this.neigh(0, 1);
      if (neigh.isType(' ', '^')) this.setType(' ');
    } else {
      let nextType: string | undefined;
      switch (this.type.ascii) {
        case '|': nextType = '}'; break;
        case 'b': nextType = ' '; break;
      }
      if (nextType) this.setType(nextType);
    }

    if (this.isType(' ')) {
      (this.map.world as { spawn?: (type: unknown, cell: WorldMapCell) => void })?.spawn?.(FloodFill, this);
    }
    return sfx;
  }

  takeExplosionHit(): void {
    if (this.pill != null) {
      (this.pill as unknown as WorldPillbox).takeExplosionHit?.();
      return;
    }
    if (this.isType('b')) {
      this.setType(' ');
    } else if (!this.isType(' ', '^', 'b')) {
      this.setType('%');
    } else {
      return;
    }
    (this.map.world as { spawn?: (type: unknown, cell: WorldMapCell) => void })?.spawn?.(FloodFill, this);
  }
}


//# WorldMap

export class WorldMap extends Map {
  declare CellClass: typeof Map.prototype.CellClass;
  declare PillboxClass: typeof Map.prototype.PillboxClass;
  declare BaseClass: typeof Map.prototype.BaseClass;

  cellAtPixel(x: number, y: number): WorldMapCell {
    return this.cellAtTile(floor(x / TILE_SIZE_PIXELS), floor(y / TILE_SIZE_PIXELS)) as WorldMapCell;
  }

  cellAtWorld(x: number, y: number): WorldMapCell {
    return this.cellAtTile(floor(x / TILE_SIZE_WORLD), floor(y / TILE_SIZE_WORLD)) as WorldMapCell;
  }

  findCenterCell(): WorldMapCell {
    return super.findCenterCell() as WorldMapCell;
  }

  getRandomStart() {
    return this.starts[round(random() * (this.starts.length - 1))];
  }
}

(WorldMap.prototype as any).CellClass = WorldMapCell;
(WorldMap.prototype as any).PillboxClass = WorldPillbox;
(WorldMap.prototype as any).BaseClass = WorldBase;

export default WorldMap;
