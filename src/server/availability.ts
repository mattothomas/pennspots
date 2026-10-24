import { DateTime } from 'luxon';
import type { RoomResult, Room, Selection, Slot } from '../shared/types.ts';

export const ZONE = 'America/New_York';

export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function parseSelection(
  input: Record<string, unknown>,
  now: DateTime = DateTime.now(),
): Selection {
  const { date, time } = input;
  const duration = Number(input.duration);
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof time !== 'string' ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    throw new UserError('Choose a valid date and start time.');
  }
  const start = DateTime.fromISO(`${date}T${time}`, { zone: ZONE });
  if (
    !start.isValid ||
    start.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}`
  ) {
    throw new UserError('That local time does not exist. Choose another time.');
  }
  if (start.getPossibleOffsets().length > 1)
    throw new UserError(
      'That time occurs twice when clocks change. Choose a time outside the repeated hour.',
    );
  const today = now.setZone(ZONE).startOf('day');
  if (
    start.startOf('day') < today ||
    start.startOf('day') > today.plus({ days: 14 })
  ) {
    throw new UserError('Choose a date from today through the next 14 days.');
  }
  if (
    start.minute % 15 !== 0 ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 180 ||
    duration % 15 !== 0
  ) {
    throw new UserError(
      'Use 15-minute increments, for a duration between 15 minutes and 3 hours.',
    );
  }
  return {
    date,
    time,
    duration,
    start: start.toISO()!,
    end: start.plus({ minutes: duration }).toISO()!,
  };
}

function millis(value: string): number {
  return DateTime.fromISO(value, { zone: ZONE }).toMillis();
}

export function coversInterval(
  slots: Slot[],
  start: number,
  end: number,
): boolean {
  const relevant = slots.filter(
    (s) => millis(s.end) > start && millis(s.start) < end,
  );
  if (relevant.some((s) => s.state !== 'free')) return false;
  let cursor = start;
  for (const slot of relevant) {
    if (millis(slot.start) > cursor) return false;
    cursor = Math.max(cursor, millis(slot.end));
    if (cursor >= end) return true;
  }
  return false;
}

export function evaluateRoom(
  room: Room,
  allSlots: Slot[],
  selection: Selection,
  now: DateTime = DateTime.now(),
): RoomResult {
  const slots = allSlots
    .filter((s) => s.roomId === room.id)
    .sort((a, b) => millis(a.start) - millis(b.start));
  const start = millis(selection.start),
    end = millis(selection.end);
  const base = { ...room, slots };
  if (start < now.toMillis())
    return {
      ...base,
      status: 'unavailable',
      reason: 'The selected start time has passed.',
    };
  if (!slots.length)
    return {
      ...base,
      status: 'unknown',
      reason: 'No booking times listed for this room on this date.',
    };
  const unknown = slots.some(
    (s) =>
      s.state === 'unknown' && millis(s.end) > start && millis(s.start) < end,
  );
  if (unknown)
    return {
      ...base,
      status: 'unknown',
      reason: 'Penn State returned a slot status we could not confirm.',
    };
  if (coversInterval(slots, start, end)) {
    let until = end;
    for (const slot of slots) {
      if (
        slot.state === 'free' &&
        millis(slot.start) <= until &&
        millis(slot.end) > until
      )
        until = millis(slot.end);
      else if (millis(slot.start) >= until && slot.state !== 'free') break;
    }
    return {
      ...base,
      status: 'available',
      reason: 'Listed as available for your full time.',
      availableUntil: DateTime.fromMillis(until, { zone: ZONE }).toISO()!,
    };
  }
  const next = slots.find(
    (s) =>
      s.state === 'free' &&
      millis(s.start) > start &&
      coversInterval(
        slots,
        millis(s.start),
        millis(s.start) + selection.duration * 60_000,
      ),
  );
  const blocked = slots.some(
    (s) =>
      s.state === 'blocked' && millis(s.end) > start && millis(s.start) < end,
  );
  return {
    ...base,
    status: 'unavailable',
    reason: blocked
      ? 'Unavailable for part or all of your time.'
      : 'Your full time is outside the listed available intervals.',
    nextStart: next?.start,
  };
}

export function roomBookingUrl(room: Room, selection: Selection): string {
  // Verified room/start deep link. There is no verified end-time parameter.
  const url = new URL(`/space/${room.id}`, 'https://psu.libcal.com');
  url.searchParams.set(
    'date',
    DateTime.fromISO(selection.start)
      .setZone(ZONE)
      .toFormat('yyyy-MM-dd HH:mm:ss'),
  );
  return url.toString();
}
