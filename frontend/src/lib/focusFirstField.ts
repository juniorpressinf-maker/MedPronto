const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]):not([tabindex="-1"])',
  "textarea:not([disabled]):not([readonly]):not([tabindex=\"-1\"])",
  'select:not([disabled]):not([tabindex="-1"])',
].join(", ");

function isModalOpen() {
  return Boolean(
    document.querySelector(".msg-box-overlay") ||
      document.querySelector(".modal-overlay"),
  );
}

function isFocusableVisible(el: HTMLElement) {
  if (el.closest("[data-skip-autofocus], [hidden], [aria-hidden=\"true\"]")) {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return true;
}

function defaultFocusRoot(): ParentNode {
  return (
    document.querySelector("main.app-main") ??
    document.querySelector(".page-stack") ??
    document.body
  );
}

/** Foca o primeiro campo editável visível dentro do container. */
export function focusFirstField(root?: ParentNode | null): boolean {
  if (typeof document === "undefined" || isModalOpen()) return false;

  const container = root ?? defaultFocusRoot();
  const marked = container.querySelector<HTMLElement>("[data-autofocus=\"first\"]");
  if (marked && isFocusableVisible(marked)) {
    marked.focus({ preventScroll: true });
    return true;
  }

  for (const el of container.querySelectorAll<HTMLElement>(FIELD_SELECTOR)) {
    if (!isFocusableVisible(el)) continue;
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}
