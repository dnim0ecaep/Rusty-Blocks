import { describe, expect, it } from "vitest";

import { arrayBufferToDataUrl, encodeWav } from "./wavEncoder";

/**
 * The WAV header is fixed-width PCM — getting any field wrong silently
 * produces files that *play* but at the wrong rate or as garbage. These
 * tests assert byte-level correctness on a tiny known buffer so any
 * regression in the format (size fields, channel count, bit depth)
 * fails loudly.
 */

const SAMPLE_RATE = 22050;

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("encodeWav", () => {
  it("produces a valid RIFF/WAVE header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWav(samples, SAMPLE_RATE);
    const view = new DataView(buf);

    expect(buf.byteLength).toBe(44 + samples.length * 2);
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(readAscii(view, 36, 4)).toBe("data");

    // RIFF chunk size = 36 + data size
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    // PCM subchunk size = 16
    expect(view.getUint32(16, true)).toBe(16);
    // PCM format = 1, mono, sample rate, 16-bit
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    // data size = samples * bytes per sample
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("clips out-of-range floats and round-trips midrange values", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 2, -2]);
    const buf = encodeWav(samples, SAMPLE_RATE);
    const view = new DataView(buf);

    expect(view.getInt16(44, true)).toBe(0);
    // 0.5 * 0x7fff = 16383.5 → 16383 (truncated by Int16 cast)
    expect(view.getInt16(46, true)).toBe(16383);
    // -0.5 * 0x8000 = -16384
    expect(view.getInt16(48, true)).toBe(-16384);
    // 2 → clipped to 1 → 0x7fff
    expect(view.getInt16(50, true)).toBe(0x7fff);
    // -2 → clipped to -1 → -0x8000
    expect(view.getInt16(52, true)).toBe(-0x8000);
  });
});

describe("arrayBufferToDataUrl", () => {
  it("wraps bytes as a base64 data URL with the given mime type", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
    const url = arrayBufferToDataUrl(bytes, "audio/wav");
    expect(url).toBe(`data:audio/wav;base64,${btoa("Hello")}`);
  });
});
