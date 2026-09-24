/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Адрес backend (пусто = тот же origin; в dev Vite проксирует /api на localhost:8787) */
  readonly VITE_API_BASE_URL?: string;
  /** Собственный тайловый сервер карты */
  readonly VITE_MAP_TILE_URL?: string;
  /** 'true' — публичная демо-сборка: всегда DEMO MODE, переключение на LIVE отключено */
  readonly VITE_PUBLIC_DEMO?: string;
  // Ключи AI-провайдеров во фронтенде НЕ объявляются и НЕ используются:
  // любая переменная VITE_* попадает в JavaScript-бандл. Ключи — только в server/.env.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
