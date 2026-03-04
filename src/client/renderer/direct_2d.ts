// The Direct2D renderer draws the map tile-by-tile each frame. Simple but potentially slow.

import { TILE_SIZE_PIXELS } from '../../constants';
import Common2dRenderer from './common_2d';

export default class Direct2dRenderer extends Common2dRenderer {

  onRetile(cell: any, tx: number, ty: number): void {
    if (!this.isMineVisibleToPlayer(cell) && cell.mine && !cell.pill && !cell.base) {
      ty -= 10;
    }
    cell.tile = [tx, ty];
  }

  drawMap(sx: number, sy: number, w: number, h: number): void {
    const ex = sx + w - 1;
    const ey = sy + h - 1;

    const stx = Math.floor(sx / TILE_SIZE_PIXELS);
    const sty = Math.floor(sy / TILE_SIZE_PIXELS);
    const etx = Math.ceil(ex  / TILE_SIZE_PIXELS);
    const ety = Math.ceil(ey  / TILE_SIZE_PIXELS);

    this.world.map.each((cell: any) => {
      const obj = cell.pill || cell.base;
      if (obj) {
        this.drawStyledTile(cell.tile[0], cell.tile[1], obj.owner != null ? obj.owner.$.team : undefined,
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
      } else {
        this.drawTile(cell.tile[0], cell.tile[1],
          cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
      }
    }, stx, sty, etx, ety);
  }
}
