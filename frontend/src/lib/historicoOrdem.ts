import type {
  AdmissionalHistoricoItem,
  HistoricoExameClinicoItem,
  ProntuarioHistoricoItem,
} from "./api";

type ConsultaAtualRef = {
  id: number;
  data_atendimento: string;
  retificacao_de_id: number | null;
};

/** Original seguido das retificações; famílias pela data da consulta pai (mais recente primeiro). */
export function ordenarHistoricoPorFamilia(
  rows: ProntuarioHistoricoItem[],
  consultaAtual?: ConsultaAtualRef,
): ProntuarioHistoricoItem[] {
  if (rows.length === 0) return [];

  const originais = rows.filter((r) => !r.retificacao_de_id);
  const retificacoesPorPai = new Map<number, ProntuarioHistoricoItem[]>();

  for (const row of rows) {
    if (!row.retificacao_de_id) continue;
    const pai = row.retificacao_de_id;
    const lista = retificacoesPorPai.get(pai) ?? [];
    lista.push(row);
    retificacoesPorPai.set(pai, lista);
  }

  const dataPorPai = new Map<number, string>();
  for (const orig of originais) {
    dataPorPai.set(orig.id, orig.data_atendimento);
  }
  if (consultaAtual && !consultaAtual.retificacao_de_id) {
    dataPorPai.set(consultaAtual.id, consultaAtual.data_atendimento);
  }

  const familias = new Set<number>();
  for (const orig of originais) familias.add(orig.id);
  for (const pai of retificacoesPorPai.keys()) familias.add(pai);

  const familiasOrdenadas = [...familias].sort((a, b) => {
    const dataA =
      dataPorPai.get(a) ??
      retificacoesPorPai.get(a)?.[0]?.data_atendimento ??
      "";
    const dataB =
      dataPorPai.get(b) ??
      retificacoesPorPai.get(b)?.[0]?.data_atendimento ??
      "";
    const cmp = dataB.localeCompare(dataA);
    return cmp !== 0 ? cmp : b - a;
  });

  const resultado: ProntuarioHistoricoItem[] = [];
  for (const pai of familiasOrdenadas) {
    const orig = originais.find((o) => o.id === pai);
    if (orig) resultado.push(orig);

    const rets = retificacoesPorPai.get(pai) ?? [];
    rets.sort((a, b) => a.id - b.id);
    resultado.push(...rets);
  }

  return resultado;
}

export type TimelineHistoricoClinicoItem =
  | {
      kind: "consulta";
      key: string;
      data: string;
      hora: string;
      item: ProntuarioHistoricoItem;
      /** Primeira linha de uma família (original ou retificação órfã). */
      inicioGrupo: boolean;
    }
  | {
      kind: "exame";
      key: string;
      data: string;
      hora: string;
      item: HistoricoExameClinicoItem;
      inicioGrupo: boolean;
    };

function chaveOrdenacao(data: string, hora: string, desempate: number): string {
  const d = data.slice(0, 10);
  const h = (hora.trim() || "00:00").slice(0, 5);
  return `${d}T${h}\0${String(desempate).padStart(10, "0")}`;
}

/**
 * Une famílias de consulta (já ordenadas) com episódios só-exame.
 * Famílias de retificação permanecem juntas; blocos ordenados por data/hora desc.
 */
