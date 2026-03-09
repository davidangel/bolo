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

  private ensureCtx(): CanvasRenderingContext2D | null {
    const existing = this.ctx;
    if (existing && typeof existing.save === 'function' && typeof existing.restore === 'function') {
      return existing;
    }
    const recovered = this.canvas.getContext('2d');
    if (!recovered) {
      return null;
    }
    this.ctx = recovered;
    return recovered;
  }

  private ensureOverlay(width: number, height: number): Uint8ClampedArray {
    const minLen = width * height * 4;
    if (this.overlay && this.overlay.length >= minLen) {
      return this.overlay;
    }

    const fallback = new Uint8ClampedArray(minLen);
    const img = this.images.overlay as HTMLImageElement | undefined;
    const ow = img?.width || width;
    const oh = img?.height || height;
    if (ow <= 0 || oh <= 0) {
      this.overlay = fallback;
      return this.overlay;
    }

    const temp = document.createElement('canvas');
    temp.width = ow;
    temp.height = oh;
    const tempCtx = temp.getContext('2d');
    if (!tempCtx) {
      this.overlay = fallback;
      return this.overlay;
    }

    try {
      tempCtx.globalCompositeOperation = 'copy';
      if (img) {
        tempCtx.drawImage(img, 0, 0);
      }
      const data = tempCtx.getImageData(0, 0, ow, oh).data;
      this.overlay = data;
    } catch {
      this.overlay = fallback;
    }
    return this.overlay;
  }

  setup(): void {
    try {
      this.ctx = this.canvas.getContext('2d')!;
      // Access drawImage to confirm it's available.
      void this.ctx.drawImage;
    } catch (e: any) {
      throw `Could not initialize 2D canvas: ${e.message}`;
    }

    // Extract raw pixel data from the overlay image so we can tint styled tilemaps.
    this.overlay = new Uint8ClampedArray(0);
    const styled = this.images.styled as HTMLImageElement;
    this.ensureOverlay(styled.width || 1, styled.height || 1);

    this.prestyled = {};
  }

  setObjectOpacity(opacity: number): void {
    const ctx = this.ensureCtx();
    if (!ctx) { return; }
    ctx.globalAlpha = opacity;
  }

  drawTile(
    tx: number,
    ty: number,
    dx: number,
    dy: number,
    sizeOrCtx?: number | CanvasRenderingContext2D,
    ctx?: CanvasRenderingContext2D
  ): void {
    const size = typeof sizeOrCtx === 'number' ? sizeOrCtx : TILE_SIZE_PIXELS;
    const target = (typeof sizeOrCtx === 'number' ? ctx : sizeOrCtx) || this.ensureCtx();
    if (!target) { return; }
    target.drawImage(
      this.images.base as HTMLImageElement,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    size, size
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
    const overlay = this.ensureOverlay(width, height);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = 4 * (y * width + x);
        const factor = overlay[i] / 255;
        data[i]     = round(factor * color.r + (1 - factor) * data[i]);
        data[i + 1] = round(factor * color.g + (1 - factor) * data[i + 1]);
        data[i + 2] = round(factor * color.b + (1 - factor) * data[i + 2]);
        data[i + 3] = min(255, data[i + 3] + overlay[i]);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return source;
  }

  drawStyledTile(
    tx: number,
    ty: number,
    style: number | undefined,
    dx: number,
    dy: number,
    sizeOrCtx?: number | CanvasRenderingContext2D,
    ctx?: CanvasRenderingContext2D
  ): void {
    let source: HTMLCanvasElement | HTMLImageElement;
    if (style !== undefined && TEAM_COLORS[style]) {
      if (!this.prestyled[style]) {
        this.prestyled[style] = this.createPrestyled(TEAM_COLORS[style]);
      }
      source = this.prestyled[style];
    } else {
      source = this.images.styled as HTMLImageElement;
    }
    const size = typeof sizeOrCtx === 'number' ? sizeOrCtx : TILE_SIZE_PIXELS;
    const target = (typeof sizeOrCtx === 'number' ? ctx : sizeOrCtx) || this.ensureCtx();
    if (!target) { return; }
    target.drawImage(
      source,
      tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS,
      dx,                    dy,                    size, size
    );
  }

  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {
    const ctx = this.ensureCtx();
    if (!ctx) { return; }
    ctx.save();
    const [left, top, width, height] = this.getViewAreaAtWorld(x, y);
    ctx.translate(-left, -top);
    cb(left, top, width, height);
    ctx.restore();
  }

  drawBuilderIndicator(b: any): void {
    const ctx = this.ensureCtx();
    if (!ctx) { return; }
    const player = b.owner.$;
    const dist = distance(player, b);
    if (dist <= 128) { return; }

    const px = player.x / PIXEL_SIZE_WORLD;
    const py = player.y / PIXEL_SIZE_WORLD;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = min(1.0, (dist - 128) / 1024);
    const offset = min(50, (dist / 10240) * 50) + 32;
    let rad = heading(player, b);
    ctx.beginPath();
    const x = px + cos(rad) * offset;
    const y = py + sin(rad) * offset;
    ctx.moveTo(x, y);
    rad += PI;
    ctx.lineTo(x + cos(rad - 0.4) * 10, y + sin(rad - 0.4) * 10);
    ctx.lineTo(x + cos(rad + 0.4) * 10, y + sin(rad + 0.4) * 10);
    ctx.closePath();
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.restore();
  }

  drawNames(): void {
    const ctx = this.ensureCtx();
    if (!ctx) { return; }
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = 'white';
    ctx.font = 'bold 11px sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
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
        ctx.globalAlpha = alpha;

        const metrics = ctx.measureText(tank.name);
        const tx = round(tank.x / PIXEL_SIZE_WORLD) + 16;
        const ty = round(tank.y / PIXEL_SIZE_WORLD) - 16;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        const nx = tx + 12;
        const ny = ty - 9;
        ctx.lineTo(nx, ny);
        ctx.lineTo(nx + metrics.width, ny);
        ctx.stroke();
        ctx.fillText(tank.name, nx, ny - 2);
      }
    }
    ctx.restore();
  }
}
