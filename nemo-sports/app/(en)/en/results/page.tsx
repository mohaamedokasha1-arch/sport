import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/results";
import type { Locale } from "@/lib/i18n/locales";
import type { ViewProps } from "@/views/results";

export const revalidate = 120;
export function generateMetadata(props: ViewProps): Metadata | Promise<Metadata> {
  return buildMetadata("en", props);
}

export default function Page(props: ViewProps) {
  return <View locale={"en"} {...props} />;
}
