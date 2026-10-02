import { useAppStore } from '../store/appStore';
import { isPageCalibrated } from '../lib/quantities';
import Icon from './Icon';
import { useT } from '../i18n';

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
  const t = useT();

  if (!project) return null;

  const calibrated = isPageCalibrated(project, currentPage);
  const calibration = project.pages[currentPage]?.calibration ?? null;
  const startCalibration = () => setToolMode(toolMode === 'calibrate' ? 'select' : 'calibrate');

  return (
    <div className={`page-status ${calibrated ? '' : 'uncalibrated'}`}>
      <div className="page-status-line">
        <span className="page-status-page">
          {numPages > 1 ? t('pageStatus.pageOf', { page: currentPage, count: numPages }) : t('pageStatus.page', { page: currentPage })}
        </span>
        {/* A healthy page stays quiet: muted text and a ghost action that is still always present
            (never hover-only). A page that blocks calculation says so on a warning edge, with the
            action promoted to primary. */}
        {calibrated ? (
          <span className="page-status-state muted">
            {calibration ? t('pageStatus.calibratedWithReference', { meters: calibration.realDistanceMeters }) : t('pageStatus.calibrated')}
          </span>
        ) : (
          <span className="page-status-state cal-missing">
            <Icon name="alert" size={13} />
            {t('pageStatus.notCalibrated')}
          </span>
        )}
        <button
          className={`${calibrated ? 'btn-ghost' : 'btn-primary'} small ${toolMode === 'calibrate' ? 'active' : ''}`}
          onClick={startCalibration}
        >
          {calibrated ? t('pageStatus.recalibrate') : t('pageStatus.calibrateNow')}
        </button>
      </div>
    </div>
  );
}
