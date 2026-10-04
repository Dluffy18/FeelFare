/**
 * FeelFare offline road router.
 * Finds a route over the saved Mati road network (roads.json, from OpenStreetMap)
 * when the online routing service cannot be reached.
 */
(function (root) {
  const MAX_SNAP_M = 600;      // pins further than this from any road get no offline route
  const CELL = 0.004;          // spatial grid cell, degrees (~440 m)

  // Cost multiplier by road type (tens digit) and special road (ones digit).
  // Mirrors the online rules: stay on the national highway, avoid Capitol and Diversion roads.
  const TYPE_FACTOR = [1.0, 1.15, 1.6, 1.0, 0.95, 0.9, 0.9];
  const SPECIAL_FACTOR = [1.0, 0.9, 1.8, 1.8];

  let G = null;               // loaded graph
  let loading = null;

  const rad = Math.PI / 180;
  function hav(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(a));
  }

  function build(data) {
    const S = data.scale;
    const n = data.nodes.length / 2;
    const nLat = new Float64Array(n), nLon = new Float64Array(n);
    for (let i = 0; i < n; i++) { nLat[i] = data.nodes[2 * i] / S; nLon[i] = data.nodes[2 * i + 1] / S; }

    const edges = [];
    const adj = Array.from({ length: n }, () => []);
    const grid = new Map();
    const key = (r, c) => r * 100000 + c;

    data.edges.forEach((e, idx) => {
      const [a, b, flags, cls, shape] = e;
      const lat = [nLat[a]], lon = [nLon[a]];
      let pla = Math.round(nLat[a] * S), plo = Math.round(nLon[a] * S);
      for (let i = 0; i < shape.length; i += 2) {
        pla += shape[i]; plo += shape[i + 1];
        lat.push(pla / S); lon.push(plo / S);
      }
      lat.push(nLat[b]); lon.push(nLon[b]);
      const cum = [0];
      for (let i = 1; i < lat.length; i++) cum.push(cum[i - 1] + hav(lat[i - 1], lon[i - 1], lat[i], lon[i]));
      const factor = (TYPE_FACTOR[Math.floor(cls / 10)] || 1) * (SPECIAL_FACTOR[cls % 10] || 1);
      edges.push({ a, b, flags, lat, lon, cum, len: cum[cum.length - 1], factor });
      if (flags & 1) adj[a].push([b, idx, 1]);
      if (flags & 2) adj[b].push([a, idx, -1]);
      for (let i = 0; i < lat.length - 1; i++) {
        const r0 = Math.floor(Math.min(lat[i], lat[i + 1]) / CELL), r1 = Math.floor(Math.max(lat[i], lat[i + 1]) / CELL);
        const c0 = Math.floor(Math.min(lon[i], lon[i + 1]) / CELL), c1 = Math.floor(Math.max(lon[i], lon[i + 1]) / CELL);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const k = key(r, c);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(idx * 4096 + i);
        }
      }
    });
    return { n, nLat, nLon, edges, adj, grid, key };
  }

  // Nearest point on the road network: { e, seg, t, lat, lon, dist, pos }
  function snap(lat, lon) {
    const r0 = Math.floor(lat / CELL), c0 = Math.floor(lon / CELL);
    const mLat = 111320, mLon = 111320 * Math.cos(lat * rad);
    let best = null;
    for (let ring = 0; ring <= 3; ring++) {
      for (let r = r0 - ring; r <= r0 + ring; r++) for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (ring && Math.abs(r - r0) !== ring && Math.abs(c - c0) !== ring) continue;
        const list = G.grid.get(G.key(r, c));
        if (!list) continue;
        for (const code of list) {
          const ei = Math.floor(code / 4096), si = code % 4096;
          const E = G.edges[ei];
          const ax = (E.lon[si] - lon) * mLon, ay = (E.lat[si] - lat) * mLat;
          const bx = (E.lon[si + 1] - lon) * mLon, by = (E.lat[si + 1] - lat) * mLat;
          const dx = bx - ax, dy = by - ay;
          const L2 = dx * dx + dy * dy;
          let t = L2 ? -(ax * dx + ay * dy) / L2 : 0;
          t = Math.max(0, Math.min(1, t));
          const px = ax + t * dx, py = ay + t * dy;
          const dist = Math.hypot(px, py);
          if (!best || dist < best.dist) best = { e: ei, seg: si, t, dist };
        }
      }
      if (best && best.dist <= ring * CELL * 100000) break;
    }
    if (!best || best.dist > MAX_SNAP_M) return null;
    const E = G.edges[best.e];
    best.lat = E.lat[best.seg] + best.t * (E.lat[best.seg + 1] - E.lat[best.seg]);
    best.lon = E.lon[best.seg] + best.t * (E.lon[best.seg + 1] - E.lon[best.seg]);
    best.pos = E.cum[best.seg] + best.t * (E.cum[best.seg + 1] - E.cum[best.seg]);
    return best;
  }

  // Binary min-heap of [cost, node]
  function Heap() { this.h = []; }
  Heap.prototype.push = function (item) {
    const h = this.h; h.push(item);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  };

  // Polyline of an edge between two positions (meters along the edge), in travel order
  function slice(E, from, to) {
    const out = [];
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const at = (pos) => {
      let i = 0;
      while (i < E.cum.length - 2 && E.cum[i + 1] < pos) i++;
      const span = E.cum[i + 1] - E.cum[i] || 1;
      const t = (pos - E.cum[i]) / span;
      return [E.lat[i] + t * (E.lat[i + 1] - E.lat[i]), E.lon[i] + t * (E.lon[i + 1] - E.lon[i])];
    };
    out.push(at(lo));
    for (let i = 0; i < E.cum.length; i++) if (E.cum[i] > lo && E.cum[i] < hi) out.push([E.lat[i], E.lon[i]]);
    out.push(at(hi));
    if (from > to) out.reverse();
    return out;
  }

  function route(latA, lonA, latB, lonB) {
    if (!G) return null;
    const s = snap(latA, lonA), t = snap(latB, lonB);
    if (!s || !t) return null;
    const ES = G.edges[s.e], ET = G.edges[t.e];

    const dist = new Float64Array(G.n).fill(Infinity);
    const prev = new Int32Array(G.n).fill(-1);      // previous node
    const prevEdge = new Int32Array(G.n).fill(-1);
    const prevDir = new Int8Array(G.n);
    const heap = new Heap();
    const seed = (node, cost) => { if (cost < dist[node]) { dist[node] = cost; prev[node] = -2; heap.push([cost, node]); } };
    if (ES.flags & 2) seed(ES.a, s.pos * ES.factor);
    if (ES.flags & 1) seed(ES.b, (ES.len - s.pos) * ES.factor);

    // Cost of arriving at the target from each end of its edge
    const endA = (ET.flags & 1) ? t.pos * ET.factor : Infinity;               // reach a, then a -> target
    const endB = (ET.flags & 2) ? (ET.len - t.pos) * ET.factor : Infinity;    // reach b, then b -> target
    let bestCost = Infinity, bestVia = -1;

    // Same edge: travel directly if the direction is allowed
    let direct = Infinity;
    if (s.e === t.e) {
      if (t.pos >= s.pos && (ES.flags & 1)) direct = (t.pos - s.pos) * ES.factor;
      else if (t.pos < s.pos && (ES.flags & 2)) direct = (s.pos - t.pos) * ES.factor;
    }

    while (heap.h.length) {
      const [c, u] = heap.pop();
      if (c > dist[u]) continue;
      if (c >= Math.min(bestCost, direct)) break;
      if (u === ET.a && c + endA < bestCost) { bestCost = c + endA; bestVia = u; }
      if (u === ET.b && c + endB < bestCost) { bestCost = c + endB; bestVia = u; }
      for (const [v, ei, dir] of G.adj[u]) {
        const E = G.edges[ei];
        const nc = c + E.len * E.factor;
        if (nc < dist[v]) { dist[v] = nc; prev[v] = u; prevEdge[v] = ei; prevDir[v] = dir; heap.push([nc, v]); }
      }
    }

    const pts = [];
    let meters = 0;
    if (direct <= bestCost) {
      if (!isFinite(direct)) return null;
      pts.push(...slice(ES, s.pos, t.pos));
      meters = Math.abs(t.pos - s.pos);
    } else {
      if (bestVia < 0) return null;
      // walk back from the target's edge end to the start
      const chain = [];
      let u = bestVia;
      while (prev[u] >= 0) { chain.push([prevEdge[u], prevDir[u]]); u = prev[u]; }
      const first = u;  // first graph node reached from the start
      // start piece
      const startTo = first === ES.a ? 0 : ES.len;
      pts.push(...slice(ES, s.pos, startTo));
      meters += Math.abs(s.pos - startTo);
      for (let i = chain.length - 1; i >= 0; i--) {
        const [ei, dir] = chain[i];
        const E = G.edges[ei];
        const seg = slice(E, dir === 1 ? 0 : E.len, dir === 1 ? E.len : 0);
        pts.push(...seg);
        meters += E.len;
      }
      // end piece
      const endFrom = bestVia === ET.a ? 0 : ET.len;
      pts.push(...slice(ET, endFrom, t.pos));
      meters += Math.abs(t.pos - endFrom);
    }
    // de-duplicate consecutive identical points
    const geometry = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    return { distanceMeters: meters, geometry };
  }

  const api = {
    init(data) { G = build(data); return api; },
    ready() { return !!G; },
    route,
    // Browser: fetch the saved roads once (the service worker keeps the file for offline use)
    load(url) {
      if (G) return Promise.resolve(api);
      if (!loading) {
        loading = fetch(url || 'roads.json').then(r => { if (!r.ok) throw new Error('roads.json ' + r.status); return r.json(); })
          .then(d => { api.init(d); return api; })
          .catch(err => { loading = null; throw err; });
      }
      return loading;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OfflineRouter = api;
})(typeof self !== 'undefined' ? self : this);
