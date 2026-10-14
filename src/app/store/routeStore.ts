import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  mapTheme: 'light' | 'dark';
  showPOIs: boolean;
  setRoute: (route: any) => void;
  setBackupOrders: (orders: any[]) => void;
  setDriverPos: (pos: { lat: number; lng: number }) => void;
  updateFleetDriver: (driver: FleetDriverPosition) => void;
  setFleetDrivers: (drivers: FleetDriverPosition[]) => void;
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
      setMapTheme: (mapTheme) => set({ mapTheme }),
      setShowPOIs: (showPOIs) => set({ showPOIs }),
      clear: () => set({ route: null, backupOrders: [], mapTheme: 'light', showPOIs: false }),
    }),
    { 
      name: 'viberoute-navigation-storage',
      partialize: (state) => ({ 
        driverPos: state.driverPos, 
        fleetDrivers: state.fleetDrivers,
        mapTheme: state.mapTheme, 
        showPOIs: state.showPOIs 
      })
    }
  )
);
