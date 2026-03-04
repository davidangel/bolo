// villain/loop.ts
// Game loop utilities: requestAnimationFrame polyfill and createLoop.

type RAFHandle = number | { active: boolean } | null;

let _raf: (callback: () => void) => RAFHandle;
let _caf: ((handle: RAFHandle) => void) | null;

if (typeof window !== 'undefined' && window !== null) {
  const win = window as unknown as Window & Record<string, unknown>;
  let actualRAF: ((cb: FrameRequestCallback) => number) | undefined =
    window.requestAnimationFrame;
  let actualCAF: ((id: number) => void) | undefined =
    window.cancelAnimationFrame;

  if (!actualRAF) {
    for (const prefix of ['moz', 'webkit', 'ms', 'o']) {
      if ((win[`${prefix}RequestAnimationFrame`] as typeof actualRAF)) {
        actualRAF = win[`${prefix}RequestAnimationFrame`] as typeof actualRAF;
        actualCAF = (win[`${prefix}CancelAnimationFrame`] ||
                     win[`${prefix}CancelRequestAnimationFrame`]) as typeof actualCAF;
        break;
      }
    }
  }

  if (actualRAF) {
    actualRAF = actualRAF.bind(window);
    if (actualCAF) actualCAF = actualCAF.bind(window);
  }

  if (!actualRAF) {
    // Emulate by calling back immediately. No cancellable handle.
    _raf = (callback) => { callback(); return null; };
    _caf = null;
  } else if (!actualCAF) {
    // Wrap to add cancel state.
    const innerRAF = actualRAF;
    _raf = (callback) => {
      const state: { active: boolean } = { active: true };
      innerRAF(() => { if (state.active) callback(); });
      return state;
    };
    _caf = (state) => {
      if (state && typeof state === 'object' && 'active' in state) {
        (state as { active: boolean }).active = false;
      }
    };
  } else {
    _raf = actualRAF as unknown as (cb: () => void) => number;
    _caf = actualCAF as (handle: RAFHandle) => void;
  }
} else {
  // Node.js environment.
  _raf = (callback) => { process.nextTick(callback); return null; };
  _caf = null;
}

// If caf is still null after the above, wrap raf with cancel state.
let requestAnimationFrame: (callback: () => void) => RAFHandle;
let cancelAnimationFrame: (handle: RAFHandle) => void;

if (!_caf) {
  const innerRAF = _raf;
  requestAnimationFrame = (callback: () => void): RAFHandle => {
    const state: { active: boolean } = { active: true };
    innerRAF(() => { if (state.active) callback(); });
    return state;
  };
  cancelAnimationFrame = (state: RAFHandle): void => {
    if (state && typeof state === 'object' && 'active' in state) {
      (state as { active: boolean }).active = false;
    }
  };
} else {
  requestAnimationFrame = _raf;
  cancelAnimationFrame = _caf;
}

export { requestAnimationFrame, cancelAnimationFrame };

export interface LoopOptions {
  rate: number;
  tick: () => void;
  idle?: () => void;
  frame?: () => void;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
}

export function createLoop(options: LoopOptions): LoopHandle {
  if (!options) options = { rate: 20, tick: () => {} };

  let lastTick: number = 0;
  let timerReq: ReturnType<typeof setTimeout> | null = null;
  let frameReq: RAFHandle = null;

  const timerCallback = () => {
    timerReq = null;

    const now = Date.now();
    while ((now - lastTick) >= options.rate) {
      options.tick();
      lastTick += options.rate;
    }
    if (typeof options.idle === 'function') {
      options.idle();
    }

    if (options.frame && !frameReq) {
      frameReq = requestAnimationFrame(frameCallback);
    }

    timerReq = setTimeout(timerCallback, options.rate);
  };

  const frameCallback = () => {
    frameReq = null;
    options.frame!();
  };

  return {
    start() {
      if (!timerReq) {
        lastTick = Date.now();
        timerReq = setTimeout(timerCallback, options.rate);
      }
    },
    stop() {
      if (timerReq) {
        clearTimeout(timerReq);
        timerReq = null;
      }
      if (frameReq) {
        cancelAnimationFrame(frameReq);
        frameReq = null;
      }
    },
  };
}
