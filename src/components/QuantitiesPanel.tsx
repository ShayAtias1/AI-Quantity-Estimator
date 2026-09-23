import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import QuantityTable from './QuantityTable';
import QuantityExportActions from './QuantityExportActions';
import Icon from './Icon';

/** Never smaller than a header plus a couple of rows, never taller than leaving a strip of plan. */
const MIN_HEIGHT = 160;
/** Space kept for the top bar and a usable sliver of the canvas above the panel. */
const RESERVED_ABOVE = 220;
/** Maximised still shows the plan — this is a work panel, not a modal. */
const MAXIMIZED_RESERVED = 140;

/**
 * The quantity report, across the full width of the workspace instead of inside the 360px sidebar.
 *
 * The report is 17 columns wide; in the sidebar two of them were visible at a time. Here it gets the
 * whole window width while the plan stays on screen above it. The panel is a sibling of the
 * canvas+sidebar row, so opening it simply shortens that row — it never overlays the canvas and
 * never touches the coordinate transform, which is why drawing and calibration are unaffected.
 *
 * Its height lives in session UI state; nothing here is persisted with the project.
 */
export default function QuantitiesPanel() {
  const open = useAppStore((s) => s.quantitiesOpen);
  const setOpen = useAppStore((s) => s.setQuantitiesOpen);
  const height = useAppStore((s) => s.quantitiesHeight);
  const setHeight = useAppStore((s) => s.setQuantitiesHeight);
  const maximized = useAppStore((s) => s.quantitiesMaximized);
  const toggleMaximized = useAppStore((s) => s.toggleQuantitiesMaximized);
  const project = useAppStore((s) => s.project);

  const [resizing, setResizing] = useState(false);
  // Calculation defaults: a secondary toggle in the header, deliberately not competing with export.
  const [showDefaults, setShowDefaults] = useState(false);
  // Tracked so the panel re-clamps itself when the window is resized smaller than its height.
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - RESERVED_ABOVE);
  const clamp = useCallback((px: number) => Math.min(Math.max(px, MIN_HEIGHT), maxHeight), [maxHeight]);
  // Clamping at render time means a window resize can never leave the panel taller than the window.
  const effectiveHeight = maximized ? Math.max(MIN_HEIGHT, viewportHeight - MAXIMIZED_RESERVED) : clamp(height);

  // Dragging the top edge. Pointer capture keeps the drag alive over the canvas and the iframe-free
  // areas alike, and the listener is removed as soon as the pointer is released.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (maximized) return;
    dragRef.current = { startY: e.clientY, startHeight: effectiveHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
    setResizing(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging upwards (a smaller clientY) makes the panel taller.
    setHeight(clamp(drag.startHeight + (drag.startY - e.clientY)));
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setResizing(false);
  };
  // The same resize from the keyboard, so the panel is not mouse-only.
  const onResizerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') setHeight(clamp(effectiveHeight + 32));
    else if (e.key === 'ArrowDown') setHeight(clamp(effectiveHeight - 32));
    else return;
    e.preventDefault();
  };

  if (!project) return null;

  const roomCount = project.rooms.length;

  if (!open) {
    return (
      <div className="qty-panel-collapsed">
        <button className="btn-ghost small qty-open-btn" onClick={() => setOpen(true)} title="פתח את טבלת הכמויות">
          <Icon name="table" />
          כמויות
        </button>
        <span className="muted">{roomCount} חדרים</span>
      </div>
    );
  }

  return (
    <section
      className={`qty-panel ${resizing ? 'resizing' : ''}`}
      style={{ height: effectiveHeight }}
      aria-label="כתב כמויות"
    >
      <button
        className="qty-panel-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onResizerKeyDown}
        aria-label="שנה את גובה חלונית הכמויות"
        title="גרור לשינוי הגובה"
      />
      <header className="qty-panel-head">
        <Icon name="table" size={18} />
        <h2 className="qty-panel-title">כמויות</h2>
        <span className="qty-panel-meta">{roomCount} חדרים בפרויקט</span>
        <div className="qty-panel-actions">
          <button
            className={`btn-ghost small ${showDefaults ? 'active' : ''}`}
            onClick={() => setShowDefaults((v) => !v)}
            title="ברירות המחדל שמהן נגזרים הפחת והגבהים של פריטי עבודה חדשים"
          >
            <Icon name="settings" />
            <span className="btn-label">ברירות מחדל</span>
          </button>
          <span className="top-bar-sep" />
          <QuantityExportActions variant="buttons" />
          <button
            className="icon-btn"
            onClick={toggleMaximized}
            title={maximized ? 'החזר לגובה הקודם' : 'הגדל את החלונית'}
          >
            <Icon name={maximized ? 'collapse' : 'expand'} />
          </button>
          <button className="icon-btn" onClick={() => setOpen(false)} title="סגור את חלונית הכמויות">
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="qty-panel-body">
        <QuantityTable showDefaults={showDefaults} />
      </div>
    </section>
  );
}
