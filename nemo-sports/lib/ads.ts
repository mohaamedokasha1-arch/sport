/**
 * NEMO Sports · Adsterra inventory — the single source of truth.
 * ───────────────────────────────────────────────────────────────────────────
 * Everything the site knows about the ad network lives here: the account codes
 * the operator pasted from the Adsterra dashboard, which surface may load them,
 * and the helpers the UI and the CSP need. No other file may hardcode one of
 * these URLs.
 *
 * Where each tag runs (see docs/ADS_ADSTERRA_INTEGRATION_AR.md):
 *   · 300×250 iframe banner → served by app/ad-frame/route.ts and embedded
 *                             twice by components/ads/AdsterraBanner.tsx on the
 *                             match page: above and below the live-stream block;
 *   · Social Bar            → components/ads/AdScripts.tsx, mounted once in the
 *                             root layout (app/layout.tsx);
 *   · Popunder              → same component, same mount point;
 *   · Smartlink             → components/ads/useSmartlink.ts, attached to the
 *                             "watch" CTAs (MatchStreamPlayer, MatchLive).
 *
 * WHY THE BANNER GETS A DOCUMENT OF ITS OWN
 * The Adsterra snippet is written for a synchronous document: it defines the
 * global `atOptions` and expects `invoke.js` to execute while the parser is
 * still working. Dropped into a client component after hydration, two things
 * break at once — `atOptions` is a single global (two banners on one page
 * overwrite each other, which is why publishers report "only the second one
 * renders"), and a tag that falls back to `document.write()` once the document
 * is complete replaces the WHOLE page (the blank-white-page reports). Serving
 * the snippet from `/ad-frame` — a real first-party document with its own
 * response headers — keeps the tag on its native path, gives every banner its
 * own `atOptions`/window, and makes a wipe impossible: the worst case is an
 * empty 300×250 box.
 *
 * Client-safety: this module is imported by next.config.ts (build time), the
 * ad-frame route, and client components. It stays free of server-only imports
 * and only reads NEXT_PUBLIC_* variables, which Next inlines at build time.
 */

/* ── the account codes ─────────────────────────────────────────────────── */

/** Adsterra "Banner 300×250 (iframe)" — the operator's account key. */
export const ADSTERRA_BANNER = {
  key: "d7e3e208e423e33ed9dd4297709d102a",
  format: "iframe",
  width: 300,
  height: 250,
  /** Per-account creative host; Adsterra rotates the sub-domain between codes. */
  host: "https://www.highrevenueformat.com",
} as const;

/** `invoke.js` for the banner above — derived, never typed twice. */
export const ADSTERRA_BANNER_INVOKE_URL = `${ADSTERRA_BANNER.host}/${ADSTERRA_BANNER.key}/invoke.js`;

/** Adsterra Social Bar (floating in-page bar, loaded once per page view). */
export const ADSTERRA_SOCIAL_BAR_URL =
  "https://pl31820082.profitableratecpmnetwork.com/16/cb/ec/16cbeca9d360e0f7e35b94c803572b23.js";

/**
 * Adsterra Popunder — Anti-Adblock code (fires from a user interaction,
 * loaded once per page view). Replaces the former
 * `pl31820082.profitableratecpmnetwork.com` tag: the script path/key is
 * unchanged, only the Anti-Adblock host serves it now. Injected as
 * `<script src="https://furydonkeypharmacy.com/ef/1c/8a/ef1c8a99e819306ee5d861acb0544c45.js"></script>`
 * by components/ads/AdScripts.tsx via injectAdScriptOnce (never pasted raw
 * into a page/layout, which would double-load it).
 */
export const ADSTERRA_POPUNDER_URL =
  "https://furydonkeypharmacy.com/ef/1c/8a/ef1c8a99e819306ee5d861acb0544c45.js";

/**
 * Adsterra Smartlink — the monetised landing page used for watch intents.
 * Same path/key as before, now on the Anti-Adblock host: every watch CTA
 * (components/ads/useSmartlink.ts) opens this URL, and no other file may
 * hardcode it.
 */
