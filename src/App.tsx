import { useState } from 'react';
import { useAppStore } from './store/appStore';
import { useCompareStore } from './store/compareStore';
import StartScreen from './components/StartScreen';
import TopBar from './components/TopBar';
import Toolbar from './components/Toolbar';
import PdfViewer from './components/PdfViewer';
import CalibrationDialog from './components/CalibrationDialog';
import RoomPanel from './components/RoomPanel';
import QuantityTable from './components/QuantityTable';
import MeasureToolbar from './components/MeasureToolbar';
import CompareStartScreen from './components/compare/CompareStartScreen';
import CompareWorkspace from './components/compare/CompareWorkspace';

type SidebarTab = 'rooms' | 'quantities' | 'measure';
type HomeMode = 'takeoff' | 'compare';

function Workspace() {
  const [tab, setTab] = useState<SidebarTab>('rooms');

  return (
    <div className="workspace">
      <TopBar />
      <div className="workspace-body">
        <Toolbar />
        <div className="viewer-area">
          <PdfViewer />
          <CalibrationDialog />
        </div>
        <div className="sidebar">
          <div className="sidebar-tabs">
            <button className={tab === 'rooms' ? 'active' : ''} onClick={() => setTab('rooms')}>
              חדרים
            </button>
            <button className={tab === 'quantities' ? 'active' : ''} onClick={() => setTab('quantities')}>
              טבלת כמויות
            </button>
            <button className={tab === 'measure' ? 'active' : ''} onClick={() => setTab('measure')}>
              מדידה
            </button>
          </div>
          <div className="sidebar-content">
            {tab === 'rooms' && <RoomPanel />}
            {tab === 'quantities' && <QuantityTable />}
            {tab === 'measure' && <MeasureToolbar />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Home() {
  const [mode, setMode] = useState<HomeMode>('takeoff');
  return (
    <div>
      <div className="home-mode-switch">
        <button className={mode === 'takeoff' ? 'active' : ''} onClick={() => setMode('takeoff')}>
          חישוב כמויות
        </button>
        <button className={mode === 'compare' ? 'active' : ''} onClick={() => setMode('compare')}>
          השוואת תוכניות
        </button>
      </div>
      {mode === 'takeoff' ? <StartScreen /> : <CompareStartScreen />}
    </div>
  );
}

export default function App() {
  const project = useAppStore((s) => s.project);
  const comparison = useCompareStore((s) => s.comparison);
  if (project) return <Workspace />;
  if (comparison) return <CompareWorkspace />;
  return <Home />;
}
