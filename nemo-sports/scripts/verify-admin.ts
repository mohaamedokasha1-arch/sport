/**
 * Admin panel verification (run: `npm run admin:test`).
 * Exercises the real stores and rules the admin actions and public pages use:
 * RBAC, session signing/tamper detection, user credentials, Cairo-time
 * scheduling, embed-URL allowlisting, match → public fixture, stream
 * lifecycle (draft/publish/disable/delete), manual-news source rules.
 * In-memory mode (no DATABASE_URL) — no network access required.
 */
import assert from "node:assert/strict";
import { can, ROLE_PERMISSIONS } from "@/lib/admin-roles";
import { createAdminSession, verifyAdminSession, isSuperAdminOnlyPath } from "@/lib/admin-auth-shared";
import { createUser, verifyUserCredentials, updateUser, deleteUser, listUsers, countActiveSuperAdmins } from "@/lib/admin-users";
import { createAdminMatch, getAdminMatchBySlug, scheduledAtFromLocal, matchDateTimeLocal, setAdminMatchPublished, adminMatchToFixture, publishedAdminFixtures } from "@/lib/admin-matches";
import { createLiveStream, setLiveStreamStatus, listMatchStreams, streamForMatch, deleteLiveStream, validateEmbedUrl, updateLiveStream } from "@/lib/match-streams";
import { publicStreamCards } from "@/lib/public-streams";
import { createManualNews, validateNewsInput, listManualNews, setManualNewsStatus, newsParagraphs } from "@/lib/manual-news";
import { createAdminTeam, listAdminTeams } from "@/lib/admin-teams";
import { createAdminPlayer, parseStatsInput, listAdminPlayers } from "@/lib/admin-players";
import { createAdminCompetition, listAdminCompetitions } from "@/lib/admin-competitions";
import { getSiteSettings, updateSiteSettings } from "@/lib/site-settings";
import { logActivity, listActivity } from "@/lib/activity";
import { persistOrThrow, memoryStoreAllowed, StoreWriteError, STORE_WRITE_FAILED_AR, STORE_MEMORY_DISABLED_AR } from "@/lib/db/store-policy";

process.env.ADMIN_SESSION_SECRET = "unit-test-secret-0123456789";

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

