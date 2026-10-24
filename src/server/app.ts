import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { DateTime } from 'luxon';
import type { SearchResult, Selection, BookingLink } from '../shared/types.ts';
import {
  evaluateRoom,
  parseSelection,
  roomBookingUrl,
  UserError,
  ZONE,
} from './availability.ts';
import {
  createLibCalClient,
  SourceError,
  type LibCalClient,
} from './libcal.ts';

export function createApp(
  client: LibCalClient = createLibCalClient(),
  now: () => DateTime = () => DateTime.now(),
) {
  const app = new Hono();
  const attempts: number[] = [];
  app.use('/api/*', bodyLimit({ maxSize: 2048 }));
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });

  async function search(
    selection: Selection,
    force = false,
  ): Promise<SearchResult> {
    const firstDate = DateTime.fromISO(selection.start)
      .setZone(ZONE)
      .toISODate()!;
    const lastDate = DateTime.fromISO(selection.end)
      .setZone(ZONE)
      .minus({ milliseconds: 1 })
      .toISODate()!;
    const [catalog, first, last] = await Promise.all([
      client.getCatalog(),
      client.getSlots(firstDate, force),
      firstDate === lastDate
        ? Promise.resolve(undefined)
        : client.getSlots(lastDate, force),
    ]);
    const slots = [...first.value, ...(last?.value ?? [])];
    const unique = [
      ...new Map(
        slots.map((s) => [`${s.roomId}/${s.start}/${s.end}/${s.state}`, s]),
      ).values(),
    ];
    return {
      selection,
      rooms: catalog.value.map((room) =>
        evaluateRoom(room, unique, selection, now()),
      ),
      checkedAt: [first.checkedAt, last?.checkedAt].filter(Boolean).sort()[0]!,
      catalogCheckedAt: catalog.checkedAt,
      timezone: ZONE,
      source: 'https://psu.libcal.com/spaces',
      endTimePreserved: false,
    };
  }

  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/search', async (c) => {
    const selection = parseSelection(c.req.query(), now());
    return c.json(await search(selection));
  });

  app.post('/api/booking-link', async (c) => {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin)
      throw new UserError('Open booking from PennSpots.', 403);
    // Instance-wide guard supplements cache coalescing; distributed rate limits belong at the host on launch.
    const cutoff = Date.now() - 60_000;
    while (attempts.length && attempts[0] < cutoff) attempts.shift();
    if (attempts.length >= 60)
      throw new UserError('Please wait a moment before trying again.', 429);
    let input: Record<string, unknown>;
    try {
      input = await c.req.json();
    } catch {
      throw new UserError('Choose a room and time first.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new UserError('Choose a room and time first.');
    const selection = parseSelection(input, now());
    const roomId = Number(input.roomId);
    if (!Number.isSafeInteger(roomId))
      throw new UserError('Choose a valid room.');
    attempts.push(Date.now());
    const result = await search(selection, true);
    const room = result.rooms.find((r) => r.id === roomId);
    if (!room)
      throw new UserError(
        'That room is not in the University Park study-room catalog.',
        404,
      );
    if (room.status !== 'available')
      throw new UserError(
        'This room is no longer confirmed available for your full time. Refresh and choose another room.',
        409,
      );
    const link: BookingLink = {
      url: roomBookingUrl(room, selection),
      room: room.name,
      selection,
      preserved: ['room', 'date', 'start'],
      endTimePreserved: false,
      notice:
        'Your room and start time are passed to Penn State. Choose your end time there before confirming. A reservation is only complete after Penn State confirms it.',
    };
    return c.json(link);
  });

  app.all('/api/*', (c) =>
    c.json({ error: 'This endpoint does not exist.' }, 404),
  );
  app.onError((error, c) => {
    if (error instanceof UserError)
      return c.json({ error: error.message }, error.status as 400);
    if (error instanceof SourceError)
      return c.json({ error: error.message }, 503);
    console.error('Request failed:', error.name);
    return c.json({ error: 'Something went wrong. Please try again.' }, 500);
  });
  return app;
}
