const NWS_HEADERS = {
  Accept: "application/geo+json",
};

const SOURCE_URLS = {
  alerts: "https://api.weather.gov/alerts/active",
  day1: "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson",
};

const LIVE_REFRESH_MS = 120000;
const RESIZE_REFRESH_MS = 180;
const CHASE_BOUNDS = L.latLngBounds([23.5, -127.5], [50.8, -64.0]);
const CHASE_HOME = [39.5, -98.35];

const RISK_STYLE = {
  TSTM: { color: "#16a34a", fillOpacity: 0.09, label: "General storms" },
  MRGL: { color: "#15803d", fillOpacity: 0.13, label: "Marginal" },
  SLGT: { color: "#ca8a04", fillOpacity: 0.16, label: "Slight" },
  ENH: { color: "#ea580c", fillOpacity: 0.18, label: "Enhanced" },
  MDT: { color: "#dc2626", fillOpacity: 0.2, label: "Moderate" },
  HIGH: { color: "#7c3aed", fillOpacity: 0.22, label: "High" },
};

const WARNING_COLORS = {
  "Tornado Warning": "#dc2626",
  "Severe Thunderstorm Warning": "#ea580c",
  "Flash Flood Warning": "#2563eb",
  "Tornado Watch": "#b91c1c",
  "Severe Thunderstorm Watch": "#ca8a04",
};

const state = {
  position: null,
  watchId: null,
  refreshTimer: null,
  isRefreshing: false,
  lastUpdated: null,
  alerts: [],
  outlooks: [],
  track: JSON.parse(localStorage.getItem("chaseTrack") || "[]"),
  userMarker: null,
  targetMarkers: L.layerGroup(),
};

const els = {
  status: document.querySelector("#statusPill span"),
  locateBtn: document.querySelector("#locateBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  layersBtn: document.querySelector("#layersBtn"),
  fitBtn: document.querySelector("#fitBtn"),
  updateBtn: document.querySelector("#updateBtn"),
  layerPanel: document.querySelector("#layerPanel"),
  closeLayersBtn: document.querySelector("#closeLayersBtn"),
  updateModal: document.querySelector("#updateModal"),
  closeUpdateBtn: document.querySelector("#closeUpdateBtn"),
  startStormigationBtn: document.querySelector("#startStormigationBtn"),
  radarToggle: document.querySelector("#radarToggle"),
  warningsToggle: document.querySelector("#warningsToggle"),
  spcToggle: document.querySelector("#spcToggle"),
  trackToggle: document.querySelector("#trackToggle"),
  positionValue: document.querySelector("#positionValue"),
  nearestAlert: document.querySelector("#nearestAlert"),
  lastUpdateValue: document.querySelector("#lastUpdateValue"),
  trackPointsValue: document.querySelector("#trackPointsValue"),
  targetsList: document.querySelector("#targetsList"),
  warningsList: document.querySelector("#warningsList"),
  outlookList: document.querySelector("#outlookList"),
};

lucide.createIcons();

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true,
  minZoom: 4,
  maxBounds: CHASE_BOUNDS,
  maxBoundsViscosity: 0.85,
  worldCopyJump: false,
}).setView(CHASE_HOME, 5);

L.control.zoom({ position: "bottomright" }).addTo(map);

const baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  bounds: CHASE_BOUNDS,
  noWrap: true,
  updateWhenIdle: true,
  keepBuffer: 1,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
});

baseLayer.addTo(map);

const radarLayer = L.tileLayer.wms("https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows", {
  layers: "conus_bref_qcd",
  format: "image/png",
  transparent: true,
  opacity: 0.64,
  bounds: CHASE_BOUNDS,
  noWrap: true,
  updateWhenIdle: true,
  keepBuffer: 1,
  attribution: "NOAA/NWS radar",
});

const warningLayer = L.geoJSON(null, {
  style: (feature) => {
    const event = feature.properties?.event || "Alert";
    const color = WARNING_COLORS[event] || "#9333ea";
    return { color, fillColor: color, fillOpacity: 0.18, opacity: 0.92, weight: 2 };
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    layer.bindPopup(`<strong>${escapeHtml(p.event || "NWS Alert")}</strong><br>${escapeHtml(p.areaDesc || "")}<br>Expires: ${formatTime(p.expires)}`);
  },
});

