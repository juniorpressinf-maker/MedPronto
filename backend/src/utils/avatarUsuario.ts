import { Jimp } from "jimp";
import { parseDataImageUrl } from "./imageDataUrl.js";

/** Lado do avatar guardado (quadrado). */
const LADO = 192;

/**
 * Converte a imagem enviada (data URL) num avatar JPEG quadrado de 192x192,
 * recortado no centro. Resultado típico: 8–20 KB.
 */
export async function normalizarAvatar(dataUrl: string): Promise<string> {
  const parsed = parseDataImageUrl(dataUrl);
  if (!parsed) {
    throw new Error("Imagem inválida. Use PNG, JPG, WebP, GIF ou BMP.");
  }
  const img = await Jimp.read(parsed.buffer);
  img.cover({ w: LADO, h: LADO });
  // Fundo branco: PNG com transparência não fica com fundo preto no JPEG.
  const fundo = new Jimp({ width: LADO, height: LADO, color: 0xffffffff });
  fundo.composite(img, 0, 0);
  const out = await fundo.getBuffer("image/jpeg", { quality: 82 });
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}
