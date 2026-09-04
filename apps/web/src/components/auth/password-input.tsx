"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type InputHTMLAttributes, type Ref } from "react";
import { IconButton, Input, cn, type FieldState } from "@track-site/ui";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { state?: FieldState; ref?: Ref<HTMLInputElement> };

/** Password field with a localized show/hide toggle (a real button, never inside the label). */
export function PasswordInput({ className, ref, ...props }: PasswordInputProps) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  // React 19 hands `ref` over as a plain prop; <Input> spreads it onto the native element.
  const inputProps = { ...props, ref };
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-12", className)} {...inputProps} />
      <IconButton
        type="button"
        label={visible ? t("hidePassword") : t("showPassword")}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-0.5 size-9 -translate-y-1/2 text-ink-3 hover:text-ink pointer-coarse:size-11"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </IconButton>
    </div>
  );
}
