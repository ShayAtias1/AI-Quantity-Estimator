import { useCallback, useRef, useState, type WheelEvent } from 'react';
import type { Point } from '../types';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export interface CanvasTransform {
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: Point;
  /** Convert a screen (clientX/clientY) coordinate to native (unscaled) content coordinates. */
  screenToNative: (clientX: number, clientY: number) => Point;
  /** Mouse-wheel zoom, centered on the cursor position. */
  handleWheel: (e: WheelEvent) => void;
  /** Zoom/pan so `contentWidth`x`contentHeight` (native units) fits the container with padding. */
  fitToContainer: (contentWidth: number, contentHeight: number) => void;
  beginPanDrag: (clientX: number, clientY: number) => void;
  updatePanDrag: (clientX: number, clientY: number) => boolean;
  endPanDrag: () => void;
}

/** Shared CAD-style zoom/pan/fit engine used by any canvas+SVG viewer in the app. */
export function useCanvasTransform(): CanvasTransform {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const panDrag = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const screenToNative = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    // Trackpads emit many events per gesture, some with deltaY === 0 (pure horizontal scroll) —
    // treating those as "zoom out" (the old fixed-factor logic did, since 0 is not > 0) was the
    // cause of the zoom drifting/jittering on its own. Scaling the factor by delta magnitude
    // (instead of a fixed step per event) also keeps trackpad gestures smooth without overshoot.
    if (e.deltaY === 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor));
      setPan((prevPan) => {
        const nx = (mx - prevPan.x) / prevZoom;
        const ny = (my - prevPan.y) / prevZoom;
        return { x: mx - nx * newZoom, y: my - ny * newZoom };
      });
      return newZoom;
    });
  }, []);

  const fitToContainer = useCallback((contentWidth: number, contentHeight: number) => {
    if (!contentWidth || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const fitZoom = Math.min((rect.width - 40) / contentWidth, (rect.height - 40) / contentHeight, 2);
    const z = Math.max(fitZoom, MIN_ZOOM);
    setZoom(z);
    setPan({ x: (rect.width - contentWidth * z) / 2, y: (rect.height - contentHeight * z) / 2 });
  }, []);

  const beginPanDrag = useCallback(
    (clientX: number, clientY: number) => {
      panDrag.current = { startX: clientX, startY: clientY, panX: pan.x, panY: pan.y };
    },
    [pan]
  );

  const updatePanDrag = useCallback((clientX: number, clientY: number): boolean => {
    if (!panDrag.current) return false;
    const dx = clientX - panDrag.current.startX;
    const dy = clientY - panDrag.current.startY;
    setPan({ x: panDrag.current.panX + dx, y: panDrag.current.panY + dy });
    return true;
  }, []);

  const endPanDrag = useCallback(() => {
    panDrag.current = null;
  }, []);

  return { containerRef, zoom, pan, screenToNative, handleWheel, fitToContainer, beginPanDrag, updatePanDrag, endPanDrag };
}
