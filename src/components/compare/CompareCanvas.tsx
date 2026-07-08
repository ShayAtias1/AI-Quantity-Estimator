import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MouseEvent } from 'react';
import { v4 as uuid } from 'uuid';
import { loadPdfPlanSource, type PdfPlanSource } from '../../lib/planSource';
import { loadComparePdfBlob } from '../../db/database';
import { useCompareStore } from '../../store/compareStore';
import { useCanvasTransform } from '../../hooks/useCanvasTransform';
import { IDENTITY_TRANSFORM, MEASURE_TOOL_LABELS } from '../../types/compare';
import type { Point } from '../../types';
import type { Markup } from '../../types/compare';
import { applyAlignment, invertAlignment, solveAlignment } from '../../lib/alignment';
import { polygonAreaM2, polygonPerimeterM, distancePx, pxToMeters, round, cloudPath } from '../../lib/geometry';

const RENDER_SCALE = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2));

function arrowHeadPoints(from: Point, to: Point, size: number): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 7;
  const p1 = { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) };
  const p2 = { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) };
  return `${to.x},${to.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`;
}

function MarkupShape({ markup, strokeW }: { markup: Markup; strokeW: number }) {
  const [a, b] = markup.points;
  switch (markup.tool) {
    case 'arrow':
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={markup.color} strokeWidth={strokeW * 1.3} />
          <polygon points={arrowHeadPoints(a, b, strokeW * 8)} fill={markup.color} />
        </g>
      );
    case 'rectangle':
      return (
        <rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)}
          height={Math.abs(b.y - a.y)}
          fill={markup.color}
          fillOpacity={0.1}
          stroke={markup.color}
          strokeWidth={strokeW * 1.3}
        />
      );
    case 'dimension': {
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const tickLen = strokeW * 6;
      const nx = Math.cos(angle + Math.PI / 2) * tickLen;
      const ny = Math.sin(angle + Math.PI / 2) * tickLen;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={markup.color} strokeWidth={strokeW} />
          <line x1={a.x - nx} y1={a.y - ny} x2={a.x + nx} y2={a.y + ny} stroke={markup.color} strokeWidth={strokeW} />
          <line x1={b.x - nx} y1={b.y - ny} x2={b.x + nx} y2={b.y + ny} stroke={markup.color} strokeWidth={strokeW} />
          {markup.text && (
            <text x={midX} y={midY - tickLen - strokeW * 1.5} fontSize={strokeW * 6} fill={markup.color} fontWeight={600} textAnchor="middle">
              {markup.text}
            </text>
          )}
        </g>
      );
    }
    case 'cloud':
      return <path d={cloudPath(markup.points, 14 * strokeW)} fill={markup.color} fillOpacity={0.08} stroke={markup.color} strokeWidth={strokeW * 1.3} strokeLinejoin="round" />;
    case 'text':
      return (
        <g>
          <rect x={a.x - 4 * strokeW} y={a.y - 14 * strokeW} width={(markup.text?.length ?? 0) * 7 * strokeW + 8 * strokeW} height={18 * strokeW} fill="#fff" fillOpacity={0.85} rx={3 * strokeW} />
          <text x={a.x} y={a.y} fontSize={strokeW * 6.5} fill={markup.color} fontWeight={600}>
            {markup.text}
          </text>
        </g>
      );
    default:
      return null;
  }
}

