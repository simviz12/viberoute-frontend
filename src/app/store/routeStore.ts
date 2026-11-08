import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ActiveRoute, WebSocketDeliveryEventDto } from '../../features/routes/types/smartwatch.types';

export interface FleetDriverPosition {
  driverId: number;
  driverName: string;
  lat: number;
  lng: number;
  status?: string;
  assignedCity?: string;
  lastUpdated?: number;
}

interface RouteState {
  route: any | null;
  backupOrders: any[];
  driverPos: { lat: number; lng: number } | null;
  fleetDrivers: Record<number, FleetDriverPosition>;
  activeRoutes: Record<number, ActiveRoute>;
  mapTheme: 'light' | 'dark';
  showPOIs: boolean;
  setRoute: (route: any) => void;
  setBackupOrders: (orders: any[]) => void;
  setDriverPos: (pos: { lat: number; lng: number }) => void;
  updateFleetDriver: (driver: FleetDriverPosition) => void;
  setFleetDrivers: (drivers: FleetDriverPosition[]) => void;
  setActiveRoutes: (routes: ActiveRoute[]) => void;
  upsertActiveRoute: (route: ActiveRoute) => void;
  setRouteDispatched: (routeId: number, driverId: number) => void;
  updateDeliveryFromEvent: (event: WebSocketDeliveryEventDto) => void;
  setMapTheme: (theme: 'light' | 'dark') => void;
  setShowPOIs: (show: boolean) => void;
  clear: () => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
      route: null,
      backupOrders: [],
      driverPos: { lat: 1.2136, lng: -77.2811 }, // Pasto por defecto
      fleetDrivers: {},
      activeRoutes: {},
      mapTheme: 'light',
      showPOIs: false,
      setRoute: (route) => set({ route }),
      setBackupOrders: (backupOrders) => set({ backupOrders }),
      setDriverPos: (driverPos) => set({ driverPos }),
      updateFleetDriver: (driver) =>
        set((state) => ({
          fleetDrivers: {
            ...state.fleetDrivers,
            [driver.driverId]: { ...driver, lastUpdated: Date.now() },
          },
        })),
      setFleetDrivers: (driversList) =>
        set(() => {
          const dict: Record<number, FleetDriverPosition> = {};
          driversList.forEach((d) => {
            dict[d.driverId] = { ...d, lastUpdated: Date.now() };
          });
          return { fleetDrivers: dict };
        }),
      setActiveRoutes: (routes) =>
        set(() => {
          const dict: Record<number, ActiveRoute> = {};
          routes.forEach((r) => {
            const totalStops = r.stops?.length ?? r.totalStops ?? 0;
            const deliveredCount = r.stops ? r.stops.filter((s) => s.status === 'DELIVERED').length : r.deliveredCount ?? 0;
            const incidentCount = r.stops ? r.stops.filter((s) => s.status === 'INCIDENT').length : r.incidentCount ?? 0;
            const absentCount = r.stops ? r.stops.filter((s) => s.status === 'ABSENT').length : r.absentCount ?? 0;
            const pendingCount = Math.max(0, totalStops - deliveredCount - incidentCount - absentCount);
            const progressPercentage = totalStops > 0 ? Math.round((deliveredCount / totalStops) * 100) : 0;
            dict[r.id] = {
              ...r,
              totalStops,
              deliveredCount,
              incidentCount,
              absentCount,
              pendingCount,
              progressPercentage,
            };
          });
          return { activeRoutes: dict };
        }),
      upsertActiveRoute: (newRoute) =>
        set((state) => {
          const totalStops = newRoute.stops?.length ?? newRoute.totalStops ?? 0;
          const deliveredCount = newRoute.stops ? newRoute.stops.filter((s) => s.status === 'DELIVERED').length : newRoute.deliveredCount ?? 0;
          const incidentCount = newRoute.stops ? newRoute.stops.filter((s) => s.status === 'INCIDENT').length : newRoute.incidentCount ?? 0;
          const absentCount = newRoute.stops ? newRoute.stops.filter((s) => s.status === 'ABSENT').length : newRoute.absentCount ?? 0;
          const pendingCount = Math.max(0, totalStops - deliveredCount - incidentCount - absentCount);
          const progressPercentage = totalStops > 0 ? Math.round((deliveredCount / totalStops) * 100) : 0;

          return {
            activeRoutes: {
              ...state.activeRoutes,
              [newRoute.id]: {
                ...newRoute,
                totalStops,
                deliveredCount,
                incidentCount,
                absentCount,
                pendingCount,
                progressPercentage,
              },
            },
          };
        }),
      setRouteDispatched: (routeId, driverId) =>
        set((state) => {
          const existing = state.activeRoutes[routeId];
          if (!existing) return state;
          return {
            activeRoutes: {
              ...state.activeRoutes,
              [routeId]: {
                ...existing,
                status: 'PLANNED',
                driverId,
                dispatchedAt: new Date().toISOString(),
              },
            },
          };
        }),
      updateDeliveryFromEvent: (event) =>
        set((state) => {
          const routeId = event.routeId;
          const existingRoute = state.activeRoutes[routeId];
          const updatedActiveRoutes = { ...state.activeRoutes };

          if (existingRoute) {
            let stopFound = false;
            const updatedStops = (existingRoute.stops || []).map((stop) => {
              if (stop.id === event.orderId) {
                stopFound = true;
                return {
                  ...stop,
                  status: event.status,
                  deliveredAt: event.status === 'DELIVERED' ? new Date(event.timestamp).toISOString() : stop.deliveredAt,
                  incidentReason: event.incidentReason || stop.incidentReason,
                };
              }
              return stop;
            });

            if (!stopFound && event.orderId) {
              updatedStops.push({
                id: event.orderId,
                address: event.address || `Parada #${event.orderId}`,
                clientName: event.clientName,
                status: event.status,
                deliveredAt: event.status === 'DELIVERED' ? new Date(event.timestamp).toISOString() : undefined,
                incidentReason: event.incidentReason,
              });
            }

            const totalStops = updatedStops.length;
            const deliveredCount = updatedStops.filter((s) => s.status === 'DELIVERED').length;
            const incidentCount = updatedStops.filter((s) => s.status === 'INCIDENT').length;
            const absentCount = updatedStops.filter((s) => s.status === 'ABSENT').length;
            const pendingCount = Math.max(0, totalStops - deliveredCount - incidentCount - absentCount);
            const progressPercentage = totalStops > 0 ? Math.round((deliveredCount / totalStops) * 100) : 0;

            const newRouteStatus =
              deliveredCount === totalStops && totalStops > 0
                ? 'COMPLETED'
                : deliveredCount > 0 || incidentCount > 0 || absentCount > 0
                ? 'IN_PROGRESS'
                : existingRoute.status;

            updatedActiveRoutes[routeId] = {
              ...existingRoute,
              driverName: event.driverName || existingRoute.driverName,
              status: newRouteStatus,
              stops: updatedStops,
              totalStops,
              deliveredCount,
              incidentCount,
              absentCount,
              pendingCount,
              progressPercentage,
            };
          }

          // Sincronizar también con la ruta actual en navegación si coincide
          let updatedRoute = state.route;
          if (state.route && (state.route.id === routeId || state.route.batchId === routeId)) {
            const orders = Array.isArray(state.route.orders) ? state.route.orders : [];
            const updatedOrders = orders.map((o: any) => {
              if (o.id === event.orderId) {
                return { ...o, status: event.status, nonDeliveryReason: event.incidentReason };
              }
              return o;
            });
            updatedRoute = { ...state.route, orders: updatedOrders };
          }

          const updatedBackupOrders = state.backupOrders.map((o: any) => {
            if (o.id === event.orderId) {
              return { ...o, status: event.status, nonDeliveryReason: event.incidentReason };
            }
            return o;
          });

          return {
            activeRoutes: updatedActiveRoutes,
            route: updatedRoute,
            backupOrders: updatedBackupOrders,
          };
        }),
      setMapTheme: (mapTheme) => set({ mapTheme }),
      setShowPOIs: (showPOIs) => set({ showPOIs }),
      clear: () => set({ route: null, backupOrders: [], mapTheme: 'light', showPOIs: false }),
    }),
    { 
      name: 'viberoute-navigation-storage',
      partialize: (state) => ({ 
        driverPos: state.driverPos, 
        fleetDrivers: state.fleetDrivers,
        activeRoutes: state.activeRoutes,
        mapTheme: state.mapTheme, 
        showPOIs: state.showPOIs 
      })
    }
  )
);
