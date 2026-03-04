// villain/world/base.ts
import WorldObject from './object';

type WorldObjectConstructor = new (world: BaseWorld) => WorldObject;

// BaseWorld is the base class for the different kinds of World.
export class BaseWorld {
  objects: WorldObject[] = [];

  tick(): void {
    for (const obj of this.objects.slice(0)) {
      this.update(obj);
    }
  }

  insert(obj: WorldObject): WorldObject {
    let i: number;
    for (i = 0; i < this.objects.length; i++) {
      if (obj.updatePriority > this.objects[i].updatePriority) break;
    }
    this.objects.splice(i, 0, obj);
    for (let j = i; j < this.objects.length; j++) {
      this.objects[j].idx = j;
    }
    return obj;
  }

  remove(obj: WorldObject): WorldObject {
    this.objects.splice(obj.idx!, 1);
    for (let i = obj.idx!; i < this.objects.length; i++) {
      this.objects[i].idx = i;
    }
    obj.idx = null;
    return obj;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  registerType(_type: WorldObjectConstructor): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawn(_type: WorldObjectConstructor, ..._args: unknown[]): WorldObject { return null as unknown as WorldObject; }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  update(_obj: WorldObject): WorldObject { return null as unknown as WorldObject; }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  destroy(_obj: WorldObject): WorldObject { return null as unknown as WorldObject; }
}

export default BaseWorld;
