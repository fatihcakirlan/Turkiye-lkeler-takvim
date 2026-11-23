// Procedural Cool & Calm ("Soğuk ve Sakin") Ambient Music Engine via Web Audio API

interface AmbientController {
  start: () => Promise<boolean>;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  isRunning: () => boolean;
}

// D minor / Dorian icy chord voicings (Hz)
const CHORD_PROGRESSIONS: number[][] = [
  [146.83, 220.0, 261.63, 329.63], // Dm9 (D3, A3, C4, E4)
  [116.54, 174.61, 220.0, 329.63], // Bbmaj7#11 (Bb2, F3, A3, E4)
  [130.81, 196.0, 293.66, 349.23], // Csus2/4 (C3, G3, D4, F4)
  [110.0, 164.81, 246.94, 293.66], // Am11 (A2, E3, B3, D4)
];

// High crystalline bell / winter felt notes (D minor pentatonic + 9th)
const CRYSTAL_NOTES: number[] = [
  523.25, // C5
  587.33, // D5
  659.25, // E5
  698.46, // F5
  880.0,  // A5
  1046.5, // C6
  1174.66, // D6
  1318.51, // E6
];

function createIcyReverbImpulse(ctx: AudioContext, durationSec = 4.2, decay = 2.6): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay) * Math.min(1, i / (sampleRate * 0.04));
      const white = Math.random() * 2 - 1;
      // Gentle low-pass damping for smooth cold air tail
      lp = lp * 0.72 + white * 0.28;
      data[i] = lp * env;
    }
  }
  return impulse;
}

function createSoftNoiseBuffer(ctx: AudioContext, durationSec = 6): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + white * 0.029;
    b1 = 0.985 * b1 + white * 0.032;
    b2 = 0.95 * b2 + white * 0.048;
    data[i] = (b0 + b1 + b2) * 0.16;
  }
  return buf;
}

