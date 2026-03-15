"""
Dam Failure Inundation Explorer — Data Processing Pipeline
Processes the National Inventory of Dams (NID) data to:
  1. Filter high-hazard dams nationally
  2. Calculate a composite Dam Risk Score
  3. Export GeoJSON for the web app
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import pandas as pd
import numpy as np
import json
import os

RAW   = "c:/Users/kalch/OneDrive/Desktop/Portfolio/Dam Failure/data/raw/nid_national.csv"
OUT   = "c:/Users/kalch/OneDrive/Desktop/Portfolio/Dam Failure/web/data"
os.makedirs(OUT, exist_ok=True)

# ── 1. Load ───────────────────────────────────────────────────────────────────
print("Loading NID data…")
df = pd.read_csv(RAW, skiprows=1, low_memory=False)
print(f"  Total dams: {len(df):,}")

# ── 2. Clean & standardise columns ───────────────────────────────────────────
df = df.rename(columns={
    'Dam Name':                        'name',
    'NID ID':                          'nid_id',
    'Latitude':                        'lat',
    'Longitude':                       'lon',
    'State':                           'state',
    'County':                          'county',
    'City':                            'city',
    'River or Stream Name':            'river',
    'Hazard Potential Classification': 'hazard',
    'Condition Assessment':            'condition',
    'Dam Height (Ft)':                 'dam_height_ft',
    'NID Height (Ft)':                 'nid_height_ft',
    'NID Storage (Acre-Ft)':           'storage_acft',
    'Normal Storage (Acre-Ft)':        'normal_storage_acft',
    'Max Storage (Acre-Ft)':           'max_storage_acft',
    'Year Completed':                  'year_completed',
    'Primary Dam Type':                'dam_type',
    'Primary Purpose':                 'purpose',
    'Owner Names':                     'owner',
    'Primary Owner Type':              'owner_type',
    'Operational Status':              'status',
    'EAP Prepared':                    'eap',
    'Last Inspection Date':            'last_inspection',
})

# Drop rows without coordinates
df = df.dropna(subset=['lat', 'lon'])
df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
df['lon'] = pd.to_numeric(df['lon'], errors='coerce')
df = df.dropna(subset=['lat', 'lon'])

# ── 3. Filter high-hazard dams ────────────────────────────────────────────────
print("Filtering high-hazard dams…")
hh = df[df['hazard'].str.strip() == 'High'].copy()
print(f"  High-hazard dams: {len(hh):,}")

# ── 4. Calculate Dam Risk Score ───────────────────────────────────────────────
# Weights: hazard class (already filtered to High = 1.0), condition (30%),
#          storage volume (15%), dam age (15%)
# We'll use condition + storage + age for the 60% that varies within high-hazard

CONDITION_SCORE = {
    'Unsatisfactory': 1.0,
    'Poor':           0.85,
    'Fair':           0.50,
    'Satisfactory':   0.20,
    'Not Rated':      0.40,
    'Unknown':        0.40,
}

def condition_score(val):
    if pd.isna(val):
        return 0.40
    return CONDITION_SCORE.get(str(val).strip(), 0.40)

hh['condition_score'] = hh['condition'].apply(condition_score)

# Storage score (normalised 0-1, capped at 99th percentile)
hh['storage_acft'] = pd.to_numeric(hh['storage_acft'], errors='coerce').fillna(0)
p99_storage = hh['storage_acft'].quantile(0.99)
hh['storage_score'] = (hh['storage_acft'] / p99_storage).clip(0, 1)

# Age score (older = higher risk; built pre-1970 scored highest)
current_year = 2026
hh['year_completed'] = pd.to_numeric(hh['year_completed'], errors='coerce')
hh['dam_age'] = current_year - hh['year_completed'].fillna(1970)
hh['dam_age'] = hh['dam_age'].clip(0, 120)
hh['age_score'] = (hh['dam_age'] / 120).clip(0, 1)

# Height score (taller = more energy if it fails)
hh['dam_height_ft'] = pd.to_numeric(hh['dam_height_ft'], errors='coerce').fillna(0)
p99_height = hh['dam_height_ft'].quantile(0.99)
hh['height_score'] = (hh['dam_height_ft'] / p99_height).clip(0, 1)

# Combined Risk Score (0–100)
hh['risk_score'] = (
    0.35 * hh['condition_score'] +
    0.25 * hh['storage_score']   +
    0.20 * hh['age_score']       +
    0.20 * hh['height_score']
) * 100

hh['risk_score'] = hh['risk_score'].round(1)

# Risk tier
def risk_tier(score):
    if score >= 70: return 'Critical'
    if score >= 50: return 'High'
    if score >= 30: return 'Elevated'
    return 'Moderate'

hh['risk_tier'] = hh['risk_score'].apply(risk_tier)
print(f"  Risk tier breakdown:\n{hh['risk_tier'].value_counts()}")

# ── 5. Froehlich (1995) simplified peak breach discharge ──────────────────────
# Qp = 0.607 * (Vw^0.295) * (hw^1.24)
# Vw = reservoir volume in m^3, hw = dam height in m
# acre-ft to m^3: * 1233.48
# ft to m: * 0.3048
hh['dam_height_m'] = hh['dam_height_ft'] * 0.3048
hh['storage_m3']   = hh['storage_acft'] * 1233.48

mask = (hh['dam_height_m'] > 0) & (hh['storage_m3'] > 0)
hh['peak_discharge_m3s'] = np.nan
hh.loc[mask, 'peak_discharge_m3s'] = (
    0.607
    * (hh.loc[mask, 'storage_m3'] ** 0.295)
    * (hh.loc[mask, 'dam_height_m'] ** 1.24)
).round(0)

# Estimated downstream reach (simplified: 1 mile per 1000 m3/s, max 20 miles)
hh['est_reach_miles'] = (hh['peak_discharge_m3s'] / 1000).clip(1, 20).round(1)

# ── 6. National GeoJSON (all high-hazard dams) ───────────────────────────────
print("Building national GeoJSON…")

def _s(v, default=''):
    """Return empty string for NaN/None, else str(v)."""
    if v is None: return default
    try:
        if pd.isna(v): return default
    except (TypeError, ValueError):
        pass
    return str(v)

def _n(v):
    """Return None for NaN, else float(v)."""
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    f = float(v)
    return None if (f != f) else f  # second NaN guard

def row_to_feature(row):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [row['lon'], row['lat']]},
        "properties": {
            "id":              _s(row.get('nid_id')),
            "name":            _s(row.get('name'), 'Unknown Dam'),
            "state":           _s(row.get('state')),
            "county":          _s(row.get('county')),
            "city":            _s(row.get('city')),
            "river":           _s(row.get('river')),
            "hazard":          _s(row.get('hazard')),
            "condition":       _s(row.get('condition'), 'Not Rated'),
            "dam_type":        _s(row.get('dam_type')),
            "purpose":         _s(row.get('purpose')),
            "owner":           _s(row.get('owner')),
            "owner_type":      _s(row.get('owner_type')),
            "height_ft":       _n(row['dam_height_ft']),
            "storage_acft":    _n(row['storage_acft']),
            "year_completed":  int(row['year_completed']) if not pd.isna(row['year_completed']) else None,
            "risk_score":      float(row['risk_score']),
            "risk_tier":       row['risk_tier'],
            "condition_score": round(float(row['condition_score']), 2),
            "peak_discharge":  _n(row.get('peak_discharge_m3s')),
            "est_reach_miles": _n(row.get('est_reach_miles')),
            "status":          _s(row.get('status')),
            "eap":             _s(row.get('eap')),
            "last_inspection": _s(row.get('last_inspection')),
        }
    }

features = [row_to_feature(r) for _, r in hh.iterrows()]
geojson = {"type": "FeatureCollection", "features": features}

out_path = os.path.join(OUT, "dams_national_highhazard.geojson")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(geojson, f, separators=(',', ':'), allow_nan=False)
size_mb = os.path.getsize(out_path) / 1e6
print(f"  Saved {len(features):,} features → {out_path} ({size_mb:.1f} MB)")

# ── 7. State summary ──────────────────────────────────────────────────────────
print("Building state summary…")
state_stats = hh.groupby('state').agg(
    total_high_hazard=('nid_id', 'count'),
    critical_count=('risk_tier', lambda x: (x == 'Critical').sum()),
    high_count=('risk_tier', lambda x: (x == 'High').sum()),
    poor_unsatisfactory=('condition', lambda x: x.isin(['Poor', 'Unsatisfactory']).sum()),
    avg_risk_score=('risk_score', 'mean'),
    max_risk_score=('risk_score', 'max'),
    total_storage_acft=('storage_acft', 'sum'),
).reset_index()
state_stats['avg_risk_score'] = state_stats['avg_risk_score'].round(1)
state_stats['max_risk_score'] = state_stats['max_risk_score'].round(1)
state_stats['total_storage_acft'] = state_stats['total_storage_acft'].round(0)
state_stats = state_stats.sort_values('total_high_hazard', ascending=False)

out_path2 = os.path.join(OUT, "state_risk_summary.json")
state_stats.to_json(out_path2, orient='records', indent=2)
print(f"  Saved state summary → {out_path2}")

# ── 8. Top 100 national riskiest dams ─────────────────────────────────────────
top100 = hh.nlargest(100, 'risk_score')[[
    'nid_id','name','state','county','city','river',
    'condition','dam_type','dam_height_ft','storage_acft',
    'year_completed','risk_score','risk_tier',
    'peak_discharge_m3s','est_reach_miles','lat','lon'
]].copy()
top100 = top100.rename(columns={'peak_discharge_m3s':'peak_discharge'})
out_path3 = os.path.join(OUT, "top_risk_dams.json")
top100.to_json(out_path3, orient='records', indent=2)
print(f"  Saved top-100 risk dams → {out_path3}")

# ── 9. Condition breakdown (national) ─────────────────────────────────────────
condition_summary = hh['condition'].value_counts().reset_index()
condition_summary.columns = ['condition', 'count']
out_path4 = os.path.join(OUT, "condition_breakdown.json")
condition_summary.to_json(out_path4, orient='records', indent=2)
print(f"  Saved condition breakdown → {out_path4}")

# ── 10. Summary stats ─────────────────────────────────────────────────────────
summary = {
    "total_dams_national":   int(len(df)),
    "total_high_hazard":     int(len(hh)),
    "critical_count":        int((hh['risk_tier'] == 'Critical').sum()),
    "high_count":            int((hh['risk_tier'] == 'High').sum()),
    "elevated_count":        int((hh['risk_tier'] == 'Elevated').sum()),
    "poor_unsatisfactory":   int(hh['condition'].isin(['Poor', 'Unsatisfactory']).sum()),
    "not_rated":             int((hh['condition'] == 'Not Rated').sum()),
    "no_eap":                int((hh['eap'].isin(['No', 'nan', ''])).sum()),
    "data_date":             "2026-03-15",
}
out_path5 = os.path.join(OUT, "summary_stats.json")
with open(out_path5, 'w') as f:
    json.dump(summary, f, indent=2)
print(f"  Summary stats: {summary}")
print("\nDone!")
