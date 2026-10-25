import {
  StrictMode,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { DateTime } from 'luxon';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Info,
  LoaderCircle,
  Map as MapIcon,
  MoreHorizontal,
  Navigation,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Sun,
  X,
} from 'lucide-react';
import type {
  BookingLink,
  RoomResult,
  SearchResult,
  Selection,
} from '../shared/types';
import { groupLibraries, type Library } from './libraries';
import { Timeline } from './RoomTimeline';
import '@fontsource-variable/inter';
import './styles.css';
const CampusMap = lazy(() => import('./CampusMap'));
const ZONE = 'America/New_York';
const AMENITIES = [
  'Whiteboard',
  'Screen monitor',
  'Power outlets',
  'Accessible space',
  'Desktop PC',
  'Solstice',
];
const formatTime = (value: string) =>
  DateTime.fromISO(value).setZone(ZONE).toFormat('h:mm a');
const formatDate = (value: string) =>
  DateTime.fromISO(value).setZone(ZONE).toFormat('ccc, LLL d');
function readSaved(key: string): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(ids) ? ids.filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
}
function toggleSaved(key: string, current: number[], id: number) {
  const next = current.includes(id)
    ? current.filter((i) => i !== id)
    : [...current, id];
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  return next;
}
function liveSearch() {
  const now = DateTime.now().setZone(ZONE);
  const slot = now
    .startOf('hour')
    .plus({ minutes: Math.ceil((now.minute + 1) / 15) * 15 });
  return {
    date: slot.toISODate()!,
    time: slot.toFormat('HH:mm'),
    duration: '30',
  };
}
function initialSearch() {
  const p = new URLSearchParams(location.search),
    live = liveSearch();
  return {
    date: p.get('date') || live.date,
    time: p.get('time') || live.time,
    duration: p.get('duration') || live.duration,
  };
}
async function jsonResponse<T>(r: Response): Promise<T> {
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'Please try again.');
  return body;
}

