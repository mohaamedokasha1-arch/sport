import type { MetadataRoute } from "next";
import { allMatches, articles, competitions, players, teams } from "@/lib/data";

const BASE = "https://nemo.sports";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages = [
    "",
    "/matches",
    "/live",
    "/results",
    "/fixtures",
    "/competitions",
    "/teams",
    "/players",
    "/news",
    "/watch",
    "/standings",
    "/search",
    "/about",
    "/contact",
    "/faq",
    "/broadcast-rights",
    "/privacy",
    "/terms",
    "/copyright",
  ].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: (path === "" ? "hourly" : "daily") as "hourly" | "daily",
    priority: path === "" ? 1 : 0.7,
  }));

  return [
    ...staticPages,
    ...allMatches.map((m) => ({
      url: `${BASE}/matches/${m.slug}`,
      lastModified: new Date(m.kickoff),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...competitions.map((c) => ({
      url: `${BASE}/competitions/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...teams.map((t) => ({
      url: `${BASE}/teams/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...players.map((p) => ({
      url: `${BASE}/players/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...articles.map((a) => ({
      url: `${BASE}/news/${a.slug}`,
      lastModified: new Date(Date.now() - a.publishedAgoMin * 60000),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
