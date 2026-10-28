import { useLibrary } from './hooks/useLibrary';
import { toUiTrack, type UiTrack } from './lib/trackAdapter';
import { usePlayback } from './hooks/usePlayback';
import { SpotifyImportModal } from './components/SpotifyImportModal';
import { type SpotifyImportResult } from './lib/spotify-import';
'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownAZ, AudioLines, Bell, Check, ChevronDown, ChevronRight,
  Clock3, Download, FolderOpen, Heart, Home as HomeIcon,
  Library as LibraryIcon, ListMusic, Menu, MoreHorizontal, Music2, Pause, Play, Plus, Radio,
  Repeat2, Search, Settings, Shuffle, SkipBack, SkipForward, SlidersHorizontal,
  Sparkles, Timer, Upload,   Users, Volume2, VolumeOff, Wifi, X, Zap
} from 'lucide-react'

const playlists = [
  { name: 'Late night focus', count: 24, cover: '/artwork/neon-afterglow.png', color: 'violet' },
  { name: 'Soft mornings', count: 18, cover: '/artwork/slow-morning.png', color: 'plum' },
  { name: 'Imported from Spotify', count: 42, cover: '/artwork/soft-circuits.png', color: 'slate' },
]

const rooms = [
  { name: 'Sunday listening club', host: 'Maya', people: 4, status: 'Live', code: 'SUN-42' },
  { name: 'Focus session', host: 'You', people: 2, status: 'Ready', code: 'FOC-18' },
]

type Page = 'home' | 'library' | 'playlists' | 'rooms' | 'settings'

function formatTime(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`
}

function Artwork({ src, size = 'md', alt }: { src: string; size?: 'sm' | 'md' | 'lg'; alt: string }) {
  return <img src={src} alt={alt} className={`artwork artwork-${size}`} />
}

function Sidebar({ page, setPage, onCreate, onJoin }: { page: Page; setPage: (p: Page) => void; onCreate: () => void; onJoin: () => void }) {
  const nav = [
    { id: 'home' as Page, label: 'Home', icon: HomeIcon },
    { id: 'library' as Page, label: 'Your Library', icon: LibraryIcon },
    { id: 'playlists' as Page, label: 'Playlists', icon: ListMusic },
    { id: 'rooms' as Page, label: 'Listening Rooms', icon: Radio },
  ]
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><AudioLines /></div><span>SyncTune</span><span className="beta">BETA</span></div>
      <div className="connection"><span className="status-dot" /> Local server connected <Wifi /></div>
      <nav className="nav" aria-label="Primary navigation">
        <p className="eyebrow">Workspace</p>
        {nav.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${page === id ? 'selected' : ''}`} onClick={() => setPage(id)}>
            <Icon />{label}{id === 'rooms' && <span className="nav-count">2</span>}
          </button>
        ))}
      </nav>
      <div className="nav library-nav">
        <p className="eyebrow">Library</p>
        <button className="nav-item"><Clock3 />Recently played</button>
        <button className="nav-item"><Heart />Liked songs</button>
        <button className="nav-item"><Download />Imported playlists</button>
        <div className="playlist-mini"><Artwork src="/artwork/neon-afterglow.png" alt="Late night focus" size="sm" /><span>Late night focus</span><span>24</span></div>
        <div className="playlist-mini"><Artwork src="/artwork/slow-morning.png" alt="Soft mornings" size="sm" /><span>Soft mornings</span><span>18</span></div>
      </div>
      <div className="sidebar-bottom">
        <button className="secondary-action" onClick={onCreate}><Plus /> New playlist</button>
        <button className="secondary-action" onClick={onJoin}><Users /> Join a room</button>
        <div className="room-mini"><div className="room-mini-top"><span className="status-dot live" /> In a room <MoreHorizontal /></div><strong>Sunday listening club</strong><span>4 listeners · synced</span></div>
        <button className="profile" onClick={() => setPage('settings')}>
          <div className="avatar avatar-you">JD</div><span>Jordan Davis</span><Settings />
        </button>
      </div>
    </aside>
  )
}

