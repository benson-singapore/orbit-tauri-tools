export function isDocumentPictureInPictureSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

export function isVideoPictureInPictureSupported(): boolean {
  return (
    typeof document !== "undefined"
    && document.pictureInPictureEnabled
    && typeof HTMLVideoElement !== "undefined"
    && "requestPictureInPicture" in HTMLVideoElement.prototype
  );
}

export function isDocumentPictureInPictureActive(): boolean {
  return Boolean(window.documentPictureInPicture?.window);
}

export async function toggleDocumentPictureInPicture(
  container: HTMLElement,
  options?: { width?: number; height?: number },
): Promise<void> {
  const api = window.documentPictureInPicture;
  if (!api) {
    throw new Error("document-picture-in-picture-unsupported");
  }

  if (api.window) {
    api.window.close();
    return;
  }

  const parent = container.parentElement;
  if (!parent) return;

  const placeholder = document.createComment("pip-placeholder");
  parent.insertBefore(placeholder, container);

  const width = options?.width ?? Math.min(container.clientWidth || 640, 640);
  const height = options?.height ?? Math.round((width * 9) / 16);

  const pipWindow = await api.requestWindow({ width, height });

  pipWindow.document.body.replaceChildren();
  pipWindow.document.body.style.margin = "0";
  pipWindow.document.body.style.background = "#000";
  pipWindow.document.body.style.overflow = "hidden";

  container.style.width = "100%";
  container.style.height = "100%";
  pipWindow.document.body.append(container);

  pipWindow.addEventListener(
    "pagehide",
    () => {
      if (placeholder.parentNode) {
        placeholder.parentNode.insertBefore(container, placeholder);
        placeholder.remove();
      }
      container.style.width = "";
      container.style.height = "";
    },
    { once: true },
  );
}

export async function toggleVideoPictureInPicture(video: HTMLVideoElement): Promise<void> {
  if (!isVideoPictureInPictureSupported()) {
    throw new Error("video-picture-in-picture-unsupported");
  }

  if (document.pictureInPictureElement === video) {
    await document.exitPictureInPicture();
    return;
  }

  await video.requestPictureInPicture();
}
