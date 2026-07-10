import { useRef } from 'react';
import { useCompareStore } from '../../store/compareStore';
import { deleteComparePdfBlob, saveComparePdfBlob } from '../../db/database';

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
  const addRevision = useCompareStore((s) => s.addRevision);
  const removeRevision = useCompareStore((s) => s.removeRevision);
  const renameRevision = useCompareStore((s) => s.renameRevision);
  const setActiveRevisionId = useCompareStore((s) => s.setActiveRevisionId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!comparison) return null;

  const activeRevision = comparison.revisions.find((r) => r.id === comparison.activeRevisionId) ?? comparison.revisions[0];

  const handleAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const id = addRevision(file.name);
      if (id) await saveComparePdfBlob(comparison.id, `revision:${id}`, file);
    }
  };

  const handleRemove = async (id: string) => {
    if (comparison.revisions.length <= 1) return;
    if (!confirm('להסיר את התוכנית המעודכנת הזו מההשוואה?')) return;
    removeRevision(id);
    await deleteComparePdfBlob(comparison.id, `revision:${id}`);
  };

  const handleRename = (id: string, current: string) => {
    const label = window.prompt('שם התוכנית המעודכנת:', current);
    if (label && label.trim()) renameRevision(id, label.trim());
  };

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

      <div className="revision-tabs">
        {comparison.revisions.map((r) => (
          <button
            key={r.id}
            className={`revision-tab ${r.id === comparison.activeRevisionId ? 'active' : ''}`}
            onClick={() => setActiveRevisionId(r.id)}
            onDoubleClick={() => handleRename(r.id, r.label)}
            title="לחיצה כפולה לשינוי שם"
          >
            <span className="color-dot" style={{ background: r.colorTint }} />
            {r.label}
            {comparison.revisions.length > 1 && (
              <span
                className="revision-tab-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemove(r.id);
                }}
                title="הסר תוכנית מעודכנת"
              >
                ✕
              </span>
            )}
          </button>
        ))}
        <button className="revision-tab revision-tab-add" onClick={() => fileInputRef.current?.click()} title="הוסף תוכנית מעודכנת">
          + הוסף
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            void handleAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {activeRevision && (
        <LayerRow
          title={`תוכנית מעודכנת${comparison.revisions.length > 1 ? ` — ${activeRevision.label}` : ''}`}
          visible={activeRevision.visible}
          opacity={activeRevision.opacity}
          tint={activeRevision.colorTint}
          useSourceColors={activeRevision.useSourceColors}
          onToggleVisible={() => setLayerVisible(activeRevision.id, !activeRevision.visible)}
          onOpacityChange={(v) => setLayerOpacity(activeRevision.id, v)}
          onTintChange={(c) => setLayerTint(activeRevision.id, c)}
          onToggleSourceColors={(v) => setLayerSourceColors(activeRevision.id, v)}
        />
      )}
    </div>
  );
}
