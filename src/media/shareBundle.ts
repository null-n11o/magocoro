export async function shareOrSaveVideo(
  file: File,
  deps: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
    save: (file: File) => void;
  },
): Promise<"shared" | "saved"> {
  const data: ShareData = { files: [file], title: "Magocoro" };
  if (deps.canShare?.(data) && deps.share) {
    try {
      await deps.share(data);
      return "shared";
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        return "shared";
      }
      throw error;
    }
  }
  deps.save(file);
  return "saved";
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 0);
}
