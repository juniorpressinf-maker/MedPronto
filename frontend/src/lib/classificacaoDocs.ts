/**
 * Classificação automática para os documentos clínicos (mesmo arquivo no backend e no frontend):
 *  - Receita: via de cada medicamento (pelo texto) e o grupo impresso ("USO ORAL", "USO TÓPICO"...).
 *  - Pedido de exame: laboratório × imagem/outros (pelo nome do exame).
 * Só palavras-chave: o que o médico escolheu/corrigiu tem prioridade (memória da receita e
 * tabela exame_categoria no servidor).
 */

/** Maiúsculas, sem acento, espaços simples. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------------------- receita: via

/** Regras em ordem: a primeira que casar vence (as específicas antes de "tópica" e "oral"). */
const REGRAS_VIA: [RegExp, string][] = [
  [/OTOLOG|OTIC|OUVIDO|AURICULAR/, "OTOLÓGICA"],
  [/COLIRIO|OFTALM|\bOLHOS?\b|OCULAR/, "OFTÁLMICA"],
  [/\bNASAL|NARINA|\bNARIZ/, "NASAL"],
  [/INALA|AEROSSOL|AEROSOL|BOMBINHA|NEBULIZ|\bPUFFS?\b|\bJATOS?\b|DISKUS|TURBUHALER|SPRAY ORAL/, "INALATÓRIA"],
  [/VAGINA|\bOVULOS?\b/, "VAGINAL"],
  [/SUPOSITORIO|\bRETAL|\bENEMA|CLISTER/, "RETAL"],
  [/SUBLINGUA|EMBAIXO DA LINGUA|DEBAIXO DA LINGUA/, "SUBLINGUAL"],
  [/ENDOVENOS|INTRAVENOS|\bEV\b|\bIV\b/, "ENDOVENOSA"],
  [/SUBCUTAN|\bSC\b/, "SUBCUTÂNEA"],
  [/INTRAMUSC|\bIM\b|NO MUSCULO/, "INTRAMUSCULAR"],
  [
    /POMADA|\bCREME|\bGEL\b|LOCAO|UNGUENTO|SHAMPOO|SABONETE|ESMALTE|ADESIVO|TRANSDERM|DERMAT|TOPIC|CUTANE|\bAPLICAR\b|\bPASSAR\b|NA PELE|NA LESAO|NO LOCAL/,
    "TÓPICA",
  ],
  [
    /COMPRIMIDO|\bCOMPR?\b|\bCPR?\b|CAPSULA|\bCAPS\b|DRAGEA|XAROPE|SUSPENSAO|ELIXIR|SOLUCAO ORAL|\bGOTAS\b|\bGTS\b|SACHE|\bTOMAR\b|INGERIR|VIA ORAL|\bVO\b|MG\/ML|MG\/5ML|\d\s*(MG|MCG|G)\b/,
    "ORAL",
  ],
];

/** Sugestão de via pelo nome + dose + posologia ("" quando não dá para saber). */
export function sugerirVia(...partes: (string | null | undefined)[]): string {
  const t = normalizarTexto(partes.filter(Boolean).join(" "));
  if (!t) return "";
  for (const [re, via] of REGRAS_VIA) if (re.test(t)) return via;
  return "";
}

export type GrupoReceita = { chave: string; titulo: string; ordem: number };

const GRUPOS: Record<string, GrupoReceita> = {
  oral: { chave: "oral", titulo: "USO ORAL", ordem: 1 },
  sublingual: { chave: "sublingual", titulo: "USO SUBLINGUAL", ordem: 2 },
  topico: { chave: "topico", titulo: "USO TÓPICO", ordem: 3 },
  inalatorio: { chave: "inalatorio", titulo: "USO INALATÓRIO", ordem: 4 },
  injetavel: { chave: "injetavel", titulo: "USO INJETÁVEL", ordem: 5 },
  retal: { chave: "retal", titulo: "USO RETAL", ordem: 6 },
  vaginal: { chave: "vaginal", titulo: "USO VAGINAL", ordem: 7 },
};

/**
 * Grupo impresso de um medicamento: pela via informada; sem via, pela sugestão do texto.
 * Ouvido, olho, nariz e pele saem juntos em "USO TÓPICO" (como a receita em papel).
 */
