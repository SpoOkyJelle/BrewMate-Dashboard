// Kleine helpers rond de Fullscreen-API; stilletjes negeren als de browser het weigert.

export function enterFullscreen(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (req && !document.fullscreenElement) req.call(el)?.catch?.(() => {});
}

export function exitFullscreen(): void {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  if (exit && document.fullscreenElement) exit.call(doc)?.catch?.(() => {});
}
