/**
 * CalFair - Motorized Pedicab Fare & Route GIS Engine
 * Open-Source GIS implementation using Leaflet, OpenStreetMap & OSRM
 */

// ============================================================================
// 1. Default Configuration & State Management
// ============================================================================

const FUEL_TIERS = [
  { id: 1, name: 'Tier 1', fuelMin: 50.00, fuelMax: 59.99, baseFare: 15.00, baseDistance: 3.0, ratePerKm: 2.00 },
  { id: 2, name: 'Tier 2', fuelMin: 60.00, fuelMax: 79.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 3.00 },
  { id: 3, name: 'Tier 3', fuelMin: 80.00, fuelMax: 89.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 4.00 },
  { id: 4, name: 'Tier 4', fuelMin: 90.00, fuelMax: 99.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 5.00 },
  { id: 5, name: 'Tier 5', fuelMin: 100.00, fuelMax: 124.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 6.00 },
  { id: 6, name: 'Tier 6', fuelMin: 125.00, fuelMax: 149.99, baseFare: 20.00, baseDistance: 3.0, ratePerKm: 7.00 },
  { id: 7, name: 'Tier 7', fuelMin: 150.00, fuelMax: 174.99, baseFare: 25.00, baseDistance: 3.0, ratePerKm: 8.00 },
  { id: 8, name: 'Tier 8', fuelMin: 175.00, fuelMax: 200.00, baseFare: 30.00, baseDistance: 3.0, ratePerKm: 9.00 }
];

function getActiveTier(tierId = state?.config?.selectedTier) {
  const parsedId = parseInt(tierId, 10);
  return FUEL_TIERS.find(t => t.id === parsedId) || FUEL_TIERS[0];
}

const DEFAULT_CONFIG = {
  currency: '₱',
  selectedTier: 1,        // Default: Tier 1 (₱50.00 - ₱59.99 / Base ₱15 for 0-3km / +₱2/km)
  avgSpeedKmh: 28         // Typical motorized pedicab urban speed in km/h
};

const state = {
  config: { ...DEFAULT_CONFIG },
  tripType: 'regular',    // Official CTFO tariff: regular trips
  hasDiscount: false,
  
  // Coordinates & Waypoints: [lat, lng]
  pointA: null,
  pointB: null,
  addressA: '',
  addressB: '',
  
  // Calculated Route Details
  routeDistanceKm: 0,
  routeDurationMins: 0,
  routePolyline: null,
  markerA: null,
  markerB: null,
  
  // Map selection mode
  clickMode: null // 'pickup' | 'dropoff' | null
};

// ============================================================================
// 2. Storage Helpers
// ============================================================================

function loadConfig() {
  // Always initialize to the official default tariff configuration (Tier 1)
  state.config = { ...DEFAULT_CONFIG };
  try {
    // Clear any previously persisted tier configuration
    localStorage.removeItem('calfair_tariff_config');
  } catch (err) {
    console.warn('Could not access localStorage:', err);
  }
}

function saveConfig(newConfig) {
state.config = { ...newConfig };
// Active in-memory update for current session (reverts to Tier 1 on refresh/exit)
updateUIConfigDisplays();
recalculateFare();
}

function resetConfigToDefaults() {
state.config = { ...DEFAULT_CONFIG };
try {
localStorage.removeItem('calfair_tariff_config');
} catch (err) {
console.warn('Error clearing config:', err);
}
updateUIConfigDisplays();
populateSettingsForm();
recalculateFare();
}

// ============================================================================
// 3. Leaflet Map Initialization
// ============================================================================

let map;

function createCustomPin(letter, type) {
const pinClass = type === 'pickup' ? 'pin-a' : 'pin-b';
return L.divIcon({
className: 'custom-pin-wrapper',
html: `<div class="custom-map-pin ${pinClass}"><span>${letter}</span></div>`,
iconSize: [36, 36],
iconAnchor: [18, 36],
popupAnchor: [0, -36]
});
}

const DEFAULT_MAP_BOUNDS = L.latLngBounds([
  [6.9425, 126.2055], // Southwest: Bay shore & City Hall area
  [6.9660, 126.2295]  // Northeast: Lower Madang & Mati Diversion Road
]);

function resetToDefaultView(animate = true) {
  if (!map) return;
  const isMobile = window.innerWidth <= 868;
  if (isMobile) {
    const sheet = document.getElementById('sidebar-panel');
    let sheetHeight = 0;
    if (sheet) {
      if (sheet.classList.contains('is-collapsed')) {
        sheetHeight = 86;
      } else {
        sheetHeight = sheet.offsetHeight || (window.innerHeight * 0.50);
      }
    } else {
      sheetHeight = window.innerHeight * 0.50;
    }

    const topOverlay = document.getElementById('top-search-overlay');
    const topHeight = topOverlay ? topOverlay.offsetHeight : 120;

    map.fitBounds(DEFAULT_MAP_BOUNDS, {
      paddingTopLeft: [20, topHeight + 20],
      paddingBottomRight: [20, sheetHeight + 20],
      maxZoom: 15,
      animate: animate
    });
  } else {
    const sidebar = document.getElementById('sidebar-panel');
    const sidebarWidth = sidebar ? sidebar.offsetWidth + 30 : 470;
    map.fitBounds(DEFAULT_MAP_BOUNDS, {
      paddingTopLeft: [sidebarWidth, 60],
      paddingBottomRight: [60, 60],
      maxZoom: 15,
      animate: animate
    });
  }
}

function centerMapOnVisiblePoint(coords, zoom = 15, animate = true) {
  if (!map || !coords) return;
  const isMobile = window.innerWidth <= 868;
  const latLng = Array.isArray(coords) ? L.latLng(coords[0], coords[1]) : L.latLng(coords);
  const bounds = latLng.toBounds(300);

  if (isMobile) {
    const sheet = document.getElementById('sidebar-panel');
    let sheetHeight = 0;
    if (sheet) {
      if (sheet.classList.contains('is-collapsed')) {
        sheetHeight = 86;
      } else {
        sheetHeight = sheet.offsetHeight || (window.innerHeight * 0.50);
      }
    } else {
      sheetHeight = window.innerHeight * 0.50;
    }

    const topOverlay = document.getElementById('top-search-overlay');
    const topHeight = topOverlay ? topOverlay.offsetHeight : 120;

    map.fitBounds(bounds, {
      paddingTopLeft: [20, topHeight + 20],
      paddingBottomRight: [20, sheetHeight + 25],
      maxZoom: zoom,
      animate: animate
    });
  } else {
    const sidebar = document.getElementById('sidebar-panel');
    const sidebarWidth = sidebar ? sidebar.offsetWidth + 30 : 470;

    map.fitBounds(bounds, {
      paddingTopLeft: [sidebarWidth, 60],
      paddingBottomRight: [60, 60],
      maxZoom: zoom,
      animate: animate
    });
  }
}

function initMap() {
// Default coordinates: City of Mati, Davao Oriental (6.9555° N, 126.2166° E)
const defaultCoords = [6.9555, 126.2166];

map = L.map('map', {
zoomControl: false
}).setView(defaultCoords, 14);

// Zoom controls on top-right below action bar
L.control.zoom({ position: 'bottomright' }).addTo(map);

// 100% Free Tile Providers (No API Key Required, No Watermarks, No 403 Blocks)
const streetHot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
maxZoom: 19,
subdomains: 'abc',
attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, Tiles by <a href="https://www.hotosm.org/" target="_blank">HOT</a>'
}).addTo(map);

const streetFr = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
maxZoom: 20,
subdomains: 'abc',
attribution: '&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
});

const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
maxZoom: 19,
attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
});

// Basemap Switcher
L.control.layers({
'Detailed Streets': streetHot,
'Standard Streets': streetFr,
'Satellite View': esriSatellite
}, null, { position: 'bottomright' }).addTo(map);

  // Map Click Listener
  map.on('click', handleMapClick);

  // Initial Framing: frame map to reference view once layout settles
  setTimeout(() => {
    resetToDefaultView(false);
  }, 300);
}

