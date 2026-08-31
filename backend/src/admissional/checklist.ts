/** Modelo ASO — Atestado de Saúde Ocupacional (clínica med center) */

export type AsoItem = { id: string; label: string };

export const ASO_TIPOS_ATESTADO: AsoItem[] = [
  { id: "admissional", label: "Admissional" },
  { id: "demissional", label: "Demissional" },
  { id: "periodico", label: "Periódico" },
  { id: "retorno_trabalho", label: "Retorno ao trabalho" },
  { id: "mudanca_funcao", label: "Mudança de função" },
];

export const ASO_QUIMICOS: AsoItem[] = [
  { id: "detergente", label: "Detergente" },
  { id: "desinfetante", label: "Desinfetante" },
  { id: "alcool_etilico", label: "Álcool Etílico" },
  { id: "sabao_liquido", label: "Sabão Líquido" },
  { id: "ferro", label: "Ferro" },
  { id: "poeira", label: "Poeira" },
  { id: "hipoclorito_1", label: "Hipoclorito de sódio 1%" },
  { id: "clorado_10", label: "Clorado 10%" },
  { id: "hidrocarbonetos", label: "Hidrocarbonetos" },
  { id: "organofosforado", label: "Organofosforado" },
  { id: "cromo", label: "Cromo" },
  { id: "fosfina", label: "Fosfina" },
  { id: "tolueno", label: "Tolueno" },
  { id: "xileno", label: "Xileno" },
  { id: "benzeno", label: "Benzeno" },
  { id: "etilbenzeno", label: "Etilbenzeno" },
  { id: "niquel", label: "Níquel" },
  { id: "chumbo", label: "Chumbo" },
  { id: "estanho", label: "Estanho" },
  { id: "hidroxido_sodio", label: "Hidróxido de sódio" },
  { id: "pigmento", label: "Pigmento" },
  { id: "resina", label: "Resina" },
  { id: "cimento", label: "Cimento" },
  { id: "piretroides", label: "Piretroides" },
];

export const ASO_FISICOS: AsoItem[] = [
  { id: "calor", label: "Calor" },
  { id: "frio", label: "Frio" },
  { id: "radiacao_uv", label: "Radiação UV" },
  { id: "ruido", label: "Ruído" },
  { id: "umidade", label: "Umidade" },
];

export const ASO_ACIDENTES: AsoItem[] = [
  { id: "quedas", label: "Quedas" },
  { id: "choque", label: "Choque" },
  { id: "outros", label: "Outros" },
];

export const ASO_EXAMES: AsoItem[] = [
  { id: "exame_clinico", label: "Exame Clínico" },
  { id: "audiometria", label: "Audiometria" },
  { id: "avaliacao_vocal", label: "Avaliação vocal" },
  { id: "acuidade_visual", label: "Acuidade Visual" },
  { id: "ecg", label: "ECG" },
  { id: "eeg", label: "EEG" },
  { id: "hemograma", label: "Hemograma" },
  { id: "glicemia", label: "Glicemia" },
  { id: "anti_hbs", label: "Anti - Hbs" },
  { id: "hbs_ag", label: "HBS-ag" },
  { id: "anti_hcv", label: "Anti-Hcv" },
  { id: "rx_torax", label: "Rx Tórax" },
  { id: "rx_coluna", label: "Rx coluna vertebral" },
];

export const ASO_NR35: AsoItem[] = [
  { id: "apto_altura", label: "apto para trabalho em altura" },
  { id: "inapto_altura", label: "inapto para trabalho em altura" },
  { id: "nao_aplica", label: "não se aplica" },
];

export const ASO_TEXTO_LEGAL =
  "De acordo com o item 7.4.5. da NR7, o presente Atestado de Saúde Ocupacional é parte integrante do Prontuário Médico. (de acordo com a portaria n°24 de 29/12/1994 e do código de SSST 01/10/1996).";

export type AsoExameValor = { realizado: boolean; data: string };

export type AdmissionalDados = {
  versao: 2;
  empresa: string;
  ci: string;
  funcao: string;
  tipo_atestado: string;
  riscos_texto: string;
  quimicos: Record<string, boolean>;
  fisicos: Record<string, boolean>;
  biologicos: boolean;
  ergonomicos: boolean;
  acidentes: Record<string, boolean>;
  riscos_outros: string;
  exames: Record<string, AsoExameValor>;
  exames_outros: string;
  nr35: string;
  observacoes: string;
};

