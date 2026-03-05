// The base class for all renderers is defined here. A renderer is responsible for drawing the map,
// objects on the map, HUD map overlays and HUD screen overlays. A lot of shared code lives in this
// base class. Methods that need to be implemented by subclasses are stubbed out here. All renderers
// also implement the `MapView` interface.

import { TILE_SIZE_PIXELS, TILE_SIZE_WORLD, PIXEL_SIZE_WORLD, MAP_SIZE_PIXELS } from '../../constants';
import * as SOUNDS from '../../sounds';
import TEAM_COLORS from '../../team_colors';
import $ from '../../dom';

const { min, max, round, cos, sin, PI, sqrt } = Math;

export default class BaseRenderer {
  world: any;
  images: any;
  soundkit: any;
  canvas: HTMLCanvasElement;
  hud: HTMLElement | null = null;
  currentTool: string | null = null;
  lastCenter: [number, number];
  mouse: [number, number] = [0, 0];
  opacityState: Record<number, number> = {};
  tankIndicators: Record<string, HTMLElement> = {};
  pillIndicators: Array<[HTMLElement, any]> = [];
  baseIndicators: Array<[HTMLElement, any]> = [];

  constructor(world: any) {
    this.world = world;
    this.images = world.images;
    this.soundkit = world.soundkit;

    this.canvas = document.createElement('canvas');
    document.body.appendChild(this.canvas);
    this.lastCenter = world.map.findCenterCell().getWorldCoordinates();

    this.canvas.addEventListener('click', e => this.handleClick(e));
    this.canvas.addEventListener('mousemove', e => { this.mouse = [e.pageX, e.pageY]; });

    this.setup();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  // Subclasses use this as their constructor.
  setup(): void {}

  // Check if an object should be visible to the player.
  // Enemy tanks in forest tiles are hidden from view, unless within 2 tiles.
  isVisibleToPlayer(obj: any): boolean {
    const player = this.world.player;
    if (!player) { return true; }
    if (obj === player) { return true; }
    if (obj.team === 255) { return true; }
    if (obj.isAlly == null) { return true; }
    if (obj.isAlly(player)) { return true; }
    if (obj.cell && obj.cell.isType('#')) {
      const dist = Math.sqrt((obj.x - player.x) ** 2 + (obj.y - player.y) ** 2);
      if (dist > 2 * TILE_SIZE_WORLD) { return false; }
    }
    return true;
  }

  // Check if a mine should be visible to the player. Enemy mines are hidden.
  isMineVisibleToPlayer(cell: any): boolean {
    if (this.world?.hideEnemyMinesFromEnemyTanks === false) { return true; }
    if (!cell.mine) { return true; }
    if (cell.mineOwner === 255) { return true; }
    const player = this.world.player;
    if (!player) { return true; }
    if (cell.mineOwner === player.team) { return true; }
    if (player.isAlly == null) { return true; }
    if (player.isAlly({ team: cell.mineOwner })) { return true; }
    return false;
  }

  // Center on (x,y) and invoke cb with the view area (left, top, width, height).
  // Drawing in the callback is translated so (x,y) is the center.
  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {}

  // Draw the tile at tilemap index (tx,ty), placing its top-left at screen pixel (sdx,sdy).
  drawTile(tx: number, ty: number, sdx: number, sdy: number): void {}

  // Like drawTile but from the styled tilemap, with an overlay tinted to `style` (team index).
  drawStyledTile(tx: number, ty: number, style: number | undefined, sdx: number, sdy: number): void {}

  // Draw the visible portion of the map (sx,sy,w,h in pixel coordinates).
  drawMap(sx: number, sy: number, w: number, h: number): void {}

  // Draw an arrow towards the builder when it is outside the tank.
  drawBuilderIndicator(builder: any): void {}

  // Called by MapView when a cell's tile index changes.
  onRetile(cell: any, tx: number, ty: number): void {}

  // Set alpha for the next object draw (used for fade in/out).
  setObjectOpacity(opacity: number): void {}

  // Draw a single frame.
  draw(): void {
    let x: number | null = null;
    let y: number | null = null;
    if (this.world.player) {
      ({ x, y } = this.world.player);
      if (this.world.player.fireball != null) { ({ x, y } = this.world.player.fireball.$); }
    }

    if (x == null || y == null) {
      [x, y] = this.lastCenter;
    } else {
      this.lastCenter = [x, y];
    }

    this.centerOn(x, y, (left, top, width, height) => {
      this.drawMap(left, top, width, height);
      for (const obj of this.world.objects) {
        if (obj.styled != null && obj.x != null && obj.y != null) {
          const shouldBeVisible = this.isVisibleToPlayer(obj);

          if (this.opacityState[obj.idx] === undefined) {
            this.opacityState[obj.idx] = shouldBeVisible ? 1 : 0;
          }

          if (shouldBeVisible) {
            this.opacityState[obj.idx] = Math.min(1, this.opacityState[obj.idx] + (1 / 30));
          } else {
            this.opacityState[obj.idx] = Math.max(0, this.opacityState[obj.idx] - (1 / 30));
          }

          if (this.opacityState[obj.idx] <= 0) { continue; }

          if (this.opacityState[obj.idx] < 1) {
            this.setObjectOpacity(this.opacityState[obj.idx]);
          }

          const [tx, ty] = obj.getTile();
          const ox = round(obj.x / PIXEL_SIZE_WORLD) - (TILE_SIZE_PIXELS / 2);
          const oy = round(obj.y / PIXEL_SIZE_WORLD) - (TILE_SIZE_PIXELS / 2);
          switch (obj.styled) {
            case true:  this.drawStyledTile(tx, ty, obj.team, ox, oy); break;
            case false: this.drawTile(tx, ty, ox, oy); break;
          }

          if (this.opacityState[obj.idx] < 1) {
            this.setObjectOpacity(1);
          }
        }
      }
      this.drawOverlay();
    });

    if (this.hud) { this.updateHud(); }
  }

  // Play a sound effect.
  playSound(sfx: number, x: number, y: number, owner: any): void {
    let mode: string;
    if (this.world.player && owner === this.world.player) {
      mode = 'Self';
    } else {
      const dx = x - this.lastCenter[0];
      const dy = y - this.lastCenter[1];
      const dist = sqrt(dx * dx + dy * dy);
      if (dist > 40 * TILE_SIZE_WORLD)      { mode = 'None'; }
      else if (dist > 15 * TILE_SIZE_WORLD) { mode = 'Far';  }
      else                                  { mode = 'Near'; }
    }
    if (mode === 'None') { return; }

    let name: string | undefined;
    switch (sfx) {
      case SOUNDS.BIG_EXPLOSION:  name = `bigExplosion${mode}`; break;
      case SOUNDS.BUBBLES:        if (mode === 'Self') { name = 'bubbles'; } break;
      case SOUNDS.FARMING_TREE:   name = `farmingTree${mode}`; break;
      case SOUNDS.HIT_TANK:       name = `hitTank${mode}`; break;
      case SOUNDS.MAN_BUILDING:   name = `manBuilding${mode}`; break;
      case SOUNDS.MAN_DYING:      name = `manDying${mode}`; break;
      case SOUNDS.MAN_LAY_MINE:   if (mode === 'Near') { name = 'manLayMineNear'; } break;
      case SOUNDS.MINE_EXPLOSION: name = `mineExplosion${mode}`; break;
      case SOUNDS.SHOOTING:       name = `shooting${mode}`; break;
      case SOUNDS.SHOT_BUILDING:  name = `shotBuilding${mode}`; break;
      case SOUNDS.SHOT_TREE:      name = `shotTree${mode}`; break;
      case SOUNDS.TANK_SINKING:   name = `tankSinking${mode}`; break;
    }
    if (name) { (this.soundkit as any)[name]?.(); }
  }

  handleResize(): void {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width  = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    document.body.style.width  = window.innerWidth + 'px';
    document.body.style.height = window.innerHeight + 'px';
  }

  handleClick(e: MouseEvent): void {
    e.preventDefault();
    this.world.input.focus();
    if (!this.currentTool) { return; }
    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);
    const [action, trees] = this.world.checkBuildOrder(this.currentTool, cell);
    if (action) { this.world.buildOrder(action, trees, cell); }
  }

