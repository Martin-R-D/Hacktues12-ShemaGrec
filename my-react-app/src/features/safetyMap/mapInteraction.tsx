import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import type { MapPickMode } from "./types";

export function MapClickHandler({
  pickMode,
  onPick,
}: {
  pickMode: MapPickMode;
  onPick: (
    latlng: { lat: number; lng: number },
    mode: Exclude<MapPickMode, null>,
  ) => void;
}) {
  useMapEvents({
    click(e) {
      if (!pickMode) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng }, pickMode);
    },
  });

  return null;
}

export function MapPanTo({
  center,
  seq,
}: {
  center: [number, number] | null;
  seq: number;
}) {
  const map = useMap();
  const lastSeqRef = useRef(-1);

  useEffect(() => {
    if (center && seq !== lastSeqRef.current) {
      lastSeqRef.current = seq;
      map.panTo(center);
      map.setZoom(16);
    }
  }, [center, seq, map]);

  return null;
}