// ============================================================================
// 4. Marker & Route Management
// ============================================================================

function setPointA(coords, addressName = 'Point A (Pickup)', triggerRoute = true) {
state.pointA = coords;
state.addressA = addressName;
document.getElementById('pickup-search').value = addressName;
document.getElementById('btn-clear-pickup').style.display = 'flex';

if (!state.markerA) {
state.markerA = L.marker(coords, {
icon: createCustomPin('A', 'pickup'),
draggable: true
}).addTo(map);

state.markerA.bindPopup('<strong>Pickup Location</strong><br>Drag to reposition');

state.markerA.on('dragend', async (e) => {
const newPos = e.target.getLatLng();
state.pointA = [newPos.lat, newPos.lng];
const addr = await reverseGeocode(newPos.lat, newPos.lng);
state.addressA = addr;
document.getElementById('pickup-search').value = addr;
calculateRoute();
});
} else {
state.markerA.setLatLng(coords);
}

if (triggerRoute) {
calculateRoute();
}
}

function setPointB(coords, addressName = 'Point B (Drop-off)', triggerRoute = true) {
state.pointB = coords;
state.addressB = addressName;
document.getElementById('dropoff-search').value = addressName;
document.getElementById('btn-clear-dropoff').style.display = 'flex';

if (!state.markerB) {
state.markerB = L.marker(coords, {
icon: createCustomPin('B', 'dropoff'),
draggable: true
}).addTo(map);

state.markerB.bindPopup('<strong>Drop-off Location</strong><br>Drag to reposition');

state.markerB.on('dragend', async (e) => {
const newPos = e.target.getLatLng();
state.pointB = [newPos.lat, newPos.lng];
const addr = await reverseGeocode(newPos.lat, newPos.lng);
state.addressB = addr;
document.getElementById('dropoff-search').value = addr;
calculateRoute();
});
} else {
state.markerB.setLatLng(coords);
}

if (triggerRoute) {
calculateRoute();
}
}

async function handleMapClick(e) {
const { lat, lng } = e.latlng;
const coords = [lat, lng];

  if (state.clickMode === 'pickup' || !state.pointA) {
    showToast('Pickup location updated!');
    const addr = await reverseGeocode(lat, lng);
    setPointA(coords, addr);
    if (!state.pointB) {
      centerMapOnVisiblePoint(coords, 15);
    }
    state.clickMode = null;
    document.getElementById('btn-click-mode-pickup')?.classList.remove('active');
  } else {
    showToast('Destination updated!');
    const addr = await reverseGeocode(lat, lng);
    setPointB(coords, addr);
  }
}

// ============================================================================
// 5. Open-Source Routing Engine (OSRM Main Spine Priority Routing)
// ============================================================================

// Primary continuous spine coordinates along Rizal Extension, Rizal St, Limatoc St, and Macapagal Highway
const PRIMARY_SPINE_PATH = [
  [6.9585, 126.2050], // Rizal Extension west
  [6.9555, 126.2115], // Rizal Extension
  [6.9530, 126.2160], // Rizal Street west
  [6.9515, 126.2185], // Rizal Street center (City Hall)
  [6.9505, 126.2225], // Limatoc Street
  [6.9498, 126.2243], // Limatoc / Macapagal junction
  [6.9467, 126.2262], // Macapagal Highway (Garcia Memorial)
  [6.9452, 126.2285], // Macapagal Highway (SSS junction)
  [6.9453, 126.2316], // Macapagal Highway (Mabua west)
  [6.9443, 126.2360], // Macapagal Highway (Mabua center)
  [6.9430, 126.2400]  // Macapagal Highway (Mabua east / Matiao)
];

// Key polyline coordinates along the Mati Diversion Road bypass corridor
const MATI_DIVERSION_CORRIDOR = [
  [6.9638, 126.2070],
  [6.9632, 126.2128],
  [6.9630, 126.2198],
  [6.9581, 126.2264],
  [6.9491, 126.2319],
  [6.9482, 126.2362],
  [6.9463, 126.2391],
  [6.9451, 126.2394]
];

// Center of the Davao Oriental Provincial Capitol complex
const CAPITOL_COMPLEX_CENTER = [6.94858, 126.22710];

// Calibrated coastal spine waypoint on President Diosdado P. Macapagal Highway (Node 7574898975)
// Ensures vehicles stay on the National Highway instead of cutting through Capitol Road or Diversion Road
const MACAPAGAL_SPINE_WAYPOINT = [6.946733, 126.226234];

function getDistanceToPrimarySpine(lat, lon) {
  let minKm = Infinity;
  for (const pt of PRIMARY_SPINE_PATH) {
    const d = calculateHaversineDistance(lat, lon, pt[0], pt[1]);
    if (d < minKm) minKm = d;
  }
  return minKm;
}

function getDistanceToDiversionCorridor(lat, lon) {
  let minKm = Infinity;
  for (const pt of MATI_DIVERSION_CORRIDOR) {
    const d = calculateHaversineDistance(lat, lon, pt[0], pt[1]);
    if (d < minKm) minKm = d;
  }
  return minKm;
}

function isCloserToDiversionThanSpine(lat, lon) {
  const distSpine = getDistanceToPrimarySpine(lat, lon);
  const distDiversion = getDistanceToDiversionCorridor(lat, lon);
  // Only true if the point is significantly closer to Diversion Road than to the Primary Spine
  return distDiversion < 0.35 && distDiversion < (distSpine * 0.8);
}

function isTargetInCapitolGrounds(lat, lon) {
  const [cLat, cLon] = CAPITOL_COMPLEX_CENTER;
  return calculateHaversineDistance(lat, lon, cLat, cLon) < 0.16;
}

function inspectRouteRoads(route) {
  let diversionDist = 0;
  let macapagalDist = 0;
  let rizalDist = 0;
  let limatocDist = 0;
  let capitolDist = 0;

  if (route.legs) {
    for (const leg of route.legs) {
      if (leg.steps) {
        for (const step of leg.steps) {
          const name = (step.name || '').toLowerCase();
          const d = step.distance || 0;
          if (name.includes('diversion')) {
            diversionDist += d;
          }
          if (name.includes('capitol')) {
            capitolDist += d;
          }
          if (name.includes('macapagal')) {
            macapagalDist += d;
          }
          if (name.includes('rizal')) {
            rizalDist += d;
          }
          if (name.includes('limatoc')) {
            limatocDist += d;
          }
        }
      }
    }
  }
  return { diversionDist, macapagalDist, rizalDist, limatocDist, capitolDist };
}

let currentRouteRequestId = 0;

