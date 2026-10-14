import type { Metadata } from "next";
import NotFoundBody, { notFoundMetadata } from "@/views/not-found";

export const metadata: Metadata = notFoundMetadata("ar");

export default function NotFound() {
  return <NotFoundBody locale="ar" />;
}
