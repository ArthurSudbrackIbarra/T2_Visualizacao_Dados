import type { ReactNode } from "react";

// Styled hover help: a small "?" badge that reveals a designed popover on hover/focus.
// (Not the native browser title tooltip.)
export default function Help({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <span className="help-wrap" tabIndex={0}>
      <span className="help-badge" aria-hidden>?</span>
      <span className={`help-pop${wide ? " wide" : ""}`} role="tooltip">{children}</span>
    </span>
  );
}