async function calculateRoute() {
  if (!state.pointA || !state.pointB) return;

  // Guard against identical coordinates
  if (state.pointA[0] === state.pointB[0] && state.pointA[1] === state.pointB[1]) {
    return;
  }

  const requestId = ++currentRouteRequestId;
  const [latA, lonA] = state.pointA;
  const [latB, lonB] = state.pointB;

  // Check if pickup or destination is specifically in the Capitol complex or Diversion interior
  const isEndpointNearDiversion = isCloserToDiversionThanSpine(latA, lonA) || isCloserToDiversionThanSpine(latB, lonB);
  const isEndpointNearCapitol = isTargetInCapitolGrounds(latA, lonA) || isTargetInCapitolGrounds(latB, lonB);

  try {
    // 1. Fetch routes from OSRM with alternatives=true and steps=true
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${lonB},${latB}?overview=full&geometries=geojson&alternatives=true&steps=true`;
    const res = await fetch(osrmUrl);
    if (!res.ok) throw new Error('OSRM network response failed');
    const data = await res.json();

    // Guard against race conditions: discard stale in-flight results
    if (requestId !== currentRouteRequestId) return;

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found by OSRM');
    }

    let selectedRoute = null;

    if (isEndpointNearDiversion || isEndpointNearCapitol) {
      // Origin or destination is specifically at Diversion Road or Capitol complex: use standard direct route
      selectedRoute = data.routes[0];
    } else {
      // Through-trip: Strictly follow the Primary Spine (Rizal Extension, Rizal St, Limatoc St, Macapagal Highway)
      // Disallow Mati Diversion Road and Davao Oriental Provincial Capitol Road shortcuts
      const scoredRoutes = data.routes.map((r, idx) => {
        const roads = inspectRouteRoads(r);
        return {
          route: r,
          index: idx,
          distance: r.distance,
          roads,
          usesDiversion: roads.diversionDist > 100,
          usesCapitol: roads.capitolDist > 50,
          spineScore: (roads.macapagalDist * 1.5) + (roads.rizalDist * 1.5) + (roads.limatocDist * 1.2) - (roads.diversionDist * 5) - (roads.capitolDist * 5)
        };
      });

      // Filter routes that avoid both Diversion Road and Capitol Road shortcuts
      const cleanSpineRoutes = scoredRoutes.filter(sr => !sr.usesDiversion && !sr.usesCapitol);

      if (cleanSpineRoutes.length > 0) {
        cleanSpineRoutes.sort((a, b) => b.spineScore - a.spineScore || a.distance - b.distance);
        selectedRoute = cleanSpineRoutes[0].route;
      } else {
        // If all returned OSRM alternatives cut through Capitol Road or Diversion Road,
        // query via the calibrated Macapagal coastal spine waypoint to enforce staying on the National Highway
        try {
          const [wpLat, wpLon] = MACAPAGAL_SPINE_WAYPOINT;
          const viaUrl = `https://router.project-osrm.org/route/v1/driving/${lonA},${latA};${wpLon},${wpLat};${lonB},${latB}?overview=full&geometries=geojson&steps=true`;
          const viaRes = await fetch(viaUrl);
          if (viaRes.ok) {
            const viaData = await viaRes.json();
            if (viaData.routes && viaData.routes.length > 0) {
              const viaRoute = viaData.routes[0];
              const viaRoads = inspectRouteRoads(viaRoute);
              // Accept spine waypoint route if it avoids both Capitol Road and Diversion Road without an unreasonable detour
              if (viaRoads.diversionDist < 100 && viaRoads.capitolDist < 50 && viaRoute.distance <= scoredRoutes[0].distance * 1.4) {
                selectedRoute = viaRoute;
              }
            }
          }
        } catch (e) {
          console.warn('Spine waypoint fallback skipped:', e);
        }

        // If waypoint route was not applicable, fall back to candidate with highest spine score
        if (!selectedRoute) {
          scoredRoutes.sort((a, b) => b.spineScore - a.spineScore || a.distance - b.distance);
          selectedRoute = scoredRoutes[0].route;
        }
      }
    }

    if (requestId !== currentRouteRequestId) return;

    const coords = selectedRoute.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    // Exact road distance in kilometers
    state.routeDistanceKm = selectedRoute.distance / 1000;

    // Calculate motorized pedicab travel time based on avg 25-30 km/h with 1 min buffer
    const speedKmMin = state.config.avgSpeedKmh / 60;
    state.routeDurationMins = Math.max(2, Math.round((state.routeDistanceKm / speedKmMin) + 1));

    // Draw route on map
    renderRoutePolyline(coords);

    // Update metrics UI
    document.getElementById('metric-distance').textContent = `${state.routeDistanceKm.toFixed(2)} km`;
    document.getElementById('metric-duration').textContent = `~${state.routeDurationMins} mins`;

    // Recalculate Fare
    recalculateFare();

    // Hide header & route input card to maximize map view
    enterCompactRouteMode();
  } catch (err) {
    // If a newer route request already started, ignore this error/fallback
    if (requestId !== currentRouteRequestId) return;

    console.error('Error fetching OSRM route:', err);
    // Fallback: Haversine distance if network fails
    const directKm = calculateHaversineDistance(latA, lonA, latB, lonB) * 1.25; // 1.25 road curvature factor
    state.routeDistanceKm = directKm;
    state.routeDurationMins = Math.max(2, Math.round(directKm * 2.5));

    // Draw straight line fallback
    renderRoutePolyline([[latA, lonA], [latB, lonB]]);

    document.getElementById('metric-distance').textContent = `${state.routeDistanceKm.toFixed(2)} km (est.)`;
    document.getElementById('metric-duration').textContent = `~${state.routeDurationMins} mins`;
    recalculateFare();

    // Hide header & route input card to maximize map view
    enterCompactRouteMode();
  }
}

function enterCompactRouteMode() {
  const panel = document.getElementById('sidebar-panel');
  if (!panel) return;
  panel.classList.remove('is-collapsed');
  panel.classList.add('route-compact-mode');

  const topOverlay = document.getElementById('top-search-overlay');
  if (topOverlay) {
    topOverlay.classList.add('is-compact');
  }

  const compactBar = document.getElementById('compact-route-bar');
  if (compactBar) {
    compactBar.style.display = 'flex';
  }

  // Format clean summary: Display Distance from Point A to Point B
  const labelEl = document.getElementById('compact-route-label');
  if (labelEl) {
    const dist = state.routeDistanceKm ? `${state.routeDistanceKm.toFixed(2)} km` : '0.00 km';
    labelEl.textContent = `Distance: ${dist}`;
    labelEl.title = `Distance from ${state.addressA || 'Point A'} to ${state.addressB || 'Point B'}: ${dist}`;
  }

  // Re-frame the map with smooth recentering into newly enlarged viewport
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      if (state.routePolyline) {
        fitRouteToVisibleMap(state.routePolyline.getBounds());
      }
    }
  }, 320);
}

function exitCompactRouteMode(focusTarget = null) {
  const panel = document.getElementById('sidebar-panel');
  if (!panel) return;
  panel.classList.remove('route-compact-mode');

  const topOverlay = document.getElementById('top-search-overlay');
  if (topOverlay) {
    topOverlay.classList.remove('is-compact');
  }

  const compactBar = document.getElementById('compact-route-bar');
  if (compactBar) {
    compactBar.style.display = 'none';
  }

  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      if (state.routePolyline) {
        fitRouteToVisibleMap(state.routePolyline.getBounds());
      } else if (state.pointA && state.pointB) {
        fitRouteToVisibleMap(L.latLngBounds([state.pointA, state.pointB]));
      } else if (state.pointA) {
        centerMapOnVisiblePoint(state.pointA, 15);
      } else if (state.pointB) {
        centerMapOnVisiblePoint(state.pointB, 15);
      }
    }
    if (focusTarget) {
      const targetEl = document.getElementById(focusTarget);
      if (targetEl) targetEl.focus();
    }
  }, 320);
}

function fitRouteToVisibleMap(bounds) {
if (!map || !bounds) return;

const isMobile = window.innerWidth <= 868;
const panel = document.getElementById('sidebar-panel');
const isCompact = panel && panel.classList.contains('route-compact-mode');

if (isMobile) {
let sheetHeight = 0;
if (panel) {
if (isCompact) {
sheetHeight = panel.offsetHeight || 220;
} else if (panel.classList.contains('is-collapsed')) {
sheetHeight = 86;
} else {
sheetHeight = panel.offsetHeight || (window.innerHeight * 0.52);
}
} else {
sheetHeight = window.innerHeight * 0.52;
}

    const topOverlay = document.getElementById('top-search-overlay');
    let topHeight = 0;
    if (topOverlay) {
      topHeight = topOverlay.offsetHeight || 120;
    } else {
      topHeight = 60;
    }

    // Top padding: topHeight + 20px (ensures route and markers A & B are centered below top search)
    // Bottom padding: sheetHeight + 20px (ensures route and markers A & B are centered above bottom sheet)
    map.fitBounds(bounds, {
      paddingTopLeft: [20, topHeight + 20],
      paddingBottomRight: [20, sheetHeight + 20],
      maxZoom: 16,
      animate: true
    });
} else {
// Desktop: offset for left sidebar or compact bottom card
if (isCompact) {
const compactHeight = panel ? panel.offsetHeight : 240;
map.fitBounds(bounds, {
paddingTopLeft: [60, 60],
paddingBottomRight: [60, compactHeight + 30],
maxZoom: 16,
animate: true
});
} else {
const sidebarWidth = panel ? panel.offsetWidth + 30 : 470;
map.fitBounds(bounds, {
paddingTopLeft: [sidebarWidth, 60],
paddingBottomRight: [60, 60],
maxZoom: 16,
animate: true
});
}
}
}

