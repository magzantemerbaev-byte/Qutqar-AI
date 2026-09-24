import type { ObjectType, ThreatLevel } from '../types';
import { L, type L3 } from '../../shared/i18n';

export const TYPE_META: Record<ObjectType, { label: L3; plural: L3; emoji: string; color: string }> = {
  fire: { label: L('Пожар', 'Өрт', 'Fire'), plural: L('Пожары', 'Өрттер', 'Fires'), emoji: '🔥', color: '#C4320A' },
  flood: { label: L('Паводок / подтопление', 'Су тасқыны / су басу', 'Flood'), plural: L('Паводки', 'Су тасқындары', 'Floods'), emoji: '🌊', color: '#1D63D8' },
  accident: { label: L('ДТП', 'ЖКО', 'Road accident'), plural: L('ДТП', 'ЖКО', 'Road accidents'), emoji: '🚗', color: '#B54708' },
  hazard: { label: L('Опасный объект', 'Қауіпті нысан', 'Hazardous site'), plural: L('Опасные объекты', 'Қауіпті нысандар', 'Hazardous sites'), emoji: '⚠️', color: '#6938EF' },
  unit: { label: L('Спасательное подразделение', 'Құтқару бөлімшесі', 'Rescue unit'), plural: L('Подразделения', 'Бөлімшелер', 'Units'), emoji: '🚒', color: '#0E7C66' },
  hospital: { label: L('Медицинское учреждение', 'Медициналық мекеме', 'Hospital'), plural: L('Больницы', 'Ауруханалар', 'Hospitals'), emoji: '🏥', color: '#475467' },
  water: { label: L('Источник воды', 'Су көзі', 'Water source'), plural: L('Водоисточники', 'Су көздері', 'Water sources'), emoji: '💧', color: '#0086C9' },
};

export const INCIDENT_TYPES: ObjectType[] = ['fire', 'flood', 'accident', 'hazard'];

export const THREAT_META: Record<ThreatLevel, { key: 'threat.low' | 'threat.medium' | 'threat.high' | 'threat.critical'; className: string; bar: string; color: string }> = {
  low: { key: 'threat.low', className: 'bg-emerald-50 text-emerald-800 ring-emerald-600/30', bar: 'bg-emerald-500', color: '#12B76A' },
  medium: { key: 'threat.medium', className: 'bg-amber-50 text-amber-800 ring-amber-600/30', bar: 'bg-amber-500', color: '#F79009' },
  high: { key: 'threat.high', className: 'bg-red-50 text-red-800 ring-red-600/30', bar: 'bg-red-600', color: '#D92D20' },
  critical: { key: 'threat.critical', className: 'bg-red-700 text-white ring-red-800', bar: 'bg-red-800', color: '#912018' },
};
