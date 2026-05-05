// Helpers for resolving a profile id against the loaded settings.

import type { Profile, Settings } from "./settings";

/** Find a profile by id; null when missing or when id is null. */
export function findProfile(settings: Settings, id: string | null): Profile | null {
  if (!id) return null;
  return settings.profiles.find((p) => p.id === id) ?? null;
}

/** Profile to apply for a leaf with the given (possibly null) profileId.
 *  Falls back to the default-profile-id, then to the first profile, then
 *  null so callers can render without overrides. */
export function effectiveProfile(settings: Settings, id: string | null): Profile | null {
  return (
    findProfile(settings, id) ??
    findProfile(settings, settings.default_profile_id) ??
    settings.profiles[0] ??
    null
  );
}