  // Get the view area [left, top, width, height] in pixels when centered on world coords (x,y).
  getViewAreaAtWorld(x: number, y: number): [number, number, number, number] {
    const { width, height } = this.canvas;
    let left = round((x / PIXEL_SIZE_WORLD) - (width  / 2));
    left = max(0, min(MAP_SIZE_PIXELS - width,  left));
    let top  = round((y / PIXEL_SIZE_WORLD) - (height / 2));
    top  = max(0, min(MAP_SIZE_PIXELS - height, top));
    return [left, top, width, height];
  }

  // Get the map cell at the given screen coordinates.
  getCellAtScreen(x: number, y: number): any {
    const [cameraX, cameraY] = this.lastCenter;
    const [left, top] = this.getViewAreaAtWorld(cameraX, cameraY);
    return this.world.map.cellAtPixel(left + x, top + y);
  }

  //### HUD

  drawOverlay(): void {
    const player = this.world.player;
    if (player && player.armour !== 255) {
      const b = player.builder.$;
      if (b.order !== b.states.inTank && b.order !== b.states.parachuting) {
        this.drawBuilderIndicator(b);
      }
      if (this.shouldShowReticle()) {
        this.drawReticle();
      }
    }
    this.drawNames();
    this.drawCursor();
  }

  shouldShowReticle(): boolean {
    const player = this.world.player;
    if (!player || player.armour === 255) {
      return false;
    }

    const autoGunsight = !!this.world?.settingsManager?.getAutoGunsight?.();
    if (!autoGunsight) {
      return true;
    }

    const builder = player.builder?.$;
    if (builder && builder.order !== builder.states.inTank) {
      return false;
    }

    if (this.currentTool != null) {
      return false;
    }

    return true;
  }