const spcLayer = L.geoJSON(null, {
  style: (feature) => {
    const risk = getRiskCode(feature.properties);
    const style = RISK_STYLE[risk] || RISK_STYLE.TSTM;
    return { color: style.color, fillColor: style.color, fillOpacity: style.fillOpacity, opacity: 0.88, weight: 2 };
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const risk = getRiskCode(p);
    layer.bindPopup(`<strong>SPC Day 1: ${escapeHtml(RISK_STYLE[risk]?.label || risk)}</strong><br>${escapeHtml(p.LABEL || p.DN || "")}`);
  },
});

const trackLine = L.polyline(state.track, {
  color: "#111827",
  weight: 3,
  opacity: 0.75,
  dashArray: "5 7",
});

radarLayer.addTo(map);
warningLayer.addTo(map);
spcLayer.addTo(map);
trackLine.addTo(map);
state.targetMarkers.addTo(map);

bindEvents();
refreshData();
startLiveUpdates();
queueMapResize();

function bindEvents() {
  els.locateBtn.addEventListener("click", toggleLocationTracking);
  els.refreshBtn.addEventListener("click", refreshData);
  els.layersBtn.addEventListener("click", () => els.layerPanel.classList.toggle("open"));
  els.closeLayersBtn.addEventListener("click", () => els.layerPanel.classList.remove("open"));
  els.fitBtn.addEventListener("click", fitActiveWeather);
  els.updateBtn.addEventListener("click", () => openUpdateModal());
  els.closeUpdateBtn.addEventListener("click", closeUpdateModal);
  els.startStormigationBtn.addEventListener("click", closeUpdateModal);
  els.updateModal.addEventListener("click", (event) => {
    if (event.target === els.updateModal) closeUpdateModal();
  });

  els.radarToggle.addEventListener("change", () => toggleLayer(radarLayer, els.radarToggle.checked));
  els.warningsToggle.addEventListener("change", () => toggleLayer(warningLayer, els.warningsToggle.checked));
  els.spcToggle.addEventListener("change", () => toggleLayer(spcLayer, els.spcToggle.checked));
  els.trackToggle.addEventListener("change", () => toggleLayer(trackLine, els.trackToggle.checked));

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab, .tab-panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.tab}Panel`).classList.add("active");
    });
  });

  window.addEventListener("load", queueMapResize);
  window.addEventListener("resize", debounce(queueMapResize, RESIZE_REFRESH_MS));
  window.addEventListener("orientationchange", () => window.setTimeout(queueMapResize, 250));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      queueMapResize();
      refreshData({ silent: true });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUpdateModal();
  });
}

async function refreshData({ silent = false } = {}) {
  if (state.isRefreshing) return;

  state.isRefreshing = true;
  if (!silent) setStatus("Refreshing");
  refreshRadarLayer();

  const results = await Promise.allSettled([loadAlerts(), loadOutlook()]);
  state.isRefreshing = false;
  state.lastUpdated = new Date();
  renderAll();
  queueMapResize();

  const hasError = results.some((result) => result.status === "rejected");
  setStatus(hasError ? "Live data issue" : `Live ${formatClock(state.lastUpdated)}`);
}

async function loadAlerts() {
  const data = await fetchJson(SOURCE_URLS.alerts, NWS_HEADERS);
  state.alerts = (data.features || [])
    .filter((feature) => isChaseRelevant(feature.properties?.event))
    .filter(isFeatureInChaseDomain)
    .sort((a, b) => severityRank(a.properties?.event) - severityRank(b.properties?.event));
  warningLayer.clearLayers().addData(state.alerts.filter((feature) => feature.geometry));
}

async function loadOutlook() {
  const data = await fetchJson(SOURCE_URLS.day1);
  state.outlooks = data.features || [];
  spcLayer.clearLayers().addData(state.outlooks);
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function toggleLocationTracking() {
  if (!navigator.geolocation) {
    setStatus("GPS unavailable");
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    setStatus("GPS paused");
    return;
  }

  setStatus("Starting GPS");
  state.watchId = navigator.geolocation.watchPosition(updatePosition, handleLocationError, {
    enableHighAccuracy: true,
    maximumAge: 8000,
    timeout: 15000,
  });
}

function updatePosition(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  const latLng = [latitude, longitude];
  state.position = { lat: latitude, lon: longitude, accuracy };
  state.track.push(latLng);
  state.track = state.track.slice(-250);
  localStorage.setItem("chaseTrack", JSON.stringify(state.track));

  if (!state.userMarker) {
    state.userMarker = L.circleMarker(latLng, {
      radius: 8,
      color: "#1d4ed8",
      fillColor: "#60a5fa",
      fillOpacity: 0.95,
      weight: 3,
    }).addTo(map);
    map.setView(latLng, 9);
  } else {
    state.userMarker.setLatLng(latLng);
  }

  trackLine.setLatLngs(state.track);
  renderAll();
  setStatus(`GPS ${Math.round(accuracy)}m`);
}

function handleLocationError(error) {
  setStatus(error.code === 1 ? "GPS denied" : "GPS error");
}

function renderAll() {
  renderPosition();
  renderDetailStats();
  renderWarnings();
  renderOutlook();
  renderTargets();
}

function renderPosition() {
  if (!state.position) {
    els.positionValue.textContent = "Tap crosshair";
    els.nearestAlert.textContent = state.alerts.length ? state.alerts[0].properties.event : "None active";
    return;
  }

  els.positionValue.textContent = `${state.position.lat.toFixed(3)}, ${state.position.lon.toFixed(3)}`;
  const nearest = nearestFeature(state.alerts, state.position);
  els.nearestAlert.textContent = nearest ? `${nearest.feature.properties.event} ${Math.round(nearest.miles)} mi` : "None nearby";
}

function renderDetailStats() {
  els.lastUpdateValue.textContent = state.lastUpdated ? formatClock(state.lastUpdated) : "Pending";
  els.trackPointsValue.textContent = String(state.track.length);
}

function renderWarnings() {
  if (!state.alerts.length) {
    els.warningsList.innerHTML = emptyState("No chase-relevant active warnings or watches loaded right now.");
    return;
  }

  els.warningsList.innerHTML = state.alerts.slice(0, 18).map((feature) => {
    const p = feature.properties || {};
    const point = featureCenter(feature);
    const nav = point ? navLinks(point.lat, point.lon) : "";
    return card({
      title: p.event || "NWS Alert",
      badge: badgeClass(p.event),
      badgeText: formatUrgency(p),
      meta: `${p.areaDesc || "NWS area"} - ${alertDetail(p)} - expires ${formatTime(p.expires)}`,
      body: trimText([p.headline || p.description || "No alert text supplied.", p.instruction ? `Instruction: ${p.instruction}` : ""].filter(Boolean).join(" "), 300),
      actions: nav,
    });
  }).join("");
  lucide.createIcons();
}

function openUpdateModal() {
  els.updateModal.classList.add("open");
  els.updateModal.setAttribute("aria-hidden", "false");
}

function closeUpdateModal() {
  els.updateModal.classList.remove("open");
  els.updateModal.setAttribute("aria-hidden", "true");
}

function renderOutlook() {
  if (!state.outlooks.length) {
    els.outlookList.innerHTML = emptyState("SPC outlook polygons have not loaded yet.");
    return;
  }

  const counts = state.outlooks.reduce((acc, feature) => {
    const risk = getRiskCode(feature.properties);
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {});

  els.outlookList.innerHTML = Object.entries(counts)
    .sort(([a], [b]) => riskRank(b) - riskRank(a))
    .map(([risk, count]) => {
      const style = RISK_STYLE[risk] || { label: risk };
      return card({
        title: `SPC ${style.label}`,
        badge: risk.toLowerCase(),
        badgeText: `${count} area${count === 1 ? "" : "s"}`,
        meta: "Day 1 Convective Outlook",
        body: "Use outlook zones to plan broad target areas, then refine with current radar, warnings, road options, fuel, daylight, and escape routes.",
      });
    }).join("");
}

function renderTargets() {
  state.targetMarkers.clearLayers();
  const targets = buildTargets();

  if (!targets.length) {
    els.targetsList.innerHTML = emptyState("Tap the crosshair to enable GPS. Targets appear from active warnings and SPC risk areas.");
    return;
  }

  els.targetsList.innerHTML = targets.map((target, index) => {
    L.marker([target.lat, target.lon], {
      title: target.title,
    }).bindPopup(`<strong>${escapeHtml(target.title)}</strong><br>${escapeHtml(target.body)}`).addTo(state.targetMarkers);

    return card({
      title: target.title,
      badge: target.badge,
      badgeText: target.distance ? `${Math.round(target.distance)} mi` : target.kind,
      meta: target.meta,
      body: target.body,
      actions: navLinks(target.lat, target.lon),
      index,
    });
  }).join("");
  lucide.createIcons();
}

function buildTargets() {
  const targets = [];
  const base = state.position;

  state.alerts.slice(0, 10).forEach((feature) => {
    const center = featureCenter(feature);
    if (!center) return;
    const movement = parseMovement(feature.properties?.description || feature.properties?.headline || "");
    const staging = movement ? offsetPoint(center.lat, center.lon, oppositeBearing(movement.bearing), 12) : center;
    const distance = base ? haversineMiles(base.lat, base.lon, staging.lat, staging.lon) : null;
    targets.push({
      lat: staging.lat,
      lon: staging.lon,
      distance,
      kind: "Warning",
      badge: badgeClass(feature.properties?.event),
      title: `${feature.properties?.event || "Alert"} staging`,
      meta: feature.properties?.areaDesc || "NWS alert polygon",
      body: movement
        ? `Suggested waypoint is offset about 12 miles opposite reported storm motion (${movement.label}) so you can evaluate road options outside the core.`
        : "Suggested waypoint is the alert-area center. Reposition only after checking radar motion, terrain, road network, and NWS instructions.",
    });
  });

  if (targets.length < 4) {
    state.outlooks
      .filter((feature) => riskRank(getRiskCode(feature.properties)) >= 2)
      .slice(0, 6)
      .forEach((feature) => {
        const center = featureCenter(feature);
        if (!center) return;
        const risk = getRiskCode(feature.properties);
        const distance = base ? haversineMiles(base.lat, base.lon, center.lat, center.lon) : null;
        targets.push({
          lat: center.lat,
          lon: center.lon,
          distance,
          kind: "SPC",
          badge: risk.toLowerCase(),
          title: `${RISK_STYLE[risk]?.label || risk} outlook target`,
          meta: "SPC Day 1 broad target",
          body: "This is a broad planning target from the SPC outlook, not a storm intercept point. Refine with radar, surface observations, and safe road choices.",
        });
      });
  }

  return targets
    .sort((a, b) => (a.distance === null) - (b.distance === null) || (a.distance || 0) - (b.distance || 0))
    .slice(0, 6);
}

function startLiveUpdates() {
  if (state.refreshTimer) window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    if (!document.hidden) refreshData({ silent: true });
  }, LIVE_REFRESH_MS);
}

function refreshRadarLayer() {
  radarLayer.setParams({ refresh: Date.now() }, false);
  if (map.hasLayer(radarLayer)) radarLayer.redraw();
}

function card({ title, badge, badgeText, meta, body, actions }) {
  return `
    <article class="info-card">
      <h3>${escapeHtml(title)} <span class="badge ${escapeHtml(badge || "")}">${escapeHtml(badgeText || "")}</span></h3>
      <span class="meta">${escapeHtml(meta || "")}</span>
      <p>${escapeHtml(body || "")}</p>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
    </article>
  `;
}

function navLinks(lat, lon) {
  const label = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`;
  const apple = `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d`;
  return `
    <a class="action-link" href="${google}" target="_blank" rel="noopener"><i data-lucide="navigation"></i>Google</a>
    <a class="action-link" href="${apple}" target="_blank" rel="noopener"><i data-lucide="map"></i>Apple</a>
    <a class="action-link" href="geo:${lat},${lon}?q=${label}"><i data-lucide="map-pin"></i>Geo</a>
  `;
}

