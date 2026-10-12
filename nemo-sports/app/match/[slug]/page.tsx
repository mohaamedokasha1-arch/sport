import { permanentRedirect } from "next/navigation";
import { decodeSlug } from "@/lib/slug";

/**
 * Legacy singular path `/match/{slug}` → `/matches/{slug}`.
 *
 * This is a fixed, permanent URL mapping, so it answers 308 (Permanent). It used
 * to call `redirect()`, which answers 307 — a temporary signal that leaves search
 * engines split between the two URLs instead of consolidating on /matches/.
 */
export default async function MatchLegacyRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const decoded = decodeSlug(slug);
  permanentRedirect(`/matches/${encodeURIComponent(decoded)}`);
}