export function createCoolCalmMusicEngine(): AmbientController {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let padBus: GainNode | null = null;
  let dryBus: GainNode | null = null;
  let reverbNode: ConvolverNode | null = null;
  let padTimer: number | null = null;
  let crystalTimer: number | null = null;
  let windSource: AudioBufferSourceNode | null = null;
  let lfoOsc: OscillatorNode | null = null;

  let chordIdx = 0;
  let noteStep = 0;
  let muted = false;
  let started = false;
  let activePadNodes: { oscs: OscillatorNode[]; gain: GainNode }[] = [];

  const MASTER_LEVEL = 0.26;

  const spawnPadChord = () => {
    if (!ctx || !padBus || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const chord = CHORD_PROGRESSIONS[chordIdx % CHORD_PROGRESSIONS.length];
    chordIdx += 1;

    const chordGain = ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, now);
    chordGain.gain.linearRampToValueAtTime(0.2, now + 3.8);
    chordGain.gain.setValueAtTime(0.2, now + 8.5);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, now + 14.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.Q.setValueAtTime(0.7, now);

    chordGain.connect(filter);
    filter.connect(padBus);

    const oscs: OscillatorNode[] = [];
    chord.forEach((freq, idx) => {
      if (!ctx) return;
      const oscA = ctx.createOscillator();
      oscA.type = idx === 0 ? 'sine' : 'triangle';
      oscA.frequency.setValueAtTime(freq, now);
      oscA.detune.setValueAtTime((idx % 2 === 0 ? -1 : 1) * 4.5, now);

      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(idx === 0 ? 0.34 : 0.16, now);

      oscA.connect(voiceGain);
      voiceGain.connect(chordGain);
      oscA.start(now);
      oscA.stop(now + 14.8);
      oscs.push(oscA);
    });

    const entry = { oscs, gain: chordGain };
    activePadNodes.push(entry);
    window.setTimeout(() => {
      activePadNodes = activePadNodes.filter((n) => n !== entry);
    }, 15000);
  };

  const spawnCrystalNote = () => {
    if (!ctx || !dryBus || !reverbNode || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    // Calm sparse melodic contour
    const pattern = [0, 2, 4, 3, 5, 1, 6, 4];
    const baseIndex = pattern[noteStep % pattern.length];
    noteStep += 1;
    const freq = CRYSTAL_NOTES[(baseIndex + (chordIdx % 2)) % CRYSTAL_NOTES.length];

    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    osc.type = 'sine';
    harmonic.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    harmonic.frequency.setValueAtTime(freq * 2, now); // Shimmering upper octave

    const mainEnv = ctx.createGain();
    mainEnv.gain.setValueAtTime(0.0001, now);
    mainEnv.gain.linearRampToValueAtTime(0.075, now + 0.045);
    mainEnv.gain.exponentialRampToValueAtTime(0.0001, now + 4.4);

    const harmEnv = ctx.createGain();
    harmEnv.gain.setValueAtTime(0.0001, now);
    harmEnv.gain.linearRampToValueAtTime(0.015, now + 0.03);
    harmEnv.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(Math.sin(noteStep * 1.1) * 0.45, now);
    }

    osc.connect(mainEnv);
    harmonic.connect(harmEnv);
    harmEnv.connect(mainEnv);

    if (panner) {
      mainEnv.connect(panner);
      panner.connect(dryBus);
      panner.connect(reverbNode);
    } else {
      mainEnv.connect(dryBus);
      mainEnv.connect(reverbNode);
    }

    osc.start(now);
    harmonic.start(now);
    osc.stop(now + 4.6);
    harmonic.stop(now + 2.3);
  };

  const scheduleNextCrystal = () => {
    if (!started) return;
    const delayMs = 2400 + Math.round(Math.random() * 1900);
    crystalTimer = window.setTimeout(() => {
      spawnCrystalNote();
      scheduleNextCrystal();
    }, delayMs);
  };

  const start = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    if (!ctx) {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.connect(ctx.destination);

      reverbNode = ctx.createConvolver();
      reverbNode.buffer = createIcyReverbImpulse(ctx);

      const reverbGain = ctx.createGain();
      reverbGain.gain.setValueAtTime(0.72, ctx.currentTime);
      reverbNode.connect(reverbGain);
      reverbGain.connect(masterGain);

      dryBus = ctx.createGain();
      dryBus.gain.setValueAtTime(0.32, ctx.currentTime);
      dryBus.connect(masterGain);

      padBus = ctx.createGain();
      padBus.gain.setValueAtTime(0.7, ctx.currentTime);
      padBus.connect(dryBus);
      padBus.connect(reverbNode);

      // Subtle cold arctic air floor
      const noiseBuf = createSoftNoiseBuffer(ctx);
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuf;
      windSource.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(380, ctx.currentTime);
      windFilter.Q.setValueAtTime(0.9, ctx.currentTime);

      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.045, ctx.currentTime);

      lfoOsc = ctx.createOscillator();
      lfoOsc.frequency.setValueAtTime(0.07, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(140, ctx.currentTime);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(windFilter.frequency);
      lfoOsc.start();

      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(reverbNode);
      windSource.start();
    }

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }

    if (ctx.state !== 'running') {
      return false;
    }

    if (!started) {
      started = true;
      spawnPadChord();
      padTimer = window.setInterval(spawnPadChord, 10200);
      window.setTimeout(() => {
        if (started) {
          spawnCrystalNote();
          scheduleNextCrystal();
        }
      }, 900);
    }

    if (masterGain && ctx) {
      const target = muted ? 0.0001 : MASTER_LEVEL;
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 1.8);
    }

    return true;
  };

  const setMuted = (nextMuted: boolean) => {
    muted = nextMuted;
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    const target = nextMuted ? 0.0001 : MASTER_LEVEL;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(0.0001, masterGain.gain.value), now);
    masterGain.gain.linearRampToValueAtTime(target, now + 0.6);
  };

  const stop = () => {
    started = false;
    if (padTimer !== null) {
      window.clearInterval(padTimer);
      padTimer = null;
    }
    if (crystalTimer !== null) {
      window.clearTimeout(crystalTimer);
      crystalTimer = null;
    }
    activePadNodes.forEach((n) => {
      n.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          // ignore
        }
      });
    });
    activePadNodes = [];
    try {
      windSource?.stop();
    } catch {
      // ignore
    }
    try {
      lfoOsc?.stop();
    } catch {
      // ignore
    }
    windSource = null;
    lfoOsc = null;
    if (ctx) {
      void ctx.close().catch(() => {});
      ctx = null;
    }
    masterGain = null;
    padBus = null;
    dryBus = null;
    reverbNode = null;
  };

  return {
    start,
    stop,
    setMuted,
    isRunning: () => started && ctx?.state === 'running',
  };
}
