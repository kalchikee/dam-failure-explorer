# Dam Failure Inundation Explorer
### Who Lives Downstream of High-Hazard Dams?

**[Live App](https://kalchikee.github.io/dam-failure-explorer/)** &nbsp;|&nbsp; Data: USACE National Inventory of Dams (2026)

---

The United States has over **92,000 dams**. The Army Corps of Engineers classifies **16,805** of them as *high-hazard potential* — meaning failure would likely cause loss of life. Despite this, most Americans have no idea whether they live downstream of a compromised dam.

This project maps every high-hazard dam in the National Inventory of Dams (NID), scores each one by structural risk, and estimates the downstream reach of a potential failure using the Froehlich (1995) breach discharge equation.

## Features

- **National map** of 16,805 high-hazard dams colored by risk tier (Critical → Moderate)
- **Dam Risk Score** (0–100) combining condition rating, storage volume, dam age, and height
- **Froehlich breach discharge estimates** for dams with known height and storage
- **Estimated downstream inundation reach** in miles
- **State rankings** by total high-hazard count, critical dams, and poor condition
- **Searchable dam database** — filter by name, state, condition, or risk tier
- Click any dam to see full NID attributes and risk breakdown

## Key Statistics (NID, March 2026)

| Metric | Count |
|--------|-------|
| Total US dams | 92,445 |
| High-hazard potential | 16,805 |
| Critical or High risk score | 806 |
| Poor / Unsatisfactory condition | 2,637 |
| No Emergency Action Plan | 2,470 |

## Risk Score Methodology

Each high-hazard dam receives a composite score (0–100):

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Condition Assessment | 35% | Unsatisfactory=1.0, Poor=0.85, Fair=0.5, Satisfactory=0.2, Not Rated=0.4 |
| Reservoir Storage Volume | 25% | Larger reservoirs release more energy on failure |
| Dam Age | 20% | Older infrastructure is statistically more likely to fail |
| Dam Height | 20% | Taller dams produce larger, faster flood waves |

Risk tiers: **Critical** (≥70), **High** (50–70), **Elevated** (30–50), **Moderate** (<30)

## Breach Discharge Estimate

Peak discharge estimated using the Froehlich (1995) empirical equation:

```
Qp = 0.607 × Vw^0.295 × hw^1.24
```

Where `Vw` = reservoir volume in m³ and `hw` = dam height in metres.

Estimated downstream inundation reach: 1 mile per 1,000 m³/s, capped at 20 miles. **This is a simplified screening estimate — not a substitute for formal hydraulic analysis.**

## Data Source

- **National Inventory of Dams (NID)**: [nid.sec.usace.army.mil](https://nid.sec.usace.army.mil) — US Army Corps of Engineers, updated March 2026

## Repository Structure

```
/
├── index.html              # Main application
├── web/
│   ├── css/style.css       # Styles
│   ├── js/app.js           # Application logic
│   └── data/               # Processed data files
│       ├── dams_national_highhazard.geojson
│       ├── state_risk_summary.json
│       ├── top_risk_dams.json
│       ├── condition_breakdown.json
│       └── summary_stats.json
├── process_data.py         # Data processing pipeline
└── README.md
```

## Tech Stack

- **Leaflet.js** + MarkerCluster — map rendering and clustering for 16K+ points
- **Vanilla JS** — no framework dependencies
- **Python** (pandas, numpy) — data processing pipeline
- **GitHub Pages** — free static hosting

## Disclaimer

This tool is for public education and research purposes only. Risk scores and inundation estimates are simplified models not suitable for emergency planning. For official dam safety information, contact your state dam safety program or FEMA.
