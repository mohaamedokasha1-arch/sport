import Link from "next/link";
import { revalidatePath } from "next/cache";
import { AdminHead, Panel, Pill, Table } from "@/components/admin/ui";
import {
  deleteArticle,
  deleteSource,
  fetchStats,
  getSource,
  listArticles,
  listSources,
  newsBackend,
  recentFetchLog,
  createSource,
  setArticleStatus,
  updateSource,
} from "@/lib/news/store";
import { runSource, ingestAllSources } from "@/lib/news/pipeline";
import { logActivity } from "@/lib/activity";
import { invalidateSearchIndex } from "@/lib/search-service";
import { relative } from "@/lib/format";
import { requirePermission } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/* ── server actions ─────────────────────────────────────────── */

async function addSourceAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const query = String(form.get("query") ?? "").trim();
  if (!query) return;
  const created = await createSource({
    query,
    language: form.get("language") === "ar" ? "ar" : "en",
    country: String(form.get("country") ?? "US"),
    category: String(form.get("category") ?? "").trim() || undefined,
    priority: Number(form.get("priority") ?? 3),
    refreshInterval: Number(form.get("refreshInterval") ?? 30),
  });
  await logActivity({ action: "news.source.create", entityType: "rss_source", entityId: created.id, after: { query } });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function toggleSourceAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  const s = await getSource(id);
  if (!s) return;
  await updateSource(id, { enabled: !s.enabled });
  await logActivity({ action: "news.source.toggle", entityType: "rss_source", entityId: id, after: { enabled: !s.enabled } });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function deleteSourceAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  await deleteSource(id);
  await logActivity({ action: "news.source.delete", entityType: "rss_source", entityId: id });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function testFetchAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  const s = await getSource(id);
  if (!s) return;
  await runSource(s, { force: true });
  invalidateSearchIndex();
  await logActivity({ action: "news.source.fetch", entityType: "rss_source", entityId: id });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function fetchAllAction(): Promise<void> {
  "use server";
  await requirePermission("news");
  await ingestAllSources();
  invalidateSearchIndex();
  await logActivity({ action: "news.ingest.run" });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function hideArticleAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  await setArticleStatus(id, "hidden");
  invalidateSearchIndex();
  await logActivity({ action: "news.article.status", entityType: "news_article", entityId: id, after: { status: "hidden" } });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function publishArticleAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  await setArticleStatus(id, "published");
  invalidateSearchIndex();
  await logActivity({ action: "news.article.status", entityType: "news_article", entityId: id, after: { status: "published" } });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

async function removeArticleAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("news");
  const id = String(form.get("id") ?? "");
  await deleteArticle(id);
  invalidateSearchIndex();
  await logActivity({ action: "news.article.delete", entityType: "news_article", entityId: id });
  revalidatePath("/news");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
}

/* ── page ───────────────────────────────────────────────────── */

const inputCls =
  "w-full rounded-[3px] border border-navy-700 bg-navy-950 px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-gold-500 focus:outline-none";

const btnGhost =
  "rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400";

