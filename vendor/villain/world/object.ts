// villain/world/object.ts
import { EventEmitter } from 'events';

// Thin reference wrapper for tracking cross-object references and their event listeners.
export interface ObjectRef<T extends WorldObject = WorldObject> {
  $: T;
  owner: WorldObject;
  attribute: string;
  events: Record<string, Array<(...args: unknown[]) => void>>;
  on(event: string, listener: (...args: unknown[]) => void): ObjectRef<T>;
  clear(): void;
}

// The base class for all objects living in the game world.
export class WorldObject extends EventEmitter {
  world: unknown = null;
  idx: number | null = null;
  updatePriority: number = 0;

  constructor(world: unknown) {
    super();
    this.world = world;
  }

  spawn(..._args: unknown[]): void {}
  update(): void {}
  destroy(): void {}

  // Track a reference to another object. Returns the ref wrapper.
  ref<T extends WorldObject>(attribute: string, other: T | null | undefined): ObjectRef<T> | null {
    const existing = (this as unknown as Record<string, unknown>)[attribute] as ObjectRef<T> | null | undefined;
    if (existing?.$ === other) return existing ?? null;
    if (existing) existing.clear();
    if (!other) return null;

    const r: ObjectRef<T> = {
      $: other,
      owner: this,
      attribute,
      events: {},
      on(event, listener) {
        other.on(event, listener);
        (r.events[event] || (r.events[event] = [])).push(listener);
        return r;
      },
      clear() {
        for (const event in r.events) {
          for (const listener of r.events[event]) {
            other.removeListener(event, listener);
          }
        }
        r.owner.removeListener('finalize', r.clear);
        (r.owner as unknown as Record<string, unknown>)[r.attribute] = null;
      },
    };

    r.on('finalize', r.clear);
    this.on('finalize', r.clear);

    (this as unknown as Record<string, unknown>)[attribute] = r;
    return r;
  }
}

export default WorldObject;
