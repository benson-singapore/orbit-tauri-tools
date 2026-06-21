/// <reference types="vite/client" />

interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  window: Window | null;
  onenter: ((this: DocumentPictureInPicture, ev: Event) => void) | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}
