import type { CSSProperties } from 'react';
import type { Point } from '../types';
import { dimensionChainGeometry, dimensionStyleFor } from '../lib/dimensionChain';

/**
 * SVG rendering of a dimension markup — a single measure (2 points) or a continued chain
 * (3+ colinear points, AutoCAD DIMCONTINUE style). Values are whole centimeters set close above
 * the dimension line and rotated with it, matching how dimensions are drawn on the plans; a chain's
 * total gets its own overall dimension line offset outside the run, and extension lines tie the
 * measured points to a dimension line that was moved off them.
 * Shared by the takeoff viewer and the revision-compare canvas; the PDF-export rasterizer in
 * lib/drawMarkup.ts mirrors it.
 */
export default function DimensionShape({
  points,
  color,
  text,
  segmentTexts,
  fontScale = 1,
  offset = 0,
  strokeW,
  hitProps,
  dashed = false,
  draggable = false,
}: {
  points: Point[];
  color: string;
  text?: string;
  segmentTexts?: string[];
  fontScale?: number;
  offset?: number;
  strokeW: number;
  hitProps?: Record<string, unknown> & { style?: CSSProperties };
  dashed?: boolean;
  draggable?: boolean;
}) {
  if (points.length < 2) return null;
  const fontSize = strokeW * 6 * fontScale;
  // The line weight scales with the label size too, so a small dimension isn't drawn with a heavy line.
  const lineW = strokeW * fontScale;
  const geo = dimensionChainGeometry(points, dimensionStyleFor(fontSize), offset);
  if (!geo) return null;

  const isChain = points.length > 2;
  const labels = segmentTexts ?? (text && !isChain ? [text] : []);
  const linePoints = geo.line.map((p) => `${p.x},${p.y}`).join(' ');
  const dash = dashed ? `${lineW * 3} ${lineW * 3}` : undefined;

  const label = (key: string, value: string, at: Point) => (
    <text
      key={key}
      x={at.x}
      y={at.y}
      fontSize={fontSize}
      fill={color}
      fontStyle="italic"
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${geo.angleDeg} ${at.x} ${at.y})`}
    >
      {value}
    </text>
  );

  return (
    // The whole dimension is grabbable, not just its line: the values, the ticks and the overall
    // line move it too, and a fat transparent line covers the gaps between them.
    <g {...hitProps}>
      {draggable && <polyline points={linePoints} fill="none" stroke="transparent" strokeWidth={strokeW * 8} />}

      {/* Extension lines back to the measured points, thinner than the dimension line itself */}
      {geo.extensions.map((e, i) => (
        <line key={i} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke={color} strokeWidth={lineW * 0.6} />
      ))}

      <polyline points={linePoints} fill="none" stroke={color} strokeWidth={lineW} strokeDasharray={dash} />
      {geo.ticks.map((t, i) => (
        <line key={i} x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} stroke={color} strokeWidth={lineW} />
      ))}
      {labels.map((value, i) => {
        const seg = geo.segments[i];
        return seg && value ? label(`seg-${i}`, value, seg.labelPos) : null;
      })}

      {/* Overall dimension line for a chain — the run total drawn as its own dimension, not as text */}
      {geo.total && (
        <g>
          <line
            x1={geo.total.line.from.x}
            y1={geo.total.line.from.y}
            x2={geo.total.line.to.x}
            y2={geo.total.line.to.y}
            stroke={color}
            strokeWidth={lineW}
            strokeDasharray={dash}
          />
          {geo.total.ticks.map((t, i) => (
            <line key={i} x1={t.from.x} y1={t.from.y} x2={t.to.x} y2={t.to.y} stroke={color} strokeWidth={lineW} />
          ))}
          {text && label('total', text, geo.total.labelPos)}
        </g>
      )}
    </g>
  );
}
