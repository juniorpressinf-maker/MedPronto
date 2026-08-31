/** Espelha PERMISSOES_PADRAO do backend (somente UI). */
import type { Perfil } from "./api";

export const PERMISSOES_PADRAO: Record<Perfil, string[]> = {
  secretaria: [
    "agenda",
    "pacientes",
    "fila_recepcao",
    "exames_anexos",
    "admissional_agenda",
    "whatsapp",
    "remoto",
    "cobranca",
    "cobranca_relatorios",
    "cobranca_config",
  ],
  medico: [
    "fila_medico",
    "prontuario_ler",
    "prontuario_escrever",
    "receituario",
    "documentos",
    "admissional",
    "agenda",
    "pacientes",
    "cobranca_solicitar",
  ],
  admin: [
    "agenda",
    "pacientes",
    "fila_recepcao",
    "exames_anexos",
    "fila_medico",
    "prontuario_ler",
    "prontuario_escrever",
    "receituario",
    "documentos",
    "admissional",
    "admissional_agenda",
    "usuarios",
    "clinica",
    "backup",
    "licenca",
    "whatsapp",
    "remoto",
    "cobranca",
    "cobranca_solicitar",
    "cobranca_config",
    "cobranca_relatorios",
  ],
};

/** Filtra o padrão do perfil pelos módulos que a API expõe. */
export function permissoesPadraoDoPerfil(
  perfil: Perfil,
  modulosDisponiveis?: string[],
): string[] {
  const base = PERMISSOES_PADRAO[perfil];
  if (!modulosDisponiveis?.length) return [...base];
  const ok = new Set(modulosDisponiveis);
  return base.filter((m) => ok.has(m));
}
