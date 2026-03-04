// villain/world/net/server.ts
import BaseWorld from '../base';
import WorldObject from '../object';
import { pack, buildPacker } from '../../struct';
import { SerializationCallback } from './object';

type WorldObjectConstructor = new (world: BaseWorld) => WorldObject;

// ServerWorld: the authoritative server simulation.
export class ServerWorld extends BaseWorld {

  changes: Array<['create' | 'destroy', WorldObject, number]> = [];
  declare private typeIdxCounter: number;

  registerType(type: WorldObjectConstructor): void {
    (type.prototype as { _net_type_idx: number })._net_type_idx = this.typeIdxCounter++;
  }

  spawn(type: WorldObjectConstructor, ...args: unknown[]): WorldObject {
    const obj = this.insert(new type(this));
    this.changes.push(['create', obj, obj.idx!]);
    (obj as unknown as { _net_new: boolean })._net_new = true;
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
    this.changes.push(['destroy', obj, obj.idx!]);
    this.remove(obj);
    obj.destroy();
    obj.emit('destroy');
    obj.emit('finalize');
    return obj;
  }

  dump(obj: WorldObject, isInitial?: boolean): number[] {
    const netObj = obj as unknown as { _net_new: boolean };
    const isCreate = isInitial || netObj._net_new;
    netObj._net_new = false;
    return this.serialize(obj, isCreate);
  }

  dumpTick(isInitial?: boolean): number[] {
    let data: number[] = [];
    for (const obj of this.objects) {
      data = data.concat(this.dump(obj, isInitial));
    }
    return data;
  }

  serialize(obj: WorldObject, isCreate: boolean): number[] {
    const packer = buildPacker();
    const serializable = obj as unknown as { serialization(isCreate: boolean, p: SerializationCallback): void };
    serializable.serialization(isCreate, (specifier, attribute, options) => {
      if (!options) options = {};
      let value = (obj as unknown as Record<string, unknown>)[attribute];
      if (options.tx) value = options.tx(value);
      if (specifier === 'O') {
        const ref = value as unknown as { $: { idx: number } } | null;
        packer('H', ref ? ref.$.idx : 65535);
      } else {
        packer(specifier as 'B' | 'H' | 'I' | 'f', value as unknown as number | boolean);
      }
    });
    return packer.finish();
  }
}

// Prototype-level default so registerType() calls before instantiation are not
// wiped by the ES2020 class field initializer running in the subclass constructor.
(ServerWorld.prototype as any).typeIdxCounter = 0;

export default ServerWorld;
