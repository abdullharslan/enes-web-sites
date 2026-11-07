import { describe, expect, it } from "vitest";
import { sniffImageFormat } from "./sniff";

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string) => Buffer.from(text, "ascii");

describe("sniffImageFormat", () => {
  it("recognises JPEG, PNG and WebP by their signatures", () => {
    expect(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("jpeg");
    expect(
      sniffImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe("png");
    expect(
      sniffImageFormat(
        Buffer.concat([ascii("RIFF"), bytes(1, 2, 3, 4), ascii("WEBPVP8 ")]),
      ),
    ).toBe("webp");
  });

  it("rejects everything else before any decoder sees it", () => {
    for (const input of [
      ascii("<svg onload=alert(1)></svg>"),
      ascii('<?xml version="1.0"?><svg/>'),
      ascii("GIF89a"),
      Buffer.concat([ascii("RIFF"), bytes(1, 2, 3, 4), ascii("WAVEfmt ")]),
      Buffer.concat([bytes(0, 0, 0, 0x18), ascii("ftypheic")]),
      ascii("%PDF-1.7"),
      bytes(0xff, 0xd8),
      Buffer.alloc(0),
    ]) {
      expect(sniffImageFormat(input)).toBeNull();
    }
  });
});
