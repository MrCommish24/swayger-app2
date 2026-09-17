export type FocusStatus = "saving" | "saved" | "error" | undefined;

export function weeklyPlayMode(swaygerRunEnabled: boolean) {
  return swaygerRunEnabled ? "focused" : "legacy";
}

export function firstUnanswered(ids: string[], confirmed: Record<string, string>) {
  const index = ids.findIndex((id) => !confirmed[id]);
  return index < 0 ? Math.max(0, ids.length - 1) : index;
}

export function nextUnanswered(ids: string[], confirmed: Record<string, string>, from: number) {
  for (let offset = 1; offset <= ids.length; offset += 1) {
    const index = (from + offset) % ids.length;
    if (!confirmed[ids[index]]) return index;
  }
  return from;
}

export function progressState(id: string, confirmed: Record<string, string>, status: FocusStatus, active: boolean) {
  return { completed: Boolean(confirmed[id]), active, status: status ?? "unanswered" };
}

export function shouldAutoAdvance(opts: { newlyConfirmed: boolean; wasAnswered: boolean; activeId: string; confirmedId: string; reducedMotion: boolean; failed: boolean; manuallyNavigated: boolean; final: boolean }) {
  return opts.newlyConfirmed && !opts.wasAnswered && opts.activeId === opts.confirmedId && !opts.reducedMotion && !opts.failed && !opts.manuallyNavigated && !opts.final;
}