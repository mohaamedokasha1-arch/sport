import type { Metadata } from "next";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: { default: "لوحة التحكم | نيمو سبورتس", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
