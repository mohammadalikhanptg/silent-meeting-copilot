// AudioWorklet: convert mic/loopback Float32 samples to 16kHz Int16LE PCM frames
// for the Sarvam streaming engine. The host creates the AudioContext at
// sampleRate 16000, so the source is resampled to 16kHz before it reaches this
// processor; we only quantise Float32 [-1,1] to Int16 and batch to ~100ms frames
// (1600 samples) to keep the helper->engine message rate low while staying well
// inside Sarvam's VAD window.
//
// This is the desktop helper's own copy of public/pcm16k-worklet.js (the helper
// is an Electron app and loads its assets locally, not from the web app). Keep
// the two in sync. Only used when the session engine is 'sarvam'.

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
          const out = new Int16Array(this._buf); // copy current frame
          this.port.postMessage(out.buffer, [out.buffer]);
          this._n = 0;
        }
      }
    }
    return true; // keep the processor alive for the life of the node
  }
}

registerProcessor('pcm16k', PCM16kProcessor);
