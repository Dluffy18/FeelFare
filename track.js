/**
 * FeelFare live trip viewer: polls the shared position and moves a pin.
 */
(function () {
  const CFG = {
    url: 'https://odhstttenhbsyyonrukn.supabase.co',
    anonKey: 'sb_publishable_sINNl2FKU-f9TahxknCQKQ_9mYxecOH',
    pollMs: 4000,
    staleMs: 60000
  };

  const id = new URLSearchParams(location.search).get('s');
  const $ = (i) => document.getElementById(i);
  const statusEl = $('track-status');
  const timeEl = $('track-time');
  const dotEl = $('track-dot');

  function setStatus(text, state) {
    statusEl.textContent = text;
    dotEl.className = 'track-dot ' + (state || '');
  }

  if (!id || !/^[0-9a-f]{10,40}$/.test(id)) {
    setStatus('This link is not valid.', 'off');
    return;
  }

  const map = L.map('track-map', { zoomControl: false }).setView([6.9555, 126.2166], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    maxZoom: 20, subdomains: 'abc',
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const pin = L.divIcon({
    className: 'custom-pin-wrapper',
    html: '<div class="custom-map-pin pin-a"><span>●</span></div>',
    iconSize: [36, 36], iconAnchor: [18, 36]
  });
  const destPin = L.divIcon({
    className: 'custom-pin-wrapper',
    html: '<div class="custom-map-pin pin-b"><span>B</span></div>',
    iconSize: [36, 36], iconAnchor: [18, 36]
  });

  let marker = null;
  let destMarker = null;
  let first = true;
  let timer = null;
  let lastUpdate = null;

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  }

  function tickTime() {
    if (!lastUpdate) return;
    const age = Date.now() - lastUpdate;
    timeEl.textContent = `Updated ${ago(age)}`;
    if (age > CFG.staleMs) setStatus('Waiting for a new location…', 'stale');
  }

  async function poll() {
    try {
      const res = await fetch(`${CFG.url}/rest/v1/rpc/get_share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CFG.anonKey,
          Authorization: `Bearer ${CFG.anonKey}`
        },
        body: JSON.stringify({ p_id: id })
      });
      if (!res.ok) throw new Error(res.status);
      const d = await res.json();

      if (!d) { end('This link is not valid or has expired.'); return; }
      if (!d.active) { end('Sharing has ended.'); if (d.lat != null) place(d); return; }

      place(d);
      lastUpdate = new Date(d.updated_at).getTime();
      setStatus('Sharing live', 'on');
      tickTime();
    } catch (_) {
      setStatus('Connection lost. Retrying…', 'stale');
    }
  }

  function place(d) {
    if (d.lat == null) return;
    const ll = [d.lat, d.lng];
    if (!marker) marker = L.marker(ll, { icon: pin }).addTo(map);
    else marker.setLatLng(ll);
    if (d.dest_lat != null && !destMarker) {
      destMarker = L.marker([d.dest_lat, d.dest_lng], { icon: destPin }).addTo(map);
    }
    if (first) {
      if (destMarker) map.fitBounds(L.latLngBounds([ll, destMarker.getLatLng()]).pad(0.3));
      else map.setView(ll, 16);
      first = false;
    } else if (!map.getBounds().contains(ll)) {
      map.panTo(ll);
    }
  }

  function end(text) {
    clearInterval(timer);
    setStatus(text, 'off');
    if (lastUpdate) tickTime();
  }

  poll();
  timer = setInterval(poll, CFG.pollMs);
  setInterval(tickTime, 1000);
})();
