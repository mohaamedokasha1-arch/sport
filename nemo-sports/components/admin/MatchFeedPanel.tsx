import Link from "next/link";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { Panel, Pill, Table } from "@/components/admin/ui";
import { OVERRIDE_STATUS_AR } from "@/lib/match-overrides";
import { dateAr, timeOf } from "@/lib/format";

type FeedMode = "live" | "upcoming";

type MatchFeedPanelProps = {
  title: string;
  matches: NormalizedFixture[];
  mode: FeedMode;
  source: "demo" | "provider";
  stale?: boolean;
  fetchedAt?: string;
  emptyTitle: string;
  emptyMessage: string;
};

const LIVE_STATUSES = new Set([
  "live",
  "halftime",
  "extra_time",
  "extra_time_halftime",
  "penalty_shootout",
]);

function statusLabel(status: string): string {
  if (status === "extra_time_halftime") return "استراحة الوقت الإضافي";
  return OVERRIDE_STATUS_AR[status] ?? status;
}

function statusTone(status: string): "ok" | "warn" | "bad" | "idle" {
  if (LIVE_STATUSES.has(status)) return "bad";
  if (status === "finished") return "ok";
  if (status === "scheduled") return "idle";
  return "warn";
}

function kickoff(fixture: NormalizedFixture): string {
  const timestamp = new Date(fixture.scheduledAt);
  if (!Number.isFinite(timestamp.getTime())) return "—";
  return `${dateAr(fixture.scheduledAt)} · ${timeOf(fixture.scheduledAt)}`;
}

function score(fixture: NormalizedFixture): string {
  if (fixture.homeScore === null || fixture.awayScore === null) return "— : —";
  return `${fixture.homeScore} : ${fixture.awayScore}`;
}

function names(fixture: NormalizedFixture): string {
  return `${fixture.homeName || "الفريق المضيف"} × ${fixture.awayName || "الفريق الضيف"}`;
}

function broadcastHref(fixture: NormalizedFixture): string {
  const params = new URLSearchParams({ match: fixture.providerId });
  if (fixture.homeName) params.set("home", fixture.homeName);
  if (fixture.awayName) params.set("away", fixture.awayName);
  return `/admin/broadcast?${params.toString()}#match-stream-form`;
}

function MatchActions({ fixture, mode }: { fixture: NormalizedFixture; mode: FeedMode }) {
  const linkClass =
    "inline-flex min-h-8 items-center justify-center rounded-[3px] border border-navy-700 px-2.5 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400";

  return (
    <span className="flex flex-wrap gap-1.5">
      {mode === "live" ? (
        <Link href={`/admin/matches?slug=${encodeURIComponent(fixture.providerId)}#edit`} className={linkClass}>
          تصحيح النتيجة
        </Link>
      ) : (
        <Link href={broadcastHref(fixture)} className={linkClass}>
          ربط ناقل رسمي
        </Link>
      )}
      <Link href={`/matches/${encodeURIComponent(fixture.providerId)}`} className={linkClass}>
        عرض المباراة
      </Link>
    </span>
  );
}

function EmptyMatches({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[3px] border border-dashed border-navy-700 px-4 py-8 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full border border-navy-700 text-lg text-white/45" aria-hidden>
        ◷
      </span>
      <h3 className="mt-3 text-[13px] font-extrabold text-white/75">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-xl text-[11px] leading-relaxed text-white/45">{message}</p>
    </div>
  );
}

export default function MatchFeedPanel({
  title,
  matches,
  mode,
  source,
  stale = false,
  fetchedAt,
  emptyTitle,
  emptyMessage,
}: MatchFeedPanelProps) {
  const sourceLabel = source === "demo" ? "بيانات تجريبية" : "مزوّد بيانات";
  const sourceTone = source === "demo" ? "warn" : "ok";
  const checkedAt = fetchedAt && Number.isFinite(new Date(fetchedAt).getTime())
    ? `${dateAr(fetchedAt)} · ${timeOf(fetchedAt)}`
    : null;

  return (
    <Panel
      title={title}
      aside={
        <span className="flex flex-wrap items-center gap-2">
          <Pill tone={sourceTone}>{sourceLabel}</Pill>
          {stale ? <Pill tone="warn">آخر تحديث محفوظ</Pill> : null}
          <Pill tone={matches.length > 0 ? "bad" : "idle"}>{matches.length} مباراة</Pill>
        </span>
      }
    >
      {checkedAt ? (
        <p className="mb-3 text-[10px] text-white/40">
          آخر جلب معلن من طبقة البيانات: <span className="num">{checkedAt}</span>
        </p>
      ) : null}

      {matches.length === 0 ? (
        <EmptyMatches title={emptyTitle} message={emptyMessage} />
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {matches.map((fixture) => (
              <article key={fixture.providerId} className="rounded-[3px] border border-navy-800 bg-navy-950/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-extrabold">{names(fixture)}</p>
                    <p className="mt-1 truncate text-[10px] text-white/45">
                      {fixture.competitionName ?? fixture.competitionProviderId}
                    </p>
                  </div>
                  <Pill tone={statusTone(fixture.status)}>{statusLabel(fixture.status)}</Pill>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-navy-800 pt-2.5">
                  <span className="num text-[11px] text-white/55">{kickoff(fixture)}</span>
                  {mode === "live" ? (
                    <span className="num text-[17px] font-extrabold text-gold-400">{score(fixture)}</span>
                  ) : (
                    <span className="max-w-[46%] truncate text-[10px] text-white/45">{fixture.venueName ?? "الملعب غير محدد من المصدر"}</span>
                  )}
                </div>
                {mode === "live" && fixture.minute !== null ? (
                  <p className="num mt-1 text-end text-[10px] font-bold text-live">{fixture.minute}′</p>
                ) : null}
                <div className="mt-3 border-t border-navy-800 pt-2.5">
                  <MatchActions fixture={fixture} mode={mode} />
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:block">
            <Table
              head={mode === "live"
                ? ["المباراة", "البطولة", "الموعد", "النتيجة", "الحالة", "الإجراءات"]
                : ["المباراة", "البطولة", "الموعد", "الملعب", "الحالة", "الإجراءات"]}
              rows={matches.map((fixture) => [
                <span key="match" className="block max-w-[280px] truncate font-bold" title={names(fixture)}>
                  {names(fixture)}
                </span>,
                <span key="competition" className="block max-w-[180px] truncate text-white/55">
                  {fixture.competitionName ?? fixture.competitionProviderId}
                </span>,
                <span key="kickoff" className="num whitespace-nowrap text-[11px] text-white/65">
                  {kickoff(fixture)}
                </span>,
                mode === "live" ? (
                  <span key="score" className="num whitespace-nowrap font-extrabold text-gold-400">
                    {score(fixture)}
                    {fixture.minute !== null ? (
                      <span className="ms-2 text-[10px] font-semibold text-live">{fixture.minute}′</span>
                    ) : null}
                  </span>
                ) : (
                  <span key="venue" className="block max-w-[160px] truncate text-[11px] text-white/55">
                    {fixture.venueName ?? "—"}
                  </span>
                ),
                <Pill key="status" tone={statusTone(fixture.status)}>{statusLabel(fixture.status)}</Pill>,
                <MatchActions key="actions" fixture={fixture} mode={mode} />,
              ])}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

export function isLiveFixture(fixture: NormalizedFixture): boolean {
  return LIVE_STATUSES.has(fixture.status);
}
