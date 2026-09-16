"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NemoMark } from "@/components/brand/Logo";

const GROUPS = [
  {
    title: "المحتوى",
    items: [
      { href: "/admin", label: "لوحة البيانات", exact: true },
      { href: "/admin/articles", label: "المقالات والأخبار" },
      { href: "/admin/matches", label: "المباريات والنتائج" },
    ],
  },
  {
    title: "الرياضة",
    items: [
      { href: "/admin/competitions", label: "البطولات والفرق" },
      { href: "/admin/broadcast", label: "البث والترخيص" },
    ],
  },
  {
    title: "المنصة",
    items: [
      { href: "/admin/providers", label: "مزوّدو البيانات" },
      { href: "/admin/users", label: "المستخدمون والصلاحيات" },
      { href: "/admin/ads", label: "الإعلانات" },
      { href: "/admin/seo", label: "SEO والبيانات" },
    ],
  },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-[#070e1a] text-white">
      {/* top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-navy-800 bg-navy-950/95 px-4 py-3 backdrop-blur">
        <Link href="/admin" className="flex items-center gap-2.5">
          <NemoMark size={26} tone="light" />
          <span className="font-display text-[15px] font-bold tracking-[0.16em] uppercase">
            NEMO <span className="text-gold-500">Admin</span>
          </span>
        </Link>

        <span className="mx-2 hidden h-5 w-px bg-navy-800 sm:block" aria-hidden />

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="hidden rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-gold-500 hover:text-gold-400 sm:block"
        >
          {collapsed ? "توسيع القائمة" : "تصغير القائمة"}
        </button>

        <span className="ms-auto flex items-center gap-3">
          <Link href="/" className="text-[11px] font-bold text-white/60 transition hover:text-gold-400">
            عرض الموقع ↗
          </Link>
          <span className="hidden items-center gap-2 rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] sm:flex">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-500 text-[10px] font-extrabold text-navy-900">
              م
            </span>
            <span>
              <span className="block font-bold leading-none">مدير المنصة</span>
              <span className="block text-[10px] text-white/45">Super Admin</span>
            </span>
          </span>
        </span>
      </header>

      <div className="flex">
        {/* sidebar */}
        <aside
          className={`sticky top-[57px] hidden h-[calc(100vh-57px)] shrink-0 overflow-y-auto border-e border-navy-800 bg-navy-950 p-3 sm:block ${
            collapsed ? "w-14" : "w-60"
          }`}
        >
          {GROUPS.map((g) => (
            <nav key={g.title} className="mb-4" aria-label={g.title}>
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                  {g.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-bold transition ${
                          active
                            ? "bg-gold-500 text-navy-900"
                            : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
                        {!collapsed ? item.label : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          {!collapsed ? (
            <p className="mt-6 rounded-[3px] border border-navy-800 p-2.5 text-[10px] leading-relaxed text-white/40">
              النسخة التجريبية للوحة التحكم: الواجهات كاملة، والحفظ غير موصول بقاعدة بيانات.
            </p>
          ) : null}
        </aside>

        {/* content */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
