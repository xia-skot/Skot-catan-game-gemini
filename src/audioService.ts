export type SoundType = 'dice' | 'resource' | 'pirate' | 'click' | 'build' | 'bgm';

export interface SoundEqualizer {
  dice: number;
  resource: number;
  pirate: number;
  click: number;
  build: number;
  bgm: number;
}

export const DEFAULT_EQUALIZER: SoundEqualizer = {
  dice: 100,
  resource: 100,
  pirate: 100,
  click: 100,
  build: 100,
  bgm: 85,
};

const AUDIO_URLS: Record<SoundType, string> = {
  dice: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E9%9F%B3%E6%95%88-%E6%8E%B7%E9%AA%B0%E5%AD%90.mp3',
  resource: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E9%9F%B3%E6%95%88-%E8%B5%84%E6%BA%90%E8%8E%B7%E5%8F%96.mp3',
  pirate: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E9%9F%B3%E6%95%88-%E6%B5%B7%E7%9B%97.mp3',
  click: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E9%9F%B3%E6%95%88-%E6%8C%89%E9%92%AE%E8%A7%A6%E7%A2%B0.mp3',
  build: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E9%9F%B3%E6%95%88-%E5%BB%BA%E9%80%A0.mp3',
  bgm: 'https://fastly.jsdelivr.net/gh/xia-skot/Catan_Pics/audio/%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.mp3'
};

class AudioService {
  private audios: Record<string, HTMLAudioElement> = {};
  private activeLoops: Partial<Record<SoundType, HTMLAudioElement>> = {};
  
  public roomActive: boolean = false;
  
  private _sfxVolume: number = 0.5;
  private _bgmVolume: number = 0.45;
  private _enabled: boolean = true;
  private _bgmPlaying: boolean = false;
  private _sfxEqualizer: SoundEqualizer = { ...DEFAULT_EQUALIZER };
  private _tempMuteSfx: boolean = false;
  private activeSfxClones: Set<HTMLAudioElement> = new Set();

