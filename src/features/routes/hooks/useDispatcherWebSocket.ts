import { useEffect, useRef, useState, useCallback } from 'react';
import { Client, StompSubscription, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from '../../../app/store/authStore';
import { useRouteStore } from '../../../app/store/routeStore';
import { WebSocketDeliveryEventDto } from '../types/smartwatch.types';

export interface UseDispatcherWebSocketOptions {
  /**
   * URL del endpoint SockJS WebSocket del backend.
   * Por defecto: `${apiBase}/ws-alertas`
   */
  url?: string;
  /**
   * Topic STOMP al cual suscribirse.
   * Por defecto: `/topic/dispatcher/deliveries`
   */
  topic?: string;
  /**
   * Callback invocado cada vez que llega un evento del smartwatch.
   * Ideal para disparar Toasts o efectos visuales en el dashboard.
   */
  onDeliveryEvent?: (event: WebSocketDeliveryEventDto) => void;
  /**
   * Handler de conexión exitosa
   */
  onConnect?: () => void;
  /**
   * Handler de desconexión
   */
  onDisconnect?: () => void;
  /**
   * Si debe activar la suscripción de inmediato
   */
  enabled?: boolean;
}

export function useDispatcherWebSocket({
  url,
  topic = '/topic/dispatcher/deliveries',
  onDeliveryEvent,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseDispatcherWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebSocketDeliveryEventDto | null>(null);

  const clientRef = useRef<Client | null>(null);
  const subRef = useRef<StompSubscription | null>(null);

  // Referencias estables para evitar re-creación innecesaria de la conexión STOMP
  const onDeliveryEventRef = useRef(onDeliveryEvent);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);

  useEffect(() => {
    onDeliveryEventRef.current = onDeliveryEvent;
  }, [onDeliveryEvent]);

  useEffect(() => {
    onConnectRef.current = onConnect;
  }, [onConnect]);

  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);

  // Resolver URL por defecto
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
  const defaultWsUrl = `${apiBase.replace(/\/api\/v1\/?$/, '')}/ws-alertas`;
  const resolvedUrl = url || defaultWsUrl;

  const connect = useCallback(() => {
    if (clientRef.current?.active) return;

    // Obtener token JWT actual para autenticar el canal STOMP
    const token = useAuthStore.getState().token;
    const connectHeaders: Record<string, string> = {};
    if (token) {
      connectHeaders['Authorization'] = `Bearer ${token}`;
    }

    const client = new Client({
      webSocketFactory: () => new SockJS(resolvedUrl) as any,
      connectHeaders,
      reconnectDelay: 4000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,

      onConnect: () => {
        setIsConnected(true);
        onConnectRef.current?.();

        subRef.current = client.subscribe(topic, (frame: IMessage) => {
          try {
            const raw = JSON.parse(frame.body);
            // Normalizar el DTO recibido
            const event: WebSocketDeliveryEventDto = {
              routeId: Number(raw.routeId ?? raw.batchId ?? 0),
              orderId: Number(raw.orderId ?? raw.id ?? 0),
              driverId: Number(raw.driverId ?? 0),
              driverName: raw.driverName ?? 'Conductor',
              status: raw.status ?? raw.newStatus ?? 'DELIVERED',
              address: raw.address ?? raw.destinationAddress,
              clientName: raw.clientName,
              timestamp: raw.timestamp ?? Date.now(),
              incidentReason: raw.incidentReason ?? raw.reason ?? raw.notes,
              notes: raw.notes,
              latitude: raw.latitude ? Number(raw.latitude) : undefined,
              longitude: raw.longitude ? Number(raw.longitude) : undefined,
              batteryLevel: raw.batteryLevel ? Number(raw.batteryLevel) : undefined,
            };

            // 1. Actualizar el estado global en Zustand (sin re-renders masivos)
            useRouteStore.getState().updateDeliveryFromEvent(event);

            // 2. Notificar al listener (para Toasts de UI)
            setLastEvent(event);
            onDeliveryEventRef.current?.(event);
          } catch (err) {
            console.error('[DispatcherWS] Error parseando payload de telemetría:', err, frame.body);
          }
        });
      },

      onDisconnect: () => {
        setIsConnected(false);
        onDisconnectRef.current?.();
      },

      onStompError: (frame) => {
        console.error('[DispatcherWS] STOMP error:', frame.headers['message']);
      },

      onWebSocketError: (event) => {
        console.warn('[DispatcherWS] Transporte WebSocket cerrado o no disponible:', event);
      },
    });

    client.activate();
    clientRef.current = client;
  }, [resolvedUrl, topic]);

  const disconnect = useCallback(() => {
    subRef.current?.unsubscribe();
    subRef.current = null;
    clientRef.current?.deactivate();
    clientRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connect,
    disconnect,
  };
}

export default useDispatcherWebSocket;

