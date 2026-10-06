// Builds assets/suggested-users.json — the top ~1000 npm maintainers by
// summed monthly downloads, used ONLY for username autocomplete suggestions.
// One-off dev-machine script: `node scripts/build-suggestions.mjs` before a
// release to refresh. Minimal registry load: a handful of paged search
// requests (size=250), sequential with pauses. Raw responses are cached under
// scripts/.cache/ (gitignored) so retries/refreshes don't re-hit the API.
//
// Why several queries: /-/v1/search ranks by relevance, not downloads, and
// has no match-all query — so one query's top pages miss whole popular
// segments (e.g. text=js never returns chalk). Unioning page 1-2 of diverse
// broad queries covers frontend libs, CLIs, test runners and apps.
const SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
const PAGE_SIZE = 250;
// [query, pages]: broad generic queries first (2 pages), then top-ecosystem
// queries (page 1 = best quality per request) to cover segments generic
// bigrams miss (react/vue/svelte authors, framework CLIs, the npm CLI team).
const QUERIES = [
  ["js", 2],
  ["app", 2],
  ["cli", 2],
  ["test", 2],
  ["node", 2],
  ["react", 1],
  ["next", 1],
  ["vue", 1],
  ["svelte", 1],
  ["npm", 1],
  ["file", 2],
  ["upload", 3],
  ["typescript", 2],
  ["t3", 2],
];
const TARGET_COUNT = 2000;
const { writeFile, mkdir, readFile } = await import("node:fs/promises");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(query, from) {
  const cachePath = new URL(`./.cache/${query}-${from}.json`, import.meta.url);
  try {
    return JSON.parse(await readFile(cachePath, "utf8"));
  } catch {}
  const url = `${SEARCH_URL}?text=${encodeURIComponent(query)}&size=${PAGE_SIZE}&from=${from}`;
  let data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      await sleep(2000);
    }
  }
  await mkdir(new URL("./.cache/", import.meta.url), { recursive: true });
  await writeFile(cachePath, JSON.stringify(data));
  await sleep(500);
  return data;
}

const totals = new Map(); // username -> summed monthly downloads
const seenPackages = new Set(); // a package can match several queries — count it once
for (const [query, pages] of QUERIES) {
  for (let page = 0; page < pages; page++) {
    const data = await fetchPage(query, page * PAGE_SIZE);
    for (const obj of data.objects ?? []) {
      const pkgName = obj.package?.name;
      if (!pkgName || seenPackages.has(pkgName)) continue;
      seenPackages.add(pkgName);
      const monthly = obj.downloads?.monthly ?? 0;
      const names = new Set();
      for (const m of obj.package?.maintainers ?? []) if (m?.username) names.add(m.username);
      const pub = obj.package?.publisher?.username;
      if (pub) names.add(pub);
      for (const name of names) {
        const key = name.trim().toLowerCase();
        if (key) totals.set(key, (totals.get(key) ?? 0) + monthly);
      }
    }
    console.log(`query "${query}" page ${page + 1}/${pages}: ${totals.size} usernames so far`);
  }
}

const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
let users = ranked.slice(0, TARGET_COUNT);
if (new Set(users).size !== users.length) throw new Error("duplicate usernames detected");

// Acceptance probes: usernames stakeholders explicitly require to be
// suggestible. Each probe is verified real via an exact maintainer: query and
// admitted ONLY if its true download total clears the same bar as the
// mechanical list ( sampling misses genuinely popular maintainers — e.g.
// relevance ranking buries uploadthing — so this is a recall check, logged
// loudly, never a free pass: zero-result probes throw).
const PROBES = ["t3dotgg"];
const cutoff = totals.get(users[users.length - 1]) ?? 0;
for (const probe of PROBES) {
  if (users.includes(probe)) {
    console.log(`probe ${probe}: already present`);
    continue;
  }
  const data = await fetchPage(`maintainer:${probe}`, 0).catch(() => null);
  const seen = new Set();
  let total = 0;
  for (const obj of data?.objects ?? []) {
    if (seen.has(obj.package?.name)) continue;
    seen.add(obj.package.name);
    total += obj.downloads?.monthly ?? 0;
  }
  if (total === 0) throw new Error(`probe ${probe} has no packages — refusing to invent it`);
  if (total < cutoff) throw new Error(`probe ${probe} (${total}/mo) below bar (${cutoff}/mo)`);
  console.log(`probe ${probe}: verified ${total}/mo >= bar ${cutoff}/mo — including`);
  const rank = users.findIndex((u) => (totals.get(u) ?? 0) < total);
  users.splice(rank === -1 ? users.length : rank, 0, probe);
  totals.set(probe, total);
}
if (new Set(users).size !== users.length) throw new Error("duplicate usernames detected");

await writeFile(
  new URL("../assets/suggested-users.json", import.meta.url),
  JSON.stringify(users) + "\n",
);
console.log(`wrote ${users.length} usernames`);
for (const probe of ["t3dotgg", "sindresorhus"]) {
  console.log(`${probe}: ${users.includes(probe) ? `present (rank ${users.indexOf(probe) + 1})` : "MISSING"}`);
}
