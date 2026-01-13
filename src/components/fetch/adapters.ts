/**
 * Transit Agency Adapters
 * 
 * Normalizes API responses from different transit agencies to the unified ArrivalPrediction format.
 */

import type { EtaPredictionJson } from "../../models/etaJson.js";
import type { ArrivalPrediction } from "../../models/transit.js";
import type { GoTransitService } from "../../models/unified.js";

/**
 * Normalize GO Transit (Metrolinx) API response to ArrivalPrediction[]
 * 
 * Ghost logic: If Computed === 0, the departure time is scheduled only (not live tracked).
 */
export function normalizeGoTransit(apiResponse: {
    agency: string;
    stopCode: string;
    data: {
        NextService?: GoTransitService[];
        StopCode?: string;
    };
}): ArrivalPrediction[] {
    const services = apiResponse.data?.NextService;

    if (!services || !Array.isArray(services)) {
        return [];
    }

    return services.map((service): ArrivalPrediction => {
        // Calculate minutes until departure
        const scheduledTime = new Date(service.ScheduledDepartureTime);
        const computedTime = service.ComputedDepartureTime
            ? new Date(service.ComputedDepartureTime)
            : scheduledTime;

        const now = new Date();
        const departureTime = service.Computed === 1 ? computedTime : scheduledTime;
        const timeMinutes = Math.max(0, Math.round((departureTime.getTime() - now.getTime()) / 60000));

        // Ghost = scheduled only, not live tracked
        const isGhost = service.Computed === 0;

        // Determine vehicle ID (train or bus number)
        const vehicleId = service.TrainNumber || service.BusNumber || undefined;

        // Get platform info
        const platform = service.ActualPlatform || service.ScheduledPlatform || undefined;

        return {
            line: service.LineName || service.LineCode,
            destination: service.DirectionName,
            timeMinutes,
            isGhost,
            vehicleId,
            platform,
        };
    });
}

/**
 * Normalize TTC prediction response to ArrivalPrediction[]
 * 
 * This wraps the existing TTC API response format into the unified format.
 * TTC predictions are always considered "live" (isGhost = false) since they come
 * from the real-time prediction system.
 */
export function normalizeTtc(json: EtaPredictionJson): ArrivalPrediction[] {
    const predictions: ArrivalPrediction[] = [];

    if (!json.predictions) {
        return predictions;
    }

    const predictionsArray = Array.isArray(json.predictions)
        ? json.predictions
        : [json.predictions];

    for (const pred of predictionsArray) {
        if (!pred.direction) continue;

        const directions = Array.isArray(pred.direction)
            ? pred.direction
            : [pred.direction];

        for (const dir of directions) {
            if (!dir.prediction) continue;

            const etas = Array.isArray(dir.prediction)
                ? dir.prediction
                : [dir.prediction];

            for (const eta of etas) {
                // Extract line number from title (e.g., "504 - W King towards Distillery Loop")
                const lineMatch = dir.title?.match(/^(\d+\w*)/) || pred.routeTag?.match(/^(\d+\w*)/);
                const line = lineMatch?.[1] || pred.routeTag || '';

                // Extract destination from direction title
                const destMatch = dir.title?.match(/towards (.+)$/i);
                const destination = destMatch?.[1] || dir.title || '';

                predictions.push({
                    line,
                    destination,
                    timeMinutes: parseInt(eta.minutes, 10) || 0,
                    isGhost: false, // TTC predictions are always live
                    vehicleId: eta.vehicle?.toString(),
                });
            }
        }
    }

    return predictions;
}

/**
 * Normalize TTC subway predictions to ArrivalPrediction[]
 */
export function normalizeTtcSubway(response: Array<{
    nextTrains: string;
    directionText: string;
    line?: number;
}>): ArrivalPrediction[] {
    const predictions: ArrivalPrediction[] = [];

    for (const item of response) {
        if (!item.nextTrains) continue;

        // Parse the nextTrains string (format: "3, 7, 12" minutes)
        const times = item.nextTrains.split(',').map(t => parseInt(t.trim(), 10));

        for (const timeMinutes of times) {
            if (isNaN(timeMinutes)) continue;

            predictions.push({
                line: item.line ? `Line ${item.line}` : 'Subway',
                destination: item.directionText || '',
                timeMinutes,
                isGhost: false, // Subway predictions are always live
            });
        }
    }

    return predictions;
}
