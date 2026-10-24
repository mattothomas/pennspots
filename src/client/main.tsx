import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DateTime } from 'luxon';
import type {
  BookingLink,
  RoomResult,
  SearchResult,
  Selection,
} from '../shared/types';
import './styles.css';

const ZONE = 'America/New_York';
const LIBRARIES = [
  'All libraries',
  'Pattee / Paterno Library',
  'Architecture and Landscape Architecture Library',
  'Earth and Mineral Sciences Library',
  'Physical and Mathematical Sciences Library',
];
const AMENITIES = [
  'Whiteboard',
  'Screen monitor',
  'Power outlets',
  'Accessible space',
  'Desktop PC',
  'Solstice',
];
const shortLibrary = (name: string) =>
  name
    .replace(
      'Architecture and Landscape Architecture Library',
      'Architecture & Landscape Architecture',
    )
    .replace('Earth and Mineral Sciences Library', 'Earth & Mineral Sciences')
    .replace(
      'Physical and Mathematical Sciences Library',
      'Physical & Mathematical Sciences',
    )
    .replace('Pattee / Paterno Library', 'Pattee & Paterno');
const timeLabel = (value: string) =>
  DateTime.fromISO(value).setZone(ZONE).toFormat('h:mm a');
const dateLabel = (value: string) =>
  DateTime.fromISO(value).setZone(ZONE).toFormat('ccc, LLL d');

function Icon({
  name,
  size = 20,
  ...props
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5" />
      </>
    ),
    book: (
      <>
        <path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    sliders: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="9" cy="18" r="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] ?? paths.book}
    </svg>
  );
}

function initialSearch() {
  const params = new URLSearchParams(window.location.search);
  const now = DateTime.now().setZone(ZONE);
  const rounded = now
    .startOf('hour')
    .plus({ minutes: Math.ceil((now.minute + 1) / 15) * 15 });
  return {
    date: params.get('date') || rounded.toISODate()!,
    time: params.get('time') || rounded.toFormat('HH:mm'),
    duration: params.get('duration') || '60',
  };
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error || 'Please try again in a moment.');
  return payload;
}

