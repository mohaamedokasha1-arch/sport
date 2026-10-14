import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/fixtures";

export const revalidate = 120;
export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("en");
}

export default function Page() {
  return <View locale="en" />;
}
