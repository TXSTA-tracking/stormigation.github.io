# Stormigation

Mobile-first static web app for storm chasing situational awareness.

## Features

- Made by the Texas Storm Tracking Association branding.
- Closeable `Update V.0.1` in-app popup with feature notes.
- Leaflet map with OpenStreetMap base tiles.
- NOAA/NWS radar mosaic WMS overlay.
- Active NWS warning/watch polygons from `api.weather.gov`.
- SPC Day 1 convective outlook GeoJSON overlay.
- Live auto-refresh every 2 minutes while the browser tab is active.
- CONUS map bounds to prevent global tile wrapping and Pacific alert zoom glitches.
- Browser GPS tracking with a local track line saved in `localStorage`.
- Live detail cards for readiness checks, data sources, last update time, and track points.
- Warning and SPC severity legends.
- Target cards that create Google Maps, Apple Maps, and Android `geo:` navigation links.
- Layer toggles, alert cards, outlook summary, and fit-to-hazards control.

## Run Locally

From this folder:

```powershell
node server.js
```

Then open:

```text
http://127.0.0.1:4173
```

You can also serve the folder with any static web server, including `python -m http.server 4173`.

## Data Sources

- NWS alerts API: `https://api.weather.gov/alerts/active`
- NWS radar WMS: `https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows`
- SPC Day 1 outlook GeoJSON: `https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson`

## Notes

This is a decision-support prototype, not an emergency service or a replacement for trained spotter judgment. Do not navigate into warned storms. Check official NWS text, road closures, local law, escape routes, terrain, visibility, and fuel before moving.
