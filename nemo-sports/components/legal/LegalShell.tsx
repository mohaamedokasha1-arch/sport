import type { ReactNode } from "react";
import type { Metadata } from "next";

export function LegalShell({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="num mt-2 text-[12px] text-muted">آخر تحديث: {updated}</p>
      <div className="mt-6 space-y-6 text-[14px] leading-[1.9] text-muted">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[16px] font-extrabold text-ink">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export const legalMetadata = (title: string, description: string, canonical: string): Metadata => ({
  title,
  description,
  alternates: { canonical },
});
