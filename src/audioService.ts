import manifest from './assetManifest.json';
import { discardCachedAsset, loadAssetBlob } from './assetCache';

export type SoundType = 'dice' | 'resource' | 'pirate' | 'click' | 'build' | 'bgm';
type SfxType = Exclude<SoundType, 'bgm'>;
export interface SoundEqualizer {
  dice: number; resource: number; pirate: number; click: number; build: number; bgm: number;
}
export const DEFAULT_EQUALIZER: SoundEqualizer = { dice: 100, resource: 100, pirate: 100, click: 100, build: 100, bgm: 85 };
const names: Record<SoundType, string> = {
  dice: '%E9%9F%B3%E6%95%88-%E6%8E%B7%E9%AA%B0%E5%AD%90.mp3',
  resource: '%E9%9F%B3%E6%95%88-%E8%B5%84%E6%BA%90%E8%8E%B7%E5%8F%96.mp3',
  pirate: '%E9%9F%B3%E6%95%88-%E6%B5%B7%E7%9B%97.mp3',
  click: '%E9%9F%B3%E6%95%88-%E6%8C%89%E9%92%AE%E8%A7%A6%E7%A2%B0.mp3',
  build: '%E9%9F%B3%E6%95%88-%E5%BB%BA%E9%80%A0.mp3',
  bgm: '%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.mp3',
};
const audioUrls = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, manifest.audio[name as keyof typeof manifest.audio]])) as Record<SoundType, string>;
const sfxTypes = ['click', 'dice', 'resource', 'build', 'pirate'] as const;
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} };
const clamp = (value: number, fallback: number, max = 1) => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;

export class AudioService {
  public roomActive = false;
  private context: AudioContext | null = null;
  private buffers = new Map<SfxType, AudioBuffer>();
  private pending = new Map<SfxType, Promise<void>>();
  private active = new Map<SfxType, { source: AudioBufferSourceNode; gain: GainNode }>();
  private fallback = new Map<SfxType, HTMLAudioElement>();
  private tokens = new Map<SfxType, number>();
  private loops = new Map<SfxType, boolean>();
  private bgm: HTMLAudioElement;
  private bgmUnlocked = false;
  private bgmUnlocking = false;
  private bgmWanted = false;
  private bgmPreviewPaused = false;
  private _enabled = read('catan_audio_enabled') !== 'false';
  private _sfxVolume = clamp(Number(read('catan_sfx_volume') ?? 0.5), 0.5);
  private _bgmVolume = clamp(Number(read('catan_bgm_volume') ?? 0.45), 0.45);
  private _sfxEqualizer = { ...DEFAULT_EQUALIZER };
  private _tempMuteSfx = false;

