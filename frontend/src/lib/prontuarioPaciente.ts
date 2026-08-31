import type { ProntuarioDetalhe } from "./api";
import { parseDadosJson } from "./prontuarioDados";

/** Normaliza aliases legados na resposta GET /prontuarios/:id (somente dados da API). */
export function normalizarProntuarioDetalhe(
  row: ProntuarioDetalhe & Record<string, unknown>,
): ProntuarioDetalhe {
  return {
    ...row,
    paciente_nome:
      row.paciente_nome?.trim() ||
      (typeof row.nome === "string" ? row.nome.trim() : undefined),
    paciente_nasc:
      row.paciente_nasc ??
      (row.data_nasc as string | null | undefined) ??
      null,
    paciente_cpf:
      row.paciente_cpf ??
      (row.cpf as string | null | undefined) ??
      null,
    paciente_telefone:
      row.paciente_telefone ??
      (row.telefone as string | null | undefined) ??
      null,
    paciente_email:
      row.paciente_email ??
      (row.email as string | null | undefined) ??
      null,
    alergias: row.alergias ?? null,
    medicacoes_uso: row.medicacoes_uso ?? null,
    observacoes_clinicas: row.observacoes_clinicas ?? null,
    dados_json: parseDadosJson(row.dados_json),
    ficha_campos: Array.isArray(row.ficha_campos) ? row.ficha_campos : [],
    ficha_modo: row.ficha_modo === "pdf_fundo" ? "pdf_fundo" : "secoes",
    ficha_campos_posicao: Array.isArray(row.ficha_campos_posicao)
      ? row.ficha_campos_posicao
      : [],
  };
}
