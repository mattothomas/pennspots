import { useEffect, useRef, useState } from 'react';
import { LocateFixed, RotateCcw } from 'lucide-react';
import type { Map as LibreMap, Marker as LibreMarker } from 'maplibre-gl';
import type { Library } from './libraries';
import { openMapStyle } from './map-style';
import 'mapbox-gl/dist/mapbox-gl.css';
import 'maplibre-gl/dist/maplibre-gl.css';

interface Props {
  libraries: Library[];
  selected: number | null;
  onSelect: (id: number) => void;
  light: boolean;
}
const CENTER: [number, number] = [-77.8652, 40.7975];

export default function CampusMap({
  libraries,
  selected,
  onSelect,
  light,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const markers = useRef<LibreMarker[]>([]);
  const markerClass = useRef<typeof import('maplibre-gl').Marker | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [provider, setProvider] = useState('');
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setReady(false);
    setError('');
    async function start() {
      try {
        const config: { mapboxAccessToken?: string; mapboxStyleUrl?: string } =
          await fetch('/api/map-config').then((r) => (r.ok ? r.json() : {}));
        const configured = config.mapboxAccessToken || '';
        const token = configured.startsWith('pk.') ? configured : '';
        const gl = token
          ? (await import('mapbox-gl')).default
          : await import('maplibre-gl');
        // Explicit worker assets work under Vite and strict Content Security Policies.
        if (token) {
          const worker =
            await import('mapbox-gl/dist/mapbox-gl-csp-worker.js?url');
          (gl as typeof import('mapbox-gl').default).workerUrl = worker.default;
        } else {
          const worker =
            await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url');
          (gl as typeof import('maplibre-gl')).setWorkerUrl(worker.default);
        }
        if (cancelled || !container.current) return;
        const style = token
          ? config.mapboxStyleUrl || 'mapbox://styles/mapbox/standard'
          : openMapStyle(light);
        // The two renderers share these map/marker methods. Isolate compatibility here.
        const instance = new gl.Map({
          container: container.current,
          style,
          center: CENTER,
          zoom: 15.9,
          pitch: 55,
          bearing: -20,
          antialias: true,
          attributionControl: true,
          ...(token
            ? {
                accessToken: token,
                config: {
                  basemap: {
                    lightPreset: light ? 'day' : 'dusk',
                    showPointOfInterestLabels: false,
                  },
                },
              }
            : {}),
        } as never) as unknown as LibreMap;
        map.current = instance;
        markerClass.current =
          gl.Marker as unknown as typeof import('maplibre-gl').Marker;
        setProvider(token ? 'Mapbox' : 'OpenFreeMap');
        instance.addControl(
          new gl.NavigationControl({ visualizePitch: true }) as never,
          'top-right',
        );
        timer = setTimeout(() => {
          if (!cancelled && !instance.loaded())
            setError(
              'The campus map could not load. Check your connection and try again.',
            );
        }, 18000);
        instance.on('load', () => {
          if (cancelled) return;
          clearTimeout(timer);
          setReady(true);
          setError('');
        });
        instance.on('error', (event) => {
          if (!cancelled && !instance.isStyleLoaded())
            console.warn('Campus map resource unavailable:', 'MapError');
        });
      } catch {
        if (!cancelled)
          setError(
            'The campus map could not start. Room availability is still available in the list.',
          );
      }
    }
    void start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, [light, retry]);

  useEffect(() => {
    if (!ready || !map.current || !markerClass.current) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = libraries.map((library) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-library ${library.available ? 'available' : library.unknown === library.rooms.length ? 'unknown' : 'unavailable'} ${selected === library.id ? 'selected' : ''}`;
      button.setAttribute(
        'aria-label',
        `View ${library.shortName} on map, ${library.available} of ${library.rooms.length} rooms available`,
      );
      button.title = `${library.shortName}: ${library.available}/${library.rooms.length} available`;
      const dot = document.createElement('span');
      dot.className = 'map-dot';
      dot.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'map-label';
      label.textContent = library.shortName;
      button.append(dot, label);
      button.addEventListener('click', () => callback.current(library.id));
      return new markerClass.current!({ element: button, anchor: 'center' })
        .setLngLat(library.coordinates)
        .addTo(map.current!);
    });
  }, [libraries, ready, selected]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const library = libraries.find((l) => l.id === selected);
    map.current.flyTo({
      center: library?.coordinates ?? CENTER,
      zoom: library ? 17 : 15.9,
      pitch: 55,
      bearing: -20,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 900,
    });
    // Only recenter after selection changes, not after live availability refreshes.
  }, [selected, ready]);

  useEffect(() => {
    if (!container.current) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.current?.resize());
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  function locate() {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        map.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 16,
        }),
      () =>
        setLocationError(
          'Location access was unavailable. You can still explore the campus map.',
        ),
      { timeout: 10000 },
    );
  }

  return (
    <section
      className="campus-map"
      aria-label="University Park campus map"
      data-map-provider={provider}
    >
      <div ref={container} className="map-canvas" />
      <div className="map-campus">
        <span />
        UNIVERSITY PARK
      </div>
      <div className="map-extra-controls">
        <button
          aria-label="Show my location"
          title="Show my location"
          onClick={locate}
        >
          <LocateFixed size={18} />
        </button>
        <button
          aria-label="Reset campus view"
          title="Reset campus view"
          onClick={() =>
            map.current?.flyTo({
              center: CENTER,
              zoom: 15.9,
              pitch: 55,
              bearing: -20,
            })
          }
        >
          <RotateCcw size={17} />
        </button>
      </div>
      {!ready && !error && (
        <div className="map-loading" role="status">
          <span className="map-loading-bar" />
          Loading campus map…
        </div>
      )}
      {error && (
        <div className="map-error" role="alert">
          <strong>Map unavailable</strong>
          <p>{error}</p>
          <button onClick={() => setRetry((v) => v + 1)}>Retry map</button>
        </div>
      )}
      {locationError && (
        <button className="location-error" onClick={() => setLocationError('')}>
          {locationError} ×
        </button>
      )}
      <div className="map-legend">
        <span>
          <i className="green-dot" />
          Available
        </span>
        <span>
          <i className="red-dot" />
          No matching availability
        </span>
        <span>
          <i className="gray-dot" />
          Not confirmed
        </span>
      </div>
    </section>
  );
}
