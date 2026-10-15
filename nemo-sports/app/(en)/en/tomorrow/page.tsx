import { permanentRedirect } from "next/navigation";

/** English mirror of the /tomorrow alias — keeps the same stable mapping. */
export default function TomorrowPageEn(): never {
  permanentRedirect("/en/matches?date=tomorrow");
}
