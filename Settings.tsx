import { Bell, Cpu, FlaskConical, Globe, Map as MapIcon, RefreshCw, RotateCcw, Settings as SettingsIcon, ShieldCheck, User } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import Modal from '../components/Modal';
import { PageHeader } from '../components/ui';
import { PUBLIC_DEMO, useApp, type Lang, type MapStyle } from '../context';
import { API_BASE } from '../services/aiService';
import { fmtDateTime, fmtKZT, fmtLongDate } from '../i18n';

const LANGS: { v: Lang; label: string }[] = [{ v: 'ru', label: 'Русский' }, { v: 'kz', label: 'Қазақ тілі' }, { v: 'en', label: 'English' }];
const MAPS: MapStyle[] = ['light', 'osm', 'dark'];

function Card({ icon: Icon, title, hint, children }: { icon: ComponentType<{ className?: string }>; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-cond text-lg font-semibold text-slate-900"><Icon className="h-5 w-5 text-navy-600" />{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-slate-500">{hint}</p>}
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings, backend, checkBackend, t, lang } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const [saved, setSaved] = useState(false);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };
  const upd: typeof updateSettings = (p) => { updateSettings(p); flash(); };
  const h = backend.health;
  const now = new Date();

  return (
    <>
      <PageHeader icon={<SettingsIcon className="h-5 w-5" />} title={t('set.title')} subtitle={t('set.subtitle')}
        actions={saved && <span className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200" role="status">{t('common.saved')}</span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card icon={Globe} title={t('set.lang')} hint={t('set.langHint')}>
          <div className="flex flex-wrap gap-2">{LANGS.map((l) => <button key={l.v} className={settings.lang === l.v ? 'btn-navy' : 'btn-ghost'} onClick={() => upd({ lang: l.v })} aria-pressed={settings.lang === l.v}>{l.label}</button>)}</div>
          <p className="mt-3 text-xs text-slate-500">{fmtLongDate(now, lang, true)} · {fmtDateTime(now)} (UTC+5) · {fmtKZT(125000, lang)}</p>
        </Card>
        <Card icon={FlaskConical} title={t('set.demo')} hint={t('set.demoHint')}>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-signal-amber" checked={settings.demoMode} disabled={PUBLIC_DEMO} onChange={(e) => upd({ demoMode: e.target.checked })} />
            <span><strong>{t('set.demoOn')}</strong> — {t('set.demoText')}<span className="mt-1 block text-slate-500">{t('set.demoOff')}</span></span>
          </label>
          {PUBLIC_DEMO && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{t('header.publicDemo')}</p>}
          <div className="mt-3">
            <div className="label">{t('set.speed')}</div>
            <div className="flex gap-2">
              <button className={settings.aiSpeed === 'realistic' ? 'btn-navy' : 'btn-ghost'} onClick={() => upd({ aiSpeed: 'realistic' })}>{t('set.speed.real')}</button>
              <button className={settings.aiSpeed === 'fast' ? 'btn-navy' : 'btn-ghost'} onClick={() => upd({ aiSpeed: 'fast' })}>{t('set.speed.fast')}</button>
            </div>
          </div>
        </Card>
        <Card icon={MapIcon} title={t('set.map')} hint={t('set.mapHint')}>
          <div className="flex flex-wrap gap-2">{MAPS.map((m) => <button key={m} className={settings.mapStyle === m ? 'btn-navy' : 'btn-ghost'} onClick={() => upd({ mapStyle: m })}>{t(`set.map.${m}`)}</button>)}</div>
        </Card>
        <Card icon={Bell} title={t('set.notif')} hint={t('set.notifHint')}>
          <label className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-signal-red" checked={settings.notifications} onChange={(e) => upd({ notifications: e.target.checked })} />{t('set.notifLabel')}</label>
        </Card>
        <Card icon={User} title={t('set.operator')} hint={t('set.operatorHint')}>
          <input className="input" value={settings.operator} onChange={(e) => updateSettings({ operator: e.target.value })} onBlur={flash} aria-label={t('set.operator')} />
        </Card>
        <Card icon={Cpu} title={t('set.backend')} hint={t('set.backendHint')}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.address')}</dt><dd className="font-medium text-slate-800">{API_BASE || t('set.sameOrigin')}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.state')}</dt>
              <dd className={`font-semibold ${backend.state === 'online' ? 'text-emerald-700' : backend.state === 'offline' ? 'text-red-700' : 'text-slate-500'}`}>{t(`set.st.${backend.state}`)}</dd></div>
            {h && <>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.model')}</dt><dd className={`font-semibold ${h.aiMode === 'live' ? 'text-emerald-700' : 'text-amber-700'}`}>{h.aiMode === 'live' ? `${h.provider} / ${h.model}` : t('mode.mock')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.vision')}</dt><dd className="font-medium text-slate-800">{h.visionModel === '—' ? t('mode.mock') : h.visionModel}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.kbStat')}</dt><dd className="font-medium text-slate-800">{t('set.kbValue', { d: h.kb.documents, o: h.kb.official, c: h.kb.chunks })}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('set.embeddings')}</dt><dd className="font-medium text-slate-800">{h.embeddings}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">{t('mode.ops')}</dt><dd className="font-medium text-slate-800">{h.operationalData ? t('mode.connected') : t('mode.notConnected')}</dd></div>
            </>}
            {backend.error && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">{backend.error}</p>}
          </dl>
          <button className="btn-ghost mt-3" onClick={() => void checkBackend()}><RefreshCw className="h-4 w-4" />{t('set.check')}</button>
        </Card>
        <Card icon={ShieldCheck} title={t('set.safety')}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700"><li>{t('set.s1')}</li><li>{t('set.s2')}</li><li>{t('set.s3')}</li><li>{t('set.s4')}</li></ul>
          <button className="btn-ghost mt-4" onClick={() => setConfirmReset(true)}><RotateCcw className="h-4 w-4" />{t('set.reset')}</button>
        </Card>
      </div>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t('set.resetTitle')}
        footer={<><button className="btn-ghost" onClick={() => setConfirmReset(false)}>{t('common.cancel')}</button><button className="btn-primary" onClick={() => { resetSettings(); setConfirmReset(false); flash(); }}>{t('set.reset')}</button></>}>
        <p className="text-sm text-slate-700">{t('set.resetText')}</p>
      </Modal>
    </>
  );
}