function Timeline({
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

function RoomCard({
  room,
  selection,
  favorite,
  onFavorite,
  onOpen,
  disabled,
}: {
  room: RoomResult;
  selection: Selection;
  favorite: boolean;
  onFavorite: () => void;
  onOpen: () => void;
  disabled: boolean;
}) {
  const available = room.status === 'available';
  return (
    <article className={`room-card ${available ? '' : 'not-available'}`}>
      <div className="card-top">
        <span className={`status ${room.status}`}>
          <i />
          {available
            ? 'Available for your time'
            : room.status === 'unknown'
              ? 'Not confirmed'
              : 'Unavailable for your time'}
        </span>
        <button
          className={`icon-button favorite ${favorite ? 'is-favorite' : ''}`}
          aria-label={`${favorite ? 'Remove' : 'Save'} ${room.name}${favorite ? ' from' : ' to'} favorites`}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          <Icon name="heart" size={18} />
        </button>
      </div>
      <p className="room-library">{shortLibrary(room.library)}</p>
      <h3>{room.name}</h3>
      <div className="room-facts">
        <span>
          <Icon name="users" size={16} />
          {room.capacity} people
        </span>
        <span>
          <Icon name="clock" size={16} />
          {selection.duration} min
        </span>
      </div>
      <Timeline room={room} selection={selection} />
      <div className="amenity-tags">
        {room.amenities.slice(0, 3).map((a) => (
          <span key={a}>{a}</span>
        ))}
        {room.amenities.length > 3 && <span>+{room.amenities.length - 3}</span>}
        {!room.amenities.length && (
          <span className="no-amenities">Amenities not listed</span>
        )}
      </div>
      <div className="card-bottom">
        <span className="availability-note">
          {available ? (
            <>
              Free until <strong>{timeLabel(room.availableUntil!)}</strong>
            </>
          ) : room.nextStart ? (
            <>
              Next fit: <strong>{timeLabel(room.nextStart)}</strong>
            </>
          ) : room.status === 'unknown' ? (
            'Check the official schedule'
          ) : (
            'Try another time'
          )}
        </span>
        <button
          className={available ? 'card-action' : 'details-action'}
          onClick={onOpen}
          disabled={disabled}
        >
          {available ? 'View room' : 'Details'}
          <Icon name="arrow" size={17} />
        </button>
      </div>
    </article>
  );
}

function RoomDialog({
  room,
  selection,
  onClose,
}: {
  room: RoomResult;
  selection: Selection;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, []);

  async function book() {
    setChecking(true);
    setError('');
    try {
      const link = await readResponse<BookingLink>(
        await fetch('/api/booking-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: room.id,
            date: selection.date,
            time: selection.time,
            duration: selection.duration,
          }),
        }),
      );
      const destination = new URL(link.url);
      if (
        destination.origin !== 'https://psu.libcal.com' ||
        destination.pathname !== `/space/${room.id}`
      )
        throw new Error('The booking destination could not be verified.');
      window.location.assign(destination.toString());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open booking. Please try again.',
      );
      setChecking(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="room-dialog"
      aria-labelledby="room-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">Your study space</span>
        <button
          className="icon-button"
          aria-label="Close room details"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="room-library">{shortLibrary(room.library)}</p>
      <h2 id="room-dialog-title">{room.name}</h2>
      <div className="room-facts">
        <span>
          <Icon name="users" size={17} />
          Up to {room.capacity} people
        </span>
        <span>
          <Icon name="pin" size={17} />
          University Park
        </span>
      </div>
      <div className="selection-summary">
        <div>
          <span>Date</span>
          <strong>{dateLabel(selection.start)}</strong>
        </div>
        <div>
          <span>Your time</span>
          <strong>
            {timeLabel(selection.start)} – {timeLabel(selection.end)}
          </strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{selection.duration} minutes</strong>
        </div>
      </div>
      <Timeline room={room} selection={selection} />
      <h3 className="dialog-subtitle">In this room</h3>
      <div className="amenity-tags">
        {room.amenities.length ? (
          room.amenities.map((a) => (
            <span key={a}>
              <Icon name="check" size={13} />
              {a}
            </span>
          ))
        ) : (
          <p className="muted small">No amenities listed by Penn State.</p>
        )}
      </div>
      {room.status === 'available' ? (
        <>
          <div className="booking-notice">
            <Icon name="external" size={19} />
            <div>
              <strong>Finish booking with Penn State</strong>
              <p>
                Your room and start time will be selected.{' '}
                <strong>
                  Choose the end time shown above on Penn State’s site.
                </strong>{' '}
                End-time transfer is not supported yet. Your reservation is
                complete only after Penn State confirms it.
              </p>
            </div>
          </div>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button booking-button"
            onClick={book}
            disabled={checking}
          >
            {checking ? 'Rechecking availability…' : 'Continue to Penn State'}
            <Icon name={checking ? 'refresh' : 'external'} size={18} />
          </button>
          <p className="dialog-footnote">
            No reservation is made by opening this dialog. All times are
            Eastern.
          </p>
        </>
      ) : (
        <div className="booking-notice">
          <Icon name="clock" />
          <div>
            <strong>
              {room.status === 'unknown'
                ? 'Availability not confirmed'
                : 'Try a different time'}
            </strong>
            <p>
              {room.reason}
              {room.nextStart &&
                ` The next listed fit starts at ${timeLabel(room.nextStart)}.`}
            </p>
          </div>
        </div>
      )}
    </dialog>
  );
}