function isChaseRelevant(event = "") {
  return /Tornado|Severe Thunderstorm|Flash Flood|Special Weather Statement|Watch/i.test(event);
}

function severityRank(event = "") {
  if (/Tornado Warning/i.test(event)) return 0;
  if (/Severe Thunderstorm Warning/i.test(event)) return 1;
  if (/Flash Flood Warning/i.test(event)) return 2;
  if (/Tornado Watch/i.test(event)) return 3;
  if (/Severe Thunderstorm Watch/i.test(event)) return 4;
  return 5;
}

function badgeClass(event = "") {
  if (/Tornado/i.test(event)) return "tornado";
  if (/Severe Thunderstorm/i.test(event)) return "severe";
  if (/Watch/i.test(event)) return "watch";
  return "general";
}

function formatUrgency(properties = {}) {
  return properties.severity || properties.certainty || "Active";
}

function alertDetail(properties = {}) {
  return [properties.severity, properties.urgency, properties.certainty].filter(Boolean).join(" / ") || "Active";
}

function getRiskCode(properties = {}) {
  const raw = String(properties.LABEL || properties.CATEGORY || properties.RISK || properties.DN || "").toUpperCase();
  const dnRisk = {
    2: "TSTM",
    3: "MRGL",
    4: "SLGT",
    5: "ENH",
    6: "MDT",
    8: "HIGH",
  }[Number(properties.DN)];
  if (dnRisk) return dnRisk;
  if (raw.includes("HIGH")) return "HIGH";
  if (raw.includes("MDT") || raw.includes("MODERATE")) return "MDT";
  if (raw.includes("ENH")) return "ENH";
  if (raw.includes("SLGT") || raw.includes("SLIGHT")) return "SLGT";
  if (raw.includes("MRGL") || raw.includes("MARGINAL")) return "MRGL";
  if (raw.includes("TSTM") || raw.includes("THUNDER")) return "TSTM";
  return raw.match(/\d+/)?.[0] || "TSTM";
}

