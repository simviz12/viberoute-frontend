import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  User, 
  Phone, 
  Truck, 
  ArrowLeft, 
  RefreshCw,
  Watch,
  Wifi,
  WifiOff,
  Percent,
  Check,
  AlertCircle
} from 'lucide-react';
import { useRouteStore } from '../../../app/store/routeStore';
import { routeService } from '../api/routeService';
import { useDispatcherWebSocket } from '../hooks/useDispatcherWebSocket';
import { TransmitToWatchButton } from './TransmitToWatchButton';
import { DeliveryToastContainer, ToastItem } from '../../../ui/components/DeliveryEventToast';
import { 
  ActiveRoute, 
  DeliveryStop, 
  WebSocketDeliveryEventDto,
  DeliveryStatus 
} from '../types/smartwatch.types';

// ─── Subcomponente de Parada Memoizado (Evita Re-renders Innecesarios) ────────
interface StopRowProps {
  stop: DeliveryStop;
  index: number;
}

const StopRow: React.FC<StopRowProps> = React.memo(({ stop, index }) => {
  const isDelivered = stop.status === 'DELIVERED';
  const isAbsent = stop.status === 'ABSENT';
  const isIncident = stop.status === 'INCIDENT';
  const isPending = stop.status === 'PENDING' || stop.status === 'ON_ROUTE';

  let statusConfig = {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    label: 'Pendiente',
    Icon: Clock,
  };

  if (isDelivered) {
    statusConfig = {
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dot: 'bg-emerald-500',
      label: 'Entregado',
      Icon: CheckCircle2,
    };
  } else if (isAbsent) {
    statusConfig = {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      dot: 'bg-amber-500',
      label: 'Ausente',
      Icon: AlertTriangle,
    };
  } else if (isIncident) {
    statusConfig = {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      label: 'Incidente',
      Icon: XCircle,
    };
  }

  const { Icon } = statusConfig;

  return (
    <motion.div
      layout
      transition={{ duration: 0.2 }}
      className={`p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
        isDelivered 
          ? 'bg-emerald-50/40 border-emerald-200/60 shadow-sm' 
          : isIncident 
          ? 'bg-rose-50/40 border-rose-200/60 shadow-sm'
          : isAbsent
          ? 'bg-amber-50/40 border-amber-200/60 shadow-sm'
          : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
          isDelivered ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20' : 
          isIncident ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20' :
          isAbsent ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' :
          'bg-slate-900 text-white'
        }`}>
          #{stop.deliveryOrder ?? index + 1}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-black text-slate-800 truncate">
              {stop.address}
            </p>
            {stop.city && (
              <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">
                • {stop.city}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5">
            {stop.clientName && (
              <p className="text-[10px] text-slate-500 font-medium truncate">
                Cliente: <strong className="text-slate-700">{stop.clientName}</strong>
              </p>
            )}
            {stop.clientReference && (
              <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {stop.clientReference}
              </span>
            )}
          </div>

          {/* Mostrar detalles del reporte emitido por el smartwatch */}
          {stop.incidentReason && (
            <p className="text-[10px] text-rose-600 font-bold mt-1 flex items-center gap-1">
              <AlertCircle size={12} className="shrink-0" /> Motivo: {stop.incidentReason}
            </p>
          )}

          {stop.deliveredAt && (
            <p className="text-[10px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <Check size={12} className="shrink-0" />
              Entregado: {new Date(stop.deliveredAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${statusConfig.badge}`}>
          <Icon size={12} strokeWidth={2.5} />
          {statusConfig.label}
        </span>
      </div>
    </motion.div>
  );
});

StopRow.displayName = 'StopRow';

// ─── Componente Principal RouteDetailView ──────────────────────────────────
export interface RouteDetailViewProps {
  /**
   * ID de la ruta activa a inspeccionar
   */
  routeId: number;
  /**
   * Driver ID inicial opcional
   */
  initialDriverId?: number;
  /**
   * Driver Name inicial opcional
   */
  initialDriverName?: string;
  /**
   * Callback para regresar o cerrar la vista
   */
  onBack?: () => void;
  /**
   * Clase CSS contenedor
   */
  className?: string;
}

export const RouteDetailView: React.FC<RouteDetailViewProps> = ({
  routeId,
  initialDriverId,
  initialDriverName,
  onBack,
  className = '',
}) => {
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Subscripción atómica granular al store de Zustand para evitar re-renders por cambios en otras rutas
  const route = useRouteStore((s) => s.activeRoutes[routeId]);
  const upsertActiveRoute = useRouteStore((s) => s.upsertActiveRoute);

  // Cargar información de la ruta si aún no está en el store
  useEffect(() => {
    let isMounted = true;
    const fetchRoute = async () => {
      if (route && route.stops && route.stops.length > 0) return;
      setLoading(true);
      try {
        const fetched = await routeService.getRouteById(routeId);
        if (isMounted && fetched) {
          upsertActiveRoute(fetched);
        }
      } catch (err) {
        console.warn(`[RouteDetailView] Ruta #${routeId} no encontrada en backend, inicializando en memoria:`, err);
        // Si el backend no tiene la ruta aún, crear plantilla reactiva para pruebas inmediatas
        if (isMounted) {
          upsertActiveRoute({
            id: routeId,
            code: `RUT-${routeId.toString().padStart(4, '0')}`,
            name: `Ruta de Despacho #${routeId}`,
            status: 'DRAFT',
            driverId: initialDriverId ?? 1,
            driverName: initialDriverName ?? 'Carlos Méndez',
            city: 'Pasto',
            createdAt: new Date().toISOString(),
            stops: [
              { id: 101, address: 'Calle 22 #5-43, Centro', clientName: 'Ferretería El Cóndor', deliveryOrder: 1, status: 'PENDING' },
              { id: 102, address: 'Carrera 27 #18-12, San Juan', clientName: 'Droguería La Rebaja', deliveryOrder: 2, status: 'PENDING' },
              { id: 103, address: 'Avenida Panamericana #12-30', clientName: 'Almacén Éxito Express', deliveryOrder: 3, status: 'PENDING' },
              { id: 104, address: 'Calle 14 #24-50, Maridíaz', clientName: 'Café Nariño Gourmet', deliveryOrder: 4, status: 'PENDING' },
            ],
            totalStops: 4,
            deliveredCount: 0,
            incidentCount: 0,
            absentCount: 0,
            pendingCount: 4,
            progressPercentage: 0,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRoute();
    return () => { isMounted = false; };
  }, [routeId, initialDriverId, initialDriverName, upsertActiveRoute]);

  // Manejador del WebSocket: dispara el Toast visual en pantalla
  const handleDeliveryEvent = useCallback((event: WebSocketDeliveryEventDto) => {
    if (event.routeId === routeId) {
      setToasts((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          event,
          receivedAt: new Date(),
        },
        ...prev.slice(0, 4), // Máximo 5 toasts en pantalla
      ]);
    }
  }, [routeId]);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Hook del WebSocket para escuchar eventos de entrega en tiempo real
  const { isConnected } = useDispatcherWebSocket({
    onDeliveryEvent: handleDeliveryEvent,
  });

  // Métricas calculadas
  const totalStops = route?.totalStops ?? route?.stops?.length ?? 0;
  const deliveredCount = route?.deliveredCount ?? 0;
  const incidentCount = route?.incidentCount ?? 0;
  const absentCount = route?.absentCount ?? 0;
  const pendingCount = route?.pendingCount ?? Math.max(0, totalStops - deliveredCount - incidentCount - absentCount);
  const progressPercentage = route?.progressPercentage ?? (totalStops > 0 ? Math.round((deliveredCount / totalStops) * 100) : 0);

  const driverId = route?.driverId ?? initialDriverId ?? 1;
  const driverName = route?.driverName ?? initialDriverName ?? 'Conductor Asignado';

  return (
    <div className={`space-y-6 ${className}`}>
      
      {/* Barra Superior con Navegación y Smartwatch Dispatch */}
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-11 h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors"
              title="Volver"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900 text-white">
                Ruta #{routeId}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                route?.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                route?.status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-800' :
                route?.status === 'PLANNED' ? 'bg-teal-100 text-teal-800' :
                'bg-slate-100 text-slate-700'
              }`}>
                {route?.status || 'DRAFT'}
              </span>

              {/* Indicador de conexión WebSocket en vivo */}
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isConnected ? 'text-emerald-700 bg-emerald-50' : 'text-slate-400 bg-slate-100'
              }`}>
                {isConnected ? (
                  <>
                    <Wifi size={11} className="text-emerald-500 animate-pulse" />
                    <span>Telemetría Wear OS Activa</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={11} />
                    <span>Conectando STOMP...</span>
                  </>
                )}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
              {route?.name || `Hoja de Ruta Operativa #${routeId}`}
            </h2>
            <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
              <MapPin size={12} /> {route?.city || 'Pasto, Colombia'} • Conductor:{' '}
              <span className="text-slate-700 font-black">{driverName}</span>
            </p>
          </div>
        </div>

        {/* Botón de Transmisión a Smartwatch */}
        <div className="flex items-center gap-3">
          <TransmitToWatchButton
            routeId={routeId}
            driverId={driverId}
            driverName={driverName}
            routeStatus={route?.status}
            variant="primary"
          />
        </div>
      </div>

      {/* Sección de Progreso en Tiempo Real (Reactiva a WebSockets) */}
      <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-teal-400 mb-1">
              Telemetría en Vivo • Smartwatch Dispatcher
            </p>
            <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
              Progreso de la Ruta
              <span className="text-teal-400 font-mono text-3xl">{progressPercentage}%</span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">
              {deliveredCount} de {totalStops} paquetes entregados
            </span>
          </div>
        </div>

        {/* Barra de Progreso Multi-Color */}
        <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden p-0.5 flex gap-1">
          {/* Segmento Entregados (Verde) */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalStops > 0 ? (deliveredCount / totalStops) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="h-full bg-emerald-500 rounded-full"
            title={`${deliveredCount} Entregados`}
          />
          {/* Segmento Ausentes (Ámbar) */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalStops > 0 ? (absentCount / totalStops) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="h-full bg-amber-500 rounded-full"
            title={`${absentCount} Ausentes`}
          />
          {/* Segmento Incidentes (Rojo) */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalStops > 0 ? (incidentCount / totalStops) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="h-full bg-rose-500 rounded-full"
            title={`${incidentCount} Incidentes`}
          />
        </div>

        {/* Tarjetas de Métricas de Paradas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Paradas</p>
            <p className="text-2xl font-black text-white mt-1">{totalStops}</p>
          </div>

          <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              <CheckCircle2 size={12} /> Entregados
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{deliveredCount}</p>
          </div>

          <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
              <AlertTriangle size={12} /> Ausentes
            </p>
            <p className="text-2xl font-black text-amber-400 mt-1">{absentCount}</p>
          </div>

          <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1">
              <XCircle size={12} /> Incidentes
            </p>
            <p className="text-2xl font-black text-rose-400 mt-1">{incidentCount}</p>
          </div>
        </div>
      </div>

      {/* Lista de Paradas / Secuencia de Entrega */}
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
              Secuencia de Entregas ({totalStops})
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Actualizado dinámicamente según reportes del reloj en tiempo real
            </p>
          </div>

          {/* Leyenda de Estados */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-black uppercase">
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Entregado
            </span>
            <span className="flex items-center gap-1 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Ausente
            </span>
            <span className="flex items-center gap-1 text-rose-600">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> Incidente
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-300" /> Pendiente
            </span>
          </div>
        </div>

        {/* Paradas Memoizadas */}
        <div className="space-y-3 pt-2">
          {route?.stops && route.stops.length > 0 ? (
            route.stops.map((stop, idx) => (
              <StopRow key={stop.id} stop={stop} index={idx} />
            ))
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
              No hay paradas registradas para esta ruta.
            </div>
          )}
        </div>
      </div>

      {/* Contenedor Flotante de Toasts del Despachador */}
      <DeliveryToastContainer toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
};

export default RouteDetailView;

