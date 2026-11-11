// Types for the published Core Image Gallery module, which ships none.
interface ImageGalleryInstance {
  show(index: number, activate?: boolean): void;
  play(on?: boolean, moveFocus?: boolean): void;
  fullscreen(on?: boolean, moveFocus?: boolean): void;
  dispose(): void;
}

declare const ImageGallery: {
  new (element: Element): ImageGalleryInstance;
  getInstance(element: Element | null): ImageGalleryInstance | null;
  getOrCreateInstance(element: Element): ImageGalleryInstance;
};
export default ImageGallery;

/** Binds every gallery under `root`; returns a function that unbinds them. */
export declare function initImageGalleries(root?: Document | Element): () => void;
