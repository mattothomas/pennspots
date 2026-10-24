import { DateTime } from 'luxon';
import type { Room, Slot } from '../shared/types.ts';
import { ZONE } from './availability.ts';

const ORIGIN = 'https://psu.libcal.com';
const CATALOG_URL = `${ORIGIN}/spaces?lid=428&gid=0`;
const AMENITIES: Record<number, string> = {
  4025: 'Accessible space',
  4026: 'Power outlets',
  5710: 'Desktop PC',
  5711: 'Solstice',
  5713: 'Screen monitor',
  5714: 'Whiteboard',
};

export class SourceError extends Error {
  constructor() {
    super(
      'Penn State availability could not be checked. Please try again in a moment.',
    );
  }
}

export function parseCatalog(html: string): Room[] {
  const rooms: Room[] = [];
  for (const match of html.matchAll(/resources\.push\(\{([\s\S]*?)\}\);/g)) {
    const object = match[1];
    const number = (key: string) =>
      Number(object.match(new RegExp(`^\\s*${key}:\\s*(\\d+)`, 'm'))?.[1]);
    const string = (key: string) => {
      const literal = object.match(
        new RegExp(`^\\s*${key}:\\s*("(?:[^"\\\\]|\\\\.)*")`, 'm'),
      )?.[1];
      return literal ? (JSON.parse(literal) as string) : '';
    };
    const id = number('eid'),
      groupId = number('gid'),
      capacity = number('capacity');
    if (
      number('lid') !== 428 ||
      !Number.isSafeInteger(id) ||
      !Number.isSafeInteger(groupId) ||
      !Number.isSafeInteger(capacity)
    )
      throw new SourceError();
    // Wellness space is outside the first release's study-room scope.
    if (groupId === 49240) continue;
    const filterLiteral =
      object.match(/^\s*filterIds:\s*(\[[\d,\s]*\])/m)?.[1] ?? '[]';
    const filters = JSON.parse(filterLiteral) as number[];
    const name = string('title'),
      library = string('grouping');
    if (!name || !library || capacity < 1) throw new SourceError();
    rooms.push({
      id,
      name,
      library,
      groupId,
      capacity,
      amenities: filters.map((f) => AMENITIES[f]).filter(Boolean),
    });
  }
  if (!rooms.length || new Set(rooms.map((r) => r.id)).size !== rooms.length)
    throw new SourceError();
  return rooms;
}

export function parseSlots(payload: unknown): Slot[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('slots' in payload) ||
    !Array.isArray(payload.slots)
  )
    throw new SourceError();
  return payload.slots.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new SourceError();
    const slot = raw as Record<string, unknown>;
    if (
      !Number.isSafeInteger(slot.itemId) ||
      typeof slot.start !== 'string' ||
      typeof slot.end !== 'string'
    )
      throw new SourceError();
    const start = DateTime.fromSQL(slot.start, { zone: ZONE });
    const end = DateTime.fromSQL(slot.end, { zone: ZONE });
    if (!start.isValid || !end.isValid || end <= start) throw new SourceError();
    const state =
      start.getPossibleOffsets().length > 1 ||
      end.getPossibleOffsets().length > 1
        ? 'unknown'
        : slot.className === undefined ||
            slot.className === null ||
            slot.className === '' ||
            slot.className === 's-lc-eq-avail'
          ? 'free'
          : slot.className === 's-lc-eq-checkout' ||
              slot.className === 's-lc-eq-unavailable'
            ? 'blocked'
            : 'unknown';
    return {
      roomId: slot.itemId as number,
      start: start.toISO()!,
      end: end.toISO()!,
      state,
    };
  });
}

interface Cached<T> {
  value: T;
  checkedAt: string;
  timestamp: number;
}

export function createLibCalClient(fetcher: typeof fetch = fetch) {
  let catalog: Cached<Room[]> | undefined;
  let catalogPending: Promise<Cached<Room[]>> | undefined;
  const calendars = new Map<string, Cached<Slot[]>>();
  const pending = new Map<string, Promise<Cached<Slot[]>>>();

  async function request(
    path: string,
    body?: URLSearchParams,
  ): Promise<string> {
    try {
      const response = await fetcher(`${ORIGIN}${path}`, {
        method: body ? 'POST' : 'GET',
        body,
        redirect: 'error',
        headers: {
          'User-Agent': 'PennSpots/0.1 (University Park study-room discovery)',
          Referer: CATALOG_URL,
          Origin: ORIGIN,
          ...(body
            ? {
                'Content-Type':
                  'application/x-www-form-urlencoded; charset=UTF-8',
              }
            : {}),
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok || !response.body) throw new SourceError();
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 8_000_000) {
          await reader.cancel();
          throw new SourceError();
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch {
      throw new SourceError();
    }
  }

  const entry = <T>(value: T): Cached<T> => ({
    value,
    checkedAt: new Date().toISOString(),
    timestamp: Date.now(),
  });

  async function getCatalog(): Promise<Cached<Room[]>> {
    if (catalog && Date.now() - catalog.timestamp < 3_600_000) return catalog;
    if (!catalogPending) {
      catalogPending = request('/spaces?lid=428&gid=0')
        .then((html) => (catalog = entry(parseCatalog(html))))
        .finally(() => {
          catalogPending = undefined;
        });
    }
    return catalogPending;
  }

  async function getSlots(
    date: string,
    force = false,
  ): Promise<Cached<Slot[]>> {
    const cached = calendars.get(date);
    // A short floor also coalesces simultaneous checkout rechecks.
    if (cached && Date.now() - cached.timestamp < (force ? 3_000 : 30_000))
      return cached;
    if (pending.has(date)) return pending.get(date)!;
    const next = DateTime.fromISO(date, { zone: ZONE })
      .plus({ days: 1 })
      .toISODate()!;
    const promise = request(
      '/spaces/availability/grid',
      new URLSearchParams({
        lid: '428',
        gid: '0',
        eid: '-1',
        seat: '0',
        seatId: '0',
        zone: '0',
        start: date,
        end: next,
        pageIndex: '0',
        pageSize: '10000',
      }),
    )
      .then((text) => {
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new SourceError();
        }
        const result = entry(parseSlots(payload));
        if (calendars.size >= 32)
          calendars.delete(calendars.keys().next().value!);
        calendars.set(date, result);
        return result;
      })
      .finally(() => pending.delete(date));
    pending.set(date, promise);
    return promise;
  }

  return { getCatalog, getSlots };
}

export type LibCalClient = ReturnType<typeof createLibCalClient>;
