// The base class for all world objects in Bolo.
import { NetWorldObject } from 'villain/world/net/object';
import type { WorldMap } from './world_map';
import type { WorldMapCell } from './world_map';

export class BoloObject extends NetWorldObject {
  // Whether this object is drawn using the 'base' or 'styled' tilemap, or null if not drawn.
  styled: 'base' | 'styled' | null | boolean = null;

  // Styled objects should set team to the team number for color styling.
  team: number | null = null;

  // World coordinates. null means the object is not in the world (e.g. dead tanks).
  x: number | null = null;
  y: number | null = null;

  declare world: { soundEffect: (sfx: number, x: number | null, y: number | null, source: BoloObject) => void } & Record<string, unknown>;

  // Emit a sound effect from this object's location.
  soundEffect(sfx: number): void {
    this.world.soundEffect(sfx, this.x, this.y, this);
  }

  // Return the (x,y) index in the tilemap for rendering. Subclasses implement this.
  getTile(): [number, number] | undefined { return undefined; }
}

export default BoloObject;
