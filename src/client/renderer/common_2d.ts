// Common2dRenderer shares code between the Canvas2D renderers. It handles canvas initialization,
// styled tilemap preparation and individual tile drawing. Subclasses differ in how they draw the map.

import { TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD } from '../../constants';
import { distance, heading } from '../../helpers';
import TEAM_COLORS, { TeamColor } from '../../team_colors';
import BaseRenderer from './base';

const { min, round, PI, sin, cos } = Math;

export default class Common2dRenderer extends BaseRenderer {
  ctx!: CanvasRenderingContext2D;
  overlay!: Uint8ClampedArray;
  declare prestyled: Record<number, HTMLCanvasElement | HTMLImageElement>;

  setup(): void {
    try {
      this.ctx = this.canvas.getContext('2d')!;
      // Access drawImage to confirm it's available.
      void this.ctx.drawImage;
    } catch (e: any) {
      throw `Could not initialize 2D canvas: ${e.message}`;
    }

    // Extract raw pixel data from the overlay image so we can tint styled tilemaps.
    const img = this.images.overlay as HTMLImageElement;
    const temp = document.createElement('canvas');
    temp.width  = img.width;
    temp.height = img.height;
    const tempCtx = temp.getContext('2d')!;
    tempCtx.globalCompositeOperation = 'copy';
    tempCtx.drawImage(img, 0, 0);
    this.overlay = tempCtx.getImageData(0, 0, img.width, img.height).data;

    this.prestyled = {};
  }

  setObjectOpacity(opacity: number): void {
    if (!this.ctx) { return; }
    this.ctx.globalAlpha = opacity;
  }

  drawTile(tx: number, ty: number, dx: number, dy: number, ctx?: CanvasRenderingContext2D): void {
    (ctx || this.ctx).drawImage(
      this.images.base as HTMLImageElement,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    TILE_SIZE_PIXELS, TILE_SIZE_PIXELS
    );
  }

  createPrestyled(color: TeamColor): HTMLCanvasElement {
    const base = this.images.styled as HTMLImageElement;
    const { width, height } = base;

    const source = document.createElement('canvas');
    source.width  = width;
    source.height = height;

    const ctx = source.getContext('2d')!;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(base, 0, 0);

    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = 4 * (y * width + x);
        const factor = this.overlay[i] / 255;
        data[i]     = round(factor * color.r + (1 - factor) * data[i]);
        data[i + 1] = round(factor * color.g + (1 - factor) * data[i + 1]);
        data[i + 2] = round(factor * color.b + (1 - factor) * data[i + 2]);
        data[i + 3] = min(255, data[i + 3] + this.overlay[i]);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return source;
  }

  drawStyledTile(tx: number, ty: number, style: number | undefined, dx: number, dy: number, ctx?: CanvasRenderingContext2D): void {
    let source: HTMLCanvasElement | HTMLImageElement;
    if (style !== undefined && TEAM_COLORS[style]) {
      if (!this.prestyled[style]) {
        this.prestyled[style] = this.createPrestyled(TEAM_COLORS[style]);
      }
      source = this.prestyled[style];
    } else {
      source = this.images.styled as HTMLImageElement;
    }
    (ctx || this.ctx).drawImage(
      source,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    TILE_SIZE_PIXELS, TILE_SIZE_PIXELS
    );
  }

  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {
    const ctx = this.ctx;
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.restore !== 'function') { return; }
    ctx.save();
    const [left, top, width, height] = this.getViewAreaAtWorld(x, y);
    ctx.translate(-left, -top);
    cb(left, top, width, height);
    ctx.restore();
  }

  drawBuilderIndicator(b: any): void {
    if (!this.ctx) { return; }
    const player = b.owner.$;
    const dist = distance(player, b);
    if (dist <= 128) { return; }

    const px = player.x / PIXEL_SIZE_WORLD;
    const py = player.y / PIXEL_SIZE_WORLD;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = min(1.0, (dist - 128) / 1024);
    const offset = min(50, (dist / 10240) * 50) + 32;
    let rad = heading(player, b);
    this.ctx.beginPath();
    const x = px + cos(rad) * offset;
    const y = py + sin(rad) * offset;
    this.ctx.moveTo(x, y);
    rad += PI;
    this.ctx.lineTo(x + cos(rad - 0.4) * 10, y + sin(rad - 0.4) * 10);
    this.ctx.lineTo(x + cos(rad + 0.4) * 10, y + sin(rad + 0.4) * 10);
    this.ctx.closePath();
    this.ctx.fillStyle = 'yellow';
    this.ctx.fill();
    this.ctx.restore();
  }

  drawNames(): void {
    if (!this.ctx) { return; }
    this.ctx.save();
    this.ctx.strokeStyle = this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.textAlign = 'left';
    const { player } = this.world;

    for (const tank of this.world.tanks) {
      if (tank.name && tank.armour !== 255 && tank !== player) {
        if (!this.isVisibleToPlayer(tank)) { continue; }

        let alpha: number;
        if (player) {
          const dist = distance(player, tank);
          if (dist <= 768) { continue; }
          alpha = min(1.0, (dist - 768) / 1536);
        } else {
          alpha = 1.0;
        }
        this.ctx.globalAlpha = alpha;

        const metrics = this.ctx.measureText(tank.name);
        const tx = round(tank.x / PIXEL_SIZE_WORLD) + 16;
        const ty = round(tank.y / PIXEL_SIZE_WORLD) - 16;
        this.ctx.beginPath();
        this.ctx.moveTo(tx, ty);
        const nx = tx + 12;
        const ny = ty - 9;
        this.ctx.lineTo(nx, ny);
        this.ctx.lineTo(nx + metrics.width, ny);
        this.ctx.stroke();
        this.ctx.fillText(tank.name, nx, ny - 2);
      }
    }
    this.ctx.restore();
  }
}