function Topbar({ page, onImport, onCreateRoom, onMenu }: { page: Page; onImport: () => void; onCreateRoom: () => void; onMenu: () => void }) {
  const titles: Record<Page, string> = { home: 'Good evening, Jordan', library: 'Your library', playlists: 'Playlists', rooms: 'Listening rooms', settings: 'Settings' }
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={onMenu}><Menu /></button>
      <div className="breadcrumbs"><span>{titles[page]}</span>{page === 'home' && <small>Tuesday, June 24</small>}</div>
      <div className="top-actions">
        <label className="search"><Search /><input placeholder="Search your library" aria-label="Search your library" /><kbd>⌘ K</kbd></label>
        <button className="icon-button" aria-label="Notifications"><Bell /></button>
        {page === 'rooms' ? (
          <button className="button primary" onClick={onCreateRoom}><Plus /> Create room</button>
        ) : (
          <button className="button primary" onClick={onImport}><Upload /> Import music</button>
        )}
      </div>
    </header>
  )
}

function Player({ track, status, currentTime, duration, error, volume, muted, onPlayPause, onPrev, onNext, onStop, onSeek, onVolumeChange, onMuteChange, onQueue, onSleep }: { track: UiTrack | undefined; status: string; currentTime: number; duration: number; error: string | null; volume: number; muted: boolean; onPlayPause: () => void; onPrev: () => void; onNext: () => void; onStop: () => void; onSeek: (seconds: number) => void; onVolumeChange: (value: number) => void; onMuteChange: () => void; onQueue: () => void; onSleep: () => void }) {
  const playing = status === 'playing';
  const hasTrack = Boolean(track);
  const canControl = hasTrack && status !== 'idle' && status !== 'loading';
  const progress = duration ? (currentTime / duration) * 100 : 0;
  return (
    <footer className="player">
      {error && (
        <div className="player-error"><span className="status-dot" /> {error}</div>
      )}
      <div className="now-playing">
        <Artwork src={track?.cover ?? '/artwork/neon-afterglow.png'} alt={track?.title ?? ''} size="sm" />
        <div><strong>{track?.title ?? ''}</strong><span>{track?.artist ?? ''}</span></div>
        <button className="heart-button" aria-label="Like song"><Heart /></button>
      </div>
      <div className="player-center">
        <div className="controls">
          <button aria-label="Shuffle" disabled><Shuffle /></button>
          <button aria-label="Previous" disabled={!canControl} onClick={onPrev}><SkipBack /></button>
          <button className="play-button" disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={onPlayPause}>{playing ? <Pause /> : <Play />}</button>
          <button aria-label="Next" disabled={!canControl} onClick={onNext}><SkipForward /></button>
          <button aria-label="Repeat" disabled><Repeat2 /></button>
          {hasTrack && <button aria-label="Stop" onClick={onStop}><X /></button>}
        </div>
        <div className="progress-row">
          <span>{formatTime(currentTime)}</span>
          <input type="range" min="0" max={duration || 0} value={currentTime} disabled={!duration || status === 'idle'} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Seek" />
          <div className="progress"><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="player-right">
        <button aria-label="Queue" onClick={onQueue}><ListMusic /></button>
        <button aria-label="Sleep timer" onClick={onSleep}><Timer /></button>
        <button aria-label={muted ? 'Unmute' : 'Mute'} onClick={onMuteChange}>{muted ? <VolumeOff /> : <Volume2 />}</button>
        <input type="range" min="0" max="1" step="0.01" value={volume} disabled={!hasTrack || muted} onChange={(e) => onVolumeChange(Number(e.target.value))} aria-label="Volume" />
        <span className="sync-pill"><span className="status-dot live" /> Synced</span>
      </div>
    </footer>
  )
}

