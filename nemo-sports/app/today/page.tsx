import { permanentRedirect } from "next/navigation";

/** Keep old links stable while routing visitors to NEMO's own filtered match feed. */
export default function TodayPage(): never {
  permanentRedirect("/matches?date=today");
}
