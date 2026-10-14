import type { Metadata } from "next";
import View, { generateMetadata as buildMetadata } from "@/views/about";


export function generateMetadata(): Metadata | Promise<Metadata> {
  return buildMetadata("ar");
}

export default function Page() {
  return <View locale="ar" />;
}
