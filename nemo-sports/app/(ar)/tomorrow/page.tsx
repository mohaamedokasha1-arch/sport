import { permanentRedirect } from "next/navigation";

/** Mirror of /today: route visitors to NEMO's own filtered match feed. */
export default function TomorrowPage(): never {
  permanentRedirect("/matches?date=tomorrow");
}