  drawReticle(): void {
    const distance = this.world.player.firingRange * TILE_SIZE_PIXELS;
    const rad = ((256 - this.world.player.direction) * 2 * PI) / 256;
    const x = round((this.world.player.x / PIXEL_SIZE_WORLD) + (cos(rad) * distance)) - (TILE_SIZE_PIXELS / 2);
    const y = round((this.world.player.y / PIXEL_SIZE_WORLD) + (sin(rad) * distance)) - (TILE_SIZE_PIXELS / 2);
    this.drawTile(17, 4, x, y);
  }

  drawCursor(): void {
    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);
    this.drawTile(18, 6, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
  }

  drawNames(): void {}

  initHud(): void {
    this.hud = document.createElement('div');
    document.body.appendChild(this.hud);
    this.initHudTankStatus();
    this.initHudPillboxes();
    this.initHudBases();
    this.initHudToolSelect();
    this.initHudNotices();
    this.initSettingsButton();
    this.updateHud();
  }

  initSettingsButton(): void {
    const btn = $.create('button', { id: 'settings-btn' }) as HTMLButtonElement;
    btn.innerHTML = '⚙';
    btn.style.position = 'absolute';
    btn.style.top = '8px';
    btn.style.right = '8px';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.color = '#c0c0f0';
    btn.style.fontSize = '24px';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '100';
    this.hud!.appendChild(btn);
    btn.addEventListener('click', () => {
      if (this.world.showSettings) { this.world.showSettings(); }
    });
  }

  initHudTankStatus(): void {
    const container = $.create('div', { id: 'tankStatus' });
    this.hud!.appendChild(container);
    container.appendChild($.create('div', { class: 'deco' }));
    this.tankIndicators = {};
    for (const indicator of ['shells', 'mines', 'armour', 'trees']) {
      const bar = $.create('div', { class: 'gauge', id: `tank-${indicator}` });
      container.appendChild(bar);
      const inner = $.create('div') as HTMLElement;
      inner.className = 'gauge-content';
      bar.appendChild(inner);
      this.tankIndicators[indicator] = inner;
    }
  }

