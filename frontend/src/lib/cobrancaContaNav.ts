import type { NavigateFunction } from "react-router-dom";

export type CobrancaContaNavState = {
  returnTo: string;
  returnLabel?: string;
};

const KEY = "medpronto:cobranca-conta-return";

function stashKey(contaId: number) {
  return `${KEY}:${contaId}`;
}

export function cobrancaReturnPath(
  pathname: string,
  params: Record<string, string | number | undefined | null> = {},
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function stashCobrancaContaReturn(
  contaId: number,
  returnTo: string,
  returnLabel?: string,
): void {
  try {
    sessionStorage.setItem(
      stashKey(contaId),
      JSON.stringify({ returnTo, returnLabel }),
    );
  } catch {
    /* quota / privado */
  }
}

export function clearCobrancaContaReturn(contaId: number): void {
  try {
    sessionStorage.removeItem(stashKey(contaId));
  } catch {
    /* ignora */
  }
}

export function linkCobrancaConta(
  contaId: number,
  returnTo: string,
  returnLabel?: string,
) {
  stashCobrancaContaReturn(contaId, returnTo, returnLabel);
  return {
    pathname: `/cobranca/contas/${contaId}`,
    state: { returnTo, returnLabel } satisfies CobrancaContaNavState,
  };
}

export function parseCobrancaContaNav(
  state: unknown,
  contaId?: number,
): { returnTo: string; returnLabel: string } {
  const s = state as CobrancaContaNavState | null;
  if (s?.returnTo) {
    if (contaId) stashCobrancaContaReturn(contaId, s.returnTo, s.returnLabel);
    return {
      returnTo: s.returnTo,
      returnLabel: s.returnLabel ?? "Voltar",
    };
  }

  if (contaId) {
    try {
      const raw = sessionStorage.getItem(stashKey(contaId));
      if (raw) {
        const parsed = JSON.parse(raw) as CobrancaContaNavState;
        if (parsed.returnTo) {
          return {
            returnTo: parsed.returnTo,
            returnLabel: parsed.returnLabel ?? "Voltar",
          };
        }
      }
    } catch {
      /* ignora */
    }
  }

  return {
    returnTo: "/cobranca/contas",
    returnLabel: "Voltar às contas",
  };
}

export function navigateBackFromConta(
  navigate: NavigateFunction,
  returnTo: string,
  contaId?: number,
): void {
  if (contaId) clearCobrancaContaReturn(contaId);
  navigate(returnTo, { replace: true });
}
