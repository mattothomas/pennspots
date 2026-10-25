import { DateTime } from 'luxon';
import type { RoomResult, Selection } from '../shared/types';
const ZONE = 'America/New_York';

export function Timeline({
  room,
  selection,
}: {
  room: RoomResult;
  selection: Selection;
}) {
  if (!room.slots.length)
    return (
      <p className="muted small">No booking times listed for this date.</p>
    );
  const start = DateTime.fromISO(selection.start).setZone(ZONE);
  const viewStart = start.minus({ hours: 1 }).startOf('hour');
  const selectedStart = start.toMillis(),
    selectedEnd = DateTime.fromISO(selection.end).toMillis();
  const segments = Array.from({ length: 24 }, (_, i) => {
    const point = viewStart.plus({ minutes: i * 15 });
    const end = point.plus({ minutes: 15 });
    const overlapping = room.slots.filter(
      (s) => DateTime.fromISO(s.start) < end && DateTime.fromISO(s.end) > point,
    );
    const slot = overlapping.find((s) => s.state !== 'free') ?? overlapping[0];
    const state = slot?.state ?? 'unlisted';
    const selected =
      point.toMillis() < selectedEnd && end.toMillis() > selectedStart;
    return (
      <span
        key={i}
        className={`timeline-slot ${state} ${selected ? 'selected' : ''}`}
        title={`${point.toFormat('h:mm a')}: ${state === 'free' ? 'listed available' : state === 'blocked' ? 'unavailable' : 'not confirmed'}`}
      />
    );
  });
  return (
    <div
      className="timeline"
      aria-label="Six-hour room schedule. Green means listed available, gray means unavailable; outlined slots show your selected time."
    >
      <div className="timeline-track">{segments}</div>
      <div className="timeline-labels">
        {[0, 2, 4, 6].map((hour) => (
          <span key={hour}>
            {viewStart.plus({ hours: hour }).toFormat('ha').toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
