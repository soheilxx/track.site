import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { pickMessages } from "@/i18n/client-messages";

/**
 * Focused auth shell for login, signup, password, verification, two-factor and invitation pages.
 * The auth forms are client components that read the `auth` namespace, so this group nests a
 * provider with exactly that namespace (the locale root provider carries none, see its comment).
 */
export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickMessages(messages, ["auth"])}>
      <AuthFrame locale={locale}>{children}</AuthFrame>
    </NextIntlClientProvider>
  );
}
