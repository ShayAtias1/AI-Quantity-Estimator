import { useCompareStore } from '../../store/compareStore';
import { AREA_KIND_LABELS, type AreaKind } from '../../types/compare';
import { round } from '../../lib/geometry';

const AREA_KINDS: AreaKind[] = ['demolition', 'construction'];

export default function AreaSummaryPanel() {
  const comparison = useCompareStore((s) => s.comparison);
  const setAreaKindColor = useCompareStore((s) => s.setAreaKindColor);

  if (!comparison) return null;
  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);

  const areaMeasurements = (activeRevision?.measurements ?? []).filter((m) => m.tool === 'area' && m.areaKind && typeof m.areaM2 === 'number');
  if (areaMeasurements.length === 0) return null;

  const totals: Record<AreaKind, number> = { demolition: 0, construction: 0 };
  const counts: Record<AreaKind, number> = { demolition: 0, construction: 0 };
  for (const m of areaMeasurements) {
    totals[m.areaKind!] += m.areaM2!;
    counts[m.areaKind!] += 1;
  }

  return (
    <div className="area-summary">
      <h4>סיכום שטחים</h4>
      {AREA_KINDS.map((k) => (
        <div key={k} className="area-summary-row">
          <div className="area-summary-row-header">
            <input type="color" value={comparison.areaKindColors[k]} onChange={(e) => setAreaKindColor(k, e.target.value)} title="שנה צבע" />
            <span className="area-summary-label">{AREA_KIND_LABELS[k]}</span>
            <span className="area-summary-count">{counts[k]} סימונים</span>
          </div>
          <span className="area-summary-total">{round(totals[k], 2)} מ"ר</span>
        </div>
      ))}
    </div>
  );
}
