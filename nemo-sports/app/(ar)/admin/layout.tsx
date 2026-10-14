import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";
import { getSessionUser } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "لوحة التحكم | نيمو سبورتس", template: "%s | لوحة التحكم" },
  // The panel must never be indexed: noindex + nofollow on every /admin/*
  // route, robots.txt disallows /admin, and the sitemap never lists it.
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <AdminShell user={user ? { username: user.username, role: user.role } : null}>{children}</AdminShell>
  );
}
