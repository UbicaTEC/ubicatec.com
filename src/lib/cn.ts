/** Class-name joiner, matching the source bundle's `cn` (clsx + tailwind-merge). */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...parts: ClassValue[]) {
  return twMerge(clsx(parts));
}
