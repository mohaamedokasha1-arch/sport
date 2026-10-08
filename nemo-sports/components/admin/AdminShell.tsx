"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { NemoMark } from "@/components/brand/Logo";
import { ROLE_AR, can, type AdminRole } from "@/lib/admin-roles";

type NavItem = { href: string; label: string; exact?: boolean; perm?: string };
type NavGroup = { title: string; items: NavItem[] };

/**
 * The sidebar mirrors the operator's real permissions: items whose permission
 * the signed-in role does not hold are hidden, so an Editor never sees
 * "المستخدمون" or "إعدادات الموقع" at all.
 */
const GROUPS: NavGroup[] = [
  {
    title: "نظرة عامة",
    items: [{ href: "/admin", label: "لوحة البيانات", exact: true }],
  },
  {
    title: "المباريات",
    items: [
      { href: "/admin/matches", label: "المباريات", perm: "matches" },
      { href: "/admin/live", label: "البث المباشر", perm: "streams" },
      { href: "/admin/live-matches", label: "المباريات المباشرة", perm: "matches" },
      { href: "/admin/upcoming-matches", label: "المباريات القادمة", perm: "matches" },
    ],
  },
  {
    title: "المحتوى",
    items: [
      { href: "/admin/news/manual", label: "الأخبار اليدوية", perm: "news" },
      { href: "/admin/news", label: "الأخبار التلقائية (RSS)", perm: "news" },
      { href: "/admin/broadcast", label: "النواقل الرسمية", perm: "broadcast" },
    ],
  },
  {
    title: "الرياضة",
    items: [
      { href: "/admin/teams", label: "الفرق", perm: "teams" },
      { href: "/admin/players", label: "اللاعبون", perm: "players" },
      { href: "/admin/competitions", label: "البطولات", perm: "competitions" },
      { href: "/admin/standings", label: "الترتيب", perm: "standings" },
    ],
  },
  {
    title: "النظام",
    items: [
      { href: "/admin/providers", label: "مصادر البيانات", perm: "providers" },
      { href: "/admin/activity", label: "سجل العمليات", perm: "activity" },
      { href: "/admin/users", label: "المستخدمون والصلاحيات", perm: "users" },
      { href: "/admin/settings", label: "إعدادات الموقع", perm: "settings" },
    ],
  },
];

type ShellUser = { username: string; role: AdminRole };

export default function AdminShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.perm || !user || can(user.role, item.perm)),
  })).filter((group) => group.items.length > 0);

  // Keep the credential form outside the authenticated navigation chrome. The
  // middleware still owns the route guard; this branch is only presentation.
  if (pathname === "/admin/login") {
    return <div className="min-h-screen bg-[#070e1a] text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#070e1a] text-white">
      <header className="sticky top-0 z-40 flex h-[57px] items-center gap-3 border-b border-navy-800 bg-navy-950/95 px-3 backdrop-blur sm:px-4">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] border border-navy-700 text-lg text-white/75 transition hover:border-gold-500 hover:text-gold-400 sm:hidden"
          aria-label={mobileOpen ? "إغلاق القائمة" : "فتح القائمة"}
          aria-expanded={mobileOpen}
          aria-controls="admin-sidebar"
        >
          <span aria-hidden>{mobileOpen ? "×" : "☰"}</span>
        </button>

        <Link href="/admin" className="flex shrink-0 items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <NemoMark size={26} tone="light" />
          <span className="font-display text-[15px] font-bold tracking-[0.16em] uppercase">
            NEMO <span className="text-gold-500">Admin</span>
          </span>
        </Link>

        <span className="mx-1 hidden h-5 w-px bg-navy-800 sm:block" aria-hidden />

        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="hidden rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-gold-500 hover:text-gold-400 sm:block"
          aria-label={collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"}
        >
          {collapsed ? "توسيع القائمة" : "تصغير القائمة"}
        </button>

        <span className="ms-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <Link href="/" className="whitespace-nowrap text-[11px] font-bold text-white/60 transition hover:text-gold-400">
            عرض الموقع ↗
          </Link>
          {user ? (
            <span className="hidden items-center gap-2 rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] sm:flex">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-gold-500/20 text-[10px] font-extrabold text-gold-400" aria-hidden>
                {user.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[10rem] truncate">
                <span className="block truncate font-bold leading-none">{user.username}</span>
                <span className="block text-[10px] text-white/45">{ROLE_AR[user.role] ?? user.role}</span>
              </span>
            </span>
          ) : null}
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="whitespace-nowrap rounded-[3px] border border-navy-700 px-2.5 py-1.5 text-[11px] font-bold text-white/65 transition hover:border-live hover:text-live disabled:opacity-50"
          >
            {loggingOut ? "جارٍ الخروج…" : "خروج"}
          </button>
        </span>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-x-0 bottom-0 top-[57px] z-30 bg-black/60 sm:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="إغلاق القائمة"
        />
      ) : null}

      <div className="flex">
        <aside
          id="admin-sidebar"
          className={`fixed inset-y-[57px] end-0 z-50 flex ${collapsed ? "w-14" : "w-64"} flex-col overflow-y-auto border-s border-navy-800 bg-navy-950 p-3 transition-transform duration-200 sm:sticky sm:top-[57px] sm:z-auto sm:h-[calc(100vh-57px)] sm:translate-x-0 ${
            mobileOpen ? "translate-x-0" : "translate-x-full"
          } ${collapsed ? "sm:w-14" : "sm:w-60"}`}
          aria-label="التنقل الإداري"
        >
          <div className="flex-1">
            {visibleGroups.map((group) => (
              <nav key={group.title} className="mb-4" aria-label={group.title}>
                {!collapsed ? (
                  <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                    {group.title}
                  </p>
                ) : null}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href, item.exact);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMobileOpen(false)}
                          title={collapsed ? item.label : undefined}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2 rounded-[3px] px-2.5 py-2 text-[12px] font-bold transition ${
                            active
                              ? "bg-gold-500 text-navy-900"
                              : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
                          {!collapsed ? <span className="min-w-0 truncate">{item.label}</span> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            ))}
          </div>

          {!collapsed ? (
            <div className="mt-2 space-y-2">
              <p className="rounded-[3px] border border-navy-800 p-2.5 text-[10px] leading-relaxed text-white/40">
                كل إجراء إداري يُسجَّل في سجل العمليات مع اسم المشغّل والوقت. البث لا يُنشر إلا
                من نطاقات رسمية موثّقة.
              </p>
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="w-full rounded-[3px] border border-navy-700 px-2.5 py-2 text-[12px] font-bold text-white/70 transition hover:border-live hover:text-live disabled:opacity-50"
              >
                {loggingOut ? "جارٍ الخروج…" : "تسجيل الخروج"}
              </button>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
