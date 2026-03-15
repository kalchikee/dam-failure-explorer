/* ── Dam Failure Inundation Explorer — app.js ──────────────────────────── */
'use strict';

// ── Colour helpers ────────────────────────────────────────────────────────
const TIER_COLOR = {
  Critical: '#d32f2f',
  High:     '#f57c00',
  Elevated: '#fbc02d',
  Moderate: '#388e3c',
};
const COND_COLOR = {
  'Unsatisfactory': '#d32f2f',
  'Poor':           '#f57c00',
  'Fair':           '#fbc02d',
  'Satisfactory':   '#388e3c',
  'Not Rated':      '#8b949e',
  'Unknown':        '#8b949e',
};

function tierColor(tier) { return TIER_COLOR[tier] || '#8b949e'; }

// ── State ─────────────────────────────────────────────────────────────────
let allDams = [];
let filteredDams = [];
let stateData = [];
let condData = [];
let summaryStats = {};
let map, clusterGroup;
let activeFilters = { tiers: new Set(['Critical','High','Elevated','Moderate']), state: '' };

// ── Formatters ────────────────────────────────────────────────────────────
const fmt = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString();
const fmtScore = s => (s == null || isNaN(s)) ? '—' : Number(s).toFixed(1);

// ── Panel Navigation ──────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    if (btn.dataset.panel === 'rankings') renderRankings();
  });
});

// ── Map init ──────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { center: [38.5, -96.5], zoom: 4, zoomControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    chunkedLoading: true,
  });
  map.addLayer(clusterGroup);
}

// ── Build markers ─────────────────────────────────────────────────────────
function buildMarker(dam) {
  const p = dam.properties;
  const color = tierColor(p.risk_tier);
  const r = Math.max(5, Math.min(14, 5 + (p.risk_score / 100) * 9));

  const icon = L.divIcon({
    html: `<svg width="${r*2}" height="${r*2}" viewBox="0 0 ${r*2} ${r*2}">
      <circle cx="${r}" cy="${r}" r="${r-1}" fill="${color}" fill-opacity="0.85" stroke="#fff" stroke-width="0.8"/>
    </svg>`,
    className: '',
    iconSize: [r*2, r*2],
    iconAnchor: [r, r],
  });

  const marker = L.marker([p.lat || dam.geometry.coordinates[1], p.lon || dam.geometry.coordinates[0]], { icon });

  marker.bindPopup(() => buildPopup(p), { maxWidth: 320 });
  marker.on('click', () => showDetail(p));
  return marker;
}

function buildPopup(p) {
  const color = tierColor(p.risk_tier);
  return `<div style="min-width:220px">
    <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#e6edf3">${p.name || 'Unknown Dam'}</div>
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
      <span style="background:${color};color:${p.risk_tier==='Elevated'?'#000':'#fff'};padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">${p.risk_tier}</span>
      <span style="background:#21262d;color:#e6edf3;padding:2px 8px;border-radius:3px;font-size:11px">${p.condition || 'Unknown'}</span>
    </div>
    <table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr><td style="color:#8b949e;padding:2px 0">State</td><td style="text-align:right;color:#e6edf3">${p.state}</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">County</td><td style="text-align:right;color:#e6edf3">${p.county || '—'}</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">River</td><td style="text-align:right;color:#e6edf3">${p.river || '—'}</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">Height</td><td style="text-align:right;color:#e6edf3">${fmt(p.height_ft)} ft</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">Storage</td><td style="text-align:right;color:#e6edf3">${fmt(p.storage_acft)} ac-ft</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">Built</td><td style="text-align:right;color:#e6edf3">${p.year_completed || '—'}</td></tr>
      <tr><td style="color:#8b949e;padding:2px 0">Risk Score</td><td style="text-align:right;color:#e6edf3;font-weight:700">${fmtScore(p.risk_score)} / 100</td></tr>
      ${p.peak_discharge ? `<tr><td style="color:#8b949e;padding:2px 0">Peak Discharge</td><td style="text-align:right;color:#e6edf3">${fmt(p.peak_discharge)} m³/s</td></tr>` : ''}
      ${p.est_reach_miles ? `<tr><td style="color:#8b949e;padding:2px 0">Est. Reach</td><td style="text-align:right;color:#e6edf3">~${p.est_reach_miles} mi</td></tr>` : ''}
    </table>
  </div>`;
}

