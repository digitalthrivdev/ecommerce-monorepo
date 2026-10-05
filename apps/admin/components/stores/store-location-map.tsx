"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export type Point = { latitude: number; longitude: number };
export type MapFocus = Point & { id: number };

export type StoreLocationMapProps = {
  position: Point | null;
  radiusKm: number | null;
  /** Fly here when it changes (a search result or the browser's location). */
  focus: MapFocus | null;
  onPick: (point: Point) => void;
};

const pinIcon = L.divIcon({
  className: "",
  html: `<svg viewBox="0 0 32 40" width="32" height="40" class="text-primary drop-shadow"><path fill="currentColor" d="M16 0C7.2 0 0 7 0 15.7 0 27.5 16 40 16 40s16-12.5 16-24.3C32 7 24.8 0 16 0z"/><circle cx="16" cy="15.5" r="6" fill="white"/></svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
});

/** Area that shows the whole delivery circle (or a few streets when there is no radius yet). */
function boundsAround(point: Point, radiusKm: number | null) {
  return L.latLng(point.latitude, point.longitude).toBounds(Math.max(radiusKm ?? 0, 0.4) * 2200);
}

function MapBehaviour({ position, radiusKm, focus, onPick }: StoreLocationMapProps) {
  const map = useMap();
  useMapEvents({ click: (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });

  useEffect(() => {
    if (focus) map.flyToBounds(boundsAround(focus, radiusKm), { duration: 0.6, maxZoom: 17 });
    // Only a new focus moves the map; radius changes keep the admin's zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, map]);

  useEffect(() => {
    if (!position) return;
    const point = L.latLng(position.latitude, position.longitude);
    if (!map.getBounds().contains(point)) map.panTo(point);
  }, [position, map]);

  return null;
}

export default function StoreLocationMap(props: StoreLocationMapProps) {
  const { position, radiusKm, onPick } = props;
  return (
    <MapContainer
      {...(position ? { bounds: boundsAround(position, radiusKm) } : { center: [20, 0] as L.LatLngTuple, zoom: 2 })}
      scrollWheelZoom
      className="isolate h-80 w-full rounded-lg border"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {position && (
        <>
          {radiusKm !== null && radiusKm > 0 && (
            <Circle
              center={[position.latitude, position.longitude]}
              radius={radiusKm * 1000}
              pathOptions={{ className: "stroke-primary fill-primary", weight: 2, fillOpacity: 0.12 }}
            />
          )}
          <Marker
            position={[position.latitude, position.longitude]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as L.Marker).getLatLng();
                onPick({ latitude: lat, longitude: lng });
              },
            }}
          />
        </>
      )}
      <MapBehaviour {...props} />
    </MapContainer>
  );
}
