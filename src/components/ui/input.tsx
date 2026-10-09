"use client";

import { forwardRef, useId, useState } from "react";

import { cn } from "~/lib/cn";

const sizes = {
  sm: "h-10 text-[13px]",
  md: "h-12 text-[15px]",
  lg: "h-14 text-[17px]",
};

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const EyeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="3.5" />
    <path d="M21 12c-2 3.5-5 6-9 6s-7-2.5-9-6c2-3.5 5-6 9-6s7 2.5 9 6z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M3 3 21 21M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 4.2A10 10 0 0 1 21 12a10.5 10.5 0 0 1-3 3.7M6.6 6.6A10.4 10.4 0 0 0 3 12c1.7 3.5 5.5 6 9 6a9 9 0 0 0 3.4-.7" />
  </svg>
);

function Slot({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-foreground/50 flex items-center pl-3.5">{children}</span>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  iconLeft?: React.ReactNode;
  inputSize?: keyof typeof sizes;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    hint,
    iconLeft,
    inputSize = "md",
    className,
    id,
    type = "text",
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const withSearch = type === "search" && !iconLeft;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className={cn(
            "uppercase-señal text-[10px] font-extrabold tracking-[0.08em]",
            error ? "text-[#c0392b]" : "text-foreground",
          )}
        >
          {label}
        </label>
      )}
      <div
        className={cn(
          "bg-background group flex items-stretch border transition-colors",
          error
            ? "border-[#c0392b] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#c0392b]"
            : "border-foreground focus-within:border-azul-senal focus-within:outline-azul-senal focus-within:outline focus-within:outline-2 focus-within:outline-offset-2",
          rest.disabled && "opacity-35",
        )}
      >
        {withSearch && <Slot><SearchIcon /></Slot>}
        {iconLeft && <Slot>{iconLeft}</Slot>}
        <input
          ref={ref}
          id={inputId}
          type={type === "password" ? (revealed ? "text" : "password") : type}
          aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${inputId}-desc` : undefined}
          className={cn(
            "text-foreground placeholder:text-foreground/40 flex-1 border-0 bg-transparent px-3.5 font-semibold tracking-[0.01em] outline-none",
            sizes[inputSize],
            (withSearch || !!iconLeft) && "pl-2",
            className,
          )}
          {...rest}
        />
        {type === "password" && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="text-foreground/50 hover:text-foreground px-3"
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <p
          id={`${inputId}-desc`}
          className="uppercase-señal flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.06em] text-[#c0392b]"
        >
          <span className="inline-block size-1.5 bg-[#c0392b]" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-desc`} className="text-foreground/60 text-[11px] font-medium">
          {hint}
        </p>
      )}
    </div>
  );
});
