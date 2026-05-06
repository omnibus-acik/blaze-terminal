import { invoke } from "@tauri-apps/api/core";

export interface SshHost {
  name: string;
  hostname: string | null;
  user: string | null;
  port: number | null;
  identity_file: string | null;
  source: string;
}

/** Read all non-wildcard hosts from the user's ssh config (and any
 *  `Include`d files). Returns [] when no config exists. */
export const sshHosts = (): Promise<SshHost[]> => invoke<SshHost[]>("ssh_hosts");

/** Render a one-line subtitle like `user@host:port` for the picker. Any
 *  unset field is omitted so the line stays short. */
export function sshSubtitle(h: SshHost): string {
  const host = h.hostname ?? h.name;
  const userPart = h.user ? `${h.user}@` : "";
  const portPart = h.port && h.port !== 22 ? `:${h.port}` : "";
  return `${userPart}${host}${portPart}`;
}
