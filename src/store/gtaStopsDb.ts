/**
 * GTA Stops Database
 * 
 * A unified IndexedDB store for stops across all GTA transit agencies.
 * Replaces the TTC-specific ttcStopsDb.ts with multi-agency support.
 */

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

import { distanceOfTwoCoordinates } from "../components/nearby/coordinate-utils.js";
import type { AgencyID } from "../models/transit.js";
import type { UnifiedStop } from "../models/unified.js";

/**
 * Database schema for GTA stops
 */
interface GTAStopsDB extends DBSchema {
    stops: {
        key: string;
        value: {
            id: string;
            code: string;
            agency: AgencyID;
            name: string;
            lat: number;
            lon: number;
            // Legacy fields for backward compatibility with TTC data
            tag?: string;
            stopId?: string;
            title?: string;
            lines?: string[];
            directions?: string;
            type?: string;
        };
        indexes: {
            agency: AgencyID;
            lat: number;
            lon: number;
            code: string;
        };
    };
}

/**
 * Stop with distance information for nearby queries
 */
export interface StopWithDistance extends UnifiedStop {
    distance: number;      // Cartesian distance (for filtering)
    realDistance: number;  // Haversine distance in meters
    // Legacy fields
    title?: string;
    lines?: string[];
    directions?: string;
    type?: string;
}

const DB_NAME = "GTAStops";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GTAStopsDB>> | null = null;

/**
 * Get or create the database connection
 */
function getDb(): Promise<IDBPDatabase<GTAStopsDB>> {
    if (!dbPromise) {
        dbPromise = openDB<GTAStopsDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                // Create the stops object store if it doesn't exist
                if (oldVersion < 1) {
                    const store = db.createObjectStore("stops", {
                        keyPath: "id",
                    });

                    // Create indexes for efficient queries
                    store.createIndex("agency", "agency");
                    store.createIndex("lat", "lat");
                    store.createIndex("lon", "lon");
                    store.createIndex("code", "code");
                }
            },
        });
    }
    return dbPromise;
}

/**
 * Save stops to the database (batch operation)
 * This appends to existing data - use clearAgency() first if you want to replace
 */
export async function saveStops(stops: UnifiedStop[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction("stops", "readwrite");
    const store = tx.objectStore("stops");

    for (const stop of stops) {
        await store.put({
            id: stop.id,
            code: stop.code,
            agency: stop.agency,
            name: stop.name,
            lat: stop.lat,
            lon: stop.lon,
        });
    }

    await tx.done;
}

/**
 * Clear all stops for a specific agency
 */
export async function clearAgency(agency: AgencyID): Promise<void> {
    const db = await getDb();
    const tx = db.transaction("stops", "readwrite");
    const store = tx.objectStore("stops");
    const index = store.index("agency");

    let cursor = await index.openCursor(IDBKeyRange.only(agency));
    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }

    await tx.done;
}

/**
 * Get stops within a geographic range from any agency
 * Returns stops sorted by distance to the user
 */
export async function getStopsWithinRange(
    lat: number,
    lon: number,
    range: number,
    agencyFilter?: AgencyID
): Promise<StopWithDistance[]> {
    const db = await getDb();
    const store = db.transaction("stops", "readonly").objectStore("stops");

    const results: StopWithDistance[] = [];

    // Calculate bounding box for initial filtering
    const lowerLat = lat - range;
    const upperLat = lat + range;
    const lowerLon = lon - range;
    const upperLon = lon + range;

    // Use lat index for initial filtering
    const latIndex = store.index("lat");
    let cursor = await latIndex.openCursor(
        IDBKeyRange.bound(lowerLat, upperLat)
    );

    while (cursor) {
        const stop = cursor.value;

        // Filter by longitude and optionally by agency
        if (stop.lon >= lowerLon && stop.lon <= upperLon) {
            if (!agencyFilter || stop.agency === agencyFilter) {
                // Calculate distances
                const distance = Math.sqrt((stop.lat - lat) ** 2 + (stop.lon - lon) ** 2);
                const realDistance = distanceOfTwoCoordinates({ lat, lon }, stop);

                if (distance <= range) {
                    results.push({
                        id: stop.id,
                        code: stop.code,
                        agency: stop.agency,
                        name: stop.name,
                        lat: stop.lat,
                        lon: stop.lon,
                        distance,
                        realDistance,
                        // Include legacy fields if present
                        title: stop.title || stop.name,
                        lines: stop.lines || [],
                        directions: stop.directions || '',
                        type: stop.type,
                    });
                }
            }
        }
        cursor = await cursor.continue();
    }

    // Sort by real distance (closest first)
    return results.sort((a, b) => a.realDistance - b.realDistance);
}

/**
 * Get a single stop by its ID
 */
export async function getStop(id: string): Promise<StopWithDistance | undefined> {
    const db = await getDb();
    const stop = await db.get("stops", id);

    if (!stop) return undefined;

    return {
        id: stop.id,
        code: stop.code,
        agency: stop.agency,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        distance: 0,
        realDistance: 0,
        title: stop.title || stop.name,
        lines: stop.lines || [],
        directions: stop.directions || '',
        type: stop.type,
    };
}

/**
 * Get a stop by its code and agency
 */
export async function getStopByCode(
    code: string,
    agency: AgencyID
): Promise<StopWithDistance | undefined> {
    const db = await getDb();
    const tx = db.transaction("stops", "readonly");
    const store = tx.objectStore("stops");
    const codeIndex = store.index("code");

    let cursor = await codeIndex.openCursor(IDBKeyRange.only(code));

    while (cursor) {
        if (cursor.value.agency === agency) {
            const stop = cursor.value;
            return {
                id: stop.id,
                code: stop.code,
                agency: stop.agency,
                name: stop.name,
                lat: stop.lat,
                lon: stop.lon,
                distance: 0,
                realDistance: 0,
                title: stop.title || stop.name,
                lines: stop.lines || [],
                directions: stop.directions || '',
                type: stop.type,
            };
        }
        cursor = await cursor.continue();
    }

    return undefined;
}

/**
 * Clear all stops from the database
 */
export async function clear(): Promise<void> {
    const db = await getDb();
    await db.clear("stops");
}

/**
 * Get total number of stops in the database
 */
export async function getSize(): Promise<number> {
    const db = await getDb();
    return db.count("stops");
}

/**
 * Get count of stops per agency
 */
export async function getAgencyCount(agency: AgencyID): Promise<number> {
    const db = await getDb();
    const tx = db.transaction("stops", "readonly");
    const index = tx.objectStore("stops").index("agency");
    return index.count(IDBKeyRange.only(agency));
}
