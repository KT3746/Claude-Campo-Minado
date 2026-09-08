/**
 * Efeitos sonoros sintetizados na hora com a Web Audio API.
 *
 * Nada de arquivos de áudio: os sons são gerados por osciladores e ruído, o que
 * mantém o jogo em zero dependências e sem nenhum download. O contexto de áudio
 * só é criado no primeiro gesto do usuário, como exigem os navegadores.
 */

export function createAudio({ enabled = true } = {}) {
  /** @type {AudioContext|null} */
  let ctx = null;
  let master = null;
  let on = enabled;

  function ensure() {
    if (!on) return null;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function tone({ freq = 440, type = 'sine', duration = 0.08, gain = 0.5, sweepTo = null, delay = 0 }) {
    const audio = ensure();
    if (!audio) return;
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + duration);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise({ duration = 0.3, gain = 0.6, cutoffFrom = 1800, cutoffTo = 120 }) {
    const audio = ensure();
    if (!audio) return;
    const t0 = audio.currentTime;
    const frames = Math.floor(audio.sampleRate * duration);
    const buffer = audio.createBuffer(1, frames, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // ruído branco com decaimento exponencial
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrom, t0);
    filter.frequency.exponentialRampToValueAtTime(cutoffTo, t0 + duration);
    const env = audio.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(env).connect(master);
    src.start(t0);
  }

  return {
    get enabled() {
      return on;
    },
    setEnabled(value) {
      on = Boolean(value);
      if (!on && ctx) ctx.suspend().catch(() => {});
    },
    /** Primeiro gesto do usuário: destrava o áudio do navegador. */
    unlock() {
      ensure();
    },
    reveal() {
      tone({ freq: 620, type: 'triangle', duration: 0.05, gain: 0.22 });
    },
    cascade(count) {
      // Uma escadinha curta dá a sensação de "abriu bastante" sem virar barulho.
      const steps = Math.min(5, Math.max(2, Math.round(Math.log2(count + 1))));
      for (let i = 0; i < steps; i++) {
        tone({ freq: 480 + i * 90, type: 'triangle', duration: 0.05, gain: 0.16, delay: i * 0.035 });
      }
    },
    flag() {
      tone({ freq: 880, type: 'square', duration: 0.045, gain: 0.14 });
      tone({ freq: 1180, type: 'square', duration: 0.04, gain: 0.1, delay: 0.04 });
    },
    unflag() {
      tone({ freq: 520, type: 'square', duration: 0.04, gain: 0.1 });
    },
    invalid() {
      tone({ freq: 180, type: 'sawtooth', duration: 0.09, gain: 0.12 });
    },
    explode() {
      noise({ duration: 0.7, gain: 0.75, cutoffFrom: 2600, cutoffTo: 90 });
      tone({ freq: 160, type: 'sawtooth', duration: 0.5, gain: 0.35, sweepTo: 40 });
    },
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        tone({ freq, type: 'triangle', duration: 0.28, gain: 0.28, delay: i * 0.09 });
      });
    },
    record() {
      const notes = [783.99, 1046.5, 1318.51];
      notes.forEach((freq, i) => {
        tone({ freq, type: 'sine', duration: 0.35, gain: 0.24, delay: 0.42 + i * 0.11 });
      });
    },
  };
}
