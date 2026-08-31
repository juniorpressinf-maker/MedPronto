export class SaveFileCancelled extends Error {
  override name = "SaveFileCancelled";
}

/** Salva blob — abre janela do sistema para escolher pasta/arquivo quando possivel. */
export async function saveBlobAs(
  blob: Blob,
  suggestedName: string,
): Promise<string> {
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName,
        types: [
          {
            description: "Backup Agenda Financeira",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new SaveFileCancelled();
      }
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
  return suggestedName;
}
