import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Beer, UserStats } from '../data';
import { displayName, fmtDateTime, fmtVolume } from '../utils';
import { useDarkMode } from '../utils';

export type MapMode = 'heat' | 'points';

export interface MapPoint {
  beer: Beer;
  lat: number;
  lng: number;
}

export function toPoints(beers: Beer[]): MapPoint[] {
  return beers.flatMap((b) => (b.lat !== null && b.lng !== null ? [{ beer: b, lat: b.lat, lng: b.lng }] : []));
}

// Standaardtegels van OpenStreetMap (geen API-sleutel nodig). In dark mode worden ze met een
// CSS-filter donker gemaakt, zie .map-tiles in styles.css.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Zoomt de kaart naar de punten wanneer de selectie verandert (niet bij elke live-update). */
function FitBounds({ points, fitKey }: { points: MapPoint[]; fitKey: string }) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!points.length || lastKey.current === fitKey) return;
    lastKey.current = fitKey;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
  }, [points, fitKey, map]);
  return null;
}

/** Hittekaart-laag (leaflet.heat). */
function HeatLayer({ points, dark }: { points: MapPoint[]; dark: boolean }) {
  const map = useMap();
  useEffect(() => {
    const layer = L.heatLayer(
      points.map((p) => [p.lat, p.lng, 1] as [number, number, number]),
      {
        radius: 22,
        blur: 18,
        minOpacity: 0.35,
        maxZoom: 15,
        gradient: dark
          ? { 0.2: '#5a3a00', 0.45: '#b36b00', 0.7: '#ffa600', 1: '#fff4dc' }
          : { 0.2: '#ffe2a6', 0.45: '#ffbf40', 0.7: '#ffa600', 1: '#b33c00' },
      },
    ).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, points, dark]);
  return null;
}

/** Vliegt naar een plek als `focus` verandert. */
function FlyTo({ focus }: { focus: { lat: number; lng: number; key: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [focus, map]);
  return null;
}

export function BeerMap({ points, usersById, mode, fitKey, freshIds, focus, height = 520 }: {
  points: MapPoint[];
  usersById: Map<string, UserStats>;
  mode: MapMode;
  fitKey: string;
  freshIds?: Set<string>;
  focus?: { lat: number; lng: number; key: number } | null;
  height?: number;
}) {
  const dark = useDarkMode();
  // Zonder punten: Nederland in beeld.
  const center = useMemo<[number, number]>(() => [52.2, 5.3], []);

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer center={center} zoom={7} scrollWheelZoom className="map" attributionControl>
        <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} className="map-tiles" />
        <FitBounds points={points} fitKey={fitKey} />
        <FlyTo focus={focus ?? null} />
        {mode === 'heat' ? (
          <HeatLayer points={points} dark={dark} />
        ) : (
          points.map((p) => {
            const u = usersById.get(p.beer.userId);
            const fresh = freshIds?.has(p.beer.id);
            return (
              <CircleMarker
                key={p.beer.id}
                center={[p.lat, p.lng]}
                radius={fresh ? 9 : 6}
                pathOptions={{
                  color: dark ? '#15110e' : '#ffffff',
                  weight: 1.5,
                  fillColor: '#ffa600',
                  fillOpacity: 0.85,
                  className: fresh ? 'map-fresh' : undefined,
                }}
              >
                <Popup>
                  <div className="map-popup">
                    {u ? <Link to={`/users/${u.uid}`}>{displayName(u)}</Link> : <span>Verwijderd account</span>}
                    <div>{fmtVolume(p.beer.volume)}</div>
                    <div className="muted">{fmtDateTime(p.beer.date)}</div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })
        )}
      </MapContainer>
      {!points.length && <div className="map-empty">Geen biertjes met locatie in deze selectie.</div>}
    </div>
  );
}
