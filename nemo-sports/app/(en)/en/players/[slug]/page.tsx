import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/player-detail";
import type { Locale } from "@/lib/i18n/locales";
import type { ViewProps } from "@/views/player-detail";

export const revalidate = 1800;
export { generateStaticParams } from "@/views/player-detail";
export function generateMetadata(props: ViewProps): Metadata | Promise<Metadata> {
  return buildMetadata("en", props);
}

export default function Page(props: ViewProps) {
  return <View locale={"en"} {...props} />;
}