function showDetail(p) {
  const color = tierColor(p.risk_tier);
  document.getElementById('detail-content').innerHTML = `
    <div style="margin-bottom:10px">
      <div style="font-weight:700;font-size:13px;color:#e6edf3;margin-bottom:4px">${p.name || 'Unknown Dam'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        <span style="background:${color};color:${p.risk_tier==='Elevated'?'#000':'#fff'};padding:2px 8px;border-radius:3px;font-size:11px;font-weight:700">${p.risk_tier}</span>
      </div>
      <div class="detail-risk" style="color:${color}">${fmtScore(p.risk_score)}<span style="font-size:13px;color:#8b949e"> / 100</span></div>
    </div>
    <div class="detail-row"><strong>State</strong><span>${p.state}</span></div>
    <div class="detail-row"><strong>County</strong><span>${p.county || '—'}</span></div>
    <div class="detail-row"><strong>City</strong><span>${p.city || '—'}</span></div>
    <div class="detail-row"><strong>River</strong><span>${p.river || '—'}</span></div>
    <div class="detail-row"><strong>Condition</strong><span>${p.condition || 'Unknown'}</span></div>
    <div class="detail-row"><strong>Dam Type</strong><span>${p.dam_type || '—'}</span></div>
    <div class="detail-row"><strong>Purpose</strong><span>${p.purpose || '—'}</span></div>
    <div class="detail-row"><strong>Owner</strong><span style="font-size:11px;text-align:right;max-width:140px">${p.owner || '—'}</span></div>
    <div class="detail-row"><strong>Height</strong><span>${fmt(p.height_ft)} ft</span></div>
    <div class="detail-row"><strong>Storage</strong><span>${fmt(p.storage_acft)} ac-ft</span></div>
    <div class="detail-row"><strong>Year Built</strong><span>${p.year_completed || '—'}</span></div>
    <div class="detail-row"><strong>Status</strong><span>${p.status || '—'}</span></div>
    <div class="detail-row"><strong>EAP Prepared</strong><span>${p.eap || '—'}</span></div>
    <div class="detail-row"><strong>Last Inspection</strong><span>${p.last_inspection || '—'}</span></div>
    ${p.peak_discharge ? `<div class="detail-row"><strong>Peak Discharge</strong><span>${fmt(p.peak_discharge)} m³/s</span></div>` : ''}
    ${p.est_reach_miles ? `<div class="detail-row"><strong>Est. Inundation Reach</strong><span>~${p.est_reach_miles} mi</span></div>` : ''}
    <div class="detail-row"><strong>NID ID</strong><span style="font-size:11px">${p.id || '—'}</span></div>
  `;
}

// ── Render map markers ────────────────────────────────────────────────────
function renderMarkers() {
  clusterGroup.clearLayers();
  const markers = filteredDams.map(d => buildMarker(d));
  clusterGroup.addLayers(markers);

  // Update counts
  document.getElementById('cnt-critical').textContent = `(${filteredDams.filter(d=>d.properties.risk_tier==='Critical').length})`;
  document.getElementById('cnt-high').textContent     = `(${filteredDams.filter(d=>d.properties.risk_tier==='High').length})`;
  document.getElementById('cnt-elevated').textContent = `(${filteredDams.filter(d=>d.properties.risk_tier==='Elevated').length})`;
  document.getElementById('cnt-moderate').textContent = `(${filteredDams.filter(d=>d.properties.risk_tier==='Moderate').length})`;
  document.getElementById('load-count').textContent   = `${filteredDams.length.toLocaleString()} dams shown`;
}

