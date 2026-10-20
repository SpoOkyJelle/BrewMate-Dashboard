import { useMemo } from 'react';
import { useData, type Beer } from '../data';
import { BeerMap, toPoints } from './BeerMap';

/** Kleine kaart met de biertjes van één gebruiker (los bestand, zodat Leaflet lazy laadt). */
export default function UserMap({ beers }: { beers: Beer[] }) {
  const { data } = useData();
  const points = useMemo(() => toPoints(beers), [beers]);
  return <BeerMap points={points} usersById={data!.usersById} mode="points" fitKey={beers[0]?.userId ?? ''} height={340} />;
}
