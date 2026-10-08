import { redirect } from "next/navigation";
import { decodeSlug } from "@/lib/slug";

export default async function MatchLegacyRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const decoded = decodeSlug(slug);
  redirect(`/matches/${encodeURIComponent(decoded)}`);
}