  constructor() {
    const savedSfx = localStorage.getItem('catan_sfx_volume');
    const savedBgm = localStorage.getItem('catan_bgm_volume');
    
    this._sfxVolume = savedSfx ? Number(savedSfx) : 0.5;
    this._bgmVolume = savedBgm ? Number(savedBgm) : 0.45;
    
    if (isNaN(this._sfxVolume)) this._sfxVolume = 0.5;
    if (isNaN(this._bgmVolume)) this._bgmVolume = 0.45;

    this._enabled = localStorage.getItem('catan_audio_enabled') !== 'false';

    try {
      const savedEq = localStorage.getItem('catan_sfx_equalizer');
      if (savedEq) {
        this._sfxEqualizer = { ...DEFAULT_EQUALIZER, ...JSON.parse(savedEq) };
      }
    } catch (e) {
      this._sfxEqualizer = { ...DEFAULT_EQUALIZER };
    }

    // Initial Audio fallback elements
    Object.entries(AUDIO_URLS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.audios[key] = audio;
    });
  }

  // Preload audios into blobs for instant low-latency playback
  public async preloadAllAudio(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const entries = Object.entries(AUDIO_URLS);
    let loaded = 0;
    
    const promises = entries.map(async ([key, url]) => {
      try {
        if (key === 'bgm') {
          // Do not blob large BGM files to avoid memory/playback issues on mobile iOS
          if (!this.audios[key]) {
            const audio = new Audio(url);
            audio.preload = 'auto';
            this.audios[key] = audio;
          }
        } else {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          const audio = new Audio(blobUrl);
          audio.preload = 'auto';
          this.audios[key] = audio;
        }
      } catch (err) {
        console.warn(`[AudioService] Blob preload failed for ${key}, using fallback:`, err);
        if (!this.audios[key]) {
          const audio = new Audio(url);
          audio.preload = 'auto';
          this.audios[key] = audio;
        }
      } finally {
        loaded++;
        if (onProgress) onProgress(loaded, entries.length);
      }
    });

    await Promise.allSettled(promises);
  }

  get sfxVolume() { return this._sfxVolume; }
  set sfxVolume(val: number) {
    this._sfxVolume = val;
    localStorage.setItem('catan_sfx_volume', val.toString());
    // Update currently playing loops (except bgm)
    Object.entries(this.activeLoops).forEach(([type, audio]) => {
      if (type !== 'bgm' && audio) {
        const eqValue = Number(this._sfxEqualizer[type as keyof SoundEqualizer]);
        const eqRatio = (isNaN(eqValue) ? 100 : eqValue) / 100;
        audio.volume = Math.min(1, Math.max(0, val * eqRatio));
      }
    });
  }

  get isBgmPlaying(): boolean {
    const active = this.activeLoops['bgm'];
    return !!active && !active.paused && this._bgmPlaying;
  }

  get sfxEqualizer() {
    return { ...this._sfxEqualizer };
  }

  setEqualizer(eq: Partial<SoundEqualizer>) {
    if (!eq || typeof eq !== 'object') return;
    this._sfxEqualizer = { ...this._sfxEqualizer, ...eq };
    localStorage.setItem('catan_sfx_equalizer', JSON.stringify(this._sfxEqualizer));
    
    // Update active loop volumes
    Object.entries(this.activeLoops).forEach(([type, audio]) => {
      if (audio) {
        const baseVol = type === 'bgm' ? this._bgmVolume : this._sfxVolume;
        const eqVal = this._sfxEqualizer[type as keyof SoundEqualizer];
        const eqRatio = (typeof eqVal === 'number' && !isNaN(eqVal) ? eqVal : 100) / 100;
        audio.volume = Math.min(1, Math.max(0, baseVol * eqRatio));
      }
    });
  }

  get bgmVolume() { return this._bgmVolume; }
  set bgmVolume(val: number) {
    this._bgmVolume = val;
    localStorage.setItem('catan_bgm_volume', val.toString());
    const audio = this.audios['bgm'];
    if (audio) {
      const eqValue = Number(this._sfxEqualizer.bgm ?? 85);
      const eqRatio = (isNaN(eqValue) ? 85 : eqValue) / 100;
      audio.volume = Math.min(1, Math.max(0, val * eqRatio));
    }
    if (this.activeLoops['bgm']) {
      const eqValue = Number(this._sfxEqualizer.bgm ?? 85);
      const eqRatio = (isNaN(eqValue) ? 85 : eqValue) / 100;
      this.activeLoops['bgm'].volume = Math.min(1, Math.max(0, val * eqRatio));
    }
  }

  get tempMuteSfx() { return this._tempMuteSfx; }
  set tempMuteSfx(val: boolean) {
    this._tempMuteSfx = val;
    if (val) {
      this.stopAllSfx();
    } else {
      if (this._bgmPlaying && this._enabled) {
        this.playBgm();
      }
    }
  }

  get enabled() { return this._enabled; }
  set enabled(val: boolean) {
    this._enabled = val;
    localStorage.setItem('catan_audio_enabled', val.toString());
    if (!val) {
      this.stopAll();
    } else {
      if (this._bgmPlaying) {
        this.playBgm();
      }
    }
  }

  playBgm() {
    this._bgmPlaying = true;
    if (!this._enabled) return;

    const audio = this.audios['bgm'];
    if (audio) {
      const eqValue = Number(this._sfxEqualizer.bgm ?? 85);
      const eqRatio = (isNaN(eqValue) ? 85 : eqValue) / 100;
      audio.volume = Math.min(1, Math.max(0, this._bgmVolume * eqRatio));
      audio.loop = true;

      this.activeLoops['bgm'] = audio;
      if (audio.paused) {
        audio.play().catch(e => {
          console.warn('BGM play prevented:', e);
          if (this.activeLoops['bgm'] === audio) {
            delete this.activeLoops['bgm'];
          }
        });
      }
    }
  }

  stopBgm(permanent: boolean = false) {
    if (permanent) {
      this._bgmPlaying = false;
    }
    this.stop('bgm');
  }

  play(type: SoundType, loop: boolean = false, forcePlay: boolean = false) {
    if (!this._enabled) return;

    if (type === 'bgm') {
      this.playBgm();
      return;
    }

    if (this._tempMuteSfx) return;
    
    // Game-specific sound effects cannot play when we are not in an active room, unless forcePlay (preview) is true
    if (type !== 'click' && !this.roomActive && !forcePlay) {
      return;
    }

    const primary = this.audios[type];
    const url = AUDIO_URLS[type];
    const eqValue = Number(this._sfxEqualizer[type as keyof SoundEqualizer] ?? 100);
    const eqRatio = (isNaN(eqValue) ? 100 : eqValue) / 100;
    const targetVolume = Math.min(1, Math.max(0, this._sfxVolume * eqRatio));

    // Stop active instance of this sound type if any
    this.stop(type);

    if (primary) {
      try {
        const src = primary.src || url;
        const clone = new Audio(src);
        clone.volume = targetVolume;
        clone.loop = loop;
        this.activeSfxClones.add(clone);

        const removeClone = () => {
          this.activeSfxClones.delete(clone);
          if (this.activeLoops[type] === clone) {
            delete this.activeLoops[type];
          }
        };

        clone.addEventListener('ended', removeClone);
        clone.addEventListener('pause', removeClone);
        clone.addEventListener('error', removeClone);

        this.activeLoops[type] = clone;
        clone.play().catch(e => {
          console.warn('Audio play prevented:', e);
          removeClone();
        });
      } catch (err) {
        console.warn('Play audio exception:', err);
      }
    }
  }
  
  stop(type: SoundType) {
    if (this.activeLoops[type]) {
      try {
        this.activeLoops[type]!.pause();
        this.activeLoops[type]!.currentTime = 0;
      } catch(e) {}
      delete this.activeLoops[type];
    }
    const primary = this.audios[type];
    if (primary) {
      try {
        primary.pause();
        primary.currentTime = 0;
      } catch(e) {}
    }
  }

  stopAllSfx() {
    this.activeSfxClones.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {}
    });
    this.activeSfxClones.clear();

    (Object.keys(AUDIO_URLS) as SoundType[]).forEach(type => {
      if (type !== 'bgm') {
        this.stop(type);
      }
    });
  }

  unlockAll() {
    Object.values(this.audios).forEach(audio => {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    });
  }

  stopAll(permanentBgm: boolean = false) {
    this.stopAllSfx();
    this.stopBgm(permanentBgm);
    this.activeLoops = {};
  }
}

export const audioService = new AudioService();
