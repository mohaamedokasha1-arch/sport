import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { storeErrorMessage } from "@/lib/db/store-policy";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls, NotConnected } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import { allMatches } from "@/lib/data";
import { competitions, sports, teamBySlug, competitionBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";
import { fixtures as sdlFixtures, invalidateMatch } from "@/lib/sdl-gateway";
import {
  ADMIN_MATCH_STATUSES,
  ADMIN_MATCH_STATUS_AR,
  createAdminMatch,
  deleteAdminMatch,
  getAdminMatchById,
  listAdminMatches,
  matchDateTimeLocal,
  setAdminMatchPublished,
  updateAdminMatch,
  type AdminMatch,
  type AdminMatchStatus,
} from "@/lib/admin-matches";
import { getAdminCompetitionBySlug, listAdminCompetitions } from "@/lib/admin-competitions";
import {
  OVERRIDE_STATUSES,
  OVERRIDE_STATUS_AR,
  deleteOverride,
  listOverrides,
  upsertOverride,
} from "@/lib/match-overrides";
import { logActivity } from "@/lib/activity";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { isLiveStatus } from "@/lib/match-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── shared helpers ─────────────────────────────────────────── */

function refreshMatchSurfaces(slug?: string): void {
  revalidatePath("/admin/matches");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/live");
  revalidatePath("/results");
  revalidatePath("/fixtures");
  revalidatePath("/watch");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/matches/${encodeURIComponent(slug)}`);
}

function parseScore(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/** Display name for a competition slug (built-in catalogue first, then admin). */
async function competitionNameFor(slug: string): Promise<string> {
  const builtIn = competitions.find((c) => c.slug === slug);
  if (builtIn) return builtIn.name;
  const managed = await getAdminCompetitionBySlug(slug);
  return managed?.nameAr ?? slug;
}

/* ── server actions: admin-managed matches ──────────────────── */

async function createMatchAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const status = String(form.get("status") ?? "upcoming") as AdminMatchStatus;
  const compSlug = String(form.get("competitionSlug") ?? "");
  const result = await createAdminMatch(
    {
      sport: String(form.get("sport") ?? "football"),
      competitionSlug: compSlug,
      competitionName: await competitionNameFor(compSlug),
      season: String(form.get("season") ?? ""),
      homeName: String(form.get("homeName") ?? ""),
      homeNameEn: String(form.get("homeNameEn") ?? ""),
      homeLogo: String(form.get("homeLogo") ?? ""),
      awayName: String(form.get("awayName") ?? ""),
      awayNameEn: String(form.get("awayNameEn") ?? ""),
      awayLogo: String(form.get("awayLogo") ?? ""),
      date: String(form.get("date") ?? ""),
      time: String(form.get("time") ?? ""),
      status: ADMIN_MATCH_STATUSES.includes(status) ? status : "upcoming",
      homeScore: parseScore(form.get("homeScore")),
      awayScore: parseScore(form.get("awayScore")),
      venue: String(form.get("venue") ?? ""),
      referee: String(form.get("referee") ?? ""),
      isPublished: form.get("isPublished") === "on",
      slug: String(form.get("slug") ?? ""),
    },
    actor.username,
  );
  if (!result.ok) {
    redirect(`/admin/matches?tab=managed&err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({
    action: "match.create",
    entityType: "match",
    entityId: result.match.slug,
    actor: actor.username,
    role: actor.role,
    after: { home: result.match.homeName, away: result.match.awayName, published: result.match.isPublished },
  });
  refreshMatchSurfaces(result.match.slug);
  redirect(`/admin/matches?tab=managed&ok=${encodeURIComponent("تم إنشاء المباراة")}`);
}

async function updateMatchAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "upcoming") as AdminMatchStatus;
  const compSlug = String(form.get("competitionSlug") ?? "");
  const result = await updateAdminMatch(id, {
    sport: String(form.get("sport") ?? "football"),
    competitionSlug: compSlug,
    competitionName: await competitionNameFor(compSlug),
    season: String(form.get("season") ?? ""),
    homeName: String(form.get("homeName") ?? ""),
    homeNameEn: String(form.get("homeNameEn") ?? ""),
    homeLogo: String(form.get("homeLogo") ?? ""),
    awayName: String(form.get("awayName") ?? ""),
    awayNameEn: String(form.get("awayNameEn") ?? ""),
    awayLogo: String(form.get("awayLogo") ?? ""),
    date: String(form.get("date") ?? ""),
    time: String(form.get("time") ?? ""),
    status: ADMIN_MATCH_STATUSES.includes(status) ? status : "upcoming",
    homeScore: parseScore(form.get("homeScore")),
    awayScore: parseScore(form.get("awayScore")),
    venue: String(form.get("venue") ?? ""),
    referee: String(form.get("referee") ?? ""),
    isPublished: form.get("isPublished") === "on",
    slug: String(form.get("slug") ?? ""),
  });
  if (!result.ok) {
    redirect(`/admin/matches?tab=managed&edit=${encodeURIComponent(id)}&err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({
    action: "match.update",
    entityType: "match",
    entityId: result.match.slug,
    actor: actor.username,
    role: actor.role,
    after: { status: result.match.status, published: result.match.isPublished },
  });
  refreshMatchSurfaces(result.match.slug);
  redirect(`/admin/matches?tab=managed&ok=${encodeURIComponent("تم حفظ التعديلات")}`);
}

async function deleteMatchAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const id = String(form.get("id") ?? "");
  const match = await getAdminMatchById(id);
  try {
    await deleteAdminMatch(id);
  } catch (e) {
    redirect(`/admin/matches?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "match.delete", entityType: "match", entityId: match?.slug ?? id, actor: actor.username, role: actor.role });
  refreshMatchSurfaces(match?.slug);
  redirect(`/admin/matches?tab=managed&ok=${encodeURIComponent("تم حذف المباراة")}`);
}