function riskRank(risk) {
  return { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }[risk] || 0;
}

function featureCenter(feature) {
  if (!feature?.geometry) return null;
  const coords = [];
  collectCoords(feature.geometry.coordinates, coords);
  if (!coords.length) return null;
  const sums = coords.reduce((acc, pair) => {
    acc.lon += pair[0];
    acc.lat += pair[1];
    return acc;
  }, { lat: 0, lon: 0 });
  return { lat: sums.lat / coords.length, lon: sums.lon / coords.length };
}

function isFeatureInChaseDomain(feature) {
  const center = featureCenter(feature);
  return Boolean(center && CHASE_BOUNDS.contains([center.lat, center.lon]));
}

function collectCoords(input, out) {
  if (!Array.isArray(input)) return;
  if (typeof input[0] === "number" && typeof input[1] === "number") {
    out.push(input);
    return;
  }
  input.forEach((item) => collectCoords(item, out));
}

function nearestFeature(features, point) {
  return features.reduce((nearest, feature) => {
    const center = featureCenter(feature);
    if (!center) return nearest;
    const miles = haversineMiles(point.lat, point.lon, center.lat, center.lon);
    if (!nearest || miles < nearest.miles) return { feature, miles };
    return nearest;
  }, null);
}

function parseMovement(text) {
  const match = text.match(/moving\s+([a-z]+)\s+at\s+(\d+)/i);
  if (!match) return null;
  const bearing = {
    north: 0, northeast: 45, east: 90, southeast: 135,
    south: 180, southwest: 225, west: 270, northwest: 315,
    n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315,
  }[match[1].toLowerCase()];
  if (bearing === undefined) return null;
  return { bearing, label: `${match[1].toUpperCase()} at ${match[2]} mph` };
}

