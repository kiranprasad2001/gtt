import { Card, CardHeader, Badge } from "@fluentui/react-components";
import {
  LocationLive20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ArrivalPrediction } from "../../models/transit.js";
import { AGENCY_CONFIG, type UnifiedStop } from "../../models/unified.js";
import { CountdownSec } from "../countdown/CountdownSec.js";
import { useGtaArrivals } from "../fetch/queries.js";
import style from "./NearbyStopCard.module.css";

/**
 * Props for NearbyStopCard - uses UnifiedStop with distance info
 */
interface NearbyStopCardProps {
  stop: UnifiedStop & {
    realDistance: number;
    title?: string;
    lines?: string[];
    directions?: string;
  };
}

/**
 * Agency badge component showing the transit agency
 */
function AgencyBadge({ agency }: { agency: UnifiedStop['agency'] }) {
  const config = AGENCY_CONFIG[agency];

  return (
    <Badge
      appearance="filled"
      style={{
        backgroundColor: config.bgColor,
        color: config.color,
        marginRight: '0.5rem',
      }}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Status icon showing whether arrival is live tracked or scheduled only
 */
function ArrivalStatusIcon({ isGhost }: { isGhost: boolean }) {
  if (isGhost) {
    return (
      <span title="Scheduled only (not live tracked)" className={style.ghostIcon}>
        <Warning20Regular />
      </span>
    );
  }

  return (
    <span title="Live tracked" className={style.liveIcon}>
      <LocationLive20Regular />
    </span>
  );
}

/**
 * Single arrival row in the card
 */
function ArrivalRow({ arrival }: { arrival: ArrivalPrediction }) {
  return (
    <div className={style.arrivalRow}>
      <ArrivalStatusIcon isGhost={arrival.isGhost} />
      <span className={style.line}>{arrival.line}</span>
      <span className={style.destination}>{arrival.destination}</span>
      <CountdownSec second={arrival.timeMinutes * 60} />
    </div>
  );
}

/**
 * NearbyStopCard - Unified card for displaying nearby stops from any GTA transit agency
 * 
 * Features:
 * - Agency badge (TTC red, GO green, etc.)
 * - Ghost icon (⚠️) for scheduled-only arrivals
 * - Live icon (📡) for real-time tracked arrivals
 */
export default function NearbyStopCard({ stop }: NearbyStopCardProps) {
  const { t } = useTranslation();

  // Use the unified GTA arrivals hook
  const { data: arrivals, isLoading } = useGtaArrivals(stop);

  const distanceInMetres = stop.realDistance.toPrecision(4);
  const displayName = stop.title || stop.name;

  // Build URL based on agency
  const stopUrl = stop.agency === 'ttc'
    ? `/stops/${stop.code}`
    : `/${stop.agency}/stops/${stop.code}`;

  return (
    <li className={style.nearbyCard}>
      <Link to={stopUrl} className={style.cardLink}>
        <Card className={style.card}>
          <CardHeader
            header={
              <div className={style.headerContent}>
                <div className={style.agencyAndName}>
                  <AgencyBadge agency={stop.agency} />
                  <span className={style.stopName}>
                    {displayName}
                  </span>
                </div>
                <span className={style.distance}>
                  {t("nearby.mAway", { distanceInMetres })}
                </span>
              </div>
            }
          />

          <div className={style.arrivals}>
            {isLoading && (
              <div className={style.loading}>Loading...</div>
            )}

            {!isLoading && arrivals && arrivals.length === 0 && (
              <div className={style.noArrivals}>No upcoming arrivals</div>
            )}

            {arrivals?.slice(0, 3).map((arrival, index) => (
              <ArrivalRow
                key={`${arrival.line}-${arrival.timeMinutes}-${index}`}
                arrival={arrival}
              />
            ))}
          </div>
        </Card>
      </Link>
    </li>
  );
}

/**
 * Legacy export for backward compatibility
 * Wraps the old StopWithDistance format
 */
export function NearbyStopCardLegacy({ stop }: {
  stop: {
    id: string;
    title: string;
    realDistance: number;
    lines?: string[];
    directions?: string;
    type?: string;
  };
}) {
  // Convert legacy format to UnifiedStop
  const unifiedStop: UnifiedStop & { realDistance: number; title: string } = {
    id: stop.id,
    code: stop.id, // Legacy used id as code
    agency: stop.type === 'ttc-subway' ? 'ttc' : 'ttc',
    name: stop.title,
    lat: 0, // Not available in legacy format
    lon: 0,
    realDistance: stop.realDistance,
    title: stop.title,
  };

  return <NearbyStopCard stop={unifiedStop} />;
}
