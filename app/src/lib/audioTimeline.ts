export interface AudioTimeline {
  start: number;
  end: number;
}

/** Resolve the seekable timeline used for progress display and scrubbing. */
export function resolveAudioTimeline(audio: HTMLAudioElement): AudioTimeline {
  const seekable = audio.seekable;
  if (seekable.length > 0) {
    const end = seekable.end(seekable.length - 1);
    const start = seekable.start(0);
    if (Number.isFinite(end) && end > 0 && Number.isFinite(start) && end > start) {
      return { start, end };
    }
  }

  const duration = audio.duration;
  if (Number.isFinite(duration) && duration > 0) {
    return { start: 0, end: duration };
  }

  return { start: 0, end: 0 };
}

export function timelineSpan(timeline: AudioTimeline): number {
  return Math.max(0, timeline.end - timeline.start);
}

export function timelineProgress(currentTime: number, timeline: AudioTimeline): number {
  const span = timelineSpan(timeline);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((currentTime - timeline.start) / span) * 100));
}

export function seekTimeFromRatio(ratio: number, timeline: AudioTimeline): number | null {
  const span = timelineSpan(timeline);
  if (span <= 0) return null;
  const clamped = Math.max(0, Math.min(1, ratio));
  return timeline.start + clamped * span;
}
