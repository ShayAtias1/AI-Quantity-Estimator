import { useCompareStore } from '../../store/compareStore';

const TINT_PRESETS = ['#9ca3af', '#6b7280', '#ef4444', '#2563eb', '#16a34a', '#f59e0b', '#9333ea'];

function LayerRow({
  title,
  visible,
  opacity,
  tint,
  useSourceColors,
  onToggleVisible,
  onOpacityChange,
  onTintChange,
  onToggleSourceColors,
}: {
  title: string;
  visible: boolean;
  opacity: number;
  tint: string;
  useSourceColors: boolean;
  onToggleVisible: () => void;
  onOpacityChange: (v: number) => void;
  onTintChange: (c: string) => void;
  onToggleSourceColors: (v: boolean) => void;
}) {
  return (
    <div className="layer-row">
      <div className="layer-row-header">
        <button className={`layer-toggle ${visible ? 'on' : ''}`} onClick={onToggleVisible} title={visible ? 'הסתר שכבה' : 'הצג שכבה'}>
          {visible ? '👁' : '🚫'}
        </button>
        <span className="layer-title">{title}</span>
        {!useSourceColors && <span className="color-dot" style={{ background: tint }} />}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
        disabled={!visible}
      />
      <label className="source-color-toggle">
        <input type="checkbox" checked={useSourceColors} onChange={(e) => onToggleSourceColors(e.target.checked)} />
        הצג בצבע המקורי של התוכנית
      </label>
      <div className={`tint-swatches ${useSourceColors ? 'disabled' : ''}`}>
        {TINT_PRESETS.map((c) => (
          <button
            key={c}
            className={`tint-swatch ${c === tint && !useSourceColors ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onTintChange(c)}
            disabled={useSourceColors}
            title={c}
          />
        ))}
      </div>
    </div>
  );
}

export default function LayerPanel() {
  const comparison = useCompareStore((s) => s.comparison);
  const setLayerOpacity = useCompareStore((s) => s.setLayerOpacity);
  const setLayerVisible = useCompareStore((s) => s.setLayerVisible);
  const setLayerTint = useCompareStore((s) => s.setLayerTint);
  const setLayerSourceColors = useCompareStore((s) => s.setLayerSourceColors);

  if (!comparison) return null;

  return (
    <div className="layer-panel">
      <h4>שכבות</h4>
      <LayerRow
        title="תוכנית מקור"
        visible={comparison.originalVisible}
        opacity={comparison.originalOpacity}
        tint={comparison.originalColorTint}
        useSourceColors={comparison.originalUseSourceColors}
        onToggleVisible={() => setLayerVisible('original', !comparison.originalVisible)}
        onOpacityChange={(v) => setLayerOpacity('original', v)}
        onTintChange={(c) => setLayerTint('original', c)}
        onToggleSourceColors={(v) => setLayerSourceColors('original', v)}
      />
      <LayerRow
        title="תוכנית מעודכנת"
        visible={comparison.revisedVisible}
        opacity={comparison.revisedOpacity}
        tint={comparison.revisedColorTint}
        useSourceColors={comparison.revisedUseSourceColors}
        onToggleVisible={() => setLayerVisible('revised', !comparison.revisedVisible)}
        onOpacityChange={(v) => setLayerOpacity('revised', v)}
        onTintChange={(c) => setLayerTint('revised', c)}
        onToggleSourceColors={(v) => setLayerSourceColors('revised', v)}
      />
    </div>
  );
}
