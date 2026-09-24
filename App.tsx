import { FlaskConical, RefreshCw, Server, WifiOff } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import { Spinner } from './components/ui';
import { useApp } from './context';

// Код-сплиттинг: каждая страница — отдельный чанк (быстрая первая загрузка)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Briefing = lazy(() => import('./pages/Briefing'));
const Resources = lazy(() => import('./pages/Resources'));
const Assistant = lazy(() => import('./pages/Assistant'));
const Simulator = lazy(() => import('./pages/Simulator'));
const PhotoAnalysis = lazy(() => import('./pages/PhotoAnalysis'));
const EmergencyMap = lazy(() => import('./pages/EmergencyMap'));
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'));
const IncidentAnalysis = lazy(() => import('./pages/IncidentAnalysis'));
const ReportGenerator = lazy(() => import('./pages/ReportGenerator'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const Presentation = lazy(() => import('./pages/Presentation'));

function ModeBanner() {
  const { settings, backend, checkBackend, t, online } = useApp();
  if (settings.demoMode) {
    return (
      <div className="no-print border-b border-signal-amber/50 bg-navy-950" role="status">
        <div className="demo-stripes h-1" aria-hidden />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 text-center text-xs text-amber-100">
          <span className="inline-flex items-center gap-1.5 rounded bg-signal-amber px-2 py-0.5 font-bold text-navy-950"><FlaskConical className="h-3.5 w-3.5" />{t('mode.demo')}</span>
          <span>{t('mode.demoBanner')} <strong>{t('mode.demoStrong')}</strong></span>
          {!online && <span className="inline-flex items-center gap-1 text-slate-300"><WifiOff className="h-3.5 w-3.5" />{t('mode.offlineNet')}</span>}
        </div>
      </div>
    );
  }
  const h = backend.health;
  const ok = backend.state === 'online';
  return (
    <div className={`no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-xs ${ok ? 'border-emerald-500/30 bg-emerald-950/60 text-emerald-100' : 'border-red-500/40 bg-red-950/70 text-red-100'}`} role="status">
      <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-bold ${ok ? 'bg-emerald-400 text-navy-950' : 'bg-red-500 text-white'}`}><Server className="h-3.5 w-3.5" />{t('mode.live')}</span>
      {backend.state === 'checking' || backend.state === 'unknown' ? <span>{t('mode.checking')}</span>
        : ok && h ? (
          <span>
            {t('mode.online')} · {t('mode.ai')}: {h.aiMode === 'live' ? `${h.provider} / ${h.model}` : <strong>{t('mode.mock')}</strong>} ·{' '}
            {t('mode.rag')}: {h.kb.official ? t('mode.ragOfficial', { n: h.kb.official }) : <strong>{t('mode.ragNone')}</strong>} ·{' '}
            {t('mode.ops')}: {h.operationalData ? t('mode.connected') : <strong>{t('mode.notConnected')}</strong>}
          </span>
        ) : <span>{t('mode.offline', { e: backend.error ?? '—' })}</span>}
      <button onClick={() => void checkBackend()} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10" aria-label={t('mode.recheckAria')}><RefreshCw className="h-3 w-3" />{t('mode.recheck')}</button>
    </div>
  );
}

const Loading = () => <div className="py-16"><Spinner /></div>;

export default function App() {
  const { page, settings, t } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  if (page === 'presentation') return <Suspense fallback={<div className="h-full bg-navy-950"><Loading /></div>}><Presentation /></Suspense>;

  const content = (() => {
    switch (page) {
      case 'briefing': return <Briefing />;
      case 'resources': return <Resources />;
      case 'assistant': return <Assistant />;
      case 'simulator': return <Simulator />;
      case 'photo': return <PhotoAnalysis />;
      case 'map': return <EmergencyMap />;
      case 'kb': return <KnowledgeBase />;
      case 'analysis': return <IncidentAnalysis />;
      case 'report': return <ReportGenerator />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
    }
  })();

  return (
    <div className="flex h-full flex-col" data-watermark={settings.demoMode ? t('mode.watermark') : undefined}>
      <Header onMenu={() => setMenuOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-navy-900">
          <ModeBanner />
          <div key={`${page}-${settings.demoMode}`} className="mx-auto max-w-[1600px] p-4 sm:p-6">
            <Suspense fallback={<Loading />}>{content}</Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
