import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Navigation, Clock, MapPin, Box, Target, Sun, Moon, Phone, X, Truck, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../shared/lib/api';
import { useMissionStore } from '../../app/store/missionStore';
import { useRouteStore } from '../../app/store/routeStore';
import { useWebSocket } from '../../infrastructure/websocket/useWebSocket';

declare const L: any;

interface MapStop {
  id?: number;
  batchId?: number;
  deliveryOrder?: number;
  lat: number;
  lng: number;
  status?: string;
  address?: string;
  priority?: string;
  clientName?: string;
  clientReference?: string;
  phone?: string;
  driverName?: string;
}

const COMPLETED_STATUSES = new Set(['DELIVERED', 'RETURNED', 'CANCELLED']);
const PRIORITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const MapsNavigationModule: React.FC = () => {
  const { currentBatchId, setActiveOrder } = useMissionStore();
  const route = useRouteStore((s) => s.route);
  const backupOrders = useRouteStore((s) => s.backupOrders);
  const driverPos = useRouteStore((s) => s.driverPos);
  const fleetDrivers = useRouteStore((s) => s.fleetDrivers);
  const mapTheme = useRouteStore((s) => s.mapTheme);
  const setRoute = useRouteStore((s) => s.setRoute);
  const setDriverPos = useRouteStore((s) => s.setDriverPos);
  const setMapTheme = useRouteStore((s) => s.setMapTheme);
  const updateFleetDriver = useRouteStore((s) => s.updateFleetDriver);
  const setFleetDrivers = useRouteStore((s) => s.setFleetDrivers);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const fleetMarkersLayerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optMode, setOptMode] = useState<'EFFICIENCY' | 'PRIORITY'>('EFFICIENCY');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [etaInfo, setEtaInfo] = useState<{ distance: string; duration: string } | null>(null);

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

  // Escuchar por WebSockets el movimiento en tiempo real de TODA la flota
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
  const WS_URL = `${apiBase.replace('/api/v1', '')}/ws-alertas`;

  useWebSocket({
    url: WS_URL,
    topic: '/topic/fleet/locations',
    onMessage: (msg: any) => {
      if (msg && msg.driverId && msg.lat && msg.lng) {
        updateFleetDriver({
          driverId: msg.driverId,
          driverName: msg.driverName || `Conductor #${msg.driverId}`,
          lat: Number(msg.lat),
          lng: Number(msg.lng),
          status: msg.status || 'AVAILABLE',
          assignedCity: msg.assignedCity,
        });
      }
    },
  });

  // Cargar estado inicial de la flota desde la base de datos y rastrear GPS continuo en vivo
  useEffect(() => {
    let watchId: number | null = null;
    if (navigator.geolocation) {
      // 1. Obtener posición inmediata
      navigator.geolocation.getCurrentPosition(
        (geo) => {
          setDriverPos({ lat: geo.coords.latitude, lng: geo.coords.longitude });
        },
        () => {
          if (!driverPos) setDriverPos({ lat: 1.2136, lng: -77.2811 });
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );

      // 2. Rastreo continuo en vivo mientras el conductor se desplaza por la ciudad
      watchId = navigator.geolocation.watchPosition(
        (geo) => {
          const newPos = { lat: geo.coords.latitude, lng: geo.coords.longitude };
          setDriverPos(newPos);
        },
        (err) => console.warn('Geolocation watch error:', err),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    } else if (!driverPos) {
      setDriverPos({ lat: 1.2136, lng: -77.2811 });
    }

    api.get('/drivers/fleet-status')
      .then((res) => {
        if (Array.isArray(res.data)) {
          const valid = res.data
            .filter((d: any) => d.location && d.location.lat && d.location.lng)
            .map((d: any) => ({
              driverId: d.id,
              driverName: d.name,
              lat: Number(d.location.lat),
              lng: Number(d.location.lng),
              status: d.status,
              assignedCity: d.assignedCity,
            }));
          if (valid.length > 0) setFleetDrivers(valid);
        }
      })
      .catch((err) => console.warn('Error fetching fleet status for map:', err));

    return () => {
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Normalizar paradas de pedidos: Mostrar TODOS los pedidos asignados sin limitar por lote (hasta 100+ pedidos)
  const rawStops: MapStop[] = useMemo(() => {
    const rawList = route?.orders?.length ? route.orders : backupOrders;
    const list = Array.isArray(rawList) ? rawList : [];
    return list
      .map((o: any) => ({
        id: o.id,
        batchId: o.batchId,
        deliveryOrder: o.deliveryOrder ?? o.delivery_order ?? undefined,
        lat: Number(o.lat ?? o.latitude ?? o.location?.lat),
        lng: Number(o.lng ?? o.longitude ?? o.location?.lng),
        status: o.status,
        address: o.address,
        city: o.city || 'Pasto',
        priority: o.priority,
        clientName: o.clientName,
        clientReference: o.clientReference,
        phone: o.phone,
        price: o.price,
        notes: o.notes || o.observations,
      })).filter((s: MapStop) => !isNaN(s.lat) && !isNaN(s.lng));
  }, [route, backupOrders]);

  // Distancia euclidiana / haversine para calcular proximidad geografica
  const getDistanceSq = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) => {
    const dLat = p1.lat - p2.lat;
    const dLng = (p1.lng - p2.lng) * Math.cos((p1.lat * Math.PI) / 180);
    return dLat * dLat + dLng * dLng;
  };

  const displayedStops = useMemo(() => {
    const active = rawStops.filter((s) => !s.status || !COMPLETED_STATUSES.has(s.status));
    if (active.length <= 1) return active;

    if (optMode === 'PRIORITY') {
      const [first, ...rest] = active;
      return [
        first,
        ...rest.sort((a, b) => (PRIORITY_RANK[b.priority || ''] ?? 0) - (PRIORITY_RANK[a.priority || ''] ?? 0)),
      ];
    }

    // MODO EFFICIENCY:
    // 1. Si los pedidos ya tienen una secuencia optimizada asignada por el backend (deliveryOrder), respetarla
    const hasDeliveryOrder = active.some((s) => typeof s.deliveryOrder === 'number' && s.deliveryOrder > 0);
    if (hasDeliveryOrder) {
      return [...active].sort((a, b) => (a.deliveryOrder ?? 9999) - (b.deliveryOrder ?? 9999));
    }

    // 2. Si no tienen deliveryOrder, usar Vecino Más Cercano (Nearest Neighbor) natural paso a paso sin distorsiones
    const remaining = [...active];
    const ordered: MapStop[] = [];
    let currentPoint = driverPos || { lat: remaining[0].lat, lng: remaining[0].lng };

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = getDistanceSq(currentPoint, remaining[i]);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const [nextStop] = remaining.splice(nearestIdx, 1);
      ordered.push(nextStop);
      currentPoint = { lat: nextStop.lat, lng: nextStop.lng };
    }

    return ordered;
  }, [rawStops, optMode, driverPos]);

  const nextStop = displayedStops[0];

  // Inicializar Leaflet con OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const checkLeaflet = setInterval(() => {
      if (typeof L !== 'undefined') {
        clearInterval(checkLeaflet);

        if (!leafletMapRef.current && mapContainerRef.current) {
          const center = driverPos || (displayedStops.length > 0 ? { lat: displayedStops[0].lat, lng: displayedStops[0].lng } : { lat: 1.2136, lng: -77.2811 });
          const map = L.map(mapContainerRef.current, {
            center: [center.lat, center.lng],
            zoom: 14,
            zoomControl: false,
          });

          // OpenStreetMap 100% libre sin API Key jamás
          const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

          tileLayerRef.current = L.tileLayer(tileUrl, {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }).addTo(map);

          markersLayerRef.current = L.layerGroup().addTo(map);
          fleetMarkersLayerRef.current = L.layerGroup().addTo(map);

          map.on('dragstart', () => setIsFollowing(false));

          leafletMapRef.current = map;
          setMapReady(true);
          setLoading(false);

          setTimeout(() => {
            if (leafletMapRef.current) {
              leafletMapRef.current.invalidateSize();
            }
          }, 200);
        }
      }
    }, 50);

    return () => {
      clearInterval(checkLeaflet);
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Cambiar tema de mapa (Light / Dark) sin CartoDB para evitar marcas de agua 'API KEY REQUIRED'
  useEffect(() => {
    if (!leafletMapRef.current || !tileLayerRef.current) return;
    
    // Siempre usar los tiles libres de OpenStreetMap oficial
    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    tileLayerRef.current.setUrl(tileUrl);
    
    // Aplicar filtro dark directo al contenedor de tiles para un verdadero modo oscuro limpio
    const mapEl = mapContainerRef.current;
    if (mapEl) {
      const tilePane = mapEl.querySelector('.leaflet-tile-pane') as HTMLElement;
      if (tilePane) {
        if (mapTheme === 'dark') {
          tilePane.style.filter = 'brightness(0.65) invert(1) contrast(2.8) hue-rotate(195deg) saturate(0.35)';
        } else {
          tilePane.style.filter = 'none';
        }
      }
    }
  }, [mapTheme]);

  // Dibujar paradas de pedidos en Leaflet
  useEffect(() => {
    if (!leafletMapRef.current || !markersLayerRef.current || typeof L === 'undefined') return;

    markersLayerRef.current.clearLayers();

    displayedStops.forEach((stop, idx) => {
      const isNext = idx === 0;
      const markerColor = isNext ? '#10b981' : stop.priority === 'HIGH' ? '#f43f5e' : '#6366f1';

      const customIcon = L.divIcon({
        className: 'custom-stop-marker',
        html: `
          <div style="background-color: ${markerColor}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 11px; border: 2.5px solid white; box-shadow: 0 4px 14px rgba(0,0,0,0.3); cursor: pointer; transition: transform 0.2s;">
            ${idx + 1}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([stop.lat, stop.lng], { icon: customIcon });
      marker.on('click', () => {
        setSelectedOrder({ ...stop, stopNumber: idx + 1 });
        setSelectedDriver(null);
        if (leafletMapRef.current) {
          leafletMapRef.current.setView([stop.lat, stop.lng], 16, { animate: true });
        }
      });
      markersLayerRef.current.addLayer(marker);
    });

    if (mapReady && displayedStops.length > 0) {
      // Ajustar vista inicial
      const allCoords: [number, number][] = displayedStops.map((s) => [s.lat, s.lng]);
      if (driverPos) allCoords.push([driverPos.lat, driverPos.lng]);
      const bounds = L.latLngBounds(allCoords);
      leafletMapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [displayedStops, mapReady]);

  // Dibujar TODOS LOS CARROS DE LA FLOTA en tiempo real en el mapa
  useEffect(() => {
    if (!leafletMapRef.current || !fleetMarkersLayerRef.current || typeof L === 'undefined') return;

    fleetMarkersLayerRef.current.clearLayers();

    // 1. Dibujar el vehículo del conductor local si existe
    if (driverPos) {
      const driverIcon = L.divIcon({
        className: 'driver-gps-marker',
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 3px solid white; box-shadow: 0 4px 14px rgba(37,99,235,0.4); z-index: 10;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const selfMarker = L.marker([driverPos.lat, driverPos.lng], { icon: driverIcon, zIndexOffset: 1000 });
      fleetMarkersLayerRef.current.addLayer(selfMarker);

      if (isFollowing) {
        leafletMapRef.current.panTo([driverPos.lat, driverPos.lng]);
      }
    }

    // 2. Dibujar CADA CARRO de la flota activa
    Object.values(fleetDrivers).forEach((drv) => {
      const isBusy = drv.status === 'ON_ROUTE' || drv.status === 'BUSY';
      const bgColor = isBusy ? '#6366f1' : '#14b8a6';

      const fleetIcon = L.divIcon({
        className: 'fleet-vehicle-marker',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="background: ${bgColor}; padding: 3px 8px; border-radius: 8px; color: white; font-size: 9px; font-weight: 900; text-transform: uppercase; border: 1.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.2); white-space: nowrap; margin-bottom: 2px;">
              ${drv.driverName.split(' ')[0]}
            </div>
            <div style="background: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: ${bgColor}; border: 2.5px solid ${bgColor}; box-shadow: 0 4px 10px rgba(0,0,0,0.2);">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
            </div>
          </div>
        `,
        iconSize: [60, 50],
        iconAnchor: [30, 48],
      });

      const marker = L.marker([drv.lat, drv.lng], { icon: fleetIcon });
      marker.on('click', () => {
        setSelectedDriver(drv);
        setSelectedOrder(null);
      });
      fleetMarkersLayerRef.current.addLayer(marker);
    });
  }, [driverPos, fleetDrivers, isFollowing, mapReady]);

  // Trazar ruta libre con OSRM hacia la siguiente parada
  useEffect(() => {
    if (!leafletMapRef.current || typeof L === 'undefined' || !mapReady) return;

    if (routePolylineRef.current) {
      leafletMapRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    if (!driverPos || !nextStop) return;

    // Consultar servicio libre OSRM
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${driverPos.lng},${driverPos.lat};${nextStop.lng},${nextStop.lat}?overview=full&geometries=geojson`;

    fetch(osrmUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 'Ok' && data.routes?.length > 0) {
          const routeData = data.routes[0];
          const coords = routeData.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

          const durationMin = Math.round(routeData.duration / 60);
          const distanceKm = (routeData.distance / 1000).toFixed(1);
          setEtaInfo({
            duration: `${durationMin} min`,
            distance: `${distanceKm} km`,
          });

          if (leafletMapRef.current) {
            routePolylineRef.current = L.polyline(coords, {
              color: '#10b981',
              weight: 5,
              opacity: 0.85,
              lineCap: 'round',
            }).addTo(leafletMapRef.current);
          }
        }
      })
      .catch((err) => console.warn('OSRM Route fetch error:', err));
  }, [driverPos, nextStop]);

  const fitAll = useCallback(() => {
    if (!leafletMapRef.current || typeof L === 'undefined') return;
    const allCoords: [number, number][] = [];

    if (driverPos) allCoords.push([driverPos.lat, driverPos.lng]);
    displayedStops.forEach((s) => allCoords.push([s.lat, s.lng]));
    Object.values(fleetDrivers).forEach((d) => allCoords.push([d.lat, d.lng]));

    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords);
      leafletMapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [driverPos, displayedStops, fleetDrivers]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-900 select-none">
      {/* Contenedor Leaflet OpenStreetMap */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Tarjeta de Detalle del Pedido Seleccionado (Al tocar el marcador en el mapa) */}
      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0, y: 30, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 30, x: '-50%' }}
            className="absolute bottom-28 sm:bottom-32 left-1/2 z-50 w-[94%] max-w-sm pointer-events-auto"
          >
            <div className="bg-white/98 backdrop-blur-2xl p-5 rounded-3xl shadow-2xl border border-slate-200">
              <div className="flex justify-between items-start mb-3">
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Parada #{selectedOrder.stopNumber || selectedOrder.deliveryOrder || selectedOrder.id}
                    </span>
                    {selectedOrder.priority && (
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        selectedOrder.priority === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {selectedOrder.priority}
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-black text-slate-900 leading-tight truncate">{selectedOrder.address}</h4>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    {selectedOrder.clientName || 'Cliente'} {selectedOrder.clientReference ? `• Ref: ${selectedOrder.clientReference}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Información Adicional del Pedido */}
              <div className="grid grid-cols-2 gap-2 my-2 py-2 border-y border-slate-100 text-[11px]">
                <div>
                  <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider">Ciudad</span>
                  <span className="font-black text-slate-700">{selectedOrder.city || 'Pasto'}</span>
                </div>
                {selectedOrder.price && (
                  <div>
                    <span className="text-slate-400 font-bold block text-[9px] uppercase tracking-wider">Valor / Cobro</span>
                    <span className="font-black text-emerald-600">${Number(selectedOrder.price).toLocaleString('es-CO')}</span>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="col-span-2 bg-amber-50 p-2 rounded-xl text-amber-800 text-[10px] font-medium border border-amber-100 mt-1">
                    <span className="font-bold">Nota:</span> {selectedOrder.notes}
                  </div>
                )}
              </div>

              {/* Botón de Llamada */}
              {selectedOrder.phone ? (
                <a
                  href={`tel:${selectedOrder.phone}`}
                  className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
                >
                  <Phone size={14} className="text-emerald-600" /> Llamar al Cliente ({selectedOrder.phone})
                </a>
              ) : (
                <div className="mt-2 py-2 px-3 bg-slate-100 rounded-xl text-center text-xs text-slate-400 font-medium">
                  Sin teléfono registrado
                </div>
              )}

              {/* Botón de Acción Directa: Entregar Pedido */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.put(`/orders/${selectedOrder.id}/status?status=DELIVERED`);
                    // Actualizar estado en store local
                    const currentOrders = useRouteStore.getState().backupOrders;
                    useRouteStore.getState().setBackupOrders(
                      currentOrders.map((o: any) => o.id === selectedOrder.id ? { ...o, status: 'DELIVERED' } : o)
                    );
                    setSelectedOrder(null);
                  } catch (e) {
                    console.error('Error al entregar pedido:', e);
                    alert('No se pudo marcar la entrega. Verifica la conexión.');
                  }
                }}
                className="mt-2 flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/30 active:scale-95 transition-all"
              >
                <CheckCircle2 size={16} /> Marcar como Entregado
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tarjeta de Conductor de la Flota Seleccionado */}
      <AnimatePresence>
        {selectedDriver && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="absolute bottom-28 left-1/2 z-40 w-[92%] max-w-sm pointer-events-auto"
          >
            <div className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-2xl border border-slate-200">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500 flex items-center justify-center text-white">
                    <Truck size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{selectedDriver.driverName}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {selectedDriver.assignedCity || 'Pasto'} • {selectedDriver.status}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDriver(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 p-3 bg-slate-50 rounded-xl text-[10px] font-mono text-slate-600">
                Coordenadas en vivo: {selectedDriver.lat.toFixed(5)}, {selectedDriver.lng.toFixed(5)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra Superior Flotante: Selector de Modo (Sin emojis) + Información de Próximo Destino */}
      <div className="absolute top-3 inset-x-3 z-30 pointer-events-none flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {/* Switcher Eficiencia / Prioridad */}
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md p-1 rounded-2xl shadow-xl border border-slate-200/90 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setOptMode('EFFICIENCY')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                optMode === 'EFFICIENCY'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Eficiencia
            </button>
            <button
              type="button"
              onClick={() => setOptMode('PRIORITY')}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                optMode === 'PRIORITY'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Prioridad
            </button>
          </div>
        </div>

        {/* Banner Superior de Siguiente Parada (Clickeable para enfocar directamente el pedido) */}
        <AnimatePresence mode="wait">
          {nextStop && etaInfo && (
            <motion.div
              key={nextStop.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => {
                setSelectedOrder({ ...nextStop, stopNumber: 1 });
                setSelectedDriver(null);
                if (leafletMapRef.current) {
                  leafletMapRef.current.setView([nextStop.lat, nextStop.lng], 16, { animate: true });
                }
              }}
              className="bg-white/95 backdrop-blur-xl p-3 sm:p-4 rounded-3xl border border-slate-200 shadow-2xl pointer-events-auto max-w-md cursor-pointer hover:border-emerald-300 hover:shadow-emerald-500/10 transition-all active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-2.5 rounded-2xl text-white shadow-lg shadow-emerald-500/20 shrink-0">
                  <Navigation className="w-5 h-5" fill="currentColor" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">Siguiente Destino</p>
                    <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                      #1
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-900 font-black truncate">{nextStop.address}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-black">
                    <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg text-slate-700 border border-slate-200">
                      <Clock className="w-3 h-3 text-emerald-600" /> {etaInfo.duration}
                    </span>
                    <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-lg text-slate-700 border border-slate-200">
                      <MapPin className="w-3 h-3 text-emerald-600" /> {etaInfo.distance}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Botones de Control de Mapa (Derecha) */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setMapTheme(mapTheme === 'light' ? 'dark' : 'light')}
          className="pointer-events-auto min-h-[40px] min-w-[40px] bg-white/95 backdrop-blur-md p-3 rounded-2xl text-slate-900 shadow-xl border border-slate-200 active:scale-95 transition-all"
        >
          {mapTheme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={fitAll}
          className="pointer-events-auto min-h-[40px] min-w-[40px] bg-white/95 p-3 rounded-2xl text-slate-900 shadow-xl border border-slate-200 active:scale-95 transition-all"
        >
          <Target className="w-4 h-4" />
        </button>
        {nextStop && (
          <button
            type="button"
            title="Ir al siguiente destino"
            onClick={() => {
              setSelectedOrder({ ...nextStop, stopNumber: 1 });
              setSelectedDriver(null);
              if (leafletMapRef.current) {
                leafletMapRef.current.setView([nextStop.lat, nextStop.lng], 16, { animate: true });
              }
            }}
            className="pointer-events-auto min-h-[40px] min-w-[40px] bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-2xl shadow-xl shadow-emerald-600/30 flex items-center justify-center border border-emerald-500 active:scale-95 transition-all"
          >
            <Navigation className="w-4 h-4" fill="currentColor" />
          </button>
        )}
      </div>

      {/* Footer Info Lote (Elevado para dejar visible la barra de navegación Turno/Mapa/Pedidos) */}
      <div className="absolute inset-x-3 bottom-24 sm:bottom-28 lg:bottom-6 z-20 flex flex-col gap-4 pointer-events-none">
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-3 sm:p-4 border border-slate-200 flex flex-col gap-2 max-h-[24vh] overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-600 shrink-0">
                <Box className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-black text-slate-900 leading-none truncate">
                  Lote #{currentBatchId || 'Flota en Vivo'}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-0.5">
                  {displayedStops.length} envíos activos • {Object.keys(fleetDrivers).length} carros monitoreados
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                optMode === 'EFFICIENCY' ? 'bg-slate-100 text-slate-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {optMode === 'EFFICIENCY' ? 'Vecino Cercano' : 'Prioridad'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
