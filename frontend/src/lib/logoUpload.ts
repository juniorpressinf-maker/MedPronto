export const IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif," +
  ".png,.jpg,.jpeg,.jpe,.jfif,.webp,.gif,.bmp,.dib,.tif,.tiff,.heic,.heif,.ico";

/** @deprecated use IMAGE_ACCEPT */
export const LOGO_ACCEPT = IMAGE_ACCEPT;

const IMAGE_EXT_RE =
  /\.(png|jpe?g|jfif|webp|gif|bmp|dib|tiff?|heic|heif|ico)$/i;

/** Versao enviada ao servidor (ele comprime de novo se precisar). */
export const LOGO_STORED_MAX_BYTES = 250 * 1024;
const LOGO_IMAGE_MAX_EDGE = 512;
const LOGO_IMAGE_JPEG_QUALITY = 0.9;

const FORMATO_MSG =
  "Formato nao aceito. Use PNG, JPG, JPEG, WebP, GIF, BMP, TIFF, HEIC ou ICO.";

export function formatImageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** @deprecated use formatImageSize */
export const formatLogoSize = formatImageSize;

export function isAcceptedLogoImageFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (
    /^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp|tiff|heic|heif|vnd\.microsoft\.icon)$/i.test(
      type,
    )
  ) {
    return true;
  }
  if (type === "application/octet-stream" || type === "") {
    return IMAGE_EXT_RE.test(file.name);
  }
  return IMAGE_EXT_RE.test(file.name);
}

/** Sem limite de tamanho na entrada — o sistema comprime antes de gravar. */
export function validateLogoImageInput(file: File): string | null {
  if (!isAcceptedLogoImageFile(file)) {
    return FORMATO_MSG;
  }
  return null;
}

/** @deprecated use validateLogoImageInput */
export const validateImageFile = validateLogoImageInput;
/** @deprecated use validateLogoImageInput */
export const validateLogoFile = validateLogoImageInput;

export function dataUrlByteSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  return Math.floor((dataUrl.length - comma - 1) * 0.75);
}

function canvasToStoredJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): { dataUrl: string; bytes: number } {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, bytes: dataUrlByteSize(dataUrl) };
}

function compressLoadedImage(img: HTMLImageElement): string {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) {
    throw new Error("Imagem invalida");
  }

  let edge = LOGO_IMAGE_MAX_EDGE;
  let quality = LOGO_IMAGE_JPEG_QUALITY;
  let best = "";

  for (let attempt = 0; attempt < 16; attempt++) {
    const scale = Math.min(1, edge / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas indisponivel");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);

    let q = quality;
    for (let qStep = 0; qStep < 10; qStep++) {
      const out = canvasToStoredJpeg(canvas, q);
      if (!best || out.bytes < dataUrlByteSize(best)) {
        best = out.dataUrl;
      }
      if (out.bytes <= LOGO_STORED_MAX_BYTES) {
        return out.dataUrl;
      }
      q = Math.max(0.3, q - 0.06);
    }
    edge = Math.max(64, Math.round(edge * 0.78));
    quality = Math.max(0.55, quality - 0.05);
  }

  if (best) {
    return best;
  }
  throw new Error("Nao foi possivel ler a imagem.");
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "Nao foi possivel abrir esta imagem no navegador. O servidor tentara comprimir ao salvar.",
        ),
      );
    img.src = url;
  });
}

export function normalizeStoredLogoFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return loadImageFromUrl(url)
    .then((img) => {
      URL.revokeObjectURL(url);
      return compressLoadedImage(img);
    })
    .catch(() => {
      URL.revokeObjectURL(url);
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () =>
          reject(new Error("Nao foi possivel ler o arquivo de imagem."));
        reader.readAsDataURL(file);
      });
    });
}

export function normalizeStoredLogoDataUrl(dataUrl: string): Promise<string> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return Promise.resolve("");
  if (!trimmed.startsWith("data:image/")) return Promise.resolve(trimmed);
  if (dataUrlByteSize(trimmed) <= LOGO_STORED_MAX_BYTES) {
    return Promise.resolve(trimmed);
  }
  return loadImageFromUrl(trimmed)
    .then(compressLoadedImage)
    .catch(() => Promise.resolve(trimmed));
}

export async function prepareLogoForSave(logo: string): Promise<string> {
  const trimmed = logo.trim();
  if (!trimmed) return "";
  return normalizeStoredLogoDataUrl(trimmed);
}
