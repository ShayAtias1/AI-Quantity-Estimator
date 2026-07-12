import { useAppStore } from '../store/appStore';
import type { TilingCategory, WorkType } from '../types';
import { TILING_CATEGORY_LABELS, WORK_TYPE_LABELS, WORK_TYPE_UNITS } from '../types';
import { itemQuantityM2, roomMetrics } from '../lib/quantities';
import { round } from '../lib/geometry';
import AutoDetectPanel from './AutoDetectPanel';

const WORK_TYPES: WorkType[] = ['tiling', 'cladding', 'panels'];

export default function RoomPanel() {
  const project = useAppStore((s) => s.project);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const updateRoom = useAppStore((s) => s.updateRoom);
  const deleteRoom = useAppStore((s) => s.deleteRoom);
  const addWorkItem = useAppStore((s) => s.addWorkItem);
  const updateWorkItem = useAppStore((s) => s.updateWorkItem);
  const removeWorkItem = useAppStore((s) => s.removeWorkItem);

  if (!project) return null;
  const room = project.rooms.find((r) => r.id === selectedRoomId) ?? null;

  const selectRoom = (id: string, page: number) => {
    setCurrentPage(page);
    setSelectedRoomId(id);
  };

  return (
    <div className="room-panel">
      <AutoDetectPanel />
      <div className="room-list">
        <h4>אזורים שסומנו ({project.rooms.length})</h4>
        {project.rooms.length === 0 && <p className="muted">בחר בכלי "סימון" וסמן חדר על התוכנית.</p>}
        <ul>
          {project.rooms.map((r) => (
            <li key={r.id} className={r.id === selectedRoomId ? 'active' : ''} onClick={() => selectRoom(r.id, r.pageNumber)}>
              <span className="color-dot" style={{ background: r.color }} />
              <span className="room-list-name">{r.name || 'חדר ללא שם'}</span>
              {r.detectionConfidence === 'low' && (
                <span className="room-review-flag" title="זוהה אוטומטית — מומלץ לבדוק">
                  ⚠
                </span>
              )}
              <span className="room-list-apt">{r.apartmentNumber ? `דירה ${r.apartmentNumber}` : ''}</span>
              <span className="room-list-page">עמוד {r.pageNumber}</span>
              <button
                className="icon-btn danger"
                title="מחק אזור"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`למחוק את "${r.name}"?`)) deleteRoom(r.id);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {room && (
        <RoomDetail
          key={room.id}
          room={room}
          calibration={project.pages[room.pageNumber]?.calibration ?? null}
          defaultCladdingHeightM={project.defaultCladdingHeightM}
          defaultTilingWastePercent={project.defaultTilingWastePercent}
          defaultCladdingWastePercent={project.defaultCladdingWastePercent}
          defaultPanelsWastePercent={project.defaultPanelsWastePercent}
          onUpdate={(patch) => updateRoom(room.id, patch)}
          onAddWorkItem={(type) => addWorkItem(room.id, type)}
          onUpdateWorkItem={(itemId, patch) => updateWorkItem(room.id, itemId, patch)}
          onRemoveWorkItem={(itemId) => removeWorkItem(room.id, itemId)}
        />
      )}
    </div>
  );
}

function RoomDetail({
  room,
  calibration,
  defaultCladdingHeightM,
  defaultTilingWastePercent,
  defaultCladdingWastePercent,
  defaultPanelsWastePercent,
  onUpdate,
  onAddWorkItem,
  onUpdateWorkItem,
  onRemoveWorkItem,
}: {
  room: import('../types').Room;
  calibration: import('../types').Calibration | null;
  defaultCladdingHeightM: number;
  defaultTilingWastePercent: number;
  defaultCladdingWastePercent: number;
  defaultPanelsWastePercent: number;
  onUpdate: (patch: Partial<import('../types').Room>) => void;
  onAddWorkItem: (type: WorkType) => void;
  onUpdateWorkItem: (itemId: string, patch: Partial<import('../types').WorkItem>) => void;
  onRemoveWorkItem: (itemId: string) => void;
}) {
  const { areaM2, perimeterM } = roomMetrics(room, calibration);
  const noCalibration = !calibration;

  const defaultWasteByType: Record<WorkType, number> = {
    tiling: defaultTilingWastePercent,
    cladding: defaultCladdingWastePercent,
    panels: defaultPanelsWastePercent,
  };

  return (
    <div className="room-detail">
      <h4>פרטי אזור</h4>
      {noCalibration && <div className="warning-box">יש לכייל את קנה המידה בעמוד זה לפני חישוב כמויות.</div>}
      <div className="metrics-row">
        <div>
          <span className="metric-label">שטח</span>
          <span className="metric-value">{round(areaM2, 2)} מ"ר</span>
        </div>
        <div>
          <span className="metric-label">היקף</span>
          <span className="metric-value">{round(perimeterM, 2)} מ'</span>
        </div>
      </div>

      <div className="form-row">
        <label>שם חדר</label>
        <input value={room.name} onChange={(e) => onUpdate({ name: e.target.value })} />
      </div>
      <div className="form-row">
        <label>מספר דירה</label>
        <input value={room.apartmentNumber} onChange={(e) => onUpdate({ apartmentNumber: e.target.value })} placeholder="לדוגמה: 5" />
      </div>
      <div className="form-row">
        <label>הערות</label>
        <textarea value={room.notes} onChange={(e) => onUpdate({ notes: e.target.value })} rows={2} />
      </div>

      <h4>סוגי עבודה</h4>
      <div className="work-item-add-row">
        {WORK_TYPES.map((t) => (
          <button key={t} className="btn-secondary small" onClick={() => onAddWorkItem(t)}>
            + {WORK_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <ul className="work-item-list">
        {room.workItems.map((item) => {
          const qty = itemQuantityM2(item, areaM2, perimeterM, defaultCladdingHeightM);
          const waste = item.wastePercent ?? defaultWasteByType[item.type];
          const orderQty = qty * (1 + waste / 100);
          return (
            <li key={item.id}>
              <div className="work-item-header">
                <strong>{WORK_TYPE_LABELS[item.type]}</strong>
                <button className="icon-btn danger" onClick={() => onRemoveWorkItem(item.id)}>
                  ✕
                </button>
              </div>
              {item.type === 'tiling' && (
                <div className="form-row inline">
                  <label>סוג ריצוף</label>
                  <select
                    value={item.tilingCategory ?? 'regular'}
                    onChange={(e) => onUpdateWorkItem(item.id, { tilingCategory: e.target.value as TilingCategory })}
                  >
                    <option value="regular">{TILING_CATEGORY_LABELS.regular}</option>
                    <option value="as">{TILING_CATEGORY_LABELS.as}</option>
                  </select>
                </div>
              )}
              {item.type === 'cladding' && (
                <div className="form-row inline">
                  <label>גובה חיפוי (מ')</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    value={item.heightM ?? defaultCladdingHeightM}
                    onChange={(e) => onUpdateWorkItem(item.id, { heightM: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              <div className="form-row inline">
                <label>פחת %</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={waste}
                  onChange={(e) => onUpdateWorkItem(item.id, { wastePercent: parseFloat(e.target.value) })}
                />
              </div>
              <div className="work-item-result">
                כמות: <strong>{round(qty, 2)} {WORK_TYPE_UNITS[item.type]}</strong>
                {' · '}
                להזמנה (כולל פחת): <strong>{round(orderQty, 2)} {WORK_TYPE_UNITS[item.type]}</strong>
              </div>
            </li>
          );
        })}
        {room.workItems.length === 0 && <p className="muted">הוסף סוג עבודה כדי לחשב כמות.</p>}
      </ul>
    </div>
  );
}
