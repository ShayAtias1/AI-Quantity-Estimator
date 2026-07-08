import type { PDFPageProxy } from 'pdfjs-dist';
import { getPdfDocumentByKey } from './pdfCache';

export interface PlanRenderHandle {
  promise: Promise<void>;
  cancel: () => void;
}

/**
 * Abstraction over "a single page of a plan file" that the viewers render from.
 * Today only PDF (via pdf.js) is implemented; a future `DwgPlanSource` can implement
 * the same interface without touching any viewer/canvas code.
 */
export interface PlanPageSource {
  getNativeSize(): { width: number; height: number };
  /** Render the page as-is (original colors) at the given scale. */
  render(canvas: HTMLCanvasElement, scale: number): PlanRenderHandle;
  /** Render the page as a solid-color silhouette (transparent background, ink recolored). */
  renderTinted(canvas: HTMLCanvasElement, scale: number, color: string): PlanRenderHandle;
}

export class PdfPlanSource implements PlanPageSource {
  private page: PDFPageProxy;

  constructor(page: PDFPageProxy) {
    this.page = page;
  }

  getNativeSize() {
    const vp = this.page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height };
  }

  render(canvas: HTMLCanvasElement, scale: number): PlanRenderHandle {
    const viewport = this.page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { promise: Promise.resolve(), cancel: () => {} };
    const task = this.page.render({ canvasContext: ctx, viewport, canvas });
    return {
      promise: task.promise.then(() => undefined).catch(() => undefined),
      cancel: () => task.cancel(),
    };
  }

  renderTinted(canvas: HTMLCanvasElement, scale: number, color: string): PlanRenderHandle {
    const viewport = this.page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { promise: Promise.resolve(), cancel: () => {} };
    let cancelled = false;
    const task = this.page.render({ canvasContext: ctx, viewport, canvas, background: 'rgba(0,0,0,0)' });
    const promise = task.promise
      .then(() => {
        if (cancelled) return;
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      })
      .catch(() => undefined);
    return {
      promise,
      cancel: () => {
        cancelled = true;
        task.cancel();
      },
    };
  }
}

export async function loadPdfPlanSource(
  cacheKey: string,
  loadBlob: () => Promise<Blob | undefined>,
  pageNumber: number
): Promise<{ source: PdfPlanSource; numPages: number }> {
  const doc = await getPdfDocumentByKey(cacheKey, loadBlob);
  const page = await doc.getPage(pageNumber);
  return { source: new PdfPlanSource(page), numPages: doc.numPages };
}
