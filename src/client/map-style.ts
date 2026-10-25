import type { StyleSpecification } from 'maplibre-gl';

// OpenMapTiles-compatible style: real vector roads, buildings, water, and labels.
// Used only when a Mapbox public token has not been configured.
export function openMapStyle(light: boolean): StyleSpecification {
  const colors = light
    ? {
        bg: '#e9e9e5',
        park: '#d3ddc9',
        land: '#e2e2d9',
        water: '#a9cad8',
        road: '#ffffff',
        border: '#c4c6bf',
        building: '#b7bdc2',
        text: '#46505d',
        halo: '#f1f1ed',
      }
    : {
        bg: '#1b202b',
        park: '#253830',
        land: '#262b36',
        water: '#182f45',
        road: '#525b6b',
        border: '#303846',
        building: '#565c73',
        text: '#c5cad5',
        halo: '#1a202d',
      };
  return {
    version: 8,
    name: light ? 'PennSpots campus day' : 'PennSpots campus dusk',
    sources: {
      campus: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': colors.bg },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'campus',
        'source-layer': 'landcover',
        paint: { 'fill-color': colors.park, 'fill-opacity': 0.65 },
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'campus',
        'source-layer': 'landuse',
        paint: { 'fill-color': colors.land, 'fill-opacity': 0.75 },
      },
      {
        id: 'parks',
        type: 'fill',
        source: 'campus',
        'source-layer': 'park',
        paint: { 'fill-color': colors.park },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'campus',
        'source-layer': 'water',
        paint: { 'fill-color': colors.water },
      },
      {
        id: 'waterways',
        type: 'line',
        source: 'campus',
        'source-layer': 'waterway',
        paint: { 'line-color': colors.water, 'line-width': 2 },
      },
      {
        id: 'road-casing',
        type: 'line',
        source: 'campus',
        'source-layer': 'transportation',
        filter: ['!=', ['get', 'class'], 'rail'],
        paint: {
          'line-color': colors.border,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            1,
            16,
            7,
            19,
            22,
          ],
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'campus',
        'source-layer': 'transportation',
        filter: ['!=', ['get', 'class'], 'rail'],
        paint: {
          'line-color': colors.road,
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            0.5,
            16,
            4,
            19,
            16,
          ],
        },
      },
      {
        id: 'campus-buildings',
        type: 'fill-extrusion',
        source: 'campus',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': colors.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.86,
        },
      },
      {
        id: 'road-labels',
        type: 'symbol',
        source: 'campus',
        'source-layer': 'transportation_name',
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-angle': 25,
        },
        paint: {
          'text-color': colors.text,
          'text-halo-color': colors.halo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'campus-labels',
        type: 'symbol',
        source: 'campus',
        'source-layer': 'poi',
        minzoom: 15,
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['college', 'school', 'library', 'park']],
        ],
        layout: {
          'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-width': 12,
          'text-padding': 10,
        },
        paint: {
          'text-color': colors.text,
          'text-halo-color': colors.halo,
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}
