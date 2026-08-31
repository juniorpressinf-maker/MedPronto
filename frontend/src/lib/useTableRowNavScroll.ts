import { useCallback, useEffect, useRef, useState } from "react";

const INTERACTIVE_SEL = "button,a,form,input,select,label,textarea";

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(INTERACTIVE_SEL);
}

export function useTableRowNavScroll<T extends string | number = string>() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [focusRowId, setFocusRowId] = useState<T | null>(null);

  useEffect(() => {
    if (focusRowId == null) return;
    const row = rowRef.current;
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusRowId]);

  const clearFocus = useCallback(() => setFocusRowId(null), []);

  const focusRow = useCallback((id: T) => setFocusRowId(id), []);

  const scrollHoriz = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(120, Math.round(el.clientWidth * 0.35));
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  const moveFocusVert = useCallback(
    (dir: -1 | 1, rowIds: T[]) => {
      if (!rowIds.length) return;
      const idx = focusRowId != null ? rowIds.indexOf(focusRowId) : -1;
      let nextIdx: number;
      if (idx < 0) {
        nextIdx = dir === 1 ? 0 : rowIds.length - 1;
      } else {
        nextIdx = idx + dir;
        if (nextIdx < 0 || nextIdx >= rowIds.length) return;
      }
      setFocusRowId(rowIds[nextIdx]!);
    },
    [focusRowId],
  );

  const handleRowClick = useCallback(
    (id: T, ev: React.MouseEvent, onActivate: (id: T) => void) => {
      if (isInteractiveTarget(ev.target)) return;
      if (focusRowId === id) {
        onActivate(id);
      } else {
        setFocusRowId(id);
      }
    },
    [focusRowId],
  );

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, id: T, rowIds: T[], onActivate: (id: T) => void) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocusVert(-1, rowIds);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocusVert(1, rowIds);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollHoriz(-1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollHoriz(1);
        return;
      }
      if ((e.key === "Enter" || e.key === " ") && focusRowId === id) {
        e.preventDefault();
        onActivate(id);
      }
    },
    [focusRowId, moveFocusVert, scrollHoriz],
  );

  return {
    scrollRef,
    focusRowId,
    rowRef,
    clearFocus,
    focusRow,
    handleRowClick,
    handleRowKeyDown,
  };
}
