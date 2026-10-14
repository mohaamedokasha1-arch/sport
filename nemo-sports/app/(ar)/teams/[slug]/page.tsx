import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/team-detail";
import type { Locale } from "@/lib/i18n/locales";
import type { ViewProps } from "@/views/team-detail";

export const revalidate = 1800;
export { generateStaticParams } from "@/views/team-detail";
export function generateMetadata(props: ViewProps): Metadata | Promise<Metadata> {
  return buildMetadata("ar", props);
}

export default function Page(props: ViewProps) {
  return <View locale={"ar"} {...props} />;
}
