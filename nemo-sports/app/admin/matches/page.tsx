import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, NotConnected, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { allMatches } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";
import { fixtures as sdlFixtures, invalidateMatch } from "@/lib/sdl-gateway";
import {
  OVERRIDE_STATUSES,
  OVERRIDE_STATUS_AR,
  deleteOverride,
  listOverrides,
  upsertOverride,
} from "@/lib/match-overrides";
import { logActivity } from "@/lib/activity";
import type { NormalizedFixture } from "@/packages/sdl/src";

export const dynamic = "force-dynamic";

/* ── server actions ─────────────────────────────────────────── */

function refreshMatchSurfaces(slug: string): void {
  revalidatePath("/admin/matches");
  revalidatePath("/admin/activity");
  revalidatePath("/matches");
  revalidatePath(`/matches/${slug}`);
  revalidatePath("/live");
  revalidatePath("/results");
  revalidatePath("/fixtures");
  revalidatePath("/watch");
}

function parseScore(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

async function upsertOverrideAction(form: FormData): Promise<void> {
  "use server";
  const slug = String(form.get("slug") ?? "").trim();
  const homeScore = parseScore(form.get("homeScore"));
  const awayScore = parseScore(form.get("awayScore"));
  const status = String(form.get("status") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
    redirect(`/admin/matches?err=${encodeURIComponent("النتيجة يجب أن تكون أرقامًا صحيحة غير سالبة")}&slug=${encodeURIComponent(slug)}`);
  }
  const result = await upsertOverride(slug, { homeScore, awayScore, status, note });
  if (!result.ok) {
    redirect(`/admin/matches?err=${encodeURIComponent(result.error.slice(0, 180))}&slug=${encodeURIComponent(slug)}`);
  }
  await logActivity({
    action: "override.upsert",
    entityType: "match",
    entityId: slug,
    after: { homeScore, awayScore, status, note },
  });
  // Purge the SDL cache for this match so the correction shows immediately
  // instead of waiting for the cache TTL to expire.
  await invalidateMatch(slug).catch(() => 0);
  refreshMatchSurfaces(slug);
  redirect(`/admin/matches?ok=1&slug=${encodeURIComponent(slug)}`);
}

async function deleteOverrideAction(form: FormData): Promise<void> {
  "use server";
  const slug = String(form.get("slug") ?? "").trim();
  await deleteOverride(slug);
  await logActivity({ action: "override.delete", entityType: "match", entityId: slug });
  await invalidateMatch(slug).catch(() => 0);
  refreshMatchSurfaces(slug);
}

/* ── display helpers ────────────────────────────────────────── */

const demoTone = { LIVE: "bad", UPCOMING: "idle", FINISHED: "ok", POSTPONED: "warn", CANCELLED: "warn", HT: "bad", SUSPENDED: "warn" } as const;
const demoAr = { LIVE: "جارية", UPCOMING: "قادمة", FINISHED: "انتهت", POSTPONED: "مؤجلة", CANCELLED: "ملغاة", HT: "استراحة", SUSPENDED: "متوقفة" } as const;

function realTone(status: string): "ok" | "warn" | "bad" | "idle" {
  if (["live", "halftime", "extra_time", "penalty_shootout"].includes(status)) return "bad";
  if (status === "scheduled") return "idle";
  if (status === "finished") return "ok";
  return "warn";
}

const realName = (f: NormalizedFixture) =>
  `${f.homeName ?? f.homeProviderId ?? "—"} × ${f.awayName ?? f.awayProviderId ?? "—"}`;

/* ── page ───────────────────────────────────────────────────── */

export default async function AdminMatches({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; err?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const prefill = typeof sp.slug === "string" ? sp.slug : "";
  const err = typeof sp.err === "string" ? sp.err : "";
  const saved = sp.ok === "1";

  const [overrides, real] = await Promise.all([listOverrides(), sdlFixtures({ sport: "football" })]);
  const realList = real.ok ? real.data.slice(0, 20) : [];
  const overrideSlugs = new Set(overrides.map((o) => o.slug));

  return (
    <div>
      <AdminHead
        title="المباريات والنتائج"
        subtitle={`${overrides.length} تجاوز إداري · ${realList.length > 0 ? `${realList.length} مباراة حيّة` : `${allMatches.length} مباراة تجريبية`} · التصحيح يظهر على الموقع فورًا`}
        action={
          <Link href="/admin/activity">
            <Btn tone="ghost">سجل النشاط</Btn>
          </Link>
        }
      />

      {err ? (
        <p className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">
          {err}
        </p>
      ) : null}
      {saved ? (
        <p className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">
          حُفظ التصحيح — يظهر الآن على صفحة المباراة والقوائم والقنوات المرتبطة.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {/* current overrides */}
          <Panel title="تجاوزات الإدارة الحالية" aside={<Pill tone={overrides.length > 0 ? "warn" : "idle"}>{overrides.length} سجل</Pill>}>
            {overrides.length === 0 ? (
              <NotConnected
                title="لا توجد تجاوزات"
                message="بيانات المزوّد تُعرض كما هي. عندما تحتاج تصحيح نتيجة أو حالة مباراة، أدخل معرّفها في النموذج — سيُعرض التصحيح على كل أسطح الموقع مع وسم «مصحّحة من الإدارة»."
                requires="اختر مباراة من الجدول أدناه أو أدخل الـ slug يدويًا"
              />
            ) : (
              <Table
                head={["المباراة (slug)", "النتيجة", "الحالة", "ملاحظة", "آخر تحديث", "إجراءات"]}
                rows={overrides.map((o) => [
                  <span key="s" className="num text-[11px] font-bold" dir="ltr">{o.slug}</span>,
                  <span key="r" className="num font-extrabold">
                    {o.homeScore === null && o.awayScore === null ? "—" : `${o.homeScore ?? "—"} – ${o.awayScore ?? "—"}`}
                  </span>,
                  <span key="st" className="text-[12px]">{o.status ? OVERRIDE_STATUS_AR[o.status] ?? o.status : "—"}</span>,
                  <span key="n" className="max-w-[16rem] truncate text-[11px] text-white/60">{o.note ?? "—"}</span>,
                  <span key="u" className="num whitespace-nowrap text-[11px] text-white/50">
                    {dateAr(o.updatedAt)} · {timeOf(o.updatedAt)}
                  </span>,
                  <span key="a" className="flex gap-1.5">
                    <Link
                      href={`/admin/matches?slug=${encodeURIComponent(o.slug)}#edit`}
                      className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
                    >
                      تعديل
                    </Link>
                    <form action={deleteOverrideAction}>
                      <input type="hidden" name="slug" value={o.slug} />
                      <button
                        type="submit"
                        className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-live hover:text-live"
                      >
                        حذف
                      </button>
                    </form>
                  </span>,
                ])}
              />
            )}
          </Panel>

          {/* reference: real matches first, demo fallback */}
          {realList.length > 0 ? (
            <Panel title="المباريات الحيّة (كرة القدم)" aside={<Pill tone="ok">{realList.length} مباراة</Pill>}>
              <Table
                head={["المباراة", "البطولة", "الموعد", "النتيجة", "الحالة", ""]}
                rows={realList.map((f) => [
                  <span key="t" className="font-bold">
                    {realName(f)}
                    {overrideSlugs.has(f.providerId) ? <Pill key="c" tone="warn">مصحّحة</Pill> : null}
                  </span>,
                  <span key="c" className="max-w-[12rem] truncate text-white/60">{f.competitionName ?? f.competitionProviderId}</span>,
                  <span key="d" className="num whitespace-nowrap">
                    {dateAr(f.scheduledAt)} · {timeOf(f.scheduledAt)}
                  </span>,
                  <span key="s" className="num font-extrabold">
                    {f.homeScore === null || f.awayScore === null ? "— : —" : `${f.homeScore} : ${f.awayScore}`}
                  </span>,
                  <Pill key="st" tone={realTone(f.status)}>{OVERRIDE_STATUS_AR[f.status] ?? f.status}</Pill>,
                  <span key="a" className="flex gap-1.5">
                    <Link
                      href={`/admin/matches?slug=${encodeURIComponent(f.providerId)}#edit`}
                      className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
                    >
                      تصحيح
                    </Link>
                    <Link
                      href={`/matches/${f.providerId}`}
                      className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-gold-500 hover:text-gold-400"
                    >
                      عرض
                    </Link>
                  </span>,
                ])}
              />
            </Panel>
          ) : allMatches.length > 0 ? (
            <Panel title="المباريات التجريبية (بيئة التطوير)" aside={<Pill tone="idle">{allMatches.length} سجل</Pill>}>
              <Table
                head={["المباراة", "البطولة", "الموعد", "النتيجة", "الحالة", ""]}
                rows={allMatches.map((m) => [
                  <span key="t" className="font-bold">
                    {teamBySlug(m.home)?.name} × {teamBySlug(m.away)?.name}
                    {overrideSlugs.has(m.slug) ? <Pill key="c" tone="warn">مصحّحة</Pill> : null}
                  </span>,
                  <span key="c" className="text-white/60">{competitionBySlug(m.competition)?.name}</span>,
                  <span key="d" className="num whitespace-nowrap">
                    {dateAr(m.kickoff)} · {timeOf(m.kickoff)}
                  </span>,
                  <span key="s" className="num font-extrabold">{m.homeScore} – {m.awayScore}</span>,
                  <Pill key="st" tone={demoTone[m.status]}>{demoAr[m.status]}</Pill>,
                  <span key="a" className="flex gap-1.5">
                    <Link
                      href={`/admin/matches?slug=${encodeURIComponent(m.slug)}#edit`}
                      className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
                    >
                      تصحيح
                    </Link>
                    <Link
                      href={`/matches/${m.slug}`}
                      className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-gold-500 hover:text-gold-400"
                    >
                      عرض
                    </Link>
                  </span>,
                ])}
              />
            </Panel>
          ) : (
            <Panel title="المباريات">
              <NotConnected
                title="لا توجد مباريات للعرض"
                message="تعذّر جلب المباريات الحيّة ولا توجد بيانات تجريبية في هذه البيئة. يمكنك مع ذلك إدخال slug أي مباراة يدويًا في النموذج."
                requires="فحص مزوّدي البيانات من /admin/providers"
              />
            </Panel>
          )}
        </div>

        {/* edit form */}
        <div id="edit" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
          <Panel title="تصحيح نتيجة / حالة">
            <form action={upsertOverrideAction} className="space-y-3">
              <Field label="معرّف المباراة (slug)">
                <input name="slug" defaultValue={prefill} required list="known-slugs" dir="ltr" placeholder="cruz-azul-vs-inter-miami-cf" className={`${inputCls} num`} />
                <datalist id="known-slugs">
                  {realList.map((f) => (
                    <option key={f.providerId} value={f.providerId}>{realName(f)}</option>
                  ))}
                  {allMatches.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
                    </option>
                  ))}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="أهداف الأول">
                  <input name="homeScore" type="number" min={0} step={1} placeholder="—" className={`${inputCls} num`} />
                </Field>
                <Field label="أهداف الثاني">
                  <input name="awayScore" type="number" min={0} step={1} placeholder="—" className={`${inputCls} num`} />
                </Field>
              </div>
              <Field label="الحالة">
                <select name="status" defaultValue="" className={inputCls}>
                  <option value="">بلا تغيير</option>
                  {OVERRIDE_STATUSES.map((s) => (
                    <option key={s} value={s}>{OVERRIDE_STATUS_AR[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="ملاحظة (تظهر للزوار)">
                <input name="note" maxLength={300} placeholder="مثال: صحّحنا النتيجة حسب المصدر الرسمي" className={inputCls} />
              </Field>
              <Btn type="submit">حفظ التصحيح</Btn>
              <p className="text-[11px] leading-5 text-white/40">
                يُحفظ التصحيح فوق بيانات المزوّد (لا يعدّلها) ويظهر على صفحة المباراة والقوائم
                فورًا. الحفظ دائم مع قاعدة البيانات، ومؤقت بدونها.
              </p>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