function renderRoutePolyline(latlngs) {
if (state.routePolyline) {
map.removeLayer(state.routePolyline);
}

// Draw vibrant glowing polyline with border
state.routePolyline = L.polyline(latlngs, {
color: '#059669',
weight: 6,
opacity: 0.9,
lineJoin: 'round',
lineCap: 'round'
}).addTo(map);

// Automatically center route in visible open screen area
const bounds = L.latLngBounds(latlngs);
fitRouteToVisibleMap(bounds);
}

// ============================================================================
// 6. Motorized Pedicab Fare Calculation Engine
// ============================================================================

function recalculateFare() {
const cfg = state.config;
const dist = state.routeDistanceKm || 0;
const cur = cfg.currency || '₱';
const tier = getActiveTier(cfg.selectedTier);

// Official Regular Trip Tariff based on selected Fuel Tier
const baseFare = tier.baseFare;

// Additional distance fee beyond base distance (0-3 KM covered)
const extraKm = Math.max(0, dist - tier.baseDistance);
const extraDistFare = extraKm * tier.ratePerKm;

const subtotal = baseFare + extraDistFare;

let discountAmount = 0;
// Statutory 20% discount (Senior / Student / PWD)
if (state.hasDiscount) {
discountAmount = subtotal * 0.20;
}

const totalFare = Math.max(0, subtotal - discountAmount);

// Update Line Items
const tripBadgeText = document.getElementById('trip-badge-text') || document.getElementById('trip-badge');
if (tripBadgeText) tripBadgeText.textContent = tier.name;

const labelBaseFare = document.getElementById('label-base-fare');
if (labelBaseFare) labelBaseFare.textContent = `Base Fare (First ${tier.baseDistance.toFixed(1)} km)`;
const valBaseFare = document.getElementById('val-base-fare');
if (valBaseFare) valBaseFare.textContent = `${cur}${baseFare.toFixed(2)}`;

// Extra Distance
const extraDistEl = document.getElementById('line-extra-dist');
if (extraDistEl) {
if (extraDistFare > 0) {
extraDistEl.style.display = 'flex';
const labelExtraDist = document.getElementById('label-extra-dist');
if (labelExtraDist) {
labelExtraDist.textContent = `Extra Distance (${extraKm.toFixed(2)} km × ${cur}${tier.ratePerKm.toFixed(2)})`;
}
const valExtraDist = document.getElementById('val-extra-dist');
if (valExtraDist) {
valExtraDist.textContent = `${cur}${extraDistFare.toFixed(2)}`;
}
} else {
extraDistEl.style.display = 'none';
}
}

// Statutory Discount Line
const discountEl = document.getElementById('line-discount');
if (discountEl) {
if (state.hasDiscount) {
discountEl.style.display = 'flex';
const valDiscount = document.getElementById('val-discount');
if (valDiscount) valDiscount.textContent = `-${cur}${discountAmount.toFixed(2)}`;
} else {
discountEl.style.display = 'none';
}
}

// Grand Total Display
const fareCurrency = document.getElementById('fare-currency');
if (fareCurrency) fareCurrency.textContent = cur;
const roundedFare = Math.round(totalFare).toFixed(2);
const totalFareAmount = document.getElementById('total-fare-amount');
if (totalFareAmount) totalFareAmount.textContent = roundedFare;

const metricFareDisplay = document.getElementById('metric-fare-display');
if (metricFareDisplay) {
metricFareDisplay.textContent = `${cur}${roundedFare}`;
}
}

// ============================================================================
// 7. Geocoding & Autocomplete (Restricted strictly to City of Mati, Davao Oriental)
// ============================================================================

// Mati Geographic Bounding Box & Reference Center (OSM Relation 1507186)
const MATI_BOUNDS = {
  minLat: 6.134,
  maxLat: 7.085,
  minLng: 126.090,
  maxLng: 126.488
};
const MATI_CENTER = [6.9522, 126.2167];

function isWithinMati(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return false;
  return lat >= MATI_BOUNDS.minLat &&
         lat <= MATI_BOUNDS.maxLat &&
         lng >= MATI_BOUNDS.minLng &&
         lng <= MATI_BOUNDS.maxLng;
}

