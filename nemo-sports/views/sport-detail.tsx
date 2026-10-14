import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { syncedBySlug } from "@/lib/sports-sync/read";
import { fixtureErrors, type Kind } from "@/lib/sports-sync/model";
import { SyncedEntityDetail } from "@/components/data/SyncedSports";
import type { NormalizedFixture } from "@/packages/sdl/src";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = { params: Promise<{ kind: string; slug: string }> };

export const dynamic = "force-dynamic";
const kinds: Record<string, Kind> = { matches: "fixture", teams: "team", players: "player" };
async function entity(params: Promise<{ kind: string; slug: string }>) {
  const { kind, slug } = await params;
  if (!kinds[kind]) return null;
  return syncedBySlug(kinds[kind], slug);
}
export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  const r = await entity(params);
  if (!r) return { title: t(locale, "sp.unavailable"), robots: { index: false } };
  const { kind } = await params;
  const title = r.kind === "fixture" ? t(locale, "sp.vsTitle", { home: String(r.data.homeName ?? "—"), away: String(r.data.awayName ?? "—") }) : String(r.data.name ?? r.data.fullName);
  // Team/player shells remain noindex until richer editorial/provider content exists.
  return { title, description: t(locale, "sp.metaDescription", { title, provider: String(r.provider) }), alternates: { canonical: `/sports/${kind}/${r.slug}` }, robots: { index: r.kind === "fixture" && fixtureErrors(r.data as unknown as NormalizedFixture).length === 0, follow: true } };
}
export default async function Page({ locale, params }: ViewProps & { locale: Locale }) {
  const r = await entity(params);
  if (!r) notFound();
  return <SyncedEntityDetail record={r} />;
}
