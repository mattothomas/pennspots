import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { createApp } from './app.ts';
import {
  createLibCalClient,
  SourceError,
  type LibCalClient,
} from './libcal.ts';
import type { Room, Slot } from '../shared/types.ts';

const now = () => DateTime.fromISO('2026-10-24T10:00:00-04:00');
const room: Room = {
  id: 8570,
  name: 'Paterno E304',
  capacity: 16,
  groupId: 2159,
  library: 'Pattee / Paterno Library',
  amenities: [],
};
const slots: Slot[] = [
  {
    roomId: 8570,
    start: '2026-10-25T12:00:00-04:00',
    end: '2026-10-25T14:00:00-04:00',
    state: 'free',
  },
];
const cached = <T>(value: T) => ({
  value,
  timestamp: 0,
  checkedAt: '2026-10-24T14:00:00Z',
});
function mockClient(blocked = false): LibCalClient {
  return {
    getCatalog: async () => cached([room]),
    getSlots: async () =>
      cached(
        blocked
          ? slots.map((s) => ({ ...s, state: 'blocked' as const }))
          : slots,
      ),
  };
}
const body = { roomId: 8570, date: '2026-10-25', time: '12:00', duration: 60 };
const post = (data: unknown = body, origin = 'http://localhost') =>
  new Request('http://localhost/api/booking-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(data),
  });

test('search returns real source timestamps and room status, not an always-passing health claim', async () => {
  const app = createApp(mockClient(), now);
  const response = await app.request(
    '/api/search?date=2026-10-25&time=12:00&duration=60',
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.rooms[0].status, 'available');
  assert.equal(result.checkedAt, '2026-10-24T14:00:00Z');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('booking rechecks the source and openly reports the end-time limitation', async () => {
  let forced = false;
  const client = mockClient();
  const original = client.getSlots;
  client.getSlots = async (date, force) => {
    forced = force === true;
    return original(date, force);
  };
  const response = await createApp(client, now).request(post());
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(forced, true);
  assert.equal(result.endTimePreserved, false);
  assert.match(result.notice, /Choose your end time/);
  assert.equal(new URL(result.url).pathname, '/space/8570');
});

test('booking refuses a room whose availability changed and rejects foreign origins', async () => {
  assert.equal(
    (await createApp(mockClient(true), now).request(post())).status,
    409,
  );
  assert.equal(
    (
      await createApp(mockClient(), now).request(
        post(body, 'https://unrelated.example'),
      )
    ).status,
    403,
  );
  assert.equal(
    (await createApp(mockClient(), now).request(post({ ...body, roomId: 999 })))
      .status,
    404,
  );
  assert.equal(
    (await createApp(mockClient(), now).request(post(null))).status,
    400,
  );
});

test('source outages and invalid dates have different actionable responses', async () => {
  const client = mockClient();
  client.getSlots = async () => {
    throw new SourceError();
  };
  const app = createApp(client, now);
  assert.equal(
    (await app.request('/api/search?date=2026-10-25&time=12:00&duration=60'))
      .status,
    503,
  );
  assert.equal(
    (await app.request('/api/search?date=invalid&time=12:00&duration=60'))
      .status,
    400,
  );
});

test('midnight searches retrieve and merge both calendar dates', async () => {
  const dates: string[] = [];
  const client = mockClient();
  client.getSlots = async (date) => {
    dates.push(date);
    return cached([]);
  };
  await createApp(client, now).request(
    '/api/search?date=2026-10-25&time=23:30&duration=60',
  );
  assert.deepEqual(dates.sort(), ['2026-10-25', '2026-10-26']);
});

test('calendar cache coalesces simultaneous reads and never caches a failed response', async () => {
  let count = 0;
  let fail = true;
  const client = createLibCalClient(async () => {
    count++;
    if (fail) return new Response('upstream unavailable', { status: 503 });
    return Response.json({ slots: [] });
  });
  await assert.rejects(client.getSlots('2026-10-25'));
  fail = false;
  await Promise.all([
    client.getSlots('2026-10-25'),
    client.getSlots('2026-10-25'),
  ]);
  await client.getSlots('2026-10-25');
  assert.equal(count, 2);
});
