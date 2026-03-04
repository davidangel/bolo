// The offscreen renderer caches map segments to reduce drawImage calls per frame.
// Each segment is rendered once to an off-screen canvas and then blitted as a whole.
// Firefox benefits greatly from this approach.

import { TILE_SIZE_PIXELS, MAP_SIZE_TILES } from '../../constants';
import Common2dRenderer from './common_2d';

const SEGMENT_SIZE_TILES = 16;
const MAP_SIZE_SEGMENTS  = MAP_SIZE_TILES / SEGMENT_SIZE_TILES;
const SEGMENT_SIZE_PIXEL = SEGMENT_SIZE_TILES * TILE_SIZE_PIXELS;

class CachedSegment {
  renderer: Common2dRenderer;
  // Tile bounds (inclusive)
  sx: number; sy: number; ex: number; ey: number;
  // Pixel bounds (inclusive)
  psx: number; psy: number; pex: number; pey: number;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;

  constructor(renderer: Common2dRenderer, x: number, y: number) {
    this.renderer = renderer;
    this.sx  = x * SEGMENT_SIZE_TILES;
    this.sy  = y * SEGMENT_SIZE_TILES;
    this.ex  = this.sx + SEGMENT_SIZE_TILES - 1;
    this.ey  = this.sy + SEGMENT_SIZE_TILES - 1;
    this.psx = x * SEGMENT_SIZE_PIXEL;
    this.psy = y * SEGMENT_SIZE_PIXEL;
    this.pex = this.psx + SEGMENT_SIZE_PIXEL - 1;
    this.pey = this.psy + SEGMENT_SIZE_PIXEL - 1;
  }

  isInView(sx: number, sy: number, ex: number, ey: number): boolean {
    if (ex < this.psx || ey < this.psy) { return false; }
    if (sx > this.pex || sy > this.pey) { return false; }
    return true;
  }

  build(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SEGMENT_SIZE_PIXEL;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.translate(-this.psx, -this.psy);

    (this.renderer as any).world.map.each((cell: any) => {
      this.onRetile(cell, cell.tile[0], cell.tile[1]);
    }, this.sx, this.sy, this.ex, this.ey);
  }

  clear(): void {
    this.canvas = null;
    this.ctx = null;
  }

  onRetile(cell: any, tx: number, ty: number): void {
    if (!this.canvas) { return; }
    const obj = cell.pill || cell.base;
    if (obj) {
      (this.renderer as Offscreen2dRenderer).drawStyledTile(
        cell.tile[0], cell.tile[1],
        obj.owner != null ? obj.owner.$.team : undefined,
        cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS,
        this.ctx!
      );
    } else {
      (this.renderer as Offscreen2dRenderer).drawTile(
        cell.tile[0], cell.tile[1],
        cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS,
        this.ctx!
      );
    }
  }
}

export default class Offscreen2dRenderer extends Common2dRenderer {
  declare cache: CachedSegment[][];

  setup(): void {
    super.setup();

    this.cache = [];
    for (let y = 0; y < MAP_SIZE_SEGMENTS; y++) {
      const row: CachedSegment[] = [];
      this.cache.push(row);
      for (let x = 0; x < MAP_SIZE_SEGMENTS; x++) {
        row.push(new CachedSegment(this, x, y));
      }
    }
  }

  onRetile(cell: any, tx: number, ty: number): void {
    if (!this.isMineVisibleToPlayer(cell) && cell.mine && !cell.pill && !cell.base) {
      ty -= 10;
    }
    cell.tile = [tx, ty];

    const segx = Math.floor(cell.x / SEGMENT_SIZE_TILES);
    const segy = Math.floor(cell.y / SEGMENT_SIZE_TILES);
    this.cache[segy][segx].onRetile(cell, tx, ty);
  }

  drawMap(sx: number, sy: number, w: number, h: number): void {
    const ex = sx + w - 1;
    const ey = sy + h - 1;

    let alreadyBuiltOne = false;
    for (const row of this.cache) {
      for (const segment of row) {
        if (!segment.isInView(sx, sy, ex, ey)) {
          if (segment.canvas) { segment.clear(); }
          continue;
        }

        if (!segment.canvas) {
          if (alreadyBuiltOne) { continue; }
          segment.build();
          alreadyBuiltOne = true;
        }

        this.ctx.drawImage(
          segment.canvas!,
          0, 0, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL,
          segment.psx, segment.psy, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL
        );
      }
    }
  }
}
