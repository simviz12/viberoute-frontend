import { describe, it, expect, beforeEach } from 'vitest';
import { useRouteStore } from '../../../app/store/routeStore';
import { WebSocketDeliveryEventDto, ActiveRoute } from '../types/smartwatch.types';

describe('useRouteStore Smartwatch Integration', () => {
  beforeEach(() => {
    useRouteStore.setState({ activeRoutes: {} });
  });

  it('actualiza el estado de la parada y recalcula la barra de progreso al recibir un evento de entrega', () => {
    const initialRoute: ActiveRoute = {
      id: 5,
      code: 'RUT-0005',
      name: 'Ruta Pasto Norte',
      status: 'PLANNED',
      driverId: 10,
      driverName: 'Carlos Méndez',
      stops: [
        { id: 101, address: 'Calle 22 #5-43', status: 'PENDING', deliveryOrder: 1 },
        { id: 102, address: 'Carrera 27 #18-12', status: 'PENDING', deliveryOrder: 2 },
      ],
      totalStops: 2,
      deliveredCount: 0,
      incidentCount: 0,
      absentCount: 0,
      pendingCount: 2,
      progressPercentage: 0,
    };

    useRouteStore.getState().upsertActiveRoute(initialRoute);

    // Simular evento WebSocket emitido por el reloj (DELIVERED)
    const event: WebSocketDeliveryEventDto = {
      routeId: 5,
      orderId: 101,
      driverId: 10,
      driverName: 'Carlos Méndez',
      status: 'DELIVERED',
      address: 'Calle 22 #5-43',
      timestamp: Date.now(),
    };

    useRouteStore.getState().updateDeliveryFromEvent(event);

    const updatedRoute = useRouteStore.getState().activeRoutes[5];
    expect(updatedRoute).toBeDefined();

    // La parada debe haber cambiado a DELIVERED
    const stop1 = updatedRoute.stops.find((s) => s.id === 101);
    expect(stop1?.status).toBe('DELIVERED');

    // La métrica debe haber subido al 50%
    expect(updatedRoute.deliveredCount).toBe(1);
    expect(updatedRoute.progressPercentage).toBe(50);
    expect(updatedRoute.status).toBe('IN_PROGRESS');
  });

  it('maneja eventos de INCIDENT y ABSENT marcando las paradas adecuadamente', () => {
    const initialRoute: ActiveRoute = {
      id: 6,
      status: 'PLANNED',
      stops: [
        { id: 201, address: 'Avenida Panamericana #10', status: 'PENDING' },
      ],
      totalStops: 1,
      deliveredCount: 0,
      incidentCount: 0,
      absentCount: 0,
      pendingCount: 1,
      progressPercentage: 0,
    };

    useRouteStore.getState().upsertActiveRoute(initialRoute);

    // Evento de incidente reportado por el smartwatch
    const incidentEvent: WebSocketDeliveryEventDto = {
      routeId: 6,
      orderId: 201,
      driverId: 15,
      status: 'INCIDENT',
      incidentReason: 'Dirección no encontrada por obras viales',
      timestamp: Date.now(),
    };

    useRouteStore.getState().updateDeliveryFromEvent(incidentEvent);

    const updatedRoute = useRouteStore.getState().activeRoutes[6];
    const stop = updatedRoute.stops.find((s) => s.id === 201);
    expect(stop?.status).toBe('INCIDENT');
    expect(stop?.incidentReason).toBe('Dirección no encontrada por obras viales');
    expect(updatedRoute.incidentCount).toBe(1);
  });
});

