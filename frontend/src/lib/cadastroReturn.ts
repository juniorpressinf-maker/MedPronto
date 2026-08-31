import { loadScreenState, saveScreenState } from "./screenState";

export type CadastroReturnCtx = {
  returnPath: string;
  pickField: string;
  formScope: string;
  resource: string;
};

const KEY = "medpronto:cadastro-return";

export function setCadastroReturn(ctx: CadastroReturnCtx) {
  sessionStorage.setItem(KEY, JSON.stringify(ctx));
}

export function peekCadastroReturn(resource: string): CadastroReturnCtx | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as CadastroReturnCtx;
    return ctx.resource === resource ? ctx : null;
  } catch {
    return null;
  }
}

export function takeCadastroReturn(resource: string): CadastroReturnCtx | null {
  const ctx = peekCadastroReturn(resource);
  if (!ctx) return null;
  sessionStorage.removeItem(KEY);
  return ctx;
}

const FOCUS_FIELD_KEY = "_focusField";

export function applyPickToForm(
  formScope: string,
  pickField: string,
  id: number,
  extra?: Record<string, string>,
) {
  const saved = loadScreenState<Record<string, string>>(formScope) ?? {};
  saveScreenState(formScope, {
    ...saved,
    ...extra,
    [pickField]: String(id),
    [FOCUS_FIELD_KEY]: pickField,
  });
}

export function consumeFormFocus(scope: string): string | null {
  const saved = loadScreenState<Record<string, string>>(scope);
  const field = saved?.[FOCUS_FIELD_KEY];
  if (!field) return null;
  const { [FOCUS_FIELD_KEY]: _f, ...rest } = saved;
  saveScreenState(scope, rest);
  return field;
}
