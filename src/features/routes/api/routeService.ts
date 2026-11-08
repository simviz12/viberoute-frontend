import api from '../../../shared/lib/api';
import { 
  DispatchRouteResponse, 
  ActiveRoute 
} from '../types/smartwatch.types';

export const routeService = {
  /**
   * Transmite la ruta al reloj del conductor.
   * Ejecuta POST /api/routes/{routeId}/dispatch enviando { driverId }.
   * Esto cambia el estado de la ruta a PLANNED en el backend,
   * dejándola lista para que el Smartwatch Wear OS la descargue.
   */
  dispatchToSmartwatch: async (
    routeId: number | string, 
    driverId: number | string
  ): Promise<DispatchRouteResponse> => {
    try {
      const res = await api.post(`/routes/${routeId}/dispatch`, { driverId: Number(driverId) });
      return res.data;
    } catch (err: any) {
      // Fallback si la ruta está mapeada sin /v1 en el backend
      if (err?.response?.status === 404) {
        const rootBase = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
        const res = await api.post(
          `/api/routes/${routeId}/dispatch`, 
          { driverId: Number(driverId) },
          { baseURL: rootBase || undefined }
        );
        return res.data;
      }
      throw err;
    }
  },

  /**
   * Obtiene los datos detallados de una ruta por ID
   */
  getRouteById: async (routeId: number | string): Promise<ActiveRoute> => {
    try {
      const res = await api.get(`/routes/${routeId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const rootBase = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
        const res = await api.get(`/api/routes/${routeId}`, {
          baseURL: rootBase || undefined,
        });
        return res.data;
      }
      throw err;
    }
  },

  /**
   * Obtiene la lista de rutas activas para el despachador
   */
  getActiveRoutes: async (): Promise<ActiveRoute[]> => {
    try {
      const res = await api.get('/routes/active');
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const rootBase = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
        const res = await api.get('/api/routes/active', {
          baseURL: rootBase || undefined,
        });
        return res.data;
      }
      throw err;
    }
  }
};

export default routeService;

