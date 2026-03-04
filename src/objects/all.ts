import WorldPillbox from './world_pillbox';
import WorldBase from './world_base';
import FloodFill from './flood_fill';
import Tank from './tank';
import Explosion from './explosion';
import MineExplosion from './mine_explosion';
import Shell from './shell';
import Fireball from './fireball';
import Builder from './builder';

export interface HasRegisterType {
  registerType(type: new (world: unknown) => unknown): void;
}

export function registerWithWorld(w: HasRegisterType): void {
  w.registerType(WorldPillbox);
  w.registerType(WorldBase);
  w.registerType(FloodFill);
  w.registerType(Tank);
  w.registerType(Explosion);
  w.registerType(MineExplosion);
  w.registerType(Shell);
  w.registerType(Fireball);
  w.registerType(Builder);
}
