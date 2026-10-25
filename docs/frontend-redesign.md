# Map and sidebar redesign

The interface follows the structure of IlliniSpots instead of a landing page:

- `FacilityMap.tsx`: full-height map, Mapbox lifecycle, glowing status markers, map/list selection, fly-to, and resize handling.
- `LeftSidebar.tsx`: compact persistent toolbar with search, filter and date controls, menu, and an independently scrolling facility view.
- `FacilityListItem.tsx`: dense library rows with availability counts.
- `FacilityDetailPage.tsx` and `RoomRow.tsx`: library drill-down and inline room schedules rather than a card grid.
- `src/client/routes/index.tsx`: resizable desktop split view, stacked map/list on phones.
- `src/client/styles.css`: neutral dark surfaces and Inter typography.

Original source: https://github.com/plon/illinispots at commit 984b71d25c435edccbcc0dedc8275615ebf279f7. Required MIT attribution is in THIRD_PARTY_NOTICES.md.

PennSpots keeps its existing read-only PSU availability adapter. It does not invent academic-building availability to fill the sidebar. The four library groups are the currently supported study-room categories. A zero count means no matching availability, not a claim that a building is closed.

## Map configuration

Copy `.env.example` to `.env.local` and set `VITE_MAPBOX_ACCESS_TOKEN` to your own public `pk.` token. Required public scopes: STYLES:TILES, STYLES:READ, FONTS:READ. No secret scopes are needed. `VITE_MAPBOX_STYLE_URL` optionally selects a custom style; otherwise the app uses Mapbox Standard with dusk lighting in dark mode and day lighting in light mode.

The backend reads `.env` / `.env.local` and process variables; injected process variables take precedence. `/api/map-config` exposes only a public token and style URL. Secret `sk.` tokens are rejected. Token values are not committed or logged. Restart the server after changing injected variables. Local files are excluded from Git.

When no public token is configured, MapLibre renders a real OpenFreeMap vector basemap, including 3D buildings. It requires no account. It is not a static or invented map. Normal browser access is required to `tiles.openfreemap.org`. Mapbox needs `api.mapbox.com` and `events.mapbox.com`. Provider errors appear explicitly while the room list stays usable.

Both map engines are lazy-loaded; only the selected renderer is fetched by the browser. Explicit local worker assets avoid worker resolution failures in development and production. The keyless development style is in `src/client/map-style.ts`.

## Building coordinates

Centers were checked using an OpenStreetMap Overpass query on 2026-10-25 UTC:

```text
[out:json][timeout:20];
nwr["name"~"Pattee|Paterno|Deike|Davey|Stuckeman"]
  (40.789,-77.879,40.810,-77.85);
out center tags;
```

| Library                            | Building / position                                | Latitude   | Longitude   |
| ---------------------------------- | -------------------------------------------------- | ---------- | ----------- |
| Pattee / Paterno                   | Center between Pattee and Paterno building centers | 40.79813   | -77.86578   |
| Architecture                       | Stuckeman Family Building                          | 40.8010877 | -77.8667354 |
| Earth and Mineral Sciences         | Deike Building                                     | 40.7942302 | -77.8654394 |
| Physical and Mathematical Sciences | Davey Laboratory                                   | 40.79817   | -77.8628638 |

Markers locate buildings, not rooms or accessible entrances. Walking directions use the building center.

## Validation boundaries

Browser behavior tests use the real WebGL renderer with explicit offline vector-tile fixtures. They exercise list/map selection, room schedules, filters, favorites, date controls, keyboard resizing, phone layout, booking handoff/conflicts, theme switching, and accessibility. Separate live browser checks load actual provider assets. No automated test submits a final reservation.
