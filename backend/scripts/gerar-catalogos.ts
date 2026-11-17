/**
 * Gera os catálogos de nomes (medicamentos e exames) que vão junto com o sistema.
 * Roda só no desenvolvimento, quando quiser atualizar as listas — NÃO mexe no banco.
 *
 *   tsx scripts/gerar-catalogos.ts <DADOS_ABERTOS_MEDICAMENTOS.csv> <tuss22.csv>
 *
 * Fontes:
 *  - ANVISA, dados abertos — https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv
 *    (";", Windows-1252). Usa só registros "Ativo".
 *  - ANS, TUSS tabela 22 (procedimentos) — grupos de exames diagnósticos (40.1, 40.2,
 *    40.3, 40.5–41.1, 41.3–41.5). Termos vigentes (sem data de fim).
 * Saída: backend/recursos/catalogo_medicamentos.json e catalogo_exames.json (array de nomes).
 * (NÃO usar backend/data: pastas "data" ficam fora do instalador/atualização.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarNomeCatalogo } from "../src/services/catalogoNomes.js";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../recursos");

/** CSV com ";" e aspas (campos podem conter ";" dentro de aspas). */
function* linhasCsv(texto: string): Generator<string[]> {
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ";") {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n") {
      linha.push(campo.replace(/\r$/, ""));
      yield linha;
      linha = [];
      campo = "";
    } else campo += ch;
  }
  if (campo || linha.length) yield [...linha, campo];
}

const limpar = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

function adicionar(destino: Map<string, string>, nome: string): void {
  const n = limpar(nome);
  if (n.length < 2 || n.length > 200) return;
  const chave = normalizarNomeCatalogo(n);
  if (!destino.has(chave)) destino.set(chave, n);
}

/** Categorias fora do consultório (homeopatia, gases, radiofármacos, terapia avançada). */
const CATEGORIAS_FORA = /^(dinamizado|gases|radiof|produto de t)/i;

function gerarMedicamentos(arquivo: string): string[] {
  const texto = new TextDecoder("windows-1252").decode(fs.readFileSync(arquivo));
  const nomes = new Map<string, string>();
  let primeira = true;
  for (const c of linhasCsv(texto)) {
    if (primeira) {
      primeira = false;
      continue;
    }
    const [tipo, produto, , categoria, , , , , , situacao, principio] = c;
    if (tipo !== "MEDICAMENTO" || situacao !== "Ativo" || !produto) continue;
    if (CATEGORIAS_FORA.test(categoria ?? "")) continue;
    const pa = limpar(principio ?? "");
    const prod = limpar(produto);
    const paCurto = pa && pa.length <= 50 ? pa : "";
    // Marca comercial ganha o princípio ativo entre parênteses (busca acha pelos dois).
    if (paCurto && normalizarNomeCatalogo(prod) !== normalizarNomeCatalogo(paCurto) && !/gen[eé]rico/i.test(categoria ?? "")) {
      adicionar(nomes, `${prod} (${paCurto})`);
    } else {
      adicionar(nomes, prod);
    }
    // O princípio ativo isolado (genérico), quando é uma substância só.
    if (paCurto && !paCurto.includes(",")) adicionar(nomes, paCurto);
  }
  return [...nomes.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Prefixos (4 dígitos) dos grupos TUSS de exames diagnósticos. */
const GRUPOS_EXAME = [
  "4010", "4020", "4030", "4031", "4032", "4050", "4060", "4070", "4071",
  "4080", "4081", "4090", "4100", "4110", "4130", "4140", "4150",
];

/** Nomes curtos do dia a dia (a TUSS usa nomes longos). */
const EXAMES_COMUNS = [
  "Hemograma completo", "Glicemia de jejum", "Hemoglobina glicada (HbA1c)", "Colesterol total e frações",
  "Triglicerídeos", "Ureia", "Creatinina", "Ácido úrico", "TGO (AST)", "TGP (ALT)", "Gama GT",
  "Fosfatase alcalina", "Bilirrubinas totais e frações", "TSH", "T4 livre", "T3",
  "Sódio", "Potássio", "Cálcio", "Magnésio", "Ferro sérico", "Ferritina", "Vitamina B12",
  "Vitamina D (25-OH)", "Ácido fólico", "PCR (proteína C reativa)", "VHS", "Coagulograma",
  "TAP / INR", "TTPA", "Beta HCG", "PSA total", "PSA livre", "EAS (urina tipo I)",
  "Urocultura com antibiograma", "Parasitológico de fezes", "Sangue oculto nas fezes",
  "Insulina", "Albumina", "Proteínas totais e frações", "Amilase", "Lipase", "CPK",
  "Troponina", "BNP", "Anti-HIV", "VDRL", "HBsAg", "Anti-HCV", "Anti-HBs", "Tipagem sanguínea (ABO e Rh)",
  "Eletrocardiograma (ECG)", "Holter 24 horas", "MAPA 24 horas", "Teste ergométrico", "Ecocardiograma",
  "Raio-X de tórax PA e perfil", "Raio-X de coluna lombar", "Ultrassom de abdome total",
  "Ultrassom de abdome superior", "Ultrassom pélvico", "Ultrassom transvaginal", "Ultrassom de próstata",
  "Ultrassom de tireoide", "Ultrassom de mamas", "Mamografia bilateral", "Densitometria óssea",
  "Tomografia de crânio", "Tomografia de tórax", "Ressonância magnética de crânio",
  "Endoscopia digestiva alta", "Colonoscopia", "Espirometria", "Audiometria", "Eletroencefalograma",
  "Preventivo (citologia oncótica)",
];

function gerarExames(arquivo: string): string[] {
  const texto = fs.readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  const nomes = new Map<string, string>();
  for (const e of EXAMES_COMUNS) adicionar(nomes, e);
  let primeira = true;
  for (const c of linhasCsv(texto)) {
    if (primeira) {
      primeira = false;
      continue;
    }
    const [codigo, termo, , fim] = c;
    if (!codigo || !termo || (fim ?? "").trim()) continue;
    if (!GRUPOS_EXAME.includes(codigo.slice(0, 4))) continue;
    // "GLICOSE - PESQUISA E/OU DOSAGEM" → "GLICOSE" (o médico não digita o sufixo).
    adicionar(nomes, termo.replace(/\s*-\s*pesquisa e\/ou dosagem\s*$/i, ""));
  }
  return [...nomes.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function main(): void {
  const [csvMed, csvTuss] = process.argv.slice(2);
  if (!csvMed || !csvTuss) {
    console.error("Uso: tsx scripts/gerar-catalogos.ts <medicamentos.csv> <tuss22.csv>");
    process.exit(2);
  }
  const meds = gerarMedicamentos(csvMed);
  const exames = gerarExames(csvTuss);
  fs.writeFileSync(path.join(dataDir, "catalogo_medicamentos.json"), JSON.stringify(meds));
  fs.writeFileSync(path.join(dataDir, "catalogo_exames.json"), JSON.stringify(exames));
  console.log(`Medicamentos: ${meds.length} | Exames: ${exames.length}`);
}

main();
