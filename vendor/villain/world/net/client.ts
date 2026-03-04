// villain/world/net/client.ts
import BaseWorld from '../base';
import WorldObject from '../object';
import { unpack, buildUnpacker } from '../../struct';
import { NetWorldObject, SerializationCallback } from './object';

type WorldObjectConstructor = new (world: BaseWorld) => WorldObject;

// ClientWorld: runs a local simulation and handles sync with the server.
export class ClientWorld extends BaseWorld {

  changes: Array<['create' | 'destroy', number, WorldObject]> = [];
  declare types: WorldObjectConstructor[];

  registerType(type: WorldObjectConstructor): void {
    if (!this.hasOwnProperty('types')) this.types = [];
    this.types.push(type);
  }

  spawn(type: WorldObjectConstructor, ...args: unknown[]): WorldObject {
    const obj = this.insert(new type(this));
    this.changes.unshift(['create', obj.idx!, obj]);
    (obj as unknown as { _net_transient: boolean })._net_transient = true;
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
    this.changes.unshift(['destroy', obj.idx!, obj]);
    this.remove(obj);
    obj.emit('destroy');
    if ((obj as { _net_transient?: boolean })._net_transient) obj.emit('finalize');
    return obj;
  }

  netRestore(): void {
    if (!(this.changes.length > 0)) return;
    for (const [type, idx, obj] of this.changes) {
      switch (type) {
        case 'create':
          if (          (obj as unknown as { _net_revived?: boolean })._net_revived === undefined &&
              (obj as unknown as { _net_transient?: boolean })._net_transient) {
            obj.emit('finalize');
          }
          this.objects.splice(idx, 1);
          break;
        case 'destroy':
          (obj as unknown as { _net_revived: boolean })._net_revived = true;
          this.objects.splice(idx, 0, obj);
          break;
      }
    }
    this.changes = [];
    for (let i = 0; i < this.objects.length; i++) {
      this.objects[i].idx = i;
    }
  }

  netSpawn(data: number[], offset: number): number {
    const type = this.types[data[offset]];
    const obj = this.insert(new type(this));
    (obj as unknown as { _net_transient: boolean; _net_new: boolean })._net_transient = false;
    (obj as unknown as { _net_new: boolean })._net_new = true;
    return 1;
  }

  netUpdate(obj: WorldObject, data: number[], offset: number): number {
    const netObj = obj as unknown as { _net_new: boolean };
    const [bytes, changes] = this.deserialize(obj, data, offset, netObj._net_new);
    if (netObj._net_new) {
      (obj as unknown as NetWorldObject).netSpawn();
      (obj as unknown as { anySpawn(): void }).anySpawn?.();
      netObj._net_new = false;
    } else {
      obj.emit('netUpdate', changes);
      obj.emit('anyUpdate');
    }
    obj.emit('netSync');
    return bytes;
  }

  netDestroy(data: number[], offset: number): number {
    const [values, bytes] = unpack('H', data, offset);
    const obj_idx = values[0] as number;
    const obj = this.objects[obj_idx];
    const netObj = obj as unknown as { _net_new?: boolean };
    if (!netObj._net_new) {
      obj.emit('netDestroy');
      obj.emit('anyDestroy');
      obj.emit('finalize');
    }
    this.remove(obj);
    return bytes;
  }

  netTick(data: number[], offset: number): number {
    let bytes = 0;
    for (const obj of this.objects) {
      bytes += this.netUpdate(obj, data, offset + bytes);
    }
    return bytes;
  }

  deserialize(
    obj: WorldObject,
    data: number[],
    offset: number,
    isCreate: boolean,
  ): [number, Record<string, unknown>] {
    const unpacker = buildUnpacker(data, offset);
    const changes: Record<string, unknown> = {};
    const serializable = obj as unknown as { serialization(isCreate: boolean, p: SerializationCallback): void };
    serializable.serialization(isCreate, (specifier, attribute, options) => {
      if (!options) options = {};
      const rec = obj as unknown as Record<string, unknown>;
      if (specifier === 'O') {
        const other = this.objects[unpacker('H') as number];
        const ref = rec[attribute] as { $: unknown } | null | undefined;
        const oldValue = ref?.$;
        if (oldValue !== other) {
          changes[attribute] = oldValue;
          (obj as unknown as WorldObject & { ref(a: string, o: unknown): void }).ref(attribute, other);
        }
      } else {
        let value: number | boolean = unpacker(specifier as 'B' | 'H' | 'I' | 'f');
        if (options.rx) value = options.rx(value) as number | boolean;
        const oldValue = rec[attribute];
        if (oldValue !== value) {
          changes[attribute] = oldValue;
          rec[attribute] = value;
        }
      }
    });
    return [unpacker.finish(), changes];
  }
}

// Prototype-level default so registerType() calls before instantiation are not
// wiped by the ES2020 class field initializer running in the subclass constructor.
(ClientWorld.prototype as any).types = [];

export default ClientWorld;
