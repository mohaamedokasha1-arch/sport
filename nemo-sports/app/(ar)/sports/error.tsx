"use client";
export default function Error({ reset }: { reset: () => void }) { return <section className="p-6"><h2 className="font-bold">تعذّر قراءة البيانات</h2><p className="my-3 text-muted">قد تكون خدمة البيانات غير متاحة. لا يعني ذلك عدم وجود مباريات.</p><button onClick={reset} className="border border-line p-2">إعادة المحاولة</button></section>; }
