import Map, { MapCell, MapView, Pillbox, Base, Start, TERRAIN_TYPES } from './map';

describe('map module', () => {
  test('terrain lookup works by ascii and number', () => {
    expect(TERRAIN_TYPES[0].ascii).toBe('|');
    expect(TERRAIN_TYPES['^'].description).toContain('deep sea');
  });

  test('MapCell setType handles string/number and edge mine rules', () => {
    const map = new Map();
    const edge = map.cellAtTile(0, 0);
    const inner = map.cellAtTile(100, 100);

    expect(edge.mine).toBe(true);
    expect(inner.mine).toBe(false);

    inner.setType('=', false, -1);
    expect(inner.type.ascii).toBe('=');
    expect(inner.mine).toBe(false);

    inner.setType(10, undefined, -1);
    expect(inner.type.ascii).toBe('~');
    expect(inner.mine).toBe(true);

    expect(() => inner.setType(99, undefined, -1)).toThrow('Invalid terrain type: 91');

    expect(() => inner.setType('not-a-terrain', undefined, -1)).toThrow('Invalid terrain type: not-a-terrain');
  });

  test('MapCell setType accepts TerrainType object directly', () => {
    const map = new Map();
    const cell = map.cellAtTile(100, 100);

    cell.setType(TERRAIN_TYPES['='], false, -1);

    expect(cell.type).toBe(TERRAIN_TYPES['=']);
  });

  test('MapCell setType with null keeps existing type', () => {
    const map = new Map();
    const cell = map.cellAtTile(100, 100);
    cell.setType('=', false, -1);

    cell.setType(null, false, -1);

    expect(cell.type).toBe(TERRAIN_TYPES['=']);
  });

  test('setType default retile radius triggers local retile window', () => {
    const map = new Map();
    const cell = map.cellAtTile(100, 100);
    const retileSpy = jest.spyOn(map, 'retile');

    cell.setType('=', false);

    expect(retileSpy).toHaveBeenCalledWith(99, 99, 101, 101);
    retileSpy.mockRestore();
  });

  test('setTile offsets mined tiles unless occupied', () => {
    const map = new Map();
    const view = { onRetile: jest.fn() } as unknown as MapView;
    map.view = view;
    const cell = map.cellAtTile(100, 100);

    cell.mine = true;
    cell.setTile(3, 2);
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 3, 12);

    cell.pill = {} as any;
    cell.setTile(3, 2);
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 3, 2);
  });

  test('retile renders pill and base overlays before terrain', () => {
    const map = new Map();
    const view = { onRetile: jest.fn() } as unknown as MapView;
    map.view = view;
    const cell = map.cellAtTile(110, 110);

    cell.pill = { armour: 7 } as any;
    cell.retile();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 7, 2);

    cell.pill = undefined;
    cell.base = {} as any;
    cell.retile();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 16, 0);
  });

  test('retile switch dispatches terrain-specific handlers', () => {
    const map = new Map();
    const onRetile = jest.fn();
    map.view = { onRetile } as unknown as MapView;
    const cell = map.cellAtTile(111, 111);

    const terrainList: Array<string> = ['~', '%', '#', ':', '.', '}', 'b', '|', ' ', '=', '^'];
    for (const ascii of terrainList) {
      cell.setType(ascii, false, -1);
      onRetile.mockClear();
      cell.retile();
      expect(onRetile).toHaveBeenCalled();
    }
  });

  test('dump/load round-trips map data and map objects', () => {
    const map = new Map();
    map.cellAtTile(40, 40).setType('=', false, -1);
    map.cellAtTile(41, 40).setType('#', true, -1);
    map.cellAtTile(42, 40).setType('|', false, -1);

    map.pills = [new Pillbox(map, 30, 30, 1, 7, 4)];
    map.bases = [new Base(map, 31, 31, 2, 8, 90, 12)];
    map.starts = [new Start(map, 32, 32, 64)];

    const data = map.dump();
    const loaded = Map.load(data);

    expect(loaded.cellAtTile(40, 40).type.ascii).toBe('=');
    expect(loaded.cellAtTile(41, 40).type.ascii).toBe('#');
    expect(loaded.cellAtTile(41, 40).mine).toBe(true);
    expect(loaded.pills[0]).toMatchObject({ x: 30, y: 30, owner_idx: 1, armour: 7, speed: 4 });
    expect(loaded.bases[0]).toMatchObject({ x: 31, y: 31, owner_idx: 2, armour: 8, shells: 90, mines: 12 });
    expect(loaded.starts[0]).toMatchObject({ x: 32, y: 32, direction: 64 });
  });

  test('load rejects invalid magic and unsupported version', () => {
    const map = new Map();
    const bytes = map.dump({ noPills: true, noBases: true, noStarts: true });

    const badMagic = bytes.slice();
    badMagic[0] = 'X'.charCodeAt(0);
    expect(() => Map.load(badMagic)).toThrow('Not a Bolo map.');

    const badVersion = bytes.slice();
    badVersion[8] = 2;
    expect(() => Map.load(badVersion)).toThrow('Unsupported map version: 2');
  });

  test('cellAtTile returns temporary cell for out-of-bounds', () => {
    const map = new Map();
    const cell = map.cellAtTile(-1, -1);
    expect(cell).toBeInstanceOf(MapCell);
    expect(cell.x).toBe(-1);
    expect(cell.y).toBe(-1);
  });

  test('setView triggers full retile', () => {
    const map = new Map();
    const retileSpy = jest.spyOn(map, 'retile');
    const view = new MapView();

    map.setView(view);

    expect(retileSpy).toHaveBeenCalledTimes(1);
    retileSpy.mockRestore();
  });

  test('findCenterCell returns map center in normal case', () => {
    const map = new Map();
    const center = map.findCenterCell();
    expect(center.x).toBe(128);
    expect(center.y).toBe(128);
  });

  test('findCenterCell fallback branch when iteration yields no cells', () => {
    const map = new Map();
    const originalEach = map.each;
    map.each = jest.fn(() => map) as any;

    const center = map.findCenterCell();

    expect(center.x).toBe(128);
    expect(center.y).toBe(128);
    map.each = originalEach;
  });

  test('retile variants hit expected tile outputs for representative branches', () => {
    const map = new Map();
    const view = { onRetile: jest.fn() } as unknown as MapView;
    map.view = view;
    const cell = map.cellAtTile(100, 100);

    const setNeighbour = (dx: number, dy: number, ascii: string) => {
      map.cellAtTile(100 + dx, 100 + dy).setType(ascii, false, -1);
    };

    cell.setType('^', false, -1);
    setNeighbour(1, 0, '^');
    setNeighbour(0, 1, '^');
    setNeighbour(-1, 0, '#');
    setNeighbour(0, -1, '#');
    setNeighbour(-1, -1, '#');
    cell.retileDeepSea();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 10, 3);

    cell.setType(' ', false, -1);
    setNeighbour(0, -1, '^');
    setNeighbour(1, 0, '^');
    setNeighbour(0, 1, '^');
    setNeighbour(-1, 0, '^');
    cell.retileRiver();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 1, 0);

    cell.setType('=', false, -1);
    setNeighbour(0, -1, '#');
    setNeighbour(1, 0, '#');
    setNeighbour(0, 1, '#');
    setNeighbour(-1, 0, '#');
    cell.retileRoad();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 10, 0);

    cell.setType('#', false, -1);
    setNeighbour(0, -1, '#');
    setNeighbour(1, 0, '#');
    setNeighbour(0, 1, '#');
    setNeighbour(-1, 0, '#');
    cell.retileForest();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 3, 1);

    cell.setType('b', false, -1);
    setNeighbour(0, -1, '^');
    setNeighbour(1, 0, '^');
    setNeighbour(0, 1, '^');
    setNeighbour(-1, 0, '^');
    cell.retileBoat();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 11, 6);

    setNeighbour(0, -1, '#');
    cell.retileRiver();
    expect(view.onRetile).toHaveBeenCalled();

    cell.retileBoat();
    expect(view.onRetile).toHaveBeenCalled();

    cell.setType('|', false, -1);
    setNeighbour(0, -1, '^');
    setNeighbour(1, 0, '^');
    setNeighbour(0, 1, '^');
    setNeighbour(-1, 0, '^');
    setNeighbour(-1, -1, '^');
    setNeighbour(1, -1, '^');
    setNeighbour(-1, 1, '^');
    setNeighbour(1, 1, '^');
    cell.retileBuilding();
    expect(view.onRetile).toHaveBeenLastCalledWith(cell, 6, 1);
  });

  test('retileBuilding table-driven branch cases', () => {
    const map = new Map();
    const view = { onRetile: jest.fn() } as unknown as MapView;
    map.view = view;
    const cell = map.cellAtTile(120, 120);

    const keys = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
    const offsets: Record<(typeof keys)[number], [number, number]> = {
      N: [0, -1],
      NE: [1, -1],
      E: [1, 0],
      SE: [1, 1],
      S: [0, 1],
      SW: [-1, 1],
      W: [-1, 0],
      NW: [-1, -1],
    };

    const configure = (bNeighbours: Array<(typeof keys)[number]>) => {
      for (const k of keys) {
        const [dx, dy] = offsets[k];
        map.cellAtTile(120 + dx, 120 + dy).setType('^', false, -1);
      }
      for (const k of bNeighbours) {
        const [dx, dy] = offsets[k];
        map.cellAtTile(120 + dx, 120 + dy).setType('|', false, -1);
      }
      cell.setType('|', false, -1);
    };

    const cases: Array<{ b: Array<(typeof keys)[number]>; tile: [number, number] }> = [
      { b: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], tile: [17, 1] },
      { b: ['N', 'E', 'S', 'W'], tile: [30, 1] },
      { b: ['E', 'W'], tile: [11, 1] },
      { b: ['N', 'S'], tile: [12, 1] },
      { b: ['E'], tile: [13, 1] },
      { b: ['W'], tile: [14, 1] },
      { b: ['S'], tile: [15, 1] },
      { b: ['N'], tile: [16, 1] },
      { b: ['E', 'S'], tile: [22, 1] },
      { b: ['W', 'S'], tile: [23, 1] },
      { b: ['E', 'N'], tile: [24, 1] },
      { b: ['W', 'N'], tile: [25, 1] },
    ];

    for (const c of cases) {
      configure(c.b);
      cell.retileBuilding();
      expect(view.onRetile).toHaveBeenLastCalledWith(cell, c.tile[0], c.tile[1]);
    }
  });

  test('clear resets selected region to deep sea and edge-mines', () => {
    const map = new Map();
    const inner = map.cellAtTile(100, 100);
    inner.setType('=', false, -1);
    expect(inner.type.ascii).toBe('=');

    map.clear(100, 100, 100, 100);

    expect(inner.type.ascii).toBe('^');
    expect(inner.mine).toBe(false);
  });

  test('load handles encoded run branch and malformed map data gracefully', () => {
    const header = Array.from('BMAPBOLO').map(c => c.charCodeAt(0));
    const noObjects = [1, 0, 0, 0];

    const runEncoded = [
      ...header,
      ...noObjects,
      5, 50, 10, 12,
      0x84,
      4, 0xff, 0xff, 0xff,
    ];
    const decoded = Map.load(runEncoded);
    expect(decoded.cellAtTile(10, 50).type.ascii).toBe('=');
    expect(decoded.cellAtTile(11, 50).type.ascii).toBe('=');

    const negativeDataLen = [
      ...header,
      ...noObjects,
      3, 0, 0, 0,
    ];
    expect(() => Map.load(negativeDataLen)).not.toThrow();

    const shortRun = [
      ...header,
      ...noObjects,
      7, 0, 0, 2,
      0x10,
      4, 0xff, 0xff, 0xff,
    ];
    expect(() => Map.load(shortRun)).not.toThrow();
  });

  test('load warns after parser iteration safety limit', () => {
    const header = Array.from('BMAPBOLO').map(c => c.charCodeAt(0));
    const noObjects = [1, 0, 0, 0];
    const repeatedRuns: number[] = [];
    for (let i = 0; i < 1001; i++) {
      repeatedRuns.push(4, 0, 0, 0);
    }

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    Map.load([...header, ...noObjects, ...repeatedRuns]);
    expect(warnSpy).toHaveBeenCalledWith('Map data parsing exceeded maximum iterations');
    warnSpy.mockRestore();
  });

  test('dump uses long-run encoding path for >2 same tiles', () => {
    const map = new Map();
    const y = 60;
    for (let x = 30; x < 36; x++) {
      map.cellAtTile(x, y).setType('=', false, -1);
    }

    const data = map.dump({ noPills: true, noBases: true, noStarts: true });
    const loaded = Map.load(data);
    for (let x = 30; x < 36; x++) {
      expect(loaded.cellAtTile(x, y).type.ascii).toBe('=');
    }
  });

  test('dump handles oversized synthetic row triggering run-space flush', () => {
    const map = new Map();
    const repeated = map.cellAtTile(100, 100);
    repeated.setType('=', false, -1);
    (map.cells as any)[0] = Array.from({ length: 3000 }, () => repeated);

    const data = map.dump({ noPills: true, noBases: true, noStarts: true });

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('load readBytes catch path throws map error for invalid buffer', () => {
    expect(() => Map.load(null as unknown as ArrayLike<number>)).toThrow('Not a Bolo map.');
  });

  test('exhaustive retile decision trees exercise all tile families', () => {
    const map = new Map();
    const onRetile = jest.fn();
    const view = { onRetile } as unknown as MapView;
    map.view = view;
    const cx = 140;
    const cy = 140;
    const cell = map.cellAtTile(cx, cy);
    const neighbours: Array<[number, number]> = [
      [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];

    const setNeighbourTypes = (chars: string[]) => {
      for (let i = 0; i < neighbours.length; i++) {
        const [dx, dy] = neighbours[i];
        const n = map.cellAtTile(cx + dx, cy + dy);
        n.type = TERRAIN_TYPES[chars[i]];
        n.mine = false;
      }
      cell.mine = false;
    };

    const seenDeepSea = new Set<string>();
    const deepSeaStates = ['^', ' ', '#'];
    for (let mask = 0; mask < 6561; mask++) {
      let x = mask;
      const chars: string[] = [];
      for (let i = 0; i < 8; i++) {
        chars.push(deepSeaStates[x % 3]);
        x = Math.floor(x / 3);
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES['^'];
      onRetile.mockClear();
      cell.retileDeepSea();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenDeepSea.add(`${call[1]},${call[2]}`);
    }
    expect(seenDeepSea).toEqual(new Set(['10,3', '11,3', '13,3', '12,3', '14,3', '15,3', '16,3', '17,3', '0,0']));

    const seenRiver = new Set<string>();
    const riverStates = ['=', '^', '#'];
    for (let mask = 0; mask < 81; mask++) {
      let x = mask;
      const local = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const chars = Array(8).fill('#');
      for (let i = 0; i < local.length; i++) {
        const c = riverStates[x % 3];
        x = Math.floor(x / 3);
        const idx = neighbours.findIndex(([dx, dy]) => dx === local[i][0] && dy === local[i][1]);
        chars[idx] = c;
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES[' '];
      onRetile.mockClear();
      cell.retileRiver();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenRiver.add(`${call[1]},${call[2]}`);
    }
    expect(seenRiver.size).toBeGreaterThanOrEqual(16);

    const seenRoad = new Set<string>();
    for (let mask = 0; mask < 6561; mask++) {
      let x = mask;
      const chars: string[] = [];
      for (let i = 0; i < 8; i++) {
        chars.push(riverStates[x % 3]);
        x = Math.floor(x / 3);
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES['='];
      onRetile.mockClear();
      cell.retileRoad();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenRoad.add(`${call[1]},${call[2]}`);
    }
    expect(seenRoad.size).toBeGreaterThanOrEqual(30);

    const seenBuilding = new Set<string>();
    for (let mask = 0; mask < 256; mask++) {
      const chars: string[] = [];
      for (let i = 0; i < 8; i++) {
        chars.push(((mask >> i) & 1) === 1 ? '|' : '#');
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES['|'];
      onRetile.mockClear();
      cell.retileBuilding();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenBuilding.add(`${call[1]},${call[2]}`);
    }
    expect(seenBuilding.size).toBeGreaterThanOrEqual(30);

    const seenForest = new Set<string>();
    for (let mask = 0; mask < 16; mask++) {
      const chars = Array(8).fill('^');
      const local = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let i = 0; i < local.length; i++) {
        const idx = neighbours.findIndex(([dx, dy]) => dx === local[i][0] && dy === local[i][1]);
        chars[idx] = ((mask >> i) & 1) === 1 ? '#' : '^';
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES['#'];
      onRetile.mockClear();
      cell.retileForest();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenForest.add(`${call[1]},${call[2]}`);
    }
    expect(seenForest.size).toBe(10);

    const seenBoat = new Set<string>();
    for (let mask = 0; mask < 16; mask++) {
      const chars = Array(8).fill('#');
      const local = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let i = 0; i < local.length; i++) {
        const idx = neighbours.findIndex(([dx, dy]) => dx === local[i][0] && dy === local[i][1]);
        chars[idx] = ((mask >> i) & 1) === 1 ? '^' : '#';
      }
      setNeighbourTypes(chars);
      cell.type = TERRAIN_TYPES['b'];
      onRetile.mockClear();
      cell.retileBoat();
      const call = onRetile.mock.calls[onRetile.mock.calls.length - 1]!;
      seenBoat.add(`${call[1]},${call[2]}`);
    }
    expect(seenBoat.size).toBe(8);
  });

  test('dump and load additional branch edges', () => {
    const map = new Map();

    // Encourage seq.length === 8 path.
    const row = map.cells[70];
    for (let x = 0; x < 8; x++) {
      row[x].type = TERRAIN_TYPES[(x % 2 === 0 ? '=' : '#') as '=' | '#'];
      row[x].mine = false;
    }
    row[8].type = TERRAIN_TYPES['^'];
    row[8].mine = false;

    const data = map.dump({ noPills: true, noBases: true, noStarts: true });
    expect(data.length).toBeGreaterThan(0);

    // Incomplete map data branch (readBytes shorter than requested run len).
    const header = Array.from('BMAPBOLO').map(c => c.charCodeAt(0));
    const noObjects = [1, 0, 0, 0];
    const malformed = [
      ...header,
      ...noObjects,
      8, 10, 1, 3,
      0x21,
    ];
    expect(() => Map.load(malformed)).not.toThrow();
  });
});
