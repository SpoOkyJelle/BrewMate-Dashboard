import { useSyncExternalStore } from 'react';

/** Licht, donker of automatisch (volgt de instelling van het systeem). */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // Opslag geblokkeerd: dan gewoon het systeem volgen.
  }
  return 'system';
}

let pref = readPref();
let dark = pref === 'dark' || (pref === 'system' && media.matches);

/** Zet het uiteindelijke thema op <html data-theme>; de CSS kijkt alleen daarnaar. */
function apply() {
  dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0f12' : '#eef0f4');
  listeners.forEach((l) => l());
}

media.addEventListener('change', apply);
apply();

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    // Niet bewaren lukt niet; de keuze geldt dan alleen voor deze sessie.
  }
  apply();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref);
}

/** Of het dashboard nu donker is, met de keuze van de gebruiker meegerekend. */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => dark);
}
