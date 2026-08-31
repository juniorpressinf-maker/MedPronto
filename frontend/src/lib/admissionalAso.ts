/** Constantes ASO — espelho de backend/src/admissional/checklist.ts */

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

export function criarDadosPadraoAso(): AdmissionalDados {
  return {
    versao: 2,
    empresa: "",
    ci: "",
    funcao: "",
    tipo_atestado: "admissional",
    riscos_texto: "",
    quimicos: Object.fromEntries(ASO_QUIMICOS.map((i) => [i.id, false])),
    fisicos: Object.fromEntries(ASO_FISICOS.map((i) => [i.id, false])),
    biologicos: false,
    ergonomicos: false,
    acidentes: Object.fromEntries(ASO_ACIDENTES.map((i) => [i.id, false])),
    riscos_outros: "",
    exames: Object.fromEntries(
      ASO_EXAMES.map((i) => [i.id, { realizado: false, data: "" }]),
    ),
    exames_outros: "",
    nr35: "",
    observacoes: "",
  };
}
