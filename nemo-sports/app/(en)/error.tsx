"use client";

import ErrorPanel from "@/components/public/ErrorPanel";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} />;
}