function App() {
  const [draft, setDraft] = useState(initialSearch);
  const [submitted, setSubmitted] = useState(initialSearch);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [library, setLibrary] = useState('All libraries');
  const [people, setPeople] = useState(1);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [savedOnly, setSavedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<RoomResult | null>(null);
  const [favorites, setFavorites] = useState<number[]>(() => {
    try {
      const ids = JSON.parse(
        localStorage.getItem('pennspots-favorites') || '[]',
      );
      return Array.isArray(ids) ? ids.filter(Number.isSafeInteger) : [];
    } catch {
      return [];
    }
  });
  const today = DateTime.now().setZone(ZONE).toISODate()!;
  const maxDate = DateTime.now().setZone(ZONE).plus({ days: 14 }).toISODate()!;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSelectedRoom(null);
    fetch(`/api/search?${new URLSearchParams(submitted)}`, {
      signal: controller.signal,
    })
      .then(readResponse<SearchResult>)
      .then((result) => {
        setData(result);
        window.history.replaceState(
          null,
          '',
          `?${new URLSearchParams(submitted)}`,
        );
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [submitted, refreshKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !selectedRoom) setRefreshKey((k) => k + 1);
    }, 30_000);
    return () => clearInterval(timer);
  }, [selectedRoom]);

  function favorite(id: number) {
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((i) => i !== id)
        : [...current, id];
      try {
        localStorage.setItem('pennspots-favorites', JSON.stringify(next));
      } catch {
        /* Private browsing may disable storage. */
      }
      return next;
    });
  }
  function resetFilters() {
    setLibrary('All libraries');
    setPeople(1);
    setAmenities([]);
    setQuery('');
    setSavedOnly(false);
    setAvailableOnly(false);
  }
  const matching = (data?.rooms ?? []).filter(
    (r) =>
      r.capacity >= people &&
      (library === 'All libraries' || r.library === library) &&
      amenities.every((a) => r.amenities.includes(a)) &&
      (!savedOnly || favorites.includes(r.id)) &&
      `${r.name} ${r.library}`.toLowerCase().includes(query.toLowerCase()),
  );
  const available = matching.filter((r) => r.status === 'available').length;
  const rooms = matching
    .filter((r) => !availableOnly || r.status === 'available')
    .sort(
      (a, b) =>
        (a.status === 'available' ? 0 : 1) -
          (b.status === 'available' ? 0 : 1) ||
        a.library.localeCompare(b.library) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  const activeFilterCount =
    (library !== 'All libraries' ? 1 : 0) +
    amenities.length +
    (people > 1 ? 1 : 0);

  return (
    <>
      <a className="skip-link" href="#results">
        Skip to rooms
      </a>
      <header className="topbar">
        <a href="/" className="brand" aria-label="PennSpots home">
          <span className="brand-mark">
            <Icon name="book" size={22} />
          </span>
          Penn<span>Spots</span>
          <i />
        </a>
        <div className="campus-label">
          <Icon name="pin" size={15} />
          University Park
        </div>
        <button
          className={`saved-button ${savedOnly ? 'active' : ''}`}
          aria-pressed={savedOnly}
          onClick={() => setSavedOnly((v) => !v)}
        >
          <Icon name="heart" size={17} />
          <span>Saved rooms</span>
          {favorites.length > 0 && <b>{favorites.length}</b>}
        </button>
      </header>
      <main className="page">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="tiny-dot" />A little less searching. A lot more
              studying.
            </div>
            <h1>
              Your next good
              <br />
              study session <em>starts here.</em>
            </h1>
            <p>Find a room that fits your people, your plans, and your time.</p>
          </div>
          <div className="hero-note">
            <span className="note-icon">
              <Icon name="book" size={27} />
            </span>
            <p>
              Big ideas.
              <br />
              Small study breaks.
              <br />
              <strong>A space for both.</strong>
            </p>
            <span className="note-caption">Made for University Park</span>
          </div>
        </section>
        <form
          className="search-bar"
          aria-label="Find a study room"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted({ ...draft });
          }}
        >
          <label>
            <span>When</span>
            <input
              aria-label="Date"
              type="date"
              min={today}
              max={maxDate}
              required
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label>
            <span>Start time</span>
            <input
              aria-label="Start time"
              type="time"
              step="900"
              required
              value={draft.time}
              onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            />
          </label>
          <label>
            <span>Stay for</span>
            <select
              aria-label="Duration"
              value={draft.duration}
              onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
            >
              {[15, 30, 45, 60, 90, 120, 150, 180].map((n) => (
                <option key={n} value={n}>
                  {n < 60
                    ? `${n} minutes`
                    : n % 60 === 0
                      ? `${n / 60} hour${n > 60 ? 's' : ''}`
                      : `${n / 60} hours`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Your group</span>
            <select
              aria-label="Group size"
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'person' : 'people'}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary-button search-submit"
            type="submit"
            disabled={loading}
          >
            <Icon name="search" size={18} />
            {loading ? 'Checking…' : 'Find a room'}
          </button>
        </form>
        <div className="time-note">
          <Icon name="clock" size={13} />
          All times Eastern · Availability from Penn State LibCal
        </div>
        <div className="workspace">
          <aside
            className={`filters ${filtersOpen ? 'expanded' : ''}`}
            aria-label="Room filters"
          >
            <div className="filter-heading">
              <h2>Make it your space</h2>
              <button onClick={resetFilters}>Reset</button>
            </div>
            <div className="filter-section">
              <label className="filter-label" htmlFor="library">
                Library
              </label>
              <select
                id="library"
                value={library}
                onChange={(e) => setLibrary(e.target.value)}
              >
                {LIBRARIES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </div>
            <fieldset className="filter-section">
              <legend className="filter-label">The little extras</legend>
              {AMENITIES.map((a) => (
                <label className="checkbox-row" key={a}>
                  <input
                    type="checkbox"
                    checked={amenities.includes(a)}
                    onChange={() =>
                      setAmenities((current) =>
                        current.includes(a)
                          ? current.filter((v) => v !== a)
                          : [...current, a],
                      )
                    }
                  />
                  <span>{a}</span>
                </label>
              ))}
            </fieldset>
            <div className="sidebar-note">
              <span>GOOD TO KNOW</span>
              <Icon name="book" size={27} />
              <p>
                A free slot is a good start.
                <br />
                <strong>A confirmed reservation makes it yours.</strong>
              </p>
              <p>Finish booking on Penn State’s site before heading over.</p>
            </div>
          </aside>
          <section
            id="results"
            className="results"
            tabIndex={-1}
            aria-busy={loading}
          >
            <div className="results-heading">
              <div>
                <div className="eyebrow">Find your focus</div>
                <h2>
                  {savedOnly
                    ? 'Your saved spaces'
                    : 'A room for your next chapter'}
                  <span className="heading-dot">.</span>
                </h2>
              </div>
              <button
                className="mobile-filter-button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Icon name="sliders" size={17} />
                Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            </div>
            <div className="results-controls">
              <div
                className="result-tabs"
                role="group"
                aria-label="Availability filter"
              >
                <button
                  aria-pressed={availableOnly}
                  className={availableOnly ? 'selected' : ''}
                  onClick={() => setAvailableOnly(true)}
                >
                  Available <span>{data ? available : '—'}</span>
                </button>
                <button
                  aria-pressed={!availableOnly}
                  className={!availableOnly ? 'selected' : ''}
                  onClick={() => setAvailableOnly(false)}
                >
                  All rooms <span>{data ? matching.length : '—'}</span>
                </button>
              </div>
              <label className="room-search">
                <Icon name="search" size={16} />
                <input
                  aria-label="Search rooms"
                  placeholder="Search a room or library"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="results-meta" aria-live="polite">
              <span>
                {loading ? (
                  'Checking Penn State’s latest availability…'
                ) : data ? (
                  <>
                    {rooms.length} {rooms.length === 1 ? 'space' : 'spaces'} ·{' '}
                    {dateLabel(data.selection.start)} ·{' '}
                    {timeLabel(data.selection.start)} –{' '}
                    {timeLabel(data.selection.end)}
                  </>
                ) : (
                  'Availability is not currently confirmed'
                )}
              </span>
              <button
                className="refresh-button"
                disabled={loading}
                onClick={() => setRefreshKey((k) => k + 1)}
                aria-label="Refresh availability"
              >
                <Icon name="refresh" size={14} />
                {data
                  ? `Checked ${DateTime.fromISO(data.checkedAt).setZone(ZONE).toFormat('h:mm:ss a')}`
                  : 'Retry'}
              </button>
            </div>
            {error && (
              <div className="error-state" role="alert">
                <Icon name="refresh" size={26} />
                <h3>We couldn’t check availability</h3>
                <p>{error}</p>
                <button
                  className="secondary-button"
                  onClick={() => setRefreshKey((k) => k + 1)}
                >
                  Try again
                </button>
              </div>
            )}
            {!data && loading && (
              <div className="room-grid skeletons" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div className="skeleton-card" key={i}>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                ))}
              </div>
            )}
            {data && (
              <div className="room-grid">
                {rooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    selection={data.selection}
                    favorite={favorites.includes(room.id)}
                    onFavorite={() => favorite(room.id)}
                    onOpen={() => setSelectedRoom(room)}
                    disabled={loading}
                  />
                ))}
              </div>
            )}
            {data && !rooms.length && (
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name="search" size={30} />
                </span>
                <h3>
                  {savedOnly
                    ? 'Your saved rooms will feel at home here'
                    : 'Let’s find another opening'}
                </h3>
                <p>
                  {savedOnly && !favorites.length
                    ? 'Tap the heart on a room to keep it handy. Saved rooms stay in this browser.'
                    : availableOnly
                      ? 'No rooms match your full time and filters. Try a shorter stay, another library, or a different time.'
                      : 'No rooms match these filters. Try a different group size, room name, or library.'}
                </p>
                <div>
                  <button className="secondary-button" onClick={resetFilters}>
                    {savedOnly ? 'Explore rooms' : 'Show all rooms'}
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const tomorrow = DateTime.now()
                        .setZone(ZONE)
                        .plus({ days: 1 })
                        .toISODate()!;
                      const next = { ...draft, date: tomorrow, time: '12:00' };
                      setDraft(next);
                      setSubmitted(next);
                    }}
                  >
                    Try tomorrow at noon <Icon name="arrow" size={16} />
                  </button>
                </div>
              </div>
            )}
            {data && (
              <p className="results-disclaimer">
                Availability can change. Listed availability does not guarantee
                a room is physically empty. Penn State confirms reservations and
                eligibility.
              </p>
            )}
          </section>
        </div>
        <footer>
          <a href="/" className="footer-brand">
            PennSpots<span>·</span>
          </a>
          <p>
            An independent student project for University Park.
            <br />
            Not affiliated with Penn State University Libraries.
          </p>
          <a
            href="https://psu.libcal.com/spaces"
            target="_blank"
            rel="noreferrer"
          >
            Official room booking <Icon name="external" size={13} />
          </a>
        </footer>
      </main>
      {selectedRoom && data && (
        <RoomDialog
          room={selectedRoom}
          selection={data.selection}
          onClose={() => setSelectedRoom(null)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
