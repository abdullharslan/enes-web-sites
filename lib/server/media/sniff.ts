export type SniffedFormat = "jpeg" | "png" | "webp";

const startsWith = (input: Buffer, signature: readonly number[], offset = 0) =>
  input.length >= offset + signature.length &&
  signature.every((byte, i) => input[offset + i] === byte);

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * The real format from the file's first bytes, or null. Checked before any
 * decoder runs, so formats we never accept (SVG, XML, GIF, HEIC, PDF …) cannot
 * reach sharp/libvips parsers at all, whatever the declared MIME type says.
 */
export function sniffImageFormat(input: Buffer): SniffedFormat | null {
  if (startsWith(input, JPEG)) return "jpeg";
  if (startsWith(input, PNG)) return "png";
  if (startsWith(input, RIFF) && startsWith(input, WEBP, 8)) return "webp";
  return null;
}