export default async function AdminNews({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("news");
  const sp = await searchParams;
  const catFilter = typeof sp.category === "string" ? sp.category : "";

  const [sources, backend, stats, log, feed] = await Promise.all([
    listSources(),
    newsBackend(),
    fetchStats(7),
    recentFetchLog(12),
    listArticles({ limit: 30, includeNonPublished: true, ...(catFilter ? { category: catFilter } : {}) }),
  ]);

  const enabled = sources.filter((s) => s.enabled);
  const healthy = enabled.filter((s) => s.consecutiveFailures === 0);
  const failing = enabled.filter((s) => s.consecutiveFailures > 0);
  const categories = [...new Set(feed.items.map((a) => a.category))];

  const statusOf = (s: (typeof sources)[number]): { tone: "ok" | "warn" | "bad" | "idle"; label: string } => {
    if (!s.enabled) return { tone: "idle", label: "معطّل" };
    if (s.consecutiveFailures >= 3) return { tone: "bad", label: "متعثر" };
    if (s.consecutiveFailures > 0) return { tone: "warn", label: "تحذير" };
    if (!s.lastSuccessfulFetch) return { tone: "idle", label: "لم يُجلب بعد" };
    return { tone: "ok", label: "سليم" };
  };

  return (
    <div>
      <AdminHead
        title="الأخبار التلقائية"
        subtitle={`مصادر RSS · الاستيعاب · الإشراف — المخزن: ${backend === "postgres" ? "PostgreSQL" : "ذاكرة مؤقتة"}`}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <Link href="/admin/news/manual" className="rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
              + خبر يدوي
            </Link>
            <form action={fetchAllAction}>
              <button
                type="submit"
                className="rounded-[3px] bg-gold-500 px-3 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
              >
                جلب الكل الآن
              </button>
            </form>
          </span>
        }
      />

      {/* overview */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { k: "مصادر RSS", v: sources.length, hint: `${enabled.length} مفعّلة` },
          { k: "سليمة", v: healthy.length, hint: `${failing.length} متعثرة` },
          { k: "مقالات (7 أيام)", v: stats.processed, hint: `${stats.duplicates} مكرر أُزيل` },
          { k: "عمليات جلب (7 أيام)", v: stats.fetches, hint: backend === "postgres" ? "من السجل" : "تقديري (ذاكرة)" },
          { k: "في الخلاصة الآن", v: feed.total, hint: "منشورة + مخفية" },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
            <p className="num mt-0.5 text-[10px] text-white/40">{x.hint}</p>
          </div>
        ))}
      </div>

      {backend === "memory" ? (
        <p className="mb-5 rounded-[6px] border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-[13px] leading-6 text-gold-300">
          لا توجد قاعدة بيانات مُهيّأة (DATABASE_URL) — المصادر والمقالات في ذاكرة العملية وتُفقد عند
          إعادة التشغيل. اضبط DATABASE_URL لجعل الاستيعاب دائمًا.
        </p>
      ) : null}

      {/* sources */}
      <Panel
        title="مصادر RSS"
        aside={<Pill tone={failing.length ? "warn" : "ok"}>{failing.length ? `${failing.length} تحتاج انتباهًا` : "كل المصادر سليمة"}</Pill>}
      >
        <Table
          head={["الاستعلام", "اللغة/الدولة", "الأولوية", "التحديث", "الحالة", "آخر جلب ناجح", "مقالات", "إجراءات"]}
          rows={sources.map((s) => {
            const st = statusOf(s);
            return [
              <span key="q" className="font-bold">{s.query}</span>,
              <span key="l" className="num text-white/60">{s.language}/{s.country}</span>,
              <span key="p" className="num">P{s.priority}</span>,
              <span key="r" className="num text-white/60">كل {s.refreshInterval}د</span>,
              <span key="s">
                <Pill tone={st.tone}>{st.label}</Pill>
                {s.lastError ? (
                  <span className="mt-1 block max-w-[220px] truncate text-[10px] text-live" title={s.lastError}>
                    {s.lastError}
                  </span>
                ) : null}
              </span>,
              <span key="t" className="num text-[11px] text-white/50">
                {s.lastSuccessfulFetch ? relative(s.lastSuccessfulFetch) : "—"}
              </span>,
              <span key="c" className="num">{s.articleCount}</span>,
              <span key="a" className="flex flex-wrap gap-1.5">
                <form action={testFetchAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={btnGhost}>اختبار</button>
                </form>
                <form action={toggleSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className={btnGhost}>{s.enabled ? "تعطيل" : "تفعيل"}</button>
                </form>
                <form action={deleteSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white">
                    حذف
                  </button>
                </form>
              </span>,
            ];
          })}
        />
      </Panel>

      {/* add source + fetch log */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="إضافة مصدر جديد">
          <form action={addSourceAction} className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold text-white/60">استعلام البحث (Google News)</span>
              <input name="query" required className={inputCls} placeholder="مثال: Egyptian Premier League" maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-white/60">اللغة</span>
              <select name="language" className={inputCls} defaultValue="en">
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-white/60">الدولة</span>
              <select name="country" className={inputCls} defaultValue="EG">
                {["EG", "US", "GB", "ES", "IT", "SA", "AE", "FR", "DE"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-white/60">التصنيف المقترح</span>
              <input name="category" className={inputCls} placeholder="Egyptian Football" maxLength={80} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold text-white/60">الأولوية (1 أعلى)</span>
              <select name="priority" className={inputCls} defaultValue="3">
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold text-white/60">التحديث (دقائق)</span>
              <select name="refreshInterval" className={inputCls} defaultValue="30">
                {[15, 30, 60, 120, 240].map((m) => (
                  <option key={m} value={m}>كل {m} دقيقة</option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-[3px] bg-gold-500 px-4 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
              >
                إضافة المصدر
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="سجل الجلب الأخير">
          {log.length === 0 ? (
            <p className="text-[12px] text-white/50">
              لا يوجد سجل بعد — يظهر هنا بعد أول عملية جلب (يتطلب PostgreSQL للاحتفاظ الدائم).
            </p>
          ) : (
            <ul className="space-y-2 text-[11px]">
              {log.map((l, i) => (
                <li key={i} className="rounded-[3px] border border-navy-800 px-2.5 py-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="num truncate font-bold">{l.sourceId.replace(/^rss_/, "")}</span>
                    <Pill tone={l.ok ? "ok" : "bad"}>{l.ok ? "نجح" : "فشل"}</Pill>
                  </span>
                  <span className="num mt-1 block text-white/45">
                    {l.processed} عُولج · {l.inserted} أُضيف · {l.duplicates} مكرر · {relative(l.at)}
                  </span>
                  {l.error ? <span className="mt-0.5 block truncate text-live">{l.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* moderation */}
      <div className="mt-5">
        <Panel
          title={`الإشراف على المقالات (أحدث ${feed.items.length})`}
          aside={
            <span className="flex gap-1.5">
              <a href="/admin/news" className={btnGhost}>الكل</a>
              {categories.slice(0, 6).map((c) => (
                <a key={c} href={`/admin/news?category=${encodeURIComponent(c)}`} className={btnGhost}>
                  {c}
                </a>
              ))}
            </span>
          }
        >
          {feed.items.length === 0 ? (
            <p className="text-[12px] text-white/50">
              لا توجد مقالات بعد. اضغط «جلب الكل الآن» أو انتظر مهمة الـCron المجدولة.
            </p>
          ) : (
            <Table
              head={["العنوان", "المصدر", "التصنيف", "النشر", "الجودة", "الحالة", "إجراءات"]}
              rows={feed.items.map((a) => [
                <a key="t" href={a.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="block max-w-[380px] truncate font-bold hover:text-gold-400" title={a.title}>
                  {a.title}
                </a>,
                <span key="s" className="text-white/60">{a.sourceName}</span>,
                <span key="c" className="text-white/60">{a.category}</span>,
                <span key="d" className="num text-[11px] text-white/50">{relative(a.publicationDate)}</span>,
                <span key="q" className="num">{a.qualityScore}</span>,
                <Pill key="st" tone={a.status === "published" ? "ok" : a.status === "hidden" ? "warn" : "idle"}>
                  {a.status === "published" ? "منشور" : a.status === "hidden" ? "مخفي" : "مؤرشف"}
                </Pill>,
                <span key="a" className="flex flex-wrap gap-1.5">
                  {a.status === "published" ? (
                    <form action={hideArticleAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className={btnGhost}>إخفاء</button>
                    </form>
                  ) : (
                    <form action={publishArticleAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className={btnGhost}>نشر</button>
                    </form>
                  )}
                  <form action={removeArticleAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white">
                      حذف
                    </button>
                  </form>
                </span>,
              ])}
            />
          )}
        </Panel>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        سياسة المحتوى: تُخزَّن البيانات الوصفية فقط (العنوان، المصدر، الوقت، مقتطف RSS قصير) ويُفتح
        النص الكامل لدى الناشر الأصلي دائمًا. لا يُنسخ أي مقال كاملًا على نيمو سبورتس.
      </p>
    </div>
  );
}
