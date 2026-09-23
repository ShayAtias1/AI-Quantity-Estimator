import { useCompareStore } from '../../store/compareStore';
import type { CompareViewMode } from '../../types/compare';
import Icon, { type IconName } from '../Icon';

const MODES: { mode: CompareViewMode; label: string; icon: IconName; hint: string }[] = [
  { mode: 'overlay', label: 'שכבות', icon: 'layers', hint: 'שכבות — שתי התוכניות זו על גבי זו' },
  { mode: 'swipe', label: 'החלקה', icon: 'swipe', hint: 'החלקה — גרור את המפריד כדי לחשוף כל צד' },
  { mode: 'blink', label: 'הבהוב', icon: 'blink', hint: 'הבהוב — החלפה אוטומטית בין התוכניות' },
];

/** How the two plans are compared. The same segmented control as the sidebar tool groups. */
export default function ViewModeSwitch() {
  const viewMode = useCompareStore((s) => s.viewMode);
  const setViewMode = useCompareStore((s) => s.setViewMode);

  return (
    <div className="segmented compact" role="group" aria-label="אופן ההשוואה">
      {MODES.map((m) => (
        <button
          key={m.mode}
          className={`tool-btn ${viewMode === m.mode ? 'active' : ''}`}
          onClick={() => setViewMode(m.mode)}
          aria-pressed={viewMode === m.mode}
          title={m.hint}
        >
          <Icon name={m.icon} />
          <span className="tool-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
