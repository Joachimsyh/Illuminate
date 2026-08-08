"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  value,
  onChange,
  id,
  name,
  autoFocus,
  required,
  minLength,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1.5">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className={
          className ||
          "w-full rounded-xl border border-white/10 bg-ink-900/80 py-2.5 pl-3.5 pr-11 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-mist-400 transition hover:text-mist-100"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
