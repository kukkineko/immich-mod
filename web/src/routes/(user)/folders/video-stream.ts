import type Hls from 'hls.js';

/**
 * Videos are always played from an encoded stream, never from the camera original. The server encodes on the fly
 * (HLS) at several sizes and bitrates; when that is switched off the stored encoded copy is used instead.
 */

export type Quality = {
  /** stable across sessions: height and bitrate */
  key: string;
  label: string;
};

export const AUTO = 'auto';
const STORAGE_KEY = 'video-quality';
const SESSION_ID = /\/video\/stream\/([0-9a-f-]{36})\//;

export const playbackUrl = (assetId: string) => `/api/assets/${assetId}/video/playback`;

let realtime: Promise<boolean> | undefined;
export const realtimeEnabled = () => {
  realtime ??= fetch('/api/server/features')
    .then((response) => (response.ok ? response.json() : {}))
    .then((features: { realtimeTranscoding?: boolean }) => !!features.realtimeTranscoding)
    .catch(() => false);
  return realtime;
};

export const savedQuality = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? AUTO;
  } catch {
    return AUTO;
  }
};

export const saveQuality = (key: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // private mode: the choice just lasts until the page closes
  }
};

const qualityKey = (level: { height: number; bitrate: number }) => `${level.height}-${Math.round(level.bitrate / 1000)}`;

const codecName = (codecs?: string) => {
  const codec = codecs?.split(',')[0] ?? '';
  if (codec.startsWith('av01')) {
    return 'AV1';
  }
  if (codec.startsWith('hvc1') || codec.startsWith('hev1')) {
    return 'HEVC';
  }
  return codec.startsWith('avc1') ? 'H.264' : '';
};

export type VideoStream = {
  qualities: () => Quality[];
  setQuality: (key: string) => void;
  destroy: () => void;
};

type Options = {
  /** a hover/hold preview: the smallest variant, little buffering */
  preview?: boolean;
  onQualities?: (qualities: Quality[]) => void;
  /** nothing could be played from the stream; the caller falls back to the stored encoded copy */
  onFailed: () => void;
};

/** Connects `video` to the encoded stream of an asset. Resolves to undefined when streaming is not possible. */
export const attachStream = async (
  video: HTMLVideoElement,
  assetId: string,
  { preview = false, onQualities, onFailed }: Options,
): Promise<VideoStream | undefined> => {
  if (!(await realtimeEnabled())) {
    return undefined;
  }
  const manifest = `/api/assets/${assetId}/video/stream/main.m3u8`;

  // Safari plays HLS itself and picks the quality on its own
  if (video.canPlayType('application/vnd.apple.mpegurl') && !(globalThis as { MediaSource?: unknown }).MediaSource) {
    video.src = manifest;
    return { qualities: () => [], setQuality: () => undefined, destroy: () => video.removeAttribute('src') };
  }

  const { default: HlsClass } = await import('hls.js');
  if (!HlsClass.isSupported()) {
    return undefined;
  }

  let session: string | undefined;
  const hls: Hls = new HlsClass({
    startLevel: preview ? 0 : -1,
    maxBufferLength: preview ? 6 : 30,
    maxMaxBufferLength: preview ? 10 : 60,
    capLevelToPlayerSize: !preview,
    // a camera clip can take a while to start encoding
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 30_000,
        maxLoadTimeMs: 60_000,
        timeoutRetry: { maxNumRetry: 4, retryDelayMs: 100, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 2, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
      },
    },
  });

  const qualities = (): Quality[] =>
    hls.levels.map((level) => ({
      key: qualityKey(level),
      label: [`${level.height}p`, `${(level.bitrate / 1_000_000).toFixed(1)} Mbit/s`, codecName(level.codecSet)]
        .filter(Boolean)
        .join(' · '),
    }));

  const setQuality = (key: string) => {
    if (key === AUTO) {
      hls.currentLevel = -1;
      return;
    }
    const exact = hls.levels.findIndex((level) => qualityKey(level) === key);
    if (exact >= 0) {
      hls.currentLevel = exact;
      return;
    }
    // a saved choice this video does not offer: the closest size that is not larger
    const wanted = Number.parseInt(key, 10);
    const smaller = hls.levels.map((level, index) => ({ index, height: level.height })).filter((l) => l.height <= wanted);
    hls.currentLevel = smaller.length > 0 ? smaller.toSorted((a, b) => b.height - a.height)[0].index : 0;
  };

  hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
    session = hls.levels[0]?.url[0]?.match(SESSION_ID)?.[1];
    if (preview) {
      hls.currentLevel = 0;
    } else {
      setQuality(savedQuality());
    }
    onQualities?.(qualities());
    void video.play().catch(() => undefined);
  });

  hls.on(HlsClass.Events.ERROR, (_event, data) => {
    if (data.fatal) {
      hls.destroy();
      onFailed();
    }
  });

  hls.loadSource(manifest);
  hls.attachMedia(video);

  return {
    qualities,
    setQuality,
    destroy: () => {
      hls.destroy();
      if (session) {
        // frees the encoder on the server
        void fetch(`/api/assets/${assetId}/video/stream/${session}`, { method: 'DELETE' }).catch(() => undefined);
      }
    },
  };
};
