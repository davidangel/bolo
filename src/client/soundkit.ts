/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

//# Soundkit

// A thin audio layer.

class SoundKit {
  sounds: Record<string, string> = {};
  volume: number = 0.5;
  isSupported: boolean = false;
  private _audioCache?: Record<string, HTMLAudioElement>;

  constructor() {
    // FIXME: Probably want to switch to has.js at some point.
    if (typeof Audio !== 'undefined' && Audio !== null) {
      const dummy = new Audio();
      this.isSupported = (dummy.canPlayType != null);
    }
  }

  setVolume(value: number): void {
    this.volume = value;
  }

  getVolume(): number {
    return this.volume;
  }

  // Register the effect at the given url with the given name, and build a helper method
  // on this instance to play the sound effect.
  register(name: string, url: string): () => HTMLAudioElement | undefined {
    this.sounds[name] = url;
    return (this as any)[name] = () => this.play(name);
  }

  // Wait for the given effect to be loaded, then register it.
  load(name: string, url: string, cb?: () => void): void {
    this.register(name, url);
    if (!this.isSupported) { return (typeof cb === 'function' ? cb() : undefined); }
    const loader = new Audio();
    if (cb) { loader.addEventListener('canplaythrough', cb); }
    loader.addEventListener('error', (e: any) => {
      // FIXME: support more error codes.
      switch (e.code) {
        case e.MEDIA_ERR_SRC_NOT_SUPPORTED:
          this.isSupported = false; return (typeof cb === 'function' ? cb() : undefined);
      }
    });
    loader.src = url;
    loader.load();
  }

  // Play the effect called `name`.
  play(name: string): HTMLAudioElement | undefined {
    if (!this.isSupported) { return; }
    if (!this._audioCache) { this._audioCache = {}; }
    if (!this._audioCache[name]) {
      this._audioCache[name] = new Audio();
      this._audioCache[name].src = this.sounds[name];
      this._audioCache[name].preload = 'auto';
      this._audioCache[name].load();
    }
    // Clone the audio to allow overlapping sounds
    const sound = this._audioCache[name].cloneNode() as HTMLAudioElement;
    sound.volume = this.volume;
    sound.play();
    return sound;
  }
}

//# Exports
export default SoundKit;
