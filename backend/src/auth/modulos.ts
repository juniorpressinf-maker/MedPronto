import { ASO_TITULO } from "../admissional/labels.js";
import type { Perfil } from "./users.js";
import { getDb } from "../db/index.js";

export const MODULOS = [
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
  "contas_pagar",
  "caixa",
  "chat_interno",
] as const;

export type Modulo = (typeof MODULOS)[number];

export const MODULO_LABELS: Record<Modulo, string> = {
  agenda: "Agenda",
  agenda_config: "Agenda (configuração: tipos, horários, cores)",
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
  fichas_config: "Fichas clínicas e Medicamentos/Exames (configuração)",
  fichas_medico: "Fichas clínicas (minhas) e Medicamentos/Exames",
  admissional: `${ASO_TITULO} (formulário)`,
  admissional_agenda: `${ASO_TITULO} (agenda / check-in)`,
  cobranca: "Cobrança (caixa / contas)",
  cobranca_solicitar: "Cobrança (solicitar procedimento)",
  cobranca_config: "Cobrança (configuração)",
  cobranca_relatorios: "Cobrança (relatórios)",
  contas_pagar: "Contas a pagar",
  caixa: "Caixa (entradas e saídas)",
  chat_interno: "Chat interno",
};

export const PERMISSOES_PADRAO: Record<Perfil, Modulo[]> = {
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

  const custom = rows
    .map((r) => r.modulo)
    .filter((m): m is Modulo => isModuloValido(m));

  const defaults = PERMISSOES_PADRAO[perfil] ?? [];

  // Une permissões padrão do perfil + permissões customizadas
  const todas = new Set([...defaults, ...custom]);
  return Array.from(todas);
}

export function usuarioTemModulo(
  usuarioId: number,
  perfil: Perfil,
  modulo: Modulo | Modulo[],
): boolean {
  const mods = Array.isArray(modulo) ? modulo : [modulo];
  const permissoes = getPermissoesUsuario(usuarioId, perfil);
  return mods.some((m) => permissoes.includes(m));
}

export function aplicarPermissoesPadrao(usuarioId: number, perfil: Perfil): void {
  const mods = PERMISSOES_PADRAO[perfil] ?? [];
  const stmt = getDb().prepare(
    `INSERT INTO usuario_permissoes (usuario_id, modulo, permitido)
     VALUES (?, ?, 1)
     ON CONFLICT(usuario_id, modulo) DO UPDATE SET permitido = 1`,
  );
  for (const m of mods) {
    stmt.run(usuarioId, m);
  }
}

export function setPermissoesUsuario(
  usuarioId: number,
  permissoes: string[],
): void {
  const db = getDb();
  // Remove todas as permissões atuais
  db.prepare("DELETE FROM usuario_permissoes WHERE usuario_id = ?").run(usuarioId);

  // Insere as novas
  const stmt = db.prepare(
    `INSERT INTO usuario_permissoes (usuario_id, modulo, permitido) VALUES (?, ?, 1)`,
  );
  for (const m of permissoes) {
    if (isModuloValido(m)) {
      stmt.run(usuarioId, m);
    }
  }
}