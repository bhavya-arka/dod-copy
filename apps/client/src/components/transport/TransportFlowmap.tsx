import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

export interface FlowmapRoute {
  id: number | string;
  origin: { lat: number; lng: number; name: string };
  destination: { lat: number; lng: number; name: string };
  mode: 'land' | 'sea';
  status: string;
}

export interface ActiveTransport {
  id: number | string;
  routeId: number | string;
  currentPosition: { lat: number; lng: number };
  mode: 'land' | 'sea';
  name: string;
}

export interface TransportFlowmapProps {
  routes: FlowmapRoute[];
  activeTransports?: ActiveTransport[];
  height?: number;
  className?: string;
}

const LAND_COLOR = "#f59e0b";
const SEA_COLOR = "#14b8a6";

const createNodeIcon = (mode: 'land' | 'sea' | 'both', size: number = 28) => {
  const color = mode === 'land' ? LAND_COLOR : mode === 'sea' ? SEA_COLOR : "#6366f1";
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="#1f2937" stroke-width="2"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
    </svg>
  `;
  return L.divIcon({
    html: svgIcon,
    className: "flowmap-node",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

const createTransportIcon = (mode: 'land' | 'sea', size: number = 24) => {
  const color = mode === 'land' ? LAND_COLOR : SEA_COLOR;
  const icon = mode === 'land' 
    ? `<path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="white"/>`
    : `<path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42c-.26.08-.48.26-.6.5s-.15.52-.06.78L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" fill="white"/>`;
  
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
      <circle cx="12" cy="12" r="11" fill="${color}" stroke="#1f2937" stroke-width="2"/>
      ${icon}
    </svg>
  `;
  return L.divIcon({
    html: svgIcon,
    className: "flowmap-transport",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

function FitBoundsComponent({ routes }: { routes: FlowmapRoute[] }) {
  const map = useMap();

  useEffect(() => {
    if (routes.length === 0) return;

    const allPoints: L.LatLngExpression[] = [];
    routes.forEach((route) => {
      allPoints.push([route.origin.lat, route.origin.lng]);
      allPoints.push([route.destination.lat, route.destination.lng]);
    });

    if (allPoints.length >= 2) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [map, routes]);

  return null;
}

function AnimatedTransportMarker({ 
  transport, 
  route 
}: { 
  transport: ActiveTransport; 
  route?: FlowmapRoute;
}) {
  const [position, setPosition] = useState(transport.currentPosition);
  
  useEffect(() => {
    if (!route) return;
    
    const interval = setInterval(() => {
      setPosition(prev => {
        const dx = route.destination.lat - route.origin.lat;
        const dy = route.destination.lng - route.origin.lng;
        const progress = Math.random() * 0.02;
        
        const newLat = prev.lat + dx * progress;
        const newLng = prev.lng + dy * progress;
        
        const minLat = Math.min(route.origin.lat, route.destination.lat);
        const maxLat = Math.max(route.origin.lat, route.destination.lat);
        const minLng = Math.min(route.origin.lng, route.destination.lng);
        const maxLng = Math.max(route.origin.lng, route.destination.lng);
        
        if (newLat < minLat || newLat > maxLat || newLng < minLng || newLng > maxLng) {
          return route.origin;
        }
        
        return { lat: newLat, lng: newLng };
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [route]);

  const icon = useMemo(() => createTransportIcon(transport.mode), [transport.mode]);

  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={icon}
      title={transport.name}
    />
  );
}

export function TransportFlowmap({
  routes,
  activeTransports = [],
  height = 400,
  className,
}: TransportFlowmapProps) {
  const nodes = useMemo(() => {
    const nodeMap = new Map<string, { lat: number; lng: number; name: string; modes: Set<'land' | 'sea'> }>();
    
    routes.forEach((route) => {
      const originKey = `${route.origin.lat},${route.origin.lng}`;
      const destKey = `${route.destination.lat},${route.destination.lng}`;
      
      if (!nodeMap.has(originKey)) {
        nodeMap.set(originKey, { ...route.origin, modes: new Set() });
      }
      nodeMap.get(originKey)!.modes.add(route.mode);
      
      if (!nodeMap.has(destKey)) {
        nodeMap.set(destKey, { ...route.destination, modes: new Set() });
      }
      nodeMap.get(destKey)!.modes.add(route.mode);
    });
    
    return Array.from(nodeMap.values()).map(node => ({
      ...node,
      mode: node.modes.size > 1 ? 'both' as const : Array.from(node.modes)[0] || 'land' as const,
    }));
  }, [routes]);

  const center = useMemo(() => {
    if (routes.length === 0) {
      return { lat: 39.8283, lng: -98.5795 };
    }
    
    let totalLat = 0;
    let totalLng = 0;
    let count = 0;
    
    routes.forEach((route) => {
      totalLat += route.origin.lat + route.destination.lat;
      totalLng += route.origin.lng + route.destination.lng;
      count += 2;
    });
    
    return { lat: totalLat / count, lng: totalLng / count };
  }, [routes]);

  const routesByMode = useMemo(() => ({
    land: routes.filter(r => r.mode === 'land'),
    sea: routes.filter(r => r.mode === 'sea'),
  }), [routes]);

  return (
    <div className={cn("rounded-xl overflow-hidden border border-gray-200 bg-white", className)} style={{ height }}>
      <style>{`
        .flowmap-node, .flowmap-transport {
          background: transparent;
          border: none;
        }
        .leaflet-control-attribution {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.9) !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .flowmap-transport {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>
      
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        
        {routes.length > 0 && <FitBoundsComponent routes={routes} />}

        {routesByMode.land.map((route) => (
          <Polyline
            key={`land-${route.id}`}
            positions={[
              [route.origin.lat, route.origin.lng],
              [route.destination.lat, route.destination.lng],
            ]}
            pathOptions={{
              color: LAND_COLOR,
              weight: 3,
              opacity: 0.8,
              lineCap: "round",
              lineJoin: "round",
              dashArray: route.status === 'underway' ? undefined : "8, 8",
            }}
          />
        ))}

        {routesByMode.sea.map((route) => (
          <Polyline
            key={`sea-${route.id}`}
            positions={[
              [route.origin.lat, route.origin.lng],
              [route.destination.lat, route.destination.lng],
            ]}
            pathOptions={{
              color: SEA_COLOR,
              weight: 3,
              opacity: 0.8,
              lineCap: "round",
              lineJoin: "round",
              dashArray: route.status === 'underway' ? undefined : "8, 8",
            }}
          />
        ))}

        {nodes.map((node, index) => (
          <Marker
            key={`node-${index}`}
            position={[node.lat, node.lng]}
            icon={createNodeIcon(node.mode)}
            title={node.name}
          />
        ))}

        {activeTransports.map((transport) => {
          const route = routes.find(r => r.id === transport.routeId);
          return (
            <AnimatedTransportMarker
              key={`transport-${transport.id}`}
              transport={transport}
              route={route}
            />
          );
        })}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-md border border-gray-200 p-3">
        <div className="text-xs font-semibold text-gray-900 mb-2">Legend</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="w-5 h-1 rounded-full" style={{ backgroundColor: LAND_COLOR }} />
            <span className="text-xs text-gray-700">Land Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-1 rounded-full" style={{ backgroundColor: SEA_COLOR }} />
            <span className="text-xs text-gray-700">Sea Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-gray-700" style={{ backgroundColor: 'white' }} />
            <span className="text-xs text-gray-700">Base/Port</span>
          </div>
          {activeTransports.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: '#6366f1' }} />
              <span className="text-xs text-gray-700">Active Transport</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
