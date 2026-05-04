// Runbook variable extraction + substitution.
//
// Syntax: `{{name}}` or `{{secret:name}}`. Names are alnum + underscore +
// hyphen; spaces inside the braces are tolerated. The same variable can
// appear multiple times in one command.

import { invoke } from "@tauri-apps/api/core";

export interface Variable {
  /** The token between braces, normalized (trimmed). */
  name: string;
  /** True when prefixed with `secret:` — read from / written to the OS
   * keychain instead of the in-memory var cache. */
  isSecret: boolean;
}

const PATTERN = /\{\{\s*([\w:-]+)\s*\}\}/g;

/**
 * Return the de-duplicated, ordered list of variables in `command`.
 * Order matches first appearance in the command text — gives the prompt UI
 * a stable reading order.
 */
export function extractVariables(command: string): Variable[] {
  const seen = new Set<string>();
  const out: Variable[] = [];
  for (const match of command.matchAll(PATTERN)) {
    const raw = match[1].trim();
    if (!raw) continue;
    const isSecret = raw.toLowerCase().startsWith("secret:");
    const name = isSecret ? raw.slice("secret:".length) : raw;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, isSecret });
  }
  return out;
}

/**
 * Substitute `{{name}}` (and `{{secret:name}}`) tokens with values from the
 * map. Missing variables are left as literal text so the user sees the
 * unresolved placeholder rather than something silently broken.
 */
export function substituteVariables(command: string, values: Record<string, string>): string {
  return command.replace(PATTERN, (whole, raw: string) => {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    const key = lower.startsWith("secret:") ? trimmed.slice("secret:".length) : trimmed;
    if (key in values) return values[key];
    return whole;
  });
}

// ---- keychain bindings ----

export const secretGet = (name: string): Promise<string | null> =>
  invoke<string | null>("secret_get", { name });

export const secretSet = (name: string, value: string): Promise<void> =>
  invoke<void>("secret_set", { name, value });

export const secretDelete = (name: string): Promise<void> =>
  invoke<void>("secret_delete", { name });

/** Pre-resolve every `secret:` variable from the OS keychain. Returns a
 * partial values map; callers merge with their existing var cache. */
export async function preloadSecrets(vars: Variable[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    vars
      .filter((v) => v.isSecret)
      .map(async (v) => {
        try {
          const val = await secretGet(v.name);
          if (val !== null) out[v.name] = val;
        } catch (e) {
          console.warn(`secret_get(${v.name}) failed:`, e);
        }
      })
  );
  return out;
}
