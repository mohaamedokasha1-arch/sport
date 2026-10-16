/**
 * NEMO Sports · editorial matchdays 15–16 October 2026 — verification.
 * ────────────────────────────────────────────────────────────────────────
 * The desk's two hand-entered matchdays are data, and data drifts. This suite
 * guards the promises the public surfaces rely on:
 *
 *   · every published record is a SCHEDULE entry — no score, no invented result;
 *   · the UTC instant and the Cairo wall clock the desk wrote are the same
 *     moment (the exact error that moves a fixture to the wrong day on every
 *     page at once);
 *   · slugs and ids are unique and URL-safe, because they are public links;
 *   · logos are only real crest URLs from a CDN the platform already trusts
 *     (Football-Data, API-Football, TheSportsDB's r2 badge CDN) — a typo, a
 *     placeholder or a copy-paste that puts one club's badge on both sides is a
 *     broken badge on the site;
 *   · channel lists are clean (bounded, deduped, trimmed) and the parser is
 *     the only way they are written;
 *   · the record the desk could NOT publish (a Saudi club filed under the
 *     Egyptian league) stays unpublished, and the disk store matches the seed.
 *
 * Offline: no network, no database. Run: npm run fixtures:test
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.NEMO_TEST_MEMORY_ONLY = "1";

import {
  INITIAL_ADMIN_MATCHES,
  adminMatchToFixture,
  parseChannelList,
  MAX_MATCH_CHANNELS,
  type AdminMatch,
} from "@/lib/admin-matches";
import {
  EDITORIAL_FIXTURES_OCTOBER_2026,
  UNPUBLISHED_EDITORIAL_FIXTURES,
} from "@/lib/editorial-fixtures-october-2026";
import { siteParts } from "@/lib/tz";

/** Cairo wall clock the desk's sheet declares, per published slug. */
const DESK_SHEET: Record<string, string> = {
  // الخميس 15 أكتوبر 2026
  "manchester-city-vs-arsenal": "2026-10-15 14:00",
  "ain-shams-vs-minya": "2026-10-15 15:30",
  "al-faisaly-vs-al-khaleej": "2026-10-15 16:00",
  "chelsea-vs-everton": "2026-10-15 16:30",
  "pyramids-vs-haras-el-hodoud": "2026-10-15 17:00",
  "bayern-munich-vs-borussia-dortmund": "2026-10-15 17:30",
  "sharjah-vs-al-wahda": "2026-10-15 18:00",
  "mansoura-vs-al-nasr-egypt": "2026-10-15 18:30",
  "al-hazem-vs-al-fateh": "2026-10-15 18:30",
  "juventus-vs-lyon": "2026-10-15 18:45",
  "al-ahly-vs-ismaily": "2026-10-15 19:00",
  "liverpool-vs-ac-milan": "2026-10-15 19:00",
  "valencia-vs-real-betis": "2026-10-15 19:00",
  "el-mokawloon-vs-ghazl-el-mahalla": "2026-10-15 19:30",
  "el-dakhleya-vs-la-viena": "2026-10-15 20:00",
  "al-ittihad-vs-al-taawoun": "2026-10-15 20:00",
  "paris-saint-germain-vs-marseille": "2026-10-15 20:00",
  "inter-milan-vs-roma": "2026-10-15 20:45",
  "real-madrid-vs-bayer-leverkusen": "2026-10-15 21:00",
  "barcelona-vs-atletico-madrid": "2026-10-15 21:00",
  "zamalek-vs-tanta": "2026-10-15 21:30",
  // الجمعة 16 أكتوبر 2026
  "liverpool-vs-tottenham": "2026-10-16 12:30",
  "manchester-united-vs-newcastle": "2026-10-16 15:00",
  "sharkia-vs-al-arish": "2026-10-16 16:00",
  "espanyol-vs-malaga": "2026-10-16 17:00",
  "al-hilal-vs-al-shabab": "2026-10-16 17:30",
  "el-entag-el-harby-vs-misr-club": "2026-10-16 18:00",
  "fiorentina-vs-bologna": "2026-10-16 18:00",
  "werder-bremen-vs-eintracht-frankfurt": "2026-10-16 18:30",
  "al-sadd-vs-al-rayyan": "2026-10-16 18:30",
  "smouha-vs-misr-lel-makkasa": "2026-10-16 19:00",
  "manchester-city-vs-istanbul-basaksehir": "2026-10-16 19:00",
  "real-madrid-vs-sevilla": "2026-10-16 19:00",
  "monaco-vs-rennes": "2026-10-16 19:00",
  "future-vs-zamalek": "2026-10-16 19:30",
  "al-ain-vs-al-jazira": "2026-10-16 19:30",
  "arsenal-vs-inter-milan": "2026-10-16 20:00",
  "al-nassr-vs-al-ahli-saudi": "2026-10-16 20:00",
  "ajax-vs-vitesse": "2026-10-16 20:00",
  "napoli-vs-lazio": "2026-10-16 20:45",
  "barcelona-vs-bayern-munich": "2026-10-16 21:00",
  "el-gouna-vs-pyramids": "2026-10-16 21:00",
  "al-ittihad-kalba-vs-al-raqqa": "2026-10-16 21:00",
  // الجمعة 16 أكتوبر 2026 — مباريات مؤكدة مضافة (22 مباراة)
  "el-sekka-el-hadid-vs-ismaily": "2026-10-16 15:30",
  "tersana-vs-belqas": "2026-10-16 15:30",
  "baladiyat-el-mahalla-vs-fc-masar": "2026-10-16 15:30",
  "pharco-vs-maleyat-kafr-el-zayat": "2026-10-16 15:30",
  "proxy-sc-vs-el-entag-al-harby": "2026-10-16 15:30",
  "al-merrikh-vs-pyramids-fc": "2026-10-16 16:00",
  "welwalo-adigrat-vs-al-ahli-tripoli": "2026-10-16 16:00",
  "al-dhafra-vs-dubai-united": "2026-10-16 16:05",
  "al-qadsiah-vs-abha": "2026-10-16 16:15",
  "al-ahli-doha-vs-al-wakrah": "2026-10-16 17:30",
  "baniyas-vs-al-wasl": "2026-10-16 18:45",
  "apr-fc-vs-zamalek-sc": "2026-10-16 19:00",
  "star-sport-academy-vs-rs-berkane": "2026-10-16 19:00",
  "al-shahaniya-vs-al-arabi-qatar": "2026-10-16 19:45",
  "zed-fc-vs-azam-fc": "2026-10-16 20:00",
  "corum-fk-vs-caykur-rizespor": "2026-10-16 20:00",
  "sc-heerenveen-vs-excelsior": "2026-10-16 21:00",
  "eintracht-frankfurt-vs-fc-koln": "2026-10-16 21:30",
  "frosinone-vs-sassuolo": "2026-10-16 21:45",
  "le-mans-vs-toulouse": "2026-10-16 21:45",
  "deportivo-la-coruna-vs-levante": "2026-10-16 22:00",
  "burnley-vs-wolverhampton-wanderers": "2026-10-16 22:00",
  // السبت 17 أكتوبر 2026 — الغد (54 مباراة مؤكدة مضافة)
  "airtel-kitara-fc-vs-al-ahly-fc": "2026-10-17 16:00",
  "saudi-arabia-u17-vs-egypt-u17": "2026-10-17 17:45",
  "everton-vs-chelsea": "2026-10-17 14:30",
  "brentford-vs-liverpool": "2026-10-17 17:00",
  "manchester-city-vs-ipswich-town": "2026-10-17 17:00",
  "fulham-vs-hull-city": "2026-10-17 17:00",
  "newcastle-united-vs-aston-villa": "2026-10-17 19:30",
  "espanyol-vs-atletico-madrid": "2026-10-17 15:00",
  "villarreal-vs-elche": "2026-10-17 17:15",
  "real-betis-vs-barcelona": "2026-10-17 19:30",
  "valencia-vs-athletic-club": "2026-10-17 22:00",
  "venezia-vs-napoli": "2026-10-17 16:00",
  "bologna-vs-inter-milan": "2026-10-17 19:00",
  "roma-vs-genoa": "2026-10-17 21:45",
  "union-berlin-vs-borussia-dortmund": "2026-10-17 16:30",
  "hamburger-sv-vs-stuttgart": "2026-10-17 16:30",
  "schalke-04-vs-mainz-05": "2026-10-17 16:30",
  "werder-bremen-vs-paderborn": "2026-10-17 16:30",
  "elversberg-vs-augsburg": "2026-10-17 16:30",
  "bayern-munich-vs-rb-leipzig": "2026-10-17 19:30",
  "strasbourg-vs-paris-saint-germain": "2026-10-17 18:15",
  "lille-vs-brest": "2026-10-17 21:45",
  "troyes-vs-lens": "2026-10-17 21:45",
  "neom-sc-vs-al-ettifaq": "2026-10-17 18:40",
  "al-diraiyah-vs-al-taawoun": "2026-10-17 21:00",
  "al-nasr-dubai-vs-hatta": "2026-10-17 16:05",
  "shabab-al-ahli-vs-al-ain": "2026-10-17 18:45",
  "al-sailiya-vs-qatar-sc": "2026-10-17 17:30",
  "lusail-vs-al-shamal": "2026-10-17 19:45",
  "codm-meknes-vs-union-touarga": "2026-10-17 19:00",
  "difaa-el-jadidi-vs-moghreb-tetouan": "2026-10-17 23:00",
  "es-hamam-sousse-vs-us-ben-guerdane": "2026-10-17 16:30",
  "cffa-vs-young-africans": "2026-10-17 15:00",
  "tp-mazembe-vs-club-africain": "2026-10-17 16:00",
  "african-stars-vs-orlando-pirates": "2026-10-17 16:00",
  "15-de-agosto-vs-simba-sc": "2026-10-17 18:00",
  "san-pedro-vs-fc-nouadhibou": "2026-10-17 19:00",
  "red-arrows-vs-kaizer-chiefs": "2026-10-17 16:00",
  "es-zarzis-vs-as-real-bamako": "2026-10-17 17:30",
  "rayon-sports-vs-black-bulls": "2026-10-17 19:00",
  "academie-de-fad-vs-cs-sfaxien": "2026-10-17 19:00",
  "co-korhogo-vs-as-far-rabat": "2026-10-17 19:00",
  "as-douanes-nouakchott-vs-cr-belouizdad": "2026-10-17 20:00",
  "ado-den-haag-vs-psv-eindhoven": "2026-10-17 17:30",
  "sc-telstar-vs-feyenoord": "2026-10-17 21:00",
  "sparta-rotterdam-vs-willem-ii": "2026-10-17 22:00",
  "watford-vs-charlton-athletic": "2026-10-17 14:30",
  "middlesbrough-vs-cardiff-city": "2026-10-17 14:30",
  "bristol-city-vs-sheffield-united": "2026-10-17 17:00",
  "norwich-city-vs-portsmouth": "2026-10-17 17:00",
  "southampton-vs-bolton-wanderers": "2026-10-17 17:00",
  "swansea-city-vs-west-ham-united": "2026-10-17 17:00",
  "genclerbirligi-vs-galatasaray": "2026-10-17 16:00",
  "fenerbahce-vs-alanyaspor": "2026-10-17 19:00",
};

