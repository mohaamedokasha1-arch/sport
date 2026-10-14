import { STATUS_AR } from "@/lib/format";
import type { MatchStatus } from "@/packages/sdl/src";

const STATUSES: MatchStatus[] = ["scheduled","live","halftime","extra_time","extra_time_halftime","penalty_shootout","finished","postponed","cancelled","suspended","abandoned","walkover","awarded"];
console.log("STATUS_AR keys:", Object.keys(STATUS_AR).join(", "));
console.log("\n--- STATUS_AR[f.status] for every legal MatchStatus ---");
for (const s of STATUSES) console.log(`  ${s.padEnd(22)} -> ${JSON.stringify(STATUS_AR[s])}`);
console.log("\nAny hit?", STATUSES.some((s) => STATUS_AR[s] !== undefined));
