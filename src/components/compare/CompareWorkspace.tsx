import { useRef, useState } from 'react';
import CompareTopBar from './CompareTopBar';
import CompareCanvas, { type CompareCanvasHandle } from './CompareCanvas';
import LayerPanel from './LayerPanel';
import AlignmentTools from './AlignmentTools';
import MeasureToolbar from './MeasureToolbar';
import AreaSummaryPanel from './AreaSummaryPanel';
import MarkupToolbar from './MarkupToolbar';
import CompareCalibrationDialog from './CompareCalibrationDialog';
import { useCompareStore } from '../../store/compareStore';
import { exportCompositeAsPdf } from '../../lib/exportComparePdf';

type SidebarTab = 'layers' | 'measure' | 'markup';

export default function CompareWorkspace() {
  const toolMode = useCompareStore((s) => s.toolMode);
  const setToolMode = useCompareStore((s) => s.setToolMode);
  const comparison = useCompareStore((s) => s.comparison);
  const [tab, setTab] = useState<SidebarTab>('layers');
  const canvasRef = useRef<CompareCanvasHandle>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!comparison || !canvasRef.current) return;
    setExporting(true);
    try {
      const composite = await canvasRef.current.exportComposite();
      if (!composite) return;
      await exportCompositeAsPdf(composite.dataUrl, composite.width, composite.height, comparison.name);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="workspace">
      <CompareTopBar onExport={handleExport} exporting={exporting} />
      <div className="workspace-body">
        <div className="toolbar">
          <button className={`tool-btn ${toolMode === 'select' ? 'active' : ''}`} onClick={() => setToolMode('select')}>
            <span className="tool-icon">⭤</span>
            <span className="tool-label">בחירה</span>
          </button>
          <button className={`tool-btn ${toolMode === 'pan' ? 'active' : ''}`} onClick={() => setToolMode('pan')}>
            <span className="tool-icon">✋</span>
            <span className="tool-label">הזזה</span>
          </button>
        </div>
        <div className="viewer-area">
          <CompareCanvas ref={canvasRef} />
          <CompareCalibrationDialog />
        </div>
        <div className="sidebar">
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
            {tab === 'measure' && (
              <>
                <MeasureToolbar />
                <AreaSummaryPanel />
              </>
            )}
            {tab === 'markup' && <MarkupToolbar />}
          </div>
        </div>
      </div>
    </div>
  );
}
