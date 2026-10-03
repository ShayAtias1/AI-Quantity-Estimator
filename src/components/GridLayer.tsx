import type { GridGeometry } from '../lib/grid';

const MINOR_ID = 'bc-grid-minor';
const MAJOR_ID = 'bc-grid-major';
const GRID_COLOR = '#2b7bd6';

/** Lines on the tile's four edges: neighbouring tiles' half-strokes add up to one full line. */
const tilePath = (w: number) => `M0 0H${w}M0 0V${w}M${w} 0V${w}M0 ${w}H${w}`;

/**
 * The measurement grid, as SVG pattern fills in the overlay's native-pixel space (origin at the
 * page's top-left corner). Two fills — fine lines and stronger major lines — keep the element count
 * constant however large the page is. Stroke width is 1 / zoom so lines stay about one screen pixel
 * wide at any zoom. Purely visual: no pointer events, no data.
 */
export default function GridLayer({
  grid,
  width,
  height,
  zoom,
  opacity,
}: {
  grid: GridGeometry;
  width: number;
  height: number;
  zoom: number;
  opacity: number;
}) {
  const hair = 1 / (zoom > 0 ? zoom : 1);
  return (
    <g className="grid-layer" pointerEvents="none">
      <defs>
        <pattern id={MINOR_ID} width={grid.minorPx} height={grid.minorPx} patternUnits="userSpaceOnUse">
          <path d={tilePath(grid.minorPx)} fill="none" stroke={GRID_COLOR} strokeWidth={hair} strokeOpacity={opacity * 0.55} />
        </pattern>
        <pattern id={MAJOR_ID} width={grid.majorPx} height={grid.majorPx} patternUnits="userSpaceOnUse">
          <path d={tilePath(grid.majorPx)} fill="none" stroke={GRID_COLOR} strokeWidth={hair * 1.6} strokeOpacity={opacity} />
        </pattern>
      </defs>
      {grid.showMinor && <rect width={width} height={height} fill={`url(#${MINOR_ID})`} />}
      {grid.showMajor && <rect width={width} height={height} fill={`url(#${MAJOR_ID})`} />}
    </g>
  );
}
