import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

export interface RouteMapProps {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
  waypoints?: Array<{ lat: number; lng: number; label?: string }>;
  polyline?: string;
  height?: number;
  className?: string;
}

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

const createIcon = (color: string, size: number = 24) => {
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
      <path fill="${color}" stroke="#1a1a1a" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `;
  return L.divIcon({
    html: svgIcon,
    className: "custom-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

const originIcon = createIcon("#22c55e", 28);
const destinationIcon = createIcon("#ef4444", 28);
const waypointIcon = createIcon("#3b82f6", 22);

function FitBoundsComponent({ 
  origin, 
  destination, 
  waypoints 
}: { 
  origin: { lat: number; lng: number }; 
  destination: { lat: number; lng: number }; 
  waypoints?: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();

  useEffect(() => {
    const allPoints: L.LatLngExpression[] = [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ];

    waypoints?.forEach((wp) => {
      allPoints.push([wp.lat, wp.lng]);
    });

    if (allPoints.length >= 2) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, origin, destination, waypoints]);

  return null;
}

export function RouteMap({
  origin,
  destination,
  waypoints = [],
  polyline,
  height = 300,
  className,
}: RouteMapProps) {
  const decodedPath = useMemo(() => {
    if (polyline) {
      return decodePolyline(polyline);
    }
    const path: [number, number][] = [[origin.lat, origin.lng]];
    waypoints.forEach((wp) => path.push([wp.lat, wp.lng]));
    path.push([destination.lat, destination.lng]);
    return path;
  }, [polyline, origin, destination, waypoints]);

  const center = useMemo(() => {
    const midLat = (origin.lat + destination.lat) / 2;
    const midLng = (origin.lng + destination.lng) / 2;
    return { lat: midLat, lng: midLng };
  }, [origin, destination]);

  return (
    <div 
      className={cn("rounded-xl overflow-hidden border border-amber-200", className)} 
      style={{ height }}
    >
      <style>{`
        .custom-marker {
          background: transparent;
          border: none;
        }
        .leaflet-control-attribution {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.7) !important;
        }
      `}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={10}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <FitBoundsComponent 
          origin={origin} 
          destination={destination} 
          waypoints={waypoints} 
        />

        <Polyline
          positions={decodedPath}
          pathOptions={{
            color: "#f59e0b",
            weight: 4,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          }}
        />

        <Marker 
          position={[origin.lat, origin.lng]} 
          icon={originIcon}
          title={origin.label || "Origin"}
        />

        {waypoints.map((wp, index) => (
          <Marker
            key={`waypoint-${index}`}
            position={[wp.lat, wp.lng]}
            icon={waypointIcon}
            title={wp.label || `Waypoint ${index + 1}`}
          />
        ))}

        <Marker 
          position={[destination.lat, destination.lng]} 
          icon={destinationIcon}
          title={destination.label || "Destination"}
        />
      </MapContainer>
    </div>
  );
}
