#!/usr/bin/env node
/**
 * End-to-end check: live counts agree across every surface for the same scope.
 * ────────────────────────────────────────────────────────────────────────────
 * Run against a STARTED production build that reads the replay server:
 *   node scripts/replay-sportscore-today.mjs 7788 &
 *   NEMO_SPORTSCORE_ENABLED=1 SPORTSCORE_BASE_URL=http://127.0.0.1:7788/api/widget npm run start &
 *   BASE=http://127.0.0.1:3000 REPLAY=http://127.0.0.1:7788 node scripts/verify-live-consistency.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const REPLAY = process.env.REPLAY ?? "http://127.0.0.1:7788";

let failures = 0;
const ok = (cond, label, detail = "") => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const json = async (path) => {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const html = async (path) => {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  return { status: res.status, text: await res.text() };
};
const num = (text, re) => {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const expected = await (await fetch(`${REPLAY}/__expected`)).json();
const E = expected.live;
console.log(`expected live: total ${E.total} (football ${E.football}, basketball ${E.basketball}, tennis ${E.tennis}, cricket ${E.cricket})\n`);

console.log("/api/v1/live");
const all = await json("/api/v1/live?sport=all");
ok(all.status === 200 && all.body?.ok, "sport=all answers 200");
ok(all.body?.meta?.count === E.total, `sport=all count = ${E.total}`, `got ${all.body?.meta?.count}`);
ok(JSON.stringify(all.body?.meta?.bySport) === JSON.stringify({ football: E.football, basketball: E.basketball, tennis: E.tennis, cricket: E.cricket }), "per-sport breakdown", JSON.stringify(all.body?.meta?.bySport));
const byId = new Map((all.body?.data ?? []).map((f) => [f.providerId, f]));
for (const id of expected.halftime) ok(byId.get(id)?.status === "halftime", `${id} is a half-time break`, byId.get(id)?.status);
for (const id of expected.noFabricatedMinute) ok(byId.has(id) && byId.get(id).minute === null, `${id} shows no invented minute`, String(byId.get(id)?.minute));
for (const id of expected.postponed) ok(!byId.has(id), `${id} (postponed) is not live`);
ok(byId.has(expected.overnightLive), "a match that kicked off before Cairo midnight and is still running is live");
ok([...byId.keys()].every((id) => !/^s-o-paulo|vit-ria/.test(id)), "provider slugs, not name-derived ids");
const football = await json("/api/v1/live");
ok(football.body?.meta?.count === E.football && JSON.stringify(football.body?.meta?.scope) === '["football"]', `default scope is explicit: football ${E.football}`, JSON.stringify(football.body?.meta));

console.log("\n/api/v1/matches");
const todayLive = await json("/api/v1/matches?sport=all&date=today&status=live");
ok(todayLive.status === 200, "date=today is accepted (was 400 invalid_input)");
ok(todayLive.body?.meta?.count === E.total, `sport=all&date=today&status=live = ${E.total}`, `got ${todayLive.body?.meta?.count}`);
const fbToday = await json("/api/v1/matches?date=today");
const postponed = (fbToday.body?.data ?? []).find((f) => f.providerId === expected.postponed[0]);
ok(postponed?.status === "postponed", "upcoming+Postponed is published as postponed", postponed?.status);

console.log("\n/live");
const live = await html("/live");
ok(live.status === 200, "200");
const headerRe = /(\d+)<\/span> جارية الآن · (?:<!-- -->)?كل الرياضات/;
ok(num(live.text, headerRe) === E.total, `header count = ${E.total}`, String(num(live.text, headerRe)));
ok(!/لا توجد مباراة جارية الآن/.test(live.text), "the score rail's server HTML makes no 'no match in progress' claim");
ok(new RegExp(`مباشر الآن \\(<!-- -->${E.total}<!-- -->\\)|مباشر الآن \\(${E.total}\\)`).test(live.text), `section "مباشر الآن (${E.total})"`);
ok(!/لا توجد مباريات مباشرة الآن/.test(live.text), "no false 'no live matches' claim");
const liveBasket = await html("/live?sport=basketball");
ok(num(liveBasket.text, /(\d+)<\/span> جارية الآن · (?:<!-- -->)?/) === E.basketball, `/live?sport=basketball = ${E.basketball}`, String(num(liveBasket.text, /(\d+)<\/span> جارية الآن · (?:<!-- -->)?/)));

console.log("\n/matches?date=today");
const matches = await html("/matches?date=today");
const chip = num(matches.text, />مباشر(?:<!-- -->)?<span class="num ms-1\.5 text-\[10px\]">(\d+)</);
ok(chip === E.total, `«مباشر» chip = ${E.total}`, String(chip));
const matchesFb = await html("/matches?date=today&sport=football");
const chipFb = num(matchesFb.text, />مباشر(?:<!-- -->)?<span class="num ms-1\.5 text-\[10px\]">(\d+)</);
ok(chipFb === E.football, `football «مباشر» chip = ${E.football}`, String(chipFb));

console.log("\nhomepage");
let homeCount = null;
for (let i = 0; i < 24 && homeCount !== E.total; i++) {
  const home = await html("/");
  homeCount = num(home.text, /مباشر الآن \((?:<!-- -->)?(\d+)(?:<!-- -->)?\)/);
  if (homeCount !== E.total) await sleep(2500); // ISR regeneration after the build-time render
}
ok(homeCount === E.total, `"مباشر الآن (${E.total})" on the homepage`, String(homeCount));

console.log("\nscore rail (/api/live?scope=rail)");
const rail = await json("/api/live?scope=rail");
ok(rail.body?.mode === "live" && rail.body?.liveTotal === E.total, `rail liveTotal = ${E.total}`, JSON.stringify({ mode: rail.body?.mode, liveTotal: rail.body?.liveTotal }));
ok(rail.body?.matches?.length === Math.min(8, E.total), "rail shows up to 8");

console.log("\nmatch pages");
const detail = await html("/matches/sao-paulo-vs-vitoria-ba");
ok(detail.status === 200, "/matches/sao-paulo-vs-vitoria-ba answers 200 (404 in production before the slug fix)", String(detail.status));
const basketDetail = await html("/matches/boston-celtics-vs-philadelphia-76ers");
ok(basketDetail.status === 200, "a basketball match page answers 200", String(basketDetail.status));

console.log(failures ? `\n✗ ${failures} check(s) failed` : "\n✅ live counts agree on every surface for the same scope");
process.exit(failures ? 1 : 0);
