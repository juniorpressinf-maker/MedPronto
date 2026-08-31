import { useLocation } from "react-router-dom";
import { useFocusFirstField } from "../lib/useFocusFirstField";

/** Foca o primeiro campo ao entrar em cada rota. */
export function PageFocus() {
  const { pathname } = useLocation();
  useFocusFirstField([pathname]);
  return null;
}
