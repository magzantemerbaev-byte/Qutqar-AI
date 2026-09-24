import { Bell, ChevronDown, FlaskConical, LogOut, Menu, MonitorPlay, Server, Settings as SettingsIcon, User } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { Logo } from './ui';
import { PUBLIC_DEMO, useApp, type Lang } from '../context';
import type { PageKey } from '../types';
import { L, tx, type L3 } from '../../shared/i18n';
import { fmtLongDate, fmtTime, TZ_LABEL } from '../i18n';

interface Notice { id: number; text: L3; time: string; page: PageKey; urgent?: boolean }
/** DEMO-уведомления (вымышлены); в LIVE-режиме не показываются */
const DEMO_NOTICES: Notice[] = [
  { id: 1, text: L('Степной пожар: площадь увеличилась до ≈ 45 га', 'Дала өрті: аумағы ≈ 45 га-ға дейін ұлғайды', 'Steppe fire: area has grown to ≈ 45 ha'), time: '10:58', page: 'map', urgent: true },
  { id: 2, text: L('Уровень воды р. Есиль: +38 см за сутки', 'Есіл өзенінің су деңгейі: тәулігіне +38 см', 'Yesil River level: +38 cm per day'), time: '10:30', page: 'map', urgent: true },
  { id: 3, text: L('Лесной пожар у г. Семей: угроза дачному массиву', 'Семей қ. маңындағы орман өрті: саяжай алқабына қауіп', 'Forest fire near Semey: threat to a dacha area'), time: '13:24', page: 'briefing', urgent: true },
  { id: 4, text: L('Оперативно-спасательный отряд выехал на ДТП', 'Жедел-құтқару жасағы ЖКО-ға шықты', 'Rescue detachment dispatched to a road accident'), time: '12:07', page: 'resources' },
];
const LANGS: { v: Lang; label: string }[] = [{ v: 'ru', label: 'RU' }, { v: 'kz', label: 'KZ' }, { v: 'en', label: 'EN' }];

/** Часы по времени Астаны (UTC+5). Вынесены отдельно, чтобы ежесекундное обновление не перерисовывало шапку. */
const Clock = memo(function Clock() {
  const { lang } = useApp();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="hidden text-right leading-tight lg:block" title={TZ_LABEL[lang]}>
      <div className="font-cond text-lg font-semibold tabular-nums text-white">{fmtTime(now, true)}</div>
      <div className="text-[11px] text-slate-400">{fmtLongDate(now, lang)} · UTC+5</div>
    </div>
  );
});