async function main() {
  console.log("RBAC");
  await test("super_admin can do everything", () => {
    assert.ok(can("super_admin", "users"));
    assert.ok(can("super_admin", "settings"));
    assert.ok(can("super_admin", "anything-at-all"));
  });
  await test("editor cannot touch users, settings, teams, competitions", () => {
    for (const p of ["users", "settings", "teams", "competitions", "players", "standings", "providers", "broadcast"]) {
      assert.equal(can("editor", p), false, p);
    }
  });
  await test("editor can manage matches, streams and news", () => {
    for (const p of ["matches", "streams", "news"]) assert.equal(can("editor", p), true, p);
  });
  await test("admin cannot manage users or site settings", () => {
    assert.equal(can("admin", "users"), false);
    assert.equal(can("admin", "settings"), false);
    assert.equal(can("admin", "teams"), true);
  });
  await test("unknown role has no permissions", () => {
    assert.equal(can("hacker", "matches"), false);
    assert.equal(ROLE_PERMISSIONS.editor.has("*"), false);
  });
  await test("super-admin-only paths are protected", () => {
    assert.equal(isSuperAdminOnlyPath("/admin/users"), true);
    assert.equal(isSuperAdminOnlyPath("/admin/users/new"), true);
    assert.equal(isSuperAdminOnlyPath("/admin/settings"), true);
    assert.equal(isSuperAdminOnlyPath("/admin/matches"), false);
    assert.equal(isSuperAdminOnlyPath("/admin/usersx"), false);
  });

  console.log("Sessions");
  await test("valid session verifies with identity and role", async () => {
    const token = await createAdminSession({ id: "usr_1", role: "editor" });
    const s = await verifyAdminSession(token!);
    assert.equal(s?.userId, "usr_1");
    assert.equal(s?.role, "editor");
  });
  await test("tampered role is rejected (signature)", async () => {
    const token = (await createAdminSession({ id: "usr_1", role: "editor" }))!;
    const [payload, sig] = token.split(".");
    const forged = JSON.stringify({ u: "usr_1", r: "super_admin", e: Date.now() + 60_000 });
    const forgedPayload = Buffer.from(forged).toString("base64url");
    assert.equal(await verifyAdminSession(`${forgedPayload}.${sig}`), null);
    assert.ok(payload);
  });
  await test("expired session is rejected", async () => {
    const token = (await createAdminSession({ id: "usr_1", role: "admin" }, Date.now() - 13 * 3600_000))!;
    assert.equal(await verifyAdminSession(token), null);
  });
  await test("garbage cookie is rejected", async () => {
    assert.equal(await verifyAdminSession("not-a-session"), null);
    assert.equal(await verifyAdminSession(undefined), null);
  });

  console.log("Users & passwords");
  let editorId = "";
  await test("create editor with bcrypt-hashed password", async () => {
    const r = await createUser({ username: "Editor_One", email: "e@example.com", password: "EditorPass123!", role: "editor" });
    assert.equal(r.ok, true);
    if (r.ok) editorId = r.user.id;
    const list = await listUsers();
    assert.ok(list.every((u) => !("passwordHash" in (u as object))), "hash must never leave the store");
  });
  await test("short password and bad username are rejected", async () => {
    assert.equal((await createUser({ username: "x", password: "longenough1", role: "editor" })).ok, false);
    assert.equal((await createUser({ username: "validname", password: "short", role: "editor" })).ok, false);
  });
  await test("credentials verify case-insensitively; wrong password fails", async () => {
    assert.ok(await verifyUserCredentials("editor_one", "EditorPass123!"));
    assert.equal(await verifyUserCredentials("editor_one", "wrong-password"), null);
    assert.equal(await verifyUserCredentials("nobody", "whatever123"), null);
  });
  await test("deactivated account cannot log in", async () => {
    await updateUser(editorId, { isActive: false });
    assert.equal(await verifyUserCredentials("editor_one", "EditorPass123!"), null);
    await updateUser(editorId, { isActive: true });
  });
  await test("cannot delete the last active super admin", async () => {
    const created = await createUser({ username: "root_admin", password: "RootPass12345!", role: "super_admin" });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    // The directory may already hold other super admins (the env operator is
    // bootstrapped into an empty directory), so park them to make root_admin the last one.
    const others = (await listUsers()).filter((u) => u.role === "super_admin" && u.isActive && u.id !== created.user.id);
    for (const u of others) await updateUser(u.id, { isActive: false });
    try {
      const supers = (await listUsers()).filter((u) => u.role === "super_admin" && u.isActive);
      assert.equal(supers.length, 1, "exactly one active super admin in this test");
      const r = await deleteUser(supers[0]!.id);
      assert.equal(r.ok, false);
      assert.equal(await countActiveSuperAdmins(), 1);
    } finally {
      for (const u of others) await updateUser(u.id, { isActive: true });
    }
  });

  console.log("Matches & scheduling");
  await test("Cairo wall-clock time converts to the right UTC instant", () => {
    // 20:00 Cairo in October 2026 (EEST, UTC+3) → 17:00 UTC
    assert.equal(scheduledAtFromLocal("2026-10-20", "20:00"), "2026-10-20T17:00:00.000Z");
    assert.deepEqual(matchDateTimeLocal("2026-10-20T17:00:00.000Z"), { date: "2026-10-20", time: "20:00" });
  });
  let matchSlug = "";
  await test("create a match (draft by default off, published on)", async () => {
    const r = await createAdminMatch({ sport: "football", competitionSlug: "egyptian-league", competitionName: "الدوري المصري الممتاز", homeName: "الأهلي", awayName: "الزمالك", date: "2026-10-20", time: "20:00", status: "upcoming", isPublished: true, venue: "استاد القاهرة" }, "tester");
    assert.equal(r.ok, true);
    if (r.ok) matchSlug = r.match.slug;
    assert.ok(matchSlug.length > 0);
  });
  await test("invalid match input is rejected with a readable error", async () => {
    const r = await createAdminMatch({ sport: "football", competitionSlug: "x1", competitionName: "", homeName: "", awayName: "B", date: "bad", time: "20:00", status: "upcoming" });
    assert.equal(r.ok, false);
  });
  await test("published match becomes a public fixture (status mapped)", async () => {
    const m = await getAdminMatchBySlug(matchSlug);
    assert.ok(m);
    const f = adminMatchToFixture(m!);
    assert.equal(f.status, "scheduled");
    assert.equal(f.homeName, "الأهلي");
    const pub = await publishedAdminFixtures();
    assert.ok(pub.some((x) => x.providerId === matchSlug));
  });
  await test("hidden match disappears from public fixtures but is not deleted", async () => {
    const m = await getAdminMatchBySlug(matchSlug);
    await setAdminMatchPublished(m!.id, false);
    assert.ok(!(await publishedAdminFixtures()).some((x) => x.providerId === matchSlug));
    assert.ok(await getAdminMatchBySlug(matchSlug));
    await setAdminMatchPublished(m!.id, true);
  });

  console.log("Live streams");
  const OFFICIAL = "https://www.onsport.tv/embed/match-123";
  await test("embed URL allowlist: official https passes", () => {
    assert.equal(validateEmbedUrl(OFFICIAL).ok, true);
  });
  await test("embed URL allowlist: http, unknown host, javascript:, markup are rejected", () => {
    assert.equal(validateEmbedUrl("http://www.onsport.tv/embed/x").ok, false);
    assert.equal(validateEmbedUrl("https://random-iptv.example/live/1.m3u8").ok, false);
    assert.equal(validateEmbedUrl("javascript:alert(1)").ok, false);
    assert.equal(validateEmbedUrl("https://www.onsport.tv/<script>x</script>").ok, false);
    assert.equal(validateEmbedUrl("https://www.onsport.tv/\"onload=x").ok, false);
  });
  let streamId = "";
  await test("new stream starts as draft and is NOT public", async () => {
    const r = await createLiveStream({ matchSlug, homeName: "الأهلي", awayName: "الزمالك", embedUrl: OFFICIAL, label: "أون سبورت" });
    assert.equal(r.ok, true);
    if (r.ok) {
      streamId = r.entry.id;
      assert.equal(r.entry.status, "draft");
    }
    assert.equal(await streamForMatch({ slug: matchSlug }), null);
    assert.equal((await publicStreamCards()).some((c) => c.stream.id === streamId), false);
  });
  await test("publishing makes the stream visible on the match and in /live cards", async () => {
    const r = await setLiveStreamStatus(streamId, "published");
    assert.equal(r.ok, true);
    const s = await streamForMatch({ slug: matchSlug, home: "الأهلي", away: "الزمالك" });
    assert.equal(s?.id, streamId);
    const cards = await publicStreamCards();
    const card = cards.find((c) => c.stream.id === streamId);
    assert.ok(card, "card present");
    assert.equal(card?.home, "الأهلي");
    assert.equal(card?.fixture?.providerId, matchSlug);
  });
  await test("stream bound to one match never leaks onto another", async () => {
    assert.equal(await streamForMatch({ slug: "some-other-match-2026-10-21" }), null);
    assert.equal(await streamForMatch({ home: "الأهلي", away: "بيراميدز" }), null);
  });
  await test("disabling hides the stream but keeps its data", async () => {
    await setLiveStreamStatus(streamId, "disabled");
    assert.equal(await streamForMatch({ slug: matchSlug }), null);
    const all = await listMatchStreams(true);
    assert.ok(all.find((s) => s.id === streamId), "kept for the record");
  });
  await test("editing the URL re-validates it (unofficial URL refused)", async () => {
    const r = await updateLiveStream(streamId, { embedUrl: "https://pirate.example/x" });
    assert.equal(r.ok, false);
    const ok = await updateLiveStream(streamId, { embedUrl: "https://www.beinsports.com/embed/new" });
    assert.equal(ok.ok, true);
  });
  await test("deleting a stream removes only the link; the match survives", async () => {
    await deleteLiveStream(streamId);
    assert.equal((await listMatchStreams(true)).some((s) => s.id === streamId), false);
    assert.ok(await getAdminMatchBySlug(matchSlug), "match still exists");
  });

  console.log("Teams, players, competitions, news, settings");
  await test("team requires Arabic name; slug generated and unique", async () => {
    assert.equal((await createAdminTeam({ nameAr: "" })).ok, false);
    const a = await createAdminTeam({ nameAr: "فريق الاختبار", isPublished: true }, "t");
    const b = await createAdminTeam({ nameAr: "فريق الاختبار", isPublished: true }, "t");
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) assert.notEqual(a.team.slug, b.team.slug);
    assert.ok((await listAdminTeams({ publishedOnly: true })).length >= 2);
  });
  await test("player stats parse from 'name: value' lines and invented fields stay empty", async () => {
    assert.deepEqual(parseStatsInput("الأهداف: 12\nالتمريرات: 5"), { "الأهداف": "12", "التمريرات": "5" });
    const p = await createAdminPlayer({ fullNameAr: "لاعب تجريبي", isPublished: true, nationality: "" }, "t");
    assert.equal(p.ok, true);
    if (p.ok) assert.equal(p.player.nationality, "");
    assert.ok((await listAdminPlayers({ publishedOnly: true })).length >= 1);
  });
  await test("competition creates and lists when published", async () => {
    const c = await createAdminCompetition({ nameAr: "بطولة اختبار", season: "2026/2027", isPublished: true }, "t");
    assert.equal(c.ok, true);
    assert.ok((await listAdminCompetitions({ publishedOnly: true })).some((x) => x.nameAr === "بطولة اختبار"));
  });
  await test("manual news requires a real source and an http(s) source URL", () => {
    assert.ok(validateNewsInput({ title: "عنوان", sourceName: "", sourceUrl: "https://a.example" }));
    assert.ok(validateNewsInput({ title: "عنوان", sourceName: "موقع", sourceUrl: "javascript:alert(1)" }));
    assert.equal(validateNewsInput({ title: "عنوان", sourceName: "موقع", sourceUrl: "https://a.example/x" }), null);
  });
  await test("news body is plain text: script tags are kept as text, paragraphs split", () => {
    const paras = newsParagraphs("فقرة أولى\n\n<script>alert(1)</script>\n\nفقرة ثالثة");
    assert.equal(paras.length, 3);
    assert.equal(paras[1], "<script>alert(1)</script>");
  });
  await test("manual news: draft is not public; published is", async () => {
    const r = await createManualNews({ title: "خبر تجريبي", sourceName: "مصدر", sourceUrl: "https://example.com/n", status: "draft" }, "t");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal((await listManualNews({ publishedOnly: true })).some((n) => n.id === r.article.id), false);
    await setManualNewsStatus(r.article.id, "published");
    assert.equal((await listManualNews({ publishedOnly: true })).some((n) => n.id === r.article.id), true);
  });
  await test("settings: unknown timezone rejected; live publishing switch persists", async () => {
    const bad = await updateSiteSettings({ timezone: "Mars/Olympus" });
    assert.equal(bad.ok, false);
    const r = await updateSiteSettings({ live: { publishingEnabled: false } }, "t");
    assert.equal(r.ok, true);
    assert.equal((await getSiteSettings()).live.publishingEnabled, false);
    await updateSiteSettings({ live: { publishingEnabled: true } }, "t");
  });
  await test("activity log records actor and never stores passwords", async () => {
    await logActivity({ action: "match.create", entityType: "match", entityId: "x", actor: "tester", role: "editor", after: { status: "upcoming" } });
    const { items } = await listActivity(5);
    const top = items[0]!;
    assert.equal(top.actor, "tester");
    assert.equal(JSON.stringify(items).includes("EditorPass123"), false);
  });

  console.log("Storage policy (no silent data loss)");
  const env = process.env as Record<string, string | undefined>;
  const withEnv = async (vars: Record<string, string | undefined>, fn: () => void | Promise<void>) => {
    const saved: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      saved[k] = env[k];
      if (vars[k] === undefined) delete env[k];
      else env[k] = vars[k];
    }
    try {
      await fn();
    } finally {
      for (const k of Object.keys(saved)) {
        if (saved[k] === undefined) delete env[k];
        else env[k] = saved[k];
      }
    }
  };
  await test("memory store allowed in development, refused in production by default", async () => {
    await withEnv({ DATABASE_URL: undefined, NODE_ENV: "development", ADMIN_ALLOW_MEMORY_STORE: undefined }, () => {
      assert.equal(memoryStoreAllowed(), true);
    });
    await withEnv({ DATABASE_URL: undefined, NODE_ENV: "production", ADMIN_ALLOW_MEMORY_STORE: undefined }, () => {
      assert.equal(memoryStoreAllowed(), false);
    });
    await withEnv({ DATABASE_URL: undefined, NODE_ENV: "production", ADMIN_ALLOW_MEMORY_STORE: "1" }, () => {
      assert.equal(memoryStoreAllowed(), true);
    });
  });
  await test("production without a database rejects writes with a clear Arabic message", async () => {
    await withEnv({ DATABASE_URL: undefined, NODE_ENV: "production", ADMIN_ALLOW_MEMORY_STORE: undefined }, async () => {
      const r = await createAdminTeam({ nameAr: "فريق اختبار الحفظ", nameEn: "", shortName: "", sport: "football", country: "", logoUrl: "", competitionSlug: "", stadium: "", coach: "", foundedYear: null, primaryColor: "", secondaryColor: "", isPublished: false } as never, "t");
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error, STORE_MEMORY_DISABLED_AR);
    });
  });
  await test("database configured but unavailable: write is rejected, never kept in memory", async () => {
    await withEnv({ DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", NODE_ENV: "production" }, async () => {
      let threw: unknown = null;
      try {
        await persistOrThrow(null, async () => undefined);
      } catch (e) {
        threw = e;
      }
      assert.ok(threw instanceof StoreWriteError);
      assert.equal((threw as StoreWriteError).messageAr, STORE_WRITE_FAILED_AR);
    });
  });
  await test("failed SQL write surfaces an operator-safe message without SQL or secrets", async () => {
    let threw: unknown = null;
    try {
      await persistOrThrow({ marker: 1 }, async () => {
        throw new Error('relation "admin_teams" does not exist postgres://user:pw@host');
      });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw instanceof StoreWriteError);
    const msg = (threw as StoreWriteError).messageAr;
    assert.equal(msg, STORE_WRITE_FAILED_AR);
    assert.equal(/admin_teams|postgres:\/\/|pw@/.test(msg), false);
  });
  await test("successful database write reports persisted (no memory copy)", async () => {
    assert.equal(await persistOrThrow({ marker: 1 }, async () => undefined), true);
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("Failed:", failures.join(" | "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Suite crashed:", e);
  process.exit(1);
});
