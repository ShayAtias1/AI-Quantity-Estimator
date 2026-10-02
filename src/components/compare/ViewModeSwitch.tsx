import { useCompareStore } from '../../store/compareStore';
import type { CompareViewMode } from '../../types/compare';
import Icon, { type IconName } from '../Icon';
import { useT } from '../../i18n';

/** Labels come from the dictionary: `compare.viewModes.<mode>` and `<mode>Hint`. */
const MODES: { mode: CompareViewMode; icon: IconName }[] = [
  { mode: 'overlay', icon: 'layers' },
  { mode: 'swipe', icon: 'swipe' },
  { mode: 'blink', icon: 'blink' },
];

/** How the two plans are compared. The same segmented control as the sidebar tool groups. */
export default function ViewModeSwitch() {
  const viewMode = useCompareStore((s) => s.viewMode);
  const setViewMode = useCompareStore((s) => s.setViewMode);
  const t = useT();

  return (
    <div className="segmented compact" role="group" aria-label={t('compare.viewModes.label')}>
      {MODES.map((m) => (
        <button
          key={m.mode}
          className={`tool-btn ${viewMode === m.mode ? 'active' : ''}`}
          onClick={() => setViewMode(m.mode)}
          aria-pressed={viewMode === m.mode}
          title={t(`compare.viewModes.${m.mode}Hint`)}
        >
          <Icon name={m.icon} />
          <span className="tool-label">{t(`compare.viewModes.${m.mode}`)}</span>
        </button>
      ))}
    </div>
  );
}