export function montarTimelineHistoricoClinico(
  consultas: ProntuarioHistoricoItem[],
  exames: HistoricoExameClinicoItem[],
  consultaAtual?: ConsultaAtualRef,
): TimelineHistoricoClinicoItem[] {
  const consultasOrdenadas = ordenarHistoricoPorFamilia(consultas, consultaAtual);

  type Bloco =
    | {
        tipo: "familia";
        data: string;
        hora: string;
        desempate: number;
        rows: ProntuarioHistoricoItem[];
      }
    | {
        tipo: "exame";
        data: string;
        hora: string;
        desempate: number;
        item: HistoricoExameClinicoItem;
      };

  const blocos: Bloco[] = [];
  let familiaAtual: ProntuarioHistoricoItem[] = [];
  let familiaPaiId: number | null = null;

  const flushFamilia = () => {
    if (familiaAtual.length === 0) return;
    const cabeca = familiaAtual[0]!;
    const paiId = cabeca.retificacao_de_id ?? cabeca.id;
    blocos.push({
      tipo: "familia",
      data: cabeca.data_atendimento.slice(0, 10),
      hora: "",
      desempate: paiId,
      rows: familiaAtual,
    });
    familiaAtual = [];
    familiaPaiId = null;
  };

  for (const row of consultasOrdenadas) {
    const pai = row.retificacao_de_id ?? row.id;
    if (familiaAtual.length === 0) {
      familiaAtual = [row];
      familiaPaiId = pai;
      continue;
    }
    if (pai === familiaPaiId) {
      familiaAtual.push(row);
      continue;
    }
    flushFamilia();
    familiaAtual = [row];
    familiaPaiId = pai;
  }
  flushFamilia();

  for (const ex of exames) {
    blocos.push({
      tipo: "exame",
      data: ex.data.slice(0, 10),
      hora: (ex.hora ?? "").trim().slice(0, 5),
      desempate: ex.agendamento_id,
      item: ex,
    });
  }

  blocos.sort((a, b) => {
    const ka = chaveOrdenacao(a.data, a.hora, a.desempate);
    const kb = chaveOrdenacao(b.data, b.hora, b.desempate);
    return kb.localeCompare(ka);
  });

  const out: TimelineHistoricoClinicoItem[] = [];
  for (const bloco of blocos) {
    if (bloco.tipo === "exame") {
      out.push({
        kind: "exame",
        key: `exame-${bloco.item.agendamento_id}`,
        data: bloco.data,
        hora: bloco.hora,
        item: bloco.item,
        inicioGrupo: true,
      });
      continue;
    }
    bloco.rows.forEach((item, idx) => {
      out.push({
        kind: "consulta",
        key: `consulta-${item.id}`,
        data: item.data_atendimento.slice(0, 10),
        hora: "",
        item,
        inicioGrupo: idx === 0,
      });
    });
  }
  return out;
}

function dataAsoHistorico(item: AdmissionalHistoricoItem): string {
  return (item.finalizado_em ?? item.created_at).slice(0, 10);
}

/** Original seguido das retificações; famílias pela data do ASO original. */
export function ordenarAsoHistoricoPorFamilia(
  rows: AdmissionalHistoricoItem[],
): AdmissionalHistoricoItem[] {
  if (rows.length === 0) return [];

  const originais = rows.filter((r) => !r.retificacao_de_id);
  const retificacoesPorPai = new Map<number, AdmissionalHistoricoItem[]>();

  for (const row of rows) {
    if (!row.retificacao_de_id) continue;
    const pai = row.retificacao_de_id;
    const lista = retificacoesPorPai.get(pai) ?? [];
    lista.push(row);
    retificacoesPorPai.set(pai, lista);
  }

  const dataPorPai = new Map<number, string>();
  for (const orig of originais) {
    dataPorPai.set(orig.id, dataAsoHistorico(orig));
  }

  const familias = new Set<number>();
  for (const orig of originais) familias.add(orig.id);
  for (const pai of retificacoesPorPai.keys()) familias.add(pai);

  const familiasOrdenadas = [...familias].sort((a, b) => {
    const dataA =
      dataPorPai.get(a) ??
      (retificacoesPorPai.get(a)?.[0]
        ? dataAsoHistorico(retificacoesPorPai.get(a)![0]!)
        : "");
    const dataB =
      dataPorPai.get(b) ??
      (retificacoesPorPai.get(b)?.[0]
        ? dataAsoHistorico(retificacoesPorPai.get(b)![0]!)
        : "");
    const cmp = dataB.localeCompare(dataA);
    return cmp !== 0 ? cmp : b - a;
  });

  const resultado: AdmissionalHistoricoItem[] = [];
  for (const pai of familiasOrdenadas) {
    const orig = originais.find((o) => o.id === pai);
    if (orig) resultado.push(orig);
    const rets = retificacoesPorPai.get(pai) ?? [];
    rets.sort((a, b) => a.id - b.id);
    resultado.push(...rets);
  }
  return resultado;
}
