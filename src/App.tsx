import { useEffect, useState } from 'react';
import { useAppStore } from './store/appStore';
import { useCompareStore } from './store/compareStore';
import StartScreen from './components/StartScreen';
import TopBar from './components/TopBar';
import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import CalibrationDialog from './components/CalibrationDialog';
import RoomPanel from './components/RoomPanel';
import QuantitiesPanel from './components/QuantitiesPanel';
import PageStatusBar from './components/PageStatusBar';
import MeasureToolbar from './components/MeasureToolbar';
import MarkupToolbar from './components/MarkupToolbar';
import CompareStartScreen from './components/compare/CompareStartScreen';
import CompareWorkspace from './components/compare/CompareWorkspace';
import Icon from './components/Icon';

/** Quantities is no longer one of these — it has the full-width bottom panel instead. */
type SidebarTab = 'rooms' | 'measure' | 'markup';
type HomeMode = 'takeoff' | 'compare';

function Workspace() {
  const [tab, setTab] = useState<SidebarTab>('rooms');

  return (
    <div className="workspace">
      <TopBar />
      {/* Canvas + sidebar on one row; the quantities panel is a sibling BELOW that row, so opening
          it shortens the row instead of covering the plan, and the canvas gets the space back when
          it closes. Nothing here changes the canvas transform. */}
      <div className="workspace-body">
        <Toolbar />
        <div className="viewer-area">
          <PdfViewer />
          <CalibrationDialog />
        </div>
        <div className="sidebar">
          {/* Page + calibration state sits above the tabs, so it is present in every tab. */}
          <PageStatusBar />
          <div className="sidebar-tabs">
            <button className={tab === 'rooms' ? 'active' : ''} onClick={() => setTab('rooms')}>
              חדרים ודירות
            </button>
            <button className={tab === 'measure' ? 'active' : ''} onClick={() => setTab('measure')}>
              מדידות
            </button>
            <button className={tab === 'markup' ? 'active' : ''} onClick={() => setTab('markup')}>
              סימונים
            </button>
          </div>
          <div className="sidebar-content">
            {tab === 'rooms' && <RoomPanel />}
            {tab === 'measure' && <MeasureToolbar />}
            {tab === 'markup' && <MarkupToolbar />}
          </div>
        </div>
      </div>
      <QuantitiesPanel />
    </div>
  );
}

function Home() {
  const [mode, setMode] = useState<HomeMode>('takeoff');
  return (
    <div className="workspace home">
      {/* The same bar as the two workspaces, so the entrance and the rooms behind it are
          recognisably one product. */}
      <div className="top-bar">
        <div className="top-bar-group identity">
          <div className="app-brand" title="BetterCalc">
            <span className="app-brand-name">BetterCalc</span>
          </div>
        </div>
        <div className="top-bar-group grow" />
        <div className="top-bar-group output">
          <span className="muted home-top-note">כל העבודה נשמרת במחשב הזה</span>
        </div>
      </div>

      {/* The two products are the primary navigation — the same tab language as the sidebars. */}
      <div className="home-body">
        <div className="home-tabs sidebar-tabs">
          <button className={mode === 'takeoff' ? 'active' : ''} onClick={() => setMode('takeoff')}>
            <Icon name="map" />
            חישוב כמויות
          </button>
          <button className={mode === 'compare' ? 'active' : ''} onClick={() => setMode('compare')}>
            <Icon name="layers" />
            השוואת תוכניות
          </button>
        </div>
        <div className="home-content">{mode === 'takeoff' ? <StartScreen /> : <CompareStartScreen />}</div>
      </div>
    </div>
  );
}

/**
 * Warns before a close/refresh only while the project or the open comparison holds work that is not
 * on disk yet. The listener is attached solely while something is dirty, so read-only work and
 * in-app navigation never trigger it.
 */
function useUnsavedChangesGuard() {
  // Both stores are subscribed unconditionally — either side can hold unsaved work.
  const projectDirty = useAppStore((s) => s.dirty);
  const comparisonDirty = useCompareStore((s) => s.dirty);
  const dirty = projectDirty || comparisonDirty;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

export default function App() {
  const project = useAppStore((s) => s.project);
  const comparison = useCompareStore((s) => s.comparison);
  useUnsavedChangesGuard();
  if (project) return <Workspace />;
  if (comparison) return <CompareWorkspace />;
  return <Home />;
}
