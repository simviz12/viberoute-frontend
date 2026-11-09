import React, { useState } from 'react';
import { 
  Upload, 
  FileJson, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Database,
  Loader2,
  Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../shared/lib/api';

interface RawOrder {
  clientReference: string;
  address: string;
  city: string;
  clientName: string;
  phone: string;
  price?: number;
}

export const BulkImportModule: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const [data, setData] = useState<RawOrder[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const rawList = Array.isArray(json) ? json : [json];
        
        // Mapeo defensivo para asegurar compatibilidad con el DTO del backend
        const mappedData = rawList.map((item: any) => ({
          ...item,
          // Preservar coordenadas si el JSON las incluye, o undefined para geocodificar en backend
          location: (item.location && item.location.lat && item.location.lng) ? item.location : undefined,
          // Mapear NORMAL a MEDIUM (compatibilidad de enums)
          priority: item.priority === 'NORMAL' ? 'MEDIUM' : item.priority || 'MEDIUM'
        }));

        setData(mappedData);
        setStatus('idle');
      } catch (err) {
        alert("Error al parsear el JSON. Asegúrate de que el formato es correcto.");
      }
    };
    reader.readAsText(file);
  };

  const [errorDetails, setErrorDetails] = useState<string[]>([]);

  const handleConfirm = async () => {
    setLoading(true);
    setErrorDetails([]);
    try {
      const res = await api.post('/orders/bulk', data);
      const { createdCount, errorCount, errors } = res.data;

      if (errorCount > 0 && createdCount > 0) {
        setStatus('success');
        setErrorDetails(errors.map((e: any) => `[${e.reference}]: ${e.error}`));
        console.warn('Carga parcial:', errors);
      } else if (createdCount > 0) {
        setStatus('success');
      }

      setTimeout(() => {
        setData([]);
        setErrorDetails([]);
        if (onComplete) onComplete();
      }, 3000);
    } catch (err: any) {
      setStatus('error');
      const serverData = err?.response?.data;
      if (serverData?.errors) {
        setErrorDetails(serverData.errors.map((e: any) => `[${e.reference}]: ${e.error}`));
      } else if (serverData?.error) {
        setErrorDetails([serverData.error]);
      }
      console.error('Error carga masiva:', serverData || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/50 overflow-hidden">
      
      {/* Zona de Drop / Selección */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
        className={`p-12 border-b border-dashed border-slate-100 transition-all ${isDragging ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50/50'}`}
      >
        <div className="max-w-md mx-auto text-center space-y-4">
           <div className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto text-indigo-600">
              <Upload size={32} />
           </div>
           <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tighter uppercase italic">Importación de Flota</h3>
              <p className="text-slate-400 text-xs font-bold tracking-widest mt-1 uppercase">Arrastra tu archivo .json aquí para procesar</p>
           </div>
           
           <label className="inline-flex items-center px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-slate-800 active:scale-95 transition-all shadow-xl shadow-slate-200">
              <FileJson size={16} className="mr-3 text-indigo-400" />
              Explorar Archivos
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
           </label>
        </div>
      </div>

      <AnimatePresence>
        {data.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-8"
          >
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                     <Database size={20} />
                  </div>
                  <div>
                     <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Previsualización de Datos</h4>
                     <p className="text-[10px] text-slate-400 font-bold uppercase">{data.length} pedidos detectados</p>
                  </div>
               </div>
               <button onClick={() => setData([])} className="p-3 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={20} />
               </button>
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-slate-50 mb-8 max-h-[400px]">
               <table className="w-full text-left">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Referencia</th>
                      <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                      <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ciudad</th>
                      <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dirección</th>
                      <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.map((order, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-black text-slate-900 text-xs">#{order.clientReference}</td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-600">{order.clientName}</td>
                        <td className="px-6 py-4">
                           <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                              {order.city}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 font-medium truncate max-w-[200px]">{order.address}</td>
                        <td className="px-6 py-4 text-xs font-black text-emerald-600 text-right">${order.price?.toLocaleString() || 0}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>

            <div className="flex flex-col gap-4">
               {status === 'success' && (
                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 font-black text-xs uppercase tracking-widest">
                    <CheckCircle2 size={18} /> ¡Carga masiva completada exitosamente!
                 </motion.div>
               )}
               {status === 'error' && (
                 <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 font-black text-xs uppercase tracking-widest">
                    <AlertCircle size={18} /> Error al procesar pedidos. Detalles abajo.
                 </motion.div>
               )}
               {errorDetails.length > 0 && (
                 <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl max-h-[200px] overflow-y-auto space-y-1">
                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Detalle de errores ({errorDetails.length})</p>
                    {errorDetails.map((detail, i) => (
                      <p key={i} className="text-[11px] text-amber-800 font-medium">• {detail}</p>
                    ))}
                 </div>
               )}
               
               <button 
                onClick={handleConfirm}
                disabled={loading || status === 'success'}
                className={`w-full py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-2xl ${
                  status === 'success' ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
               >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : status === 'success' ? (
                    'Carga Sincronizada'
                  ) : (
                    <>Confirmar Carga de Flota <Package size={18} className="text-indigo-400" /></>
                  )}
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
