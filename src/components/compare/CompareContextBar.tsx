import { useEffect, useState } from 'react';
import { alignmentStatusFor, compareScaleFor, revisionPageOf, useCompareStore } from '../../store/compareStore';
import { round } from '../../lib/geometry';
import Icon from '../Icon';

const ALIGNMENT_LABELS: Record<string, string> = {
  identity: 'לא מיושר',
  manual: 'הותאם ידנית',
  points: 'לפי נקודות ייחוס',
};

/**
 * The state of the source page on screen, pinned above the sidebar tabs — the Compare counterpart
 * of the takeoff workspace's page-status strip, and present in every tab for the same reason.
 *
 * It answers three questions about the *current page and active revision*: which revised page it is
 * compared against, whether that pair carries a scale that can produce quantities, and how it was
 * aligned. Which revision is active is deliberately not repeated here — the top bar carries that.
 *
 * Normal states stay quiet; only a page that cannot be measured, or a mapping that points at a page
 * the revision does not have, raises its voice.
 */
export default function CompareContextBar() {
  const comparison = useCompareStore((s) => s.comparison);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const revisedNumPages = useCompareStore((s) => s.revisedNumPages);
  const setRevisedPageNumber = useCompareStore((s) => s.setRevisedPageNumber);
  const startCalibration = useCompareStore((s) => s.startCalibration);
  const toolMode = useCompareStore((s) => s.toolMode);
  const calibrationLayer = useCompareStore((s) => s.calibrationLayer);

  const revisionPage = revisionPageOf(comparison, currentPageKey);
  const mappedPage = revisionPage?.revisedPageNumber ?? currentPageKey;
  // Draft text of the mapping box, re-synced whenever the mapping changes some other way.
  const [pageDraft, setPageDraft] = useState(String(mappedPage));
  useEffect(() => {
    setPageDraft(String(mappedPage));
  }, [mappedPage, currentPageKey, comparison?.activeRevisionId]);

  if (!comparison) return null;
  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId);
  const scale = compareScaleFor(comparison, currentPageKey);
  const alignmentStatus = alignmentStatusFor(comparison, currentPageKey);
  const revisedPageMissing = !!activeRevision && mappedPage > revisedNumPages;
  const calibrated = scale.state === 'calibrated';

  const commitMapping = () => {
    const parsed = parseInt(pageDraft, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPageDraft(String(mappedPage));
      return;
    }
    setPageDraft(String(parsed));
    if (parsed !== mappedPage) setRevisedPageNumber(currentPageKey, parsed);
  };

  const scaleText = calibrated
    ? `מכויל · ${round(scale.metersPerPixel * 100, 4)} ס"מ/פיקסל · לפי ${scale.source === 'original' ? 'המקור' : activeRevision?.label ?? 'הגרסה'}`
    : scale.state === 'ambiguous'
      ? 'כיול ישן שאינו ניתן לפענוח — כייל מחדש'
      : 'לא כויל — לא ניתן למדוד כמויות';

  return (
    <div className="compare-context">
      {/* Which revised page this source page is compared against. */}
      <div className={`compare-context-line ${revisedPageMissing ? 'is-warning' : ''}`}>
        <span className="compare-context-label">עמוד {currentPageKey}</span>
        <Icon name="link" size={13} />
        <span className="muted">בגרסה</span>
        <input
          className="page-jump-input"
          type="number"
          min={1}
          value={pageDraft}
          disabled={!activeRevision}
          onChange={(e) => setPageDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={commitMapping}
          title="איזה עמוד בתוכנית המעודכנת מוצג מול עמוד המקור הזה"
        />
        <span className="muted">/ {revisedNumPages}</span>
        {revisedPageMissing && (
          <span className="cal-missing">
            <Icon name="alert" size={13} />
            אינו קיים בגרסה
          </span>
        )}
      </div>

      {/* Scale: the same quiet/attention treatment as the takeoff page-status strip. */}
      <div className={`page-status ${calibrated ? '' : 'uncalibrated'}`}>
        <div className="page-status-line">
          <span className={`page-status-state ${calibrated ? 'muted' : 'cal-missing'}`} title={scaleText}>
            {!calibrated && <Icon name="alert" size={13} />}
            {scaleText}
          </span>
          <button
            className={`${calibrated ? 'btn-ghost' : 'btn-primary'} small ${toolMode === 'calibrate' && calibrationLayer === 'original' ? 'active' : ''}`}
            onClick={() => startCalibration('original')}
            title="מדוד מרחק ידוע על תוכנית המקור"
          >
            {calibrated ? 'כייל מחדש' : 'כייל עכשיו'}
          </button>
          <button
            className={`btn-ghost small ${toolMode === 'calibrate' && calibrationLayer === 'revised' ? 'active' : ''}`}
            onClick={() => startCalibration('revised')}
            disabled={!activeRevision}
            title="מדוד מרחק ידוע על התוכנית המעודכנת — נשמר בקואורדינטות שלה, כך שהוא נשאר נכון גם אחרי שינוי יישור"
          >
            לפי הגרסה
          </button>
        </div>
      </div>

      {/* Alignment belongs to this page/revision pair, and says so. */}
      <div className="compare-context-line">
        <span className="muted">יישור</span>
        <span className={`status-chip ${alignmentStatus}`}>{ALIGNMENT_LABELS[alignmentStatus]}</span>
        <span className="muted compare-context-scope">
          עמוד {currentPageKey} · {activeRevision?.label ?? '—'}
        </span>
      </div>
    </div>
  );
}