export const ADSTERRA_SMARTLINK_URL =
  "https://furydonkeypharmacy.com/ispf2u0nr9?key=ab1a65e313a5c0034294ac768d3878cc";

/**
 * Every host the tags above fetch from, in the syntax a CSP source list wants.
 * lib/security-csp.ts reads this so the policy can never drift from the code;
 * the wildcard covers the per-account sub-domains Adsterra rotates
 * (`pl31820082.…` today, another number after a migration) and the bare host is
 * listed as well because `*.example.com` never matches `example.com`.
 */
export const AD_SCRIPT_HOSTS = [
  "https://highrevenueformat.com",
  "https://*.highrevenueformat.com",
  // Still needed: the Social Bar above is served from this host.
  "https://profitableratecpmnetwork.com",
  "https://*.profitableratecpmnetwork.com",
  // Anti-Adblock host: serves the Popunder script (and is the Smartlink
  // landing host). Without this entry the CSP would block the Popunder tag
  // on every public page, so it must move together with the two URLs above.
  "https://furydonkeypharmacy.com",
  "https://*.furydonkeypharmacy.com",
] as const;

/* ── switches (NEXT_PUBLIC_*, inlined at build time — rebuild after editing) ─ */

function envFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return !/^(0|false|off|no)$/i.test(raw.trim());
}

/**
 * Master switch. Default ON: the operator asked for the inventory to be live,
 * and a deployment without the variable must not silently lose its revenue.
 * Set `NEXT_PUBLIC_ADS_ENABLED=0` (and rebuild) to ship an ad-free build.
 */
export function adsEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_ADS_ENABLED, true);
}

export function socialBarEnabled(): boolean {
  return adsEnabled() && envFlag(process.env.NEXT_PUBLIC_ADS_SOCIAL_BAR, true);
}

export function popunderEnabled(): boolean {
  return adsEnabled() && envFlag(process.env.NEXT_PUBLIC_ADS_POPUNDER, true);
}

export function smartlinkEnabled(): boolean {
  return adsEnabled() && envFlag(process.env.NEXT_PUBLIC_ADS_SMARTLINK, true);
}

/**
 * How many times one browser session may be sent to the Smartlink from a watch
 * CTA. 1 (the default) monetises the first intent without turning every watch
 * click into a second tab; 0 disables the Smartlink click-through entirely.
 */
export function smartlinkMaxPerSession(): number {
  const raw = (process.env.NEXT_PUBLIC_ADS_SMARTLINK_PER_SESSION ?? "").trim();
  if (raw === "") return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(parsed, 10);
}

/**
 * Surfaces that never carry ad tags: the operator panel (it is not a reader
 * surface and its CSP/no-store contract is stricter) and JSON endpoints.
 * Everything else — including /account — keeps the tags.
 */
const AD_FREE_PREFIXES = ["/admin", "/api"] as const;

export function isAdFreePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return AD_FREE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/* ── banner slots ──────────────────────────────────────────────────────── */

/**
 * The two placements on the match page. The id travels in the frame URL (so
 * `/ad-frame` requests are attributable in the network's own reports) and is
 * part of the iframe `title`, which keeps the two frames distinguishable for
 * assistive technology.
 */
export type BannerSlot = "match-above-stream" | "match-below-stream";

export const BANNER_SLOT_LABEL_AR: Record<BannerSlot, string> = {
  "match-above-stream": "صفحة المباراة — فوق البث المباشر",
  "match-below-stream": "صفحة المباراة — تحت البث المباشر",
};

export function isBannerSlot(value: string | null | undefined): value is BannerSlot {
  return value === "match-above-stream" || value === "match-below-stream";
}

/**
 * src for the banner frame. The random token is not decoration: two banners
 * share one URL otherwise, and a cached frame document would be reused for both
 * placements — one request, one impression. The token forces a distinct fetch
 * (the route also answers `no-store`).
 */
export function adFrameSrc(slot: BannerSlot): string {
  const token = Math.random().toString(36).slice(2, 10);
  return `/ad-frame?slot=${slot}&t=${token}`;
}

/* ── the banner document ───────────────────────────────────────────────── */

