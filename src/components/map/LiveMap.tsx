import { useQuery } from "@tanstack/react-query";
import { LineString, Point } from "ol/geom.js";
import "ol/ol.css";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { Circle, Fill, Stroke, Style, Text } from "ol/style.js";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { RFeature, RLayerTile, RLayerVector, RMap } from "rlayers";
import type { RView } from "rlayers/RMap";
import type { AgencyID } from "../../models/unified.js";
import { AGENCY_CONFIG } from "../../models/unified.js";
import {
  addStops,
  getSize,
  getStopsWithinRange,
} from "../../store/ttcStopsDb.js";
import {
  ttcAllVehiclePositions,
  ttcStopPrediction,
  ttcSubwayPrediction,
  type VehiclePosition,
} from "../fetch/queries.js";
import { etaParser } from "../parser/etaParser.js";
import styles from "./LiveMap.module.css";
import RouteOverlay from "./RouteOverlay.js";
import { SUBWAY_LINES } from "./subwayData.js";

// Toronto center
const TORONTO_CENTER = fromLonLat([-79.3832, 43.6532]);

const ALL_AGENCIES: AgencyID[] = ["ttc", "go", "yrt", "miway", "brampton"];

// === Styles ===

const ROUTE_TYPES = [
  { id: "Bus", label: "Bus", color: "#0EA5E9" },
  { id: "Streetcar", label: "Streetcar", color: "#F59E0B" },
  { id: "Express", label: "Express", color: "#10B981" },
  { id: "Blue Night", label: "Blue Night", color: "#DA291C" },
  { id: "500-series", label: "500-Series", color: "#8B5CF6" },
];

function getVehicleType(routeTag: string): string {
  const num = Number.parseInt(routeTag, 10);
  if (num >= 301 && num <= 310) {
    return "Blue Night";
  }
  if (num >= 501 && num <= 515) {
    return "Streetcar";
  }
  if (num >= 900) {
    return "Express";
  }
  if (routeTag.startsWith("5")) {
    return "500-series";
  }
  return "Bus";
}

function getRouteColor(routeTag: string): string {
  const type = getVehicleType(routeTag);
  return ROUTE_TYPES.find((rt) => rt.id === type)?.color ?? "#0EA5E9";
}

const styleCache = new Map<string, Style>();
function getVehicleStyle(routeTag: string, selected: boolean): Style {
  const key = `${routeTag}-${selected}`;
  const cached = styleCache.get(key);
  if (cached) {
    return cached;
  }
  const color = getRouteColor(routeTag);
  const s = new Style({
    image: new Circle({
      radius: selected ? 14 : 11,
      fill: new Fill({ color }),
      stroke: new Stroke({
        color: selected ? "#FFF" : "rgba(0,0,0,0.4)",
        width: selected ? 2.5 : 1,
      }),
    }),
    text: new Text({
      text: routeTag,
      font: `bold ${selected ? "10px" : "8px"} sans-serif`,
      fill: new Fill({ color: "#FFF" }),
      stroke: new Stroke({ color: "rgba(0,0,0,0.5)", width: 2 }),
    }),
    zIndex: selected ? 100 : 1,
  });
  styleCache.set(key, s);
  return s;
}

const userLocationStyle = new Style({
  image: new Circle({
    radius: 8,
    fill: new Fill({ color: "rgba(59, 130, 246, 0.9)" }),
    stroke: new Stroke({ color: "#FFF", width: 3 }),
  }),
  zIndex: 200,
});

const stopMarkerStyle = new Style({
  image: new Circle({
    radius: 5,
    fill: new Fill({ color: "rgba(255, 255, 255, 0.85)" }),
    stroke: new Stroke({ color: "rgba(0,0,0,0.5)", width: 1 }),
  }),
  zIndex: 2,
});

