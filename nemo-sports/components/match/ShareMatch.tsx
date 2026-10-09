"use client";
import { useState } from "react";
export default function ShareMatch({ title, path }: { title: string; path: string }) {
  const [message, setMessage] = useState("");
  return <span className="inline-flex flex-wrap items-center gap-2"><button type="button" className="focus-ring min-h-11 rounded border border-line px-3 text-sm" onClick={async () => {
    const url = new URL(path, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); setMessage("نُسخ رابط المباراة."); }
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("تعذّرت المشاركة. يمكنك نسخ الرابط من شريط العنوان."); }
  }}>مشاركة المباراة</button><span role="status" className="text-xs text-muted">{message}</span></span>;
}
