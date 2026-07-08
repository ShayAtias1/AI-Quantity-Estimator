import { useCompareStore } from '../../store/compareStore';
import type { CompareViewMode } from '../../types/compare';

const MODES: { mode: CompareViewMode; label: string; icon: string }[] = [
  { mode: 'overlay', label: 'שכבות', icon: '🗇' },
  { mode: 'swipe', label: 'החלקה', icon: '◨' },
  { mode: 'blink', label: 'הבהוב', icon: '⚡' },
];

export default function ViewModeSwitch() {
  const viewMode = useCompareStore((s) => s.viewMode);
  const setViewMode = useCompareStore((s) => s.setViewMode);

  return (
    <div className="view-mode-switch">
      {MODES.map((m) => (
        <button key={m.mode} className={viewMode === m.mode ? 'active' : ''} onClick={() => setViewMode(m.mode)} title={m.label}>
          <span>{m.icon}</span> {m.label}
        </button>
      ))}
    </div>
  );
}
