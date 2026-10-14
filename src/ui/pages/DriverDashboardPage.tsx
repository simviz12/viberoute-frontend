import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Truck, 
  Package, 
  TrendingUp, 
  Clock, 
  Clock3,
  Route,
  Brain,
  PackageCheck,
  MapPin, 
  LogOut, 
  Navigation,
  Loader2,
  DollarSign,
  CheckCircle2,
  Map as MapIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../app/store/authStore';
import { useMissionStore } from '../../app/store/missionStore';
import { GeminiInsightModule } from '../../features/ai/GeminiInsightModule';
import { DriverCopilotBanner } from '../../features/ai/DriverCopilotBanner';
import api from '../../shared/lib/api';
import { OrdersManagementModule } from '../../features/orders/OrdersManagementModule';
import { MapsNavigationModule } from '../../features/routes/MapsNavigationModule';
import { useRouteStore } from '../../app/store/routeStore';

type DriverView = 'summary' | 'map' | 'list';

const MemoizedMapsNavigationModule = memo(MapsNavigationModule);

export const DriverDashboardPage: React.FC = () => {
  const { user, logout, token } = useAuthStore();
  const { currentBatchId, startMission } = useMissionStore();
  const navigate = useNavigate();
  const [view, setView] = useState<DriverView>('map');
  
  const [driverId, setDriverId] = useState<number>(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ delivered: 0, pending: 0, cancelled: 0, returned: 0, hours: 0, totalValue: 0 });
  const [nextOrder, setNextOrder] = useState<any>(null);
  const [copilotTips, setCopilotTips] = useState<string>('');

  const fetchData = async (options?: { preserveMission?: boolean }) => {
    try {
      if (!options?.preserveMission) {
        setLoading(true);
        useMissionStore.getState().clearMission();
        useRouteStore.getState().setBackupOrders([]);
        useRouteStore.getState().setRoute(null);
      }

      const res = await api.get('/orders/mine');
      const myOrders = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.orders) ? res.data.orders : []);

      if (myOrders.length > 0) {
        setOrders(myOrders);
        useRouteStore.getState().setBackupOrders(myOrders);
        
        // Recuperar batchId priorizando pedidos activos (PENDING o ON_ROUTE)
        const firstActiveWithBatch = myOrders.find((o: any) => 
          o.batchId && (o.status === 'PENDING' || o.status === 'ON_ROUTE')
        );
        // Fallback: Si todos están entregados, tomar el primer batchId disponible
        const targetBatchId = firstActiveWithBatch?.batchId || myOrders.find((o: any) => o.batchId)?.batchId;
        
        if (targetBatchId) {
          startMission(targetBatchId);
        }

        // Calcular estadísticas
        const delivered = myOrders.filter((o: any) => o.status === 'DELIVERED').length;
        const pending = myOrders.filter((o: any) => o.status === 'PENDING' || o.status === 'ON_ROUTE').length;
        const cancelled = myOrders.filter((o: any) => o.status === 'CANCELLED').length;
        const returned = myOrders.filter((o: any) => o.status === 'RETURNED').length;
        const totalValue = myOrders.reduce((sum: number, o: any) => sum + (o.price || 0), 0);

        const timestamps = myOrders
          .map((o: any) => o.actualDeliveryTime)
          .filter(Boolean)
          .map((t: string) => new Date(t).getTime());

        let hours = 0.5;
        if (timestamps.length > 0) {
          const minTime = Math.min(...timestamps);
          const maxTime = Math.max(...timestamps);
          if (maxTime > minTime) {
            hours = Number(((maxTime - minTime) / (1000 * 60 * 60)).toFixed(1));
          }
        }
        if (hours < 0.1) hours = 0.5;

        setStats({ delivered, pending, cancelled, returned, hours, totalValue });
        
        // Próximo destino: primer pedido pendiente o en ruta
        const next = myOrders.find((o: any) => o.status === 'PENDING' || o.status === 'ON_ROUTE');
        setNextOrder(next);

        // Intentar cargar los tips de IA del lote
        if (targetBatchId) {
          try {
            const { data: batchData } = await api.get(`/batches/${targetBatchId}`);
            if (batchData?.aiCopilotTips) setCopilotTips(batchData.aiCopilotTips);
            if (batchData?.driver?.id) setDriverId(batchData.driver.id);
          } catch { /* Tips son opcionales, no bloquear */ }
        }
      }
    } catch (err) {
      console.error("Error cargando datos del driver:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    fetchData();
  }, [token, user?.email]);

  const handleLogout = useCallback(() => {
    const confirmLogout = window.confirm(
      "¿Estás seguro de que deseas cerrar tu sesión?"
    );

    if (!confirmLogout) return;

    logout();
    navigate('/');
  }, [logout, navigate]);

  const efficiency = useMemo(() => {
    if (orders.length === 0) return 0;
    return Math.round((stats.delivered / orders.length) * 100);
  }, [orders.length, stats.delivered]);

  const distanceEstimate = useMemo(() => Math.max(1, Math.round((stats.delivered + stats.pending) * 2.4)), [stats.delivered, stats.pending]);

  const reportMetrics = useMemo(() => [
    { label: 'Entregas', value: `${stats.delivered}/${orders.length}`, helper: `${stats.pending} pendientes`, icon: PackageCheck, tone: 'text-emerald-600 bg-emerald-100' },
    { label: 'Tiempo', value: `${stats.hours}h`, helper: 'ventana operativa', icon: Clock, tone: 'text-sky-600 bg-sky-100' },
    { label: 'Distancia', value: `${distanceEstimate} km`, helper: 'estimado de ruta', icon: Route, tone: 'text-teal-600 bg-teal-100' },
    { label: 'Eficiencia', value: `${efficiency}%`, helper: 'cumplimiento', icon: TrendingUp, tone: 'text-lime-600 bg-lime-100' },
    { label: 'Rendimiento IA', value: copilotTips ? 'Activo' : 'Base', helper: copilotTips ? 'copiloto cargado' : 'sin tips IA', icon: Brain, tone: 'text-violet-600 bg-violet-100' },
  ], [copilotTips, distanceEstimate, efficiency, orders.length, stats.delivered, stats.hours, stats.pending]);

  const tabs = useMemo(() => [
    { id: 'summary' as const, label: 'Turno', icon: Clock3 },
    { id: 'map' as const, label: 'Mapa', icon: MapIcon },
    { id: 'list' as const, label: 'Pedidos', icon: Package },
  ], []);

  const renderTab = useCallback((tab: typeof tabs[number]) => {
    const Icon = tab.icon;
    const active = view === tab.id;
    const isCentral = tab.id === 'map';

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => setView(tab.id)}
        className={`flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-all duration-200 active:scale-95 ${
          active ? 'text-emerald-600 scale-105 font-semibold' : 'text-slate-500'
        } ${isCentral ? 'bg-emerald-50 rounded-2xl px-4 shadow-sm shadow-emerald-100/60' : 'px-3'}`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon size={isCentral ? 23 : 21} strokeWidth={active ? 2.8 : 2.2} />
        <span>{tab.label}</span>
      </button>
    );
  }, [tabs, view]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-10 z-50">
        <Loader2 className="animate-spin text-green-500 mb-4" size={40} />
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Sincronizando Hoja de Ruta...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-slate-100 touch-manipulation overscroll-none select-none font-sans relative">
      
      {/* Header - Hidden in Map View to maximize space */}
      {view !== 'map' && (
        <header className="flex-none sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 shadow-sm">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-green-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-200 text-white">
                  <Truck size={20} />
               </div>
               <h1 className="text-lg font-black text-slate-900 tracking-tighter uppercase leading-none">
                 PANEL DEL <br/>
                 <span className="text-green-500">CONDUCTOR</span>
               </h1>
            </div>
            <button onClick={handleLogout} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-all">
              <LogOut size={20} />
            </button>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 min-h-0 w-full relative touch-manipulation ${view === 'map' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain pb-28'}`}>
        <div className={view === 'map' ? 'absolute inset-0' : 'max-w-md mx-auto p-5 space-y-6'}>
          
          {/* User Welcome - Only in Summary View */}
          {view === 'summary' && (
            <div className="flex items-center gap-4 mb-8">
               <div className="w-14 h-14 bg-slate-900 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white font-black text-lg">
                  {user?.name?.[0]}{user?.name?.split(' ')?.[1]?.[0]}
               </div>
               <div>
                  <p className="text-[10px] text-green-600 font-black uppercase tracking-[0.2em] mb-0.5">Operación en curso</p>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Hola, {user?.name?.split(' ')[0]}</h2>
               </div>
            </div>
          )}

          {/* AI Copilot Banner */}
          {view === 'summary' && copilotTips && (
            <DriverCopilotBanner
              tipsJson={copilotTips}
              stats={{ delivered: stats.delivered, pending: stats.pending, total: orders.length }}
              driverName={user?.name?.split(' ')[0]}
            />
          )}

          <AnimatePresence mode="wait">
            {view === 'summary' ? (
              <motion.div 
                key="summary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <section className="rounded-3xl shadow-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Smart Logistics Report</h3>
                      <p className="text-sm text-slate-500">Resumen inteligente del turno y rendimiento operativo.</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-white/80 shadow-md flex items-center justify-center text-emerald-600">
                      <Brain size={24} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {reportMetrics.map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <motion.div
                          key={metric.label}
                          whileTap={{ scale: 0.97 }}
                          className="bg-white/80 backdrop-blur rounded-2xl shadow-md p-4 border border-white/70"
                        >
                          <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${metric.tone}`}>
                            <Icon size={18} />
                          </div>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{metric.label}</p>
                          <p className="text-xl font-black text-slate-900 tracking-tight">{metric.value}</p>
                          <p className="text-[11px] text-slate-400 font-semibold">{metric.helper}</p>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="bg-white/80 backdrop-blur rounded-2xl shadow-md p-4 border border-white/70">
                      <div className="flex justify-between items-center mb-2">
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Valor de Ruta</p>
                         <DollarSign size={16} className="text-emerald-500" />
                      </div>
                      <h3 className="text-3xl font-black text-slate-900">${stats.totalValue.toLocaleString()}</h3>
                  </div>
                </section>

                {nextOrder ? (
                  <div className="bg-slate-900 p-7 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                     <div className="relative z-10 space-y-4">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-500/30">
                           Próximo Destino
                        </div>
                        <h4 className="text-2xl font-black tracking-tighter leading-tight">{nextOrder.address}</h4>
                        <p className="text-slate-400 text-sm">{nextOrder.city}, CO</p>
                        <button 
                           onClick={() => setView('map')}
                           className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 mt-4 active:scale-95 transition-all"
                        >
                           Iniciar Navegación <Navigation size={16} className="text-green-500" />
                        </button>
                     </div>
                  </div>
                ) : (
                  <div className="bg-white p-8 rounded-[2.5rem] text-center border border-green-100 shadow-xl shadow-green-100/50">
                     <div className="w-20 h-20 bg-green-500 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                        <CheckCircle2 size={40} />
                     </div>
                     <h3 className="text-2xl font-black text-slate-900 mb-2">¡Todo al día!</h3>
                     <p className="text-slate-400 text-sm mb-8">Has completado tus entregas.</p>
                     <GeminiInsightModule stats={{ delivered: stats.delivered, pending: 0, cancelled: stats.cancelled, returned: stats.returned, hours: stats.hours, city: 'Pasto' }} />
                  </div>
                )}
              </motion.div>
            ) : view === 'list' ? (
              <motion.div 
                 key="list"
                 initial={{ opacity: 0, x: 20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: -20 }}
              >
                 <OrdersManagementModule driverName={user?.name || ''} onUpdate={() => fetchData({ preserveMission: true })} />
              </motion.div>
            ) : (
              <div key="map" className="h-full w-full">
                 <MemoizedMapsNavigationModule />
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 z-50 pb-safe shadow-2xl">
        <div className="mx-auto grid h-20 max-w-md grid-cols-3 items-center px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {tabs.map(renderTab)}
        </div>
      </footer>
    </div>
  );
};
