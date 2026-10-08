"use client";

import { FormEvent, ReactNode } from "react";

/**
 * A <form> wrapper that asks for confirmation before submitting to a server
 * action (delete safety). The native form submission is kept intact, so
 * server-action redirects and revalidation behave exactly as usual; the
 * confirm only cancels the submit when the operator declines.
 */
export default function ConfirmForm({
  message,
  action,
  children,
  className,
}: {
  message: string;
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={onSubmit} className={className}>
      {children}
    </form>
  );
}
