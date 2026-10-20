import { useEffect, useState } from 'react';

/*
 * Cache voor profielfoto's en banners.
 *
 * De app slaat afbeeldingen op onder een unieke bestandsnaam (met tijdstempel), dus een URL
 * verandert nooit van inhoud. Daarom bewaren we elke afbeelding na één keer laden in de
 * Cache Storage van de browser en tonen we hem daarna direct, zonder nieuw verzoek naar
 * Firebase Storage. Ook als Storage tijdelijk niet bereikbaar is.
 */

const CACHE_NAME = 'brewmate-images-v1';
const RETRY_AFTER_MS = 2 * 60_000;

/** undefined = nog niet bekend, string = te tonen src, null = laden mislukt. */
const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

const hasCacheApi = () => typeof window !== 'undefined' && 'caches' in window;

async function fetchAndCache(url: string): Promise<string | null> {
  try {
    const cache = hasCacheApi() ? await caches.open(CACHE_NAME) : null;
    const hit = await cache?.match(url);
    if (hit) return URL.createObjectURL(await hit.blob());

    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    await cache?.put(url, new Response(blob, { headers: { 'Content-Type': blob.type } }));
    return URL.createObjectURL(blob);
  } catch {
    // CORS- of netwerkfout: laat de <img> het zelf proberen (dan cachet de browser hem nog wel).
    return url;
  }
}

function loadImage(url: string): Promise<string | null> {
  let p = pending.get(url);
  if (!p) {
    p = fetchAndCache(url).then((src) => {
      resolved.set(url, src);
      if (src === null) {
        // Mislukt (bijv. Storage tijdelijk dicht): over een paar minuten opnieuw proberen.
        setTimeout(() => {
          resolved.delete(url);
          pending.delete(url);
        }, RETRY_AFTER_MS);
      }
      return src;
    });
    pending.set(url, p);
  }
  return p;
}

/** Geeft de te tonen afbeelding: string (src), null (mislukt) of undefined (nog bezig). */
export function useCachedImage(url: string | null | undefined): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(() => (url ? resolved.get(url) : null));

  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    const known = resolved.get(url);
    if (known !== undefined) {
      setSrc(known);
      return;
    }
    setSrc(undefined);
    let alive = true;
    loadImage(url).then((v) => alive && setSrc(v));
    return () => {
      alive = false;
    };
  }, [url]);

  return src;
}

/** Verwijdert afbeeldingen die niet meer bij een gebruiker horen (oude profielfoto's). */
export async function pruneImageCache(keep: Set<string>) {
  if (!hasCacheApi()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(keys.filter((req) => !keep.has(req.url)).map((req) => cache.delete(req)));
  } catch {
    // Opruimen is optioneel.
  }
}

export async function clearImageCache() {
  resolved.clear();
  pending.clear();
  if (hasCacheApi()) await caches.delete(CACHE_NAME).catch(() => false);
}
