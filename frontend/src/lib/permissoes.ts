import type { NavItem } from "../config/navigation";

export function temModulo(
  permissoes: string[] | undefined,
  modulo: string | string[],
): boolean {
  if (!permissoes?.length) return false;
  const mods = Array.isArray(modulo) ? modulo : [modulo];
  return mods.some((m) => permissoes.includes(m));
}

export function filtrarNavegacao(
  items: NavItem[],
  permissoes: string[],
): NavItem[] {
  return items
    .map((item) => {
      if (item.children?.length) {
        const children = filtrarNavegacao(item.children, permissoes);
        if (!children.length) return null;
        return { ...item, children };
      }
      if (!item.path) return item;
      const mod = item.modulo;
      if (!mod) return item;
      return temModulo(permissoes, mod) ? item : null;
    })
    .filter((x): x is NavItem => x !== null);
}

const ROTA_MODULO: Record<string, string | string[]> = {
  "/medico/fila": ["fila_medico", "fila_recepcao"],
  "/medico/atendimento": ["prontuario_escrever", "prontuario_ler", "fila_medico"],
  "/agenda": ["agenda", "fila_recepcao"],
  "/medicos": ["usuarios", "clinica"],
  "/pacientes": "pacientes",
  "/admissional": ["admissional", "admissional_agenda"],
  "/configuracoes/clinica": "clinica",
  "/configuracoes/usuarios": "usuarios",
  "/configuracoes/backup": "backup",
  "/configuracoes/fichas": ["fichas_config", "fichas_medico"],
  "/configuracoes/remoto": "remoto",
  "/configuracoes/licenca": "licenca",
  "/configuracoes/whatsapp": "whatsapp",
  "/cobranca": "cobranca",
};

export function moduloParaRota(pathname: string): string | string[] | null {
  if (pathname === "/" || pathname.startsWith("/login")) return null;
  for (const [prefix, mod] of Object.entries(ROTA_MODULO)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return mod;
  }
  return null;
}

