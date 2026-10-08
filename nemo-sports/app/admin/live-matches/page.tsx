import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel } from "@/components/admin/ui";
import MatchFeedPanel, { isLiveFixture } from "@/components/admin/MatchFeedPanel";
import { liveMatches as loadLiveMatches } from "@/lib/sdl-gateway";
import { requireUser } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLiveMatches() {
  await requireUser();
  const result = await loadLiveMatches("football");
  const matches = result.ok
    ? result.data.filter(isLiveFixture).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    : [];

  return (
    <div>
      <AdminHead
        title="المباريات المباشرة"
        subtitle="مباريات كرة القدم الجارية من طبقة البيانات · صحّح النتيجة عند الحاجة دون تعديل مصدر المزوّد"
        action={
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/upcoming-matches"><Btn tone="ghost">المباريات القادمة</Btn></Link>
            <Link href="/admin/matches"><Btn>مراجعة النتائج</Btn></Link>
          </span>
        }
      />

      {result.ok ? (
        <MatchFeedPanel
          title="لوحة المباريات الجارية"
          matches={matches}
          mode="live"
          source={result.source}
          stale={result.stale}
          fetchedAt={result.fetchedAt}
          emptyTitle="لا توجد مباراة جارية في المصدر"
          emptyMessage="لم تُرجع طبقة البيانات مباراة كرة قدم بحالة مباشرة الآن. لا تُعرض نتائج تجريبية في الإنتاج عند غياب المصدر."
        />
      ) : (
        <Panel title="لوحة المباريات الجارية">
          <NotConnected
            title="تعذّر جلب المباريات المباشرة"
            message="لم تُرجع طبقة البيانات قائمة صالحة هذه المرة. أعد المحاولة لاحقًا أو راجع صحة المزوّدين؛ لا نعرض نتيجة أو حالة مُخمّنة."
            requires="مصدر مباريات متاح — راجع مزوّدي البيانات"
          />
        </Panel>
      )}

      <div className="mt-4 rounded-[3px] border border-navy-800 bg-navy-900/60 px-4 py-3 text-[11px] leading-relaxed text-white/50">
        يُحدّث المزوّد النتيجة والحالة. أي تصحيح يدوي يُحفظ كتجاوز إداري موثّق ويظل منفصلًا عن بيانات المزوّد، ويمكن التراجع عنه من صفحة تصحيح النتائج.
      </div>
    </div>
  );
}
