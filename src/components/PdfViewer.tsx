import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { v4 as uuid } from 'uuid';
import { loadPdfPlanSource, type PdfPlanSource } from '../lib/planSource';
import { useAppStore } from '../store/appStore';
import type { Point } from '../types';
import { MEASURE_TOOL_LABELS } from '../types';
import { distancePx, nearestPointIndex, polygonAreaM2, polygonAreaPx, polygonPerimeterM, pxToMeters, round, snapOrtho } from '../lib/geometry';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { loadPdfBlob } from '../db/database';

const VERTEX_HIT_RADIUS_SCREEN = 9;
const RENDER_SCALE = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * 2));

function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function PdfViewer() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const setNumPages = useAppStore((s) => s.setNumPages);
  const toolMode = useAppStore((s) => s.toolMode);
  const roomsVisible = useAppStore((s) => s.roomsVisible);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const calibrationPoints = useAppStore((s) => s.calibrationPoints);
  const addCalibrationPoint = useAppStore((s) => s.addCalibrationPoint);
  const drawingPoints = useAppStore((s) => s.drawingPoints);
  const addDrawingPoint = useAppStore((s) => s.addDrawingPoint);
  const finishDrawing = useAppStore((s) => s.finishDrawing);
  const finishRectangle = useAppStore((s) => s.finishRectangle);
  const clearDrawingPoints = useAppStore((s) => s.clearDrawingPoints);
  const moveRoomPoint = useAppStore((s) => s.moveRoomPoint);
  const deleteRoomPoint = useAppStore((s) => s.deleteRoomPoint);
  const persist = useAppStore((s) => s.persist);
  const measureTool = useAppStore((s) => s.measureTool);
  const measurePoints = useAppStore((s) => s.measurePoints);
  const areaShape = useAppStore((s) => s.areaShape);
  const orthoSnap = useAppStore((s) => s.orthoSnap);
  const addMeasurePoint = useAppStore((s) => s.addMeasurePoint);
  const clearMeasurePoints = useAppStore((s) => s.clearMeasurePoints);
  const finishMeasurement = useAppStore((s) => s.finishMeasurement);

  const { containerRef, zoom, pan, screenToNative, handleWheel, fitToContainer, beginPanDrag, updatePanDrag, endPanDrag } =
    useCanvasTransform();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [planSource, setPlanSource] = useState<PdfPlanSource | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const vertexDrag = useRef<{ pointIndex: number } | null>(null);
  const spaceHeld = useRef(false);
  const isPanning = useRef(false);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Load PDF page
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    setLoadError(null);
    loadPdfPlanSource(project.id, () => loadPdfBlob(project.id), currentPage)
      .then(({ source, numPages }) => {
        if (cancelled) return;
        setNumPages(numPages);
        setPlanSource(source);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'שגיאה בטעינת ה-PDF');
      });
    return () => {
      cancelled = true;
    };
  }, [project, currentPage, setNumPages]);

  // Render page to canvas whenever the plan source changes
  useEffect(() => {
    if (!planSource || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const { width, height } = planSource.getNativeSize();
    setPageSize({ width, height });
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const handle = planSource.render(canvas, RENDER_SCALE);
    return () => {
      handle.cancel();
    };
  }, [planSource]);

  // Fit to container on first load / page size change
  useEffect(() => {
    if (!pageSize.width) return;
    fitToContainer(pageSize.width, pageSize.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const room = project?.rooms.find((r) => r.id === selectedRoomId) ?? null;
  const metersPerPixel = project?.pages[currentPage]?.calibration?.metersPerPixel ?? 0;

  useEffect(() => {
    if (drawingPoints.length === 0) setHoverPoint(null);
  }, [drawingPoints.length]);

  const finishOpenMeasurement = (pointsOverride?: Point[]) => {
    const points = pointsOverride ?? measurePoints;
    if (!measureTool || points.length < 2 || !metersPerPixel) {
      clearMeasurePoints();
      return;
    }
    let label = '';
    if (measureTool === 'distance') {
      const m = pxToMeters(distancePx(points[0], points[1]), metersPerPixel);
      label = `${round(m, 2)} מ'`;
    } else if (measureTool === 'area') {
      const m2 = polygonAreaM2(points, metersPerPixel);
      label = `${round(m2, 2)} מ"ר`;
    } else {
      const m = polygonPerimeterM(points, true, metersPerPixel);
      label = `${round(m, 2)} מ'`;
    }
    finishMeasurement({ id: uuid(), pageNumber: currentPage, tool: measureTool, points, label });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = true;
      if (e.key === 'Escape') {
        clearDrawingPoints();
        clearMeasurePoints();
      }
      if (e.key === 'Enter' && drawingPoints.length >= 3) {
        finishDrawing();
      }
      if (e.key === 'Enter' && measureTool && measureTool !== 'distance' && measurePoints.length >= 3) {
        finishOpenMeasurement();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearDrawingPoints, drawingPoints.length, finishDrawing, measureTool, measurePoints]);

  // Auto-finish distance measurement once 2 points are placed.
  useEffect(() => {
    if (measureTool === 'distance' && measurePoints.length === 2) {
      finishOpenMeasurement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurePoints, measureTool]);

  const handleMouseDown = (e: MouseEvent) => {
    const isPanGesture = toolMode === 'pan' || e.button === 1 || spaceHeld.current;
    if (isPanGesture) {
      isPanning.current = true;
      beginPanDrag(e.clientX, e.clientY);
      return;
    }
    if (toolMode === 'select' && room) {
      const native = screenToNative(e.clientX, e.clientY);
      const idx = nearestPointIndex(room.points, native, VERTEX_HIT_RADIUS_SCREEN / zoom);
      if (idx >= 0) {
        vertexDrag.current = { pointIndex: idx };
        return;
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning.current && updatePanDrag(e.clientX, e.clientY)) {
      return;
    }
    if (vertexDrag.current && room) {
      const native = screenToNative(e.clientX, e.clientY);
      moveRoomPoint(room.id, vertexDrag.current.pointIndex, native);
      return;
    }
    if (toolMode === 'draw-rect' && drawingPoints.length === 1) {
      setHoverPoint(screenToNative(e.clientX, e.clientY));
    }
  };

  const handleMouseUp = () => {
    if (isPanning.current) {
      isPanning.current = false;
      endPanDrag();
    }
    if (vertexDrag.current) {
      vertexDrag.current = null;
      void persist();
    }
  };

  const handleDoubleClick = (e: MouseEvent) => {
    if (toolMode !== 'select' || !room) return;
    const native = screenToNative(e.clientX, e.clientY);
    const idx = nearestPointIndex(room.points, native, VERTEX_HIT_RADIUS_SCREEN / zoom);
    if (idx >= 0) {
      e.stopPropagation();
      deleteRoomPoint(room.id, idx);
    }
  };

  const handleClick = (e: MouseEvent) => {
    if (isPanning.current || vertexDrag.current) return;
    const native = screenToNative(e.clientX, e.clientY);

    if (toolMode === 'calibrate') {
      if (calibrationPoints.length < 2) addCalibrationPoint(native);
      return;
    }

    if (toolMode === 'draw') {
      if (drawingPoints.length >= 3) {
        const first = drawingPoints[0];
        const distScreen = Math.hypot(native.x - first.x, native.y - first.y) * zoom;
        if (distScreen < 10) {
          finishDrawing();
          return;
        }
      }
      addDrawingPoint(native);
      return;
    }

    if (toolMode === 'draw-rect') {
      if (drawingPoints.length === 0) {
        addDrawingPoint(native);
      } else {
        finishRectangle(drawingPoints[0], native);
        setHoverPoint(null);
      }
      return;
    }

    if (toolMode === 'measure' && measureTool) {
      if (measureTool === 'distance') {
        const point = orthoSnap && measurePoints.length > 0 ? snapOrtho(measurePoints[0], native) : native;
        addMeasurePoint(point);
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

    if (toolMode === 'select' && project) {
      const hit = [...project.rooms].reverse().find((r) => r.pageNumber === currentPage && polygonAreaPx(r.points) > 0 && pointInPolygon(native, r.points));
      setSelectedRoomId(hit ? hit.id : null);
    }
  };

  if (!project) return null;

  const strokeW = 2 / zoom;
  const vertexR = 5 / zoom;

  return (
    <div
      ref={containerRef}
      className={`pdf-viewport tool-${toolMode}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      {loadError && <div className="viewer-error">{loadError}</div>}
      <div
        className="pdf-content"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: pageSize.width, height: pageSize.height }}
      >
        <canvas ref={canvasRef} />
        {pageSize.width > 0 && (
          <svg
            className="overlay-svg"
            width={pageSize.width}
            height={pageSize.height}
            viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
          >
            {roomsVisible &&
              project.rooms
                .filter((r) => r.pageNumber === currentPage)
                .map((r) => {
                const isSelected = r.id === selectedRoomId;
                const pts = r.points.map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <g key={r.id}>
                    <polygon
                      points={pts}
                      fill={r.color}
                      fillOpacity={isSelected ? 0.28 : 0.15}
                      stroke={r.color}
                      strokeWidth={isSelected ? strokeW * 1.5 : strokeW}
                    />
                    {isSelected &&
                      r.points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill="#fff" stroke={r.color} strokeWidth={strokeW} />
                      ))}
                    {isSelected && (
                      <text x={r.points[0]?.x ?? 0} y={(r.points[0]?.y ?? 0) - 8 / zoom} fontSize={13 / zoom} fill={r.color} fontWeight={600}>
                        {r.name}
                      </text>
                    )}
                  </g>
                );
              })}

            {/* In-progress polygon drawing */}
            {toolMode === 'draw' && drawingPoints.length > 0 && (
              <g>
                <polyline
                  points={drawingPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={strokeW}
                  strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                />
                {drawingPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={vertexR} fill="#ef4444" />
                ))}
              </g>
            )}

            {/* In-progress rectangle drawing */}
            {toolMode === 'draw-rect' && drawingPoints.length > 0 && (
              <g>
                {hoverPoint && (
                  <rect
                    x={Math.min(drawingPoints[0].x, hoverPoint.x)}
                    y={Math.min(drawingPoints[0].y, hoverPoint.y)}
                    width={Math.abs(hoverPoint.x - drawingPoints[0].x)}
                    height={Math.abs(hoverPoint.y - drawingPoints[0].y)}
                    fill="#ef4444"
                    fillOpacity={0.12}
                    stroke="#ef4444"
                    strokeWidth={strokeW}
                    strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                  />
                )}
                <circle cx={drawingPoints[0].x} cy={drawingPoints[0].y} r={vertexR} fill="#ef4444" />
              </g>
            )}

            {/* Calibration line */}
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

            {/* Finished measurements on this page */}
            {(project.measurements ?? [])
              .filter((m) => m.pageNumber === currentPage)
              .map((m) => (
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
                  <text x={m.points[0].x} y={m.points[0].y - 8 / zoom} fontSize={12 / zoom} fill="#0ea5e9" fontWeight={600}>
                    {MEASURE_TOOL_LABELS[m.tool]}: {m.label}
                  </text>
                </g>
              ))}
          </svg>
        )}
      </div>
    </div>
  );
}
