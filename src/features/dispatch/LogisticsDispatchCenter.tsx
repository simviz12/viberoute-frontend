import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, 
  UserPlus, 
  MapPin, 
  FileDown, 
  Users, 
  TrendingUp, 
  Search,
  CheckCircle2,
  Loader2,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../shared/lib/api';

interface Batch {
  id: number;
  status: string;
  orders: any[];
  driver?: { id: number; name: string };
}

interface Driver {
  id: number;
  name: string;
  status: string;
}

import { SmartDispatchModal } from './SmartDispatchModal';
import { useWebSocket } from '../../infrastructure/websocket/useWebSocket';
import { AssignmentToast } from '../../ui/components/AssignmentToast';
import { RouteDetailView } from '../routes/components/RouteDetailView';
import { TransmitToWatchButton } from '../routes/components/TransmitToWatchButton';
import { useDispatcherWebSocket } from '../routes/hooks/useDispatcherWebSocket';
import { DeliveryToastContainer, ToastItem } from '../../ui/components/DeliveryEventToast';
import { Watch, Eye, Route as RouteIcon } from 'lucide-react';

export const LogisticsDispatchCenter: React.FC<{ city?: string; searchQuery?: string }> = ({ city, searchQuery = '' }) => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [inspectingRouteId, setInspectingRouteId] = useState<number | null>(null);
  const [deliveryToasts, setDeliveryToasts] = useState<ToastItem[]>([]);
  const handleCloseToast = useCallback(() => setToastOpen(false), []);

  const handleDeliveryEvent = useCallback((event: any) => {
    setDeliveryToasts((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        event,
        receivedAt: new Date(),
      },
      ...prev.slice(0, 4),
    ]);
  }, []);

  const handleDismissDeliveryToast = useCallback((id: string) => {
    setDeliveryToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Escuchar eventos en tiempo real de telemetría emitidos por Smartwatch Wear OS
  useDispatcherWebSocket({
    enabled: inspectingRouteId === null,
    onDeliveryEvent: handleDeliveryEvent,
  });

  const fetchData = async () => {
    try {
      const [{ data: pendingBatches }, { data: allDrivers }, { data: topDrivers }] = await Promise.all([
        api.get('/batches/pending', { params: { city } }),
        api.get('/drivers'),
        api.get('/stats/driver-ranking')
      ]);
      setBatches(pendingBatches);
      setDrivers(allDrivers.filter((d: any) => d.status === 'AVAILABLE'));
      setRanking(topDrivers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [city]);

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
  const WS_URL = `${apiBase.replace('/api/v1', '')}/ws-alertas`;

  useWebSocket({
    url: WS_URL,
    topic: '/topic/logistics',
    onMessage: () => {
       fetchData();
    }
  });

  const handleAssign = async (driverId: number) => {
    if (!selectedBatch) return;
    setAssigning(true);
    const batchId = selectedBatch.id;
    const driverName = drivers.find((d) => d.id === driverId)?.name ?? 'repartidor';
    try {
      await api.post(`/batches/${batchId}/assign-driver/${driverId}`);
      setToastMessage(`Lote #${batchId} asignado correctamente al repartidor ${driverName}`);
      setToastOpen(true);
      setSelectedBatch(null);
      fetchData();
    } catch (err) {
      alert("Error al asignar el conductor.");
    } finally {
      setAssigning(false);
    }
  };

  const generatePDF = async () => {
    try {
      const params = new URLSearchParams();
      if (city?.trim()) params.append('city', city.trim());
      const response = await api.get(`/reports/generate-global${params.toString() ? `?${params.toString()}` : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Cierre_Global_VibeRoute.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Error descargando reporte global:", err);
      alert("Error al descargar la planilla semanal.");
    }
  };

  if (inspectingRouteId !== null) {
    const matchingBatch = batches.find((b) => b.id === inspectingRouteId);
    return (
      <RouteDetailView
        routeId={inspectingRouteId}
        initialDriverId={matchingBatch?.driver?.id}
        initialDriverName={matchingBatch?.driver?.name}
        onBack={() => setInspectingRouteId(null)}
      />
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Columna 1: Lotes Pendientes */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div>
                 <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase italic">Lotes por Despachar</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sincronizado con Almacén Central</p>
              </div>
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center">
                 <Package size={24} />
              </div>
           </div>

           <div className="space-y-4">
              {batches
                .filter(b => b.id.toString().includes(searchQuery) || b.orders.some(o => o.clientReference?.toLowerCase().includes(searchQuery.toLowerCase())))
                .map((batch) => (
                <motion.div 
                  key={batch.id}
                  layoutId={`batch-${batch.id}`}
                  onClick={() => setSelectedBatch(batch)}
                  className={`p-6 bg-white rounded-[2rem] border transition-all cursor-pointer ${
                    selectedBatch?.id === batch.id ? 'border-teal-500 ring-4 ring-teal-50 shadow-xl' : 'border-slate-50 hover:border-teal-200'
                  }`}
                >
                   <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                         <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xs font-black">
                            #{batch.id}
                         </div>
                         <div>
                            <p className="text-sm font-black text-slate-800">Carga Masiva: {batch.orders.length} Pedidos</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-2">
                               <MapPin size={10} /> {batch.orders[0]?.city || 'Varios Destinos'}
                            </p>
                         </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             setInspectingRouteId(batch.id);
                           }}
                           className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider"
                           title="Inspeccionar Ruta y Telemetría Wear OS"
                         >
                           <Watch size={13} className="text-teal-600" />
                           <span>Wear OS</span>
                         </button>
                         <ChevronRight className={selectedBatch?.id === batch.id ? 'text-teal-500' : 'text-slate-200'} />
                      </div>
                   </div>
                </motion.div>
              ))}
              {batches.length === 0 && !loading && (
                <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-[10px]">
                   No hay lotes pendientes de asignación.
                </div>
              )}
           </div>
        </div>

        {/* Columna 2: Pool de Conductores & Asignación */}
        <div className="space-y-6">
           <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute -right-10 -top-10 opacity-10 group-hover:scale-110 transition-transform">
                 <Users size={160}/>
              </div>
              <h4 className="text-lg font-black tracking-tighter uppercase italic mb-6">Conductores Disponibles</h4>
              
              <AnimatePresence mode="wait">
                 {selectedBatch ? (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                       <p className="text-[10px] text-teal-400 font-black uppercase tracking-widest mb-4">Selecciona repartidor para Batch #{selectedBatch.id}</p>
                       <div className="space-y-3">
                          {drivers
                            .filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(driver => (
                            <button 
                              key={driver.id}
                              onClick={() => handleAssign(driver.id)}
                              disabled={assigning}
                              className="w-full flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all text-left"
                            >
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full border border-teal-500/30 overflow-hidden">
                                     <img src={`https://ui-avatars.com/api/?name=${driver.name}&background=10b981&color=fff`} alt="" />
                                  </div>
                                  <div>
                                     <p className="text-xs font-black">{driver.name}</p>
                                     <p className="text-[8px] uppercase font-bold text-slate-500">98% Eficiencia</p>
                                  </div>
                               </div>
                               <ArrowRight size={14} className="text-teal-400" />
                            </button>
                          ))}
                       </div>
                       <div className="pt-2 space-y-2">
                          <button
                            type="button"
                            onClick={() => setInspectingRouteId(selectedBatch.id)}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-2xl text-xs font-black uppercase tracking-wider transition-colors border border-teal-500/20"
                          >
                            <RouteIcon size={14} /> Inspeccionar Ruta & Telemetría
                          </button>
                          <button onClick={() => setSelectedBatch(null)} className="w-full py-2 text-[9px] font-black uppercase text-slate-500 hover:text-slate-300">
                            Cancelar Asignación
                          </button>
                       </div>
                    </motion.div>
                 ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10">
                       <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                          <UserPlus size={24} />
                       </div>
                       <p className="text-[10px] font-black uppercase text-slate-400">Selecciona un lote de la izquierda <br/>para asignar un conductor</p>
                    </motion.div>
                 )}
              </AnimatePresence>
           </div>

           {/* Ranking de Trabajadores */}
           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 border-b border-slate-50 pb-4">Personal Destacado</h4>
              <div className="space-y-4">
                 {ranking.slice(0,3).map((best, i) => (
                   <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                         <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                         <div>
                            <p className="text-[10px] font-black">{best.driverName}</p>
                            <p className="text-[8px] font-bold text-teal-600 uppercase tracking-widest">{best.effectivenessPercentage}% Eficiencia</p>
                         </div>
                      </div>
                   </div>
                 ))}
                 <button onClick={() => generatePDF()} className="w-full flex items-center justify-between p-5 bg-teal-50 text-teal-600 rounded-3xl group hover:bg-teal-600 hover:text-white transition-all shadow-xl mt-6">
                    <div className="flex items-center gap-4 text-left">
                       <FileDown size={20} />
                       <div>
                          <p className="text-xs font-black">Planilla Semanal</p>
                          <p className="text-[9px] font-bold uppercase opacity-60">PDF Consolidado</p>
                       </div>
                    </div>
                 </button>
              </div>
           </div>
        </div>
      </div>

      <AssignmentToast
        isOpen={toastOpen}
        message={toastMessage}
        onClose={handleCloseToast}
      />

      <DeliveryToastContainer
        toasts={deliveryToasts}
        onDismiss={handleDismissDeliveryToast}
      />
    </div>
  );
};