/**
 * The document `/ad-frame` answers with: the operator's Adsterra snippet in the
 * synchronous form the network ships it in, inside a fixed 300×250 box, plus
 * `noindex` and no external references of our own. `atOptions` is built from
 * ADSTERRA_BANNER, so the key exists exactly once in the repository.
 */
export function adFrameDocument(): string {
  const { width, height } = ADSTERRA_BANNER;
  const options = JSON.stringify({
    key: ADSTERRA_BANNER.key,
    format: ADSTERRA_BANNER.format,
    height,
    width,
    params: {},
  });
  return [
    "<!doctype html>",
    '<html lang="ar" dir="rtl">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="robots" content="noindex, nofollow" />',
    "<title>إعلان</title>",
    // The frame is exactly the ad's own box: no scrollbars, no margins, no
    // background of its own (the page behind it shows through).
    `<style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}</style>`,
    "</head>",
    "<body>",
    `<script>atOptions = ${options};</script>`,
    `<script src="${ADSTERRA_BANNER_INVOKE_URL}"></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/* ── top-document tags (Social Bar · Popunder) ─────────────────────────── */

/** Remembers which tags this page view already injected (survives remounts). */
const injectedTags = new Set<string>();

/**
 * Append a tag once per document. React StrictMode mounts effects twice in
 * development and the root layout re-runs them on client navigations, so the
 * guard is module-level: a second call is a no-op, never a second impression.
 */
export function injectAdScriptOnce(id: string, src: string): HTMLScriptElement | null {
  if (typeof document === "undefined") return null;
  if (injectedTags.has(id) || document.getElementById(id)) return null;
  injectedTags.add(id);
  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;
  script.setAttribute("data-cfasync", "false");
  document.head.appendChild(script);
  return script;
}

const WRITE_GUARD_FLAG = "__nemoAdWriteGuard";

/** Insert markup, re-creating any <script> so an injected loader still runs. */
function appendMarkupPreservingScripts(markup: string): void {
  const template = document.createElement("template");
  template.innerHTML = markup;
  for (const original of Array.from(template.content.querySelectorAll("script"))) {
    // A <script> parsed through innerHTML never executes; a fresh element with
    // the same attributes/text does.
    const replacement = document.createElement("script");
    for (const attribute of Array.from(original.attributes)) {
      replacement.setAttribute(attribute.name, attribute.value);
    }
    replacement.textContent = original.textContent;
    original.replaceWith(replacement);
  }
  document.body.appendChild(template.content);
}

/**
 * Neutralise the one failure mode that turns an ad tag into a blank site.
 *
 * Per the HTML spec, `document.write()` after the document finished loading
 * implicitly calls `document.open()`, which REPLACES the whole document — that
 * is the blank-white-page publishers hit when a network tag is injected after
 * hydration. The guard keeps the tag's markup (scripts included, see above) and
 * appends it to `<body>` instead; writes that happen while the document is
 * still loading are forwarded untouched, since those are the normal, safe case.
 *
 * Installed only when the tags are actually enabled (components/ads/AdScripts).
 */
export function guardAgainstDocumentWriteWipe(): void {
  if (typeof document === "undefined") return;
  const scope = window as unknown as Record<string, unknown>;
  if (scope[WRITE_GUARD_FLAG]) return;
  scope[WRITE_GUARD_FLAG] = true;
  const nativeWrite = document.write.bind(document);
  document.write = (...markup: string[]) => {
    if (document.readyState !== "complete") {
      nativeWrite(...markup);
      return;
    }
    appendMarkupPreservingScripts(markup.join(""));
  };
}

/**
 * Run `task` when the browser is idle (after load), with a timeout so a busy
 * main thread cannot postpone the ad tags forever. Never on the critical path:
 * the Social Bar and Popunder are overlay inventory and must not compete with
 * first paint or with the match page's own data.
 */
export function whenIdle(task: () => void, timeout = 3000): void {
  if (typeof window === "undefined") return;
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof idle === "function") {
    idle(task, { timeout });
    return;
  }
  window.setTimeout(task, 300);
}
