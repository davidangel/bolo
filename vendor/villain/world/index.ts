// villain/world/index.ts
import BaseWorld from './base';
import WorldObject from './object';

type WorldObjectConstructor = new (world: BaseWorld) => WorldObject;

// LocalWorld: for games that run only on the local machine.
export class LocalWorld extends BaseWorld {

  spawn(type: WorldObjectConstructor, ...args: unknown[]): WorldObject {
    const obj = this.insert(new type(this));
    obj.spawn(...args);
    return obj;
  }

  update(obj: WorldObject): WorldObject {
    obj.update();
    obj.emit('update');
    return obj;
  }

  destroy(obj: WorldObject): WorldObject {
    obj.destroy();
    obj.emit('destroy');
    obj.emit('finalize');
    this.remove(obj);
    return obj;
  }
}

export default LocalWorld;
