// villain/world/net/local.ts
import BaseWorld from '../base';
import WorldObject from '../object';

type WorldObjectConstructor = new (world: BaseWorld) => WorldObject;

// NetLocalWorld: similar to LocalWorld, but emits additional net-compatible signals.
export class NetLocalWorld extends BaseWorld {

  spawn(type: WorldObjectConstructor, ...args: unknown[]): WorldObject {
    const obj = this.insert(new type(this));
    obj.spawn(...args);
    (obj as unknown as { anySpawn(): void }).anySpawn?.();
    return obj;
  }

  update(obj: WorldObject): WorldObject {
    obj.update();
    obj.emit('update');
    obj.emit('anyUpdate');
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

export default NetLocalWorld;
