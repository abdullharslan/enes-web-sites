import sharp from "sharp";

/** A small real PNG generated on the fly (no binary fixtures in the repo). */
export async function pngFile(
  color: string,
  name = "photo.png",
  width = 64,
  height = 80,
) {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  return { name, mimeType: "image/png", buffer };
}
