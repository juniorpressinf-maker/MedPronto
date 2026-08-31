import { ASO_TITULO } from "../admissional/labels.js";
import type { Perfil } from "./users.js";
import { getDb } from "../db/index.js";

export const MODULOS = [
  "agenda",
  "pacientes",
  "fila_recepcao",
  "exames_anexos",
  "fila_medico",
  "prontuario_ler",
  "prontuario_escrever",
  "receituario",
  "documentos",
  "usuarios",
  "clinica",
  "backup",
  "licenca",
  "whatsapp",
  "remoto",
  "fichas_config",
  "fichas_medico",
  "admissional",
  "admissional_agenda",
  "cobranca",
  "cobranca_solicitar",
  "cobranca_config",
  "cobranca_relatorios",
] as const;

export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABELS: Record<Modulo, string> = {
  agenda: "Agenda",
  pacientes: "Pacientes",
  fila_recepcao: "Check-in / fila recepção",
  exames_anexos: "Exames anexos",
  fila_medico: "Fila do médico",
  prontuario_ler: "Prontuário (leitura)",
  prontuario_escrever: "Prontuário (escrita)",
  receituario: "Receituário",
  documentos: "Documentos clínicos",
  usuarios: "Usuários",
  clinica: "Clínica",
  backup: "Backup",
  licenca: "Licença",
  whatsapp: "WhatsApp",
  remoto: "Acesso remoto",
  fichas_config: "Fichas clínicas (configuração)",
  fichas_medico: "Fichas clínicas (minhas)",
  admissional: `${ASO_TITULO} (formulário)`,
  admissional_agenda: `${ASO_TITULO} (agenda / check-in)`,
  cobranca: "Cobrança (caixa / contas)",
  cobranca_solicitar: "Cobrança (solicitar procedimento)",
  cobranca_config: "Cobrança (configuração)",
  cobranca_relatorios: "Cobrança (relatórios)",
};

export const PERMISSOES_PADRAO: Record<Perfil, Modulo[]> = {
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
    "fichas_medico",
    "cobranca_solicitar",
  ],
  admin: [...MODULOS],
};

export function isModuloValido(modulo: string): modulo is Modulo {
  return (MODULOS as readonly string[]).includes(modulo);
}

export function getPermissoesUsuario(
  usuarioId: number,
  perfil: Perfil,
): Modulo[] {
  const rows = getDb()
    .prepare(
      `SELECT modulo FROM usuario_permissoes
       WHERE usuario_id = ? AND permitido = 1`,
    )
    .all(usuarioId) as { modulo: string }[];

  if (rows.length > 0) {
    return rows.map((r) => r.modulo).filter(isModuloValido);
  }
  return [...PERMISSOES_PADRAO[perfil]];
}

export function setPermissoesUsuario(
  usuarioId: number,
  modulos: string[],
): void {
  const db = getDb();
  const valid = modulos.filter(isModuloValido);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM usuario_permissoes WHERE usuario_id = ?").run(
      usuarioId,
    );
    const ins = db.prepare(
      `INSERT INTO usuario_permissoes (usuario_id, modulo, permitido)
       VALUES (?, ?, 1)`,
    );
    for (const m of valid) {
      ins.run(usuarioId, m);
    }
  });
  tx();
}

export function aplicarPermissoesPadrao(
  usuarioId: number,
  perfil: Perfil,
): void {
  setPermissoesUsuario(usuarioId, PERMISSOES_PADRAO[perfil]);
}

export function usuarioTemModulo(
  usuarioId: number,
  perfil: Perfil,
  modulo: Modulo,
): boolean {
  return getPermissoesUsuario(usuarioId, perfil).includes(modulo);
}
