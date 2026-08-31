import fs from "node:fs";
import { config } from "../config.js";

export type Cid10Item = {
  codigo: string;
  descricao: string;
};

const AMOSTRA: Cid10Item[] = [
  { codigo: "A09", descricao: "Diarreia e gastroenterite de origem infecciosa presumível" },
  { codigo: "B34.9", descricao: "Infecção viral não especificada" },
  { codigo: "E11", descricao: "Diabetes mellitus não-insulino-dependente" },
  { codigo: "E11.9", descricao: "Diabetes mellitus não-insulino-dependente sem complicações" },
  { codigo: "E78.0", descricao: "Hipercolesterolemia pura" },
  { codigo: "E78.5", descricao: "Hiperlipidemia não especificada" },
  { codigo: "F32.9", descricao: "Episódio depressivo não especificado" },
  { codigo: "F41.1", descricao: "Ansiedade generalizada" },
  { codigo: "G43.9", descricao: "Enxaqueca não especificada" },
  { codigo: "H10.9", descricao: "Conjuntivite não especificada" },
  { codigo: "I10", descricao: "Hipertensão essencial (primária)" },
  { codigo: "I25.1", descricao: "Doença aterosclerótica do coração" },
  { codigo: "J00", descricao: "Nasofaringite aguda [resfriado comum]" },
  { codigo: "J06.9", descricao: "Infecção aguda das vias aéreas superiores não especificada" },
  { codigo: "J18.9", descricao: "Pneumonia não especificada" },
  { codigo: "J20.9", descricao: "Bronquite aguda não especificada" },
  { codigo: "J45.9", descricao: "Asma não especificada" },
  { codigo: "K21.9", descricao: "Doença do refluxo gastroesofágico sem esofagite" },
  { codigo: "K29.7", descricao: "Gastrite não especificada" },
  { codigo: "K59.0", descricao: "Constipação" },
  { codigo: "L30.9", descricao: "Dermatite não especificada" },
  { codigo: "M54.5", descricao: "Dor lombar baixa" },
  { codigo: "M79.1", descricao: "Mialgia" },
  { codigo: "N39.0", descricao: "Infecção do trato urinário, local não especificado" },
  { codigo: "R05", descricao: "Tosse" },
  { codigo: "R10.4", descricao: "Outras dores abdominais e as não especificadas" },
  { codigo: "R51", descricao: "Cefaleia" },
  { codigo: "R53", descricao: "Mal-estar e fadiga" },
  { codigo: "Z00.0", descricao: "Exame médico geral" },
  { codigo: "Z01.8", descricao: "Outros exames especiais especificados" },
];

let cache: Cid10Item[] | null = null;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function loadCid10(): Cid10Item[] {
  if (cache) return cache;

  if (fs.existsSync(config.cid10Path)) {
    try {
      const raw = JSON.parse(fs.readFileSync(config.cid10Path, "utf8")) as unknown;
      if (Array.isArray(raw)) {
        cache = raw
          .map((item) => {
            const row = item as Record<string, string>;
            return {
              codigo: String(row.codigo ?? row.code ?? "").trim(),
              descricao: String(row.descricao ?? row.description ?? "").trim(),
            };
          })
          .filter((item) => item.codigo && item.descricao);
        return cache;
      }
    } catch (err) {
      console.warn("[cid10] Erro ao carregar arquivo, usando amostra:", err);
    }
  }

  cache = AMOSTRA;
  return cache;
}

export function searchCid10(termo: string, limite = 10): Cid10Item[] {
  const lista = loadCid10();
  const q = normalize(termo);
  if (!q) return lista.slice(0, limite);

  const resultados: Cid10Item[] = [];
  for (const item of lista) {
    const codigo = normalize(item.codigo);
    const descricao = normalize(item.descricao);
    if (codigo.includes(q) || descricao.includes(q)) {
      resultados.push(item);
      if (resultados.length >= limite) break;
    }
  }
  return resultados;
}

export function cid10Stats(): { total: number; fonte: string } {
  const lista = loadCid10();
  return {
    total: lista.length,
    fonte: fs.existsSync(config.cid10Path) ? config.cid10Path : "amostra-interna",
  };
}
