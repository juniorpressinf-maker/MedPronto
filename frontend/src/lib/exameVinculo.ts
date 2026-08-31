import type { ExameAnexo } from "./api";
import { ASO_TITULO_CURTO } from "./tipoAtendimento";

export type ContextoExameVinculo =
  | { tipo: "admissional"; admissionalId: number }
  | { tipo: "conta_item"; contaItemId: number };

export type ExameVinculoOpcao = {
  exame: ExameAnexo;
  elegivel: boolean;
  motivoIndisponivel: string | null;
};

export function formatDataHoraExame(iso: string): string {
  const d = iso.trim();
  if (d.length >= 16) {
    const [data, hora] = d.split(/[T ]/);
    const [y, m, day] = (data ?? "").split("-");
    if (y && m && day) return `${day}/${m}/${y} · ${(hora ?? "").slice(0, 5)}`;
  }
  return d;
}

export function rotuloExameOpcao(ex: ExameAnexo): string {
  const data = formatDataHoraExame(ex.data_upload);
  const nome = ex.nome_arquivo ?? "arquivo";
  const desc = ex.descricao?.trim();
  return desc ? `${nome} — ${desc} (${data})` : `${nome} (${data})`;
}

function motivoOutrosVinculos(ex: ExameAnexo): string | null {
  const partes: string[] = [];
  if (ex.prontuario_id != null) {
    partes.push(`consulta nº ${ex.prontuario_id}`);
  }
  if (ex.admissional_id != null) {
    partes.push(`${ASO_TITULO_CURTO} nº ${ex.admissional_id}`);
  }
  if (ex.conta_item_id != null) {
    partes.push(`item cobrança nº ${ex.conta_item_id}`);
  }
  if (partes.length === 0) return null;
  return partes.join("; ");
}

export function classificarExamesParaVinculo(
  exames: ExameAnexo[],
  ctx: ContextoExameVinculo,
  exameAtualId: number | null,
): { elegiveis: ExameVinculoOpcao[]; indisponiveis: ExameVinculoOpcao[] } {
  const elegiveis: ExameVinculoOpcao[] = [];
  const indisponiveis: ExameVinculoOpcao[] = [];

  for (const exame of exames) {
    if (exame.id === exameAtualId) continue;

    if (ctx.tipo === "admissional") {
      if (
        exame.admissional_id != null &&
        exame.admissional_id !== ctx.admissionalId
      ) {
        indisponiveis.push({
          exame,
          elegivel: false,
          motivoIndisponivel: `Já vinculado ao ${ASO_TITULO_CURTO} nº ${exame.admissional_id}`,
        });
        continue;
      }
      elegiveis.push({ exame, elegivel: true, motivoIndisponivel: null });
      continue;
    }

    if (
      exame.conta_item_id != null &&
      exame.conta_item_id !== ctx.contaItemId
    ) {
      indisponiveis.push({
        exame,
        elegivel: false,
        motivoIndisponivel: `Já vinculado a outro item da cobrança (nº ${exame.conta_item_id})`,
      });
      continue;
    }
    elegiveis.push({ exame, elegivel: true, motivoIndisponivel: null });
  }

  return { elegiveis, indisponiveis };
}

export function hintEscolhaExame(elegiveis: ExameVinculoOpcao[]): string {
  if (elegiveis.length === 0) {
    return "Nenhum exame livre para este vínculo. Anexe um PDF novo ou remova o vínculo em outro registro.";
  }
  if (elegiveis.length === 1) {
    return "1 exame disponível — clique nele para vincular.";
  }
  return `${elegiveis.length} exames disponíveis — escolha qual vincular.`;
}

export function rotuloVinculosInformativos(ex: ExameAnexo): string | null {
  return motivoOutrosVinculos(ex);
}
