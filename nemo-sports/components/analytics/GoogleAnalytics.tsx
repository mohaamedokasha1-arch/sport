import { GOOGLE_ANALYTICS_INIT, GOOGLE_ANALYTICS_SCRIPT_URL } from "@/lib/analytics";

/** Parser-inserted Google tag, shared by the Arabic and English root heads. */
export default function GoogleAnalytics() {
  return (
    <>
      <script async src={GOOGLE_ANALYTICS_SCRIPT_URL} />
      <script dangerouslySetInnerHTML={{ __html: GOOGLE_ANALYTICS_INIT }} />
    </>
  );
}
