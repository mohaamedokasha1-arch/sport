/**
 * NEMO Sports · stream/broadcast URL policy — single source of truth
 * ─────────────────────────────────────────────────────────────────────────
 * Two independent layers decide whether an embed URL is accepted:
 *
 *  1. SAFETY layer (always on, never configurable)
 *     Protects the site and its visitors regardless of who owns the content:
 *     a parseable absolute URL, `https:` only, no embedded credentials, no
 *     non-standard port, no HTML/script markup or quotes inside the value, no
 *     `javascript:`/`data:`/`blob:`/`file:` scheme, and no loopback/private/
 *     link-local host (a URL only reachable from the operator's machine or the
 *     server would render as a dead player for every visitor).
 *
 *  1b. STRICT checks (on for every NEW save and for the admin validator; off for
 *     the public display path so records saved before this rule keep showing —
 *     see `isDisplayableEmbedUrl` in lib/match-streams.ts). They refuse links
 *     whose real destination cannot be judged: a bare IP address, a single-label
 *     host (no dot), and known URL shorteners.
 *
 *  2. DOMAIN layer (configurable — `StreamDomainPolicy`)
 *     · `open`      → ANY https host is accepted. The operator decides which
 *                     links to register; nothing is auto-rejected. THIS IS THE
 *                     DEFAULT.
 *     · `allowlist` → only hosts on the reference list (lib/broadcasts.ts
 *                     `OFFICIAL_BROADCAST_DOMAINS`) plus any domain added via
 *                     `NEMO_STREAM_ALLOWED_DOMAINS` are accepted. Use it when a
 *                     deployment wants the old curated behaviour back.
 *
 * The domain layer is a *rights policy*, not a security control: an allowlisted
 * host is not proof of broadcast rights, and an unlisted host is not proof of
 * piracy. That is why it is now an operator switch instead of a hardcoded gate.
 *
 * Configuration (all optional, read at call time so tests and the admin panel
 * can flip the mode without a rebuild):
 *   NEMO_STREAM_DOMAIN_POLICY   = open | allowlist        (default: open)
 *   STREAM_DOMAIN_POLICY        = same, short alias
 *   NEMO_STRICT_STREAM_DOMAINS  = 1 → allowlist           (boolean shortcut)
 *   NEMO_STREAM_ALLOWED_DOMAINS = "my-cdn.com, tv.example" (extra allowlist
 *                                 entries, used only in `allowlist` mode)
 */

export type StreamDomainPolicy = "open" | "allowlist";

export interface StreamPolicyOptions {
  /** Force a policy instead of reading the environment. */
  policy?: StreamDomainPolicy;
  /** Extra allowlisted domains (merged with the env-provided ones). */
  extraDomains?: readonly string[];
  /**
   * Apply the strict save-time checks (IP literal, single-label host, URL
   * shortener). Default `true`. Public display passes `false` so that records
   * stored before the rule existed are not hidden.
   */
  strict?: boolean;
}

export interface StreamUrlCheck {
  ok: boolean;
  /** Human-readable (Arabic) explanation — safe to show in the admin UI. */
  reason: string;
  /** Normalized hostname, or "" when the value could not be parsed. */
  host: string;
  /** The domain policy that was in effect for this check. */
  policy: StreamDomainPolicy;
  /**
   * Non-blocking note. In `open` mode a host outside the reference list still
   * passes, but the operator is reminded that link rights are their own
   * responsibility. `null` when there is nothing to note.
   */
  warning: string | null;
}

/* ── policy resolution ─────────────────────────────────────────────── */

const TRUTHY = new Set(["1", "true", "yes", "on", "enabled"]);

function envFlag(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] ?? "").trim();
    if (value) return value.toLowerCase();
  }
  return "";
}

/**
 * The active domain policy. `open` unless the deployment explicitly asks for
 * the curated allowlist.
 */
export function streamDomainPolicy(): StreamDomainPolicy {
  const raw = envFlag("NEMO_STREAM_DOMAIN_POLICY", "STREAM_DOMAIN_POLICY");
  if (raw === "allowlist" || raw === "strict" || raw === "whitelist" || raw === "official") return "allowlist";
  if (raw === "open" || raw === "free" || raw === "any" || raw === "off") return "open";
  if (TRUTHY.has(envFlag("NEMO_STRICT_STREAM_DOMAINS"))) return "allowlist";
  return "open";
}

/** Domains added by the operator through the environment (allowlist mode). */
export function envAllowedDomains(): string[] {
  return String(process.env.NEMO_STREAM_ALLOWED_DOMAINS ?? "")
    .split(/[,\s|]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^\.+/, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

export const STREAM_POLICY_AR: Record<StreamDomainPolicy, string> = {
  open: "الوضع الحر — أي رابط https يُقبل",
  allowlist: "وضع القائمة — النطاقات المعتمدة فقط",
};

/* ── host helpers ──────────────────────────────────────────────────── */

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^www\./, "");
}

