import { useRef, useState } from 'react';
import CompareTopBar from './CompareTopBar';
import CompareCanvas, { type CompareCanvasHandle } from './CompareCanvas';
import LayerPanel from './LayerPanel';
import AlignmentTools from './AlignmentTools';
import MeasureToolbar from './MeasureToolbar';
import MarkupToolbar from './MarkupToolbar';
import CompareCalibrationDialog from './CompareCalibrationDialog';
import CompareContextBar from './CompareContextBar';
import ChangesPanel from './ChangesPanel';
import Icon from '../Icon';
import { useCompareStore } from '../../store/compareStore';
import { exportCompositesAsPdf, type ChangeTable, type CompositeImage } from '../../lib/exportComparePdf';
import { changeTableFor, planCompareExport } from '../../lib/compareExportPlan';

type SidebarTab = 'layers' | 'measure' | 'markup';

/** Polls `check` until it passes or the timeout elapses; returns whether it passed. */
async function waitFor(check: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) {
      // One more frame so React has committed the overlay that goes with this raster.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return false;
}

export default function CompareWorkspace() {
  const toolMode = useCompareStore((s) => s.toolMode);
  const setToolMode = useCompareStore((s) => s.setToolMode);
  const comparison = useCompareStore((s) => s.comparison);
  const setActiveRevisionId = useCompareStore((s) => s.setActiveRevisionId);
  const currentPageKey = useCompareStore((s) => s.currentPageKey);
  const setCurrentPageKey = useCompareStore((s) => s.setCurrentPageKey);
  const originalNumPages = useCompareStore((s) => s.originalNumPages);
  const [tab, setTab] = useState<SidebarTab>('layers');
  const canvasRef = useRef<CompareCanvasHandle>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * The one export path, for all four combinations of revision scope × page scope.
   *
   * The canvas shows one source page of one revision at a time, so the export walks the planned
   * pairs, waits for *both* layers to finish rasterizing that exact pair (`isReadyFor`), captures
   * it, and collects that pair's own change table. `canvasRef.current` is re-read after every await
   * so each capture uses the handle from the newest render, and the page and revision the user was
   * on are restored at the end.
   *
   * A pair whose mapped revised page does not exist in that revision's PDF is skipped and reported
   * — never exported as a source-only page dressed up as a comparison.
   */
  const runExport = async (revisionScope: 'active' | 'all', pageScope: 'current' | 'all') => {
    if (!comparison) return;
    const restoreRevisionId = comparison.activeRevisionId;
    const restorePageKey = currentPageKey;
    const pairs = planCompareExport(comparison, { revisionScope, pageScope, currentPageKey, originalNumPages });

    setExporting(true);
    try {
      const composites: CompositeImage[] = [];
      const tables: ChangeTable[] = [];
      const skipped: string[] = [];
      let shownRevisionId = comparison.activeRevisionId;
      for (const { revision, pageKey, label } of pairs) {
        if (revision && revision.id !== shownRevisionId) {
          setActiveRevisionId(revision.id);
          shownRevisionId = revision.id;
        }
        setCurrentPageKey(pageKey);
        const ready = await waitFor(() => canvasRef.current?.isReadyFor(revision?.id ?? '', pageKey) === true);
        if (!ready) {
          skipped.push(label);
          continue;
        }
        // The canvas renders the mapped revised page for this pair; this only refuses the pairs
        // where that mapped page is out of range for the revision's own PDF.
        if (revision && canvasRef.current?.isRevisedPageMissing()) {
          skipped.push(label);
          continue;
        }
        const composite = await canvasRef.current?.exportComposite();
        if (!composite) {
          skipped.push(label);
          continue;
        }
        composites.push(composite);
        tables.push(changeTableFor(comparison.name, revision, pageKey));
      }

      if (composites.length === 0) {
        alert(`לא נמצא שילוב עמוד/גרסה שניתן לייצא${skipped.length > 0 ? `: ${skipped.join(', ')}` : '.'}`);
        return;
      }
      if (skipped.length > 0) {
        alert(`השילובים הבאים אינם קיימים ולא נכללו בייצוא: ${skipped.join(', ')}`);
      }
      const scopeName = pageScope === 'all' ? 'כל-העמודים' : `עמוד-${restorePageKey}`;
      await exportCompositesAsPdf(composites, `${comparison.name}-${scopeName}`, tables);
    } finally {
      if (restoreRevisionId) setActiveRevisionId(restoreRevisionId);
      setCurrentPageKey(restorePageKey);
      setExporting(false);
    }
  };

  return (
    <div className="workspace">
      <CompareTopBar onExport={runExport} exporting={exporting} />
      <div className="workspace-body">
        {/* The same icon-only rail as the takeoff workspace: canvas interaction only, the tool
            name carried by the tooltip. */}
        <div className="toolbar">
          <button
            className={`tool-btn ${toolMode === 'select' ? 'active' : ''}`}
            onClick={() => setToolMode('select')}
            aria-label="בחירה"
            aria-pressed={toolMode === 'select'}
            title="בחירה — בחירת סימונים ושינויים על התוכנית"
          >
            <Icon name="select" size={20} />
          </button>
          <button
            className={`tool-btn ${toolMode === 'pan' ? 'active' : ''}`}
            onClick={() => setToolMode('pan')}
            aria-label="הזזה"
            aria-pressed={toolMode === 'pan'}
            title="הזזה — גרירת התצוגה"
          >
            <Icon name="pan" size={20} />
          </button>

          <span className="toolbar-sep" />

          {/* Aligning the revised layer is a canvas interaction, so its drag mode belongs on the
              rail next to the other two; the numeric controls stay in the sidebar. */}
          <button
            className={`tool-btn ${toolMode === 'align' ? 'active' : ''}`}
            onClick={() => setToolMode(toolMode === 'align' ? 'select' : 'align')}
            aria-label="יישור"
            aria-pressed={toolMode === 'align'}
            title="יישור — גרור את התוכנית המעודכנת למקומה"
          >
            <Icon name="move" size={20} />
          </button>
        </div>
        <div className="viewer-area">
          <CompareCanvas ref={canvasRef} />
          <CompareCalibrationDialog />
        </div>
        <div className="sidebar">
          {/* Comparison context (revision, page mapping, scale, alignment) above the tabs, so it is
              present in every tab rather than buried in the layer panel. */}
          <CompareContextBar />
          <div className="sidebar-tabs">
            <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}>
              שכבות ויישור
            </button>
            <button className={tab === 'measure' ? 'active' : ''} onClick={() => setTab('measure')}>
              כיול ומדידה
            </button>
            <button className={tab === 'markup' ? 'active' : ''} onClick={() => setTab('markup')}>
              סימונים
            </button>
          </div>
          <div className="sidebar-content">
            {tab === 'layers' && (
              <>
                <LayerPanel />
                <AlignmentTools />
              </>
            )}
            {tab === 'measure' && <MeasureToolbar />}
            {tab === 'markup' && <MarkupToolbar />}
          </div>
        </div>
      </div>
      {/* Demolition / new construction review, across the full workspace width under the canvas. */}
      <ChangesPanel />
    </div>
  );
}
