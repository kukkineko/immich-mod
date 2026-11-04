import { STORED, type Quality } from './video-stream';

/**
 * What the open video offers, so the viewer's toolbar (which stays reachable on every screen) can show the quality
 * menu while the player itself stays a plain video.
 */
class VideoUi {
  active = $state(false);
  /** a stored encoded copy exists */
  encoded = $state(false);
  /** live-encoded variants, known once the stream is connected */
  qualities = $state<Quality[]>([]);
  /** what is playing: STORED, auto, or a variant key */
  quality = $state(STORED);
  choose: ((key: string) => void) | undefined;
}

export const videoUi = new VideoUi();
