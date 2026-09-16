import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "حسابك — تسجيل الدخول والتفضيلات",
  description: "سجّل الدخول لمتابعة فرقك المفضلة وتفعيل إشعارات الأهداف والأخبار العاجلة.",
  alternates: { canonical: "/account" },
};

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6 border-b-2 border-line pb-3">
        <p className="eyebrow mb-1">Account</p>
        <h1 className="text-2xl font-extrabold tracking-tight">حسابك</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form className="card space-y-4 p-5" action="#" method="post">
          <h2 className="text-[15px] font-extrabold">تسجيل الدخول</h2>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold">البريد الإلكتروني</span>
            <input
              type="email"
              name="email"
              className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
              placeholder="you@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold">كلمة المرور</span>
            <input
              type="password"
              name="password"
              className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
              placeholder="••••••••"
            />
          </label>
          <div className="flex items-center justify-between text-[12px]">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="remember" className="accent-[#D4AF37]" />
              تذكرني
            </label>
            <a href="/contact" className="font-bold text-gold-600 dark:text-gold-400">نسيت كلمة المرور؟</a>
          </div>
          <button
            type="submit"
            className="w-full rounded-[3px] bg-gold-500 px-4 py-2.5 text-[13px] font-extrabold text-navy-900 transition hover:bg-gold-400"
          >
            دخول
          </button>
          <p className="text-[11px] leading-relaxed text-muted">
            المصادقة في الإنتاج: تجزئة bcrypt/argon2، تأكيد البريد، و2FA إلزامي لمستخدمي لوحة
            التحكم. هذه النسخة التجريبية لا تحتوي على خادم مصادقة.
          </p>
        </form>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-[15px] font-extrabold">لماذا تنشئ حسابًا؟</h2>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
              <li>• متابعة فرقك ولاعبيك وبطولاتك المفضلة في مكان واحد.</li>
              <li>• إشعارات فورية: هدف، بداية مباراة، نهاية مباراة، بطاقة حمراء.</li>
              <li>• حفظ المباريات المهمة وتنبيه قبل انطلاقها بـ 30 دقيقة.</li>
              <li>• تنبيه فوري بالأخبار العاجلة لفرقك المفضلة.</li>
              <li>• ضبط ساعات «عدم الإزعاج» واختيار قنوات التسليم.</li>
            </ul>
          </div>

          <div className="card p-5">
            <h2 className="text-[15px] font-extrabold">إعدادات الإشعارات (معاينة)</h2>
            <ul className="mt-3 space-y-2.5 text-[13px]">
              {[
                { t: "الأهداف والنتائج", on: true },
                { t: "بداية المباريات المتابعة", on: true },
                { t: "الأخبار العاجلة", on: true },
                { t: "أخبار الفرق المفضلة", on: false },
                { t: "تنبيهات البث الرسمي", on: false },
              ].map((x) => (
                <li key={x.t} className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{x.t}</span>
                  <span
                    className={`grid h-6 w-11 place-items-center rounded-full p-0.5 ${x.on ? "bg-win" : "bg-navy-850/15 dark:bg-white/15"}`}
                    aria-hidden
                  >
                    <span className={`h-5 w-5 rounded-full bg-white transition ${x.on ? "-translate-x-5" : "translate-x-0"}`} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">
              قنوات التسليم: إشعارات المتصفح، داخل الموقع، البريد الإلكتروني، وPush في تطبيق
              الهاتف (مستقبلاً).
            </p>
          </div>

          <p className="text-[12px] text-muted">
            للتصفح دون حساب:{" "}
            <Link href="/live" className="font-bold text-gold-600 dark:text-gold-400">النتائج المباشرة</Link>{" "}
            ·{" "}
            <Link href="/news" className="font-bold text-gold-600 dark:text-gold-400">الأخبار</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