  initHudPillboxes(): void {
    const container = $.create('div', { id: 'pillStatus' });
    this.hud!.appendChild(container);
    container.appendChild($.create('div', { class: 'deco' }));
    this.pillIndicators = [];
    for (const pill of this.world.map.pills) {
      const node = $.create('div', { class: 'pill' }) as HTMLElement;
      container.appendChild(node);
      this.pillIndicators.push([node, pill]);
    }
  }

  initHudBases(): void {
    const container = $.create('div', { id: 'baseStatus' });
    this.hud!.appendChild(container);
    container.appendChild($.create('div', { class: 'deco' }));
    this.baseIndicators = [];
    for (const base of this.world.map.bases) {
      const node = $.create('div', { class: 'base' }) as HTMLElement;
      container.appendChild(node);
      this.baseIndicators.push([node, base]);
    }
  }

  initHudToolSelect(): void {
    this.currentTool = null;
    const tools = $.create('div', { id: 'tool-select' });
    this.hud!.appendChild(tools);
    for (const toolType of ['forest', 'road', 'building', 'pillbox', 'mine']) {
      this.initHudTool(tools, toolType);
    }
  }

  initHudTool(tools: Element, toolType: string): void {
    const toolname = `tool-${toolType}`;
    const tool = $.create('input', { type: 'radio', name: 'tool', id: toolname }) as HTMLInputElement;
    tools.appendChild(tool);
    const label = $.create('label', { for: toolname });
    tools.appendChild(label);
    label.appendChild($.create('span', { class: `bolo-tool bolo-${toolname}` }));
    tool.addEventListener('click', () => {
      if (this.currentTool === toolType) {
        this.currentTool = null;
        tools.querySelectorAll('input').forEach(i => (i as HTMLInputElement).checked = false);
      } else {
        this.currentTool = toolType;
      }
      this.world.input.focus();
    });
  }

  initHudNotices(): void {
    if (location.hostname.split('.')[1] === 'github') {
      const notice = document.createElement('div');
      notice.innerHTML = 'This is a work-in-progress; less than alpha quality!<br>To see multiplayer in action, follow instructions on Github.';
      notice.style.cssText = 'position:absolute;top:70px;left:0;width:100%;text-align:center;font-family:monospace;font-size:16px;font-weight:bold;color:white';
      this.hud!.appendChild(notice);
    }
    if (location.hostname.split('.')[1] === 'github' || location.hostname.substr(-6) === '.no.de') {
      const link = document.createElement('a');
      link.href = 'https://github.com/davidangel/bolo';
      link.style.cssText = 'position:absolute;top:0;right:0';
      link.innerHTML = '<img src="https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">';
      this.hud!.appendChild(link);
    }
  }

  updateHud(): void {
    for (const [node, pill] of this.pillIndicators) {
      const statuskey = `${pill.inTank};${pill.carried};${pill.armour};${pill.team}`;
      if (pill.hudStatusKey === statuskey) { continue; }
      pill.hudStatusKey = statuskey;
      if (pill.inTank || pill.carried) {
        node.setAttribute('status', 'carried');
      } else if (pill.armour === 0) {
        node.setAttribute('status', 'dead');
      } else {
        node.setAttribute('status', 'healthy');
      }
      const color = TEAM_COLORS[pill.team] || { r: 112, g: 112, b: 112 };
      node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
    }

    for (const [node, base] of this.baseIndicators) {
      const statuskey = `${base.armour};${base.team}`;
      if (base.hudStatusKey === statuskey) { continue; }
      base.hudStatusKey = statuskey;
      if (base.armour <= 9) {
        node.setAttribute('status', 'vulnerable');
      } else {
        node.setAttribute('status', 'healthy');
      }
      const color = TEAM_COLORS[base.team] || { r: 112, g: 112, b: 112 };
      node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
    }

    const p = this.world.player;
    if (!p) { return; }
    if (!p.hudLastStatus) { p.hudLastStatus = {}; }
    for (const prop in this.tankIndicators) {
      const node = this.tankIndicators[prop];
      const value = p.armour === 255 ? 0 : p[prop];
      if (p.hudLastStatus[prop] === value) { continue; }
      p.hudLastStatus[prop] = value;
      node.style.height = `${round((value / 40) * 100)}%`;
    }
  }
}
