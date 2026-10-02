/**
 * FeelFare live trip sharing (rider side).
 * Sends the rider's position to Supabase; family watch it on track.html.
 * The anon key is public by design: the database only exposes four sharing functions.
 */
const SHARE_CFG = {
  url: 'https://odhstttenhbsyyonrukn.supabase.co',
  anonKey: 'sb_publishable_sINNl2FKU-f9TahxknCQKQ_9mYxecOH',
  sendEveryMs: 5000,
  heartbeatMs: 15000,
  storeKey: 'feelfare_share_session'
};

async function shareRpc(fn, args) {
  const res = await fetch(`${SHARE_CFG.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SHARE_CFG.anonKey,
      Authorization: `Bearer ${SHARE_CFG.anonKey}`
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`Share service error ${res.status}`);
  return res.json();
}

(function initShare() {
  const modal = document.getElementById('share-modal');
  const pill = document.getElementById('share-pill');
  if (!modal || !pill) return;

  const $ = (id) => document.getElementById(id);
  let session = null;       // { id, key, expires }
  let watchId = null;
  let heartbeat = null;
  let lastSent = 0;
  let lastPos = null;
  let wakeLock = null;

  const link = () => new URL(`track.html?s=${session.id}`, location.href).href;
  const toast = (m) => (typeof showToast === 'function' ? showToast(m) : null);

  function render() {
    const on = !!session;
    pill.style.display = on ? 'flex' : 'none';
    $('share-off').style.display = on ? 'none' : 'block';
    $('share-on').style.display = on ? 'block' : 'none';
    if (on) $('share-link').value = link();
  }

  function openModal() { render(); modal.style.display = 'flex'; }
  function closeModal() { modal.style.display = 'none'; }

  async function keepAwake() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (_) { /* optional */ }
  }

  async function push(pos) {
    if (!session) return;
    lastPos = pos;
    const now = Date.now();
    if (now - lastSent < SHARE_CFG.sendEveryMs) return;
    lastSent = now;
    try {
      const ok = await shareRpc('update_share', {
        p_id: session.id, p_key: session.key,
        p_lat: pos.coords.latitude, p_lng: pos.coords.longitude,
        p_acc: pos.coords.accuracy
      });
      if (ok === false) { endLocal(); toast('Sharing ended (time limit reached).'); }
    } catch (_) { /* offline: try again on the next update */ }
  }

  function startTracking() {
    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(push, () => {}, {
      enableHighAccuracy: true, maximumAge: 2000, timeout: 20000
    });
    heartbeat = setInterval(() => {
      if (lastPos && Date.now() - lastSent >= SHARE_CFG.heartbeatMs) {
        lastSent = 0;
        push(lastPos);
      }
    }, 5000);
    keepAwake();
  }

  function stopTracking() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(heartbeat);
    heartbeat = null;
    try { wakeLock?.release(); } catch (_) {}
    wakeLock = null;
  }

  function endLocal() {
    stopTracking();
    session = null;
    try { localStorage.removeItem(SHARE_CFG.storeKey); } catch (_) {}
    render();
  }

  async function start() {
    if (!('geolocation' in navigator)) { toast('Location is not available on this device.'); return; }
    const btn = $('btn-share-start');
    btn.disabled = true;
    btn.textContent = 'Getting your location…';
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000 }));
      const dest = typeof state !== 'undefined' ? state.pointB : null;
      const out = await shareRpc('start_share', {
        p_lat: pos.coords.latitude, p_lng: pos.coords.longitude,
        p_dest_lat: dest ? dest[0] : null, p_dest_lng: dest ? dest[1] : null
      });
      session = { id: out.share_id, key: out.owner_key, expires: Date.now() + 2 * 3600 * 1000 };
      try { localStorage.setItem(SHARE_CFG.storeKey, JSON.stringify(session)); } catch (_) {}
      lastPos = pos;
      lastSent = Date.now();
      startTracking();
      render();
      toast('Sharing started.');
    } catch (err) {
      toast(err && err.code === 1 ? 'Allow location access to share your trip.' : 'Could not start sharing. Check your connection.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start sharing';
    }
  }

  async function stop() {
    const s = session;
    endLocal();
    closeModal();
    if (s) { try { await shareRpc('stop_share', { p_id: s.id, p_key: s.key }); } catch (_) {} }
    toast('Sharing stopped.');
  }

  async function sendLink() {
    const url = link();
    const text = 'Follow my trip live on FeelFare';
    try {
      if (navigator.share) { await navigator.share({ title: 'FeelFare live trip', text, url }); return; }
    } catch (_) { return; }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch (_) {
      $('share-link').select();
      toast('Press and hold the link to copy it.');
    }
  }

  // Resume after a page reload
  try {
    const saved = JSON.parse(localStorage.getItem(SHARE_CFG.storeKey) || 'null');
    if (saved && saved.expires > Date.now()) { session = saved; startTracking(); }
    else if (saved) localStorage.removeItem(SHARE_CFG.storeKey);
  } catch (_) {}

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session && !wakeLock) keepAwake();
  });

  $('btn-sidebar-share')?.addEventListener('click', () => {
    document.getElementById('btn-close-nav-sidebar')?.click();
    openModal();
  });
  pill.addEventListener('click', openModal);
  $('btn-close-share')?.addEventListener('click', closeModal);
  $('btn-share-start')?.addEventListener('click', start);
  $('btn-share-send')?.addEventListener('click', sendLink);
  $('btn-share-stop')?.addEventListener('click', stop);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  render();
})();
