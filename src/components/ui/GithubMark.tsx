/**
 * GitHub mark.
 *
 * Inlined because lucide-react v1 dropped brand icons — pulling in a second icon
 * package for one glyph is not worth the dependency.
 */

import { cn } from "@/lib/utils";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={cn("size-3.5", className)}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.91-.88-2.91-2.9 0-.58.21-1.05.55-1.42-.05-.14-.24-.71.05-1.47 0 0 .58-.18 1.9.7a5.4 5.4 0 0 1 1.44-.19c.49 0 .98.06 1.44.19 1.32-.89 1.9-.7 1.9-.7.29.76.1 1.33.05 1.47.34.37.55.84.55 1.42 0 2.03-1.14 2.7-2.92 2.9.3.26.56.76.56 1.53 0 1.1-.01 1.99-.01 2.26 0 .21.15.46.55.38A7.99 7.99 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
