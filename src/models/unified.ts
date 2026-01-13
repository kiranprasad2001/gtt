/**
 * Unified GTA Transit Models
 * 
 * This file provides a unified data layer for all transit agencies in the GTA.
 * It re-exports and extends the base types from transit.ts.
 */

import type { AgencyID, ArrivalPrediction, TransitStop } from './transit.js';

// Re-export base types for convenience
export type { AgencyID, ArrivalPrediction, TransitStop };

/**
 * UnifiedStop is an alias for TransitStop.
 * Use this in components that work with any agency.
 */
export type UnifiedStop = TransitStop;

/**
 * GO Transit specific types for API response parsing
 */
export interface GoTransitNextService {
  StopCode: string;
  NextService: GoTransitService[];
}

export interface GoTransitService {
  LineCode: string;
  LineName: string;
  DirectionName: string;
  ScheduledDepartureTime: string;
  ComputedDepartureTime: string;
  ScheduledPlatform: string;
  ActualPlatform: string;
  Carrier: string;
  BusNumber?: string;
  TrainNumber?: string;
  DelaySeconds: number;
  // 0 = scheduled only (ghost), 1 = computed (live)
  Computed: number;
}

/**
 * Helper to check if a stop belongs to a specific agency
 */
export function isAgency(stop: UnifiedStop, agency: AgencyID): boolean {
  return stop.agency === agency;
}

/**
 * Agency display configuration
 */
export const AGENCY_CONFIG: Record<AgencyID, { 
  label: string; 
  color: string; 
  bgColor: string;
}> = {
  ttc: { label: 'TTC', color: '#DA291C', bgColor: '#DA291C' },
  go: { label: 'GO', color: '#FFFFFF', bgColor: '#00853F' },
  yrt: { label: 'YRT', color: '#FFFFFF', bgColor: '#006837' },
  miway: { label: 'MiWay', color: '#FFFFFF', bgColor: '#F47920' },
  brampton: { label: 'Brampton', color: '#FFFFFF', bgColor: '#0071BC' },
};
