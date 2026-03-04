// This module contains everything needed to read, manipulate and save the BMAP format for Bolo
// maps. It's the same format that's used by the original Bolo and WinBolo.

const { round, floor, min } = Math;
import { MAP_SIZE_TILES } from './constants';

export interface TerrainType {
  ascii: string;
  description: string;
  // Extended by world_map.ts:
  tankSpeed?: number;
  tankTurn?: number;
  manSpeed?: number;
  [key: string]: unknown;
}

// All the different terrain types indexed by numeric ID.
const TERRAIN_TYPES_ARRAY: TerrainType[] = [
  { ascii: '|', description: 'building'        },
  { ascii: ' ', description: 'river'           },
  { ascii: '~', description: 'swamp'           },
  { ascii: '%', description: 'crater'          },
  { ascii: '=', description: 'road'            },
  { ascii: '#', description: 'forest'          },
  { ascii: ':', description: 'rubble'          },
  { ascii: '.', description: 'grass'           },
  { ascii: '}', description: 'shot building'   },
  { ascii: 'b', description: 'river with boat' },
  { ascii: '^', description: 'deep sea'        },
];

// TERRAIN_TYPES is both an array (indexed by number) and an object indexed by ascii char.
export const TERRAIN_TYPES: TerrainType[] & Record<string, TerrainType> =
  TERRAIN_TYPES_ARRAY as TerrainType[] & Record<string, TerrainType>;

for (const type of TERRAIN_TYPES_ARRAY) {
  TERRAIN_TYPES[type.ascii] = type;
}


//### View class

export class MapView {
  // Called every time a tile changes.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRetile(_cell: MapCell, _tx: number, _ty: number): void {}
}


//### MapObject classes

export class MapObject {
  map: Map;
  x: number;
  y: number;
  cell: MapCell;

  constructor(map: Map, x: number, y: number) {
    this.map = map;
    this.x = x;
    this.y = y;
    this.cell = this.map.cells[this.y][this.x];
  }
}

export class Pillbox extends MapObject {
  owner_idx: number;
  armour: number;
  speed: number;
  // Extended by world_pillbox:
  owner?: unknown;
  world?: unknown;

  constructor(map: Map, x: number, y: number, owner_idx: number, armour: number, speed: number) {
    super(map, x, y);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.speed = speed;
  }
}

export class Base extends MapObject {
  owner_idx: number;
  armour: number;
  shells: number;
  mines: number;
  // Extended by world_base:
  owner?: unknown;
  world?: unknown;

  constructor(map: Map, x: number, y: number, owner_idx: number, armour: number, shells: number, mines: number) {
    super(map, x, y);
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.shells = shells;
    this.mines = mines;
  }
}

export class Start extends MapObject {
  direction: number;

  constructor(map: Map, x: number, y: number, direction: number) {
    super(map, x, y);
    this.direction = direction;
  }
}


//### Cell class

export class MapCell {
  map: Map;
  x: number;
  y: number;
  type: TerrainType;
  mine: boolean;
  mineOwner: number;
  idx: number;
  // Set by map objects when they occupy a cell:
  pill?: Pillbox;
  base?: Base;
  // Set by world_map:
  world?: unknown;
  life?: number;

  constructor(map: Map, x: number, y: number) {
    this.map = map;
    this.x = x;
    this.y = y;
    this.type = TERRAIN_TYPES['^'];
    this.mine = this.isEdgeCell();
    this.mineOwner = 255;
    this.idx = (this.y * MAP_SIZE_TILES) + this.x;
  }

  neigh(dx: number, dy: number): MapCell {
    return this.map.cellAtTile(this.x + dx, this.y + dy);
  }

  isType(...args: unknown[]): boolean {
    for (let i = 0; i < args.length; i++) {
      const type = args[i];
      if (this.type === type || this.type.ascii === type) return true;
    }
    return false;
  }

