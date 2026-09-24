import { WifiOff } from 'lucide-react';
import { useApp } from '../context';

export default function MapOffline({ show }: { show: boolean }) {
  const { t } = useApp();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute left-2 right-2 top-2 z-[500] flex items-start gap-2 rounded-md border border-slate-300 bg-white/95 p-2 text-xs text-slate-700 shadow sm:left-auto sm:max-w-sm" role="status">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <p><strong className="text-slate-900">{t('map.offlineTitle')}.</strong> {t('map.offlineText')}</p>
    </div>
  );
}
