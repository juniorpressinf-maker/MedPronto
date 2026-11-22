/** Espelha PERMISSOES_PADRAO do backend (somente UI). */
import type { Perfil } from "./api";

export const PERMISSOES_PADRAO: Record<Perfil, string[]> = {
  secretaria: [
    "agenda",
    "agenda_config",
    "pacientes",
    "fila_recepcao",
    "exames_anexos",
    "admissional_agenda",
    "whatsapp",
    "remoto",
    "cobranca",
    "cobranca_relatorios",
    "cobranca_config",
    "contas_pagar",
    "caixa",
    "chat_interno",
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
    "fichas_medico",
    "cobranca_solicitar",
    "chat_interno",
  ],
  admin: [
    "agenda",
    "agenda_config",
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
    "fichas_config",
    "fichas_medico",
    "cobranca",
    "cobranca_solicitar",
    "cobranca_config",
    "cobranca_relatorios",
    "contas_pagar",
    "caixa",
    "chat_interno",
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
