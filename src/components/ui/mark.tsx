import Image from "next/image";

import { cn } from "~/lib/cn";

const sizes = {
  sm: { glyph: 20, text: "text-sm", gap: "gap-1.5" },
  md: { glyph: 28, text: "text-lg", gap: "gap-2.5" },
  lg: { glyph: 44, text: "text-2xl", gap: "gap-3" },
};

const ratio = 499.33 / 584.94;

export function Mark({
  withText = true,
  size = "md",
  variant = "auto",
  className,
}: {
  withText?: boolean;
  size?: keyof typeof sizes;
  variant?: "auto" | "dark" | "light";
  className?: string;
}) {
  const config = sizes[size];
  const isDark = variant === "dark";
  const isLight = variant === "light";
  const width = Math.round(config.glyph * ratio);

  return (
    <span className={cn("inline-flex items-center", config.gap, className)}>
      {!isLight && (
        <Image
          src="/brand/logo-dark.svg"
          alt=""
          width={width}
          height={config.glyph}
          unoptimized
          className={cn(
            "block",
            variant === "auto" && "dark:hidden",
            isDark && "dark:hidden",
          )}
          style={{ width, height: config.glyph }}
        />
      )}
      {!isDark && (
        <Image
          src="/brand/logo-light.svg"
          alt=""
          width={width}
          height={config.glyph}
          unoptimized
          className={cn(
            variant === "auto" && "hidden dark:block",
            isLight && "block",
            !isLight && "hidden",
          )}
          style={{ width, height: config.glyph }}
        />
      )}
      {withText && (
        <span
          className={cn(
            "uppercase-señal font-black leading-none",
            config.text,
          )}
        >
          Ubica<span className="text-azul-senal">Tec</span>
        </span>
      )}
    </span>
  );
}

export default Mark;
