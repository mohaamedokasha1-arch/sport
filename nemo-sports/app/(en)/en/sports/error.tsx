"use client";
import DataReadError from "@/components/public/DataReadError";
export default function Error({ reset }: { reset: () => void }) { return <DataReadError reset={reset} />; }
