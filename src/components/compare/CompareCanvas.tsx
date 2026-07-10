import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { v4 as uuid } from 'uuid';
import { loadPdfPlanSource, type PdfPlanSource } from '../../lib/planSource';
import { loadComparePdfBlob } from '../../db/database';
import { useCompareStore } from '../../store/compareStore';
import { useCanvasTransform } from '../../hooks/useCanvasTransform';
import { AREA_KIND_LABELS, IDENTITY_TRANSFORM, MEASURE_TOOL_LABELS } from '../../types/compare';
import type { Point } from '../../types';
import type { AreaKind, ExportRegion, Markup } from '../../types/compare';
import { applyAlignment, invertAlignment, solveAlignment } from '../../lib/alignment';
import { polygonAreaM2, polygonPerimeterM, distancePx, pxToMeters, round, cloudPath } from '../../lib/geometry';

const RENDER_SCALE = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2));

/** Snaps `candidate` so the segment from `from` is purely horizontal or vertical, whichever it's closer to. */
function snapOrtho(from: Point, candidate: Point): Point {
  const dx = candidate.x - from.x;
  const dy = candidate.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: candidate.x, y: from.y } : { x: from.x, y: candidate.y };
}

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
      return <TextMarkupLabel point={a} text={markup.text} color={markup.color} strokeW={strokeW} />;
    default:
      return null;
  }
}

/** Renders a text markup with its background box sized to the text's actual rendered bounds, not an estimate. */
function TextMarkupLabel({ point, text, color, strokeW }: { point: Point; text?: string; color: string; strokeW: number }) {
  const textRef = useRef<SVGTextElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    if (!textRef.current) return;
    const bbox = textRef.current.getBBox();
    setBox({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height });
  }, [text, strokeW, point.x, point.y]);

  const padX = 3 * strokeW;
  const padY = 2 * strokeW;
  return (
    <g>
      {box && (
        <rect
          x={box.x - padX}
          y={box.y - padY}
          width={box.width + padX * 2}
          height={box.height + padY * 2}
          fill="#fff"
          fillOpacity={0.85}
          rx={3 * strokeW}
        />
      )}
      <text ref={textRef} x={point.x} y={point.y} fontSize={strokeW * 6.5} fill={color} fontWeight={600}>
        {text}
      </text>
    </g>
  );
}

