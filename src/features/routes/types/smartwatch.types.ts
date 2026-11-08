export type DeliveryStatus = 
  | 'PENDING'
  | 'ON_ROUTE'
  | 'DELIVERED'
  | 'ABSENT'
  | 'INCIDENT'
  | 'CANCELLED'
  | 'RETURNED';

export type RouteStatus = 
  | 'DRAFT'
  | 'PLANNED'
  | 'DISPATCHED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * DTO emitido por el backend a través de STOMP en /topic/dispatcher/deliveries
 * cuando el reloj inteligente (Wear OS) confirma una acción de entrega.
 */
export interface WebSocketDeliveryEventDto {
  routeId: number;
  orderId: number;
  driverId: number;
  driverName?: string;
  status: 'DELIVERED' | 'ABSENT' | 'INCIDENT' | DeliveryStatus;
  address?: string;
  clientName?: string;
  timestamp: string | number;
  incidentReason?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  batteryLevel?: number;
}

export interface DeliveryStop {
  id: number;
  address: string;
  city?: string;
  clientName?: string;
  clientReference?: string;
  phone?: string;
  deliveryOrder?: number;
  status: DeliveryStatus;
  price?: number;
  deliveredAt?: string;
  incidentReason?: string;
  lat?: number;
  lng?: number;
}

export interface ActiveRoute {
  id: number;
  code?: string;
  name?: string;
  status: RouteStatus;
  driverId?: number;
  driverName?: string;
  driverPhone?: string;
  city?: string;
  createdAt?: string;
  dispatchedAt?: string;
  stops: DeliveryStop[];
  totalStops: number;
  deliveredCount: number;
  incidentCount: number;
  absentCount: number;
  pendingCount: number;
  progressPercentage: number;
}

export interface DispatchRoutePayload {
  driverId: number | string;
}

export interface DispatchRouteResponse {
  routeId: number;
  driverId: number;
  status: RouteStatus;
  message?: string;
  dispatchedAt?: string;
}

