/**
 * Float32 → 16-bit PCM WAV encoding/decoding helpers.
 *
 * Used by:
 *   - The built-in sound library, to ship synthesizers as data URLs without
 *     bundling .wav blobs in the project.
 *   - The SoundEditor, to round-trip an asset's bytes through editing
 *     and store the result back as a data URL on the asset record.
 *
 * 16-bit mono PCM is what every browser, Slint app via rodio, and
 * minimal-runtime decoder reliably accepts. Higher fidelity isn't worth
 * the extra bytes in the project file.
 */

/** Encode a mono Float32 sample buffer as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/** Wrap raw bytes as a `data:` URL. Chunked to avoid call-stack overflow
 *  on multi-MB buffers (`String.fromCharCode.apply(null, hugeArray)` blows
 *  the V8 argument limit around ~120k entries). */
export function arrayBufferToDataUrl(buf: ArrayBuffer, mime = "audio/wav"): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, end)));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Decode an asset's stored audio (`data:audio/...;base64,...` or raw
 *  base64) into an AudioBuffer. Returns null on decode failure. */
export async function decodeSoundDataUrl(
  ctx: AudioContext,
  raw: string,
): Promise<AudioBuffer | null> {
  let payload: string;
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    if (comma < 0) return null;
    payload = raw.slice(comma + 1);
  } else {
    payload = raw;
  }
  try {
    const bin = atob(payload);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return await ctx.decodeAudioData(buf.buffer.slice(0));
  } catch {
    return null;
  }
}

/** Mix-down an AudioBuffer to a mono Float32 sample array. */
export function audioBufferToFloat32(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) {
    return new Float32Array(buf.getChannelData(0));
  }
  const left = buf.getChannelData(0);
  const right = buf.numberOfChannels >= 2 ? buf.getChannelData(1) : left;
  const out = new Float32Array(left.length);
  for (let i = 0; i < left.length; i++) {
    out[i] = (left[i] + right[i]) * 0.5;
  }
  return out;
}
