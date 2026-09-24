import { BookOpen, Bot, Camera, ClipboardList, FileText, LayoutDashboard, Map, MonitorPlay, Radio, Settings, Siren, Truck, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { useApp } from '../context';
import type { PageKey } from '../types';
import type { TKey } from '../i18n';

const GROUPS: { title: TKey; items: { key: PageKey; icon: ComponentType<{ className?: string }> }[] }[] = [
  { title: 'nav.group.ops', items: [{ key: 'dashboard', icon: LayoutDashboard }, { key: 'map', icon: Map }, { key: 'briefing', icon: Radio }, { key: 'resources', icon: Truck }] },
  { title: 'nav.group.ai', items: [{ key: 'assistant', icon: Bot }, { key: 'photo', icon: Camera }, { key: 'kb', icon: BookOpen }, { key: 'analysis', icon: ClipboardList }] },
  { title: 'nav.group.training', items: [{ key: 'simulator', icon: Siren }, { key: 'report', icon: FileText }] },
  { title: 'nav.group.system', items: [{ key: 'presentation', icon: MonitorPlay }, { key: 'settings', icon: Settings }] },
];

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, navigate, t, settings, backend } = useApp();
  const h = backend.health;
  const go = (p: PageKey) => { navigate(p); onClose(); };
  const statusDot = settings.demoMode ? 'bg-signal-amber' : backend.state === 'online' ? (h?.aiMode === 'live' ? 'bg-emerald-400' : 'bg-orange-400') : 'bg-red-500';
  const statusText = settings.demoMode ? t('mode.demo') : backend.state === 'online' ? (h?.aiMode === 'live' ? t('mode.sideLiveModel') : t('mode.sideLiveMock')) : t('mode.sideOffline');
  return (
    <>
      {open && <div className="fixed inset-0 z-[1150] bg-navy-950/60 lg:hidden" onClick={onClose} />}
      <aside className={`no-print fixed inset-y-0 left-0 z-[1200] flex w-64 flex-col border-r border-white/10 bg-navy-950 transition-transform lg:static lg:z-auto lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between px-4 lg:hidden">
          <span className="font-cond text-lg font-bold tracking-[0.08em] text-white">QUTQAR AI</span>
          <button onClick={onClose} className="rounded p-2 text-slate-300 hover:bg-white/10" aria-label={t('nav.close')}><X className="h-5 w-5" /></button>
        </div>
        <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto px-3 py-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{t(g.title)}</div>
              <ul className="space-y-0.5">
                {g.items.map(({ key, icon: Icon }) => {
                  const active = page === key;
                  return (
                    <li key={key}>
                      <button onClick={() => go(key)} aria-current={active ? 'page' : undefined}
                        className={`relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? 'bg-white/10 font-semibold text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                        {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded bg-signal-red" aria-hidden />}
                        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-signal-amber' : ''}`} />{t(`nav.${key}` as TKey)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className={`m-3 rounded-md border p-3 text-xs ${settings.demoMode ? 'border-signal-amber/40 bg-signal-amber/10 text-amber-100' : 'border-white/10 bg-navy-900 text-slate-400'}`}>
          <div className="flex items-center gap-2 font-semibold text-slate-100"><span className={`status-dot is-live ${statusDot}`} />{statusText}</div>
          <p className="mt-1.5 leading-snug">{settings.demoMode ? t('mode.sideDemo') : t('mode.sideLive')}</p>
          <p className="mt-1.5 text-slate-500">v0.3.0 · prototype</p>
        </div>
      </aside>
    </>
  );
}
