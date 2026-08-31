import { Jimp } from "jimp";
import { parseDataImageUrl } from "./imageDataUrl.js";

const MAX_EDGE = 512;
const TARGET_BYTES = 250 * 1024;

function toDataUrlJpeg(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

export async function normalizeLogoForStorage(dataUrl: string): Promise<string> {
  const parsed = parseDataImageUrl(dataUrl);
  if (!parsed) {
    throw new Error(
      "Logo invalida. Use PNG, JPG, WebP, GIF, BMP, TIFF, HEIC ou ICO.",
    );
  }

  if (parsed.buffer.length <= TARGET_BYTES && parsed.mime === "image/jpeg") {
    return dataUrl.trim();
  }

  let best: Buffer | null = null;

  for (let edge = MAX_EDGE; edge >= 96; edge = Math.round(edge * 0.82)) {
    const base = await Jimp.read(parsed.buffer);
    const img = base.scaleToFit({ w: edge, h: edge });

    for (const q of [90, 80, 70, 60, 50, 40, 32, 25]) {
      const out = await img.getBuffer("image/jpeg", { quality: q });
      if (!best || out.length < best.length) {
        best = out;
      }
      if (out.length <= TARGET_BYTES) {
        return toDataUrlJpeg(out);
      }
    }
  }

  if (!best) {
    throw new Error("Nao foi possivel processar a logomarca.");
  }
  return toDataUrlJpeg(best);
}
