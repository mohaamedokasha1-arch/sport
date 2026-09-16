import Link from "next/link";
import { liveMatches } from "@/lib/sdl-gateway";
import { getCanonicalStore } from "@/lib/db/pg";
import type { UUID } from "@/packages/sdl/src";

/**
 * «لوحة المزوّد» — أول مقطع في الواجهة يُغذّى من طبقة البيانات فعلًا.
 * ────────────────────────────────────────────────────────────────
 * يقرأ المباريات المباشرة من SDL (لا من ملف بيانات مكتوب يدويًا)، ويحلّ أسماء
 * الفرق من المخزن الكنسي. حين لا يكون هناك مزوّد حقيقي أو قاعدة بيانات يعرض
 * سبب ذلك صراحةً بدل اختراع مباريات — لا بيانات وهمية على صفحة مفهرسة.
 */

const STATUS_AR: Record<string, string> = {
  live: "جارية",
  halftime: "استراحة",
  scheduled: "لم تبدأ",
  finished: "انتهت",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
};

export default async function LiveFeed({ sport = "football" }: { sport?: string }) {
  const result = await liveMatches(sport);

  if (!result.ok) {
    return (
      <section className="mb-6 rounded-[6px] border border-line bg-white p-4 dark:border-navy-800 dark:bg-navy-900">
        <h2 className="mb-2 text-[15px] font-extrabold">لوحة المزوّد الحيّة</h2>
        <p className="text-[13px] leading-6 text-ink-soft dark:text-white/60">
          لا توجد بيانات مباشرة الآن ({result.error.kind}). الطبقة تعمل بمحوّل «demo» حتى تُضاف
          مفاتيح المزوّدين، وما تراه أسفل هذا المربع هو بيانات العرض المُنسَّقة يدويًا.
        </p>
      </section>
    );
  }

  const store = await getCanonicalStore();

  // Resolve display names from the canonical store; an unmapped team keeps its
  // provider reference visible rather than being silently invented.
  const names = new Map<string, string>();
  if (store) {
    for (const t of await store.teams.list()) {
      for (const m of await store.mappings.forEntity("team", t.id as UUID)) {
        names.set(`${m.provider}:${m.providerId}`, t.name.ar || t.name.en);
      }
    }
  }

  const rows = result.data;

  return (
    <section className="mb-6 overflow-hidden rounded-[6px] border border-line bg-white dark:border-navy-800 dark:bg-navy-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-navy-800">
        <h2 className="text-[15px] font-extrabold">لوحة المزوّد الحيّة</h2>
        <p className="num text-[11px] text-ink-soft dark:text-white/50">
          المصدر: {result.provider} · {result.fromCache ? "من الكاش" : "طلب جديد"}
          {result.stale ? " · بيانات قديمة (آخر قيمة صالحة)" : ""} · {new Date(result.fetchedAt).toLocaleTimeString("ar-EG")}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-soft dark:text-white/60">لا مباريات مباشرة في هذه اللحظة.</p>
      ) : (
        <ul className="divide-y divide-line dark:divide-navy-800">
          {rows.slice(0, 12).map((f) => (
            <li key={`${f.providerId}`} className="flex items-center gap-3 px-4 py-3">
              <span className="num w-[52px] shrink-0 text-[12px] text-ink-soft dark:text-white/50">
                {new Date(f.scheduledAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                {f.homeProviderId ? names.get(`${result.provider}:${f.homeProviderId}`) ?? `فريق ${f.homeProviderId}` : "—"}
                <span className="mx-2 text-ink-soft dark:text-white/40">ضد</span>
                {f.awayProviderId ? names.get(`${result.provider}:${f.awayProviderId}`) ?? `فريق ${f.awayProviderId}` : "—"}
              </span>
              <span className="num shrink-0 text-[15px] font-extrabold tabular-nums">
                {f.homeScore ?? "–"} : {f.awayScore ?? "–"}
              </span>
              <span className="w-[64px] shrink-0 text-end text-[11px] text-live-red">
                {STATUS_AR[f.status] ?? f.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-line px-4 py-2 text-[11px] text-ink-soft dark:border-navy-800 dark:text-white/40">
        كل سطر هنا جاء عبر طبقة البيانات (SDL) — الواجهة لا تتصل بأي مزوّد مباشرة.{" "}
        <Link href="/admin/providers" className="underline underline-offset-2">
          حالة المزوّدين
        </Link>
      </footer>
    </section>
  );
}