async function toggleMatchPublishAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const id = String(form.get("id") ?? "");
  const publish = form.get("publish") === "1";
  const match = await getAdminMatchById(id);
  try {
    await setAdminMatchPublished(id, publish);
  } catch (e) {
    redirect(`/admin/matches?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({
    action: publish ? "match.publish" : "match.hide",
    entityType: "match",
    entityId: match?.slug ?? id,
    actor: actor.username,
    role: actor.role,
    after: { isPublished: publish },
  });
  refreshMatchSurfaces(match?.slug);
  redirect(`/admin/matches?tab=managed&ok=${encodeURIComponent(publish ? "تم نشر المباراة" : "تم إخفاء المباراة")}`);
}

/* ── server actions: provider overrides (kept from before) ──── */

async function upsertOverrideAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const slug = String(form.get("slug") ?? "").trim();
  const homeScore = parseScore(form.get("homeScore"));
  const awayScore = parseScore(form.get("awayScore"));
  const status = String(form.get("status") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;

  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
    redirect(`/admin/matches?tab=overrides&err=${encodeURIComponent("النتيجة يجب أن تكون أرقامًا صحيحة غير سالبة")}&slug=${encodeURIComponent(slug)}`);
  }
  const result = await upsertOverride(slug, { homeScore, awayScore, status, note });
  if (!result.ok) {
    redirect(`/admin/matches?tab=overrides&err=${encodeURIComponent(result.error.slice(0, 180))}&slug=${encodeURIComponent(slug)}`);
  }
  await logActivity({
    action: "override.upsert",
    entityType: "match",
    entityId: slug,
    actor: actor.username,
    role: actor.role,
    after: { homeScore, awayScore, status, note },
  });
  await invalidateMatch(slug).catch(() => 0);
  refreshMatchSurfaces(slug);
  redirect(`/admin/matches?tab=overrides&ok=1&slug=${encodeURIComponent(slug)}`);
}

async function deleteOverrideAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("matches");
  const slug = String(form.get("slug") ?? "").trim();
  try { await deleteOverride(slug); } catch (error) { redirect(`/admin/matches?tab=overrides&err=${encodeURIComponent(storeErrorMessage(error))}`); }
  await logActivity({ action: "override.delete", entityType: "match", entityId: slug, actor: actor.username, role: actor.role });
  await invalidateMatch(slug).catch(() => 0);
  refreshMatchSurfaces(slug);
  redirect(`/admin/matches?tab=overrides&ok=${encodeURIComponent("تم حذف التجاوز")}`);
}

/* ── display helpers ────────────────────────────────────────── */

const demoTone = { LIVE: "bad", UPCOMING: "idle", FINISHED: "ok", POSTPONED: "warn", CANCELLED: "warn", HT: "bad", SUSPENDED: "warn" } as const;
const demoAr = { LIVE: "جارية", UPCOMING: "قادمة", FINISHED: "انتهت", POSTPONED: "مؤجلة", CANCELLED: "ملغاة", HT: "استراحة", SUSPENDED: "متوقفة" } as const;

function realTone(status: string): "ok" | "warn" | "bad" | "idle" {
  if (isLiveStatus(status)) return "bad";
  if (status === "scheduled") return "idle";
  if (status === "finished") return "ok";
  return "warn";
}

const realName = (f: NormalizedFixture) =>
  `${f.homeName ?? f.homeProviderId ?? "—"} × ${f.awayName ?? f.awayProviderId ?? "—"}`;

const statusTone = (s: AdminMatchStatus): "ok" | "warn" | "bad" | "idle" =>
  s === "live" ? "bad" : s === "upcoming" ? "idle" : s === "finished" ? "ok" : "warn";

const btnGhost =
  "rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400";

/* ── page ───────────────────────────────────────────────────── */

export default async function AdminMatches({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("matches");
  const sp = await searchParams;
  const tab = sp.tab === "overrides" ? "overrides" : "managed";
  const err = typeof sp.err === "string" ? sp.err : "";
  const okMsg = typeof sp.ok === "string" ? sp.ok : "";
  const saved = okMsg !== "" || sp.ok === "1";

  // filters (managed tab)
  const q = typeof sp.q === "string" ? sp.q : "";
  const fSport = typeof sp.sport === "string" ? sp.sport : "";
  const fComp = typeof sp.competition === "string" ? sp.competition : "";
  const fStatus = typeof sp.status === "string" ? sp.status : "";
  const fDate = typeof sp.date === "string" ? sp.date : "";

  const editId = typeof sp.edit === "string" ? sp.edit : "";
  const overridePrefill = typeof sp.slug === "string" ? sp.slug : "";

  const [managed, adminComps, overrides, real, editing] = await Promise.all([
    listAdminMatches({ q, sport: fSport, competition: fComp, status: fStatus, date: fDate, limit: 100 }),
    listAdminCompetitions({ limit: 200 }),
    listOverrides(),
    sdlFixtures({ sport: "football" }),
    editId ? getAdminMatchById(editId) : Promise.resolve(null),
  ]);
  const realList = real.ok ? real.data.slice(0, 20) : [];
  const overrideSlugs = new Set(overrides.map((o) => o.slug));

  const competitionOptions = [
    ...competitions.map((c) => ({ slug: c.slug, name: c.name, sport: c.sport })),
    ...adminComps.map((c) => ({ slug: c.slug, name: c.nameAr, sport: c.sport })),
  ];
  const sportOptions = sports;
  const editLocal = editing ? matchDateTimeLocal(editing.scheduledAt) : null;

  const teamCell = (m: AdminMatch) => (
    <span className="block min-w-0">
      <span className="block truncate font-bold">{m.homeName} × {m.awayName}</span>
      <span className="num block truncate text-[10px] text-white/40" dir="ltr">{m.slug}</span>
    </span>
  );

  return (
    <div>
      <AdminHead
        title="المباريات"
        subtitle="إنشاء وتحرير مباريات الإدارة · وتصحيح نتائج مباريات المزوّد"
        action={
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/live"><Btn tone="ghost">البث المباشر</Btn></Link>
            <Link href="/admin/live-matches"><Btn tone="ghost">المباشرة</Btn></Link>
            <Link href="/admin/upcoming-matches"><Btn tone="ghost">القادمة</Btn></Link>
          </span>
        }
      />

      {/* tabs */}
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="أقسام إدارة المباريات">
        <Link
          href="/admin/matches?tab=managed"
          role="tab"
          aria-selected={tab === "managed"}
          className={`rounded-[3px] px-3.5 py-2 text-[12px] font-extrabold transition ${tab === "managed" ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/75 hover:border-gold-500 hover:text-gold-400"}`}
        >
          مباريات الإدارة ({managed.length})
        </Link>
        <Link
          href="/admin/matches?tab=overrides"
          role="tab"
          aria-selected={tab === "overrides"}
          className={`rounded-[3px] px-3.5 py-2 text-[12px] font-extrabold transition ${tab === "overrides" ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/75 hover:border-gold-500 hover:text-gold-400"}`}
        >
          تصحيح نتائج المزوّد ({overrides.length})
        </Link>
      </div>

      {err ? (
        <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">
          {err}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">
          {okMsg || "حُفظ التصحيح — يظهر الآن على صفحة المباراة والقوائم المرتبطة."}
        </p>
      ) : null}

      {tab === "managed" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-4">
            {/* filters */}
            <Panel
              title="مباريات الإدارة"
              aside={<Pill tone={managed.length ? "warn" : "idle"}>{managed.length} مباراة</Pill>}
            >
              <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <input type="hidden" name="tab" value="managed" />
                <input name="q" defaultValue={q} placeholder="بحث: فريق، بطولة، slug…" className={inputCls} />
                <select name="sport" defaultValue={fSport} className={inputCls}>
                  <option value="">كل الرياضات</option>
                  {sportOptions.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.name}</option>
                  ))}
                </select>
                <select name="competition" defaultValue={fComp} className={inputCls}>
                  <option value="">كل البطولات</option>
                  {competitionOptions.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
                <select name="status" defaultValue={fStatus} className={inputCls}>
                  <option value="">كل الحالات</option>
                  {ADMIN_MATCH_STATUSES.map((s) => (
                    <option key={s} value={s}>{ADMIN_MATCH_STATUS_AR[s]}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input name="date" type="date" defaultValue={fDate} className={inputCls} />
                  <button type="submit" className="shrink-0 rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                    تصفية
                  </button>
                </div>
              </form>

              {managed.length === 0 ? (
                <NotConnected
                  title="لا توجد مباريات"
                  message="لم يتم إنشاء أي مباراة من لوحة التحكم بعد، أو لا تطابق الفلاتر الحالية. استخدم النموذج المجاور لإضافة مباراة جديدة."
                  requires="نموذج إضافة مباراة جديد"
                />
              ) : (
                <Table
                  head={["المباراة", "البطولة", "الموعد", "الحالة", "النتيجة", "الظهور", "إجراءات"]}
                  rows={managed.map((m) => [
                    teamCell(m),
                    <span key="c" className="max-w-[10rem] truncate text-white/60">{m.competitionName || m.competitionSlug}</span>,
                    <span key="d" className="num whitespace-nowrap text-[11px]">{dateAr(m.scheduledAt)} · {timeOf(m.scheduledAt)}</span>,
                    <Pill key="s" tone={statusTone(m.status)}>{ADMIN_MATCH_STATUS_AR[m.status]}</Pill>,
                    <span key="r" className="num font-extrabold">
                      {m.homeScore === null || m.awayScore === null ? "— : —" : `${m.homeScore} : ${m.awayScore}`}
                    </span>,
                    <Pill key="p" tone={m.isPublished ? "ok" : "idle"}>{m.isPublished ? "منشور" : "مخفي"}</Pill>,
                    <span key="a" className="flex flex-wrap gap-1.5">
                      <Link href={`/admin/matches?tab=managed&edit=${encodeURIComponent(m.id)}#match-form`} className={btnGhost}>
                        تعديل
                      </Link>
                      <form action={toggleMatchPublishAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="publish" value={m.isPublished ? "0" : "1"} />
                        <button type="submit" className={btnGhost}>{m.isPublished ? "إخفاء" : "نشر"}</button>
                      </form>
                      <Link
                        href={`/admin/live?match=${encodeURIComponent(m.slug)}&home=${encodeURIComponent(m.homeName)}&away=${encodeURIComponent(m.awayName)}#stream-form`}
                        className={btnGhost}
                      >
                        بث
                      </Link>
                      <Link href={`/matches/${encodeURIComponent(m.slug)}`} className={btnGhost} target="_blank">
                        عرض
                      </Link>
                      <ConfirmForm
                        message={`هل أنت متأكد من حذف مباراة ${m.homeName} × ${m.awayName}؟ لا يمكن التراجع.`}
                        action={deleteMatchAction}
                      >
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white"
                        >
                          حذف
                        </button>
                      </ConfirmForm>
                    </span>,
                  ])}
                />
              )}
            </Panel>
          </div>

          {/* create / edit form */}
          <div id="match-form" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
            <Panel title={editing ? `تعديل مباراة: ${editing.homeName} × ${editing.awayName}` : "إضافة مباراة جديدة"}>
              <form action={editing ? updateMatchAction : createMatchAction} className="space-y-3">
                {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="الفريق المضيف (عربي)">
                    <input name="homeName" defaultValue={editing?.homeName ?? ""} required maxLength={160} className={inputCls} placeholder="الأهلي" />
                  </Field>
                  <Field label="الفريق الضيف (عربي)">
                    <input name="awayName" defaultValue={editing?.awayName ?? ""} required maxLength={160} className={inputCls} placeholder="الزمالك" />
                  </Field>
                  <Field label="اسم المضيف (إنجليزي)">
                    <input name="homeNameEn" defaultValue={editing?.homeNameEn ?? ""} maxLength={160} className={inputCls} dir="ltr" placeholder="Al Ahly" />
                  </Field>
                  <Field label="اسم الضيف (إنجليزي)">
                    <input name="awayNameEn" defaultValue={editing?.awayNameEn ?? ""} maxLength={160} className={inputCls} dir="ltr" placeholder="Zamalek" />
                  </Field>
                  <Field label="شعار المضيف (رابط)">
                    <input name="homeLogo" defaultValue={editing?.homeLogo ?? ""} maxLength={1000} className={inputCls} dir="ltr" placeholder="https://…" />
                  </Field>
                  <Field label="شعار الضيف (رابط)">
                    <input name="awayLogo" defaultValue={editing?.awayLogo ?? ""} maxLength={1000} className={inputCls} dir="ltr" placeholder="https://…" />
                  </Field>
                  <Field label="البطولة">
                    <select
                      name="competitionSlug"
                      defaultValue={editing?.competitionSlug ?? ""}
                      required
                      className={inputCls}
                    >
                      <option value="">{competitionOptions.length ? "اختر البطولة…" : "لا توجد بطولات بعد"}</option>
                      {competitionOptions.map((c) => (
                        <option key={c.slug} value={c.slug}>{c.name}</option>
                      ))}
                    </select>
                    {competitionOptions.length === 0 ? (
                      <p className="mt-1.5 text-[11px] text-gold-400">
                        لا توجد بطولات لإضافة المباراة إليها. <Link href="/admin/competitions" className="font-bold underline">أضِف بطولة من صفحة البطولات</Link> ثم عُد لإكمال النموذج.
                      </p>
                    ) : null}
                  </Field>
                  <Field label="الموسم">
                    <input name="season" defaultValue={editing?.season ?? ""} maxLength={40} className={inputCls} placeholder="2026/2027" />
                  </Field>
                  <Field label="الرياضة">
                    <select name="sport" defaultValue={editing?.sport ?? "football"} className={inputCls}>
                      {sportOptions.map((s) => (
                        <option key={s.slug} value={s.slug}>{s.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="التاريخ (توقيت القاهرة)">
                    <input name="date" type="date" defaultValue={editLocal?.date ?? ""} required className={inputCls} />
                  </Field>
                  <Field label="وقت الضربة الأولى">
                    <input name="time" type="time" defaultValue={editLocal?.time ?? "20:00"} required className={inputCls} />
                  </Field>
                  <Field label="الحالة">
                    <select name="status" defaultValue={editing?.status ?? "upcoming"} className={inputCls}>
                      {ADMIN_MATCH_STATUSES.map((s) => (
                        <option key={s} value={s}>{ADMIN_MATCH_STATUS_AR[s]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الملعب">
                    <input name="venue" defaultValue={editing?.venue ?? ""} maxLength={200} className={inputCls} placeholder="استاد القاهرة" />
                  </Field>
                  <Field label="الحكم">
                    <input name="referee" defaultValue={editing?.referee ?? ""} maxLength={160} className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="أهداف المضيف">
                      <input name="homeScore" type="number" min={0} max={99} step={1} defaultValue={editing?.homeScore ?? ""} className={`${inputCls} num`} />
                    </Field>
                    <Field label="أهداف الضيف">
                      <input name="awayScore" type="number" min={0} max={99} step={1} defaultValue={editing?.awayScore ?? ""} className={`${inputCls} num`} />
                    </Field>
                  </div>
                  <Field label="معرّف مختصر (Slug) — اتركه فارغًا للتوليد تلقائيًا">
                    <input name="slug" defaultValue={editing?.slug ?? ""} maxLength={120} className={`${inputCls} num`} dir="ltr" placeholder="ahly-zamalek-2026-10-08" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-white/70">
                  <input type="checkbox" name="isPublished" defaultChecked={editing ? editing.isPublished : true} className="h-4 w-4 accent-[#D4AF37]" />
                  نشر المباراة على الموقع مباشرة
                </label>
                <Btn type="submit">{editing ? "حفظ التعديلات" : "إنشاء المباراة"}</Btn>
                {editing ? (
                  <Link href="/admin/matches?tab=managed" className="block text-center text-[11px] font-bold text-white/50 hover:text-gold-400">
                    إلغاء التعديل
                  </Link>
                ) : null}
                <p className="text-[11px] leading-5 text-white/40">
                  المباريات المُنشأة من هنا تظهر في /matches و/live و/fixtures و/results وصفحة المباراة
                  الخاصة بها. بيانات المزوّد لا تُعدَّل أبدًا.
                </p>
              </form>
            </Panel>
          </div>
        </div>
      ) : (
        /* ── overrides tab (provider corrections, unchanged behaviour) ── */
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
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
                        href={`/admin/matches?tab=overrides&slug=${encodeURIComponent(o.slug)}#edit`}
                        className={btnGhost}
                      >
                        تعديل
                      </Link>
                      <ConfirmForm message={`حذف تصحيح ${o.slug}؟`} action={deleteOverrideAction}>
                        <input type="hidden" name="slug" value={o.slug} />
                        <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-live hover:text-live">
                          حذف
                        </button>
                      </ConfirmForm>
                    </span>,
                  ])}
                />
              )}
            </Panel>

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
                        href={`/admin/matches?tab=overrides&slug=${encodeURIComponent(f.providerId)}#edit`}
                        className={btnGhost}
                      >
                        تصحيح
                      </Link>
                      <Link href={`/matches/${f.providerId}`} className={btnGhost} target="_blank">
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
                        href={`/admin/matches?tab=overrides&slug=${encodeURIComponent(m.slug)}#edit`}
                        className={btnGhost}
                      >
                        تصحيح
                      </Link>
                      <Link href={`/matches/${m.slug}`} className={btnGhost} target="_blank">
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

          <div id="edit" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
            <Panel title="تصحيح نتيجة / حالة">
              <form action={upsertOverrideAction} className="space-y-3">
                <input type="hidden" name="tab" value="overrides" />
                <Field label="معرّف المباراة (slug)">
                  <input name="slug" defaultValue={overridePrefill} required list="known-slugs" dir="ltr" placeholder="cruz-azul-vs-inter-miami-cf" className={`${inputCls} num`} />
                  <datalist id="known-slugs">
                    {realList.map((f) => (
                      <option key={f.providerId} value={f.providerId}>{realName(f)}</option>
                    ))}
                    {allMatches.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
                      </option>
                    ))}
                    {managed.map((m) => (
                      <option key={m.slug} value={m.slug}>{m.homeName} × {m.awayName}</option>
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
      )}
    </div>
  );
}
