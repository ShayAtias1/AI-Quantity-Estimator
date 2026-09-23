import { useAppStore } from '../store/appStore';
import { isPageCalibrated } from '../lib/quantities';
import Icon from './Icon';

/**
 * Compact page state pinned above the sidebar tabs: which page is on screen, whether it carries a
 * scale, and the way to fix that. Visible from every tab, so "this page is not calibrated" is never
 * something the user has to go looking for — and it never blocks drawing.
 */
export default function PageStatusBar() {
  const project = useAppStore((s) => s.project);
  const currentPage = useAppStore((s) => s.currentPage);
  const numPages = useAppStore((s) => s.numPages);
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);

  if (!project) return null;

  const calibrated = isPageCalibrated(project, currentPage);
  const calibration = project.pages[currentPage]?.calibration ?? null;
  const startCalibration = () => setToolMode(toolMode === 'calibrate' ? 'select' : 'calibrate');

  return (
    <div className={`page-status ${calibrated ? '' : 'uncalibrated'}`}>
      <div className="page-status-line">
        <span className="page-status-page">
          עמוד {currentPage}
          {numPages > 1 ? ` מתוך ${numPages}` : ''}
        </span>
        {/* A healthy page stays quiet: muted text and a ghost action that is still always present
            (never hover-only). A page that blocks calculation says so on a warning edge, with the
            action promoted to primary. */}
        {calibrated ? (
          <span className="page-status-state muted">
            מכויל{calibration ? ` · ${calibration.realDistanceMeters} מ' ייחוס` : ''}
          </span>
        ) : (
          <span className="page-status-state cal-missing">
            <Icon name="alert" size={13} />
            לא כויל — לא ניתן לחשב כמויות
          </span>
        )}
        <button
          className={`${calibrated ? 'btn-ghost' : 'btn-primary'} small ${toolMode === 'calibrate' ? 'active' : ''}`}
          onClick={startCalibration}
        >
          {calibrated ? 'כייל מחדש' : 'כייל עכשיו'}
        </button>
      </div>
    </div>
  );
}
