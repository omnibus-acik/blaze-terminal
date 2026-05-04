import { useCallback, useEffect, useRef } from "react";
import type { Direction } from "../state/layout";

interface SplitterProps {
  direction: Direction;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResize: (ratio: number) => void;
}

export function Splitter({ direction, containerRef, onResize }: SplitterProps) {
  const dragging = useRef(false);

  const handleMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const ratio =
        direction === "horizontal"
          ? (e.clientX - rect.left) / rect.width
          : (e.clientY - rect.top) / rect.height;
      onResize(ratio);
    },
    [containerRef, direction, onResize]
  );

  const handleUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [handleMove, handleUp]);

  return (
    <div
      className={`splitter splitter-${direction}`}
      onPointerDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }}
      role="separator"
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
    />
  );
}
