import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import type { Room, Slot } from '../shared/types.ts';
import {
  evaluateRoom,
  parseSelection,
  roomBookingUrl,
  ZONE,
} from './availability.ts';
import { parseCatalog, parseSlots } from './libcal.ts';

const now = DateTime.fromISO('2026-10-24T10:00:00', { zone: ZONE });
const room: Room = {
  id: 8570,
  name: 'Paterno E304',
  capacity: 16,
  groupId: 2159,
  library: 'Pattee / Paterno Library',
  amenities: ['Whiteboard'],
};
const selection = parseSelection(
  { date: '2026-10-25', time: '12:00', duration: 60 },
  now,
);
const slot = (
  start: string,
  end: string,
  state: Slot['state'] = 'free',
): Slot => ({
  roomId: room.id,
  start: `2026-10-25T${start}:00-04:00`,
  end: `2026-10-25T${end}:00-04:00`,
  state,
});

test('a room must cover the entire requested interval, including adjacent slots', () => {
  const slots = [slot('12:30', '13:30'), slot('12:00', '12:30')];
  assert.equal(evaluateRoom(room, slots, selection, now).status, 'available');
  assert.match(
    evaluateRoom(room, slots, selection, now).availableUntil!,
    /13:30/,
  );
  assert.equal(
    evaluateRoom(room, [slot('12:00', '12:30')], selection, now).status,
    'unavailable',
  );
});

test('gaps and reservations prevent availability; a later interval can fit', () => {
  const gap = [slot('12:00', '12:15'), slot('12:30', '14:00')];
  const result = evaluateRoom(room, gap, selection, now);
  assert.equal(result.status, 'unavailable');
  assert.match(result.nextStart!, /12:30/);
  assert.equal(
    evaluateRoom(
      room,
      [slot('12:00', '13:30'), slot('12:30', '12:45', 'blocked')],
      selection,
      now,
    ).status,
    'unavailable',
  );
});

test('missing data, unfamiliar slot states, and past start times never appear available', () => {
  assert.equal(evaluateRoom(room, [], selection, now).status, 'unknown');
  assert.equal(
    evaluateRoom(room, [slot('12:00', '13:00', 'unknown')], selection, now)
      .status,
    'unknown',
  );
  assert.equal(
    evaluateRoom(
      room,
      [slot('12:00', '13:00')],
      selection,
      now.plus({ days: 2 }),
    ).status,
    'unavailable',
  );
});

test('a reservation starting exactly at the selected end does not overlap', () => {
  assert.equal(
    evaluateRoom(
      room,
      [slot('12:00', '13:00'), slot('13:00', '14:00', 'blocked')],
      selection,
      now,
    ).status,
    'available',
  );
});

test('selection validation uses Eastern time, supported dates, and valid quarter-hour durations', () => {
  assert.match(selection.start, /12:00:00\.000-04:00$/);
  for (const input of [
    { date: '2026-10-23', time: '12:00', duration: 60 },
    { date: '2026-11-08', time: '12:00', duration: 60 },
    { date: '2026-10-25', time: '25:00', duration: 60 },
    { date: '2026-10-25', time: '12:01', duration: 60 },
    { date: '2026-10-25', time: '12:00', duration: 195 },
    { date: '2026-02-30', time: '12:00', duration: 60 },
  ])
    assert.throws(() => parseSelection(input, now));
});

test('clock changes cannot silently shift or ambiguously select a time', () => {
  assert.throws(() =>
    parseSelection(
      { date: '2026-03-08', time: '02:30', duration: 60 },
      DateTime.fromISO('2026-03-07', { zone: ZONE }),
    ),
  );
  assert.throws(() =>
    parseSelection({ date: '2026-11-01', time: '01:30', duration: 60 }, now),
  );
  const midnight = parseSelection(
    { date: '2026-10-25', time: '23:30', duration: 60 },
    now,
  );
  assert.match(midnight.end, /2026-10-26T00:30/);
});

test('booking links target the selected room/start and never pretend an end time is transferred', () => {
  const url = new URL(roomBookingUrl(room, selection));
  assert.equal(url.origin, 'https://psu.libcal.com');
  assert.equal(url.pathname, '/space/8570');
  assert.equal(url.searchParams.get('date'), '2026-10-25 12:00:00');
  assert.equal(url.searchParams.has('end'), false);
  assert.equal(url.searchParams.has('token'), false);
});

test('public source parsing preserves states and rejects malformed payloads', () => {
  const parsed = parseSlots({
    slots: [
      {
        itemId: 8570,
        start: '2026-10-25 12:00:00',
        end: '2026-10-25 12:15:00',
      },
      {
        itemId: 8570,
        start: '2026-10-25 12:15:00',
        end: '2026-10-25 12:30:00',
        className: 's-lc-eq-checkout',
      },
      {
        itemId: 8570,
        start: '2026-10-25 12:30:00',
        end: '2026-10-25 12:45:00',
        className: 'future-unknown-status',
      },
    ],
  });
  assert.deepEqual(
    parsed.map((s) => s.state),
    ['free', 'blocked', 'unknown'],
  );
  assert.throws(() =>
    parseSlots({ slots: [{ itemId: 8570, start: 'bad', end: 'bad' }] }),
  );
  assert.throws(() => parseSlots({ error: 'Source error' }));
});

test('catalog parser decodes official metadata and excludes wellness spaces without executing JavaScript', () => {
  const resource = (id: number, gid: number) =>
    `resources.push({\n eid: ${id},\n gid: ${gid},\n lid: 428,\n capacity: 4,\n title: "Paterno\\u0020E128A",\n grouping: "Pattee / Paterno Library",\n filterIds: [4026,5714],\n});`;
  const parsed = parseCatalog(resource(30978, 2159) + resource(999, 49240));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Paterno E128A');
  assert.deepEqual(parsed[0].amenities, ['Power outlets', 'Whiteboard']);
  assert.throws(() => parseCatalog(resource(30978, 2159).repeat(2)));
  assert.throws(() => parseCatalog('<html>Service unavailable</html>'));
});