  isEdgeCell(): boolean {
    return (this.x <= 20) || (this.x >= 236) || (this.y <= 20) || (this.y >= 236);
  }

  getNumericType(): number {
    if (this.type.ascii === '^') return -1;
    let num = TERRAIN_TYPES_ARRAY.indexOf(this.type);
    if (this.mine) num += 8;
    return num;
  }

  setType(newType: string | number | TerrainType | null, mine?: boolean, retileRadius?: number): void {
    if (retileRadius === undefined) retileRadius = 1;

    if (mine !== undefined) this.mine = mine;

    if (typeof newType === 'string') {
      this.type = TERRAIN_TYPES[newType];
      if (newType.length !== 1 || this.type == null) {
        throw `Invalid terrain type: ${newType}`;
      }
    } else if (typeof newType === 'number') {
      if (newType >= 10) {
        newType -= 8;
        this.mine = true;
      } else {
        this.mine = false;
      }
      this.type = TERRAIN_TYPES[newType];
      if (this.type == null) throw `Invalid terrain type: ${newType}`;
    } else if (newType !== null) {
      this.type = newType as TerrainType;
    }

    if (this.isEdgeCell()) this.mine = true;

    if (!(retileRadius < 0)) {
      this.map.retile(
        this.x - retileRadius, this.y - retileRadius,
        this.x + retileRadius, this.y + retileRadius
      );
    }
  }

  setTile(tx: number, ty: number): void {
    if (this.mine && !(this.pill != null || this.base != null)) ty += 10;
    this.map.view.onRetile(this, tx, ty);
  }

  retile(): void {
    if (this.pill != null) {
      this.setTile(this.pill.armour, 2);
    } else if (this.base != null) {
      this.setTile(16, 0);
    } else {
      switch (this.type.ascii) {
        case '^': return this.retileDeepSea();
        case '|': return this.retileBuilding();
        case ' ': return this.retileRiver();
        case '~': return this.setTile(7, 1);
        case '%': return this.setTile(5, 1);
        case '=': return this.retileRoad();
        case '#': return this.retileForest();
        case ':': return this.setTile(4, 1);
        case '.': return this.setTile(2, 1);
        case '}': return this.setTile(8, 1);
        case 'b': return this.retileBoat();
      }
    }
  }

