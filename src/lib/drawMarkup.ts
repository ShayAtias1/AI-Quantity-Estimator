import type { Markup } from '../types';
import { arrowHeadPoints, cloudPath } from './geometry';

const FONT = "'Segoe UI', sans-serif";

/**
 * Rasterizes one markup onto a 2D canvas context, matching the on-screen SVG rendering
 * (see MarkupShape in PdfViewer.tsx / CompareCanvas.tsx). `offsetX`/`offsetY` are in native
 * page coordinates (subtracted before scaling) — used when the canvas only covers a cropped region.
 */
export function drawMarkupOnCanvas(ctx: CanvasRenderingContext2D, markup: Markup, mult: number, offsetX: number, offsetY: number) {
  const tx = (x: number) => (x - offsetX) * mult;
  const ty = (y: number) => (y - offsetY) * mult;
  const pts = markup.points.map((p) => ({ x: tx(p.x), y: ty(p.y) }));
  const strokeW = 2 * mult;
  const fontScale = markup.fontScale ?? 1;

  ctx.save();
  // The app's page (and therefore the on-screen overlay SVG) is dir="rtl", so text is laid out and
  // anchored right-to-left there — the canvas has to match, or labels land on the wrong side of their point.
  ctx.direction = 'rtl';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (markup.tool) {
    case 'arrow': {
      const [a, b] = pts;
      ctx.strokeStyle = markup.color;
      ctx.lineWidth = strokeW * 1.3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const head = arrowHeadPoints(a, b, strokeW * 8)
        .split(' ')
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x, y };
        });
      ctx.fillStyle = markup.color;
      ctx.beginPath();
      head.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rectangle': {
      const [a, b] = pts;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.fillStyle = markup.color;
      ctx.globalAlpha = 0.1;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = markup.color;
      ctx.lineWidth = strokeW * 1.3;
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'dimension': {
      const [a, b] = pts;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const tickLen = strokeW * 6;
      const nx = Math.cos(angle + Math.PI / 2) * tickLen;
      const ny = Math.sin(angle + Math.PI / 2) * tickLen;
      ctx.strokeStyle = markup.color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x - nx, a.y - ny);
      ctx.lineTo(a.x + nx, a.y + ny);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x - nx, b.y - ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
      if (markup.text) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        ctx.font = `bold ${strokeW * 6 * fontScale}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = markup.color;
        ctx.fillText(markup.text, midX, midY - tickLen - strokeW * 1.5);
      }
      break;
    }
    case 'cloud': {
      const path = new Path2D(cloudPath(pts, 14 * strokeW));
      ctx.fillStyle = markup.color;
      ctx.globalAlpha = 0.08;
      ctx.fill(path);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = markup.color;
      ctx.lineWidth = strokeW * 1.3;
      ctx.stroke(path);
      break;
    }
    case 'text': {
      const [a] = pts;
      if (markup.text) {
        ctx.font = `bold ${strokeW * 6.5 * fontScale}px ${FONT}`;
        // SVG's default text-anchor="start" under dir="rtl" puts the anchor at the text's right edge.
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = markup.color;
        ctx.fillText(markup.text, a.x, a.y);
      }
      break;
    }
  }

  ctx.restore();
}
