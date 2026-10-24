# PennSpots

Find library study rooms at Penn State University Park by date, start time, continuous duration, group size, and amenities. An independent project inspired by [IlliniSpots](https://github.com/plon/illinispots).

## Current capabilities

- Live public room metadata and availability from Penn State LibCal. No API key or university credentials needed for discovery.
- Four University Park library categories; wellness space is excluded from study-room results.
- Full-duration availability checks, 15-minute search increments, and Eastern time with daylight-saving validation.
- Library, capacity, amenity, and room-name filters; room schedules; favorites stored only in the current browser.
- Availability refresh every 30 seconds while the page is visible, plus a fresh check before opening booking.
- Phone layout, keyboard-accessible room dialogs, explicit unknown states, and retryable source outages.

**Booking limitation:** the current official link selects the room, date, and start time. Students must choose/confirm the end time on Penn State's site. The dialog explicitly explains this. Exact end-time transfer remains an open requirement, and the application does not generate authentication tokens, handle university passwords, or submit final reservations.

## Develop

Use Node 24 or newer. No database, paid services, or environment secrets are required.

```bash
cd /workspace/pennspots
npm ci
npm run dev
```

The application listens on port 3000, with Vite frontend updates and tsx backend watch mode. Set `PORT` to change it. The server uses Node's supported environment-proxy handling when proxy variables are present.

Only `psu.libcal.com` is required for application data. Setup needs the npm registry. Inspecting official upstream JavaScript additionally requires `static-assets-us.libcal.com`.

## Validate

```bash
npm test
npm run build
npm run test:browser
```

Backend tests cover continuity, gaps, conflicting slots, missing data, clock changes, midnight, source caching/errors, and booking rechecks. Browser tests use explicit mocked API responses to exercise filters, favorites, keyboard dismissal, booking handoff, conflicts, outages, phone layout, and automated WCAG checks without creating live booking holds. `npm run check` runs all checks. `npm run format` formats the source files.

Browser tests use system Chromium when present. Otherwise run `npx playwright install chromium`, or set `CHROMIUM_PATH` to an installed browser. The test server uses port 3001.

To validate live data, search for a time within the next 14 days and compare a room with its official schedule. Live availability comes from `/api/search`; `/api/health` checks the server process only. Never call a health response proof that the upstream data works. Opening room details is read-only; navigating to the official booking link may prepare a pending selection there.

## Production build

```bash
npm ci
npm run build
PORT=3000 npm start
```

One Node process serves the built frontend and API from the same origin. No deployment or paid account has been created. Before a public launch, choose a host, configure HTTPS and edge request limits, establish error monitoring, verify upstream usage expectations, and complete a real student booking walkthrough. Instance-local cache and request limiting do not coordinate across multiple replicas.

## Code map

- `src/server/libcal.ts`: fixed-origin public source reads, metadata/slot validation, request timeouts, cache and request coalescing. It never calls checkout preparation or reservation creation endpoints.
- `src/server/availability.ts`: Eastern time and full-interval evaluation.
- `src/server/app.ts`: search and checked booking-link endpoints.
- `src/client/`: React interface and styling.
- `tests/`: browser behavior checks.

Catalog metadata is cached for an hour; calendar data for 30 seconds. Failed responses are not cached as empty or available data. Availability reflects booking-system listings, not physical occupancy, and does not establish a student's eligibility to reserve.
