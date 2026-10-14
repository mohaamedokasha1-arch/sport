import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/players";

export const revalidate = 1800;
export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("en");
}

export default function Page() {
  return <View locale="en" />;
}
