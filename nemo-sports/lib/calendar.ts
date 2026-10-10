import type { NormalizedFixture } from "@/packages/sdl/src";
const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/[\r\n]+/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
/** RFC 5545 folding at <=75 UTF-8 octets, without splitting code points. */
export function foldCalendarLine(line: string): string {
  let part = "", bytes = 0; const lines: string[] = [];
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > 75) { lines.push(part); part = " "; bytes = 1; }
    part += char; bytes += size;
  }
  return [...lines, part].join("\r\n");
}
export function matchCalendar(f: NormalizedFixture, origin: string, fetchedAt: string): string {
  if (!Number.isFinite(Date.parse(f.scheduledAt))) throw new Error("No valid kickoff");
  const url = `${origin}/matches/${encodeURIComponent(f.providerId)}`;
  // No duration, end time or alarm is invented. This is a snapshot, not a subscription.
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NEMO Sports//Sports Calendar//AR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${encodeURIComponent(f.providerId)}@${new URL(origin).hostname}`, `DTSTAMP:${stamp(fetchedAt)}`, `DTSTART:${stamp(f.scheduledAt)}`,
    `SUMMARY:${escape(`${f.homeName ?? f.homeProviderId} × ${f.awayName ?? f.awayProviderId}`)}`,
    `DESCRIPTION:${escape(`${f.competitionName ?? ""} — ${f.status}. لقطة من جدول المصدر؛ تحقق من صفحة المباراة للتغييرات. لا يتم التحديث تلقائيًا.`)}`,
    `URL:${url}`, ...(f.venueName ? [`LOCATION:${escape(f.venueName)}`] : []),
    `STATUS:${f.status === "cancelled" ? "CANCELLED" : f.status === "scheduled" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT", "END:VCALENDAR", ""].map(foldCalendarLine).join("\r\n");
}
