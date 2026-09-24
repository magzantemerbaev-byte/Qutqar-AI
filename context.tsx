import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HealthInfo, PageKey } from './types';
import type { Lang } from '../shared/i18n';
import { fetchHealth, setDemoMode, setLang, setMockDelay } from './services/aiService';
import { translate, type TKey, type TParams } from './i18n';

export type { Lang };
export type MapStyle = 'light' | 'osm' | 'dark';

export interface Settings {
  lang: Lang;
  mapStyle: MapStyle;
  notifications: boolean;
  aiSpeed: 'fast' | 'realistic';
  operator: string;
  /** Глобальный DEMO MODE: вымышленные данные, симулированные ответы AI, работа без сети */
  demoMode: boolean;
}

/**
 * Публичная демо-сборка: всегда DEMO MODE — сайт работает без backend и AI API.
 * Включена по умолчанию (в том числе если .env-файлы потерялись при загрузке на хостинг);
 * отключается только явным VITE_PUBLIC_DEMO=false (см. .env.development для локальной работы с backend).
 */
export const PUBLIC_DEMO = import.meta.env.VITE_PUBLIC_DEMO !== 'false';

const DEFAULT_SETTINGS: Settings = { lang: 'ru', mapStyle: 'light', notifications: true, aiSpeed: 'realistic', operator: 'Ахметов Д. С.', demoMode: true };
const STORAGE_KEY = 'qutqar-settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
      if (!['ru', 'kz', 'en'].includes(s.lang)) s.lang = 'ru';
      if (PUBLIC_DEMO) s.demoMode = true;
      return s;
    }
  } catch { /* localStorage недоступен — значения по умолчанию */ }
  return DEFAULT_SETTINGS;
}

export const PAGES: PageKey[] = ['dashboard', 'briefing', 'resources', 'assistant', 'simulator', 'photo', 'map', 'kb', 'analysis', 'report', 'settings', 'presentation'];
/** #/report?session=ID → { page: 'report', params: { session: 'ID' } } */
function parseHash(): { page: PageKey; params: URLSearchParams } {
  // Основной формат — #/page?x=y (работает при обновлении на любом хостинге).
  // Прямые ссылки вида /briefing?incident=… тоже поддерживаются (хостинг отдает index.html).
  const hash = window.location.hash.replace(/^#\/?/, '');
  const raw = hash || `${window.location.pathname.replace(/^\/+|\/+$/g, '')}${window.location.search}`;
  const [p, q] = raw.split('?');
  return { page: PAGES.includes(p as PageKey) ? (p as PageKey) : 'dashboard', params: new URLSearchParams(q ?? '') };
}

export interface BackendStatus { state: 'unknown' | 'checking' | 'online' | 'offline'; health?: HealthInfo; error?: string; checkedAt?: string }

interface AppCtx {
  settings: Settings;
  lang: Lang;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  t: (key: TKey, params?: TParams) => string;
  page: PageKey;
  params: URLSearchParams;
  navigate: (p: PageKey, params?: Record<string, string>) => void;
  backend: BackendStatus;
  checkBackend: () => Promise<void>;
  online: boolean;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [route, setRoute] = useState(parseHash);
  const [backend, setBackend] = useState<BackendStatus>({ state: 'unknown' });
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  // Синхронно (до рендера страниц) передаем режим и язык сервисному слою
  setDemoMode(settings.demoMode);
  setLang(settings.lang);

  const checkBackend = useCallback(async () => {
    setBackend((b) => ({ ...b, state: 'checking' }));
    try {
      setBackend({ state: 'online', health: await fetchHealth(), checkedAt: new Date().toISOString() });
    } catch (e) {
      setBackend({ state: 'offline', error: (e as Error).message, checkedAt: new Date().toISOString() });
    }
  }, []);

  useEffect(() => {
    if (settings.demoMode) return;
    void checkBackend();
    const id = setInterval(() => void checkBackend(), 30000);
    return () => clearInterval(id);
  }, [settings.demoMode, checkBackend]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    setMockDelay(settings.aiSpeed === 'fast' ? 300 : 900);
    document.title = settings.demoMode ? 'QUTQAR AI — DEMO MODE' : 'QUTQAR AI';
    document.documentElement.lang = settings.lang === 'kz' ? 'kk' : settings.lang;
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch, ...(PUBLIC_DEMO ? { demoMode: true } : {}) })), []);
  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  const t = useCallback((key: TKey, params?: TParams) => translate(settings.lang, key, params), [settings.lang]);
  const navigate = useCallback((p: PageKey, params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    window.location.hash = `/${p}${q}`;
    setRoute({ page: p, params: new URLSearchParams(params ?? {}) });
  }, []);

  const value = useMemo(
    () => ({ settings, lang: settings.lang, updateSettings, resetSettings, t, page: route.page, params: route.params, navigate, backend, checkBackend, online }),
    [settings, updateSettings, resetSettings, t, route, navigate, backend, checkBackend, online],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
