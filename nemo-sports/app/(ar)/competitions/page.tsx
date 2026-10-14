import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/competitions";
import type { Locale } from "@/lib/i18n/locales";
import type { ViewProps } from "@/views/competitions";

export const dynamic = "force-dynamic";
export function generateMetadata(props: ViewProps): Metadata | Promise<Metadata> {
  return buildMetadata("ar", props);
}

export default function Page(props: ViewProps) {
  return <View locale={"ar"} {...props} />;
}