  constructor() {
    try { this.applyEqualizer(JSON.parse(read('catan_sfx_equalizer') || '{}')); } catch {}
    this.bgm = new Audio(audioUrls.bgm);
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = this.volumeFor('bgm');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        for (const type of sfxTypes) this.stopSource(type);
        this.bgm.pause();
      } else {
        void this.unlockAll();
      }
    });
  }

  private getContext(): AudioContext | null {
    if (!this.context) {
      const Context = window.AudioContext || (window as any).webkitAudioContext;
      if (!Context) return null;
      try { this.context = new Context({ latencyHint: 'interactive' }); } catch { return null; }
    }
    return this.context;
  }

  private volumeFor(type: SoundType) {
    return clamp((type === 'bgm' ? this._bgmVolume : this._sfxVolume) * this._sfxEqualizer[type] / 100, 0);
  }

  private refreshVolumes() {
    if (this.bgm) this.bgm.volume = this.volumeFor('bgm');
    this.active.forEach(({ gain }, type) => { gain.gain.value = this.volumeFor(type); });
    this.fallback.forEach((audio, type) => { audio.volume = this.volumeFor(type); });
  }

  private applyEqualizer(eq: Partial<SoundEqualizer>) {
    for (const type of Object.keys(DEFAULT_EQUALIZER) as SoundType[]) {
      if (eq[type] !== undefined) this._sfxEqualizer[type] = clamp(Number(eq[type]), DEFAULT_EQUALIZER[type], 200);
    }
  }

  private prepare(type: SfxType): Promise<void> {
    if (this.buffers.has(type)) return Promise.resolve();
    if (this.pending.has(type)) return this.pending.get(type)!;
    const context = this.getContext();
    if (!context) {
      if (!this.fallback.has(type)) {
        const audio = new Audio(audioUrls[type]);
        audio.preload = 'auto';
        this.fallback.set(type, audio);
      }
      return Promise.resolve();
    }
    const promise = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const blob = await loadAssetBlob(audioUrls[type], 'audio', attempt > 0);
          const buffer = await context.decodeAudioData(await blob.arrayBuffer());
          this.buffers.set(type, buffer);
          return;
        } catch (error) {
          await discardCachedAsset(audioUrls[type]);
          if (attempt === 1) throw error;
        }
      }
    })().finally(() => { this.pending.delete(type); });
    this.pending.set(type, promise);
    return promise;
  }

  async preloadAllAudio(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    let loaded = 0;
    await Promise.allSettled(sfxTypes.map(type => this.prepare(type).finally(() => onProgress?.(++loaded, 6))));
    onProgress?.(6, 6);
  }

  async unlockAll(): Promise<boolean> {
    if (document.hidden) return false;
    const context = this.getContext();
    // Calling resume during the gesture is important; never await a download first.
    const resume = context && context.state !== 'running' ? context.resume() : Promise.resolve();
    if (this._enabled && !this.bgmUnlocked && !this.bgmUnlocking) {
      this.bgmUnlocking = true;
      this.bgm.muted = true;
      void this.bgm.play().then(() => {
        this.bgmUnlocked = true;
        if (!this.bgmWanted || this.bgmPreviewPaused || !this._enabled || document.hidden) this.bgm.pause();
      }).catch(() => {}).finally(() => {
        this.bgm.muted = false;
        this.bgmUnlocking = false;
        if (this.bgmWanted && !this.bgmPreviewPaused && this._enabled && !document.hidden) this.playBgm();
      });
    }
    try {
      await resume;
      for (const [type, forcePlay] of [...this.loops]) {
        if (!this.active.has(type)) this.play(type, true, forcePlay);
      }
      if (this.bgmWanted && !this.bgmPreviewPaused) this.playBgm();
      return !context || context.state === 'running';
    } catch { return false; }
  }

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(value: number) {
    this._sfxVolume = clamp(value, 0.5);
    save('catan_sfx_volume', String(this._sfxVolume));
    this.refreshVolumes();
  }
  get bgmVolume() { return this._bgmVolume; }
  set bgmVolume(value: number) {
    this._bgmVolume = clamp(value, 0.45);
    save('catan_bgm_volume', String(this._bgmVolume));
    this.refreshVolumes();
  }
  get enabled() { return this._enabled; }
  set enabled(value: boolean) {
    this._enabled = value;
    save('catan_audio_enabled', String(value));
    if (!value) this.stopAll();
    else { void this.unlockAll(); if (this.bgmWanted) this.playBgm(); }
  }
  get sfxEqualizer() { return { ...this._sfxEqualizer }; }
  setEqualizer(eq: Partial<SoundEqualizer>) {
    if (!eq || typeof eq !== 'object') return;
    this.applyEqualizer(eq);
    save('catan_sfx_equalizer', JSON.stringify(this._sfxEqualizer));
    this.refreshVolumes();
  }
  get tempMuteSfx() { return this._tempMuteSfx; }
  set tempMuteSfx(value: boolean) {
    this._tempMuteSfx = value;
    if (value) this.stopAllSfx();
  }
  get isBgmPlaying() { return this.bgmWanted && !this.bgm.paused; }

  playBgm() {
    this.bgmWanted = true;
    this.bgmPreviewPaused = false;
    if (!this._enabled || document.hidden || this.bgmUnlocking) return;
    this.bgm.volume = this.volumeFor('bgm');
    if (this.bgm.paused) void this.bgm.play().then(() => {
      if (!this.bgmWanted || this.bgmPreviewPaused || !this._enabled || document.hidden) this.bgm.pause();
    }).catch(() => {});
  }
  stopBgm(permanent = false) {
    if (permanent) this.bgmWanted = false;
    this.bgmPreviewPaused = true;
    this.bgm.pause();
  }

  play(type: SoundType, loop = false, forcePlay = false) {
    if (!this._enabled) return;
    if (type === 'bgm') { this.playBgm(); return; }
    if (this._tempMuteSfx || document.hidden || (type !== 'click' && !this.roomActive && !forcePlay)) return;
    this.stop(type);
    if (loop) this.loops.set(type, forcePlay);
    const token = this.tokens.get(type) || 0;
    const requestedAt = performance.now();
    const start = () => {
      if (this.tokens.get(type) !== token || !this._enabled || this._tempMuteSfx || document.hidden) return;
      if (type !== 'click' && !this.roomActive && !forcePlay) return;
      // Never replay an old click or dice event after a slow download / app resume.
      if (!loop && performance.now() - requestedAt > 200) return;
      const context = this.getContext();
      const buffer = this.buffers.get(type);
      if (context) {
        if (context.state !== 'running' || !buffer) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = loop;
        gain.gain.value = this.volumeFor(type);
        source.connect(gain).connect(context.destination);
        this.active.set(type, { source, gain });
        source.onended = () => {
          if (this.active.get(type)?.source === source) this.active.delete(type);
          source.disconnect();
          gain.disconnect();
        };
        source.start();
      } else {
        const audio = this.fallback.get(type);
        if (!audio || audio.readyState < 2) return;
        audio.loop = loop;
        audio.volume = this.volumeFor(type);
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    };
    if (this.buffers.has(type)) start();
    else void this.prepare(type).then(start).catch(() => {});
  }

  private stopSource(type: SfxType) {
    this.tokens.set(type, (this.tokens.get(type) || 0) + 1);
    const playing = this.active.get(type);
    if (playing) { this.active.delete(type); try { playing.source.stop(); } catch {} }
    this.fallback.get(type)?.pause();
  }
  stop(type: SoundType) {
    if (type === 'bgm') { this.stopBgm(); return; }
    this.loops.delete(type);
    this.stopSource(type);
  }
  stopAllSfx() { sfxTypes.forEach(type => this.stop(type)); }
  stopAll(permanentBgm = false) { this.stopAllSfx(); this.stopBgm(permanentBgm); }
}

export const audioService = new AudioService();
