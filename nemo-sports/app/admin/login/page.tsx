"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { NemoMark } from "@/components/brand/Logo";

export default function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "تعذر تسجيل الدخول.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بخادم لوحة التحكم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-[6px] border border-navy-800 bg-navy-900 p-6 shadow-2xl sm:p-8">
        <div className="mb-8 text-center">
          <NemoMark size={40} tone="light" />
          <p className="mt-4 font-display text-xs font-bold uppercase tracking-[0.22em] text-gold-400">NEMO Admin</p>
          <h1 className="mt-2 text-xl font-extrabold">تسجيل الدخول</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/50">لوحة التحكم محمية. لا توجد بيانات دخول تجريبية داخل التطبيق.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-white/70">اسم المستخدم</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="w-full rounded-[3px] border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold-500"
              required
              disabled={loading}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-white/70">كلمة المرور</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-[3px] border border-navy-700 bg-navy-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-gold-500"
              required
              disabled={loading}
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-[3px] border border-live/40 bg-live/10 px-3 py-2.5 text-xs font-bold leading-relaxed text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[3px] bg-gold-500 px-4 py-2.5 text-sm font-extrabold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "جارٍ التحقق…" : "دخول آمن"}
          </button>
        </form>

        <p className="mt-6 border-t border-navy-800 pt-4 text-center text-[11px] leading-relaxed text-white/40">
          يُضبط الحساب من متغيرات البيئة <span dir="ltr" className="num">ADMIN_USERNAME</span> و<span dir="ltr" className="num">ADMIN_PASSWORD_HASH</span>.
        </p>
      </section>
    </div>
  );
}
