import { useState } from 'react';
import { useAppStore } from '../store/appStore';

export default function AutoDetectPanel() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const detecting = useAppStore((s) => s.detecting);
  const detectionProgress = useAppStore((s) => s.detectionProgress);
  const detectionLabel = useAppStore((s) => s.detectionLabel);
  const detectionSummary = useAppStore((s) => s.detectionSummary);
  const detectRooms = useAppStore((s) => s.detectRooms);
  const autoCalculateQuantities = useAppStore((s) => s.autoCalculateQuantities);
  const clearDetectionSummary = useAppStore((s) => s.clearDetectionSummary);
  const [calcMessage, setCalcMessage] = useState<string | null>(null);

  if (!project) return null;

  const detectedOnPage = project.rooms.filter((r) => r.pageNumber === currentPage && r.detectedType).length;
  const pendingCalc = project.rooms.filter(
    (r) => r.pageNumber === currentPage && r.detectedType && r.workItems.length === 0
  ).length;

  const handleAutoCalc = () => {
    const n = autoCalculateQuantities();
    setCalcMessage(n > 0 ? `חושבו כמויות ל-${n} חדרים.` : 'אין חדרים שזוהו הממתינים לחישוב בעמוד זה.');
    window.setTimeout(() => setCalcMessage(null), 4000);
  };

  return (
    <div className="auto-detect-panel">
      <h4>זיהוי אוטומטי</h4>
      <p className="auto-detect-hint">הזיהוי אינו רץ אוטומטית — הפעל אותו ידנית, ולאחר מכן ניתן לתקן כל חדר.</p>

      <div className="auto-detect-actions">
        <button className="btn-primary full-width" onClick={() => void detectRooms()} disabled={detecting}>
          🤖 {detecting ? 'מזהה…' : 'זיהוי חדרים'}
        </button>
        <button
          className="btn-secondary full-width"
          onClick={handleAutoCalc}
          disabled={detecting || pendingCalc === 0}
          title={pendingCalc === 0 ? 'אין חדרים שזוהו הממתינים לחישוב' : `${pendingCalc} חדרים ממתינים לחישוב`}
        >
          🧮 חישוב כמויות אוטומטי{pendingCalc > 0 ? ` (${pendingCalc})` : ''}
        </button>
      </div>

      {detecting && (
        <div className="detect-progress">
          <div className="detect-progress-bar">
            <div className="detect-progress-fill" style={{ width: `${Math.round(detectionProgress * 100)}%` }} />
          </div>
          <span className="detect-progress-label">{detectionLabel}</span>
        </div>
      )}

      {!detecting && detectionSummary && (
        <div className="detect-summary">
          <button className="detect-summary-close" onClick={clearDetectionSummary} title="סגור">
            ✕
          </button>
          <div className="detect-summary-headline">זוהו {detectionSummary.total} חדרים</div>
          <ul>
            <li>
              <span className="conf-dot high" /> {detectionSummary.highConfidence} זוהו בוודאות גבוהה
            </li>
            <li>
              <span className="conf-dot low" /> {detectionSummary.needsReview} דורשים בדיקה ידנית
            </li>
          </ul>
          {detectionSummary.total === 0 && (
            <p className="auto-detect-hint">לא זוהו אזורים סגורים. נסה לכייל, לוודא שהתוכנית ברורה, או לסמן ידנית.</p>
          )}
        </div>
      )}

      {calcMessage && <div className="detect-toast">{calcMessage}</div>}
      {!detecting && !detectionSummary && detectedOnPage > 0 && (
        <p className="auto-detect-hint">{detectedOnPage} חדרים שזוהו בעמוד זה.</p>
      )}
    </div>
  );
}
