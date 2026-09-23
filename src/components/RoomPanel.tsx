import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { Project, TilingCategory, WorkType } from '../types';
import {
  NOT_CALIBRATED_LABEL as NOT_CALIBRATED,
  PANEL_LENGTH_UNIT,
  TILING_CATEGORY_LABELS,
  WORK_TYPE_LABELS,
  WORK_TYPE_UNITS,
} from '../types';
import {
  effectivePanelHeightM,
  effectiveWastePercent,
  isPageCalibrated,
  itemLengthM,
  itemQuantityM2,
  roomMetrics,
} from '../lib/quantities';
import { ROOM_PROFILES, roomProfileLabel } from '../lib/roomProfiles';
import {
  apartmentDuplicationWarnings,
  apartmentNumbersInProject,
  groupRoomsByApartment,
} from '../lib/apartmentDuplication';
import { round } from '../lib/geometry';
import AutoDetectPanel, { DetectionReviewPanel } from './AutoDetectPanel';
import Icon from './Icon';

const WORK_TYPES: WorkType[] = ['tiling', 'cladding', 'panels'];

export default function RoomPanel() {
  const project = useAppStore((s) => s.project);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const currentPage = useAppStore((s) => s.currentPage);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);
  const toolMode = useAppStore((s) => s.toolMode);
  const setToolMode = useAppStore((s) => s.setToolMode);
  const updateRoom = useAppStore((s) => s.updateRoom);
  const setRoomType = useAppStore((s) => s.setRoomType);
  const duplicateRoom = useAppStore((s) => s.duplicateRoom);
  const deleteRoom = useAppStore((s) => s.deleteRoom);
  const addWorkItem = useAppStore((s) => s.addWorkItem);
  const updateWorkItem = useAppStore((s) => s.updateWorkItem);
  const removeWorkItem = useAppStore((s) => s.removeWorkItem);
  const activeApartmentNumber = useAppStore((s) => s.activeApartmentNumber);
  const setActiveApartmentNumber = useAppStore((s) => s.setActiveApartmentNumber);
  const [apartmentDialogSource, setApartmentDialogSource] = useState<string | null>(null);
  const [showDetection, setShowDetection] = useState(false);
  // List ⇄ detail is pure navigation: it lives here, never in the project or in the store's
  // selection. Going back to the list keeps `selectedRoomId`, so the room stays highlighted on the
  // plan and one click reopens it.
  const [detailOpen, setDetailOpen] = useState(false);

  // Finishing a hand-drawn room goes straight into its details, so naming and classifying it is the
  // next thing on screen instead of a second click in the list. Only the id changing opens the view:
  // going back to the list leaves it as it is, so the same room never reopens by itself.
  const manuallyCreatedRoomId = useAppStore((s) => s.manuallyCreatedRoomId);
  const lastOpened = useRef<string | null>(manuallyCreatedRoomId);
  useEffect(() => {
    if (manuallyCreatedRoomId && manuallyCreatedRoomId !== lastOpened.current) setDetailOpen(true);
    lastOpened.current = manuallyCreatedRoomId;
  }, [manuallyCreatedRoomId]);

  if (!project) return null;
  const apartmentNumbers = apartmentNumbersInProject(project);
  const groups = groupRoomsByApartment(project);
  const room = project.rooms.find((r) => r.id === selectedRoomId) ?? null;
  // The detail view is derived, not remembered: a room that was deleted, undone away or that lives
  // on another page (after a page change) can never leave the sidebar showing stale details.
  const detailRoom = detailOpen && room && room.pageNumber === currentPage ? room : null;

  const selectRoom = (id: string, page: number) => {
    setCurrentPage(page);
    setSelectedRoomId(id);
    setDetailOpen(true);
  };

  if (detailRoom) {
    return (
      <div className="room-panel">
        <div className="detail-nav">
          <button className="btn-ghost small" onClick={() => setDetailOpen(false)}>
            <Icon name="back" />
            חזרה לחדרים
          </button>
        </div>
        {/* The room name is the identity of this view and outranks everything in it, including the
            area and perimeter below — those are results. */}
        <div className="detail-header">
          <span className="color-dot" style={{ background: detailRoom.color }} />
          <span className="detail-header-text">
            <span className="detail-title">{detailRoom.name || 'חדר ללא שם'}</span>
            <span className="detail-subtitle">
              {detailRoom.apartmentNumber ? `דירה ${detailRoom.apartmentNumber}` : 'ללא שיוך'}
            </span>
          </span>
          <button className="icon-btn" title="שכפל אזור" onClick={() => duplicateRoom(detailRoom.id)}>
            <Icon name="copy" />
          </button>
          <button
            className="icon-btn danger"
            title="מחק אזור"
            onClick={() => {
              if (!confirm(`למחוק את "${detailRoom.name}"?`)) return;
              deleteRoom(detailRoom.id);
              setDetailOpen(false);
            }}
          >
            <Icon name="trash" />
          </button>
        </div>
        <RoomDetail
          key={detailRoom.id}
          room={detailRoom}
          project={project}
          calibration={project.pages[detailRoom.pageNumber]?.calibration ?? null}
          onUpdate={(patch) => updateRoom(detailRoom.id, patch)}
          onRoomTypeChange={(key) => setRoomType(detailRoom.id, key)}
          onAddWorkItem={(type) => addWorkItem(detailRoom.id, type)}
          onUpdateWorkItem={(itemId, patch) => updateWorkItem(detailRoom.id, itemId, patch)}
          onRemoveWorkItem={(itemId) => removeWorkItem(detailRoom.id, itemId)}
        />
      </div>
    );
  }

  /** Creating an apartment is just naming one: it exists as soon as a room carries the number. */
  const createApartment = () => {
    const next = window.prompt('מספר הדירה החדשה:', '');
    if (next && next.trim()) setActiveApartmentNumber(next.trim());
  };

  return (
    <div className="room-panel">
      {/* Suggestions awaiting review take over the top of the tab until they are handled. */}
      <DetectionReviewPanel />

      <div className="room-create-row">
        <button
          className={`btn-primary ${toolMode === 'draw' ? 'active' : ''}`}
          onClick={() => setToolMode(toolMode === 'draw' ? 'select' : 'draw')}
          title="סימון חדר כפוליגון על גבי התוכנית"
        >
          + סימון חדר
        </button>
        <button
          className={`btn-secondary small ${toolMode === 'draw-rect' ? 'active' : ''}`}
          onClick={() => setToolMode(toolMode === 'draw-rect' ? 'select' : 'draw-rect')}
          title="סימון חדר כמלבן"
          aria-label="סימון חדר כמלבן"
        >
          <Icon name="rectangle" />
        </button>
        <button
          className={`btn-secondary small ${showDetection ? 'active' : ''}`}
          onClick={() => setShowDetection((v) => !v)}
          title="זיהוי אוטומטי של חדרים — מציע אזורים לאישור"
          aria-label="זיהוי אוטומטי"
        >
          <Icon name="scan" />
        </button>
      </div>

      {/* Workspace state, not a form field: this is the apartment being worked in, and the sentence
          that used to repeat the selected value under it is gone — the value itself says it. */}
      <div className="active-apartment-row">
        <label htmlFor="active-apartment">עובד בדירה</label>
        <select
          id="active-apartment"
          value={activeApartmentNumber}
          title="חדרים חדשים ישויכו לדירה הזו"
          onChange={(e) => {
            if (e.target.value === '__new__') createApartment();
            else setActiveApartmentNumber(e.target.value);
          }}
        >
          <option value="">ללא שיוך</option>
          {apartmentNumbers.map((a) => (
            <option key={a} value={a}>
              דירה {a}
            </option>
          ))}
          {activeApartmentNumber && !apartmentNumbers.includes(activeApartmentNumber) && (
            <option value={activeApartmentNumber}>דירה {activeApartmentNumber}</option>
          )}
          <option value="__new__">+ דירה חדשה…</option>
        </select>
      </div>

      <div className="room-list">
        <span className="section-label">אזורים שסומנו ({project.rooms.length})</span>
        {project.rooms.length === 0 && (
          <div className="empty-state">
            <Icon name="polygon" size={28} />
            <p>עדיין לא סומנו חדרים. בחר "סימון חדר" וסמן את קווי המתאר על גבי התוכנית.</p>
          </div>
        )}

        {groups.map((group) => {
          const isActive = group.apartmentNumber === activeApartmentNumber;
          const isUnassigned = !group.apartmentNumber;
          return (
            <div key={group.apartmentNumber || '__unassigned__'} className={`apartment-group ${isActive ? 'active' : ''}`}>
              <div className="apartment-group-head">
                {/* The active apartment is marked by the group's EDGE and a stronger header — never
                    by tinting the whole group, which is what used to swallow the selected room. */}
                <button
                  className="apartment-group-title"
                  onClick={() => setActiveApartmentNumber(group.apartmentNumber)}
                  title={isUnassigned ? 'עבוד ללא שיוך לדירה' : `הפוך את דירה ${group.apartmentNumber} לדירה הפעילה`}
                >
                  {isUnassigned ? 'ללא שיוך' : `דירה ${group.apartmentNumber}`}
                  <span className="apartment-group-count">{group.rooms.length}</span>
                  {isActive && <span className="apartment-active-flag">פעילה</span>}
                </button>
                {!isUnassigned && (
                  <button
                    className="icon-btn"
                    title={`שכפל את דירה ${group.apartmentNumber}`}
                    onClick={() => setApartmentDialogSource(group.apartmentNumber)}
                  >
                    <Icon name="copy" />
                  </button>
                )}
              </div>
              <ul>
                {group.rooms.map((r) => (
                  <li key={r.id} className={r.id === selectedRoomId ? 'active' : ''} onClick={() => selectRoom(r.id, r.pageNumber)}>
                    <span className="color-dot" style={{ background: r.color }} />
                    <span className="room-list-name">{r.name || 'חדר ללא שם'}</span>
                    {r.detectionConfidence === 'low' && (
                      <span className="room-review-flag" title="זוהה אוטומטית — מומלץ לבדוק">
                        <Icon name="alert" size={13} />
                      </span>
                    )}
                    {/* The page number is only information when it is NOT the page on screen. */}
                    {r.pageNumber !== currentPage && <span className="room-list-page">עמוד {r.pageNumber}</span>}
                    {/* Row actions appear on hover and on keyboard focus, so they stop competing
                        with the room name while staying reachable by tab. */}
                    <span className="room-row-actions">
                      <button
                        className="icon-btn"
                        title="שכפל אזור"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateRoom(r.id);
                        }}
                      >
                        <Icon name="copy" />
                      </button>
                      <button
                        className="icon-btn danger"
                        title="מחק אזור"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`למחוק את "${r.name}"?`)) deleteRoom(r.id);
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Room details are a separate view — the list stays a list, however many apartments it holds. */}

      {/* Auto detection is a secondary path: its launcher only appears when asked for. */}
      {showDetection && <AutoDetectPanel />}

      {apartmentDialogSource !== null && (
        <DuplicateApartmentDialog
          project={project}
          sourceApartmentNumber={apartmentDialogSource}
          onClose={() => setApartmentDialogSource(null)}
        />
      )}
    </div>
  );
}

function RoomDetail({
  room,
  project,
  calibration,
  onUpdate,
  onRoomTypeChange,
  onAddWorkItem,
  onUpdateWorkItem,
  onRemoveWorkItem,
}: {
  room: import('../types').Room;
  /** The whole project, so quantities and default waste come from the shared helpers in lib/quantities. */
  project: Project;
  calibration: import('../types').Calibration | null;
  onUpdate: (patch: Partial<import('../types').Room>) => void;
  onRoomTypeChange: (roomType: string | null) => 'created' | 'kept' | 'none';
  onAddWorkItem: (type: WorkType) => void;
  onUpdateWorkItem: (itemId: string, patch: Partial<import('../types').WorkItem>) => void;
  onRemoveWorkItem: (itemId: string) => void;
}) {
  const { areaM2, perimeterM } = roomMetrics(room, calibration);
  // Same test the quantity code uses, so the warning and the numbers can never disagree.
  const noCalibration = !isPageCalibrated(project, room.pageNumber);
  // Shown once after a type change that deliberately left existing work items alone.
  const [typeNotice, setTypeNotice] = useState<string | null>(null);

  const onSetRoomType = (key: string | null) => {
    const outcome = onRoomTypeChange(key);
    setTypeNotice(outcome === 'kept' ? 'סוג החדר עודכן. פריטי העבודה הקיימים לא שונו.' : null);
  };

  return (
    <div className="room-detail">
      {/* The page-status strip already announces an uncalibrated page. This warning stays because
          it reports something else: THESE results are unavailable, right where they are missing. */}
      {noCalibration && <div className="warning-box">לא ניתן לחשב את כמויות החדר עד לכיול קנה המידה בעמוד זה.</div>}
      {/* Without a scale these are not "0" — they are simply not computable yet. */}
      <div className="metrics-row">
        <div>
          <span className="metric-label">שטח</span>
          <span className={`metric-value ${noCalibration ? 'cal-missing' : ''}`}>
            {noCalibration ? NOT_CALIBRATED : `${round(areaM2, 2)} מ"ר`}
          </span>
        </div>
        <div>
          <span className="metric-label">היקף</span>
          <span className={`metric-value ${noCalibration ? 'cal-missing' : ''}`}>
            {noCalibration ? NOT_CALIBRATED : `${round(perimeterM, 2)} מ'`}
          </span>
        </div>
      </div>

      {/* Name and apartment share a row — 360px carries both, and the panel stops being a column
          of full-width fields. Editing the apartment regroups the room in the list immediately. */}
      <div className="form-grid">
        <div className="form-row">
          <label>שם חדר</label>
          <input value={room.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        </div>
        <div className="form-row">
          <label>דירה</label>
          <input
            value={room.apartmentNumber}
            onChange={(e) => onUpdate({ apartmentNumber: e.target.value })}
            placeholder="ללא שיוך"
          />
        </div>
      </div>
      {/* Type is a classification, not the name: picking one never rewrites the name above. */}
      <div className="form-row">
        <label>סוג חדר</label>
        <select value={room.roomType ?? ''} onChange={(e) => onSetRoomType(e.target.value || null)}>
          <option value="">ללא סיווג / מותאם אישית</option>
          {/* A saved type that is not in the catalogue keeps its own option, so opening the picker never silently drops it. */}
          {room.roomType && !ROOM_PROFILES.some((p) => p.key === room.roomType) && (
            <option value={room.roomType}>{room.roomType}</option>
          )}
          {ROOM_PROFILES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>
      {typeNotice && <p className="muted">{typeNotice}</p>}
      {!room.roomType && room.detectedType && (
        <p className="muted">זוהה אוטומטית כ"{roomProfileLabel(room.detectedType)}" — בחר סוג כדי לאשר.</p>
      )}

      <div className="form-row">
        <label>הערות</label>
        <textarea value={room.notes} onChange={(e) => onUpdate({ notes: e.target.value })} rows={2} />
      </div>

      <span className="section-label">סוגי עבודה</span>
      <div className="work-item-add-row">
        {WORK_TYPES.map((t) => (
          <button key={t} className="btn-secondary small" onClick={() => onAddWorkItem(t)}>
            <Icon name="plus" size={13} />
            {WORK_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <ul className="work-item-list">
        {room.workItems.map((item) => {
          const qty = itemQuantityM2(item, areaM2, perimeterM, project);
          const lengthM = itemLengthM(item, perimeterM);
          const waste = effectiveWastePercent(item, project);
          const orderQty = qty * (1 + waste / 100);
          return (
            <li key={item.id}>
              <div className="work-item-header">
                <strong>{WORK_TYPE_LABELS[item.type]}</strong>
                <button className="icon-btn danger" title="הסר סוג עבודה" onClick={() => onRemoveWorkItem(item.id)}>
                  <Icon name="trash" />
                </button>
              </div>

              {/* The calculated result is the reason this card exists, so it comes FIRST and in the
                  strongest type in the card. The inputs that feed it follow, compact and quieter. */}
              {noCalibration ? (
                <div className="work-item-result cal-missing">לא ניתן לחשב כמות עד לכיול העמוד</div>
              ) : (
                <div className="wi-metrics">
                  {/* Panels are read twice: running metres (the room perimeter) and m², each with
                      the same waste applied. Other work types have no linear reading. */}
                  {lengthM != null && (
                    <>
                      <span className="wi-metric">
                        <span className="wi-metric-label">אורך</span>
                        <span className="wi-metric-value">
                          {round(lengthM, 2)} {PANEL_LENGTH_UNIT}
                        </span>
                      </span>
                      <span className="wi-metric order">
                        <span className="wi-metric-label">להזמנה</span>
                        <span className="wi-metric-value">
                          {round(lengthM * (1 + waste / 100), 2)} {PANEL_LENGTH_UNIT}
                        </span>
                      </span>
                    </>
                  )}
                  <span className="wi-metric">
                    <span className="wi-metric-label">{lengthM != null ? 'שטח' : 'כמות'}</span>
                    <span className="wi-metric-value">
                      {round(qty, 2)} {WORK_TYPE_UNITS[item.type]}
                    </span>
                  </span>
                  <span className="wi-metric order">
                    <span className="wi-metric-label">להזמנה</span>
                    <span className="wi-metric-value">
                      {round(orderQty, 2)} {WORK_TYPE_UNITS[item.type]}
                    </span>
                  </span>
                </div>
              )}

              <div className="wi-controls">
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
                    value={item.heightM ?? project.defaultCladdingHeightM}
                    onChange={(e) => onUpdateWorkItem(item.id, { heightM: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              )}
              {/* Panels follow the project default until a height is typed here, which overrides it for this item only. */}
              {item.type === 'panels' && (
                <div className="form-row inline">
                  <label>גובה פנל (מ')</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={effectivePanelHeightM(item, project)}
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
                  // Clearing the field drops the override (back to the project default) instead of
                  // storing NaN, which would poison this room's quantities and the whole report.
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onUpdateWorkItem(item.id, { wastePercent: Number.isFinite(parsed) ? parsed : undefined });
                  }}
                />
              </div>
              </div>
            </li>
          );
        })}
        {room.workItems.length === 0 && (
          <div className="empty-state">
            <Icon name="wall" size={24} />
            <p>הוסף סוג עבודה — ריצוף, חיפוי או פנלים — כדי לחשב את כמויות החדר.</p>
          </div>
        )}
      </ul>
    </div>
  );
}

/**
 * Step 1 of duplicating an apartment: pick source, target number and target page, acknowledge any
 * calibration warning, then hand over to placement mode — the click on the plan does the rest.
 * An "apartment" here is simply every room sharing an apartmentNumber; no new entity is involved.
 */
function DuplicateApartmentDialog({
  project,
  sourceApartmentNumber,
  onClose,
}: {
  project: Project;
  /** Pre-selected from the apartment group the user opened this from; still switchable here. */
  sourceApartmentNumber: string;
  onClose: () => void;
}) {
  const duplicateApartment = useAppStore((s) => s.duplicateApartment);

  const apartments = apartmentNumbersInProject(project);
  const [source, setSource] = useState(sourceApartmentNumber || apartments[0] || '');
  const [target, setTarget] = useState('');

  const roomCount = project.rooms.filter((r) => r.apartmentNumber === source).length;
  const warnings = apartmentDuplicationWarnings(project, source);
  const targetExists = !!target.trim() && project.rooms.some((r) => r.apartmentNumber === target.trim());
  const canDuplicate = !!source && !!target.trim();

  const run = () => {
    const targetNumber = target.trim();
    // An existing target number is not an error — it just means the rooms join that apartment.
    if (targetExists && !confirm(`דירה ${targetNumber} כבר קיימת בפרויקט. השכפול יוסיף אליה חדרים נוספים. להמשיך?`)) return;
    duplicateApartment(source, targetNumber);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>שכפול דירה</h3>
        <div className="form-row">
          <label>דירת מקור</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {apartments.map((a) => (
              <option key={a} value={a}>
                דירה {a}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          {roomCount} חדרים ישוכפלו עם הגיאומטריה, סוגי העבודה והכמויות שלהם, תחת מספר הדירה החדש.
        </p>

        <div className="form-row">
          <label>מספר דירת יעד</label>
          <input
            autoFocus
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canDuplicate) run();
            }}
            placeholder="לדוגמה: 13"
          />
        </div>

        {warnings.map((w) => (
          <div className="warning-box" key={w}>
            {w}
          </div>
        ))}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            ביטול
          </button>
          <button className="btn-primary" onClick={run} disabled={!canDuplicate}>
            שכפל דירה
          </button>
        </div>
      </div>
    </div>
  );
}
