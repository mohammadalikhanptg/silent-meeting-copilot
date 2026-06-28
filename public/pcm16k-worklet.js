// AudioWorklet: convert mic Float32 samples to 16kHz Int16LE PCM frames for the
// Sarvam streaming engine. The host creates the AudioContext at sampleRate 16000,
// so no resampling is needed here — the input is already 16kHz mono. We quantise
// Float32 [-1,1] to Int16 and batch to ~100ms frames (1600 samples) to keep the
// browser->engine message rate low while staying well inside Sarvam's VAD window.
//
// Only used when the session engine is 'sarvam'. The default nova-3 path uses
// MediaRecorder and never loads this module.

const FRAME_SAMPLES = 1600; // 100ms at 16kHz

class PCM16kProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Int16Array(FRAME_SAMPLES);
    this._n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (ch && ch.length) {
      for (let i = 0; i < ch.length; i++) {
        let s = ch[i];
        if (s > 1) s = 1; else if (s < -1) s = -1;
        this._buf[this._n++] = s < 0 ? (s * 0x8000) : (s * 0x7fff);
        if (this._n === FRAME_SAMPLES) {
          // Transfer the buffer to the main thread (zero-copy) and start fresh.
          const out = new Int16Array(this._buf); // copy current frame
          this.port.postMessage(out.buffer, [out.buffer]);
          this._n = 0;
        }
      }
    }
    // Keep the processor alive for the life of the node.
    return true;
  }
}

registerProcessor('pcm16k', PCM16kProcessor);