const cairoDay = (iso: string) => {
  const p = siteParts(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.date)}`;
};
const cairoDayTime = (iso: string) => {
  const p = siteParts(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${cairoDay(iso)} ${pad(p.hours)}:${pad(p.minutes)}`;
};

const published = EDITORIAL_FIXTURES_OCTOBER_2026;
const all: AdminMatch[] = [...INITIAL_ADMIN_MATCHES];

test("all three matchdays (15, 16, 17 Oct 2026) are present with exact counts", () => {
  const days = new Set(published.map((m) => cairoDay(m.scheduledAt)));
  assert.deepEqual([...days].sort(), ["2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.equal(published.filter((m) => cairoDay(m.scheduledAt) === "2026-10-15").length, 21);
  assert.equal(published.filter((m) => cairoDay(m.scheduledAt) === "2026-10-16").length, 44);
  assert.equal(published.filter((m) => cairoDay(m.scheduledAt) === "2026-10-17").length, 54);
});

test("the UTC instant equals the Cairo wall clock the desk wrote", () => {
  for (const [slug, sheet] of Object.entries(DESK_SHEET)) {
    const match = published.find((m) => m.slug === slug);
    assert.ok(match, `missing published fixture: ${slug}`);
    assert.equal(cairoDayTime(match!.scheduledAt), sheet, `kickoff moved for ${slug}`);
  }
  assert.equal(Object.keys(DESK_SHEET).length, published.length, "the sheet and the seed have the same rows");
});

test("no published record claims a result or a non-schedule state", () => {
  for (const m of published) {
    assert.equal(m.status, "upcoming", `${m.slug}: editorial fixtures are schedule entries`);
    assert.equal(m.homeScore, null);
    assert.equal(m.awayScore, null);
    assert.ok(Number.isFinite(Date.parse(m.scheduledAt)), `${m.slug}: kickoff must parse`);
    assert.equal(new Date(m.scheduledAt).toISOString(), m.scheduledAt, `${m.slug}: kickoff must be a UTC instant`);
  }
});

test("slugs and ids are unique, URL-safe public identifiers", () => {
  const slugs = all.map((m) => m.slug);
  const ids = all.map((m) => m.id);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate slug");
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  for (const m of published) {
    assert.match(m.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${m.slug}: slug must be URL-safe Latin`);
  }
});

test("every record carries the competition, season and round the desk declared", () => {
  for (const m of published) {
    assert.ok(m.competitionSlug.length > 2, `${m.slug}: competition slug`);
    assert.ok(m.competitionName.length > 2, `${m.slug}: competition name`);
    // The English surfaces must never render Arabic chrome: every record needs a
    // Latin competition name (the catalogue covers the majors, this field covers
    // the rest), exactly like its two team names.
    assert.match(m.competitionNameEn, /^[A-Za-z0-9 .&\-']+$/, `${m.slug}: Latin competition name`);
    assert.match(m.homeNameEn, /\p{L}/u, `${m.slug}: home name in Latin`);
    assert.match(m.awayNameEn, /\p{L}/u, `${m.slug}: away name in Latin`);
    assert.equal(m.season, "2026/2027");
    assert.ok(m.round.startsWith("الجولة "), `${m.slug}: round label`);
    assert.equal(m.sport, "football");
    assert.equal(m.createdBy, "editorial");
    assert.equal(m.isPublished, true);
  }
});

test("channels are declared per match, bounded, deduped and trimmed", () => {
  for (const m of published) {
    assert.ok(m.channels.length > 0, `${m.slug}: the desk declared at least one channel`);
    assert.ok(m.channels.length <= MAX_MATCH_CHANNELS, `${m.slug}: too many channels`);
    for (const channel of m.channels) {
      assert.equal(channel, channel.trim(), `${m.slug}: "${channel}" is not trimmed`);
      assert.ok(channel.length <= 80, `${m.slug}: channel name too long`);
    }
    const lowered = m.channels.map((c) => c.toLowerCase());
    assert.equal(new Set(lowered).size, lowered.length, `${m.slug}: duplicate channels`);
  }
});

test("logos are real crest URLs or empty — never a placeholder CDN", () => {
  // Only CDNs the platform already renders elsewhere, and only the plain
  // image URL of each one — a truncated hash or a swapped club id is a broken
  // badge that no other test would catch.
  const sources: Array<[string, RegExp]> = [
    ["https://crests.football-data.org/", /^https:\/\/crests\.football-data\.org\/\d+\.png$/],
    ["https://media.api-sports.io/", /^https:\/\/media\.api-sports\.io\/football\/teams\/\d+\.png$/],
    ["https://r2.thesportsdb.com/", /^https:\/\/r2\.thesportsdb\.com\/images\/media\/team\/badge\/[a-z0-9]+\.png$/],
    ["https://img.thesports.com/", /^https:\/\/img\.thesports\.com\/football\/team\/[a-f0-9]{32}\.(png|jpg|webp|jfif)$/],
  ];
  for (const m of all) {
    for (const logo of [m.homeLogo, m.awayLogo]) {
      if (!logo) continue;
      const source = sources.find(([host]) => logo.startsWith(host));
      assert.ok(source, `${m.slug}: unexpected logo host ${logo}`);
      assert.match(logo, source![1], `${m.slug}: logo is not a plain crest URL — ${logo}`);
    }
    if (m.homeLogo && m.awayLogo) {
      assert.notEqual(m.homeLogo, m.awayLogo, `${m.slug}: both sides wear the same crest`);
    }
  }
});

test("the Arabic headline clubs keep a real badge (a silent loss shows up as a monogram)", () => {
  // The crest set for Egypt/Saudi/Gulf clubs is what the desk cannot check by
  // eye on every deploy — so pin the ones whose badge disappearing would be
  // noticed on the homepage first.
  const mustHaveCrest = ["Al Ahly", "Zamalek", "Pyramids FC", "Ismaily", "Al Hilal", "Al Nassr", "Al Ittihad", "Al Sadd", "Al Rayyan", "Sharjah", "Al Ain"];
  for (const name of mustHaveCrest) {
    const row = all.find((m) => m.homeNameEn === name || m.awayNameEn === name);
    assert.ok(row, `${name}: no longer in the editorial seed`);
    const logo = row!.homeNameEn === name ? row!.homeLogo : row!.awayLogo;
    assert.ok(logo, `${name}: lost its crest — the site would fall back to a monogram`);
  }
});

test("the record the desk could not publish stays unpublished", () => {
  assert.equal(UNPUBLISHED_EDITORIAL_FIXTURES.length, 1);
  const draft = UNPUBLISHED_EDITORIAL_FIXTURES[0];
  assert.equal(draft.isPublished, false);
  assert.ok(!published.some((m) => m.slug === draft.slug), "a draft must not be in the published seed");
  assert.ok(all.some((m) => m.id === draft.id), "the draft is still stored for the desk");
});

test("the fixture keeps the channel list, and copying it cannot mutate the record", () => {
  const source = published[0];
  const fixture = adminMatchToFixture(source);
  assert.deepEqual(fixture.channels, source.channels);
  assert.equal(fixture.round, source.round);
  fixture.channels!.push("Injected");
  assert.ok(!source.channels.includes("Injected"), "the store must not share the array with the fixture");

  const noChannels: AdminMatch = { ...source, channels: [] };
  assert.equal(adminMatchToFixture(noChannels).channels, null, "no declared list → nothing, not an empty claim");
});

test("parseChannelList is the single normalizer for every input shape", () => {
  assert.deepEqual(parseChannelList("ON Time Sports 1, beIN SPORTS"), ["ON Time Sports 1", "beIN SPORTS"]);
  assert.deepEqual(parseChannelList("ON Time Sports 1، beIN SPORTS؛Sky Sports | ADTV"), [
    "ON Time Sports 1",
    "beIN SPORTS",
    "Sky Sports",
    "ADTV",
  ]);
  assert.deepEqual(parseChannelList(["beIN SPORTS", " beIN sports ", ""]), ["beIN SPORTS"], "dedupe is case-insensitive");
  assert.deepEqual(parseChannelList(""), []);
  assert.deepEqual(parseChannelList(null), []);
  assert.equal(parseChannelList("a,b,c,d,e,f,g,h").length, MAX_MATCH_CHANNELS, "the cap holds");
});

test("the disk store mirrors the code seed", () => {
  const file = path.join(process.cwd(), "db", "admin-matches.json");
  const disk: AdminMatch[] = JSON.parse(fs.readFileSync(file, "utf-8"));
  assert.equal(disk.length, INITIAL_ADMIN_MATCHES.length, "db/admin-matches.json is out of sync with the seed");
  for (const [index, record] of disk.entries()) {
    const seeded = INITIAL_ADMIN_MATCHES[index];
    assert.equal(record.id, seeded.id);
    assert.equal(record.slug, seeded.slug);
    assert.equal(record.scheduledAt, seeded.scheduledAt);
    assert.deepEqual(record.channels, seeded.channels, `${record.slug}: channels drifted`);
    assert.equal(record.competitionNameEn, seeded.competitionNameEn, `${record.slug}: English competition name drifted`);
    assert.equal(record.round, seeded.round, `${record.slug}: round drifted`);
    assert.equal(record.homeLogo, seeded.homeLogo, `${record.slug}: home crest drifted`);
    assert.equal(record.awayLogo, seeded.awayLogo, `${record.slug}: away crest drifted`);
    assert.equal(record.isPublished, seeded.isPublished, `${record.slug}: publish state drifted`);
  }
});