function mapBooleans(items: AsoItem[]): Record<string, boolean> {
  return Object.fromEntries(items.map((i) => [i.id, false]));
}

function mapExames(): Record<string, AsoExameValor> {
  return Object.fromEntries(
    ASO_EXAMES.map((i) => [i.id, { realizado: false, data: "" }]),
  );
}

export function criarDadosPadrao(): AdmissionalDados {
  return {
    versao: 2,
    empresa: "",
    ci: "",
    funcao: "",
    tipo_atestado: "admissional",
    riscos_texto: "",
    quimicos: mapBooleans(ASO_QUIMICOS),
    fisicos: mapBooleans(ASO_FISICOS),
    biologicos: false,
    ergonomicos: false,
    acidentes: mapBooleans(ASO_ACIDENTES),
    riscos_outros: "",
    exames: mapExames(),
    exames_outros: "",
    nr35: "",
    observacoes: "",
  };
}

function mergeBooleans(
  base: Record<string, boolean>,
  incoming?: Record<string, boolean>,
): Record<string, boolean> {
  const out = { ...base };
  if (!incoming) return out;
  for (const k of Object.keys(out)) {
    if (k in incoming) out[k] = Boolean(incoming[k]);
  }
  return out;
}

function mergeExames(
  base: Record<string, AsoExameValor>,
  incoming?: Record<string, AsoExameValor>,
): Record<string, AsoExameValor> {
  const out = { ...base };
  if (!incoming) return out;
  for (const k of Object.keys(out)) {
    const v = incoming[k];
    if (v) {
      out[k] = {
        realizado: Boolean(v.realizado),
        data: String(v.data ?? ""),
      };
    }
  }
  return out;
}

export function parseDadosJson(raw: string | null | undefined): AdmissionalDados {
  const padrao = criarDadosPadrao();
  if (!raw?.trim()) return padrao;
  try {
    const parsed = JSON.parse(raw) as Partial<AdmissionalDados> & {
      campos?: unknown[];
      versao?: number;
    };
    if (parsed?.versao !== 2) {
      const obs =
        typeof (parsed as { observacoes?: string }).observacoes === "string"
          ? (parsed as { observacoes: string }).observacoes
          : "";
      return { ...padrao, observacoes: obs };
    }
    return {
      versao: 2,
      empresa: String(parsed.empresa ?? ""),
      ci: String(parsed.ci ?? ""),
      funcao: String(parsed.funcao ?? ""),
      tipo_atestado: String(parsed.tipo_atestado ?? "admissional"),
      riscos_texto: String(parsed.riscos_texto ?? ""),
      quimicos: mergeBooleans(padrao.quimicos, parsed.quimicos),
      fisicos: mergeBooleans(padrao.fisicos, parsed.fisicos),
      biologicos: Boolean(parsed.biologicos),
      ergonomicos: Boolean(parsed.ergonomicos),
      acidentes: mergeBooleans(padrao.acidentes, parsed.acidentes),
      riscos_outros: String(parsed.riscos_outros ?? ""),
      exames: mergeExames(padrao.exames, parsed.exames),
      exames_outros: String(parsed.exames_outros ?? ""),
      nr35: String(parsed.nr35 ?? ""),
      observacoes: String(parsed.observacoes ?? ""),
    };
  } catch {
    return padrao;
  }
}

export function serializarDadosJson(dados: AdmissionalDados): string {
  return JSON.stringify(dados);
}

/** Rótulos marcados para impressão PDF */
export function asoItensMarcados(
  items: AsoItem[],
  map: Record<string, boolean>,
): string[] {
  return items.filter((i) => map[i.id]).map((i) => i.label);
}

export function asoExamesRealizados(
  dados: AdmissionalDados,
): { label: string; data: string }[] {
  return ASO_EXAMES.filter((e) => dados.exames[e.id]?.realizado).map((e) => ({
    label: e.label,
    data: dados.exames[e.id]?.data?.trim() ?? "",
  }));
}
