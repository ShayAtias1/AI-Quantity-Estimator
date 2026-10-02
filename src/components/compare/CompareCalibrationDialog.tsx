import { useState } from 'react';
import { useT } from '../../i18n';
import { useCompareStore } from '../../store/compareStore';

export default function CompareCalibrationDialog() {
  const calibrationPoints = useCompareStore((s) => s.calibrationPoints);
  const calibrationLayer = useCompareStore((s) => s.calibrationLayer);
  const applyCalibration = useCompareStore((s) => s.applyCalibration);
  const clearCalibration = useCompareStore((s) => s.clearCalibration);
  const [value, setValue] = useState('');
  const t = useT();

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
        <h3>{calibrationLayer === 'original' ? t('calibration.titleOriginal') : t('calibration.titleRevised')}</h3>
        <p>{t('calibration.instructions')}</p>
        <div className="form-row">
          <label>{t('calibration.distanceLabel')}</label>
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('calibration.distancePlaceholder')}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => clearCalibration()}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={submit} disabled={!value}>
            {t('calibration.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
