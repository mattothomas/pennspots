export type RoomStatus = 'available' | 'unavailable' | 'unknown';

export interface Room {
  id: number;
  name: string;
  library: string;
  groupId: number;
  capacity: number;
  amenities: string[];
}

export interface Slot {
  roomId: number;
  start: string;
  end: string;
  state: 'free' | 'blocked' | 'unknown';
}

export interface Selection {
  date: string;
  time: string;
  duration: number;
  start: string;
  end: string;
}

export interface RoomResult extends Room {
  status: RoomStatus;
  reason: string;
  availableUntil?: string;
  nextStart?: string;
  slots: Slot[];
}

export interface SearchResult {
  selection: Selection;
  rooms: RoomResult[];
  checkedAt: string;
  catalogCheckedAt: string;
  timezone: 'America/New_York';
  source: string;
  endTimePreserved: false;
}

export interface BookingLink {
  url: string;
  room: string;
  selection: Selection;
  preserved: ['room', 'date', 'start'];
  endTimePreserved: false;
  notice: string;
}