// Curated List of Official 26 Barangays & Prominent Mati Landmarks (Verified via OpenStreetMap)
const MATI_LOCAL_PLACES = [
  // Major Landmarks & POIs
  { name: 'Mati Baywalk', address: 'Baywalk, Quezon Street, Central, Mati, Davao Oriental', lat: 6.95002, lng: 126.21678, tags: ['baywalk', 'sea', 'park', 'boulevard'] },
  { name: 'Mati Baywalk Grand Stage', address: 'Quezon Street, Central, Mati, Davao Oriental', lat: 6.95050, lng: 126.21700, tags: ['baywalk', 'stage', 'events'] },
  { name: 'Bay Walk Grill', address: 'Quezon Street, Central, Mati, Davao Oriental', lat: 6.95030, lng: 126.21690, tags: ['grill', 'food', 'restaurant', 'baywalk'] },
  { name: 'City Hall of Mati', address: 'Doña Rosa II Street, Sainz, Mati, Davao Oriental', lat: 6.95195, lng: 126.21621, tags: ['city hall', 'lgu', 'mayor', 'government'] },
  { name: 'Davao Oriental Provincial Capitol', address: 'Capitol Hills, Matiao, Mati, Davao Oriental', lat: 6.94859, lng: 126.22711, tags: ['capitol', 'provincial capitol', 'government'] },
  { name: 'Subangan Davao Oriental Provincial Museum', address: 'Estampa, Dahican, Mati, Davao Oriental', lat: 6.94424, lng: 126.24834, tags: ['subangan', 'museum', 'whale'] },
  { name: 'Dahican Beach', address: 'San Francisco, Dahican, Mati, Davao Oriental', lat: 6.92435, lng: 126.28090, tags: ['dahican', 'beach', 'surf', 'resort'] },
  { name: 'Mati Public Market', address: 'Doña Rosa Street, Central, Mati, Davao Oriental', lat: 6.95680, lng: 126.20754, tags: ['market', 'palengke', 'public market'] },
  { name: 'Davao Oriental State University (DOrSU)', address: 'Guang-guang, Dahican, Mati, Davao Oriental', lat: 6.93164, lng: 126.25467, tags: ['dorsu', 'university', 'college', 'school'] },
  { name: 'Davao Oriental Provincial Medical Center (DOPMC)', address: 'President Diosdado P. Macapagal Highway, Matiao, Mati, Davao Oriental', lat: 6.94456, lng: 126.24291, tags: ['dopmc', 'provincial hospital', 'provincial medical center', 'davao oriental provincial medical center', 'davao oriental provincial hospital', 'hospital', 'medical', 'public hospital', 'matiao hospital'] },
  { name: 'St. Camillus Hospital of Mati', address: 'President Diosdado P. Macapagal Highway, Central, Mati, Davao Oriental', lat: 6.96069, lng: 126.20311, tags: ['camillus', 'saint camillus', 'st camillus', 'st. camillus', 'hospital', 'clinic', 'medical', 'private hospital'] },
  { name: 'Mati Bus Terminal', address: 'Madang, Central, Mati, Davao Oriental', lat: 6.95744, lng: 126.20773, tags: ['terminal', 'bus', 'van', 'transport', 'pedicab'] },
  { name: 'Port of Mati (Wharf)', address: 'Port Area, Sainz, Mati, Davao Oriental', lat: 6.94890, lng: 126.21843, tags: ['port', 'wharf', 'pier', 'harbor'] },
  { name: 'San Nicolas de Tolentino Cathedral', address: 'Quezon Street, Central, Mati, Davao Oriental', lat: 6.95061, lng: 126.21892, tags: ['cathedral', 'church', 'san nicolas'] },
  { name: 'Carmel of St Teresa of Jesus Monastery', address: 'Mati Diversion Road, Sainz, Mati, Davao Oriental', lat: 6.96193, lng: 126.24060, tags: ['carmelite', 'monastery', 'church'] },
  { name: 'Sleeping Dinosaur Viewpoint', address: 'Mamali, Badas, Mati, Davao Oriental', lat: 6.89025, lng: 126.18020, tags: ['sleeping dinosaur', 'viewpoint', 'badas'] },
  { name: 'Pujada Bay Marine Reserve', address: 'Pujada Bay, Mati, Davao Oriental', lat: 6.91500, lng: 126.23000, tags: ['pujada', 'island', 'bay'] },
  { name: 'Mati Airport (Imelda R. Marcos Airport)', address: 'Rocamora Road, Dahican, Mati, Davao Oriental', lat: 6.94974, lng: 126.27306, tags: ['airport', 'aerodrome'] },
  { name: "Areca's", address: "Areca's, Limatoc Street, Sainz, Mati, Davao Oriental", lat: 6.95063, lng: 126.22191, tags: ['arecas', 'cafe', 'restaurant', 'limatoc'] },
  { name: 'Don Luis Village (Central)', address: 'Don Luis Village, Madang, Central, Mati, Davao Oriental', lat: 6.95729, lng: 126.20951, tags: ['don luis', 'don luis village', 'madang', 'central', 'village', 'subdivision'] },
  { name: 'Don Luis Village (Dahican)', address: 'Don Luis Village, Estampa, Dahican, Mati, Davao Oriental', lat: 6.94220, lng: 126.24760, tags: ['don luis', 'don luis village', 'dahican', 'estampa', 'village', 'subdivision'] },

  // All 26 Official Barangays of City of Mati (OpenStreetMap Verified Ground Truth)
  { name: 'Barangay Central', address: 'Central, Mati, Davao Oriental', lat: 6.96125, lng: 126.20700, tags: ['central', 'poblacion', 'downtown'] },
  { name: 'Barangay Dahican', address: 'Dahican, Mati, Davao Oriental', lat: 6.94667, lng: 126.26034, tags: ['dahican', 'beach'] },
  { name: 'Barangay Matiao', address: 'Matiao, Mati, Davao Oriental', lat: 6.94508, lng: 126.23240, tags: ['matiao'] },
  { name: 'Barangay Sainz', address: 'Sainz, Mati, Davao Oriental', lat: 6.95886, lng: 126.22019, tags: ['sainz'] },
  { name: 'Barangay Badas', address: 'Badas, Mati, Davao Oriental', lat: 6.93702, lng: 126.18423, tags: ['badas'] },
  { name: 'Barangay Bobon', address: 'Bobon, Mati, Davao Oriental', lat: 6.86836, lng: 126.32643, tags: ['bobon'] },
  { name: 'Barangay Buso', address: 'Buso, Mati, Davao Oriental', lat: 7.00992, lng: 126.23698, tags: ['buso'] },
  { name: 'Barangay Cabuaya', address: 'Cabuaya, Mati, Davao Oriental', lat: 6.51918, lng: 126.21538, tags: ['cabuaya'] },
  { name: 'Barangay Culian', address: 'Culian, Mati, Davao Oriental', lat: 6.97127, lng: 126.16284, tags: ['culian'] },
  { name: 'Barangay Danao', address: 'Danao, Mati, Davao Oriental', lat: 6.92106, lng: 126.12831, tags: ['danao'] },
  { name: 'Barangay Dawan', address: 'Dawan, Mati, Davao Oriental', lat: 6.89933, lng: 126.15106, tags: ['dawan'] },
  { name: 'Barangay Don Enrique Lopez', address: 'Don Enrique Lopez, Mati, Davao Oriental', lat: 6.96102, lng: 126.30873, tags: ['don enrique lopez'] },
  { name: 'Barangay Don Martin Marundan', address: 'Don Martin Marundan, Mati, Davao Oriental', lat: 6.98587, lng: 126.25507, tags: ['marundan', 'don martin marundan'] },
  { name: 'Barangay Don Salvador Lopez', address: 'Don Salvador Lopez, Mati, Davao Oriental', lat: 7.00773, lng: 126.28448, tags: ['don salvador lopez'] },
  { name: 'Barangay Lanca', address: 'Lanca, Mati, Davao Oriental', lat: 6.35554, lng: 126.19862, tags: ['lanca'] },
  { name: 'Barangay Langka', address: 'Langka, Mati, Davao Oriental', lat: 6.35554, lng: 126.19862, tags: ['langka'] },
  { name: 'Barangay Lawigan', address: 'Lawigan, Mati, Davao Oriental', lat: 6.80123, lng: 126.33122, tags: ['lawigan'] },
  { name: 'Barangay Libudon', address: 'Libudon, Mati, Davao Oriental', lat: 6.94331, lng: 126.13333, tags: ['libudon'] },
  { name: 'Barangay Luban', address: 'Luban, Mati, Davao Oriental', lat: 6.43266, lng: 126.22022, tags: ['luban'] },
  { name: 'Barangay Macambol', address: 'Macambol, Mati, Davao Oriental', lat: 6.83405, lng: 126.19511, tags: ['macambol'] },
  { name: 'Barangay Mamali', address: 'Mamali, Mati, Davao Oriental', lat: 6.87852, lng: 126.16957, tags: ['mamali'] },
  { name: 'Barangay Mayo', address: 'Mayo, Mati, Davao Oriental', lat: 7.00522, lng: 126.33477, tags: ['mayo'] },
  { name: 'Barangay Sanghay', address: 'Sanghay, Mati, Davao Oriental', lat: 6.97394, lng: 126.13727, tags: ['sanghay'] },
  { name: 'Barangay Tagabakid', address: 'Tagabakid, Mati, Davao Oriental', lat: 7.00504, lng: 126.34880, tags: ['tagabakid'] },
  { name: 'Barangay Tagbinonga', address: 'Tagbinonga, Mati, Davao Oriental', lat: 7.03336, lng: 126.23149, tags: ['tagbinonga'] },
  { name: 'Barangay Taguibo', address: 'Taguibo, Mati, Davao Oriental', lat: 7.03443, lng: 126.20740, tags: ['taguibo'] },
  { name: 'Barangay Tamisan', address: 'Tamisan, Mati, Davao Oriental', lat: 6.84790, lng: 126.29839, tags: ['tamisan'] }
];