export default function Header({ onMenu }: { onMenu: () => void }) {
  const { t, lang, settings, updateSettings, navigate } = useApp();
  const [read, setRead] = useState<Set<number>>(new Set());
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
      if (profRef.current && !profRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const shown = settings.demoMode ? DEMO_NOTICES : [];
  const unread = settings.notifications ? shown.filter((n) => !read.has(n.id)).length : 0;

  return (
    <header className="no-print relative z-[1100] flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-navy-950 px-3 sm:px-5">
      <button onClick={onMenu} className="rounded p-2 text-slate-200 hover:bg-white/10 lg:hidden" aria-label={t('nav.menu')}><Menu className="h-5 w-5" /></button>
      <button onClick={() => navigate('dashboard')} className="flex min-w-0 items-center gap-3 text-left" aria-label={t('app.home')}>
        <Logo />
        <div className="hidden min-w-0 overflow-hidden sm:block">
          <div className="flex items-baseline gap-2">
            <span className="whitespace-nowrap font-cond text-xl font-bold tracking-[0.08em] text-white">QUTQAR AI</span>
            <span className="hidden whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-slate-400 xl:inline">{t('app.tagline')}</span>
          </div>
          <div className="hidden truncate text-xs text-slate-300 lg:block">{t('app.subtitle')}</div>
        </div>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        <button onClick={() => navigate('presentation')} className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/15 hover:bg-white/10 md:flex" title={t('nav.presentation')}>
          <MonitorPlay className="h-4 w-4" />{t('nav.presentation')}
        </button>
        <button
          onClick={() => { if (PUBLIC_DEMO) return; if (settings.demoMode) setConfirmLive(true); else updateSettings({ demoMode: true }); }}
          aria-disabled={PUBLIC_DEMO}
          className={`flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-bold ring-1 transition-colors ${PUBLIC_DEMO ? 'cursor-default' : ''} ${settings.demoMode ? 'bg-signal-amber text-navy-950 ring-signal-amber hover:bg-amber-400' : 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/50 hover:bg-emerald-500/25'}`}
          role="switch" aria-checked={settings.demoMode} aria-label={t('header.demoSwitch')} title={PUBLIC_DEMO ? t('header.publicDemo') : settings.demoMode ? t('header.demoOnHint') : t('header.liveHint')}>
          {settings.demoMode ? <FlaskConical className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{settings.demoMode ? 'DEMO' : 'LIVE'}</span>
          <span className={`relative h-4 w-7 rounded-full ${settings.demoMode ? 'bg-navy-950/40' : 'bg-emerald-400/40'}`} aria-hidden>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${settings.demoMode ? 'left-0.5' : 'left-3.5'}`} />
          </span>
        </button>
        <Clock />
        <div className="flex rounded-md bg-white/5 p-0.5 ring-1 ring-white/10" role="group" aria-label={t('header.language')}>
          {LANGS.map((l) => (
            <button key={l.v} onClick={() => updateSettings({ lang: l.v })} aria-pressed={lang === l.v}
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold sm:px-2 ${lang === l.v ? 'bg-white text-navy-900' : 'text-slate-300 hover:text-white'}`}>{l.label}</button>
          ))}
        </div>

        <div className="relative" ref={bellRef}>
          <button onClick={() => setBellOpen((v) => !v)} className="relative rounded p-2 text-slate-200 hover:bg-white/10" aria-label={t('header.notifications')}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-red px-1 text-[10px] font-bold text-white">{unread}</span>}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
                <span className="font-semibold text-slate-900">{t('header.notifications')}</span>
                {unread > 0 && <button className="text-xs font-medium text-navy-600 hover:underline" onClick={() => setRead(new Set(shown.map((n) => n.id)))}>{t('header.markAll')}</button>}
              </div>
              {!settings.notifications ? <p className="px-4 py-6 text-center text-sm text-slate-500">{t('header.notifOff')}</p>
                : shown.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-500">{t('header.noNotif')}. {t('header.notifLive')}.</p> : (
                  <ul className="max-h-80 overflow-y-auto">
                    {shown.map((n) => (
                      <li key={n.id}>
                        <button onClick={() => { setRead((r) => new Set(r).add(n.id)); setBellOpen(false); navigate(n.page); }}
                          className={`flex w-full gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${read.has(n.id) ? 'opacity-60' : ''}`}>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.urgent ? 'bg-signal-red' : 'bg-navy-500'}`} />
                          <span className="flex-1 text-slate-800">{tx(lang, n.text)}<span className="mt-0.5 block text-xs text-slate-500">{n.time} · DEMO</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          )}
        </div>

        <div className="relative" ref={profRef}>
          <button onClick={() => setProfileOpen((v) => !v)} className="flex items-center gap-2 rounded p-1.5 text-slate-200 hover:bg-white/10" aria-label={t('header.profile')}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 ring-1 ring-white/20"><User className="h-4 w-4" /></span>
            <span className="hidden text-left leading-tight xl:block"><span className="block text-sm font-medium text-white">{settings.operator}</span><span className="block text-[11px] text-slate-400">{t('header.role')}</span></span>
            <ChevronDown className="hidden h-4 w-4 xl:block" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg bg-white py-1 shadow-2xl ring-1 ring-black/5">
              <div className="border-b border-slate-100 px-4 py-2"><div className="text-sm font-semibold text-slate-900">{settings.operator}</div><div className="text-xs text-slate-500">{t('header.role')}</div></div>
              <button onClick={() => { setProfileOpen(false); navigate('settings'); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"><SettingsIcon className="h-4 w-4" />{t('nav.settings')}</button>
              <button onClick={() => { setProfileOpen(false); navigate('presentation'); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 md:hidden"><MonitorPlay className="h-4 w-4" />{t('nav.presentation')}</button>
              <button onClick={() => { setProfileOpen(false); setLogoutOpen(true); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />{t('header.logout')}</button>
            </div>
          )}
        </div>
      </div>

      <Modal open={confirmLive} onClose={() => setConfirmLive(false)} title={t('header.confirmTitle')}
        footer={<><button className="btn-ghost" onClick={() => setConfirmLive(false)}>{t('header.stayDemo')}</button><button className="btn-navy" onClick={() => { updateSettings({ demoMode: false }); setConfirmLive(false); }}>{t('header.goLive')}</button></>}>
        <div className="space-y-2 text-sm text-slate-700">
          <p>{t('header.confirm1')}</p>
          <ul className="list-disc space-y-1 pl-5"><li>{t('header.confirm2')}</li><li>{t('header.confirm3')}</li><li>{t('header.confirm4')}</li></ul>
        </div>
      </Modal>
      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title={t('header.logoutTitle')}
        footer={<><button className="btn-ghost" onClick={() => setLogoutOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" onClick={() => { setLogoutOpen(false); navigate('dashboard'); }}>{t('header.logout')}</button></>}>
        <p className="text-sm text-slate-700">{t('header.logoutText')}</p>
      </Modal>
    </header>
  );
}
