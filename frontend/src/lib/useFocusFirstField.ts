import { useEffect, type DependencyList, type RefObject } from "react";
import { focusFirstField } from "./focusFirstField";

type Options = {
  rootRef?: RefObject<ParentNode | null>;
  enabled?: boolean;
};

/** Ao montar ou quando deps mudam, foca o primeiro campo disponível. */
export function useFocusFirstField(
  deps: DependencyList,
  { rootRef, enabled = true }: Options = {},
) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      focusFirstField(rootRef?.current ?? undefined);
    };

    const t1 = window.setTimeout(run, 0);
    const t2 = window.setTimeout(run, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps externas intencionais
  }, deps);
}