function useLayerRender(
  comparisonId: string | undefined,
  layer: string,
  pageNumber: number,
  tint: string,
  useSourceColors: boolean,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  onSize: (size: { width: number; height: number }) => void,
  onNumPages: (n: number) => void
) {
  const [source, setSource] = useState<PdfPlanSource | null>(null);

  useEffect(() => {
    if (!comparisonId || !layer) return;
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
    const handle = useSourceColors ? source.render(canvas, RENDER_SCALE) : source.renderTinted(canvas, RENDER_SCALE, tint);
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, tint, useSourceColors]);
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
  const pendingAreaKind = useCompareStore((s) => s.pendingAreaKind);
  const areaShape = useCompareStore((s) => s.areaShape);
  const orthoSnap = useCompareStore((s) => s.orthoSnap);
  const addMeasurePoint = useCompareStore((s) => s.addMeasurePoint);
  const clearMeasurePoints = useCompareStore((s) => s.clearMeasurePoints);
  const finishMeasurement = useCompareStore((s) => s.finishMeasurement);
  const updateActiveRevisionPageQuiet = useCompareStore((s) => s.updateActiveRevisionPageQuiet);

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

  const setToolMode = useCompareStore((s) => s.setToolMode);
  const exportRegion = useCompareStore((s) => s.exportRegion);
  const setExportRegion = useCompareStore((s) => s.setExportRegion);
  const annotationsVisible = useCompareStore((s) => s.annotationsVisible);

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
  const regionDragStart = useRef<Point | null>(null);
  const [regionDraft, setRegionDraft] = useState<ExportRegion | null>(null);

  const activeRevisionId = comparison?.activeRevisionId ?? '';
  const activeRevision = comparison?.revisions.find((r) => r.id === activeRevisionId);
  const page = comparison?.pages[currentPageKey];
  const revisionPage = page?.revisions[activeRevisionId];
  const originalPageNumber = page?.originalPageNumber ?? currentPageKey;
  const revisedPageNumber = revisionPage?.revisedPageNumber ?? currentPageKey;
  const alignment = revisionPage?.alignment ?? IDENTITY_TRANSFORM;
  // The revised layer's own transform-origin must be its own center, not the original page's —
  // otherwise, whenever the two PDFs have different page dimensions, rotation/scale pivot around
  // the wrong point and the alignment drifts (this was the reported "not quite accurate" bug).
  const pivot: Point = { x: revisedPageSize.width / 2, y: revisedPageSize.height / 2 };
  const metersPerPixel = page?.originalCalibration?.metersPerPixel ?? revisionPage?.revisedCalibration?.metersPerPixel ?? 0;

  useLayerRender(
    comparison?.id,
    'original',
    originalPageNumber,
    comparison?.originalColorTint ?? '#9ca3af',
    comparison?.originalUseSourceColors ?? false,
    originalCanvasRef,
    setPageSize,
    setOriginalNumPages
  );
  useLayerRender(
    comparison?.id,
    activeRevisionId ? `revision:${activeRevisionId}` : '',
    revisedPageNumber,
    activeRevision?.colorTint ?? '#ef4444',
    activeRevision?.useSourceColors ?? false,
    revisedCanvasRef,
    setRevisedPageSize,
    setRevisedNumPages
  );

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

  const finishOpenMeasurement = (pointsOverride?: Point[]) => {
    const points = pointsOverride ?? measurePoints;
    if (!measureTool || points.length < 2 || !metersPerPixel) {
      clearMeasurePoints();
      return;
    }
    let label = '';
    let areaM2: number | undefined;
    if (measureTool === 'distance') {
      const m = pxToMeters(distancePx(points[0], points[1]), metersPerPixel);
      label = `${round(m, 2)} מ'`;
    } else if (measureTool === 'area') {
      areaM2 = round(polygonAreaM2(points, metersPerPixel), 2);
      label = `${areaM2} מ"ר`;
    } else {
      const m = polygonPerimeterM(points, true, metersPerPixel);
      label = `${round(m, 2)} מ'`;
    }
    finishMeasurement({
      id: uuid(),
      tool: measureTool,
      points,
      label,
      areaKind: measureTool === 'area' && pendingAreaKind ? pendingAreaKind : undefined,
      areaM2,
    });
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
      return;
    }
    if (toolMode === 'export-region') {
      const native = screenToNative(e.clientX, e.clientY);
      regionDragStart.current = native;
      setRegionDraft({ x: native.x, y: native.y, width: 0, height: 0 });
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
      updateActiveRevisionPageQuiet(currentPageKey, {
        alignment: { ...alignment, offsetX: alignDrag.current.startOffsetX + dx, offsetY: alignDrag.current.startOffsetY + dy },
      });
      return;
    }
    if (regionDragStart.current) {
      const native = screenToNative(e.clientX, e.clientY);
      const start = regionDragStart.current;
      setRegionDraft({
        x: Math.min(start.x, native.x),
        y: Math.min(start.y, native.y),
        width: Math.abs(native.x - start.x),
        height: Math.abs(native.y - start.y),
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
    if (regionDragStart.current) {
      regionDragStart.current = null;
      if (regionDraft && regionDraft.width > 4 / zoom && regionDraft.height > 4 / zoom) {
        setExportRegion(regionDraft);
      }
      setRegionDraft(null);
      setToolMode('select');
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
      if (measureTool === 'area' && areaShape === 'rectangle') {
        if (measurePoints.length === 0) {
          addMeasurePoint(native);
          return;
        }
        const a = measurePoints[0];
        finishOpenMeasurement([
          { x: a.x, y: a.y },
          { x: native.x, y: a.y },
          { x: native.x, y: native.y },
          { x: a.x, y: native.y },
        ]);
        return;
      }
      const point = orthoSnap && measurePoints.length > 0 ? snapOrtho(measurePoints[measurePoints.length - 1], native) : native;
      if (measurePoints.length >= 3) {
        const first = measurePoints[0];
        const distScreen = Math.hypot(point.x - first.x, point.y - first.y) * zoom;
        if (distScreen < 10) {
          finishOpenMeasurement();
          return;
        }
      }
      addMeasurePoint(point);
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
        const areaTotals: Record<AreaKind, number> = { demolition: 0, construction: 0 };
        let hasAreaMeasurements = false;
        if (annotationsVisible) {
          for (const m of activeRevision?.measurements ?? []) {
            if (m.tool === 'area' && m.areaKind && typeof m.areaM2 === 'number') {
              areaTotals[m.areaKind] += m.areaM2;
              hasAreaMeasurements = true;
            }
          }
        }
        const headerH = (hasAreaMeasurements ? 110 : 70) * mult;
        const fullW = pageSize.width * mult;
        const fullH = pageSize.height * mult;

        // Render the full page (both layers + overlay) at full resolution first, so an export-region
        // crop can just be a sub-rectangle copy of it rather than re-deriving each layer's transform.
        const bodyCanvas = document.createElement('canvas');
        bodyCanvas.width = fullW;
        bodyCanvas.height = fullH;
        const bctx = bodyCanvas.getContext('2d');
        if (!bctx) return null;

        bctx.fillStyle = '#ffffff';
        bctx.fillRect(0, 0, fullW, fullH);
        if (comparison.originalVisible) {
          bctx.globalAlpha = comparison.originalOpacity;
          bctx.drawImage(originalCanvasRef.current, 0, 0, fullW, fullH);
        }
        if (activeRevision?.visible) {
          bctx.globalAlpha = activeRevision.opacity;
          bctx.save();
          const px = pivot.x * mult;
          const py = pivot.y * mult;
          bctx.translate(px, py);
          bctx.translate(alignment.offsetX * mult, alignment.offsetY * mult);
          bctx.rotate((alignment.rotationDeg * Math.PI) / 180);
          bctx.scale(alignment.scale, alignment.scale);
          bctx.translate(-px, -py);
          bctx.drawImage(revisedCanvasRef.current, 0, 0, revisedPageSize.width * mult, revisedPageSize.height * mult);
          bctx.restore();
        }
        bctx.globalAlpha = 1;

        if (svgRef.current) {
          const svgString = new XMLSerializer().serializeToString(svgRef.current);
          const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
          const img = new Image(fullW, fullH);
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to rasterize overlay SVG'));
            img.src = svgUrl;
          });
          bctx.drawImage(img, 0, 0, fullW, fullH);
        }

        // Clamp the selected export region to the page bounds; fall back to the full page.
        const region = exportRegion
          ? {
              x: Math.max(0, Math.min(exportRegion.x, pageSize.width)),
              y: Math.max(0, Math.min(exportRegion.y, pageSize.height)),
              width: Math.max(0, Math.min(exportRegion.width, pageSize.width - Math.max(0, exportRegion.x))),
              height: Math.max(0, Math.min(exportRegion.height, pageSize.height - Math.max(0, exportRegion.y))),
            }
          : { x: 0, y: 0, width: pageSize.width, height: pageSize.height };
        if (region.width <= 0 || region.height <= 0) return null;

        const w = region.width * mult;
        const h = region.height * mult;
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
        ctx.fillStyle = activeRevision?.colorTint ?? '#ef4444';
        ctx.beginPath();
        ctx.arc(w - 250 * mult, 46 * mult, 4 * mult, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#374151';
        ctx.fillText(activeRevision?.label ?? 'מעודכן', w - 260 * mult, 50 * mult);

        if (hasAreaMeasurements) {
          const drawAreaLegend = (kind: AreaKind, y: number) => {
            ctx.fillStyle = comparison.areaKindColors[kind];
            ctx.beginPath();
            ctx.arc(w - 190 * mult, y - 4 * mult, 4 * mult, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#374151';
            ctx.fillText(`${AREA_KIND_LABELS[kind]}: ${round(areaTotals[kind], 2)} מ"ר`, w - 200 * mult, y);
          };
          drawAreaLegend('demolition', 70 * mult);
          drawAreaLegend('construction', 90 * mult);
        }

        ctx.drawImage(bodyCanvas, region.x * mult, region.y * mult, w, h, 0, headerH, w, h);

        return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
      },
    }),
    [comparison, pageSize, revisedPageSize, alignment, pivot, activeRevision, exportRegion, annotationsVisible]
  );

  if (!comparison) return null;

  const strokeW = 2 / zoom;
  const vertexR = 5 / zoom;

  const revisedVisible = activeRevision?.visible ?? false;
  const revisedBaseOpacity = activeRevision?.opacity ?? 0.75;
  let originalOpacity = comparison.originalVisible ? comparison.originalOpacity : 0;
  let revisedOpacity = revisedVisible ? revisedBaseOpacity : 0;
  let originalClip: string | undefined;
  let revisedClip: string | undefined;
  if (viewMode === 'blink') {
    originalOpacity = comparison.originalVisible && !blinkShowingRevised ? 1 : 0;
    revisedOpacity = revisedVisible && blinkShowingRevised ? 1 : 0;
  } else if (viewMode === 'swipe') {
    originalOpacity = comparison.originalVisible ? 1 : 0;
    revisedOpacity = revisedVisible ? 1 : 0;
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
            {annotationsVisible && (activeRevision?.measurements ?? []).map((m) => {
              const color = m.areaKind ? comparison.areaKindColors[m.areaKind] : '#0ea5e9';
              return (
                <g key={m.id}>
                  {m.tool === 'distance' ? (
                    <line x1={m.points[0].x} y1={m.points[0].y} x2={m.points[1].x} y2={m.points[1].y} stroke={color} strokeWidth={strokeW} />
                  ) : (
                    <polygon
                      points={m.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={color}
                      fillOpacity={m.areaKind ? 0.28 : 0.12}
                      stroke={color}
                      strokeWidth={m.tool === 'area' ? strokeW * 0.4 : strokeW}
                    />
                  )}
                  {m.tool !== 'area' && (
                    <text x={m.points[0].x} y={m.points[0].y - 8 / zoom} fontSize={12 / zoom} fill={color} fontWeight={600}>
                      {MEASURE_TOOL_LABELS[m.tool]}: {m.label}
                    </text>
                  )}
                </g>
              );
            })}

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
            {annotationsVisible && (activeRevision?.markups ?? []).map((m) => (
              <MarkupShape key={m.id} markup={m} strokeW={strokeW} />
            ))}
          </svg>
        )}

        {/* Export region selection — kept in a separate svg so it's never rasterized into the exported PDF. */}
        {pageSize.width > 0 && (exportRegion || regionDraft) && (
          <svg className="overlay-svg region-select-svg" width={pageSize.width} height={pageSize.height} viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}>
            {exportRegion && !regionDraft && (
              <rect
                x={exportRegion.x}
                y={exportRegion.y}
                width={exportRegion.width}
                height={exportRegion.height}
                fill="none"
                stroke="#0f172a"
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                strokeWidth={strokeW}
              />
            )}
            {regionDraft && (
              <rect
                x={regionDraft.x}
                y={regionDraft.y}
                width={regionDraft.width}
                height={regionDraft.height}
                fill="#0f172a"
                fillOpacity={0.08}
                stroke="#0f172a"
                strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                strokeWidth={strokeW}
              />
            )}
          </svg>
        )}
      </div>

      {toolMode === 'export-region' && !regionDraft && (
        <div className="export-region-hint">גרור על התוכנית כדי לבחור את האזור לייצוא</div>
      )}

      {viewMode === 'swipe' && pageSize.width > 0 && (
        <div className="swipe-divider" style={{ transform: `translateX(${dividerScreenX}px)` }} onMouseDown={handleDividerMouseDown}>
          <div className="swipe-divider-handle">⇔</div>
        </div>
      )}
    </div>
  );
});

export default CompareCanvas;