  retileDeepSea(): void {
    const neighbourSignificance = (dx: number, dy: number): string => {
      const n = this.neigh(dx, dy);
      if (n.isType('^')) return 'd';
      if (n.isType(' ', 'b')) return 'w';
      return 'l';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if      ((aboveLeft  !== 'd') && (above !== 'd') && (left  !== 'd') && (right === 'd') && (below === 'd')) { return this.setTile(10, 3);
    } else if ((aboveRight !== 'd') && (above !== 'd') && (right !== 'd') && (left  === 'd') && (below === 'd')) { return this.setTile(11, 3);
    } else if ((belowRight !== 'd') && (below !== 'd') && (right !== 'd') && (left  === 'd') && (above === 'd')) { return this.setTile(13, 3);
    } else if ((belowLeft  !== 'd') && (below !== 'd') && (left  !== 'd') && (right === 'd') && (above === 'd')) { return this.setTile(12, 3);
    } else if ((left  === 'w') && (right === 'd')) { return this.setTile(14, 3);
    } else if ((below === 'w') && (above === 'd')) { return this.setTile(15, 3);
    } else if ((above === 'w') && (below === 'd')) { return this.setTile(16, 3);
    } else if ((right === 'w') && (left  === 'd')) { return this.setTile(17, 3);
    } else { return this.setTile(0, 0); }
  }

  retileBuilding(): void {
    const neighbourSignificance = (dx: number, dy: number): string => {
      const n = this.neigh(dx, dy);
      if (n.isType('|', '}')) return 'b';
      return 'o';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(17, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(30, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft === 'b')) { return this.setTile(22, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft === 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(23, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight !== 'b') && (aboveLeft !== 'b') && (belowRight === 'b') && (belowLeft !== 'b')) { return this.setTile(24, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (left === 'b') && (aboveRight === 'b') && (aboveLeft !== 'b') && (belowRight !== 'b') && (belowLeft !== 'b')) { return this.setTile(25, 2);
    } else if ((aboveLeft === 'b') && (above === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(16, 2);
    } else if ((above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(17, 2);
    } else if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (belowLeft === 'b') && (below === 'b')) { return this.setTile(18, 2);
    } else if ((aboveLeft === 'b') && (above === 'b') && (aboveRight === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(19, 2);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (below === 'b') && (aboveRight === 'b') && (belowLeft === 'b') && (aboveLeft  !== 'b') && (belowRight !== 'b')) { return this.setTile(20, 2);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (below === 'b') && (belowRight === 'b') && (aboveLeft === 'b') && (aboveRight !== 'b') && (belowLeft  !== 'b')) { return this.setTile(21, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowRight === 'b') && (aboveRight === 'b')) { return this.setTile(8, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (aboveLeft  === 'b')) { return this.setTile(9, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (belowRight === 'b')) { return this.setTile(10, 2);
    } else if ((above === 'b') && (left === 'b') && (right === 'b') && (below === 'b') && (aboveLeft  === 'b') && (aboveRight === 'b')) { return this.setTile(11, 2);
    } else if ((above === 'b') && (below === 'b') && (left  === 'b') && (right      !== 'b') && (belowLeft  === 'b') && (aboveLeft  !== 'b')) { return this.setTile(12, 2);
    } else if ((above === 'b') && (below === 'b') && (right === 'b') && (belowRight === 'b') && (left       !== 'b') && (aboveRight !== 'b')) { return this.setTile(13, 2);
    } else if ((above === 'b') && (below === 'b') && (right === 'b') && (aboveRight === 'b') && (belowRight !== 'b')) { return this.setTile(14, 2);
    } else if ((above === 'b') && (below === 'b') && (left  === 'b') && (aboveLeft  === 'b') && (belowLeft  !== 'b')) { return this.setTile(15, 2);
    } else if ((right === 'b') && (above === 'b') && (left  === 'b') && (below      !== 'b') && (aboveLeft  !== 'b') && (aboveRight !== 'b')) { return this.setTile(26, 1);
    } else if ((right === 'b') && (below === 'b') && (left  === 'b') && (belowLeft  !== 'b') && (belowRight !== 'b')) { return this.setTile(27, 1);
    } else if ((right === 'b') && (above === 'b') && (below === 'b') && (aboveRight !== 'b') && (belowRight !== 'b')) { return this.setTile(28, 1);
    } else if ((below === 'b') && (above === 'b') && (left  === 'b') && (aboveLeft  !== 'b') && (belowLeft  !== 'b')) { return this.setTile(29, 1);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (aboveRight === 'b') && (aboveLeft  !== 'b')) { return this.setTile(4, 2);
    } else if ((left === 'b') && (right === 'b') && (above === 'b') && (aboveLeft  === 'b') && (aboveRight !== 'b')) { return this.setTile(5, 2);
    } else if ((left === 'b') && (right === 'b') && (below === 'b') && (belowLeft  === 'b') && (belowRight !== 'b')) { return this.setTile(6, 2);
    } else if ((left === 'b') && (right === 'b') && (below === 'b') && (above      !== 'b') && (belowRight === 'b') && (belowLeft !== 'b')) { return this.setTile(7, 2);
    } else if ((right === 'b') && (above === 'b') && (below === 'b')) { return this.setTile(0, 2);
    } else if ((left  === 'b') && (above === 'b') && (below === 'b')) { return this.setTile(1, 2);
    } else if ((right === 'b') && (left  === 'b') && (below === 'b')) { return this.setTile(2, 2);
    } else if ((right === 'b') && (above === 'b') && (left === 'b')) { return this.setTile(3, 2);
    } else if ((right === 'b') && (below === 'b') && (belowRight === 'b')) { return this.setTile(18, 1);
    } else if ((left  === 'b') && (below === 'b') && (belowLeft  === 'b')) { return this.setTile(19, 1);
    } else if ((right === 'b') && (above === 'b') && (aboveRight === 'b')) { return this.setTile(20, 1);
    } else if ((left  === 'b') && (above === 'b') && (aboveLeft  === 'b')) { return this.setTile(21, 1);
    } else if ((right === 'b') && (below === 'b')) { return this.setTile(22, 1);
    } else if ((left  === 'b') && (below === 'b')) { return this.setTile(23, 1);
    } else if ((right === 'b') && (above === 'b')) { return this.setTile(24, 1);
    } else if ((left  === 'b') && (above === 'b')) { return this.setTile(25, 1);
    } else if ((left  === 'b') && (right === 'b')) { return this.setTile(11, 1);
    } else if ((above === 'b') && (below === 'b')) { return this.setTile(12, 1);
    } else if (right === 'b') { return this.setTile(13, 1);
    } else if (left  === 'b') { return this.setTile(14, 1);
    } else if (below === 'b') { return this.setTile(15, 1);
    } else if (above === 'b') { return this.setTile(16, 1);
    } else { return this.setTile(6, 1); }
  }

  retileRiver(): void {
    const neighbourSignificance = (dx: number, dy: number): string => {
      const n = this.neigh(dx, dy);
      if (n.isType('=')) return 'r';
      if (n.isType('^', ' ', 'b')) return 'w';
      return 'l';
    };

    const above = neighbourSignificance( 0, -1);
    const right = neighbourSignificance( 1,  0);
    const below = neighbourSignificance( 0,  1);
    const left  = neighbourSignificance(-1,  0);

    if      ((above === 'l') && (below === 'l') && (right === 'l') && (left === 'l')) { return this.setTile(30, 2);
    } else if ((above === 'l') && (below === 'l') && (right === 'w') && (left === 'l')) { return this.setTile(26, 2);
    } else if ((above === 'l') && (below === 'l') && (right === 'l') && (left === 'w')) { return this.setTile(27, 2);
    } else if ((above === 'l') && (below === 'w') && (right === 'l') && (left === 'l')) { return this.setTile(28, 2);
    } else if ((above === 'w') && (below === 'l') && (right === 'l') && (left === 'l')) { return this.setTile(29, 2);
    } else if ((above === 'l') && (left  === 'l')) { return this.setTile(6, 3);
    } else if ((above === 'l') && (right === 'l')) { return this.setTile(7, 3);
    } else if ((below === 'l') && (left  === 'l')) { return this.setTile(8, 3);
    } else if ((below === 'l') && (right === 'l')) { return this.setTile(9, 3);
    } else if ((below === 'l') && (above === 'l')) { return this.setTile(0, 3);
    } else if ((left  === 'l') && (right === 'l')) { return this.setTile(1, 3);
    } else if (left  === 'l') { return this.setTile(2, 3);
    } else if (below === 'l') { return this.setTile(3, 3);
    } else if (right === 'l') { return this.setTile(4, 3);
    } else if (above === 'l') { return this.setTile(5, 3);
    } else { return this.setTile(1, 0); }
  }

  retileRoad(): void {
    const neighbourSignificance = (dx: number, dy: number): string => {
      const n = this.neigh(dx, dy);
      if (n.isType('=')) return 'r';
      if (n.isType('^', ' ', 'b')) return 'w';
      return 'l';
    };

    const above      = neighbourSignificance( 0, -1);
    const aboveRight = neighbourSignificance( 1, -1);
    const right      = neighbourSignificance( 1,  0);
    const belowRight = neighbourSignificance( 1,  1);
    const below      = neighbourSignificance( 0,  1);
    const belowLeft  = neighbourSignificance(-1,  1);
    const left       = neighbourSignificance(-1,  0);
    const aboveLeft  = neighbourSignificance(-1, -1);

    if ((aboveLeft !== 'r') && (above === 'r') && (aboveRight !== 'r') && (left === 'r') && (right === 'r') && (belowLeft !== 'r') && (below === 'r') && (belowRight !== 'r')) { return this.setTile(11, 0);
    } else if ((above === 'r') && (left  === 'r') && (right === 'r') && (below === 'r')) { return this.setTile(10, 0);
    } else if ((left  === 'w') && (right === 'w') && (above === 'w') && (below === 'w')) { return this.setTile(26, 0);
    } else if ((right === 'r') && (below === 'r') && (left  === 'w') && (above === 'w')) { return this.setTile(20, 0);
    } else if ((left  === 'r') && (below === 'r') && (right === 'w') && (above === 'w')) { return this.setTile(21, 0);
    } else if ((above === 'r') && (left  === 'r') && (below === 'w') && (right === 'w')) { return this.setTile(22, 0);
    } else if ((right === 'r') && (above === 'r') && (left  === 'w') && (below === 'w')) { return this.setTile(23, 0);
    } else if ((above === 'w') && (below === 'w')) { return this.setTile(24, 0);
    } else if ((left  === 'w') && (right === 'w')) { return this.setTile(25, 0);
    } else if ((above === 'w') && (below === 'r')) { return this.setTile(16, 0);
    } else if ((right === 'w') && (left  === 'r')) { return this.setTile(17, 0);
    } else if ((below === 'w') && (above === 'r')) { return this.setTile(18, 0);
    } else if ((left  === 'w') && (right === 'r')) { return this.setTile(19, 0);
    } else if ((right === 'r') && (below === 'r') && (above === 'r') && ((aboveRight === 'r') || (belowRight === 'r'))) { return this.setTile(27, 0);
    } else if ((left  === 'r') && (right === 'r') && (below === 'r') && ((belowLeft  === 'r') || (belowRight === 'r'))) { return this.setTile(28, 0);
    } else if ((left  === 'r') && (above === 'r') && (below === 'r') && ((belowLeft  === 'r') || (aboveLeft  === 'r'))) { return this.setTile(29, 0);
    } else if ((left  === 'r') && (right === 'r') && (above === 'r') && ((aboveRight === 'r') || (aboveLeft  === 'r'))) { return this.setTile(30, 0);
    } else if ((left  === 'r') && (right === 'r') && (below === 'r')) { return this.setTile(12, 0);
    } else if ((left  === 'r') && (above === 'r') && (below === 'r')) { return this.setTile(13, 0);
    } else if ((left  === 'r') && (right === 'r') && (above === 'r')) { return this.setTile(14, 0);
    } else if ((right === 'r') && (above === 'r') && (below === 'r')) { return this.setTile(15, 0);
    } else if ((below === 'r') && (right === 'r') && (belowRight === 'r')) { return this.setTile(6, 0);
    } else if ((below === 'r') && (left  === 'r') && (belowLeft  === 'r')) { return this.setTile(7, 0);
    } else if ((above === 'r') && (left  === 'r') && (aboveLeft  === 'r')) { return this.setTile(8, 0);
    } else if ((above === 'r') && (right === 'r') && (aboveRight === 'r')) { return this.setTile(9, 0);
    } else if ((below === 'r') && (right === 'r')) { return this.setTile(2, 0);
    } else if ((below === 'r') && (left  === 'r')) { return this.setTile(3, 0);
    } else if ((above === 'r') && (left  === 'r')) { return this.setTile(4, 0);
    } else if ((above === 'r') && (right === 'r')) { return this.setTile(5, 0);
    } else if ((right === 'r') || (left  === 'r')) { return this.setTile(0, 1);
    } else if ((above === 'r') || (below === 'r')) { return this.setTile(1, 1);
    } else { return this.setTile(10, 0); }
  }

  retileForest(): void {
    const above = this.neigh( 0, -1).isType('#');
    const right = this.neigh( 1,  0).isType('#');
    const below = this.neigh( 0,  1).isType('#');
    const left  = this.neigh(-1,  0).isType('#');

    if      (!above && !left &&  right &&  below) { return this.setTile(9, 9);
    } else if (!above &&  left && !right &&  below) { return this.setTile(10, 9);
    } else if  (above &&  left && !right && !below) { return this.setTile(11, 9);
    } else if  (above && !left &&  right && !below) { return this.setTile(12, 9);
    } else if  (above && !left && !right && !below) { return this.setTile(16, 9);
    } else if (!above && !left && !right &&  below) { return this.setTile(15, 9);
    } else if (!above &&  left && !right && !below) { return this.setTile(14, 9);
    } else if (!above && !left &&  right && !below) { return this.setTile(13, 9);
    } else if (!above && !left && !right && !below) { return this.setTile(8, 9);
    } else { return this.setTile(3, 1); }
  }

  retileBoat(): void {
    const neighbourSignificance = (dx: number, dy: number): string => {
      const n = this.neigh(dx, dy);
      if (n.isType('^', ' ', 'b')) return 'w';
      return 'l';
    };

    const above = neighbourSignificance( 0, -1);
    const right = neighbourSignificance( 1,  0);
    const below = neighbourSignificance( 0,  1);
    const left  = neighbourSignificance(-1,  0);

    if      ((above !== 'w') && (left  !== 'w')) { return this.setTile(15, 6);
    } else if ((above !== 'w') && (right !== 'w')) { return this.setTile(16, 6);
    } else if ((below !== 'w') && (right !== 'w')) { return this.setTile(17, 6);
    } else if ((below !== 'w') && (left  !== 'w')) { return this.setTile(14, 6);
    } else if (left  !== 'w') { return this.setTile(12, 6);
    } else if (right !== 'w') { return this.setTile(13, 6);
    } else if (below !== 'w') { return this.setTile(10, 6);
    } else { return this.setTile(11, 6); }
  }
}


//### Map class

export type MapCellClass = new (map: Map, x: number, y: number) => MapCell;
export type PillboxClass = new (map: Map, x: number, y: number, owner_idx: number, armour: number, speed: number) => Pillbox;
export type BaseClass = new (map: Map, x: number, y: number, owner_idx: number, armour: number, shells: number, mines: number) => Base;
export type StartClass = new (map: Map, x: number, y: number, direction: number) => Start;

export class Map {
  declare CellClass: MapCellClass;
  declare PillboxClass: PillboxClass;
  declare BaseClass: BaseClass;
  declare StartClass: StartClass;

  view: MapView;
  pills: Pillbox[] = [];
  bases: Base[] = [];
  starts: Start[] = [];
  cells: MapCell[][];
  // Used by world_map:
  world?: unknown;

  constructor() {
    this.view = new MapView();
    this.cells = new Array(MAP_SIZE_TILES);
    for (let y = 0; y < MAP_SIZE_TILES; y++) {
      const row: MapCell[] = (this.cells[y] = new Array(MAP_SIZE_TILES));
      for (let x = 0; x < MAP_SIZE_TILES; x++) {
        row[x] = new this.CellClass(this, x, y);
      }
    }
  }

  setView(view: MapView): void {
    this.view = view;
    this.retile();
  }

  cellAtTile(x: number, y: number): MapCell {
    const row = this.cells[y];
    const cell = row && row[x];
    if (cell) return cell;
    return new this.CellClass(this, x, y);
  }

  each(cb: (cell: MapCell) => void, sx?: number, sy?: number, ex?: number, ey?: number): this {
    if (sx == null || !(sx >= 0)) sx = 0;
    if (sy == null || !(sy >= 0)) sy = 0;
    if (ex == null || !(ex < MAP_SIZE_TILES)) ex = MAP_SIZE_TILES - 1;
    if (ey == null || !(ey < MAP_SIZE_TILES)) ey = MAP_SIZE_TILES - 1;

    for (let y = sy; y <= ey; y++) {
      const row = this.cells[y];
      for (let x = sx; x <= ex; x++) {
        cb(row[x]);
      }
    }
    return this;
  }

  clear(sx?: number, sy?: number, ex?: number, ey?: number): this {
    return this.each(cell => {
      cell.type = TERRAIN_TYPES['^'];
      cell.mine = cell.isEdgeCell();
    }, sx, sy, ex, ey);
  }

  retile(sx?: number, sy?: number, ex?: number, ey?: number): this {
    return this.each(cell => cell.retile(), sx, sy, ex, ey);
  }

  findCenterCell(): MapCell {
    let t = MAP_SIZE_TILES - 1, l = MAP_SIZE_TILES - 1;
    let b = 0, r = 0;
    this.each(c => {
      if (l > c.x) l = c.x;
      if (r < c.x) r = c.x;
      if (t > c.y) t = c.y;
      if (b < c.y) b = c.y;
    });
    if (l > r) {
      t = l = 0;
      b = r = MAP_SIZE_TILES - 1;
    }
    const x = round(l + (r - l) / 2);
    const y = round(t + (b - t) / 2);
    return this.cellAtTile(x, y);
  }

  dump(options?: { noPills?: boolean; noBases?: boolean; noStarts?: boolean }): number[] {
    if (!options) options = {};

    const consecutiveCells = (row: MapCell[], cb: (type: number, count: number, x: number) => void) => {
      let currentType: number | null = null;
      let startx: number | null = null;
      let count = 0;
      for (let x = 0; x < row.length; x++) {
        const cell = row[x];
        const num = cell.getNumericType();
        if (currentType === num) { count++; continue; }
        if (currentType != null) cb(currentType, count, startx!);
        currentType = num;
        startx = x;
        count = 1;
      }
      if (currentType != null) cb(currentType, count, startx!);
    };

    const encodeNibbles = (nibbles: number[]): number[] => {
      const octets: number[] = [];
      let val: number | null = null;
      for (let i = 0; i < nibbles.length; i++) {
        let nibble = nibbles[i] & 0x0F;
        if ((i % 2) === 0) {
          val = nibble << 4;
        } else {
          octets.push(val! + nibble);
          val = null;
        }
      }
      if (val != null) octets.push(val);
      return octets;
    };

    const pills  = options.noPills  ? [] : this.pills;
    const bases  = options.noBases  ? [] : this.bases;
    const starts = options.noStarts ? [] : this.starts;

    let data: number[] = Array.from('BMAPBOLO').map(c => c.charCodeAt(0));
    data.push(1, pills.length, bases.length, starts.length);
    for (const p of pills)  { data.push(p.x, p.y, p.owner_idx, p.armour, p.speed); }
    for (const b of bases)  { data.push(b.x, b.y, b.owner_idx, b.armour, b.shells, b.mines); }
    for (const s of starts) { data.push(s.x, s.y, s.direction); }

    let run: number[] | null = null;
    let seq: number[] | null = null;
    let sx: number | null = null;
    let ex: number | null = null;
    let y: number = 0;

    const flushSequence = () => {
      if (seq == null) return;
      const localSeq = seq;
      seq = null;
      ensureRunSpace(localSeq.length + 1);
      run!.push(localSeq.length - 1);
      run = run!.concat(localSeq);
      ex! >= 0 && (ex = ex! + localSeq.length);
    };

    const flushRun = () => {
      if (run == null) return;
      flushSequence();
      const octets = encodeNibbles(run);
      data.push(octets.length + 4, y, sx!, ex!);
      data = data.concat(octets);
      run = null;
    };

    const ensureRunSpace = (numNibbles: number) => {
      const localRun = run!;
      if (!((((255 - 4) * 2) - localRun.length) < numNibbles)) return;
      flushRun();
      run = [];
      sx = ex;
    };

    for (const row of this.cells) {
      y = row[0].y;
      run = null; sx = null; ex = null; seq = null;

      consecutiveCells(row, (type, count, x) => {
        if (type === -1) { flushRun(); return; }
        if (run == null) { run = []; sx = x; ex = x; }

        if (count > 2) {
          flushSequence();
          while (count > 2) {
            ensureRunSpace(2);
            const seqLen = min(count, 9);
            run!.push(seqLen + 6, type);
            ex = ex! + seqLen;
            count -= seqLen;
          }
        }

        while (count > 0) {
          if (seq == null) seq = [];
          seq.push(type);
          if (seq.length === 8) flushSequence();
          count--;
        }
      });
    }

    flushRun();
    data.push(4, 0xFF, 0xFF, 0xFF);
    return data;
  }

  static load(this: { new(): Map } & typeof Map, buffer: ArrayLike<number>): Map {
    let filePos = 0;
    const readBytes = (num: number, msg: string): number[] => {
      try {
        const sub = Array.from(buffer).slice(filePos, filePos + num);
        filePos += num;
        return sub;
      } catch {
        throw msg;
      }
    };

    const magic = readBytes(8, 'Not a Bolo map.');
    for (let i = 0; i < 'BMAPBOLO'.length; i++) {
      if ('BMAPBOLO'.charCodeAt(i) !== magic[i]) throw 'Not a Bolo map.';
    }
    const [version, numPills, numBases, numStarts] = readBytes(4, 'Incomplete header');
    if (version !== 1) throw `Unsupported map version: ${version}`;

    const map = new (this)();

    const pillsData:  number[][] = [];
    const basesData:  number[][] = [];
    const startsData: number[][] = [];
    for (let i = 0; i < numPills;  i++) pillsData.push(readBytes(5, 'Incomplete pillbox data'));
    for (let i = 0; i < numBases;  i++) basesData.push(readBytes(6, 'Incomplete base data'));
    for (let i = 0; i < numStarts; i++) startsData.push(readBytes(3, 'Incomplete player start data'));

    let maxIterations = 1000;
    while (maxIterations-- > 0) {
      const bytes = readBytes(4, 'Incomplete map data');
      if (bytes.length < 4) break;
      let [dataLen, rowY, sx, ex] = bytes;
      dataLen -= 4;
      if (dataLen === 0 && rowY === 0xFF && sx === 0xFF && ex === 0xFF) break;
      if (dataLen < 0) break;

      const run = readBytes(dataLen, 'Incomplete map data');
      if (run.length < dataLen) break;
      let runPos = 0;
      const takeNibble = (): number => {
        const index = floor(runPos);
        const nibble = index === runPos
          ? (run[index] & 0xF0) >> 4
          : (run[index] & 0x0F);
        runPos += 0.5;
        return nibble;
      };

      let x = sx;
      while (x < ex) {
        const seqLen = takeNibble();
        if (seqLen < 8) {
          for (let i = 1; i <= seqLen + 1; i++) {
            map.cellAtTile(x++, rowY).setType(takeNibble(), undefined, -1);
          }
        } else {
          const type = takeNibble();
          for (let i = 1; i <= seqLen - 6; i++) {
            map.cellAtTile(x++, rowY).setType(type, undefined, -1);
          }
        }
      }
    }
    if (maxIterations <= 0) console.warn('Map data parsing exceeded maximum iterations');

    map.pills  = pillsData.map(args => new map.PillboxClass(map, ...args as [number, number, number, number, number]));
    map.bases  = basesData.map(args => new map.BaseClass(map, ...args as [number, number, number, number, number, number]));
    map.starts = startsData.map(args => new map.StartClass(map, ...args as [number, number, number]));

    return map;
  }
}

(Map.prototype as any).CellClass = MapCell;
(Map.prototype as any).PillboxClass = Pillbox;
(Map.prototype as any).BaseClass = Base;
(Map.prototype as any).StartClass = Start;

export default Map;