/** Loopback / RFC1918 / link-local / reserved hosts — never a public player. */
export function isNonPublicHost(host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h === "0.0.0.0" || h === "255.255.255.255") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map((n) => Number(n));
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/** URL shorteners hide the real destination, so the rights holder cannot be checked. */
export const URL_SHORTENER_DOMAINS: readonly string[] = [
  "bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "lnkd.in", "tiny.cc", "shorte.st",
];

/** A bare IPv4 or IPv6 literal (no domain name). */
export function isIpLiteral(host: string): boolean {
  const h = normalizeHost(host);
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");
}

/** Exact host or any subdomain of one of the listed domains. */
export function hostInList(host: string, domains: readonly string[]): boolean {
  const h = normalizeHost(host);
  return domains.some((d) => {
    const domain = normalizeHost(d);
    return Boolean(domain) && (h === domain || h.endsWith(`.${domain}`));
  });
}

/* ── the check ─────────────────────────────────────────────────────── */

/**
 * Validate an embed/broadcast URL.
 *
 * `referenceDomains` is injected by lib/broadcasts.ts (the curated list) so
 * this module stays free of imports and can be used from both server code and
 * scripts. In `open` mode the list is only used to decide whether a soft
 * warning is attached.
 */
export function inspectStreamUrl(
  raw: string,
  referenceDomains: readonly string[],
  options: StreamPolicyOptions = {},
): StreamUrlCheck {
  const policy = options.policy ?? streamDomainPolicy();
  const extra = [...(options.extraDomains ?? []), ...envAllowedDomains()];
  const allowlist = [...referenceDomains, ...extra];
  const value = String(raw ?? "").trim();

  const fail = (reason: string, host = ""): StreamUrlCheck => ({ ok: false, reason, host, policy, warning: null });

  if (!value) return fail("الرابط مطلوب");

  // Markup / quoting / control characters would break out of an attribute or
  // inject HTML — rejected before any URL parsing.
  if (/[<>"'`]/.test(value) || /<\s*script/i.test(value)) {
    return fail("رابط غير صالح — لا يُسمح بعلامات HTML أو سكربتات");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value) || /\s/.test(value)) {
    return fail("رابط غير صالح — يحتوي مسافات أو رموز تحكم");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail("رابط غير صالح — أدخل رابطًا كاملًا يبدأ بـ https://");
  }

  if (url.protocol !== "https:") {
    return fail(
      url.protocol === "http:"
        ? "الرابط يجب أن يكون https — الروابط غير الآمنة لا تعمل داخل المشغّل"
        : `بروتوكول غير مسموح (${url.protocol.replace(":", "")}) — https فقط`,
    );
  }
  if (url.username || url.password) return fail("لا يُسمح ببيانات اعتماد داخل الرابط (user:pass@)");
  if (url.port && url.port !== "443") return fail("لا يُسمح بمنفذ غير قياسي في الرابط");

  const host = normalizeHost(url.hostname);
  if (!host) return fail("رابط غير صالح — اسم النطاق مفقود");
  if (isNonPublicHost(host)) return fail(`النطاق ${host} داخلي/محلي ولا يمكن للزوار الوصول إليه`);

  if (options.strict ?? true) {
    if (isIpLiteral(host)) return fail("عنوان IP مباشر غير مقبول — أدخل رابط النطاق الكامل (مثل example.com)", host);
    if (!host.includes(".")) return fail(`النطاق ${host} ليس اسم نطاق كاملًا — أدخل الرابط الكامل`, host);
    if (hostInList(host, URL_SHORTENER_DOMAINS)) {
      return fail(`روابط الاختصار (${host}) تُخفي الوجهة الأصلية — أدخل الرابط الكامل للمصدر`, host);
    }
  }

  const listed = hostInList(host, allowlist);

  if (policy === "allowlist" && !listed) {
    return fail(
      `النطاق ${host} غير موجود في قائمة النطاقات المعتمدة — أضفه إلى NEMO_STREAM_ALLOWED_DOMAINS أو بدّل السياسة إلى open`,
      host,
    );
  }

  return {
    ok: true,
    reason: listed ? "نطاق معتمد ضمن قائمة النواقل" : "رابط مقبول — الوضع الحر يسمح بأي نطاق https",
    host,
    policy,
    warning: listed
      ? null
      : `النطاق ${host} خارج قائمة النواقل المرجعية. الحفظ مسموح — مسؤولية التأكد من حق التضمين تقع على المشغّل.`,
  };
}
