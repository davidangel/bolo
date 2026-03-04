// villain/world/net/object.ts
import WorldObject from '../object';

// The base class for all world objects used in network-synchronized games.
export class NetWorldObject extends WorldObject {
  charId: string | null = null;
  _net_type_idx?: number;
  _net_new?: boolean;
  _net_transient?: boolean;
  _net_revived?: boolean;

  // Serialize/deserialize state. Called with a callback `p` for each property.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  serialization(_isCreate: boolean, _p: SerializationCallback): void {}

  // Called after an object was instantiated and deserialized from the network.
  netSpawn(): void {}

  // Convenience called after both `spawn` and `netSpawn`.
  anySpawn(): void {}
}

export type SerializationCallback = (
  specifier: string,
  attribute: string,
  options?: { tx?: (v: unknown) => unknown; rx?: (v: unknown) => unknown }
) => void;

export default NetWorldObject;
