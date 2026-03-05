import { createLoop } from 'villain/loop';
import Progress from '../progress';
import Vignette from '../vignette';
import SoundKit from '../soundkit';
import DefaultRenderer from '../renderer/offscreen_2d';
import { TICK_LENGTH_MS } from '../../constants';
import * as helpers from '../../helpers';
import BoloWorldMixin from '../../world_mixin';
import $ from '../../dom';


//# Client world mixin

// Common logic between `BoloLocalWorld` and `BoloClientWorld`

const BoloClientWorldMixin = {

  start(this: any) {
    const vignette = new Vignette();
    return this.waitForCache(vignette, () => {
      return this.loadResources(vignette, () => {
        return this.loaded(vignette);
      });
    });
  },

  // Wait for the applicationCache to finish downloading.
  waitForCache(this: any, vignette: any, callback: () => void) {
    // FIXME: Use applicationCache again.
    return callback();
  },

  // Loads all required resources.
  loadResources(this: any, vignette: any, callback: () => void) {
    vignette.message('Loading resources');
    const progress = new Progress();

    this.images = {};
    this.loadImages((name: string) => {
      let img;
      this.images[name] = (img = new Image());
      img.onload = progress.add() as any;
      return img.src = `images/${name}.png`;
    });

    this.soundkit = new SoundKit();
    this.loadSounds((name: string) => {
      const src = `sounds/${name}.ogg`;
      const parts = name.split('_');
      for (let i = 1; i < parts.length; i++) {
        parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1);
      }
      const methodName = parts.join('');
      return this.soundkit.load(methodName, src, progress.add() as any);
    });

    if (typeof (window as any).applicationCache === 'undefined' || (window as any).applicationCache === null) {
      vignette.showProgress();
      progress.on('progress', (p: any) => vignette.progress(p));
    }
    progress.on('complete', function() {
      vignette.hideProgress();
      return callback();
    });
    return progress.wrapUp();
  },

  loadImages(i: (name: string) => void) {
    i('base');
    i('styled');
    return i('overlay');
  },

  loadSounds(s: (name: string) => void) {
    s('big_explosion_far');
    s('big_explosion_near');
    s('bubbles');
    s('farming_tree_far');
    s('farming_tree_near');
    s('hit_tank_far');
    s('hit_tank_near');
    s('hit_tank_self');
    s('man_building_far');
    s('man_building_near');
    s('man_dying_far');
    s('man_dying_near');
    s('man_lay_mine_near');
    s('mine_explosion_far');
    s('mine_explosion_near');
    s('shooting_far');
    s('shooting_near');
    s('shooting_self');
    s('shot_building_far');
    s('shot_building_near');
    s('shot_tree_far');
    s('shot_tree_near');
    s('tank_sinking_far');
    return s('tank_sinking_near');
  },

  // Common initialization once the map is available.
  commonInitialization(this: any) {
    this.renderer = new DefaultRenderer(this);
    this._renderFailed = false;

    this.map.world = this;
    this.map.setView(this.renderer);

    this.boloInit();

    this.loop = createLoop({
      rate: TICK_LENGTH_MS,
      tick: () => this.tick(),
      frame: () => {
        if (this._renderFailed) { return; }
        try {
          this.renderer.draw();
        } catch (e) {
          this._renderFailed = true;
          if (this.loop != null) {
            this.loop.stop();
          }
          console.error('Renderer failure:', e);
          this.failure('Rendering failed. Please reload the page.');
        }
      }
    });

    this.increasingRange = false;
    this.decreasingRange = false;
    this.rangeAdjustTimer = 0;

    this.input = $.create('input', { id: 'input-dummy', type: 'text', autocomplete: 'off' });
    this.renderer.canvas.parentNode.insertBefore(this.input, this.renderer.canvas);
    this.input.focus();

    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      e.preventDefault();
      switch (e.which) {
          case 90: return this.increasingRange = true;
          case 88: return this.decreasingRange = true;
          default: return this.handleKeydown(e);
        }
    });
    this.input.addEventListener('keyup', (e: KeyboardEvent) => {
        e.preventDefault();
        switch (e.which) {
          case 90: return this.increasingRange = false;
          case 88: return this.decreasingRange = false;
          default: return this.handleKeyup(e);
        }
    });
  },

  // Method called when things go awry.
  failure(this: any, message: string) {
    if (this.loop != null) {
      this.loop.stop();
    }
    const overlay = $.create('div', { class: 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center' });
    const dialog = document.createElement('div');
    dialog.className = 'bg-gray-800 rounded-lg shadow-2xl p-6 min-w-[300px] border border-gray-700';
    let extraLink = '';
    if (message === 'Connection lost') {
      extraLink = '<a href="/" class="block mt-4 text-center text-blue-400 hover:text-blue-300 text-sm">Back to lobby</a>';
    }
    dialog.innerHTML = `
      <p class="text-gray-300 mb-4">${message}</p>
      <button class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">OK</button>
      ${extraLink}
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    (dialog.querySelector('button') as HTMLButtonElement).addEventListener('click', () => overlay.remove());
  },

  // Check and rewrite the build order that the user just tried to do.
  checkBuildOrder(this: any, action: string, cell: any): (string | number | boolean)[] {
    // FIXME: queue actions
    let flexible, trees;
    const builder = this.player.builder.$;
    if (builder.order !== builder.states.inTank) { return [false]; }

    // FIXME: These should notify the user why they failed.
    if (cell.mine) { return [false]; }
    let orderResult: (string | number | boolean)[];
    switch (action) {
      case 'forest':
        if (cell.base || cell.pill || !cell.isType('#')) { orderResult = [false];
        } else { orderResult = ['forest', 0]; }
        break;
      case 'road':
        if (cell.base || cell.pill || cell.isType('|', '}', 'b', '^')) { orderResult = [false];
        } else if (cell.isType('#')) { orderResult = ['forest', 0];
        } else if (cell.isType('=')) { orderResult = [false];
        } else if (cell.isType(' ') && cell.hasTankOnBoat()) { orderResult = [false];
        } else { orderResult = ['road', 2]; }
        break;
      case 'building':
        if (cell.base || cell.pill || cell.isType('b', '^')) { orderResult = [false];
        } else if (cell.isType('#')) { orderResult = ['forest', 0];
        } else if (cell.isType('}')) { orderResult = ['repair', 1];
        } else if (cell.isType('|')) { orderResult = [false];
        } else if (cell.isType(' ')) {
          if (cell.hasTankOnBoat()) { orderResult = [false];
          } else { orderResult = ['boat', 20]; }
        } else if (cell === this.player.cell) { orderResult = [false];
        } else { orderResult = ['building', 2]; }
        break;
      case 'pillbox':
        if (cell.pill) {
          if (cell.pill.armour === 16) { orderResult = [false];
          } else if (cell.pill.armour >= 11) { orderResult = ['repair', 1, true];
          } else if (cell.pill.armour >=  7) { orderResult = ['repair', 2, true];
          } else if (cell.pill.armour >=  3) { orderResult = ['repair', 3, true];
          } else { orderResult = ['repair', 4, true]; }
        } else if (cell.isType('#')) { orderResult = ['forest', 0];
        } else if (cell.base || cell.isType('b', '^', '|', '}', ' ')) { orderResult = [false];
        } else if (cell === this.player.cell) { orderResult = [false];
        } else { orderResult = ['pillbox', 4]; }
        break;
      case 'mine':
        if (cell.base || cell.pill || cell.isType('^', ' ', '|', 'b', '}')) { orderResult = [false];
        } else { orderResult = ['mine']; }
        break;
      default:
        orderResult = [false];
    }
    [action, trees, flexible] = orderResult as [string, number, boolean];

    if (!action) { return [false]; }
    if (action === 'mine') {
      if (this.player.mines === 0) { return [false]; }
      return ['mine'];
    }
    if (action === 'pill') {
      const pills = this.player.getCarryingPillboxes();
      if (pills.length === 0) { return [false]; }
    }
    if (this.player.trees < trees) {
      if (!flexible) { return [false]; }
      ({
        trees
      } = this.player);
    }
    return [action, trees, flexible];
  }
};

helpers.extend(BoloClientWorldMixin as any, BoloWorldMixin as any);


//# Exports
export default BoloClientWorldMixin;