function TrackRow({ track, onPlay, active }: { track: UiTrack; onPlay: (t: UiTrack) => void; active: boolean }) {
  return (
    <div className={`track-row ${active ? 'active' : ''}`} onDoubleClick={() => onPlay(track)}>
      <span className="track-index">{active ? <Volume2 /> : track.id.slice(0, 4)}</span>
      <Artwork src={track.cover} alt="" size="sm" />
      <div className="track-name"><strong>{track.title}</strong><span>{track.artist}</span></div>
      <span className="track-album">{track.album}</span>
      <span className="track-added">{track.added}</span>
      <span className="track-duration">{track.duration}</span>
      <button className="row-more" aria-label={`More options for ${track.title}`}><MoreHorizontal /></button>
    </div>
  )
}

function Home({ onPlay, onRooms, tracks }: { onPlay: (t: UiTrack) => void; onRooms: () => void; tracks: UiTrack[] }) {
  return (
    <div className="page-content home-content">
      <section className="continue-card">
        <div>
          <span className="eyebrow accent">Pick up where you left off</span>
          <h1>Continue listening</h1>
          <p>Return to the atmosphere you were in.</p>
          <button className="button light" onClick={() => onPlay(tracks[0])}><Play /> Play now</button>
        </div>
        <Artwork src={tracks[0]?.cover ?? '/artwork/neon-afterglow.png'} alt={tracks[0]?.title ?? 'Neon Afterglow album artwork'} size="lg" />
        <div className="continue-meta">
          <strong>{tracks[0]?.title ?? 'Neon Afterglow'}</strong>
          <span>{tracks[0]?.artist ?? 'Kairo Bloom'} · Afterimage</span>
          <div className="mini-progress"><div /></div>
          <span>1:24 of 3:42</span>
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div><span className="eyebrow">Your rotation</span><h2>Recently played</h2></div>
          <button className="text-button">View all <ChevronRight /></button>
        </div>
        <div className="recent-grid">
          {tracks.slice(0, 4).map((t) => (
            <button className="recent-card" key={t.id} onClick={() => onPlay(t)}>
              <Artwork src={t.cover} alt={t.title} size="md" />
              <span>{t.title}</span>
              <small>{t.artist}</small>
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <div><span className="eyebrow">Curated for you</span><h2>Made for this moment</h2></div>
          <button className="text-button">See all <ChevronRight /></button>
        </div>
        <div className="playlist-grid">
          {playlists.map((p) => (
            <button className="playlist-card" key={p.name}>
              <Artwork src={p.cover} alt={p.name} size="md" />
              <div><strong>{p.name}</strong><span>{p.count} tracks</span></div>
              <Play className="card-play" />
            </button>
          ))}
        </div>
      </section>
      <section className="rooms-section">
        <div className="section-heading">
          <div><span className="eyebrow">Local network</span><h2>Listen together</h2></div>
          <button className="text-button" onClick={onRooms}>All rooms <ChevronRight /></button>
        </div>
        <div className="room-cards">
          {rooms.map((r) => (
            <button className="room-card" key={r.name} onClick={onRooms}>
              <div className="room-icon"><Radio /></div>
              <div className="room-info"><strong>{r.name}</strong><span>{r.people} listeners</span></div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Library({ query, onPlay, tracks, activeTrackId }: { query: string; onPlay: (t: UiTrack) => void; tracks: UiTrack[]; activeTrackId: string | null }) {
  const filtered = useMemo(() => tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(query.toLowerCase())), [query, tracks])
  return (
    <div className="page-content">
      <div className="library-toolbar">
        <div><span className="eyebrow">{tracks.length} tracks · 24.8 MB</span><h1>All music</h1></div>
        <div className="toolbar-actions">
          <button className="button secondary"><FolderOpen /> Import folder</button>
          <button className="button secondary"><Upload /> Add files</button>
          <button className="icon-button"><SlidersHorizontal /></button>
        </div>
      </div>
      <div className="filter-row">
        <button className="filter active">All tracks</button>
        <button className="filter">Albums</button>
        <button className="filter">Artists</button>
        <span className="filter-spacer" />
        <button className="sort"><ArrowDownAZ /> Recently added <ChevronDown /></button>
      </div>
      <div className="track-table">
        <div className="track-header"><span>#</span><span>Title</span><span>Album</span><span>Added</span><span>Duration</span></div>
        {filtered.length ? (
          filtered.map((t) => (
            <TrackRow key={t.id} track={t} onPlay={onPlay} active={t.id === activeTrackId} />
          ))
        ) : (
          <div className="empty-results"><Search /><strong>No tracks found</strong><span>Try a different search term.</span></div>
        )}
      </div>
    </div>
  )
}

function Rooms({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="page-content rooms-page">
      <div className="rooms-hero">
        <div>
          <span className="eyebrow accent">Sync with friends nearby</span>
          <h1>Listening rooms</h1>
          <p>Shared playback over your local network. No cloud room, no audio uploads.</p>
        </div>
        <div className="room-actions">
          <button className="button primary" onClick={onCreate}><Plus /> Create room</button>
          <button className="button secondary" onClick={onJoin}><Radio /> Join with code</button>
        </div>
      </div>
      <div className="room-notice">
        <Wifi />
        <div><strong>Local network only</strong><span>Everyone needs to reach the same self-hosted server and have access to the same playable audio.</span></div>
        <button aria-label="Learn about local rooms"><Sparkles /></button>
      </div>
      <section>
        <div className="section-heading"><div><span className="eyebrow">Your rooms</span><h2>Recent rooms</h2></div></div>
        <div className="room-list">
          {rooms.map((r) => (
            <div className="room-list-card" key={r.name}>
              <div className="room-visual"><Radio /></div>
              <div className="room-info"><strong>{r.name}</strong><span>{r.code} · Hosted by {r.host}</span>
                <div className="people">
                  <div className="avatar avatar-purple">MA</div>
                  <div className="avatar avatar-blue">JD</div>
                  <div className="avatar avatar-gold">+{r.people - 2}</div>
                  <span>{r.people} participants</span>
                </div>
              </div>
              <span className={`room-status ${r.status.toLowerCase()}`}><span className="status-dot" /> {r.status}</span>
              <button className="button secondary">Open room <ChevronRight /></button>
            </div>
          ))}
        </div>
      </section>
      <section className="active-room-preview">
        <div className="preview-art"><Artwork src="/artwork/neon-afterglow.png" alt="Neon Afterglow" size="lg" /><span className="sync-ring"><Zap /></span></div>
        <div>
          <span className="eyebrow accent">Currently active</span>
          <h2>Sunday listening club</h2>
          <p>Neon Afterglow · Kairo Bloom</p>
          <div className="sync-line"><span className="status-dot live" /> In sync <span>+18 ms</span></div>
        </div>
        <button className="button light">Open active room <ChevronRight /></button>
      </section>
    </div>
  )
}

function SettingsPage() {
  return (
    <div className="page-content settings-page">
      <div className="settings-nav">
        <span className="eyebrow">Preferences</span>
        {['Appearance', 'Audio and playback', 'Library folders', 'Sleep timer defaults', 'Local server connection', 'Spotify integration', 'About SyncTune'].map((item, i) => (
          <button className={`settings-nav-item ${i === 0 ? 'selected' : ''}`} key={item}>{item}</button>
        ))}
      </div>
      <div className="settings-main">
        <span className="eyebrow">Preferences</span>
        <h1>Appearance</h1>
        <p className="settings-lede">Make SyncTune feel like yours.</p>
        <div className="settings-card">
          <div><strong>Theme</strong><span>Choose how SyncTune looks on this device.</span></div>
          <div className="theme-options">
            <button className="theme-choice selected"><span className="theme-swatch dark-swatch" /> Dark</button>
            <button className="theme-choice"><span className="theme-swatch light-swatch" /> Light</button>
            <button className="theme-choice"><span className="theme-swatch system-swatch" /> System</button>
          </div>
        </div>
        <div className="settings-card">
          <div><strong>Accent color</strong><span>Used for active controls and highlights.</span></div>
          <div className="accent-options">
            <span className="accent-dot violet" />
            <span className="accent-dot blue" />
            <span className="accent-dot amber" />
            <span className="accent-dot green" />
          </div>
        </div>
        <div className="settings-card server-card">
          <div className="server-icon"><Wifi /></div>
          <div><strong>Local server connection</strong><span>synctune.local:4040</span></div>
          <span className="connected-label"><Check /> Connected</span>
          <button className="button secondary">Test connection</button>
        </div>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div><span className="eyebrow accent">SyncTune</span><h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const library = useLibrary();
  const uiTracks = library.tracks.map(toUiTrack);
  const trackById = useMemo(() => new Map(uiTracks.map((t) => [t.id, t])), [uiTracks]);
  const { state, play, pause, resume, seek, playNext, playPrevious, setVolume, setMuted, stop, setQueue } = usePlayback();
  const [page, setPage] = useState<Page>('home');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<'import' | 'room' | 'join' | 'playlist' | 'sleep' | 'spotify-import' | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  const currentTrack = state.currentTrackId ? trackById.get(state.currentTrackId) ?? undefined : undefined;
  const handlePlay = (t: UiTrack) => {
    const isSame = state.currentTrackId === t.id;
    if (!isSame || state.queue.length === 0) {
      setQueue(uiTracks.map((x) => x.id));
    }
    play(t.id);
  };

  const handleSpotifyImportComplete = (_result: SpotifyImportResult) => {
    setModal(null);
  };

  const onPlayPause = () => {
    if (state.status === 'playing') {
      pause();
    } else if (state.status === 'paused') {
      resume();
    } else if (currentTrack) {
      play(currentTrack.id);
    }
  };

  return (
    <main className="app-shell">
        <Sidebar page={page} setPage={setPage} onCreate={() => setModal('playlist')} onJoin={() => setModal('join')} />
        <div className="main-shell">
          <Topbar page={page} onImport={() => setModal('import')} onCreateRoom={() => setModal('room')} onMenu={() => {}} />
          <div className="global-search">
            <Search />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tracks, artists, albums" />
            <button onClick={() => setQuery('')}> 
            <X /></button>
          </div>
          {page === 'home' && <Home onPlay={handlePlay} onRooms={() => setPage('rooms')} tracks={uiTracks} />}
          {page === 'library' && <Library query={query} onPlay={handlePlay} tracks={uiTracks} activeTrackId={state.currentTrackId} />}
          {page === 'playlists' && (
            <div className="page-content">
              <div className="library-toolbar">
                <div><span className="eyebrow">Your collections</span><h1>Playlists</h1></div>
                <button className="button primary" onClick={() => setModal('playlist')}>
                  <Plus /> New playlist
                </button>
              </div>
              <div className="playlist-grid large">
                {playlists.map((p) => (
                  <button className="playlist-card" key={p.name}>
                    <Artwork src={p.cover} alt={p.name} size="lg" />
                    <div><strong>{p.name}</strong><span>{p.count} tracks · Created by you</span></div>
                    <Play className="card-play" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {page === 'rooms' && <Rooms onCreate={() => setModal('room')} onJoin={() => setModal('join')} />}
          {page === 'settings' && <SettingsPage />}
          <Player
            track={currentTrack}
            status={state.status}
            currentTime={state.currentTime}
            duration={state.duration}
            error={state.error}
            volume={state.volume}
            muted={state.muted}
            onPlayPause={onPlayPause}
            onPrev={playPrevious}
            onNext={playNext}
            onStop={stop}
            onSeek={(seconds) => seek(seconds)}
            onVolumeChange={setVolume}
            onMuteChange={() => setMuted(!state.muted)}
            onQueue={() => setQueueOpen(!queueOpen)}
            onSleep={() => setModal('sleep')}
          />
        </div>
        {queueOpen && (
          <aside className="queue-panel">
            <div className="queue-header">
              <div><span className="eyebrow">Up next</span><h2>Queue</h2></div>
              <button className="icon-button" onClick={() => setQueueOpen(false)}><X /></button>
            </div>
            {state.queue.length === 0 ? (
              <div className="queue-empty"><ListMusic /><span>Queue is empty</span></div>
            ) : (
              state.queue.map((id) => {
                const t = trackById.get(id);
                if (!t) return null;
                const active = id === state.currentTrackId;
                return (
                  <button className={`queue-item ${active ? 'active' : ''}`} key={t.id} onClick={() => play(t.id)}>
                    <Artwork src={t.cover} alt="" size="sm" />
                    <span><strong>{t.title}</strong><small>{t.artist}</small></span>
                    <span>{t.duration}</span>
                  </button>
                );
              })
            )}
          </aside>
        )}
        {modal === 'import' && (
          <Modal title="Import music" onClose={() => setModal(null)}>
            <div className="dropzone"><Upload /><strong>Drop audio files here</strong><span>or choose files from your device</span><button className="button secondary"><FolderOpen /> Choose files</button></div>
            <div className="import-options">
              <button className="import-option"><FolderOpen /><span><strong>Import a folder</strong><small>Scan a folder for supported audio</small></span><ChevronRight /></button>
              <button className="import-option" onClick={() => setModal('spotify-import')}>
                <Music2 /><span><strong>Spotify Playlist</strong><small>Import metadata from Spotify</small></span><ChevronRight /></button>
            </div>
            <p className="modal-note">Spotify integration imports metadata only. SyncTune never downloads audio from Spotify.</p>
          </Modal>
        )}
        {modal === 'room' && (
          <Modal title="Create a listening room" onClose={() => setModal(null)}>
            <p className="modal-copy">Start a shared session on your local network. You'll be the host and control playback for everyone.</p>
            <label className="field"><span>Room name</span><input defaultValue="Sunday listening club" /></label>
            <label className="field"><span>Your display name</span><input defaultValue="Jordan" /></label>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="button primary" onClick={() => setModal(null)}><Radio /> Create room</button>
            </div>
          </Modal>
        )}
        {modal === 'join' && (
          <Modal title="Join with a code" onClose={() => setModal(null)}>
            <p className="modal-copy">Enter the room code shared by your host.</p>
            <label className="field"><span>Room code</span><input className="code-input" placeholder="e.g. SUN-42" /></label>
            <label className="field"><span>Your display name</span><input defaultValue="Jordan" /></label>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="button primary" onClick={() => setModal(null)}><Users /> Join room</button>
            </div>
          </Modal>
        )}
        {modal === 'playlist' && (
          <Modal title="Create a playlist" onClose={() => setModal(null)}>
            <p className="modal-copy">Give your new playlist a name. You can add tracks afterwards.</p>
            <label className="field"><span>Playlist name</span><input autoFocus placeholder="e.g. Sunday reset" /></label>
            <label className="field"><span>Description <small>Optional</small></span><textarea placeholder="What is this playlist for?" /></label>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="button primary" onClick={() => setModal(null)}><Plus /> Create playlist</button>
            </div>
          </Modal>
        )}
        {modal === 'sleep' && (
          <Modal title="Sleep timer" onClose={() => setModal(null)}>
            <p className="modal-copy">Stops playback on this device only. Room playback will continue for everyone else.</p>
            <div className="timer-options">
              {['15 min', '30 min', '45 min', '60 min', 'End of track', 'End of queue'].map((x, i) => (
                <button className={`timer-choice ${i === 1 ? 'selected' : ''}`} key={x}>
                  <Timer /><span>{x}</span>{i === 1 && <Check />}
                </button>
              ))}
            </div>
            <label className="fade-option"><input type="checkbox" defaultChecked /> Gradually fade out volume</label>
            <div className="modal-footer">
              <button className="button secondary" onClick={() => setModal(null)}>Cancel timer</button>
              <button className="button primary" onClick={() => setModal(null)}>Start timer</button>
            </div>
          </Modal>
        )}
        {modal === 'spotify-import' && (
          <SpotifyImportModal
            libraryTracks={library.tracks}
            onImportComplete={handleSpotifyImportComplete}
            onClose={() => setModal(null)}
          />
        )}
      </main>
  )
}
