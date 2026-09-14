/* ── player ─────────────────────────────────────────────────────────────────
   One catalogue track, multiple possible playback sources. Priority:
   IndexedDB/local copy → direct audio URL → YouTube fallback.
   Direct/local audio use one long-lived <audio> element so lock-screen and
   background playback survive track handovers. */

import { getBlob } from './store.js';

const YT_API = 'https://www.youtube.com/iframe_api';
const TICK_MS = 300;

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
    this.engine = null;          // audio | youtube
    this.source = null;          // local | direct | youtube
    this.objectUrl = null;
    this.listeners = new Map();
    this.rate = 1;
    this.volume = 1;
    this._wantPlay = false;
    this._seq = 0;
    this._ended = false;
    this._resumeAt = 0;

    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = null;
    this.audio.addEventListener('ended', () => this._finish());
    this.audio.addEventListener('timeupdate', () => {
      if (this.engine !== 'audio') return;
      this._checkTrimEnd();
      this.emit('time');
    });
    this.audio.addEventListener('play', () => this.emit('state'));
    this.audio.addEventListener('pause', () => this.emit('state'));
    this.audio.addEventListener('loadedmetadata', () => this.emit('duration'));
    this.audio.addEventListener('error', () => {
      if (this.engine !== 'audio' || !this.track) return;
      // A dead direct mirror must not kill a recitation that still has its
      // YouTube reference. Fall back automatically; local blob failures are
      // surfaced because they usually indicate damaged device storage.
      if (this.source === 'direct' && this.track.youtubeId) {
        const seq = ++this._seq;
        try { this.audio.pause(); } catch {}
        this.audio.removeAttribute('src');
        try { this.audio.load(); } catch {}
        this._loadYouTube(this.track.youtubeId, seq).catch(err => { if (seq === this._seq) this.emit('error', err); });
        return;
      }
      this.emit('error', this.audio.error || new Error('audio-error'));
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
  get position() { return Math.max(0, this.time - this.start); }
  get duration() { return Math.max(0, this.end - this.start); }
  get backgroundCapable() { return this.engine === 'audio'; }

  async load(track, { autoplay = true, resume = true } = {}) {
    const seq = ++this._seq;
    this._ended = false;
    this._wantPlay = autoplay;
    this._stopEverything();
    this.track = track;
    this._resumeAt = resume && track.lastPosition > 8 ? track.lastPosition : 0;
    this.emit('track', track);
    this.emit('state');

    try {
      // A local key is a preference, not a single point of failure. Missing
      // IndexedDB data falls through to the network sources automatically.
      if (track.localAudioKey) {
        const blob = await getBlob(track.localAudioKey).catch(() => null);
        if (seq !== this._seq) return;
        if (blob) {
          this.objectUrl = URL.createObjectURL(blob);
          await this._loadAudio(this.objectUrl, 'local', seq);
          return;
        }
      }
      if (track.audioUrl) {
        await this._loadAudio(track.audioUrl, 'direct', seq);
        return;
      }
      if (track.youtubeId) {
        await this._loadYouTube(track.youtubeId, seq);
        return;
      }
      throw new Error('no-source');
    } catch (err) {
      if (seq === this._seq) this.emit('error', err);
    }
  }

  async _loadAudio(src, source, seq) {
    if (seq !== this._seq) return;
    this.engine = 'audio';
    this.source = source;
    this.audio.src = src;
    this.audio.playbackRate = this.rate;
    this.audio.volume = this.volume;
    this.audio.load();
    const desired = this._resumeAt > this.start ? this._resumeAt : this.start;
    if (desired > 0) {
      const seek = () => {
        try {
          const max = this.end || this.rawDuration || desired;
          this.audio.currentTime = Math.min(desired, Math.max(this.start, max - 1));
        } catch {}
      };
      this.audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    this.emit('source', { source: this.source, backgroundCapable: true });
    if (this._wantPlay) this.play();
  }

  async _loadYouTube(videoId, seq) {
    const YT = await loadYouTubeApi();
    if (seq !== this._seq) return;
    this.engine = 'youtube';
    this.source = 'youtube';
    this.emit('source', { source: this.source, backgroundCapable: false });

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

    const resume = this._resumeAt > this.start ? this._resumeAt : this.start;
    this.yt.loadVideoById({ videoId, startSeconds: resume });
    try { this.yt.setPlaybackRate(this.rate); } catch {}
    try { this.yt.setVolume(Math.round(this.volume * 100)); } catch {}
    if (!this._wantPlay) {
      const stop = () => { try { this.yt.pauseVideo(); } catch {} };
      setTimeout(stop, 60); setTimeout(stop, 320);
    }
    this.emit('duration');
    setTimeout(() => {
      if (seq !== this._seq || !this.yt || !this.yt.getVideoData) return;
      const data = this.yt.getVideoData();
      if (data && data.title) this.emit('meta', { title: data.title, author: data.author });
    }, 900);
  }

  _finish() {
    if (this._ended) return;
    this._ended = true;
    this.emit('ended');
  }
  _checkTrimEnd() {
    const limit = this.track && this.track.end > 0 ? this.track.end : 0;
    if (!limit || !this.playing) return false;
    if (this.time >= limit - 0.15) { this._finish(); return true; }
    return false;
  }
  _onYtState(event) {
    if (this.engine !== 'youtube') return;
    this.ytState = event.data;
    if (event.data === 0) this._finish();
    if (event.data === 1) this.emit('duration');
    this.emit('state');
  }
  _stopEverything() {
    this.engine = null;
    this.source = null;
    this.ytState = -1;
    try { this.audio.pause(); } catch {}
    this.audio.removeAttribute('src');
    try { this.audio.load(); } catch {}
    if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
    if (this.yt && this.yt.stopVideo) { try { this.yt.stopVideo(); } catch {} }
  }

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
  _tick() {
    if (!this.track || !this.engine) return;
    if (this.engine === 'youtube' && this._checkTrimEnd()) return;
    if (this.engine === 'youtube' && this.playing) this.emit('time');
  }
}

export function bindMediaSession(player, handlers, artworkResolver) {
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

  player.on('track', track => {
    if (!track) { ms.metadata = null; ms.playbackState = 'none'; return; }
    const resolved = artworkResolver ? artworkResolver(track) : (track.cover || track.thumb || './assets/icon-512.png');
    const artwork = resolved ? [{ src: resolved }] : [];
    try {
      ms.metadata = new MediaMetadata({
        title: track.title || 'تلاوة',
        artist: track.reciter || '',
        album: [track.surah, track.year].filter(Boolean).join(' · ') || track.collection || 'تلاوات',
        artwork
      });
    } catch {}
  });
  player.on('state', () => { ms.playbackState = player.playing ? 'playing' : 'paused'; });
  player.on('time', () => {
    if (!ms.setPositionState) return;
    const duration = player.duration;
    if (!duration || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({ duration, position: Math.min(Math.max(player.position, 0), duration), playbackRate: player.rate });
    } catch {}
  });
}
