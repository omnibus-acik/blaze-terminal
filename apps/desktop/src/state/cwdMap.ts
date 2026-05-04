// Module-singleton map of paneId → last-known cwd, populated from the
// `pty:<id>:block` event stream (specifically the OSC 7331;cwd events
// emitted by our shell-integration snippet on every prompt).
//
// Used by drag-drop pane-to-pane transfer to resolve source relative paths
// and choose a destination directory.

const cwdByPane = new Map<string, string>();

export function setCwd(paneId: string, cwd: string): void {
  cwdByPane.set(paneId, cwd);
}

export function getCwd(paneId: string): string | null {
  return cwdByPane.get(paneId) ?? null;
}

export function clearCwd(paneId: string): void {
  cwdByPane.delete(paneId);
}