function hasWordBoundaryMatch(text, word) {
  if (!text || !word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp('\\b' + escaped, 'i');
  return rx.test(text);
}

async function searchAddresses(query) {
  if (!query || query.trim().length < 2) return [];
  const cleanQ = query.trim().toLowerCase();
  const queryWords = cleanQ.split(/\s+/).filter(w => w.length > 1);

  // 1. Instant local search from curated Mati City directory with multi-tier relevance scoring
  const scoredLocalCandidates = [];

  MATI_LOCAL_PLACES.forEach(place => {
    let score = 0;
    const nameLower = place.name.toLowerCase();
    const addrLower = place.address.toLowerCase();
    const tags = place.tags || [];

    // A. Exact / Prefix Match on Place Name
    if (nameLower === cleanQ) {
      score += 1200;
    } else if (nameLower.startsWith(cleanQ)) {
      score += 700;
    } else if (hasWordBoundaryMatch(nameLower, cleanQ)) {
      score += 400;
    }

    // B. Exact / Prefix Match on Aliases / Tags (e.g. "provincial hospital", "dopmc", "camillus", "don luis")
    if (tags.length > 0) {
      if (tags.some(t => t === cleanQ)) {
        score += 650;
      } else if (tags.some(t => t.startsWith(cleanQ))) {
        score += 300;
      } else if (tags.some(t => cleanQ.startsWith(t))) {
        score += 250;
      } else if (tags.some(t => hasWordBoundaryMatch(t, cleanQ))) {
        score += 150;
      }
    }

    // C. Multi-Word Token Coverage (Word-boundary matching to prevent false positives like 'don' matching 'libudon')
    if (queryWords.length > 0) {
      let matchedTokens = 0;
      queryWords.forEach(word => {
        if (hasWordBoundaryMatch(nameLower, word)) {
          matchedTokens++;
          score += 90;
        } else if (tags.some(t => hasWordBoundaryMatch(t, word))) {
          matchedTokens++;
          score += 50;
        } else if (hasWordBoundaryMatch(addrLower, word)) {
          score += 15;
        }
      });

      // Token coverage rule:
      // If user typed 2 or more words (e.g. "don luis village"),
      // a candidate that only matches 1 isolated word (e.g. only "don") must not get high score.
      if (queryWords.length >= 2) {
        const coverageRatio = matchedTokens / queryWords.length;
        if (matchedTokens < 2 && coverageRatio < 0.5) {
          // Penalize partial single-token matches for multi-word queries
          score = Math.max(0, score - 80);
        } else if (matchedTokens === queryWords.length) {
          // Bonus when all searched words appear in the place's name or tags
          score += 450;
        } else {
          score += matchedTokens * 60;
        }
      } else if (matchedTokens === 1) {
        score += 50;
      }
    }

    // D. Address word-boundary fallback
    if (hasWordBoundaryMatch(addrLower, cleanQ)) {
      score += 60;
    }

    if (score >= 40) {
      // Build clear, informative label showing Name first, then address
      const fullLabel = addrLower.startsWith(nameLower)
        ? place.address
        : `${place.name}, ${place.address}`;

      scoredLocalCandidates.push({
        label: fullLabel,
        lat: place.lat,
        lng: place.lng,
        score: score
      });
    }
  });

  // Sort local matches strictly by relevance score descending
  scoredLocalCandidates.sort((a, b) => b.score - a.score);
  const localMatches = scoredLocalCandidates;

  // 2. Query Photon API strictly bounded to City of Mati (bbox: minLon,minLat,maxLon,maxLat)
  let apiMatches = [];
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${MATI_CENTER[0]}&lon=${MATI_CENTER[1]}&bbox=${MATI_BOUNDS.minLng},${MATI_BOUNDS.minLat},${MATI_BOUNDS.maxLng},${MATI_BOUNDS.maxLat}&limit=12`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const data = await res.json();
      if (data && data.features) {
        apiMatches = data.features
          .filter(f => {
            const coords = f.geometry && f.geometry.coordinates;
            if (!coords || coords.length < 2) return false;
            const lng = coords[0];
            const lat = coords[1];
            // Enforce strict bounding box
            if (!isWithinMati(lat, lng)) return false;
            // Filter out foreign results
            const props = f.properties || {};
            if (props.countrycode && props.countrycode.toUpperCase() !== 'PH') return false;
            if (props.country && props.country !== 'Philippines') return false;
            return true;
          })
          .map(f => {
            const props = f.properties || {};
            const rawName = (props.name || '').trim();
            const parts = [
              rawName,
              props.street,
              props.locality || props.district,
              props.city || 'Mati',
              props.state || 'Davao Oriental'
            ].filter(Boolean);

            // Deduplicate label parts (e.g. avoid repeating "Mati, Mati")
            const uniqueParts = [];
            parts.forEach(p => {
              if (!uniqueParts.some(u => u.toLowerCase() === p.toLowerCase())) {
                uniqueParts.push(p);
              }
            });

            let label = uniqueParts.join(', ');
            if (!label.toLowerCase().includes('mati')) {
              label += ', Mati, Davao Oriental';
            }

            // Calculate API relevance score
            let apiScore = 150;
            const lowerName = rawName.toLowerCase();
            const lowerLabel = label.toLowerCase();
            if (lowerName === cleanQ) {
              apiScore = 1200;
            } else if (lowerName.startsWith(cleanQ)) {
              apiScore = 800;
            } else if (lowerName.includes(cleanQ)) {
              apiScore = 600;
            } else if (lowerLabel.includes(cleanQ)) {
              apiScore = 400;
            } else {
              let matchedApiWords = 0;
              queryWords.forEach(w => {
                if (hasWordBoundaryMatch(lowerLabel, w)) matchedApiWords++;
              });
              if (queryWords.length > 0 && matchedApiWords === queryWords.length) {
                apiScore = 500;
              } else if (matchedApiWords >= 2) {
                apiScore = 250 + (matchedApiWords * 40);
              }
            }

            return {
              label: label,
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              score: apiScore
            };
          });
      }
    }
  } catch (err) {
    console.warn('Photon bounded search error, falling back to Nominatim:', err);
  }

  // 3. Fallback to Nominatim strictly bounded to Mati if Photon returned no results
  if (apiMatches.length === 0 && localMatches.length === 0) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${MATI_BOUNDS.minLng},${MATI_BOUNDS.maxLat},${MATI_BOUNDS.maxLng},${MATI_BOUNDS.minLat}&bounded=1&countrycodes=ph&limit=8`;
      const res = await fetch(nomUrl);
      if (res.ok) {
        const data = await res.json();
        apiMatches = (data || [])
          .filter(item => {
            const lat = parseFloat(item.lat);
            const lng = parseFloat(item.lon);
            return isWithinMati(lat, lng);
          })
          .map(item => ({
            label: item.display_name.split(',').slice(0, 3).join(', ') + ', Mati, Davao Oriental',
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            score: 100
          }));
      }
    } catch (e2) {
      console.warn('Nominatim bounded fallback failed:', e2);
    }
  }

  // Combine results and sort strictly by relevance score descending
  const combined = [...localMatches, ...apiMatches];
  combined.sort((a, b) => (b.score || 0) - (a.score || 0));

  const unique = [];
  combined.forEach(item => {
    const isDup = unique.some(u => {
      const dist = Math.hypot(u.lat - item.lat, u.lng - item.lng);
      return dist < 0.001 || u.label.toLowerCase() === item.label.toLowerCase();
    });
    if (!isDup) unique.push(item);
  });

  return unique.slice(0, 6);
}

