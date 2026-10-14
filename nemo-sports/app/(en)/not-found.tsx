import type { Metadata } from "next";
import NotFoundBody, { notFoundMetadata } from "@/views/not-found";

export const metadata: Metadata = notFoundMetadata("en");

export default function NotFound() {
  return <NotFoundBody locale="en" />;
}
