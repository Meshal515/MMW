/* ── player ───────────────────────────────────────────────────────────────────
   One transport, two engines behind it.

   `url` and `file` tracks run through a plain <audio> element. `youtube` tracks
   run through YouTube's own IFrame player, parked off-screen so only the sound
   reaches you. The iframe keeps a real size and stays in the layout — a 0×0 or
   display:none player gets throttled — and every play starts from a tap, which
   is what autoplay policy asks for.

   Both engines expose the same handful of methods, so nothing above this file
   needs to know which one is running. */

import { getBlob } from './store.js';

/**
 * Where a track's sound actually comes from, in order of preference.
 *
 * A downloaded copy first, then a direct audio URL, and only then YouTube's
 * embedded player. That order is the whole design: the first two run on a real
 * <audio> element, which keeps playing with the screen off and drives the lock
 * screen, while the YouTube embed does neither. A track carrying both a
 * `youtubeUrl` (for its title and artwork) and an `audioUrl` therefore plays
 * like a normal audio file and merely *looks* like its YouTube page.
 */
export function sourceOf(track) {
  if (!track) return null;
  // A file the listener attached is the recording itself; a downloaded copy is
  // the same bytes as audioUrl, already here; audioUrl streams; and YouTube is
  // the last resort because it is the only one that cannot survive a locked
  // screen. The archive entry keeps its YouTube identity either way.
  if (track.localFile && track.localFile.key) return { engine: 'audio', via: 'blob', value: track.localFile.key };
  if (track.offlineKey) return { engine: 'audio', via: 'blob', value: track.offlineKey };
  if (track.audioUrl) return { engine: 'audio', via: 'url', value: track.audioUrl };
  if (track.videoId) return { engine: 'youtube', via: 'youtube', value: track.videoId };
  if (track.kind === 'youtube' && track.src) return { engine: 'youtube', via: 'youtube', value: track.src };
  if (track.src) return { engine: 'audio', via: 'url', value: track.src };
  return null;
}

/** True when playback survives a locked screen. */
export const playsInBackground = track => {
  const source = sourceOf(track);
  return !!source && source.engine === 'audio';
};

const YT_API = 'https://www.youtube.com/iframe_api';
const TICK_MS = 250;

let ytApi = null;
function loadYouTubeApi() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = YT_API;
    script.async = true;
    script.onerror = () => reject(new Error('yt-api-unreachable'));
    document.head.appendChild(script);
  });
  return ytApi;
}

/**
 * Title, channel and length for a video, without playing it.
 *
 * `cueVideoById` loads the player without starting playback, which is the only
 * way to learn a duration: oEmbed does not carry one. This runs on a player of
 * its own so it can never disturb whatever is currently playing.
 */
let probePlayer = null;
export async function probeYouTube(videoId, mountId, timeout = 15000) {
  const YT = await loadYouTubeApi();
  if (!probePlayer) {
    probePlayer = await new Promise((resolve, reject) => {
      const player = new YT.Player(mountId, {
        host: 'https://www.youtube-nocookie.com',
        width: 200, height: 113,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: { onReady: () => resolve(player), onError: () => reject(new Error('yt-probe')) }
      });
      setTimeout(() => reject(new Error('yt-probe-timeout')), timeout);
    });
  }
  probePlayer.cueVideoById(videoId);
  const started = Date.now();
  // The player reports 0 until the video's data has arrived.
  while (Date.now() - started < timeout) {
    await new Promise(r => setTimeout(r, 220));
    const duration = probePlayer.getDuration ? probePlayer.getDuration() : 0;
    const data = probePlayer.getVideoData ? probePlayer.getVideoData() : null;
    if (duration > 0 && data && data.video_id === videoId) {
      try { probePlayer.stopVideo(); } catch {}
      return { duration: Math.round(duration), title: data.title || '', channel: data.author || '' };
    }
  }
  try { probePlayer.stopVideo(); } catch {}
  return null;
}

