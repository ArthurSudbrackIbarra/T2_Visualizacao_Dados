import type { ReactNode } from "react";

// Styled hover help: a small "?" badge that reveals a designed popover on hover/focus.
// (Not the native browser title tooltip.) `align` controls which edge the popover
// anchors to — use "right" inside the right-hand panel so it doesn't run off-screen.
export default function Help({
  children,
  wide,
  align = "left",
}: {
  children: ReactNode;
  wide?: boolean;
  align?: "left" | "right";
}) {
  return (
    <span className="help-wrap" tabIndex={0}>
      <span className="help-badge" aria-hidden>
        ?
      </span>
      <span
        className={`help-pop${wide ? " wide" : ""}${align === "right" ? " right" : ""}`}
        role="tooltip"
      >
        {children}
      </span>
    </span>
  );
}
