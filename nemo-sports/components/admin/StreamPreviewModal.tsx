"use client";

import { useId, useRef } from "react";

type StreamPreviewModalProps = {
  title: string;
  url: string;
};

/**
 * Preview an already-saved official match player. The caller only renders this
 * control after the server-side official-domain validator accepts the URL.
 */
export default function StreamPreviewModal({ title, url }: StreamPreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
        aria-haspopup="dialog"
      >
        معاينة
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
              <h2 id={headingId} className="truncate text-[13px] font-extrabold">معاينة المصدر الرسمي · {title}</h2>
              <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                قد يمنع الناقل تضمين المشغّل داخل صفحة خارجية؛ عندها افتح الرابط الرسمي مباشرة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] border border-navy-700 text-lg text-white/65 transition hover:border-live hover:text-live"
              aria-label="إغلاق المعاينة"
              autoFocus
            >
              ×
            </button>
          </header>
          <div className="aspect-video w-full bg-black">
            <iframe
              src={url}
              title={`معاينة المشغّل الرسمي: ${title}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-800 px-4 py-3 text-[11px] sm:px-5">
            <span className="num max-w-[65%] truncate text-white/40" dir="ltr">{url}</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-bold text-gold-400 hover:underline"
            >
              فتح الرابط الرسمي ↗
            </a>
          </footer>
        </section>
      </dialog>
    </>
  );
}
