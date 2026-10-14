import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/watch";

export const revalidate = 60;
export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("ar");
}

export default function Page() {
  return <View locale="ar" />;
}
