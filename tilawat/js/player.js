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
      if (track.kind === 'youtube') await this._loadYouTube(track, seq);
      else await this._loadAudio(track, seq);
    } catch (err) {
      if (seq === this._seq) this.emit('error', err);
    }
  }

  async _loadAudio(track, seq) {
    let src = track.src;
    // A saved copy always wins over the network: it is the same audio, already here.
    if (track.kind === 'file' || track.blobKey) {
      const blob = await getBlob(track.blobKey || track.src);
      if (seq !== this._seq) return;
      if (!blob) {
        if (track.kind === 'file') throw new Error('file-missing');
      } else {
        this.objectUrl = URL.createObjectURL(blob);
        src = this.objectUrl;
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

  async _loadYouTube(track, seq) {
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

    this.yt.loadVideoById({ videoId: track.src, startSeconds: this.start });
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