async function reverseGeocode(lat, lng) {
try {
const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
const res = await fetch(url);
if (!res.ok) throw new Error('Reverse geocode failed');
const data = await res.json();
const addr = data.address;
if (addr) {
const road = addr.road || addr.pedestrian || addr.neighbourhood || addr.suburb || '';
const city = addr.city || addr.town || addr.municipality || '';
return [road, city].filter(Boolean).join(', ') || data.display_name.split(',').slice(0, 2).join(',');
}
return data.display_name.split(',').slice(0, 2).join(',');
} catch (err) {
return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
}

// ============================================================================
// 8. Event Listeners & UI Binding
// ============================================================================
// 8. Event Listeners & UI Binding
// ============================================================================

function setupEventListeners() {

  // Statutory Discount Toggle
document.getElementById('toggle-discount').addEventListener('change', (e) => {
state.hasDiscount = e.target.checked;
recalculateFare();
});

  // Swap locations button
  document.getElementById('btn-swap-locations')?.addEventListener('click', () => {
    if (!state.pointA || !state.pointB) return;
    const tempCoords = state.pointA;
    const tempAddr = state.addressA;

    // Swap coordinates and addresses atomically without intermediate route trigger
    setPointA(state.pointB, state.addressB, false);
    setPointB(tempCoords, tempAddr, true);
    showToast('Pickup and Drop-off swapped!');
  });

  // Change / Edit Route button (exits compact mode to restore header & inputs)
  document.getElementById('btn-edit-route')?.addEventListener('click', () => {
    exitCompactRouteMode('dropoff-search');
  });

  // Clear buttons
  document.getElementById('btn-clear-pickup')?.addEventListener('click', () => {
    exitCompactRouteMode();
    state.pointA = null;
    state.addressA = '';
    document.getElementById('pickup-search').value = '';
    document.getElementById('btn-clear-pickup').style.display = 'none';
    if (state.markerA) {
      map.removeLayer(state.markerA);
      state.markerA = null;
    }
    if (state.routePolyline) {
      map.removeLayer(state.routePolyline);
      state.routePolyline = null;
    }
    document.getElementById('metric-distance').textContent = '0.00 km';
    document.getElementById('metric-duration').textContent = '0 mins';
    document.getElementById('metric-fare-display').textContent = '₱0.00';
    recalculateFare();

    if (!state.pointB) {
      resetToDefaultView(true);
    } else {
      centerMapOnVisiblePoint(state.pointB, 15);
    }
  });

  document.getElementById('btn-clear-dropoff')?.addEventListener('click', () => {
    exitCompactRouteMode();
    state.pointB = null;
    state.addressB = '';
    document.getElementById('dropoff-search').value = '';
    document.getElementById('btn-clear-dropoff').style.display = 'none';
    if (state.markerB) {
      map.removeLayer(state.markerB);
      state.markerB = null;
    }
    if (state.routePolyline) {
      map.removeLayer(state.routePolyline);
      state.routePolyline = null;
    }
    document.getElementById('metric-distance').textContent = '0.00 km';
    document.getElementById('metric-duration').textContent = '0 mins';
    document.getElementById('metric-fare-display').textContent = '₱0.00';
    recalculateFare();

    if (!state.pointA) {
      resetToDefaultView(true);
    } else {
      centerMapOnVisiblePoint(state.pointA, 15);
    }
  });

  // Search Autocomplete binding
  setupAutocomplete('pickup-search', 'pickup-results', (coords, label) => {
    setPointA([coords.lat, coords.lng], label);
    if (!state.pointB) {
      centerMapOnVisiblePoint([coords.lat, coords.lng], 15);
    }
  });

  setupAutocomplete('dropoff-search', 'dropoff-results', (coords, label) => {
    setPointB([coords.lat, coords.lng], label);
    if (!state.pointA) {
      centerMapOnVisiblePoint([coords.lat, coords.lng], 15);
    }
  });

  // Current Location (GPS) Geolocation Trigger
  const triggerGeolocate = () => {
    if (!('geolocation' in navigator)) {
      showToast('Geolocation is not supported by your browser.');
      return;
    }

    const locBtn = document.getElementById('btn-current-location');
    const legacyBtn = document.getElementById('btn-click-mode-pickup');
    if (locBtn) locBtn.classList.add('is-locating');
    if (legacyBtn) legacyBtn.classList.add('active');

    showToast('Locating your position via GPS...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (locBtn) locBtn.classList.remove('is-locating');
        if (legacyBtn) legacyBtn.classList.remove('active');
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        showToast('Location acquired! Resolving address...');
        const addr = await reverseGeocode(lat, lng);
        setPointA([lat, lng], addr);
        if (!state.pointB) {
          centerMapOnVisiblePoint([lat, lng], 16);
        }
        showToast('Current location pinned as Pickup!');

        // If destination is not yet set, advance focus to destination input
        const dropoffInput = document.getElementById('dropoff-search');
        if (dropoffInput && !dropoffInput.value.trim()) {
          dropoffInput.focus();
        }
      },
      (err) => {
        if (locBtn) locBtn.classList.remove('is-locating');
        if (legacyBtn) legacyBtn.classList.remove('active');
        if (err.code === err.PERMISSION_DENIED) {
          showToast('Location permission denied. Please allow location access in your browser.');
        } else if (err.code === err.TIMEOUT) {
          showToast('Location request timed out. Please try again.');
        } else {
          showToast('Unable to determine your current location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  document.getElementById('btn-current-location')?.addEventListener('click', triggerGeolocate);
  document.getElementById('btn-click-mode-pickup')?.addEventListener('click', triggerGeolocate);

  document.getElementById('btn-recenter')?.addEventListener('click', () => {
    if (state.routePolyline) {
      fitRouteToVisibleMap(state.routePolyline.getBounds());
    } else if (state.pointA && state.pointB) {
      fitRouteToVisibleMap(L.latLngBounds([state.pointA, state.pointB]));
    } else if (state.pointA) {
      centerMapOnVisiblePoint(state.pointA, 15);
    } else if (state.pointB) {
      centerMapOnVisiblePoint(state.pointB, 15);
    } else {
      resetToDefaultView(true);
    }
  });

  // Settings Modal Handlers
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsModal = () => {
    if (settingsModal) settingsModal.style.display = 'none';
  };

  const openSettingsModal = (focusTier = false) => {
    populateSettingsForm();
    if (settingsModal) {
      settingsModal.style.display = 'flex';
      if (focusTier) {
        const tierSelect = document.getElementById('cfg-fuel-tier');
        if (tierSelect) {
          setTimeout(() => tierSelect.focus(), 60);
        }
      }
    }
  };

  document.getElementById('btn-open-settings')?.addEventListener('click', () => openSettingsModal(false));
  document.getElementById('trip-badge')?.addEventListener('click', () => openSettingsModal(true));

  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettingsModal);
  document.getElementById('btn-cancel-settings')?.addEventListener('click', closeSettingsModal);

  // Close on backdrop overlay click
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal && settingsModal.style.display === 'flex') {
      closeSettingsModal();
    }
  });

  // Welcome & User Guide Modal Handlers
  const guideModal = document.getElementById('guide-modal');
  const closeGuideModal = (markSeen = false) => {
    if (!guideModal) return;
    const dontShow = document.getElementById('chk-dont-show-guide')?.checked;
    if (dontShow || markSeen) {
      try {
        localStorage.setItem('feelfare_guide_seen', 'true');
      } catch (e) {
        /* ignore */
      }
    }
    guideModal.style.display = 'none';
  };

  const openGuideModal = () => {
    if (guideModal) {
      guideModal.style.display = 'flex';
    }
  };

  document.getElementById('btn-open-guide')?.addEventListener('click', openGuideModal);
  document.getElementById('btn-close-guide')?.addEventListener('click', () => closeGuideModal(false));
  document.getElementById('btn-got-it-guide')?.addEventListener('click', () => closeGuideModal(true));

  // Close guide on backdrop overlay click
  guideModal?.addEventListener('click', (e) => {
    if (e.target === guideModal) {
      closeGuideModal(false);
    }
  });

  // Close guide on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && guideModal && guideModal.style.display === 'flex') {
      closeGuideModal(false);
    }
  });

  // Auto-display guide on first visit
  try {
    const hasSeenGuide = localStorage.getItem('feelfare_guide_seen');
    if (!hasSeenGuide) {
      setTimeout(() => {
        openGuideModal();
      }, 420);
    }
  } catch (err) {
    console.warn('localStorage not accessible for guide preference:', err);
  }

  // Fuel Tier Dropdown Change Listener
  document.getElementById('cfg-fuel-tier')?.addEventListener('change', (e) => {
    updateTierPreview(e.target.value);
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    const selectedTier = parseInt(document.getElementById('cfg-fuel-tier')?.value, 10) || 1;
    const newConfig = {
      ...state.config,
      currency: state.config.currency || '₱',
      selectedTier: selectedTier
    };

    saveConfig(newConfig);
    if (settingsModal) settingsModal.style.display = 'none';
    showToast(`Tariff updated to Tier ${selectedTier}!`);
  });

  // Mobile Bottom-Sheet Drawer Handle Toggle
  const drawerHandle = document.getElementById('drawer-handle');
  const sidebarPanel = document.getElementById('sidebar-panel');
  if (drawerHandle && sidebarPanel) {
    drawerHandle.addEventListener('click', () => {
      if (window.innerWidth <= 868) {
        if (sidebarPanel.classList.contains('route-compact-mode')) {
          exitCompactRouteMode();
          return;
        }
        if (sidebarPanel.classList.contains('is-collapsed')) {
          sidebarPanel.classList.remove('is-collapsed');
        } else {
          sidebarPanel.classList.add('is-collapsed');
        }
        setTimeout(() => {
          if (map) {
            map.invalidateSize();
            if (state.routePolyline) {
              fitRouteToVisibleMap(state.routePolyline.getBounds());
            } else if (state.pointA) {
              centerMapOnVisiblePoint(state.pointA, 15, true);
            } else if (state.pointB) {
              centerMapOnVisiblePoint(state.pointB, 15, true);
            } else {
              resetToDefaultView(true);
            }
          }
        }, 360);
      }
    });
  }

  // Auto-recenter on screen resize / phone orientation change
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (map) {
        map.invalidateSize();
        if (state.routePolyline) {
          fitRouteToVisibleMap(state.routePolyline.getBounds());
        } else if (state.pointA) {
          centerMapOnVisiblePoint(state.pointA, 15, false);
        } else if (state.pointB) {
          centerMapOnVisiblePoint(state.pointB, 15, false);
        } else {
          resetToDefaultView(false);
        }
      }
    }, 250);
  });
}

