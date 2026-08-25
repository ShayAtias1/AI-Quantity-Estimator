import type { CSSProperties } from 'react';
import type { Point } from '../types';

/**
 * SVG rendering of a text-note markup: multi-line (one tspan per line), optionally rotated, in the
 * same italic face the dimension values use. Shared by the takeoff viewer and the revision-compare
 * canvas; the PDF-export rasterizer in lib/drawMarkup.ts mirrors it.
 */
export default function TextNoteShape({
  point,
  text,
  color,
  fontScale = 1,
  rotationDeg = 0,
  strokeW,
  hitProps,
}: {
  point: Point;
  text?: string;
  color: string;
  fontScale?: number;
  rotationDeg?: number;
  strokeW: number;
  hitProps?: Record<string, unknown> & { style?: CSSProperties };
}) {
  if (!text) return null;
  const fontSize = strokeW * 6.5 * fontScale;
  const lines = text.split('\n');
  return (
    <text
      x={point.x}
      y={point.y}
      fontSize={fontSize}
      fill={color}
      fontStyle="italic"
      transform={rotationDeg ? `rotate(${rotationDeg} ${point.x} ${point.y})` : undefined}
      {...hitProps}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={point.x} dy={i === 0 ? 0 : fontSize * 1.25}>
          {line || ' '}
        </tspan>
      ))}
    </text>
  );
}
