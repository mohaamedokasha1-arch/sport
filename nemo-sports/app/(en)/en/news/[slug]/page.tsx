import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/news-detail";
import type { Locale } from "@/lib/i18n/locales";
import type { ViewProps } from "@/views/news-detail";

export const revalidate = 900;
export { generateStaticParams } from "@/views/news-detail";
export function generateMetadata(props: ViewProps): Metadata | Promise<Metadata> {
  return buildMetadata("en", props);
}

export default function Page(props: ViewProps) {
  return <View locale={"en"} {...props} />;
}
