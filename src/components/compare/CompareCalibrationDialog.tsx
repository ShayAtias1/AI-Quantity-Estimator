import { useState } from 'react';
import { useCompareStore } from '../../store/compareStore';

export default function CompareCalibrationDialog() {
  const calibrationPoints = useCompareStore((s) => s.calibrationPoints);
  const calibrationLayer = useCompareStore((s) => s.calibrationLayer);
  const applyCalibration = useCompareStore((s) => s.applyCalibration);
  const clearCalibration = useCompareStore((s) => s.clearCalibration);
  const [value, setValue] = useState('');

  if (calibrationPoints.length !== 2 || !calibrationLayer) return null;

  const submit = () => {
    const meters = parseFloat(value.replace(',', '.'));
    if (!meters || meters <= 0) return;
    applyCalibration(meters);
    setValue('');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal calibration-modal">
        <h3>כיול קנה מידה — {calibrationLayer === 'original' ? 'תוכנית מקור' : 'תוכנית מעודכנת'}</h3>
        <p>הזן את המרחק האמיתי במטרים בין שתי הנקודות שסימנת בתוכנית.</p>
        <div className="form-row">
          <label>מרחק אמיתי (מטר)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="לדוגמה: 5.00"
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => clearCalibration()}>
            ביטול
          </button>
          <button className="btn-primary" onClick={submit} disabled={!value}>
            אישור כיול
          </button>
        </div>
      </div>
    </div>
  );
}
