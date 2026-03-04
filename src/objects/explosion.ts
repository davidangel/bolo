// An explosion is really just a static animation.

const { floor } = Math;
import BoloObject from '../object';


export class Explosion extends BoloObject {
  styled = false as const;

  lifespan: number = 0;

  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    p('B', 'lifespan');
  }

  getTile(): [number, number] {
    switch (floor(this.lifespan / 3)) {
      case 7: return [20, 3];
      case 6: return [21, 3];
      case 5: return [20, 4];
      case 4: return [21, 4];
      case 3: return [20, 5];
      case 2: return [21, 5];
      case 1: return [18, 4];
      default: return [19, 4];
    }
  }

  spawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.lifespan = 23;
  }

  update(): void {
    if (this.lifespan-- === 0) {
      (this.world as unknown as { destroy: (obj: BoloObject) => void }).destroy(this);
    }
  }
}

export default Explosion;