// ── Apply filters ─────────────────────────────────────────────────────────
function applyFilters() {
  filteredDams = allDams.filter(d => {
    const p = d.properties;
    if (!activeFilters.tiers.has(p.risk_tier)) return false;
    if (activeFilters.state && p.state !== activeFilters.state) return false;
    return true;
  });
  renderMarkers();
}

// ── Sidebar filter wiring ─────────────────────────────────────────────────
function wireFilters() {
  ['critical','high','elevated','moderate'].forEach(tier => {
    document.getElementById('chk-' + tier).addEventListener('change', e => {
      const t = tier.charAt(0).toUpperCase() + tier.slice(1);
      if (e.target.checked) activeFilters.tiers.add(t);
      else activeFilters.tiers.delete(t);
      applyFilters();
    });
  });
  document.getElementById('filter-state').addEventListener('change', e => {
    activeFilters.state = e.target.value;
    applyFilters();
  });
}

// ── Rankings panel ────────────────────────────────────────────────────────
function renderRankings() {
  const metric = document.getElementById('rank-metric').value || 'total_high_hazard';
  const sorted = [...stateData].sort((a,b) => (b[metric]||0) - (a[metric]||0)).slice(0, 30);
  const maxVal = sorted[0]?.[metric] || 1;

  const colorMap = {
    total_high_hazard: '#58a6ff',
    critical_count:    '#d32f2f',
    poor_unsatisfactory:'#f57c00',
    avg_risk_score:    '#fbc02d',
  };
  const barColor = colorMap[metric] || '#58a6ff';

  const subLabel = {
    total_high_hazard:   d => `${fmt(d.critical_count)} critical`,
    critical_count:      d => `score ${fmtScore(d.avg_risk_score)}`,
    poor_unsatisfactory: d => `${fmt(d.total_high_hazard)} total HH`,
    avg_risk_score:      d => `${fmt(d.total_high_hazard)} dams`,
  };

  document.getElementById('rankings-chart').innerHTML = sorted.map(d => `
    <div class="bar-row">
      <div class="bar-label">${d.state}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${((d[metric]||0)/maxVal*100).toFixed(1)}%;background:${barColor}"></div>
      </div>
      <div class="bar-value">${metric.includes('score') ? fmtScore(d[metric]) : fmt(d[metric])}</div>
      <div class="bar-sub">${(subLabel[metric]||(() => ''))(d)}</div>
    </div>
  `).join('');
}

document.getElementById('rank-metric').addEventListener('change', renderRankings);

// ── Search panel ──────────────────────────────────────────────────────────
function renderSearchResults(dams) {
  const tbody = document.getElementById('search-results');
  tbody.innerHTML = dams.slice(0, 200).map(d => {
    const p = d.properties;
    const color = tierColor(p.risk_tier);
    return `<tr onclick="zoomToDam(${d.geometry.coordinates[1]}, ${d.geometry.coordinates[0]})">
      <td>${p.name || '—'}</td>
      <td>${p.state}</td>
      <td>${p.county || '—'}</td>
      <td><span class="tier-badge tier-${p.risk_tier}">${p.risk_tier}</span></td>
      <td>${p.condition || '—'}</td>
      <td style="font-weight:700;color:${color}">${fmtScore(p.risk_score)}</td>
      <td>${p.year_completed || '—'}</td>
      <td>${fmt(p.height_ft)}</td>
      <td>${fmt(p.storage_acft)}</td>
    </tr>`;
  }).join('');
  document.getElementById('search-status').textContent = `${dams.length.toLocaleString()} result${dams.length===1?'':'s'}${dams.length>200?' (showing first 200)':''}`;
}

window.zoomToDam = function(lat, lon) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-panel=map]').classList.add('active');
  document.getElementById('panel-map').classList.add('active');
  map.setView([lat, lon], 13);
};