export class Player {
  constructor(ytMountId) {
    this.ytMountId = ytMountId;
    this.track = null;
    this.engine = null;          // 'audio' | 'youtube'
    this.objectUrl = null;
    this.listeners = new Map();
    this.rate = 1;
    this.volume = 1;
    this._wantPlay = false;
    this._seq = 0;               // guards against a slow load landing after a newer one

    // One element for the whole session. Replacing it would lose the autoplay
    // permission the first tap granted, and with it every background handover.
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = null;
    this.audio.addEventListener('ended', () => this._finish());
    // Timers are throttled to about once a minute in a backgrounded tab, so a
    // trimmed track must end on the media element's own clock: `timeupdate`
    // comes from the audio pipeline and keeps firing with the screen off.
    this.audio.addEventListener('timeupdate', () => {
      if (this.engine === 'audio') this._checkTrimEnd();
    });
    this.audio.addEventListener('play', () => this.emit('state'));
    this.audio.addEventListener('pause', () => this.emit('state'));
    this.audio.addEventListener('loadedmetadata', () => this.emit('duration'));
    this.audio.addEventListener('error', () => {
      if (this.engine === 'audio' && this.track) this.emit('error', this.audio.error);
    });

    this.yt = null;
    this.ytState = -1;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) { try { fn(payload); } catch (err) { console.error(err); } }
  }

  /* ── state ─────────────────────────────────────────────────────────────── */

  get playing() {
    if (this.engine === 'youtube') return this.ytState === 1 || this.ytState === 3;
    if (this.engine === 'audio') return !this.audio.paused && !this.audio.ended;
    return false;
  }

  get buffering() {
    return this.engine === 'youtube' ? this.ytState === 3 : this.engine === 'audio' && this.audio.readyState < 3;
  }

  get time() {
    if (this.engine === 'youtube') return this.yt && this.yt.getCurrentTime ? this.yt.getCurrentTime() || 0 : 0;
    if (this.engine === 'audio') return this.audio.currentTime || 0;
    return 0;
  }

  /** The playable window, honouring a trim the user set on the track. */
  get start() { return this.track && this.track.start > 0 ? this.track.start : 0; }

  get rawDuration() {
    if (this.engine === 'youtube') return this.yt && this.yt.getDuration ? this.yt.getDuration() || 0 : 0;
    if (this.engine === 'audio') return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    return 0;
  }

  get end() {
    const raw = this.rawDuration;
    const trim = this.track && this.track.end > 0 ? this.track.end : 0;
    if (trim && (!raw || trim < raw)) return trim;
    return raw;
  }

  /** Position and length as the UI should show them: relative to the trim. */
  get position() { return Math.max(0, this.time - this.start); }
  get duration() { return Math.max(0, this.end - this.start); }

  /* ── loading ───────────────────────────────────────────────────────────── */

  async load(track, { autoplay = true } = {}) {
    const seq = ++this._seq;
    this._ended = false;
    this._wantPlay = autoplay;
    this._stopEverything();
    this.track = track;
    this.emit('track', track);
    this.emit('state');

    try {
      const source = sourceOf(track);
      if (!source) throw new Error('no-source');
      if (source.engine === 'youtube') await this._loadYouTube(track, source, seq);
      else await this._loadAudio(track, source, seq);
    } catch (err) {
      if (seq === this._seq) this.emit('error', err);
    }
  }

  async _loadAudio(track, source, seq) {
    let src = source.value;
    if (source.via === 'blob') {
      const blob = await getBlob(source.value);
      if (seq !== this._seq) return;
      if (blob) {
        this.objectUrl = URL.createObjectURL(blob);
        src = this.objectUrl;
      } else if (track.localFile && track.localFile.key === source.value) {
        throw new Error('file-missing');
      } else {
        // The copy is gone but the original link is not; fall back to streaming.
        src = track.audioUrl || track.src;
        if (!src) throw new Error('file-missing');
      }
    }
    if (seq !== this._seq) return;
    this.engine = 'audio';
    this.audio.src = src;
    this.audio.playbackRate = this.rate;
    this.audio.volume = this.volume;
    this.audio.load();
    if (this.start > 0) {
      const seek = () => { try { this.audio.currentTime = this.start; } catch {} };
      this.audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    if (this._wantPlay) this.play();
  }

  async _loadYouTube(track, source, seq) {
    const YT = await loadYouTubeApi();
    if (seq !== this._seq) return;
    this.engine = 'youtube';

    if (!this.yt) {
      this.yt = await new Promise((resolve, reject) => {
        const player = new YT.Player(this.ytMountId, {
          host: 'https://www.youtube-nocookie.com',
          width: 320, height: 180,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1,
                        modestbranding: 1, rel: 0, iv_load_policy: 3, fs: 0 },
          events: {
            onReady: () => resolve(player),
            onError: e => this.emit('error', new Error('yt-' + (e && e.data))),
            onStateChange: e => this._onYtState(e)
          }
        });
        setTimeout(() => reject(new Error('yt-player-timeout')), 20000);
      });
      if (seq !== this._seq) return;
    }

    this.yt.loadVideoById({ videoId: source.value, startSeconds: this.start });
    try { this.yt.setPlaybackRate(this.rate); } catch {}
    try { this.yt.setVolume(Math.round(this.volume * 100)); } catch {}
    if (!this._wantPlay) {
      // loadVideoById always starts playing; cue-on-load is the only way to
      // arrive paused, and it does not survive a rate change, so pause instead.
      const stop = () => { try { this.yt.pauseVideo(); } catch {} };
      setTimeout(stop, 40); setTimeout(stop, 300);
    }
    this.emit('duration');
    // The player knows the real title even when oEmbed did not answer.
    setTimeout(() => {
      if (seq !== this._seq || !this.yt || !this.yt.getVideoData) return;
      const data = this.yt.getVideoData();
      if (data && data.title) this.emit('meta', { title: data.title, author: data.author });
    }, 900);
  }

  /** Fires `ended` exactly once per load, whichever clock noticed first. */
  _finish() {
    if (this._ended) return;
    this._ended = true;
    this.emit('ended');
  }

  /** A trimmed end is ours to enforce; neither engine knows about it. */
  _checkTrimEnd() {
    const limit = this.track && this.track.end > 0 ? this.track.end : 0;
    if (!limit || !this.playing) return false;
    if (this.time >= limit - 0.15) { this._finish(); return true; }
    return false;
  }

  _onYtState(event) {
    // Tearing a video down makes the player report a state change too. Without
    // this guard a stop during load() reads as "ended" and skips a track.
    if (this.engine !== 'youtube') return;
    this.ytState = event.data;
    if (event.data === 0) this._finish();
    if (event.data === 1) this.emit('duration');
    this.emit('state');
  }

  _stopEverything() {
    this.engine = null;
    this.ytState = -1;
    try { this.audio.pause(); } catch {}
    this.audio.removeAttribute('src');
    try { this.audio.load(); } catch {}
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    if (this.yt && this.yt.stopVideo) { try { this.yt.stopVideo(); } catch {} }
  }

  /* ── transport ─────────────────────────────────────────────────────────── */

  play() {
    this._wantPlay = true;
    if (this.engine === 'youtube' && this.yt) { try { this.yt.playVideo(); } catch {} }
    else if (this.engine === 'audio') {
      const p = this.audio.play();
      if (p && p.catch) p.catch(err => { if (err && err.name !== 'AbortError') this.emit('error', err); });
    }
    this.emit('state');
  }

  pause() {
    this._wantPlay = false;
    if (this.engine === 'youtube' && this.yt) { try { this.yt.pauseVideo(); } catch {} }
    else if (this.engine === 'audio') this.audio.pause();
    this.emit('state');
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  /** `offset` is relative to the trim start, matching what the UI displays. */
  seek(offset) {
    const target = this.start + Math.max(0, Math.min(offset, this.duration || offset));
    if (this.engine === 'youtube' && this.yt) { try { this.yt.seekTo(target, true); } catch {} }
    else if (this.engine === 'audio') { try { this.audio.currentTime = target; } catch {} }
    this.emit('time');
  }

  nudge(seconds) { this.seek(this.position + seconds); }

  setRate(rate) {
    this.rate = rate;
    this.audio.playbackRate = rate;
    if (this.yt && this.yt.setPlaybackRate) { try { this.yt.setPlaybackRate(rate); } catch {} }
    this.emit('state');
  }

  setVolume(volume) {
    this.volume = volume;
    this.audio.volume = volume;
    if (this.yt && this.yt.setVolume) { try { this.yt.setVolume(Math.round(volume * 100)); } catch {} }
  }

  stop() {
    this._seq++;
    this._stopEverything();
    this.track = null;
    this.emit('track', null);
    this.emit('state');
  }

  /* Drives the on-screen clock, and the trim cut-off for YouTube — which has no
     media element of its own to listen to. Throttled in the background, which
     is fine: nothing here is needed while the screen is off. */
  _tick() {
    if (!this.track || !this.engine) return;
    if (this.engine === 'youtube' && this._checkTrimEnd()) return;
    if (this.playing || this.engine === 'audio') this.emit('time');
  }
}