// Subway line styles
const subwayLineStyleCache = new Map<string, Style>();
function getSubwayLineStyle(color: string): Style {
  const cached = subwayLineStyleCache.get(color);
  if (cached) {
    return cached;
  }
  const s = new Style({
    stroke: new Stroke({ color, width: 4 }),
    zIndex: 3,
  });
  subwayLineStyleCache.set(color, s);
  return s;
}

const subwayStationStyleCache = new Map<string, Style>();
function getSubwayStationStyle(color: string): Style {
  const cached = subwayStationStyleCache.get(color);
  if (cached) {
    return cached;
  }
  const s = new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: "#1a1a1e" }),
      stroke: new Stroke({ color, width: 2.5 }),
    }),
    zIndex: 4,
  });
  subwayStationStyleCache.set(color, s);
  return s;
}

// Pre-compute subway geometries (static data)
const subwayFeatures = SUBWAY_LINES.map((line) => ({
  line,
  lineGeom: new LineString(
    line.stations.map((s) => fromLonLat([s.lon, s.lat]))
  ),
  stationGeoms: line.stations.map((s) => ({
    station: s,
    geom: new Point(fromLonLat([s.lon, s.lat])),
  })),
}));

const stopMarkerSelectedStyle = new Style({
  image: new Circle({
    radius: 7,
    fill: new Fill({ color: "#0EA5E9" }),
    stroke: new Stroke({ color: "#FFF", width: 2 }),
  }),
  zIndex: 50,
});

// === MapToolbar ===