function setupAutocomplete(inputId, resultsId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(resultsId);
  if (!input || !dropdown) return;
  const wrapper = input.closest('.search-inputs-wrapper');
  const inputRow = input.closest('.route-input-row');
  const parentForm = input.closest('form');

  let activeIndex = -1;
  let debounceTimeout;
  let currentResults = [];
  let isCommitting = false;
  let searchRequestId = 0;
  let hasSelectedPlace = false;

  const showDropdown = () => {
    if (hasSelectedPlace || currentResults.length === 0) return;
    dropdown.style.display = 'block';
    if (wrapper) wrapper.classList.add('has-dropdown-open');
    if (inputRow) inputRow.classList.add('has-dropdown-open');
  };

  const hideDropdown = () => {
    clearTimeout(debounceTimeout);
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
    currentResults = [];
    activeIndex = -1;
    if (inputRow) inputRow.classList.remove('has-dropdown-open');
    if (wrapper) wrapper.classList.remove('has-dropdown-open');
  };

  const handlePostSelection = () => {
    hideDropdown();
    input.blur();
    if (inputId === 'pickup-search') {
      const dropoffInput = document.getElementById('dropoff-search');
      const isMobile = window.innerWidth <= 768;
      if (dropoffInput && !dropoffInput.value.trim() && !isMobile) {
        dropoffInput.focus();
      }
    }
  };

  const selectItemData = (item) => {
    if (!item) return;
    clearTimeout(debounceTimeout);
    searchRequestId++;
    hasSelectedPlace = true;

    input.value = item.label;
    onSelect({ lat: item.lat, lng: item.lng }, item.label);
    handlePostSelection();
  };

  const commitSelection = async () => {
    if (isCommitting) return;
    isCommitting = true;
    clearTimeout(debounceTimeout);

    try {
      const isDropdownVisible = dropdown.style.display === 'block';
      if (isDropdownVisible && currentResults.length > 0) {
        const targetIndex = activeIndex >= 0 ? activeIndex : 0;
        selectItemData(currentResults[targetIndex]);
        return;
      }

      const query = input.value.trim();
      if (query.length >= 2) {
        const thisReqId = ++searchRequestId;
        const results = await searchAddresses(query);
        if (thisReqId === searchRequestId && !hasSelectedPlace) {
          if (results && results.length > 0) {
            selectItemData(results[0]);
          } else {
            showToast('No matching places found in City of Mati.');
            hideDropdown();
          }
        }
      }
    } finally {
      setTimeout(() => { isCommitting = false; }, 300);
    }
  };

  const updateActiveVisual = () => {
    const items = dropdown.querySelectorAll('.search-result-item');
    items.forEach((row, idx) => {
      if (idx === activeIndex) {
        row.classList.add('active');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        row.classList.remove('active');
      }
    });
  };

  const renderResults = (results) => {
    if (hasSelectedPlace) {
      hideDropdown();
      return;
    }

    currentResults = results || [];
    activeIndex = -1;
    dropdown.innerHTML = '';

    if (currentResults.length === 0) {
      hideDropdown();
      return;
    }

    currentResults.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'search-result-item';
      row.dataset.lat = String(item.lat);
      row.dataset.lng = String(item.lng);
      row.dataset.label = item.label;

      const icon = document.createElement('i');
      icon.className = 'ph-bold ph-map-pin';

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;

      row.appendChild(icon);
      row.appendChild(labelSpan);

      row.addEventListener('mouseenter', () => {
        activeIndex = idx;
        updateActiveVisual();
      });

      row.addEventListener('click', () => {
        selectItemData(item);
      });

      dropdown.appendChild(row);
    });

    showDropdown();
  };

  input.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    hasSelectedPlace = false;
    const query = input.value.trim();

    if (query.length < 2) {
      hideDropdown();
      return;
    }

    debounceTimeout = setTimeout(async () => {
      const thisReqId = ++searchRequestId;
      const results = await searchAddresses(query);
      if (thisReqId === searchRequestId && !hasSelectedPlace) {
        renderResults(results);
      }
    }, 350);
  });

  input.addEventListener('keydown', (e) => {
    const isDropdownVisible = dropdown.style.display === 'block';
    const isEnter = e.key === 'Enter' || e.keyCode === 13 || e.which === 13 || e.code === 'Enter';

    if (e.key === 'ArrowDown') {
      if (isDropdownVisible && currentResults.length > 0) {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % currentResults.length;
        updateActiveVisual();
      }
    } else if (e.key === 'ArrowUp') {
      if (isDropdownVisible && currentResults.length > 0) {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
        updateActiveVisual();
      }
    } else if (isEnter) {
      e.preventDefault();
      commitSelection();
    } else if (e.key === 'Escape') {
      if (isDropdownVisible) {
        e.preventDefault();
        hideDropdown();
      }
    }
  });

  // Mobile virtual keyboard keyup fallback (for Android soft keyboards in composition mode)
  input.addEventListener('keyup', (e) => {
    const isEnter = e.key === 'Enter' || e.keyCode === 13 || e.which === 13 || e.code === 'Enter';
    if (isEnter) {
      e.preventDefault();
      commitSelection();
    }
  });

  // Mobile search action event
  input.addEventListener('search', (e) => {
    e.preventDefault();
    commitSelection();
  });

  // Form submit event (fired when mobile keyboard action/checkmark/search button is pressed)
  if (parentForm) {
    parentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      commitSelection();
    });
  }

  // Dismiss dropdown on blur
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!dropdown.contains(document.activeElement)) {
        hideDropdown();
      }
    }, 180);
  });

  // Hide dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      hideDropdown();
    }
  });
}



function updateUIConfigDisplays() {
const cfg = state.config;
const cur = cfg.currency || '₱';
document.querySelectorAll('.currency-tag').forEach(el => el.textContent = cur);
}

function updateTierPreview(tierId) {
const tier = getActiveTier(tierId);
const cur = state.config.currency || '₱';

const prevName = document.getElementById('prev-tier-name');
if (prevName) prevName.textContent = tier.name;

const prevRange = document.getElementById('prev-fuel-range');
if (prevRange) prevRange.textContent = `${cur}${tier.fuelMin.toFixed(2)} – ${cur}${tier.fuelMax.toFixed(2)} / L`;

const prevBase = document.getElementById('prev-base-fare');
if (prevBase) prevBase.textContent = `${cur}${tier.baseFare.toFixed(2)} (0–${tier.baseDistance.toFixed(0)} km)`;

const prevRate = document.getElementById('prev-rate-km');
if (prevRate) prevRate.textContent = `${cur}${tier.ratePerKm.toFixed(2)} / km`;
}

function populateSettingsForm() {
const cfg = state.config;
const tierSelect = document.getElementById('cfg-fuel-tier');
if (tierSelect) {
tierSelect.value = String(cfg.selectedTier || 1);
}
updateTierPreview(cfg.selectedTier || 1);
}

function showToast(message) {
const toast = document.getElementById('toast');
toast.textContent = message;
toast.classList.add('show');
setTimeout(() => {
toast.classList.remove('show');
}, 2800);
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
const R = 6371; // Earth radius in km
const dLat = (lat2 - lat1) * Math.PI / 180;
const dLon = (lon2 - lon1) * Math.PI / 180;
const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
Math.sin(dLon / 2) * Math.sin(dLon / 2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
return R * c;
}

// ============================================================================
// 10. Startup
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
loadConfig();
updateUIConfigDisplays();
populateSettingsForm();
recalculateFare();
initMap();
setupEventListeners();
});

