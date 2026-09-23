import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { roomProfileLabel } from '../lib/roomProfiles';
import Icon from './Icon';

/**
 * Auto detection is a *suggestion* workflow: detect → review → accept/reject.
 * Nothing here writes to the project until the user accepts a candidate, so a detection run alone
 * never touches quantities, autosave or the undo history.
 *
 * Split in two so the room list can place them differently: the launcher is a secondary action at
 * the bottom of the tab, while `DetectionReviewPanel` takes the top of the tab — and only while
 * there is something to review.
 */
export default function AutoDetectPanel() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const detecting = useAppStore((s) => s.detecting);
  const detectionProgress = useAppStore((s) => s.detectionProgress);
  const detectionLabel = useAppStore((s) => s.detectionLabel);
  const detectionSummary = useAppStore((s) => s.detectionSummary);
  const detectRooms = useAppStore((s) => s.detectRooms);
  const clearDetectionSummary = useAppStore((s) => s.clearDetectionSummary);
  const candidates = useAppStore((s) => s.detectionCandidates);
  const autoCalculateQuantities = useAppStore((s) => s.autoCalculateQuantities);
  const [message, setMessage] = useState<string | null>(null);

  if (!project) return null;

  const pageCandidates = candidates.filter((c) => c.pageNumber === currentPage);
  // Detected rooms that still have no work items. Accepting a classified candidate now fills them
  // in straight away, so this is mainly for rooms accepted without a type and for projects saved
  // before the review flow existed.
  const pendingCalc = project.rooms.filter(
    (r) => r.pageNumber === currentPage && r.detectedType && r.workItems.length === 0
  ).length;
  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="auto-detect-panel">
      <span className="section-label">זיהוי אוטומטי</span>
      <p className="auto-detect-hint">
        הזיהוי מציע אזורים בלבד — שום חדר לא נוסף לפרויקט ולא נכנס לכמויות עד שתאשר אותו.
      </p>

      <div className="auto-detect-actions">
        <button className="btn-primary full-width" onClick={() => void detectRooms()} disabled={detecting}>
          <Icon name="scan" />
          {detecting ? 'מזהה…' : pageCandidates.length > 0 ? 'זיהוי מחדש' : 'זיהוי חדרים'}
        </button>
        {/* Only shown while detected rooms are actually waiting for their work items. */}
        {pendingCalc > 0 && (
          <button
            className="btn-secondary full-width"
            onClick={() => {
              const n = autoCalculateQuantities();
              flash(n > 0 ? `חושבו כמויות ל-${n} חדרים.` : 'אין חדרים שזוהו הממתינים לחישוב בעמוד זה.');
            }}
            disabled={detecting}
            title={`${pendingCalc} חדרים ממתינים לחישוב`}
          >
            <Icon name="table" />
            חישוב כמויות אוטומטי ({pendingCalc})
          </button>
        )}
      </div>

      {detecting && (
        <div className="detect-progress">
          <div className="detect-progress-bar">
            <div className="detect-progress-fill" style={{ width: `${Math.round(detectionProgress * 100)}%` }} />
          </div>
          <span className="detect-progress-label">{detectionLabel}</span>
        </div>
      )}

      {!detecting && detectionSummary && detectionSummary.total === 0 && (
        <div className="detect-summary">
          <button className="detect-summary-close icon-btn" onClick={clearDetectionSummary} title="סגור">
            <Icon name="close" size={13} />
          </button>
          <div className="detect-summary-headline">לא זוהו חדרים בעמוד זה</div>
          <p className="auto-detect-hint">נסה לוודא שהתוכנית ברורה, או לסמן את החדרים ידנית.</p>
        </div>
      )}

      {message && <div className="detect-toast">{message}</div>}
    </div>
  );
}

/**
 * The review step: shown at the top of the rooms tab whenever a detection run left suggestions on
 * the current page, and gone as soon as they are all accepted or rejected.
 */
export function DetectionReviewPanel() {
  const currentPage = useAppStore((s) => s.currentPage);
  const candidates = useAppStore((s) => s.detectionCandidates);
  const acceptCandidate = useAppStore((s) => s.acceptDetectionCandidate);
  const acceptAll = useAppStore((s) => s.acceptAllDetectionCandidates);
  const rejectCandidate = useAppStore((s) => s.rejectDetectionCandidate);
  const clearCandidates = useAppStore((s) => s.clearDetectionCandidates);
  const activeApartmentNumber = useAppStore((s) => s.activeApartmentNumber);
  const [message, setMessage] = useState<string | null>(null);

  const pageCandidates = candidates.filter((c) => c.pageNumber === currentPage);
  if (pageCandidates.length === 0) return null;

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="detect-review-panel">
      <div className="detect-review">
        <div className="detect-review-head">
          <strong>{pageCandidates.length} הצעות לבדיקה</strong>
          <div className="detect-review-bulk">
            <button
              className="btn-primary small"
              onClick={() => {
                const n = acceptAll();
                if (n > 0) flash(`${n} חדרים נוספו לפרויקט.`);
              }}
            >
              אשר הכל
            </button>
            <button
              className="btn-secondary small"
              onClick={() => {
                clearCandidates();
                flash('ההצעות נדחו. שום דבר לא נוסף לפרויקט.');
              }}
            >
              דחה הכל
            </button>
          </div>
        </div>
        <p className="muted">
          חדרים שיאושרו ישויכו ל{activeApartmentNumber ? `דירה ${activeApartmentNumber}` : 'לא לדירה (ללא שיוך)'}.
        </p>
        <ul className="detect-candidate-list">
          {pageCandidates.map((c) => (
            <li key={c.id}>
              {/* Plain language on purpose: the engine reports whether it recognised a room name,
                  which is not a probability, so no percentage is shown. */}
              <span className="detect-candidate-label">
                {c.roomTypeKey ? (
                  <span className="cal-ok">
                    <Icon name="check" size={12} /> זוהה: {roomProfileLabel(c.roomTypeKey)}
                  </span>
                ) : (
                  <span className="cal-missing">
                    <Icon name="alert" size={12} /> סוג החדר לא זוהה — יש לבדוק ידנית
                  </span>
                )}
                {c.suggestedName && <span className="muted"> · {c.suggestedName}</span>}
              </span>
              <span className="list-item-actions">
                <button className="btn-secondary small" onClick={() => acceptCandidate(c.id)} title="הוסף כחדר בפרויקט">
                  אשר
                </button>
                <button className="icon-btn danger" onClick={() => rejectCandidate(c.id)} title="דחה את ההצעה">
                  <Icon name="close" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="auto-detect-hint">גבול לא מדויק? אשר את החדר וערוך את הנקודות שלו ככל חדר אחר.</p>
      </div>
      {message && <div className="detect-toast">{message}</div>}
    </div>
  );
}