function oppositeBearing(bearing) {
  return (bearing + 180) % 360;
}

function offsetPoint(lat, lon, bearingDeg, miles) {
  const radius = 3958.8;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const angular = miles / radius;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: toDeg(lat2), lon: toDeg(lon2) };
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const radius = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function fitActiveWeather() {
  const group = L.featureGroup([warningLayer, spcLayer, state.targetMarkers].filter((layer) => map.hasLayer(layer)));
  try {
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(limitBounds(bounds.pad(0.12)), { maxZoom: 8 });
      return;
    }
  } catch {
  }
  map.fitBounds(CHASE_BOUNDS);
}

function toggleLayer(layer, enabled) {
  if (enabled && !map.hasLayer(layer)) layer.addTo(map);
  if (!enabled && map.hasLayer(layer)) layer.removeFrom(map);
}

function setStatus(text) {
  els.status.textContent = text;
}

function queueMapResize() {
  window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function limitBounds(bounds) {
  const south = Math.max(bounds.getSouth(), CHASE_BOUNDS.getSouth());
  const west = Math.max(bounds.getWest(), CHASE_BOUNDS.getWest());
  const north = Math.min(bounds.getNorth(), CHASE_BOUNDS.getNorth());
  const east = Math.min(bounds.getEast(), CHASE_BOUNDS.getEast());
  return L.latLngBounds([south, west], [north, east]);
}

function formatTime(value) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatClock(value) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(value);
}

function trimText(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}
