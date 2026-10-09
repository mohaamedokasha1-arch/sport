"use client";

import { useId, useRef, useState } from "react";

/**
 * Safe preview for an embed URL that has NOT been saved yet.
 *
 * Flow: the operator clicks "معاينة" → the URL is validated SERVER-SIDE
 * (POST /api/admin/streams/validate — safety checks plus the active domain
 * policy from lib/stream-policy.ts) → only then is the sandboxed iframe
 * rendered inside a modal. A URL that fails validation never reaches an
 * iframe. The iframe itself is sandboxed (scripts allowed because players need
 * them, but no top-navigation and no same-origin escape beyond the provider's
 * own page) and restricted via allow="autoplay; encrypted-media;
 * picture-in-picture; fullscreen".
 *
 * In the default `open` policy any https host passes; the server may return a
 * non-blocking `warning` (host outside the reference list) which is shown as a
 * note, never as an error.
 */
export default function EmbedPreviewDialog({
  getUrl,
  title,
  buttonLabel = "معاينة",
}: {
  /** returns the current embed URL value from the form */
  getUrl: () => string;
  title: string;
  buttonLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [state, setState] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [url, setUrl] = useState("");

  async function openPreview() {
    const value = getUrl().trim();
    if (!value) {
      setState("error");
      setMessage("أدخل رابط الـEmbed أولًا.");
      setWarning("");
      dialogRef.current?.showModal();
      return;
    }
    setState("checking");
    setMessage("");
    setWarning("");
    setUrl(value);
    dialogRef.current?.showModal();
    try {
      const res = await fetch("/api/admin/streams/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reason?: string;
        warning?: string;
      };
      if (res.ok && data.ok) {
        setState("ok");
        setWarning(typeof data.warning === "string" ? data.warning : "");
      } else {
        setState("error");
        setMessage(data.error || "رابط الـEmbed غير صالح.");
      }
    } catch {
      setState("error");
      setMessage("تعذّر الاتصال بخادم التحقق.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
      >
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-[min(900px,calc(100%-1.5rem))] max-w-none rounded-[6px] border border-navy-700 bg-navy-950 p-0 text-white shadow-2xl backdrop:bg-black/80"
      >
        <section className="overflow-hidden rounded-[6px]">
          <header className="flex items-start justify-between gap-3 border-b border-navy-800 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 id={headingId} className="truncate text-[13px] font-extrabold">معاينة مشغّل البث · {title}</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                يتم فحص الرابط على الخادم قبل العرض. قد يمنع الناقل التضمين داخل الصفحات الخارجية.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] border border-navy-700 text-lg text-white/65 transition hover:border-live hover:text-live"
              aria-label="إغلاق المعاينة"
            >
              ×
            </button>
          </header>

          {state === "checking" ? (
            <div className="grid aspect-video w-full place-items-center bg-black">
              <p className="text-[12px] font-bold text-white/70">جارٍ التحقق من المصدر…</p>
            </div>
          ) : null}

          {state === "error" ? (
            <div className="border-t border-navy-800 px-4 py-4 sm:px-5">
              <p role="alert" className="rounded-[3px] border border-live/40 bg-live/10 px-3 py-2 text-[12px] font-bold text-red-200">
                {message}
              </p>
            </div>
          ) : null}

          {state === "ok" ? (
            <>
              {warning ? (
                <p className="border-t border-navy-800 px-4 py-2 text-[11px] leading-relaxed text-gold-200 sm:px-5">
                  ⚠️ {warning}
                </p>
              ) : null}
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={url}
                  title={`معاينة البث: ${title}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>
            </>
          ) : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-800 px-4 py-3 text-[11px] sm:px-5">
            <span className="num max-w-[65%] truncate text-white/40" dir="ltr">{url}</span>
            {state === "ok" ? (
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-gold-400 hover:underline">
                فتح الرابط ↗
              </a>
            ) : null}
          </footer>
        </section>
      </dialog>
    </>
  );
}
