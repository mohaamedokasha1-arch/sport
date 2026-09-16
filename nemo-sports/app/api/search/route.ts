import { NextResponse } from "next/server";
import { teams, players, competitions, sports } from "@/lib/core-data";
import { articles } from "@/lib/data";

export const dynamic = "force-dynamic";

type Hit = { id: string; type: string; title: string; sub: string; url: string; weight: number };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "")
    .trim();

export async function GET(req: Request) {
  const q = norm(new URL(req.url).searchParams.get("q") ?? "");
  if (q.length < 2) return NextResponse.json([]);

  const hits: Hit[] = [];
  const match = (s: string) => norm(s).includes(q);

  for (const t of teams) {
    if (match(t.name) || match(t.nameEn) || match(t.short)) {
      hits.push({
        id: t.slug,
        type: "فريق",
        title: t.name,
        sub: `${sports.find((s) => s.slug === t.sport)?.name ?? ""} · ${t.country}`,
        url: `/teams/${t.slug}`,
        weight: norm(t.name).startsWith(q) ? 3 : 2,
      });
    }
  }

  for (const p of players) {
    if (match(p.name) || match(p.nameEn)) {
      hits.push({
        id: p.slug,
        type: "لاعب",
        title: p.name,
        sub: `${p.position} · ${p.nationality}`,
        url: `/players/${p.slug}`,
        weight: norm(p.name).startsWith(q) ? 3 : 2,
      });
    }
  }

  for (const c of competitions) {
    if (match(c.name) || match(c.nameEn) || match(c.code)) {
      hits.push({
        id: c.slug,
        type: "بطولة",
        title: c.name,
        sub: `${c.country} · ${c.season}`,
        url: `/competitions/${c.slug}`,
        weight: 2,
      });
    }
  }

  for (const a of articles) {
    if (match(a.title) || match(a.excerpt)) {
      hits.push({
        id: a.slug,
        type: "خبر",
        title: a.title,
        sub: `${a.category} · ${a.author}`,
        url: `/news/${a.slug}`,
        weight: 1,
      });
    }
  }

  hits.sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "ar"));
  return NextResponse.json(hits.slice(0, 8).map(({ weight: _w, ...h }) => h));
}
