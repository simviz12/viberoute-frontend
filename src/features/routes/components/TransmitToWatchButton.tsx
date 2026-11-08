import React, { useState } from 'react';
import { Watch, Loader2, CheckCircle2, AlertCircle, Radio } from 'lucide-react';
import { routeService } from '../api/routeService';
import { useRouteStore } from '../../../app/store/routeStore';
import { RouteStatus, DispatchRouteResponse } from '../types/smartwatch.types';
import { AssignmentToast } from '../../../ui/components/AssignmentToast';

export interface TransmitToWatchButtonProps {
  /**
   * Identificador de la ruta a despachar
   */
  routeId: number;
  /**
   * Identificador del conductor asignado
   */
  driverId: number;
  /**
   * Nombre del conductor (opcional, para feedback enriquecido)
   */
  driverName?: string;
  /**
   * Estado actual de la ruta (DRAFT, PLANNED, IN_PROGRESS, etc.)
   */
  routeStatus?: RouteStatus;
  /**
   * Callback invocado tras la transmisión exitosa
   */
  onSuccess?: (response: DispatchRouteResponse) => void;
  /**
   * Callback invocado ante un error
   */
  onError?: (error: Error) => void;
  /**
   * Deshabilitar manualmente el botón
   */
  disabled?: boolean;
  /**
   * Clases CSS opcionales
   */
  className?: string;
  /**
   * Variante visual
   */
  variant?: 'primary' | 'secondary' | 'compact';
}

export const TransmitToWatchButton: React.FC<TransmitToWatchButtonProps> = ({
  routeId,
  driverId,
  driverName,
  routeStatus,
  onSuccess,
  onError,
  disabled = false,
  className = '',
  variant = 'primary',
}) => {
  const [loading, setLoading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAlreadyPlanned = routeStatus === 'PLANNED';
  const isInProgress = routeStatus === 'IN_PROGRESS';
  const isCompleted = routeStatus === 'COMPLETED';

  const handleTransmit = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!routeId || !driverId) {
      const msg = !driverId
        ? 'Debe asignar un conductor antes de transmitir al reloj'
        : 'Identificador de ruta inválido';
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await routeService.dispatchToSmartwatch(routeId, driverId);

      // Actualizar el estado global en Zustand inmediatamente
      useRouteStore.getState().setRouteDispatched(routeId, driverId);

      const driverText = driverName ? ` (${driverName})` : '';
      setToastMessage(`Ruta transmitida al reloj del conductor${driverText}`);
      setToastOpen(true);

      onSuccess?.(response);
    } catch (err: any) {
      console.error('[TransmitToWatchButton] Error transmitiendo ruta:', err);
      const detail =
        err?.response?.data?.message ||
        err?.message ||
        'Error de comunicación con el servidor';
      setErrorMessage(`No se pudo transmitir: ${detail}`);
      setTimeout(() => setErrorMessage(null), 5000);
      onError?.(err instanceof Error ? err : new Error(detail));
    } finally {
      setLoading(false);
    }
  };

  // Estilos según la variante
  const baseClasses =
    'relative inline-flex items-center justify-center gap-2 font-black tracking-wide uppercase transition-all duration-200 rounded-2xl select-none focus:outline-none focus:ring-2 focus:ring-offset-2';

  let variantClasses = '';
  if (variant === 'compact') {
    variantClasses = 'px-3 py-2 text-[11px]';
  } else if (variant === 'secondary') {
    variantClasses = 'px-5 py-3 text-xs bg-slate-800 text-white hover:bg-slate-700 shadow-md';
  } else {
    // Primary: Estilo audaz con tonos teal / esmeralda acordes a VibeRoute
    variantClasses = isAlreadyPlanned
      ? 'px-5 py-3 text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/40'
      : 'px-5 py-3 text-xs bg-gradient-to-r from-teal-500 to-emerald-600 text-white hover:from-teal-600 hover:to-emerald-700 shadow-lg shadow-teal-500/30';
  }

  const isDisabled = disabled || loading || isCompleted;

  return (
    <>
      <button
        type="button"
        onClick={handleTransmit}
        disabled={isDisabled}
        title={
          isAlreadyPlanned
            ? 'Ruta en estado PLANNED. Haz clic para retransmitir si el conductor reinició su reloj'
            : 'Enviar hoja de ruta a la app Wear OS del conductor'
        }
        className={`
          ${baseClasses} 
          ${variantClasses} 
          ${isDisabled ? 'opacity-60 cursor-not-allowed filter grayscale' : 'hover:scale-[1.02] active:scale-[0.98]'}
          ${className}
        `}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin text-white" />
            <span>Transmitiendo...</span>
          </>
        ) : isAlreadyPlanned ? (
          <>
            <CheckCircle2 size={16} className="text-emerald-200" />
            <span>Transmitida al Reloj</span>
            <span className="flex h-2 w-2 relative ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-100" />
            </span>
          </>
        ) : isInProgress ? (
          <>
            <Radio size={16} className="text-teal-200 animate-pulse" />
            <span>En Progreso (Reloj Activo)</span>
          </>
        ) : (
          <>
            <Watch size={17} className="text-white shrink-0" />
            <span>Transmitir a Smartwatch</span>
          </>
        )}
      </button>

      {/* Mensaje de error flotante inline */}
      {errorMessage && (
        <div className="text-[11px] font-bold text-rose-500 flex items-center gap-1.5 mt-1 animate-fadeIn">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Toast de confirmación de transmisión */}
      <AssignmentToast
        isOpen={toastOpen}
        message={toastMessage}
        onClose={() => setToastOpen(false)}
      />
    </>
  );
};

export default TransmitToWatchButton;

