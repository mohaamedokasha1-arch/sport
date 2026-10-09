import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel } from "@/components/admin/ui";
import MatchFeedPanel from "@/components/admin/MatchFeedPanel";
import { fixtures as loadFixtures } from "@/lib/sdl-gateway";
import { requirePermission } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminUpcomingMatches() {
  await requirePermission("matches");
  const result = await loadFixtures({ sport: "football" });
  const now = Date.now();
  const matches = result.ok
    ? result.data
        .filter((fixture) => fixture.status === "scheduled" && +new Date(fixture.scheduledAt) >= now)
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
        .slice(0, 40)
    : [];

  return (
    <div>
      <AdminHead
        title="المباريات القادمة"
        subtitle="مواعيد كرة القدم كما وردت من مزوّدي البيانات · ربط الناقل الرسمي يتم لكل مباراة على حدة"
        action={
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/live-matches"><Btn tone="ghost">المباريات المباشرة</Btn></Link>
            <Link href="/admin/broadcast#match-stream-form"><Btn>إدارة البث الموثّق</Btn></Link>
          </span>
        }
      />

      {result.ok ? (
        <MatchFeedPanel
          title="جدول المباريات القادمة"
          matches={matches}
          mode="upcoming"
          source={result.source}
          stale={result.stale}
          fetchedAt={result.fetchedAt}
          emptyTitle="لا توجد مباريات قادمة في نافذة المصدر"
          emptyMessage="لم يُرجع مزوّد البيانات مباريات مجدولة مستقبلية ضمن نافذة التغطية الحالية. المواعيد هنا للقراءة فقط؛ لا ننشئ مواعيد أو فرقًا غير موجودة في المصدر."
        />
      ) : (
        <Panel title="جدول المباريات القادمة">
          <NotConnected
            title="تعذّر جلب جدول المباريات"
            message="لم تُرجع طبقة البيانات قائمة صالحة هذه المرة. راجع صحة المزوّدين أو أعد المحاولة لاحقًا؛ لن نستبدل البيانات المفقودة بجدول تقديري."
            requires="مصدر مباريات متاح — راجع مزوّدي البيانات"
          />
        </Panel>
      )}

      <div className="mt-4 rounded-[3px] border border-navy-800 bg-navy-900/60 px-4 py-3 text-[11px] leading-relaxed text-white/50">
        المواعيد والفرق والحالة تأتي من مزوّد البيانات ولا يمكن إنشاؤها أو حذفها من لوحة الإدارة. استخدم «ربط ناقل» لإضافة مصدر بث للمباراة؛ يُقبل الرابط وفق سياسة النطاقات المفعّلة (الوضع الحر افتراضيًا: أي رابط https).
      </div>
    </div>
  );
}
