import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, X, Watch, Clock } from 'lucide-react';
import { WebSocketDeliveryEventDto } from '../../features/routes/types/smartwatch.types';

export interface ToastItem {
  id: string;
  event: WebSocketDeliveryEventDto;
  receivedAt: Date;
}

interface DeliveryEventToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const TOAST_TIMEOUT_MS = 6000;

export const DeliveryToastItem: React.FC<{
  item: ToastItem;
  onDismiss: (id: string) => void;
}> = ({ item, onDismiss }) => {
  const { event, id } = item;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, TOAST_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const isDelivered = event.status === 'DELIVERED';
  const isAbsent = event.status === 'ABSENT';
  const isIncident = event.status === 'INCIDENT';

  let config = {
    bg: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
    iconBg: 'bg-emerald-500/20 text-emerald-400',
    Icon: CheckCircle2,
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    title: '¡Paquete Entregado!',
    badgeText: 'Wear OS Sync',
  };

  if (isAbsent) {
    config = {
      bg: 'bg-amber-950/95 border-amber-500/40 text-amber-100',
      iconBg: 'bg-amber-500/20 text-amber-400',
      Icon: AlertTriangle,
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      title: 'Destinatario Ausente',
      badgeText: 'Novedad Reloj',
    };
  } else if (isIncident) {
    config = {
      bg: 'bg-rose-950/95 border-rose-500/40 text-rose-100',
      iconBg: 'bg-rose-500/20 text-rose-400',
      Icon: XCircle,
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      title: 'Incidente Reportado',
      badgeText: 'Alerta Smartwatch',
    };
  }

  const { Icon } = config;
  const addressText = event.address || `Orden #${event.orderId}`;
  const driverText = event.driverName || `Conductor #${event.driverId}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`relative flex items-start gap-3 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl max-w-md w-full ${config.bg}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>

      <div className="flex-1 min-w-0 pr-6">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1 ${config.badge}`}>
            <Watch size={10} /> {config.badgeText}
          </span>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock size={10} />
            {item.receivedAt.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        <h4 className="text-sm font-black tracking-tight text-white mb-0.5">
          {config.title}
        </h4>

        <p className="text-xs text-slate-200 leading-snug">
          {isDelivered && (
            <>
              ¡Paquete entregado en <span className="font-bold text-white underline decoration-emerald-400/50">{addressText}</span> por{' '}
              <span className="font-bold text-white">{driverText}</span>!
            </>
          )}
          {isAbsent && (
            <>
              Destinatario no encontrado en <span className="font-bold text-white">{addressText}</span> reportado por{' '}
              <span className="font-bold text-white">{driverText}</span>.
            </>
          )}
          {isIncident && (
            <>
              Incidente en <span className="font-bold text-white">{addressText}</span> por{' '}
              <span className="font-bold text-white">{driverText}</span>
              {event.incidentReason ? `: "${event.incidentReason}"` : '.'}
            </>
          )}
        </p>

        {event.batteryLevel !== undefined && (
          <p className="text-[10px] text-slate-400 mt-1 font-mono">
            Batería Reloj: {event.batteryLevel}% • Ruta #{event.routeId}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Cerrar notificación"
      >
        <X size={15} />
      </button>
    </motion.div>
  );
};

export const DeliveryToastContainer: React.FC<DeliveryEventToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-auto">
      <AnimatePresence>
        {toasts.map((toast) => (
          <DeliveryToastItem key={toast.id} item={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default DeliveryToastContainer;

