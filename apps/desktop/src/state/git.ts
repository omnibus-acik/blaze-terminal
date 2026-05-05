import { invoke } from "@tauri-apps/api/core";

export interface GitInfo {
  branch: string;
  head_short: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  stash: number;
  detached: boolean;
}

/** Returns git status for `path`, or null when the path isn't a git repo
 * (or git isn't installed, or the path doesn't exist). */
export const gitInfo = (path: string): Promise<GitInfo | null> =>
  invoke<GitInfo | null>("git_info", { path });

export interface BranchInfo {
  name: string;
  is_current: boolean;
  upstream: string | null;
}

/** Local branches sorted by most-recent committer date. */
export const gitBranches = (path: string): Promise<BranchInfo[]> =>
  invoke<BranchInfo[]>("git_branches", { path });
