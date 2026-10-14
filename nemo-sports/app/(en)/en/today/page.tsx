import { permanentRedirect } from "next/navigation";

/** English mirror of the /today alias — keeps the same stable mapping. */
export default function TodayPageEn(): never {
  permanentRedirect("/en/matches?date=today");
}
