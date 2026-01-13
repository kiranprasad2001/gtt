export type AgencyID = 'ttc' | 'go' | 'yrt' | 'miway' | 'brampton';


export interface TransitStop {
  id: string;          // e.g., "TTC_456" or "GO_UN"
  code: string;        // The number user sees (e.g. "456")
  agency: AgencyID;
  name: string;        // "King St W at Spadina Ave"
  lat: number;
  lon: number;
  distance?: number;   // Calculated distance from user
}

// A unified format for an arrival (regardless of agency)
export interface ArrivalPrediction {
  line: string;        // "504A" or "Lakeshore West"
  destination: string; // "Distillery Loop" or "Union Station"
  timeMinutes: number; // 5
  isGhost: boolean;    // The critical "Truth" flag
  vehicleId?: string;  // "4402" (Used to track specific vehicles)
  crowding?: 'low' | 'medium' | 'high';
  platform?: string;   // Platform number for GO Transit
}