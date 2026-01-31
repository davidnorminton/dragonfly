/**
 * AudioWorklet processor for Gemini Live: captures mic input and outputs 16-bit PCM.
 * Replaces deprecated ScriptProcessorNode.
 */
class GeminiLiveProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;
    const pcm = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor('gemini-live-processor', GeminiLiveProcessor);
