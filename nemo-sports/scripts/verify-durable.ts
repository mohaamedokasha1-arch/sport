import { upsertOverride, getOverride } from "@/lib/match-overrides";
/** Destructive fixtures are restricted to a loopback database named nemo_verification.
 * Run once with `write`, then in a fresh process with `read`, then `cleanup`.
 * Never point this test at deployment data. No credentials are logged. */
import assert from "node:assert/strict";
import { getDb } from "@/lib/db/pg";
import { createAdminMatch, getAdminMatchBySlug } from "@/lib/admin-matches";
import { createLiveStream, streamForMatch } from "@/lib/match-streams";
import { createSource, listSources, insertArticle, listArticles, setArticleStatus } from "@/lib/news/store";
import { createBroadcaster, setBroadcasterStatus, listBroadcasters } from "@/lib/broadcasts";
import { ingestAllSources } from "@/lib/news/pipeline";
import { createUser } from "@/lib/admin-users";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/nemo_verification", "Only the isolated nemo_verification database is allowed");
const mode = process.argv[2];
const slug = "qa-nemo-a-vs-b-2030-01-01";
async function main() {
  const db = (await getDb())!;
  if (mode === "write") {
    const match = await createAdminMatch({ slug, sport: "football", competitionSlug: "qa-competition", competitionName: "QA competition", homeName: "QA Nemo A", awayName: "QA Nemo B", date: "2030-01-01", time: "20:00", status: "upcoming", isPublished: true }, "qa-only");
    assert.equal(match.ok, true, match.ok ? "" : match.error);
    const correction = await upsertOverride(slug, { note: "QA durable correction" }); assert.equal(correction.ok, true);
    const stream = await createLiveStream({ matchSlug: slug, homeName: "QA Nemo A", awayName: "QA Nemo B", embedUrl: "https://www.youtube.com/embed/qa-only", status: "published" });
    assert.equal(stream.ok, true);
    const broadcast = await createBroadcaster({ competitionId: "qa-competition", competitionName: "QA competition", broadcasterName: "QA guide", broadcastWebsite: "https://www.beinsports.com", verificationSource: "QA test record — not a rights claim", requiresSubscription: true });
    assert.equal(broadcast.ok, true); if (broadcast.ok) await setBroadcasterStatus(broadcast.entry.id, "approved");
    const source = await createSource({ query: "QA durable football", language: "en" });
    const now = new Date().toISOString();
    await insertArticle({ id: randomUUID(), title: "QA Football publication persistence", sourceUrl: "https://example.com/qa-durable", canonicalUrl: "example.com/qa-durable", sourceName: "QA source", sourceDomain: "example.com", publicationDate: now, fetchedDate: now, description: "Test metadata only", category: "Football", secondaryCategories: [], categoryConfidence: 90, relatedEntities: [], rssSourceId: source.id, fingerprint: "qa-durable", isDuplicate: false, qualityScore: 80, status: "published", sourceBadge: "QA", createdAt: now, updatedAt: now });
    if (process.env.NEMO_QA_PASSWORD) {
      const user = await createUser({ username: "qa_editor", password: process.env.NEMO_QA_PASSWORD, role: "editor", email: "" });
      assert.equal(user.ok, true);
    }
    console.log("PASS: match, stream, broadcaster, source and article committed to isolated Postgres");
  } else if (mode === "read") {
    const match = await getAdminMatchBySlug(slug); assert.equal(match?.isPublished, true);
    assert.equal((await getOverride(slug))?.note, "QA durable correction");
    const stream = await streamForMatch({ slug }); assert.equal(stream?.embedUrl, "https://www.youtube.com/embed/qa-only");
    assert.equal(await streamForMatch({ slug: "qa-nemo-a-vs-b-2030-02-01", home: "QA Nemo A", away: "QA Nemo B" }), null);
    assert.ok((await listBroadcasters(false)).some((b) => b.competitionId === "qa-competition"));
    const source = (await listSources()).find((s) => s.query === "QA durable football"); assert.ok(source);
    const articles = await listArticles({ sourceId: source.id }); assert.equal(articles.items.length, 1);
    await setArticleStatus(articles.items[0].id, "hidden");
    assert.equal((await listArticles({ sourceId: source.id })).items.length, 0);
    await setArticleStatus(articles.items[0].id, "published");
    await db.transaction(async (tx) => {
      await tx.select("SELECT pg_advisory_xact_lock(76321941)", []);
      await assert.rejects(ingestAllSources(), /already running/);
    });
    console.log("PASS: cross-connection ingestion lock");
    console.log("PASS: fresh-process reads, exact match binding, broadcaster visibility and durable moderation");
  } else if (mode === "cleanup") {
    await db.run("DELETE FROM match_overrides WHERE slug = $1", [slug]);
    await db.run("DELETE FROM match_streams WHERE match_slug = $1", [slug]);
    await db.run("DELETE FROM admin_matches WHERE slug = $1", [slug]);
    await db.run("DELETE FROM broadcasts WHERE competition_id = 'qa-competition'", []);
    await db.run("DELETE FROM news_articles WHERE canonical_url = 'example.com/qa-durable'", []);
    await db.run("DELETE FROM rss_sources WHERE query = 'QA durable football'", []);
    await db.run("DELETE FROM admin_users WHERE username = 'qa_editor'", []);
    console.log("PASS: isolated QA records removed");
  } else throw new Error("Use write, read or cleanup");
  await db.end();
}
main().catch(async (error) => { console.error(error instanceof assert.AssertionError ? error.message : "Durability test failed; inspect test database"); await (await getDb())?.end(); process.exitCode = 1; });
