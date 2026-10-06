// Username autocomplete suggestions for the "Track an author" input.
//
// The list is a bundled, rank-ordered snapshot of popular npm maintainers
// (see scripts/build-suggestions.mjs) — suggestions-only by construction:
// this module never touches npmUsersCollection, and tapping a suggestion
// only fills the input; the user still confirms via "Add user".
//
// Lookup is a linear prefix scan in rank order (most popular first). With
// ~2000 short strings this is well under a millisecond per keystroke —
// faster than a SQLite round-trip, with no index to build or keep in sync.
import suggestedUsers from "@/assets/suggested-users.json";

export const MAX_USERNAME_SUGGESTIONS = 5;
const MIN_PREFIX_LENGTH = 2;

export function suggestUsernames(prefix: string, exclude?: ReadonlySet<string>): string[] {
  const needle = prefix.trim().toLowerCase();
  if (needle.length < MIN_PREFIX_LENGTH) return [];
  const matches: string[] = [];
  for (const name of suggestedUsers) {
    if (matches.length >= MAX_USERNAME_SUGGESTIONS) break;
    if (name.startsWith(needle) && !exclude?.has(name)) matches.push(name);
  }
  return matches;
}
