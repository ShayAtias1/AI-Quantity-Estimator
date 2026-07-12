import { useState } from 'react';
import { useAppStore } from '../store/appStore';

export default function TopBar() {
  const project = useAppStore((s) => s.project);
  const setProject = useAppStore((s) => s.setProject);
  const currentPage = useAppStore((s) => s.currentPage);
  const numPages = useAppStore((s) => s.numPages);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const updateProjectMeta = useAppStore((s) => s.updateProjectMeta);
  const persist = useAppStore((s) => s.persist);
  const annotationsVisible = useAppStore((s) => s.annotationsVisible);
  const toggleAnnotationsVisible = useAppStore((s) => s.toggleAnnotationsVisible);
  const [showSettings, setShowSettings] = useState(false);

  if (!project) return null;

  const closeProject = async () => {
    await persist();
    setProject(null);
  };

  return (
    <div className="top-bar">
      <button className="btn-secondary small" onClick={closeProject}>
        ← פרויקטים
      </button>
      <input
        className="project-name-input"
        value={project.name}
        onChange={(e) => updateProjectMeta({ name: e.target.value })}
      />

      <div className="page-nav">
        <button disabled={currentPage <= 1} onClick={() => setCurrentPage(currentPage - 1)}>
          ›
        </button>
        <span>
          עמוד {currentPage} מתוך {numPages}
        </span>
        <button disabled={currentPage >= numPages} onClick={() => setCurrentPage(currentPage + 1)}>
          ‹
        </button>
      </div>

      <button
        className={`btn-secondary small ${!annotationsVisible ? 'active' : ''}`}
        onClick={toggleAnnotationsVisible}
        title="הצג/הסתר סימוני שטחים על גבי התוכנית"
      >
        {annotationsVisible ? '👁 הסתר סימונים' : '🚫 הצג סימונים'}
      </button>

      <div className="settings-anchor">
        <button className="btn-secondary small" onClick={() => setShowSettings((v) => !v)}>
          ⚙ ברירות מחדל
        </button>
        {showSettings && (
          <div className="settings-popover">
            <div className="form-row">
              <label>גובה חיפוי ברירת מחדל (מ')</label>
              <input
                type="number"
                step="0.05"
                min="0"
                value={project.defaultCladdingHeightM}
                onChange={(e) => updateProjectMeta({ defaultCladdingHeightM: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-row">
              <label>פחת ריצוף ברירת מחדל (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={project.defaultTilingWastePercent}
                onChange={(e) => updateProjectMeta({ defaultTilingWastePercent: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-row">
              <label>פחת חיפוי ברירת מחדל (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={project.defaultCladdingWastePercent}
                onChange={(e) => updateProjectMeta({ defaultCladdingWastePercent: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-row">
              <label>פחת פנלים ברירת מחדל (%)</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={project.defaultPanelsWastePercent}
                onChange={(e) => updateProjectMeta({ defaultPanelsWastePercent: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
