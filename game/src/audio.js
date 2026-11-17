// All sound, synthesized with WebAudio: no audio files, nothing fetched. Every call
// is a no-op until the first user gesture creates the audio context (browsers block
// sound before that), and M toggles mute. A soft generative pad plays under the game.
import { createRandom } from './random.js';

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let padTimer = null;
  let padStep = 0;
  const padNotes = [220.0, 261.63, 329.63, 392.0, 329.63, 261.63];

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (start, click, keypress). */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
    startPad();
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!context || muted || context.state !== 'running') return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, context.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), context.currentTime + dur);
      gain.gain.setValueAtTime(vol, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + dur + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(dur, vol, low) {
    if (!context || muted || context.state !== 'running') return;
    try {
      const len = Math.floor(context.sampleRate * dur);
      const buffer = context.createBuffer(1, len, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = context.createBufferSource();
      src.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = low || 1200;
      const gain = context.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // Sound is garnish.
    }
  }

  function startPad() {
    if (padTimer !== null || !context) return;
    padTimer = window.setInterval(() => {
      if (muted || context.state !== 'running') return;
      tone(padNotes[padStep % padNotes.length], 1.6, 'sine', 0.045);
      tone(padNotes[padStep % padNotes.length] * 1.5, 1.6, 'sine', 0.02);
      padStep += 1;
    }, 900);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot() {
      tone(720 + Math.random() * 80, 0.07, 'square', 0.05, 340);
    },
    enemyHit() {
      noise(0.08, 0.1, 2400);
    },
    enemyDie() {
      tone(320, 0.16, 'triangle', 0.1, 90);
      noise(0.12, 0.08, 900);
    },
    playerHurt() {
      tone(160, 0.3, 'sawtooth', 0.16, 60);
      noise(0.2, 0.14, 500);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.09, 1320);
    },
    heal() {
      tone(523, 0.12, 'sine', 0.1);
      window.setTimeout(() => tone(784, 0.16, 'sine', 0.1), 90);
    },
    levelup() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => tone(f, 0.18, 'triangle', 0.11), i * 85));
    },
    waveClear() {
      [392, 523, 659].forEach((f, i) => window.setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 90));
    },
    bossRoar() {
      tone(98, 0.7, 'sawtooth', 0.16, 55);
      noise(0.5, 0.1, 300);
    },
    win() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => window.setTimeout(() => tone(f, 0.25, 'triangle', 0.12), i * 110));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'triangle', 0.11), i * 140));
    },
    click() {
      tone(600, 0.05, 'sine', 0.07);
    },
    // Exposed for the seeded ambience test hook (unused in normal play).
    _random: createRandom(7),
  };
}
