// Focused checks for the username-suggestions asset + matcher.
// Run: bun scripts/check-suggestions.ts
import suggestedUsers from "@/assets/suggested-users.json";
import { MAX_USERNAME_SUGGESTIONS, suggestUsernames } from "@/lib/suggestions";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
};

assert(new Set(suggestedUsers).size === suggestedUsers.length, "duplicate usernames in asset");
for (const probe of ["t3dotgg", "sindresorhus"]) {
  assert(suggestedUsers.includes(probe), `probe ${probe} missing from asset`);
}
const matches = suggestUsernames("t3dot");
assert(matches.includes("t3dotgg"), "t3dot should suggest t3dotgg");
assert(matches.length <= MAX_USERNAME_SUGGESTIONS, "more than max suggestions");
assert(suggestUsernames("t").length === 0, "single char must yield no suggestions");
assert(suggestUsernames("T3DOT").includes("t3dotgg"), "matching must be case-insensitive");
assert(
  suggestUsernames("t3dot", new Set(["t3dotgg"])).every((n) => n !== "t3dotgg"),
  "exclude set must be honored",
);
const started = performance.now();
for (let i = 0; i < 1000; i++) suggestUsernames("rea");
const perLookupMs = (performance.now() - started) / 1000;
assert(perLookupMs < 1, `lookup too slow: ${perLookupMs}ms`);
console.log(
  `OK: ${suggestedUsers.length} names, t3dot -> [${matches.join(", ")}], ${perLookupMs.toFixed(3)}ms/lookup`,
);