function useLayerRender(
  comparisonId: string | undefined,
  layer: 'original' | 'revised',
  pageNumber: number,
  tint: string,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onSize: (size: { width: number; height: number }) => void,
  onNumPages: (n: number) => void
) {
  const [source, setSource] = useState<PdfPlanSource | null>(null);

  useEffect(() => {
    if (!comparisonId) return;
    let cancelled = false;
    loadPdfPlanSource(`${comparisonId}:${layer}`, () => loadComparePdfBlob(comparisonId, layer), pageNumber)
      .then(({ source: s, numPages }) => {
        if (cancelled) return;
        onNumPages(numPages);
        setSource(s);
      })
      .catch(() => {
        /* surfaced via layer staying blank; comparison-level error handling can be added later */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonId, layer, pageNumber]);

  useEffect(() => {
    if (!source || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const size = source.getNativeSize();
    onSize(size);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const handle = source.renderTinted(canvas, RENDER_SCALE, tint);
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, tint]);
}

export interface CompareCanvasHandle {
  /** Rasterize the current view (both layers + overlay, with a title/legend header) to a PNG data URL. */
  exportComposite: () => Promise<{ dataUrl: string; width: number; height: number } | null>;
}

const CompareCanvas = forwardRef<CompareCanvasHandle>(function CompareCanvas(_props, ref) {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const toolMode = useCompareStore((s) => s.toolMode);
  const setOriginalNumPages = useCompareStore((s) => s.setOriginalNumPages);
  const setRevisedNumPages = useCompareStore((s) => s.setRevisedNumPages);
  const updatePageQuiet = useCompareStore((s) => s.updatePageQuiet);
  const persist = useCompareStore((s) => s.persist);
  const pickingAlignmentPoints = useCompareStore((s) => s.pickingAlignmentPoints);
  const alignmentPendingOriginal = useCompareStore((s) => s.alignmentPendingOriginal);
  const alignmentPairs = useCompareStore((s) => s.alignmentPairs);
  const addAlignmentPoint = useCompareStore((s) => s.addAlignmentPoint);
  const setAlignmentTransform = useCompareStore((s) => s.setAlignmentTransform);

  const calibrationPoints = useCompareStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useCompareStore((s) => s.addCalibrationPoint);
  const clearCalibration = useCompareStore((s) => s.clearCalibration);

  const measureTool = useCompareStore((s) => s.measureTool);
  const measurePoints = useCompareStore((s) => s.measurePoints);
  const addMeasurePoint = useCompareStore((s) => s.addMeasurePoint);
  const clearMeasurePoints = useCompareStore((s) => s.clearMeasurePoints);
  const finishMeasurement = useCompareStore((s) => s.finishMeasurement);

  const markupTool = useCompareStore((s) => s.markupTool);
  const markupPoints = useCompareStore((s) => s.markupPoints);
  const markupColor = useCompareStore((s) => s.markupColor);
  const addMarkupPoint = useCompareStore((s) => s.addMarkupPoint);
  const clearMarkupPoints = useCompareStore((s) => s.clearMarkupPoints);
  const finishMarkup = useCompareStore((s) => s.finishMarkup);

  const viewMode = useCompareStore((s) => s.viewMode);
  const swipePosition = useCompareStore((s) => s.swipePosition);
  const setSwipePosition = useCompareStore((s) => s.setSwipePosition);
  const blinkShowingRevised = useCompareStore((s) => s.blinkShowingRevised);
  const toggleBlink = useCompareStore((s) => s.toggleBlink);

  const { containerRef, zoom, pan, screenToNative, handleWheel, fitToContainer, beginPanDrag, updatePanDrag, endPanDrag } =
    useCanvasTransform();

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const revisedCanvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [revisedPageSize, setRevisedPageSize] = useState({ width: 0, height: 0 });
  const isPanning = useRef(false);
  const alignDrag = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const swipeDrag = useRef(false);

  const page = comparison?.pages[currentPageKey];
  const originalPageNumber = page?.originalPageNumber ?? currentPageKey;
  const revisedPageNumber = page?.revisedPageNumber ?? currentPageKey;
  const alignment = page?.alignment ?? IDENTITY_TRANSFORM;
  // The revised layer's own transform-origin must be its own center, not the original page's —
  // otherwise, whenever the two PDFs have different page dimensions, rotation/scale pivot around
  // the wrong point and the alignment drifts (this was the reported "not quite accurate" bug).
  const pivot: Point = { x: revisedPageSize.width / 2, y: revisedPageSize.height / 2 };
  const metersPerPixel = page?.originalCalibration?.metersPerPixel ?? page?.revisedCalibration?.metersPerPixel ?? 0;

  useLayerRender(comparison?.id, 'original', originalPageNumber, comparison?.originalColorTint ?? '#9ca3af', originalCanvasRef, setPageSize, setOriginalNumPages);
  useLayerRender(comparison?.id, 'revised', revisedPageNumber, comparison?.revisedColorTint ?? '#ef4444', revisedCanvasRef, setRevisedPageSize, setRevisedNumPages);

  useEffect(() => {
    if (!pageSize.width) return;
    fitToContainer(pageSize.width, pageSize.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  // Once both alignment point pairs are picked, solve for the transform automatically.
  useEffect(() => {
    if (alignmentPairs.length !== 2 || !pageSize.width) return;
    const [p1, p2] = alignmentPairs;
    const computed = solveAlignment(p1.originalPoint, p2.originalPoint, p1.revisedPoint, p2.revisedPoint, pivot);
    setAlignmentTransform(currentPageKey, computed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignmentPairs]);

  // Blink mode: auto-toggle between the two layers on a timer.
  useEffect(() => {
    if (viewMode !== 'blink') return;
    const id = setInterval(() => toggleBlink(), 800);
    return () => clearInterval(id);
  }, [viewMode, toggleBlink]);

  const finishOpenMeasurement = () => {
    if (!measureTool || measurePoints.length < 2 || !metersPerPixel) {
      clearMeasurePoints();
      return;
    }
    let label = '';
    if (measureTool === 'distance') {
      const m = pxToMeters(distancePx(measurePoints[0], measurePoints[1]), metersPerPixel);
      label = `${round(m, 2)} מ'`;
    } else if (measureTool === 'area') {
      const m2 = polygonAreaM2(measurePoints, metersPerPixel);
      label = `${round(m2, 2)} מ"ר`;
    } else {
      const m = polygonPerimeterM(measurePoints, true, metersPerPixel);
      label = `${round(m, 2)} מ'`;
    }
    finishMeasurement({ id: uuid(), tool: measureTool, points: measurePoints, label });
  };

  const finishOpenMarkup = () => {
    if (!markupTool) return;
    if (markupTool === 'cloud') {
      if (markupPoints.length < 3) {
        clearMarkupPoints();
        return;
      }
      finishMarkup({ id: uuid(), tool: 'cloud', points: markupPoints, color: markupColor, createdAt: Date.now() });
      return;
    }
    if (markupPoints.length < 2) {
      clearMarkupPoints();
      return;
    }
    let text: string | undefined;
    if (markupTool === 'dimension' && metersPerPixel) {
      const m = pxToMeters(distancePx(markupPoints[0], markupPoints[1]), metersPerPixel);
      text = `${round(m, 2)} מ'`;
    }
    finishMarkup({ id: uuid(), tool: markupTool, points: markupPoints, color: markupColor, text, createdAt: Date.now() });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearMeasurePoints();
        clearCalibration();
        clearMarkupPoints();
      }
      if (e.key === 'Enter') {
        if (measureTool && measureTool !== 'distance' && measurePoints.length >= 3) finishOpenMeasurement();
        if (markupTool === 'cloud' && markupPoints.length >= 3) finishOpenMarkup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureTool, measurePoints, markupTool, markupPoints]);

  const handleMouseDown = (e: MouseEvent) => {
    if (toolMode === 'pan' || e.button === 1) {
      isPanning.current = true;
      beginPanDrag(e.clientX, e.clientY);
      return;
    }
    if (toolMode === 'align' && !pickingAlignmentPoints) {
      alignDrag.current = { startX: e.clientX, startY: e.clientY, startOffsetX: alignment.offsetX, startOffsetY: alignment.offsetY };
    }
  };
  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning.current) {
      updatePanDrag(e.clientX, e.clientY);
      return;
    }
    if (alignDrag.current) {
      const dx = (e.clientX - alignDrag.current.startX) / zoom;
      const dy = (e.clientY - alignDrag.current.startY) / zoom;
      updatePageQuiet(currentPageKey, {
        alignment: { ...alignment, offsetX: alignDrag.current.startOffsetX + dx, offsetY: alignDrag.current.startOffsetY + dy },
      });
      return;
    }
    if (swipeDrag.current && pageSize.width) {
      const native = screenToNative(e.clientX, e.clientY);
      setSwipePosition(native.x / pageSize.width);
    }
  };
  const handleMouseUp = () => {
    isPanning.current = false;
    endPanDrag();
    swipeDrag.current = false;
    if (alignDrag.current) {
      alignDrag.current = null;
      void persist();
    }
  };
  const handleDividerMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    swipeDrag.current = true;
  };

  const handleClick = (e: MouseEvent) => {
    if (isPanning.current || alignDrag.current) return;
    const native = screenToNative(e.clientX, e.clientY);

    if (toolMode === 'align' && pickingAlignmentPoints) {
      if (!alignmentPendingOriginal) {
        addAlignmentPoint(native, true);
      } else {
        const revisedLocal = invertAlignment(native, alignment, pivot);
        addAlignmentPoint(revisedLocal, false);
      }
      return;
    }

    if (toolMode === 'calibrate') {
      if (calibrationPoints.length < 2) addCalibrationPoint(native);
      return;
    }

    if (toolMode === 'measure' && measureTool) {
      if (measureTool === 'distance') {
        addMeasurePoint(native);
        return;
      }
      if (measurePoints.length >= 3) {
        const first = measurePoints[0];
        const distScreen = Math.hypot(native.x - first.x, native.y - first.y) * zoom;
        if (distScreen < 10) {
          finishOpenMeasurement();
          return;
        }
      }
      addMeasurePoint(native);
      return;
    }

    if (toolMode === 'markup' && markupTool) {
      if (markupTool === 'text') {
        const text = window.prompt('טקסט הערה:');
        if (text && text.trim()) {
          finishMarkup({ id: uuid(), tool: 'text', points: [native], color: markupColor, text: text.trim(), createdAt: Date.now() });
        }
        return;
      }
      if (markupTool === 'cloud') {
        if (markupPoints.length >= 3) {
          const first = markupPoints[0];
          const distScreen = Math.hypot(native.x - first.x, native.y - first.y) * zoom;
          if (distScreen < 10) {
            finishOpenMarkup();
            return;
          }
        }
        addMarkupPoint(native);
        return;
      }
      addMarkupPoint(native);
    }
  };

  // Auto-finish distance measurement once 2 points are placed.
  useEffect(() => {
    if (measureTool === 'distance' && measurePoints.length === 2) {
      finishOpenMeasurement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurePoints, measureTool]);

  // Auto-finish 2-point markup tools (arrow/rectangle/dimension) once both points are placed.
  useEffect(() => {
    if (markupTool && markupTool !== 'cloud' && markupTool !== 'text' && markupPoints.length === 2) {
      finishOpenMarkup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markupPoints, markupTool]);

  useImperativeHandle(
    ref,
    () => ({
      exportComposite: async () => {
        if (!comparison || !pageSize.width || !originalCanvasRef.current || !revisedCanvasRef.current) return null;
        const mult = 2;
        const headerH = 70 * mult;
        const w = pageSize.width * mult;
        const h = pageSize.height * mult;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h + headerH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.direction = 'rtl';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0f172a';
        ctx.font = `${20 * mult}px 'Segoe UI', sans-serif`;
        ctx.fillText(
          `${comparison.name}${comparison.apartmentNumber ? ' - דירה ' + comparison.apartmentNumber : ''}`,
          w - 16 * mult,
          30 * mult
        );
        ctx.fillStyle = '#8b8f99';
        ctx.font = `${12 * mult}px 'Segoe UI', sans-serif`;
        ctx.fillText(new Date().toLocaleDateString('he-IL'), w - 16 * mult, 50 * mult);

        ctx.textAlign = 'right';
        ctx.font = `${12 * mult}px 'Segoe UI', sans-serif`;
        ctx.fillStyle = comparison.originalColorTint;
        ctx.beginPath();
        ctx.arc(w - 190 * mult, 46 * mult, 4 * mult, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#374151';
        ctx.fillText('מקור', w - 200 * mult, 50 * mult);
        ctx.fillStyle = comparison.revisedColorTint;
        ctx.beginPath();
        ctx.arc(w - 250 * mult, 46 * mult, 4 * mult, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#374151';
        ctx.fillText('מעודכן', w - 260 * mult, 50 * mult);

        ctx.save();
        ctx.translate(0, headerH);
        if (comparison.originalVisible) {
          ctx.globalAlpha = comparison.originalOpacity;
          ctx.drawImage(originalCanvasRef.current, 0, 0, w, h);
        }
        if (comparison.revisedVisible) {
          ctx.globalAlpha = comparison.revisedOpacity;
          ctx.save();
          const px = pivot.x * mult;
          const py = pivot.y * mult;
          ctx.translate(px, py);
          ctx.translate(alignment.offsetX * mult, alignment.offsetY * mult);
          ctx.rotate((alignment.rotationDeg * Math.PI) / 180);
          ctx.scale(alignment.scale, alignment.scale);
          ctx.translate(-px, -py);
          ctx.drawImage(revisedCanvasRef.current, 0, 0, revisedPageSize.width * mult, revisedPageSize.height * mult);
          ctx.restore();
        }
        ctx.globalAlpha = 1;

        if (svgRef.current) {
          const svgString = new XMLSerializer().serializeToString(svgRef.current);
          const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
          const img = new Image(w, h);
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to rasterize overlay SVG'));
            img.src = svgUrl;
          });
          ctx.drawImage(img, 0, 0, w, h);
        }
        ctx.restore();

        return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
      },
    }),
    [comparison, pageSize, revisedPageSize, alignment, pivot]
  );

  if (!comparison) return null;

  const strokeW = 2 / zoom;
  const vertexR = 5 / zoom;

  let originalOpacity = comparison.originalVisible ? comparison.originalOpacity : 0;
  let revisedOpacity = comparison.revisedVisible ? comparison.revisedOpacity : 0;
  let originalClip: string | undefined;
  let revisedClip: string | undefined;
  if (viewMode === 'blink') {
    originalOpacity = comparison.originalVisible && !blinkShowingRevised ? 1 : 0;
    revisedOpacity = comparison.revisedVisible && blinkShowingRevised ? 1 : 0;
  } else if (viewMode === 'swipe') {
    originalOpacity = comparison.originalVisible ? 1 : 0;
    revisedOpacity = comparison.revisedVisible ? 1 : 0;
    originalClip = `inset(0 ${(1 - swipePosition) * 100}% 0 0)`;
    revisedClip = `inset(0 0 0 ${swipePosition * 100}%)`;
  }
  const dividerScreenX = pan.x + swipePosition * pageSize.width * zoom;

  return (
    <div
      ref={containerRef}
      className={`pdf-viewport tool-${toolMode}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      <div
        className="pdf-content"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: pageSize.width, height: pageSize.height }}
      >
        <canvas
          ref={originalCanvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: originalOpacity,
            clipPath: originalClip,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: revisedPageSize.width,
            height: revisedPageSize.height,
            transformOrigin: '50% 50%',
            transform: `translate(${alignment.offsetX}px, ${alignment.offsetY}px) rotate(${alignment.rotationDeg}deg) scale(${alignment.scale})`,
            clipPath: revisedClip,
          }}
        >
          <canvas
            ref={revisedCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              opacity: revisedOpacity,
            }}
          />
        </div>

        {pageSize.width > 0 && (
          <svg ref={svgRef} className="overlay-svg" width={pageSize.width} height={pageSize.height} viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}>
            {/* Alignment point pairs */}
            {alignmentPairs.map((pair, i) => (
              <g key={i}>
                <circle cx={pair.originalPoint.x} cy={pair.originalPoint.y} r={vertexR} fill="#f59e0b" stroke="#fff" strokeWidth={strokeW / 2} />
                {(() => {
                  const shown = applyAlignment(pair.revisedPoint, alignment, pivot);
                  return <circle cx={shown.x} cy={shown.y} r={vertexR} fill="#10b981" stroke="#fff" strokeWidth={strokeW / 2} />;
                })()}
              </g>
            ))}
            {alignmentPendingOriginal && (
              <circle cx={alignmentPendingOriginal.x} cy={alignmentPendingOriginal.y} r={vertexR} fill="#f59e0b" stroke="#fff" strokeWidth={strokeW / 2} />
            )}

            {/* Calibration in progress */}
            {calibrationPoints.length > 0 && (
              <g>
                {calibrationPoints.length === 2 && (
                  <line
                    x1={calibrationPoints[0].x}
                    y1={calibrationPoints[0].y}
                    x2={calibrationPoints[1].x}
                    y2={calibrationPoints[1].y}
                    stroke="#f59e0b"
                    strokeWidth={strokeW * 1.5}
                  />
                )}
                {calibrationPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={vertexR * 1.2} fill="#f59e0b" />
                ))}
              </g>
            )}

            {/* Measurement in progress */}
            {measurePoints.length > 0 && (
              <g>
                <polyline
                  points={measurePoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth={strokeW}
                  strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                />
                {measurePoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill="#0ea5e9" />
                ))}
              </g>
            )}

            {/* Finished measurements */}
            {comparison.measurements.map((m) => (
              <g key={m.id}>
                {m.tool === 'distance' ? (
                  <line x1={m.points[0].x} y1={m.points[0].y} x2={m.points[1].x} y2={m.points[1].y} stroke="#0ea5e9" strokeWidth={strokeW} />
                ) : (
                  <polygon
                    points={m.points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="#0ea5e9"
                    fillOpacity={0.12}
                    stroke="#0ea5e9"
                    strokeWidth={strokeW}
                  />
                )}
                <text
                  x={m.points[0].x}
                  y={m.points[0].y - 8 / zoom}
                  fontSize={12 / zoom}
                  fill="#0ea5e9"
                  fontWeight={600}
                >
                  {MEASURE_TOOL_LABELS[m.tool]}: {m.label}
                </text>
              </g>
            ))}

            {/* Markup in progress (cloud multi-point) */}
            {markupPoints.length > 0 && (
              <g>
                <polyline
                  points={markupPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={markupColor}
                  strokeWidth={strokeW}
                  strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                />
                {markupPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill={markupColor} />
                ))}
              </g>
            )}

            {/* Finished markups */}
            {comparison.markups.map((m) => (
              <MarkupShape key={m.id} markup={m} strokeW={strokeW} />
            ))}
          </svg>
        )}
      </div>

      {viewMode === 'swipe' && pageSize.width > 0 && (
        <div className="swipe-divider" style={{ transform: `translateX(${dividerScreenX}px)` }} onMouseDown={handleDividerMouseDown}>
          <div className="swipe-divider-handle">⇔</div>
        </div>
      )}
    </div>
  );
});

export default CompareCanvas;
