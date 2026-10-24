export class SoundManager {
  private ctx: AudioContext | null = null;
  private sfxEnabled = true;
  private musicEnabled = true;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private vtolSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private vtolGain: GainNode | null = null;
  private musicInterval: number | null = null;
  private musicStep = 0;
  private isPlayingRun = false;

  constructor(sfxEnabled = true, musicEnabled = true) {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;
  }

  public initOnInteraction(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch {
      // Graceful fallback
    }
  }

  public vibrate(pattern: number | number[]): void {
    if (!this.sfxEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore if vibration is blocked or unsupported
    }
  }

  public setSettings(sfxEnabled: boolean, musicEnabled: boolean): void {
    this.sfxEnabled = sfxEnabled;
    this.musicEnabled = musicEnabled;

    if (!this.sfxEnabled) {
      this.stopEngineHum();
    } else if (this.isPlayingRun) {
      this.startEngineHum();
    }

    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (this.isPlayingRun) {
      this.startMusic();
    }
  }

  public startRunAudio(): void {
    this.initOnInteraction();
    this.isPlayingRun = true;
    if (this.sfxEnabled) this.startEngineHum();
    if (this.musicEnabled) this.startMusic();
  }

  public pauseRunAudio(): void {
    this.isPlayingRun = false;
    this.stopEngineHum();
    this.stopMusic();
  }

  private startEngineHum(): void {
    if (!this.ctx || !this.sfxEnabled || this.engineOsc1) return;
    try {
      const now = this.ctx.currentTime;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.032, now);
      this.engineGain.connect(this.ctx.destination);

      this.vtolGain = this.ctx.createGain();
      this.vtolGain.gain.setValueAtTime(0.001, now);
      this.vtolGain.connect(this.ctx.destination);

      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.setValueAtTime(78, now);

      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sine';
      this.engineOsc2.frequency.setValueAtTime(156, now);

      this.vtolSubOsc = this.ctx.createOscillator();
      this.vtolSubOsc.type = 'triangle';
      this.vtolSubOsc.frequency.setValueAtTime(220, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);

      this.engineOsc1.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain);

      this.vtolSubOsc.connect(this.vtolGain);

      this.engineOsc1.start(now);
      this.engineOsc2.start(now);
      this.vtolSubOsc.start(now);
    } catch {
      // Ignore
    }
  }

  public updateEngineSound(speedKmh: number, isFlying: boolean, isTurbo: boolean): void {
    if (!this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain || !this.sfxEnabled) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      const ratio = Math.min(Math.max((speedKmh - 100) / 220, 0), 1.5);
      const baseFreq = 72 + ratio * 75 + (isFlying ? 38 : 0) + (isTurbo ? 45 : 0);
      const harmonicFreq = baseFreq * (isFlying ? 2.4 : 2.0);
      const targetGain = isTurbo ? 0.052 : isFlying ? 0.045 : 0.032;

      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.08);
      this.engineOsc2.frequency.setTargetAtTime(harmonicFreq, now, 0.08);
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);

      if (this.vtolSubOsc && this.vtolGain) {
        this.vtolSubOsc.frequency.setTargetAtTime(isTurbo ? 340 : 250 + ratio * 60, now, 0.08);
        this.vtolGain.gain.setTargetAtTime(isFlying ? 0.035 : 0.001, now, 0.1);
      }
    } catch {
      // Ignore
    }
  }

  private stopEngineHum(): void {
    try {
      if (this.engineOsc1) {
        this.engineOsc1.stop();
        this.engineOsc1.disconnect();
        this.engineOsc1 = null;
      }
      if (this.engineOsc2) {
        this.engineOsc2.stop();
        this.engineOsc2.disconnect();
        this.engineOsc2 = null;
      }
      if (this.vtolSubOsc) {
        this.vtolSubOsc.stop();
        this.vtolSubOsc.disconnect();
        this.vtolSubOsc = null;
      }
      if (this.engineGain) {
        this.engineGain.disconnect();
        this.engineGain = null;
      }
      if (this.vtolGain) {
        this.vtolGain.disconnect();
        this.vtolGain = null;
      }
    } catch {
      this.engineOsc1 = null;
      this.engineOsc2 = null;
      this.vtolSubOsc = null;
      this.engineGain = null;
      this.vtolGain = null;
    }
  }

  private startMusic(): void {
    if (!this.ctx || !this.musicEnabled || this.musicInterval !== null) return;
    const bassNotes = [110, 110, 130.81, 130.81, 98, 98, 146.83, 130.81];
    const arpNotes = [440, 523.25, 659.25, 523.25, 392, 493.88, 587.33, 659.25];

    this.musicInterval = window.setInterval(() => {
      if (!this.ctx || !this.musicEnabled || !this.isPlayingRun || document.hidden) return;
      try {
        const now = this.ctx.currentTime;
        const bassFreq = bassNotes[this.musicStep % bassNotes.length];
        const arpFreq = arpNotes[this.musicStep % arpNotes.length];
        this.musicStep++;

        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, now);
        bassGain.gain.setValueAtTime(0.036, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
        bassOsc.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bassOsc.start(now);
        bassOsc.stop(now + 0.22);

        if (this.musicStep % 2 === 0) {
          const arpOsc = this.ctx.createOscillator();
          const arpGain = this.ctx.createGain();
          arpOsc.type = 'sine';
          arpOsc.frequency.setValueAtTime(arpFreq, now);
          arpGain.gain.setValueAtTime(0.018, now);
          arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          arpOsc.connect(arpGain);
          arpGain.connect(this.ctx.destination);
          arpOsc.start(now);
          arpOsc.stop(now + 0.17);
        }
      } catch {
        // Ignore
      }
    }, 210);
  }

  private stopMusic(): void {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  public playCoin(comboMultiplier = 1): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      // Pitch rises with combo multiplier for addictive arcade feedback
      const pitchShift = 1 + (Math.min(comboMultiplier, 5) - 1) * 0.085;
      osc.frequency.setValueAtTime(987.77 * pitchShift, now);
      osc.frequency.setValueAtTime(1318.51 * pitchShift, now + 0.055);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    } catch {}
  }

  public playNearMiss(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate(16);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.18);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  public playLaneSwitch(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(145, now + 0.085);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch {}
  }

  public playTakeoff(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate(25);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.36);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.36);

      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.39);
    } catch {}
  }

  public playLanding(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate(20);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.21);
    } catch {}
  }

  public playBoost(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate([25, 30, 40]);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(180, now);
      osc1.frequency.exponentialRampToValueAtTime(840, now + 0.45);
      osc2.frequency.setValueAtTime(360, now);
      osc2.frequency.exponentialRampToValueAtTime(1280, now + 0.45);

      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.49);
      osc2.stop(now + 0.49);
    } catch {}
  }

  public playEnergyOrb(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate(15);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.045);
        gain.gain.setValueAtTime(0.08, now + idx * 0.045);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.16);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.045);
        osc.stop(now + idx * 0.045 + 0.17);
      });
    } catch {}
  }

  public playShieldBreak(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate([35, 25, 35]);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.33);
    } catch {}
  }

  public playCollision(): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    this.vibrate([60, 40, 90]);
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.46);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch {}
  }

  public playCountdownBeep(finalGo = false): void {
    if (!this.sfxEnabled) return;
    this.initOnInteraction();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(finalGo ? 880 : 440, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (finalGo ? 0.28 : 0.14));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + (finalGo ? 0.3 : 0.15));
    } catch {}
  }

  public dispose(): void {
    this.stopEngineHum();
    this.stopMusic();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
