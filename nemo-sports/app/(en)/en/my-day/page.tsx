import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/my-day";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("en");
}

export default function Page() {
  return <View locale="en" />;
}