export function grupoReceita(
  via: string | null | undefined,
  ...texto: (string | null | undefined)[]
): GrupoReceita {
  const v = normalizarTexto(via) || normalizarTexto(sugerirVia(...texto));
  // Sem via e sem pista no texto: a receita mais comum é oral (o médico troca no campo Via).
  if (!v) return GRUPOS.oral!;
  if (/SUBLINGUA/.test(v)) return GRUPOS.sublingual!;
  if (/ORAL|\bVO\b/.test(v)) return GRUPOS.oral!;
  if (/TOPIC|LOCAL|EXTERN|NASAL|OFTALM|OTOLOG|OCULAR|DERM|CUTAN|PELE|CAPILAR|AURICULAR/.test(v)) return GRUPOS.topico!;
  if (/INALA/.test(v)) return GRUPOS.inalatorio!;
  if (/MUSCULAR|SUBCUT|VENOS|INJET|\bIM\b|\bEV\b|\bSC\b/.test(v)) return GRUPOS.injetavel!;
  if (/RETAL/.test(v)) return GRUPOS.retal!;
  if (/VAGINA/.test(v)) return GRUPOS.vaginal!;
  // Via digitada que não está na lista: vira um grupo próprio ("USO <VIA>").
  return { chave: v, titulo: `USO ${(via ?? "").trim().toUpperCase()}`, ordem: 50 };
}

// ------------------------------------------------------- pedido: categoria do exame

export type CategoriaExame = "lab" | "imagem";

export const CATEGORIA_EXAME_LABEL: Record<CategoriaExame, string> = {
  lab: "Laboratório",
  imagem: "Imagem / outros",
};

/** Imagem, métodos gráficos e procedimentos diagnósticos (o resto é laboratório). */
const RE_IMAGEM =
  /ULTRASSO|ULTRA-SO|ULTRA SO|\bUSG\b|\bUS\b|ECOGRAF|ECOCARDIO|\bECO\b|DOPPLER|DUPLEX|RAIO ?-?X|RADIOGRAF|\bRX\b|TOMOGRAF|\bTC\b|RESSONANCIA|\bRNM\b|\bRM\b|ANGIOTOMO|ANGIORRESSON|ANGIOGRAF|ARTERIOGRAF|MAMOGRAF|DENSITOMETR|CINTILOGRAF|\bPET\b|PET-CT|ELETROCARDIO|\bECG\b|HOLTER|\bMAPA\b|ERGOMETR|TESTE DE ESFORCO|ELETROENCEF|\bEEG\b|ELETRONEURO|ELETROMIOGRAF|ESPIROMETR|PROVA DE FUNCAO PULMONAR|AUDIOMETR|IMITANCIOMETR|IMPEDANCIOMETR|ENDOSCOP|COLONOSCOP|RETOSSIGMOIDOSCOP|BRONCOSCOP|LARINGOSCOP|NASOFIBRO|VIDEOLARING|POLISSONOGRAF|UROGRAF|URETROCISTOGRAF|HISTEROSSALPING|HISTEROSCOP|COLPOSCOP|CAMPIMETR|TONOMETR|FUNDOSCOP|MAPEAMENTO DE RETINA|RETINOGRAF|PAQUIMETR|TOPOGRAFIA DE CORNEA|ELETRORRETINO|POTENCIAL EVOCADO|ARTROGRAF|FLUOROSC|URODINAMIC|MIELOGRAF|BIOPSIA|PUNCAO|CATETERISMO|DEGLUTOGRAMA|ESOFAGOGRAMA|ENEMA OPACO/;

/** Categoria só pelas palavras do nome (sem a correção do médico). */
export function categoriaExamePorNome(nome: string): CategoriaExame {
  return RE_IMAGEM.test(normalizarTexto(nome)) ? "imagem" : "lab";
}

/** Chave usada para lembrar a correção do médico. */
export function chaveExame(nome: string): string {
  return normalizarTexto(nome);
}

/** Categoria final: a correção gravada vence; senão, palavras do nome. */
export function categoriaExame(
  nome: string,
  correcoes?: Record<string, CategoriaExame> | Map<string, CategoriaExame> | null,
): CategoriaExame {
  const k = chaveExame(nome);
  const c = correcoes instanceof Map ? correcoes.get(k) : correcoes?.[k];
  return c ?? categoriaExamePorNome(nome);
}

/** Separa os exames em folhas: laboratório primeiro, depois imagem/outros (vazias somem). */
export function separarPedido(
  exames: string[],
  correcoes?: Record<string, CategoriaExame> | Map<string, CategoriaExame> | null,
): { categoria: CategoriaExame; exames: string[] }[] {
  const lab: string[] = [];
  const img: string[] = [];
  for (const e of exames) (categoriaExame(e, correcoes) === "imagem" ? img : lab).push(e);
  return [
    { categoria: "lab" as const, exames: lab },
    { categoria: "imagem" as const, exames: img },
  ].filter((g) => g.exames.length > 0);
}