/**
 * Lock screen, notification shade and the media keys on a keyboard. Handlers are
 * registered once; the metadata is refreshed whenever the track changes.
 */
export function bindMediaSession(player, handlers) {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const safe = (action, fn) => { try { ms.setActionHandler(action, fn); } catch {} };
  safe('play', () => player.play());
  safe('pause', () => player.pause());
  safe('stop', () => player.stop());
  safe('previoustrack', () => handlers.previous());
  safe('nexttrack', () => handlers.next());
  safe('seekbackward', d => player.nudge(-(d && d.seekOffset ? d.seekOffset : 10)));
  safe('seekforward', d => player.nudge(d && d.seekOffset ? d.seekOffset : 10));
  safe('seekto', d => { if (d && typeof d.seekTime === 'number') player.seek(d.seekTime - player.start); });

  const artwork = track => {
    if (track.thumb) return [{ src: track.thumb, sizes: '480x360', type: 'image/jpeg' }];
    return [192, 512].map(size => ({ src: `./assets/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' }));
  };

  player.on('track', track => {
    if (!track) { ms.metadata = null; ms.playbackState = 'none'; return; }
    try {
      ms.metadata = new MediaMetadata({
        title: track.title || 'تلاوة',
        artist: track.reciter || '',
        album: track.surah || 'تلاوات',
        artwork: artwork(track)
      });
    } catch {}
  });

  player.on('state', () => { ms.playbackState = player.playing ? 'playing' : 'paused'; });

  player.on('time', () => {
    if (!ms.setPositionState) return;
    const duration = player.duration;
    if (!duration || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({
        duration,
        position: Math.min(Math.max(player.position, 0), duration),
        playbackRate: player.rate
      });
    } catch {}
  });
}
