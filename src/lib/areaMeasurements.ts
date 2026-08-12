export interface AreaMeasurementLike {
  id: string;
  tool: string;
  areaKind?: 'demolition' | 'construction';
  areaM2?: number;
}

const KIND_ORDER: Array<'demolition' | 'construction'> = ['demolition', 'construction'];

/**
 * Stable sequential numbering (1-based) for kind-tagged area measurements, grouped
 * demolition-then-construction — shared by the on-canvas wall label and the exported
 * table so the numbers always line up between the plan and the PDF. Generic over both
 * apps' Measurement types (quantity-takeoff and Revision Compare), which only need to
 * structurally match AreaMeasurementLike.
 */
export function numberAreaMeasurements<T extends AreaMeasurementLike>(measurements: T[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const kind of KIND_ORDER) {
    for (const m of measurements) {
      if (m.tool === 'area' && m.areaKind === kind && typeof m.areaM2 === 'number') {
        n += 1;
        map.set(m.id, n);
      }
    }
  }
  return map;
}
