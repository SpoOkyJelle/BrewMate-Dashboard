import type { ReactNode } from 'react';
import {
  IconAlert, IconChart, IconCompare, IconMap, IconMessage, IconNetwork, IconRetention, IconShield, IconTrophy, IconUsers,
} from './components/icons';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Staat in de onderbalk op de telefoon (de rest zit onder "Meer"). */
  mobile?: boolean;
}

/** Alle pagina's, in de volgorde van het menu. Gebruikt door zijbalk, zoekvenster en mobiele balk. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Overzicht', icon: <IconChart />, mobile: true },
  { to: '/users', label: 'Gebruikers', icon: <IconUsers />, mobile: true },
  { to: '/retention', label: 'Behoud', icon: <IconRetention /> },
  { to: '/map', label: 'Kaart', icon: <IconMap />, mobile: true },
  { to: '/network', label: 'Netwerk', icon: <IconNetwork /> },
  { to: '/guilds', label: 'Guilds', icon: <IconTrophy /> },
  { to: '/compare', label: 'Vergelijken', icon: <IconCompare /> },
  { to: '/messages', label: 'Berichten', icon: <IconMessage />, mobile: true },
  { to: '/quality', label: 'Datakwaliteit', icon: <IconAlert /> },
  { to: '/admins', label: 'Beheerders', icon: <IconShield /> },
];
