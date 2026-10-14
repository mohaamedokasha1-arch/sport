import { permanentRedirect } from "next/navigation";
import { decodeSlug } from "@/lib/slug";

/**
 * English mirror of the legacy singular path `/en/match/{slug}` →
 * `/en/matches/{slug}`. Same fixed, permanent (308) mapping as the Arabic
 * route, so a deep link keeps working whichever language it was shared in.
 */
export default async function MatchLegacyRedirectPageEn({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const decoded = decodeSlug(slug);
  permanentRedirect(`/en/matches/${encodeURIComponent(decoded)}`);
}
