import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel, Pill } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin-session";
import { listAdminCompetitions } from "@/lib/admin-competitions";
import { competitions as builtInCompetitions } from "@/lib/core-data";
import { diagnostics } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * الترتيب — read-only by design. Standings come from the data providers
 * (Football-Data / SportScore) and are never typed by hand, so this page
 * shows what the public pages can actually serve and links to them.
 */
export default async function AdminStandings() {
  await requirePermission("standings");
  const [managed, d] = await Promise.all([listAdminCompetitions({ limit: 200 }), diagnostics()]);
  const providerReady = d.health.some((h) => h.status === "healthy");

  return (
    <div>
      <AdminHead
        title="الترتيب"
        subtitle="جداول الترتيب تُقرأ من مزوّدي البيانات — لا تُدخَل يدويًا"
        action={<Link href="/admin/providers"><Btn tone="ghost">مزوّدو البيانات</Btn></Link>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="البطولات وروابط الترتيب العامة" aside={<Pill tone={providerReady ? "ok" : "warn"}>{providerReady ? "مزوّد متاح" : "لا يوجد مزوّد سليم الآن"}</Pill>}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...managed.map((c) => ({ slug: c.slug, name: c.nameAr, source: "إدارة" })),
              ...builtInCompetitions.map((c) => ({ slug: c.slug, name: c.name, source: "كتالوج" }))].map((c) => (
              <li key={`${c.source}-${c.slug}`} className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2 text-[12px]">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{c.name}</span>
                  <span className="num text-[10px] text-white/40" dir="ltr">{c.slug}</span>
                </span>
                <Link href={`/competitions/${encodeURIComponent(c.slug)}`} className="shrink-0 text-[11px] font-bold text-gold-400 hover:underline">
                  صفحة البطولة ←
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="ملاحظة">
          <NotConnected
            title="الترتيب للقراءة فقط"
            message="الجداول تأتي من المزوّد المتصل (Football-Data.org / SportScore). إن لم يُرجع المزوّد جدولًا، تعرض صفحة البطولة حالة «البيانات غير متاحة» بدل أرقام مخترعة."
            requires="مزوّد بيانات سليم"
          />
        </Panel>
      </div>
    </div>
  );
}