function Dialog({
  title,
  onClose,
  children,
  compact = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-heading"
      className={compact ? 'dialog toolbar-dialog' : 'dialog'}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="dialog-header">
        <h2 id="dialog-heading">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

function BookingDialog({
  room,
  selection,
  onClose,
}: {
  room: RoomResult;
  selection: Selection;
  onClose: () => void;
}) {
  const [error, setError] = useState(''),
    [checking, setChecking] = useState(false);
  async function book() {
    setChecking(true);
    setError('');
    try {
      const link = await jsonResponse<BookingLink>(
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
      const url = new URL(link.url);
      if (
        url.origin !== 'https://psu.libcal.com' ||
        url.pathname !== `/space/${room.id}`
      )
        throw new Error('The booking destination could not be verified.');
      window.location.assign(url.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open booking.');
      setChecking(false);
    }
  }
  return (
    <Dialog title="Continue your reservation" onClose={onClose}>
      <div className="booking-room">
        <span>{room.library}</span>
        <h3>{room.name}</h3>
      </div>
      <dl className="booking-summary">
        <div>
          <dt>Date</dt>
          <dd>{formatDate(selection.start)}</dd>
        </div>
        <div>
          <dt>Your time</dt>
          <dd>
            {formatTime(selection.start)} – {formatTime(selection.end)}
          </dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{selection.duration} minutes</dd>
        </div>
      </dl>
      <div className="booking-notice">
        <Info size={17} />
        <p>
          Your room and start time will be selected on Penn State’s site.{' '}
          <strong>Choose the end time shown above there.</strong> End-time
          transfer is not supported yet. Your reservation is complete only after
          Penn State confirms it.
        </p>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={checking} onClick={book}>
        {checking ? (
          <>
            <LoaderCircle className="spin" size={16} />
            Rechecking availability…
          </>
        ) : (
          <>
            Continue to Penn State
            <ExternalLink size={15} />
          </>
        )}
      </button>
      <p className="dialog-footnote">
        Penn State handles sign-in and confirmation. All times are Eastern.
      </p>
    </Dialog>
  );
}

function RoomRow({
  room,
  selection,
  expanded,
  onExpand,
  saved,
  onSave,
  onBook,
  loading,
}: {
  room: RoomResult;
  selection: Selection;
  expanded: boolean;
  onExpand: () => void;
  saved: boolean;
  onSave: () => void;
  onBook: () => void;
  loading: boolean;
}) {
  return (
    <article className={`room-row ${expanded ? 'expanded' : ''}`}>
      <div className="room-row-top">
        <button
          className="room-row-trigger"
          aria-expanded={expanded}
          aria-controls={`room-${room.id}`}
          onClick={onExpand}
        >
          <span className="room-row-name">
            <strong>{room.name}</strong>
            <span>
              {room.status === 'available'
                ? `Available until ${formatTime(room.availableUntil!)}`
                : room.nextStart
                  ? `Next fit at ${formatTime(room.nextStart)}`
                  : room.status === 'unknown'
                    ? 'Availability not confirmed'
                    : 'Unavailable for your selected time'}
            </span>
          </span>
          <span className={`badge ${room.status}`}>
            {room.status === 'available'
              ? 'Available'
              : room.status === 'unknown'
                ? 'Not listed'
                : 'Unavailable'}
          </span>
          <ChevronDown
            size={15}
            className={expanded ? 'chevron expanded' : 'chevron'}
          />
        </button>
        <button
          className={`icon-button star-button ${saved ? 'is-saved' : ''}`}
          aria-label={`${saved ? 'Remove' : 'Save'} ${room.name} ${saved ? 'from' : 'to'} favorites`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Star size={15} />
        </button>
      </div>
      {expanded && (
        <div className="room-expanded" id={`room-${room.id}`}>
          <div className="room-metadata">
            <span>Seats {room.capacity}</span>
            <span>{selection.duration}-minute stay</span>
          </div>
          <div className="amenities">
            {room.amenities.map((a) => (
              <span key={a}>
                <Check size={11} />
                {a}
              </span>
            ))}
          </div>
          <div className="schedule-heading">
            <Clock3 size={12} />
            <span>{formatDate(selection.start)} · Eastern</span>
          </div>
          <Timeline room={room} selection={selection} />
          <div className="schedule-legend">
            <span>
              <i className="free-key" />
              Listed available
            </span>
            <span>
              <i className="busy-key" />
              Unavailable / not listed
            </span>
          </div>
          {room.status === 'available' ? (
            <button
              className="reserve-button"
              disabled={loading}
              onClick={onBook}
            >
              Reserve this room
              <ExternalLink size={13} />
            </button>
          ) : (
            <p className="room-reason">{room.reason}</p>
          )}
        </div>
      )}
    </article>
  );
}

function App() {
  const [submitted, setSubmitted] = useState(initialSearch),
    [draft, setDraft] = useState(initialSearch);
  const [isLive, setIsLive] = useState(
    () => !new URLSearchParams(location.search).has('date'),
  );
  const [data, setData] = useState<SearchResult | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<number | null>(() => {
    const id = Number(new URLSearchParams(location.search).get('library'));
    return id || null;
  });
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null),
    [query, setQuery] = useState(''),
    [roomQuery, setRoomQuery] = useState('');
  const [panel, setPanel] = useState<
      'time' | 'filters' | 'menu' | 'about' | null
    >(null),
    [booking, setBooking] = useState<RoomResult | null>(null);
  const [people, setPeople] = useState(1),
    [amenities, setAmenities] = useState<string[]>([]),
    [availableOnly, setAvailableOnly] = useState(false),
    [savedOnly, setSavedOnly] = useState(false);
  const [favorites, setFavorites] = useState(() =>
      readSaved('pennspots-favorites'),
    ),
    [libraryFavorites, setLibraryFavorites] = useState(() =>
      readSaved('pennspots-library-favorites'),
    );
  const [light, setLight] = useState(
      () => localStorage.getItem('pennspots-theme') === 'light',
    ),
    [showMap, setShowMap] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return Math.min(
        680,
        Math.max(
          360,
          Number(localStorage.getItem('pennspots-sidebar-width')) || 480,
        ),
      );
    } catch {
      return 480;
    }
  });
  const searchInput = useRef<HTMLInputElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    listOffset = useRef(0),
    drag = useRef<{ x: number; width: number } | null>(null);
  const activeFilters = people > 1 || amenities.length > 0 || availableOnly;
  const today = DateTime.now().setZone(ZONE).toISODate()!,
    maxDate = DateTime.now().setZone(ZONE).plus({ days: 14 }).toISODate()!;

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/search?${new URLSearchParams(submitted)}`, {
      signal: abort.signal,
    })
      .then(jsonResponse<SearchResult>)
      .then((result) => setData(result))
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [submitted, refresh]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden || booking || panel) return;
      if (isLive) setSubmitted(liveSearch());
      else setRefresh((v) => v + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [isLive, booking, panel]);
  useEffect(() => {
    const params = new URLSearchParams(submitted);
    if (selected) params.set('library', String(selected));
    history.replaceState(null, '', `?${params}`);
  }, [submitted, selected]);
  useEffect(() => {
    try {
      localStorage.setItem('pennspots-theme', light ? 'light' : 'dark');
    } catch {}
  }, [light]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const typing = /INPUT|SELECT|TEXTAREA/.test(
        (e.target as HTMLElement)?.tagName,
      );
      if (e.key === '/' && !typing && !panel && !booking) {
        e.preventDefault();
        searchInput.current?.focus();
      }
      if (e.key === 'Escape' && !panel && !booking && selected) goBack();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [selected, panel, booking]);

  const libraries = useMemo(() => groupLibraries(data?.rooms ?? []), [data]);
  const filteredLibraries = useMemo(
    () =>
      groupLibraries(
        (data?.rooms ?? []).filter(
          (r) =>
            r.capacity >= people &&
            amenities.every((a) => r.amenities.includes(a)) &&
            (!availableOnly || r.status === 'available'),
        ),
      ),
    [data, people, amenities, availableOnly],
  );
  const selectedLibrary = libraries.find((l) => l.id === selected);
  const filteredRooms = (
    selected
      ? (filteredLibraries.find((l) => l.id === selected)?.rooms ?? [])
      : (data?.rooms ?? [])
  ).filter(
    (r) =>
      (!savedOnly || favorites.includes(r.id)) &&
      r.capacity >= people &&
      amenities.every((a) => r.amenities.includes(a)) &&
      (!availableOnly || r.status === 'available') &&
      `${r.name} ${r.library}`
        .toLowerCase()
        .includes((selected ? roomQuery : query).toLowerCase()),
  );
  const visibleLibraries = filteredLibraries.filter(
    (l) =>
      (!activeFilters || l.rooms.length > 0) &&
      `${l.name} ${l.building}`.toLowerCase().includes(query.toLowerCase()),
  );
  const isSearch = Boolean(query.trim());
  const sortedRooms = [...filteredRooms].sort(
    (a, b) =>
      (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const selectedAvailable = filteredRooms.filter(
    (r) => r.status === 'available',
  ).length;

  function selectLibrary(id: number) {
    if (!selected) listOffset.current = scroll.current?.scrollTop ?? 0;
    setSelected(id);
    setExpandedRoom(null);
    setRoomQuery('');
    setQuery('');
    setSavedOnly(false);
    scroll.current?.scrollTo({ top: 0 });
  }
  function goBack() {
    setSelected(null);
    setExpandedRoom(null);
    setRoomQuery('');
    requestAnimationFrame(() =>
      scroll.current?.scrollTo({ top: listOffset.current }),
    );
  }
  function resetNow() {
    const next = liveSearch();
    setSubmitted(next);
    setDraft(next);
    setIsLive(true);
    setPanel(null);
  }
  function resize(width: number) {
    const next = Math.min(
      Math.max(360, window.innerWidth - 340),
      760,
      Math.max(360, width),
    );
    setSidebarWidth(next);
    try {
      localStorage.setItem('pennspots-sidebar-width', String(next));
    } catch {}
  }
  function roomRows(rooms: RoomResult[]) {
    return rooms.map((room) => (
      <RoomRow
        key={room.id}
        room={room}
        selection={data!.selection}
        expanded={expandedRoom === room.id}
        onExpand={() =>
          setExpandedRoom((v) => (v === room.id ? null : room.id))
        }
        saved={favorites.includes(room.id)}
        onSave={() =>
          setFavorites((current) =>
            toggleSaved('pennspots-favorites', current, room.id),
          )
        }
        onBook={() => setBooking(room)}
        loading={loading}
      />
    ));
  }
  function libraryRows(rows: Library[]) {
    return rows.map((library) => (
      <button
        className={`library-row ${selected === library.id ? 'active' : ''}`}
        key={library.id}
        aria-label={`View ${library.shortName} details`}
        onClick={() => selectLibrary(library.id)}
      >
        <span>{library.shortName}</span>
        <span
          className={`badge ${library.available ? 'available' : library.unknown === library.rooms.length ? 'unknown' : 'unavailable'}`}
        >
          {library.unknown === library.rooms.length
            ? 'NOT LISTED'
            : `${library.available}/${library.rooms.length}`}
        </span>
        <ChevronRight size={14} />
      </button>
    ));
  }

  return (
    <div
      className={`app-shell ${light ? 'light' : 'dark'} ${showMap ? '' : 'list-only'}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
    >
      <a className="skip-link" href="#library-list">
        Skip to library list
      </a>
      <aside className="sidebar" aria-label="Study room explorer">
        <header className="sidebar-header">
          {selected ? (
            <button
              className="back-button"
              aria-label="Back to libraries"
              onClick={goBack}
            >
              <ArrowLeft size={17} />
              <span>Back</span>
            </button>
          ) : (
            <h1>
              <button
                className="wordmark"
                aria-label="PennSpots home"
                onClick={() => {
                  setQuery('');
                  setSavedOnly(false);
                }}
              >
                <span>Penn</span>Spots
              </button>
            </h1>
          )}
          <label className="search-box">
            <Search size={15} />
            <input
              ref={searchInput}
              aria-label={
                selected ? 'Search rooms' : 'Search libraries and rooms'
              }
              value={selected ? roomQuery : query}
              onChange={(e) =>
                selected
                  ? setRoomQuery(e.target.value)
                  : setQuery(e.target.value)
              }
              placeholder={
                selected ? 'Filter rooms…' : 'Search libraries or rooms'
              }
            />
            {(selected ? roomQuery : query) && (
              <button
                aria-label="Clear search"
                onClick={() => (selected ? setRoomQuery('') : setQuery(''))}
              >
                <X size={13} />
              </button>
            )}
          </label>
          <button
            className={`toolbar-button ${activeFilters ? 'active' : ''}`}
            title="Filters"
            aria-label="Filters"
            onClick={() => setPanel('filters')}
          >
            <SlidersHorizontal size={16} />
            {activeFilters && <i />}
          </button>
          <button
            className={`toolbar-button time-button ${!isLive ? 'active' : ''}`}
            aria-label="Select date and time"
            onClick={() => {
              setDraft(submitted);
              setPanel('time');
            }}
          >
            <CalendarClock size={16} />
            <span>
              {isLive
                ? 'Now'
                : DateTime.fromISO(submitted.date).toFormat('LLL d')}
            </span>
          </button>
          <button
            className="toolbar-button"
            aria-label="Menu"
            onClick={() => setPanel('menu')}
          >
            <MoreHorizontal size={18} />
          </button>
        </header>
        <div className="active-time">
          <Clock3 size={12} />
          <span>
            {data
              ? `${formatDate(data.selection.start)} · ${formatTime(data.selection.start)} – ${formatTime(data.selection.end)}`
              : `${submitted.date} · ${submitted.time}`}{' '}
            <small>ET</small>
          </span>
          {!isLive && (
            <button aria-label="Reset to now" onClick={resetNow}>
              <RotateCcw size={12} />
            </button>
          )}
        </div>
        {loading && (
          <div
            className="fetching-line"
            aria-label="Updating availability"
            role="status"
          />
        )}
        <div
          className="sidebar-scroll"
          ref={scroll}
          id="library-list"
          tabIndex={-1}
        >
          {error && (
            <div className="source-error" role="alert">
              <strong>Availability unavailable</strong>
              <p>{error}</p>
              <button onClick={() => setRefresh((v) => v + 1)}>Retry</button>
            </div>
          )}
          {!data && loading && (
            <div className="library-loading" aria-label="Loading libraries">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <span />
                  <i />
                </div>
              ))}
            </div>
          )}
          {data && selectedLibrary ? (
            <>
              <div className="library-detail-heading">
                <div>
                  <h2>{selectedLibrary.shortName}</h2>
                  <p>{selectedLibrary.building}</p>
                </div>
                <a
                  className="icon-button"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedLibrary.coordinates[1]},${selectedLibrary.coordinates[0]}&travelmode=walking`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Walking directions to ${selectedLibrary.shortName}`}
                >
                  <Navigation size={17} />
                </a>
                <button
                  className={`icon-button star-button ${libraryFavorites.includes(selectedLibrary.id) ? 'is-saved' : ''}`}
                  aria-label={`${libraryFavorites.includes(selectedLibrary.id) ? 'Unsave' : 'Save'} library`}
                  aria-pressed={libraryFavorites.includes(selectedLibrary.id)}
                  onClick={() =>
                    setLibraryFavorites((current) =>
                      toggleSaved(
                        'pennspots-library-favorites',
                        current,
                        selectedLibrary.id,
                      ),
                    )
                  }
                >
                  <Star size={18} />
                </button>
              </div>
              <div className="library-detail-meta">
                <span
                  className={`badge ${selectedAvailable ? 'available' : 'unavailable'}`}
                >
                  {selectedAvailable} of {filteredRooms.length} available
                </span>
                <span>Live LibCal availability</span>
              </div>
              <div
                className="room-tabs"
                role="group"
                aria-label="Room availability"
              >
                <button
                  aria-pressed={!availableOnly}
                  className={!availableOnly ? 'selected' : ''}
                  onClick={() => setAvailableOnly(false)}
                >
                  All rooms <span>{selectedLibrary.rooms.length}</span>
                </button>
                <button
                  aria-pressed={availableOnly}
                  className={availableOnly ? 'selected' : ''}
                  onClick={() => setAvailableOnly(true)}
                >
                  Available <span>{selectedLibrary.available}</span>
                </button>
              </div>
              {roomRows(sortedRooms)}
              {!sortedRooms.length && (
                <div className="empty-state">
                  <strong>No matching rooms</strong>
                  <p>Try another time or adjust your filters.</p>
                </div>
              )}
            </>
          ) : (
            data && (
              <>
                {savedOnly ? (
                  <>
                    <h2 className="section-label">Saved rooms</h2>
                    {roomRows(sortedRooms)}
                    {!sortedRooms.length && (
                      <div className="empty-state">
                        <Star size={20} />
                        <p>Save rooms using the star next to a room.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {!isSearch && libraryFavorites.length > 0 && (
                      <>
                        <h2 className="section-label">Favorites</h2>
                        {libraryRows(
                          filteredLibraries.filter((l) =>
                            libraryFavorites.includes(l.id),
                          ),
                        )}
                      </>
                    )}
                    <h2 className="section-label">
                      {isSearch ? 'Libraries' : 'Library'}
                    </h2>
                    {libraryRows(visibleLibraries)}
                    {isSearch && (
                      <>
                        <h2 className="section-label">Rooms</h2>
                        {roomRows(sortedRooms)}
                      </>
                    )}
                    {!visibleLibraries.length && !sortedRooms.length && (
                      <div className="empty-state">
                        <p>No libraries or rooms match your search.</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          )}
        </div>
        <footer className="sidebar-footer">
          <span className={error ? 'source-state offline' : 'source-state'}>
            <i />
            {loading
              ? 'Updating…'
              : data
                ? `Updated ${DateTime.fromISO(data.checkedAt).setZone(ZONE).toFormat('h:mm a')}`
                : 'Not connected'}
          </span>
          <span>University Park · ET</span>
          <button
            aria-label="About PennSpots"
            onClick={() => setPanel('about')}
          >
            <Info size={14} />
          </button>
        </footer>
      </aside>
      {showMap && (
        <>
          <div
            className="sidebar-resizer"
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={760}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, width: sidebarWidth };
            }}
            onPointerMove={(e) => {
              if (drag.current)
                resize(drag.current.width + e.clientX - drag.current.x);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onDoubleClick={() => resize(480)}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                resize(
                  e.key === 'Home'
                    ? 360
                    : e.key === 'End'
                      ? 760
                      : sidebarWidth + (e.key === 'ArrowRight' ? 16 : -16),
                );
              }
            }}
          />
          <Suspense
            fallback={
              <div className="campus-map map-loading" role="status">
                Loading campus map…
              </div>
            }
          >
            <CampusMap
              libraries={filteredLibraries}
              selected={selected}
              onSelect={selectLibrary}
              light={light}
            />
          </Suspense>
        </>
      )}
      {panel === 'time' && (
        <Dialog compact title="Date & time" onClose={() => setPanel(null)}>
          <form
            className="time-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted({ ...draft });
              setIsLive(false);
              setExpandedRoom(null);
              setPanel(null);
            }}
          >
            <label>
              Date
              <input
                aria-label="Date"
                type="date"
                required
                min={today}
                max={maxDate}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <div className="time-form-row">
              <label>
                Start time
                <input
                  aria-label="Start time"
                  type="time"
                  required
                  step="900"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                />
              </label>
              <label>
                Duration
                <select
                  aria-label="Duration"
                  value={draft.duration}
                  onChange={(e) =>
                    setDraft({ ...draft, duration: e.target.value })
                  }
                >
                  {[15, 30, 45, 60, 90, 120, 150, 180].map((n) => (
                    <option key={n} value={n}>
                      {n} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              All times Eastern. Availability is checked for your full stay.
            </p>
            <button className="primary-button" type="submit">
              Apply date & time
            </button>
            <button className="text-button" type="button" onClick={resetNow}>
              <RotateCcw size={13} />
              Reset to now
            </button>
          </form>
        </Dialog>
      )}
      {panel === 'filters' && (
        <Dialog compact title="Room filters" onClose={() => setPanel(null)}>
          <div className="filter-body">
            <label className="field-label">
              Group size
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
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
              />
              Available for the full time only
            </label>
            <fieldset>
              <legend>Amenities</legend>
              {AMENITIES.map((a) => (
                <label className="checkbox-row" key={a}>
                  <input
                    type="checkbox"
                    checked={amenities.includes(a)}
                    onChange={() =>
                      setAmenities((v) =>
                        v.includes(a) ? v.filter((x) => x !== a) : [...v, a],
                      )
                    }
                  />
                  {a}
                </label>
              ))}
            </fieldset>
            <div className="dialog-actions">
              <button
                className="text-button"
                onClick={() => {
                  setPeople(1);
                  setAvailableOnly(false);
                  setAmenities([]);
                }}
              >
                Clear filters
              </button>
              <button className="primary-button" onClick={() => setPanel(null)}>
                Done
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {panel === 'menu' && (
        <Dialog compact title="PennSpots" onClose={() => setPanel(null)}>
          <div className="menu-items">
            <button
              onClick={() => {
                setSavedOnly((v) => !v);
                setSelected(null);
                setQuery('');
                setPanel(null);
              }}
            >
              <Star size={16} />
              {savedOnly ? 'All libraries' : 'Saved rooms'}
              <span>{favorites.length}</span>
            </button>
            <button
              onClick={() => {
                setShowMap((v) => !v);
                setPanel(null);
              }}
            >
              <MapIcon size={16} />
              {showMap ? 'Hide map' : 'Show map'}
            </button>
            <button
              onClick={() => {
                setLight((v) => !v);
                setPanel(null);
              }}
            >
              <Sun size={16} />
              {light ? 'Dark theme' : 'Light theme'}
            </button>
            <button
              onClick={() => {
                setRefresh((v) => v + 1);
                setPanel(null);
              }}
            >
              <RotateCcw size={16} />
              Refresh availability
            </button>
            <button onClick={() => setPanel('about')}>
              <Info size={16} />
              About & booking notes
            </button>
            <a
              href="https://github.com/mattothomas/pennspots"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              View on GitHub
            </a>
          </div>
        </Dialog>
      )}
      {panel === 'about' && (
        <Dialog title="About PennSpots" onClose={() => setPanel(null)}>
          <div className="about-copy">
            <p>
              Library study rooms at Penn State University Park. An independent
              project, inspired by{' '}
              <a
                href="https://github.com/plon/illinispots"
                target="_blank"
                rel="noreferrer"
              >
                IlliniSpots
              </a>
              .
            </p>
            <ul>
              <li>
                Availability comes from Penn State LibCal and may change before
                you confirm.
              </li>
              <li>
                Listed availability does not guarantee a room is physically
                empty or that you are eligible to reserve it.
              </li>
              <li>
                Booking opens the selected room and start time at Penn State.
                Choose your end time there.
              </li>
              <li>Map markers show library buildings, not individual rooms.</li>
            </ul>
            <p>Not affiliated with Penn State University Libraries.</p>
          </div>
        </Dialog>
      )}
      {booking && data && (
        <BookingDialog
          room={booking}
          selection={data.selection}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
