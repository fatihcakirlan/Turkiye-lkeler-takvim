class BattleAudioEngine {
  private ctx: AudioContext | null = null;
  private enabled = false;

  setEnabled(value: boolean) {
    this.enabled = value;
    if (value && !this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && value) {
      void this.ctx.resume();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  playWallRumble() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(68, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 1.8);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 2.05);
  }

  playShot(pitchOffset = 0) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 + pitchOffset * 80, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playVictoryFanfare() {
    if (!this.enabled || !this.ctx) return;
    const notes = [392, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime + idx * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    });
  }
}

export const battleAudio = new BattleAudioEngine();
