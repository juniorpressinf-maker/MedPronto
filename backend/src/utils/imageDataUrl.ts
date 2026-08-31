export function parseDataImageUrl(
  dataUrl: string,
): { mime: string; buffer: Buffer } | null {
  const s = String(dataUrl ?? "").trim();
  const m = s.match(/^data:(image\/[-+.\w]+);base64,([A-Za-z0-9+/=]+)$/i);
  if (!m) return null;
  try {
    return { mime: m[1]!.toLowerCase(), buffer: Buffer.from(m[2]!, "base64") };
  } catch {
    return null;
  }
}
