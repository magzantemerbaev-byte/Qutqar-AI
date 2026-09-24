import React from 'react';
import ReactDOM from 'react-dom/client';
// Шрифты поставляются вместе с приложением (без Google Fonts) — интерфейс одинаков офлайн.
// IBM Plex поддерживает кириллицу, включая казахские буквы (ә, ғ, қ, ң, ө, ұ, ү, һ, і).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';
import { AppProvider } from './context';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
