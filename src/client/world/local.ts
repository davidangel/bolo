import NetLocalWorld from 'villain/world/net/local';
import WorldMap from '../../world_map';
import EverardIsland from '../everard';
import { registerWithWorld } from '../../objects/all';
import Tank from '../../objects/tank';
import { decodeBase64 } from '../base64';
import * as helpers from '../../helpers';
import BoloClientWorldMixin from './mixin';

// FIXME: Better error handling all around.


//# Local game

// The `BoloLocalWorld` class implements a game local to the player's computer/browser.

class BoloLocalWorld extends NetLocalWorld {
  authority: boolean = true;
  rangeAdjustTimer: number = 0;
  increasingRange: boolean = false;
  decreasingRange: boolean = false;

  declare map: any;
  declare commonInitialization: () => void;
  declare spawnMapObjects: () => void;
  declare player: any;
  declare renderer: any;
  declare loop: any;

  // Callback after resources have been loaded.
  loaded(vignette: any): void {
    this.map = WorldMap.load(decodeBase64(EverardIsland));
    this.commonInitialization();
    this.spawnMapObjects();
    this.player = this.spawn(Tank, 0);
    this.renderer.initHud();
    vignette.destroy();
    this.loop.start();
  }

  tick(): void {
    super.tick();

    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) { this.player.increaseRange();
        } else { this.player.decreaseRange(); }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }
  }

  soundEffect(sfx: number, x: number, y: number, owner: any): void {
    this.renderer.playSound(sfx, x, y, owner);
  }

  mapChanged(cell: any, oldType: string, hadMine: boolean, oldLife: number): void {}

  //### Input handlers.

  handleKeydown(e: KeyboardEvent): void {
    e.preventDefault();
    switch (e.which) {
      case 32: this.player.shooting = true; return;
      case 37: this.player.turningCounterClockwise = true; return;
      case 38: this.player.accelerating = true; return;
      case 39: this.player.turningClockwise = true; return;
      case 40: this.player.braking = true; return;
    }
  }

  handleKeyup(e: KeyboardEvent): void {
    switch (e.which) {
      case 32: this.player.shooting = false; return;
      case 37: this.player.turningCounterClockwise = false; return;
      case 38: this.player.accelerating = false; return;
      case 39: this.player.turningClockwise = false; return;
      case 40: this.player.braking = false; return;
    }
  }

  buildOrder(action: string, trees?: number, cell?: any): void {
    return this.player.builder.$.performOrder(action, trees, cell);
  }
}

helpers.extend(BoloLocalWorld.prototype as any, BoloClientWorldMixin as any);
registerWithWorld(BoloLocalWorld.prototype as any);


//# Exports
export default BoloLocalWorld;