function MapToolbar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  activeAgencies,
  onToggleAgency,
  onSelectAll,
  activeRouteTypes,
  onToggleRouteType,
  onSelectAllTypes,
}: {
  searchValue: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  activeAgencies: Set<AgencyID>;
  onToggleAgency: (id: AgencyID) => void;
  onSelectAll: () => void;
  activeRouteTypes: Set<string>;
  onToggleRouteType: (id: string) => void;
  onSelectAllTypes: () => void;
}) {
  const { t } = useTranslation();
  const [filterOpen, setFilterOpen] = useState(false);
  const allSelected = activeAgencies.size === ALL_AGENCIES.length;
  const allTypesSelected = activeRouteTypes.size === ROUTE_TYPES.length;

  return (
    <div className={styles.toolbar}>
      <form
        className={styles.searchForm}
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
      >
        <input
          type="text"
          className={styles.searchInput}
          value={searchValue}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder={t("lines.placeholder")}
        />
        <button
          type="submit"
          className={styles.searchBtn}
          disabled={!searchValue}
        >
          {t("buttons.search")}
        </button>
      </form>

      <div className={styles.filterWrapper}>
        <button
          type="button"
          className={`${styles.filterBtn} ${filterOpen ? styles.filterBtnActive : ""}`}
          onClick={() => setFilterOpen((p) => !p)}
        >
          <span className={styles.filterIcon}>⚙</span>
          <span className={styles.filterLabel}>Filter</span>
          {(!allSelected || !allTypesSelected) && (
            <span className={styles.filterBadge}>
              {activeAgencies.size + activeRouteTypes.size}
            </span>
          )}
        </button>

        {filterOpen && (
          <div className={styles.filterDropdown}>
            <div className={styles.filterHeader}>
              <span>Transit Agencies</span>
              <button
                type="button"
                className={styles.selectAllBtn}
                onClick={onSelectAll}
              >
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            {ALL_AGENCIES.map((id) => {
              const cfg = AGENCY_CONFIG[id];
              return (
                <label key={id} className={styles.filterItem}>
                  <input
                    type="checkbox"
                    checked={activeAgencies.has(id)}
                    onChange={() => onToggleAgency(id)}
                    className={styles.filterCheckbox}
                  />
                  <span
                    className={styles.filterDot}
                    style={{ backgroundColor: cfg.bgColor }}
                  />
                  <span className={styles.filterItemLabel}>{cfg.label}</span>
                </label>
              );
            })}

            <div className={styles.filterHeader} style={{ marginTop: 12 }}>
              <span>Vehicle Types</span>
              <button
                type="button"
                className={styles.selectAllBtn}
                onClick={onSelectAllTypes}
              >
                {allTypesSelected ? "Deselect All" : "Select All"}
              </button>
            </div>
            {ROUTE_TYPES.map((rt) => {
              return (
                <label key={rt.id} className={styles.filterItem}>
                  <input
                    type="checkbox"
                    checked={activeRouteTypes.has(rt.id)}
                    onChange={() => onToggleRouteType(rt.id)}
                    className={styles.filterCheckbox}
                  />
                  <span
                    className={styles.filterDot}
                    style={{ backgroundColor: rt.color }}
                  />
                  <span className={styles.filterItemLabel}>{rt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// === Stop Info Panel ===

function StopInfoPanel({
  stopId,
  onClose,
}: {
  stopId: string;
  onClose: () => void;
}) {
  const { data: predictionData, isLoading } = useQuery(
    ttcStopPrediction(Number.parseInt(stopId))
  );

  const parsed = useMemo(() => {
    if (!predictionData) {
      return [];
    }
    return etaParser(predictionData);
  }, [predictionData]);

  const stopName = parsed[0]?.stopName ?? `Stop #${stopId}`;

  return (
    <div className={styles.stopPanel}>
      <div className={styles.stopPanelHeader}>
        <div>
          <div className={styles.stopPanelTitle}>{stopName}</div>
          <div className={styles.stopPanelId}>Stop #{stopId}</div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>

      {isLoading && (
        <div className={styles.stopPanelLoading}>Loading arrivals...</div>
      )}

      {!isLoading && parsed.length === 0 && (
        <div className={styles.stopPanelEmpty}>No predictions available</div>
      )}

      <div className={styles.stopPanelRoutes}>
        {parsed.map((route, i) => {
          const lineLabel = Array.isArray(route.line)
            ? route.line.join("/")
            : route.line;
          const etas = route.etas ?? [];
          const nextMins = etas
            .slice(0, 3)
            .map((e) => `${e.minutes}m`)
            .join(", ");

          return (
            <div key={`${lineLabel}-${i}`} className={styles.stopPanelRoute}>
              <span
                className={styles.stopRouteTag}
                style={{
                  backgroundColor: lineLabel
                    ? getRouteColor(lineLabel)
                    : "#666",
                }}
              >
                {lineLabel || "—"}
              </span>
              <div className={styles.stopRouteInfo}>
                <span className={styles.stopRouteDir}>
                  {route.direction ?? ""} {route.routeName ?? ""}
                </span>
                <span className={styles.stopRouteEtas}>
                  {etas.length > 0 ? nextMins : "No buses"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SubwayStopInfoPanel({
  stopCode,
  stopName,
  color,
  isAccessible,
  onClose,
}: {
  stopCode: string;
  stopName?: string;
  color?: string;
  isAccessible?: boolean;
  onClose: () => void;
}) {
  const { data: predictions, isLoading } = useQuery(
    ttcSubwayPrediction(stopCode)
  );

  return (
    <div className={styles.stopPanel}>
      <div className={styles.stopPanelHeader}>
        <div>
          <div className={styles.stopPanelTitle}>
            {stopName ?? "Subway Station"}{" "}
            {isAccessible && <span title="Accessible Station">♿</span>}
          </div>
          <div className={styles.stopPanelId}>Station #{stopCode}</div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>

      {isLoading && (
        <div className={styles.stopPanelLoading}>Loading arrivals...</div>
      )}

      {!isLoading && (!predictions || predictions.length === 0) && (
        <div className={styles.stopPanelEmpty}>No trains scheduled</div>
      )}

      <div className={styles.stopPanelRoutes}>
        {predictions?.map((pred: any, i: number) => {
          const etas = pred.nextTrains
            ? pred.nextTrains.split(",").map((t: string) => t.trim())
            : [];

          return (
            <div key={i} className={styles.stopPanelRoute}>
              <span
                className={styles.stopRouteTag}
                style={{ backgroundColor: color ?? "#666" }}
              >
                {pred.line}
              </span>
              <div className={styles.stopRouteInfo}>
                <span className={styles.stopRouteDir}>
                  {pred.directionText ?? "To Destination"}
                </span>
                <span className={styles.stopRouteEtas}>
                  {etas.length > 0 ? etas.join(", ") : "No trains"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === Main LiveMap ===

interface StopFeature {
  stopId: string;
  tag: string;
  geometry: Point;
}

export default function LiveMap() {
  const { t } = useTranslation();
  const { data: vehicles, isLoading } = useQuery(ttcAllVehiclePositions);

  const [selectedVehicle, setSelectedVehicle] =
    useState<VehiclePosition | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [view, setView] = useState<RView>({
    center: TORONTO_CENTER,
    zoom: 12,
  });

  // Search + agency filter
  const [searchValue, setSearchValue] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [activeAgencies, setActiveAgencies] = useState<Set<AgencyID>>(
    () => new Set(ALL_AGENCIES)
  );
  const [activeRouteTypes, setActiveRouteTypes] = useState<Set<string>>(
    () => new Set(ROUTE_TYPES.map((rt) => rt.id))
  );

  // Selected stop (for info panel)
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  // === Geolocation ===
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const hasCentered = useRef(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        setUserLocation(loc);
        if (!hasCentered.current) {
          hasCentered.current = true;
          setView({
            center: fromLonLat([loc.lon, loc.lat]),
            zoom: 15,
          });
        }
      },
      () => { },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const userLocationGeom = useMemo(
    () =>
      userLocation
        ? new Point(fromLonLat([userLocation.lon, userLocation.lat]))
        : null,
    [userLocation]
  );

  // === Stop markers ===
  const [stopFeatures, setStopFeatures] = useState<StopFeature[]>([]);
  const [stopsLoaded, setStopsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let count = await getSize();
      if (count <= 0) {
        try {
          const resp = await fetch(
            "https://thomassth.github.io/to-bus-stations/data/ttc/stops.json"
          );
          const data = await resp.json();
          await addStops(data);
          count = await getSize();
        } catch {
          /* offline */
        }
      }
      setStopsLoaded(count > 0);
    })();
  }, []);

  const currentZoom = view.zoom;
  // Stabilize center to avoid continuous re-fetching (view.center is a new array ref on every pan)
  const centerKey = useMemo(() => {
    if (!view.center) return "";
    const [lon, lat] = toLonLat(view.center as number[]);
    // Round to ~100m precision to avoid thrashing
    return `${lat.toFixed(3)},${lon.toFixed(3)}`;
  }, [view.center]);

  useEffect(() => {
    if (!stopsLoaded || currentZoom < 14) {
      setStopFeatures([]);
      return;
    }
    if (!centerKey) return;
    const [latStr, lonStr] = centerKey.split(",");
    const cLat = Number(latStr);
    const cLon = Number(lonStr);
    const range = Math.max(0.005, 0.04 / (currentZoom - 12));
    getStopsWithinRange(cLat, cLon, range).then((stops) => {
      setStopFeatures(
        stops.slice(0, 300).map((s: any) => ({
          stopId: s.stopId ?? s.id,
          tag: s.tag ?? "",
          geometry: new Point(fromLonLat([Number(s.lon), Number(s.lat)])),
        }))
      );
    });
  }, [stopsLoaded, currentZoom, centerKey]);

  // === Handlers ===
  const handleSearchSubmit = useCallback(() => {
    setRouteFilter(searchValue.trim().toLowerCase());
  }, [searchValue]);

  const handleToggleAgency = useCallback((id: AgencyID) => {
    setActiveAgencies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setActiveAgencies((prev) =>
      prev.size === ALL_AGENCIES.length
        ? new Set<AgencyID>()
        : new Set(ALL_AGENCIES)
    );
  }, []);

  const handleToggleRouteType = useCallback((id: string) => {
    setActiveRouteTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAllTypes = useCallback(() => {
    setActiveRouteTypes((prev) =>
      prev.size === ROUTE_TYPES.length
        ? new Set<string>()
        : new Set(ROUTE_TYPES.map((rt) => rt.id))
    );
  }, []);

  const handleVehicleSelect = useCallback((vehicle: VehiclePosition) => {
    setSelectedVehicle(vehicle);
    setSelectedStopId(null);
    setShowRoute(false);
  }, []);

  const handleStopSelect = useCallback((stopId: string) => {
    setSelectedStopId(stopId);
    setSelectedVehicle(null);
    setShowRoute(false);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedVehicle(null);
    setSelectedStopId(null);
    setShowRoute(false);
  }, []);

  const handleShowRoute = useCallback(() => {
    setShowRoute(true);
  }, []);

  const handleLocateMe = useCallback(() => {
    if (userLocation) {
      setView({
        center: fromLonLat([userLocation.lon, userLocation.lat]),
        zoom: 15,
      });
    } else if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setUserLocation(loc);
          setView({
            center: fromLonLat([loc.lon, loc.lat]),
            zoom: 15,
          });
        },
        () => { }
      );
    }
  }, [userLocation]);

  // === Computed ===
  // Cache Point geometries by vehicle ID to avoid re-allocating on every refresh
  const vehicleGeomCache = useRef(new Map<string, { lat: number; lon: number; geom: Point }>());

  const filteredFeatures = useMemo(() => {
    if (!vehicles) {
      return [];
    }
    const cache = vehicleGeomCache.current;
    return vehicles
      .filter((v) => {
        if (!activeAgencies.has("ttc")) {
          return false;
        }

        // Route Type filter
        const type = getVehicleType(v.routeTag);
        if (!activeRouteTypes.has(type)) {
          return false;
        }

        // If a vehicle is selected, only show vehicles on the same route to reduce clutter
        if (selectedVehicle && v.routeTag !== selectedVehicle.routeTag) {
          return false;
        }

        if (routeFilter && !v.routeTag.toLowerCase().includes(routeFilter)) {
          return false;
        }
        return true;
      })
      .map((v) => {
        const cached = cache.get(v.id);
        let geom: Point;
        if (cached && cached.lat === v.lat && cached.lon === v.lon) {
          geom = cached.geom;
        } else {
          geom = new Point(fromLonLat([v.lon, v.lat]));
          cache.set(v.id, { lat: v.lat, lon: v.lon, geom });
        }
        return { vehicle: v, geometry: geom };
      });
  }, [vehicles, activeAgencies, activeRouteTypes, routeFilter, selectedVehicle]);

  const vehicleCount = filteredFeatures.length;

  return (
    <div className={styles.mapContainer}>
      <MapToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={handleSearchSubmit}
        activeAgencies={activeAgencies}
        onToggleAgency={handleToggleAgency}
        onSelectAll={handleSelectAll}
        activeRouteTypes={activeRouteTypes}
        onToggleRouteType={handleToggleRouteType}
        onSelectAllTypes={handleSelectAllTypes}
      />

      <RMap
        width="100%"
        height="100%"
        initial={{ center: TORONTO_CENTER, zoom: 12 }}
        view={[view, setView]}
        noDefaultControls
        onClick={handleClose}
      >
        <RLayerTile
          url="https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attributions='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />

        {selectedVehicle && showRoute && (
          <RouteOverlay routeTag={selectedVehicle.routeTag} />
        )}

        {/* Subway lines + stations */}
        <RLayerVector zIndex={3}>
          {subwayFeatures.map(({ line, lineGeom, stationGeoms }) => (
            <Fragment key={`subway-${line.id}`}>
              <RFeature
                geometry={lineGeom}
                style={getSubwayLineStyle(line.color)}
              />
              {stationGeoms.map(({ station, geom }) => {
                const isSelected = selectedStopId === `subway-${station.code}`;
                return (
                  <RFeature
                    key={`stn-${line.id}-${station.code}`}
                    geometry={geom}
                    style={
                      isSelected
                        ? stopMarkerSelectedStyle
                        : getSubwayStationStyle(line.color)
                    }
                    onClick={(e: any) => {
                      e.stopPropagation?.();
                      const isAcc =
                        station.isAccessible !== false ? "true" : "false";
                      // Encode extra metadata into the stopId to avoid complex LiveMap state
                      handleStopSelect(
                        `subway-${station.code}::${station.name}::${line.color}::${isAcc}`
                      );
                      return false;
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </RLayerVector>

        {/* Stop markers (zoom >= 14) */}
        {stopFeatures.length > 0 && (
          <RLayerVector zIndex={5}>
            {stopFeatures.map((stop) => (
              <RFeature
                key={stop.stopId}
                geometry={stop.geometry}
                style={
                  selectedStopId === stop.stopId
                    ? stopMarkerSelectedStyle
                    : stopMarkerStyle
                }
                onClick={(e: any) => {
                  e.stopPropagation?.();
                  handleStopSelect(stop.stopId);
                  return false;
                }}
              />
            ))}
          </RLayerVector>
        )}

        {/* Vehicle markers */}
        <RLayerVector zIndex={10}>
          {filteredFeatures.map(({ vehicle, geometry }) => (
            <RFeature
              key={vehicle.id}
              geometry={geometry}
              style={getVehicleStyle(
                vehicle.routeTag,
                selectedVehicle?.id === vehicle.id
              )}
              onClick={(e: any) => {
                e.stopPropagation?.();
                handleVehicleSelect(vehicle);
                return false;
              }}
            />
          ))}
        </RLayerVector>

        {/* User location */}
        {userLocationGeom && (
          <RLayerVector zIndex={20}>
            <RFeature geometry={userLocationGeom} style={userLocationStyle} />
          </RLayerVector>
        )}
      </RMap>

      <div className={styles.vehicleCountBadge}>
        {isLoading
          ? t("reminder.loading")
          : `${vehicleCount} live vehicles${routeFilter ? ` (route "${routeFilter}")` : ""}`}
      </div>

      {selectedVehicle && showRoute && (
        <div className={styles.routeLabel}>
          Route {selectedVehicle.routeTag}
        </div>
      )}

      {/* Vehicle info panel */}
      {selectedVehicle && (
        <div className={styles.infoPanel}>
          <div className={styles.infoPanelDetails}>
            <span className={styles.infoPanelRoute}>
              Route {selectedVehicle.routeTag}
            </span>
            <span className={styles.infoPanelVehicle}>
              Vehicle #{selectedVehicle.id}
            </span>
            <span className={styles.infoPanelSpeed}>
              {selectedVehicle.speedKmHr} km/h
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {!showRoute && (
              <button
                type="button"
                className={styles.showRouteBtn}
                onClick={handleShowRoute}
              >
                {t("map.showRoute")}
              </button>
            )}
            <button
              type="button"
              className={styles.closeBtn}
              onClick={handleClose}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Stop info panel with predictions */}
      {selectedStopId?.startsWith("subway-") ? (
        <SubwayStopInfoPanel
          stopCode={selectedStopId.split("::")[0].replace("subway-", "")}
          stopName={selectedStopId.split("::")[1]}
          color={selectedStopId.split("::")[2]}
          isAccessible={selectedStopId.split("::")[3] === "true"}
          onClose={handleClose}
        />
      ) : selectedStopId ? (
        <StopInfoPanel stopId={selectedStopId} onClose={handleClose} />
      ) : null}

      {currentZoom < 14 && stopsLoaded && (
        <div className={styles.zoomHint}>Zoom in to see transit stops</div>
      )}

      <button
        type="button"
        className={styles.locateMeBtn}
        onClick={handleLocateMe}
        title="Go to my location"
        aria-label="Go to my location"
      >
        ⊕
      </button>
    </div>
  );
}
