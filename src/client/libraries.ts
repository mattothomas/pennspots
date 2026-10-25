import type { RoomResult } from '../shared/types';

export interface Library {
  id: number;
  name: string;
  shortName: string;
  building: string;
  address: string;
  coordinates: [number, number];
  rooms: RoomResult[];
  available: number;
  unknown: number;
}

// Building centers, not individual room positions. See docs/frontend-redesign.md.
export const CAMPUS_LIBRARIES = [
  {
    id: 2159,
    name: 'Pattee / Paterno Library',
    shortName: 'Pattee & Paterno Library',
    building: 'Pattee and Paterno Libraries',
    address: 'University Park, PA',
    coordinates: [-77.86578, 40.79813],
  },
  {
    id: 2154,
    name: 'Architecture and Landscape Architecture Library',
    shortName: 'Architecture & Landscape Architecture',
    building: 'Stuckeman Family Building',
    address: 'University Park, PA',
    coordinates: [-77.8667354, 40.8010877],
  },
  {
    id: 2157,
    name: 'Earth and Mineral Sciences Library',
    shortName: 'Earth & Mineral Sciences Library',
    building: 'Deike Building',
    address: 'University Park, PA',
    coordinates: [-77.8654394, 40.7942302],
  },
  {
    id: 876,
    name: 'Physical and Mathematical Sciences Library',
    shortName: 'Physical & Mathematical Sciences',
    building: 'Davey Laboratory',
    address: 'University Park, PA',
    coordinates: [-77.8628638, 40.79817],
  },
] satisfies Omit<Library, 'rooms' | 'available' | 'unknown'>[];

export function groupLibraries(rooms: RoomResult[]): Library[] {
  return CAMPUS_LIBRARIES.map((library) => {
    const matching = rooms.filter((room) => room.groupId === library.id);
    return {
      ...library,
      rooms: matching,
      available: matching.filter((room) => room.status === 'available').length,
      unknown: matching.filter((room) => room.status === 'unknown').length,
    };
  });
}