document.getElementById('search-btn').addEventListener('click', () => {
  const q     = document.getElementById('search-input').value.trim().toLowerCase();
  const state = document.getElementById('search-state').value;
  const cond  = document.getElementById('search-condition').value;
  const tier  = document.getElementById('search-tier').value;

  let results = allDams;
  if (q)     results = results.filter(d => (d.properties.name||'').toLowerCase().includes(q) || (d.properties.river||'').toLowerCase().includes(q) || (d.properties.county||'').toLowerCase().includes(q));
  if (state) results = results.filter(d => d.properties.state === state);
  if (cond)  results = results.filter(d => d.properties.condition === cond);
  if (tier)  results = results.filter(d => d.properties.risk_tier === tier);

  results = results.sort((a,b) => b.properties.risk_score - a.properties.risk_score);
  renderSearchResults(results);
});

document.getElementById('top-risk-btn').addEventListener('click', () => {
  const top = [...allDams].sort((a,b) => b.properties.risk_score - a.properties.risk_score).slice(0, 100);
  renderSearchResults(top);
  document.getElementById('search-status').textContent = 'Showing top 100 highest-risk dams nationally';
});

// Enter key in search
document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('search-btn').click();
});

// ── Condition breakdown chart ─────────────────────────────────────────────
function renderConditionChart() {
  const order = ['Unsatisfactory','Poor','Fair','Satisfactory','Not Rated'];
  const colors = ['#d32f2f','#f57c00','#fbc02d','#388e3c','#8b949e'];
  const total = condData.reduce((s,d) => s + d.count, 0);
  const map2 = Object.fromEntries(condData.map(d => [d.condition, d.count]));
  const max = Math.max(...order.map(c => map2[c]||0));

  document.getElementById('condition-chart').innerHTML = order.map((cond, i) => {
    const count = map2[cond] || 0;
    const pct = max ? (count/max*100).toFixed(1) : 0;
    return `<div class="cond-row">
      <div class="cond-label">${cond}</div>
      <div class="cond-bar-track"><div class="cond-bar-fill" style="width:${pct}%;background:${colors[i]}"></div></div>
      <div class="cond-count">${fmt(count)}</div>
    </div>`;
  }).join('');
}

// ── Populate state dropdowns ───────────────────────────────────────────────
function populateStateDropdowns() {
  const states = [...new Set(allDams.map(d => d.properties.state))].filter(Boolean).sort();
  ['filter-state','search-state'].forEach(id => {
    const sel = document.getElementById(id);
    states.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
  });
}

// ── Summary stat banner ───────────────────────────────────────────────────
function updateBanner() {
  document.getElementById('stat-total').textContent    = fmt(summaryStats.total_dams_national);
  document.getElementById('stat-hh').textContent       = fmt(summaryStats.total_high_hazard);
  document.getElementById('stat-critical').textContent = fmt(summaryStats.critical_count + summaryStats.high_count);
  document.getElementById('stat-poor').textContent     = fmt(summaryStats.poor_unsatisfactory);
  document.getElementById('stat-no-eap').textContent   = fmt(summaryStats.no_eap);
}

// ── Main data load ────────────────────────────────────────────────────────
async function loadData() {
  const status = document.getElementById('load-status');
  status.innerHTML = '<div class="spinner"></div> Loading dam data…';

  try {
    const [geojsonRes, stateRes, condRes, summaryRes] = await Promise.all([
      fetch('data/dams_national_highhazard.geojson'),
      fetch('data/state_risk_summary.json'),
      fetch('data/condition_breakdown.json'),
      fetch('data/summary_stats.json'),
    ]);

    const geojson = await geojsonRes.json();
    stateData    = await stateRes.json();
    condData     = await condRes.json();
    summaryStats = await summaryRes.json();

    allDams = geojson.features;
    filteredDams = allDams;

    updateBanner();
    populateStateDropdowns();
    renderMarkers();
    renderConditionChart();
    renderSearchResults([...allDams].sort((a,b) => b.properties.risk_score - a.properties.risk_score).slice(0,50));

    status.innerHTML = '&#10003; ' + allDams.length.toLocaleString() + ' high-hazard dams loaded';
    status.classList.add('done');

    document.getElementById('load-count').textContent = allDams.length.toLocaleString() + ' dams shown';

  } catch(err) {
    status.innerHTML = '&#9888; Error loading data: ' + err.message;
    console.error(err);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
initMap();
wireFilters();
loadData();
