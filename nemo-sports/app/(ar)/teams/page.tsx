import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/teams";

export const revalidate = 900;
export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("ar");
}

export default function Page() {
  return <View locale="ar" />;
}
