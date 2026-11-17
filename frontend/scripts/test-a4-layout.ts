/**
 * Aceite A4 — lógica pura da grade (sem navegador).
 * Rodar: node_modules/.bin/tsx frontend/scripts/test-a4-layout.ts  (a partir de d:\MedPronto)
 */
import {
  cruzam,
  encaixarNoPasso,
  horariosVagos,
  linhasDaGrade,
  posicionarDia,
  type IntervaloMin,
} from "../src/lib/agendaNova/layoutGrade";
import { diasDaSemana, inicioDaSemana, rotuloPeriodo, somarDias } from "../src/lib/agendaNova/semana";

let ok = 0;
function assert(c: unknown, msg: string): void {
  if (!c) throw new Error(`FALHOU: ${msg}`);
  ok++;
}

const h = (s: string) => {
  const [a, b] = s.split(":").map(Number);
  return a! * 60 + b!;
};
const it = (id: string, ini: string, fim: string) => ({ id, r: { ini: h(ini), fim: h(fim) } });
const faixa: IntervaloMin = { ini: h("07:00"), fim: h("19:00") };
const pos = (itens: ReturnType<typeof it>[]) =>
  Object.fromEntries(posicionarDia(itens, (x) => x.r, faixa).map((p) => [p.item.id, p]));

// Sozinho ocupa a coluna inteira
let p = pos([it("a", "08:00", "08:30")]);
assert(p.a!.colunas === 1 && p.a!.coluna === 0 && p.a!.topo === 60 && p.a!.altura === 30, "card sozinho");

// Encostados (10:00–10:30 e 10:30–11:00) não dividem a largura
p = pos([it("a", "10:00", "10:30"), it("b", "10:30", "11:00")]);
assert(p.a!.colunas === 1 && p.b!.colunas === 1, "encostados não sobrepõem");

// Dois no mesmo horário: lado a lado
p = pos([it("a", "10:00", "10:30"), it("b", "10:00", "10:30")]);
assert(p.a!.colunas === 2 && p.b!.colunas === 2 && p.a!.coluna !== p.b!.coluna, "dois no mesmo horário lado a lado");

// Três, um longo cobrindo dois curtos sequenciais: 2 colunas (curtos reutilizam a coluna)
p = pos([it("longo", "09:00", "10:00"), it("c1", "09:00", "09:30"), it("c2", "09:30", "10:00")]);
assert(p.longo!.colunas === 2 && p.c1!.coluna === p.c2!.coluna && p.c1!.coluna !== p.longo!.coluna, "curtos reutilizam coluna");

// Três simultâneos: 3 colunas
p = pos([it("a", "14:00", "15:00"), it("b", "14:15", "14:45"), it("c", "14:30", "15:00")]);
assert(p.a!.colunas === 3 && new Set([p.a!.coluna, p.b!.coluna, p.c!.coluna]).size === 3, "três simultâneos");

// Bloco separado depois não herda colunas
p = pos([it("a", "08:00", "09:00"), it("b", "08:00", "09:00"), it("c", "11:00", "11:30")]);
assert(p.c!.colunas === 1, "bloco seguinte independente");

// Fora da faixa é recortado; altura mínima de 15 min
p = pos([it("cedo", "06:30", "07:30"), it("curto", "12:00", "12:05")]);
assert(p.cedo!.topo === 0 && p.cedo!.altura === 30, "recorte no início da faixa");
assert(p.curto!.altura === 15, "altura mínima");

// Linhas e encaixe no passo
assert(linhasDaGrade(faixa, 30).length === 24, "24 linhas de 30 min (07–19)");
assert(encaixarNoPasso(h("10:17"), faixa.ini, 30) === h("10:00"), "clique 10:17 → 10:00");
assert(encaixarNoPasso(h("10:44"), faixa.ini, 15) === h("10:30"), "clique 10:44 → 10:30 (15 min)");

// Vagos
const vagos = horariosVagos({
  padrao: faixa,
  passo: 30,
  ocupados: [{ ini: h("08:00"), fim: h("09:00") }],
  bloqueios: [{ ini: h("12:00"), fim: h("14:00") }],
  agoraMin: h("07:40"),
  passado: false,
}).map((s) => s.ini);
assert(!vagos.includes(h("07:00")) && !vagos.includes(h("07:30")), "passado de hoje não é vago");
assert(!vagos.includes(h("08:00")) && !vagos.includes(h("08:30")) && vagos.includes(h("09:00")), "ocupado não é vago");
assert(!vagos.includes(h("12:00")) && !vagos.includes(h("13:30")) && vagos.includes(h("14:00")), "bloqueio não é vago");
assert(vagos.includes(h("18:30")) && !vagos.includes(h("19:00")), "último slot 18:30");
assert(horariosVagos({ padrao: faixa, passo: 30, ocupados: [], bloqueios: [], agoraMin: null, passado: true }).length === 0, "dia passado sem vagos");
assert(cruzam({ ini: 0, fim: 10 }, { ini: 5, fim: 6 }) && !cruzam({ ini: 0, fim: 10 }, { ini: 10, fim: 20 }), "cruzam");

// Semana
assert(inicioDaSemana("2026-11-15") === "2026-11-09", "domingo 15/11 → segunda 09/11");
assert(inicioDaSemana("2026-11-09") === "2026-11-09", "segunda é o início");
const sem = diasDaSemana("2026-12-31");
assert(sem[0] === "2026-12-28" && sem[6] === "2027-01-03", "semana atravessando o ano");
assert(rotuloPeriodo("2026-11-09", "2026-11-15") === "9–15 nov 2026", rotuloPeriodo("2026-11-09", "2026-11-15"));
assert(rotuloPeriodo("2026-09-28", "2026-10-04") === "28 set – 4 out 2026", "virada de mês");
assert(rotuloPeriodo("2026-12-28", "2027-01-03") === "28 dez 2026 – 3 jan 2027", "virada de ano");
assert(somarDias("2026-02-28", 1) === "2026-03-01", "fevereiro");

console.log(`A4 layout OK — ${ok} verificações.`);

// ---------------------------------------------------------------- A4c: confirmações (409)
import("../src/lib/agendaNova/confirmacoes").then(({ confirmacaoPedida }) => {
  let n = 0;
  const ok2 = (c: unknown, m: string) => {
    if (!c) throw new Error(`FALHOU: ${m}`);
    n++;
  };
  ok2(confirmacaoPedida(409, { error: "retorno_vigente", mensagem: "x" }, {})?.campo === "ignorar_aviso_retorno", "retorno vigente");
  ok2(confirmacaoPedida(409, { codigo: "retorno_confirmar", mensagem: "m?" }, {})?.campo === "confirmar_retorno", "retorno sem consulta");
  ok2(confirmacaoPedida(409, { codigo: "horario_bloqueado" }, {})?.campo === "ignorar_bloqueio", "bloqueio");
  ok2(confirmacaoPedida(409, { codigo: "horario_bloqueado" }, { ignorar_bloqueio: true }) === null, "não pergunta duas vezes");
  ok2(confirmacaoPedida(400, { codigo: "horario_bloqueado" }, {}) === null, "só 409");
  ok2(confirmacaoPedida(409, { error: "Este paciente já está agendado" }, {}) === null, "409 comum vira erro");
  ok2(confirmacaoPedida(409, null, {}) === null, "sem corpo");
  console.log(`A4c confirmações OK — ${n} verificações.`);
});

// ---------------------------------------------------------------- A4d: comConfirmacoes
import("../src/lib/agendaNova/confirmacoes").then(async ({ comConfirmacoes }) => {
  let n = 0;
  const ok3 = (c: unknown, m: string) => {
    if (!c) throw new Error(`FALHOU: ${m}`);
    n++;
  };
  const erro409 = (data: unknown) => Object.assign(new Error("409"), { status: 409, data });

  // Bloqueio + retorno: pergunta duas vezes e conclui com os dois campos
  const chamadas: unknown[] = [];
  const r = await comConfirmacoes(
    async (c) => {
      chamadas.push(c);
      if (!c.ignorar_bloqueio) throw erro409({ codigo: "horario_bloqueado" });
      if (!c.confirmar_retorno) throw erro409({ codigo: "retorno_confirmar", mensagem: "?" });
    },
    async () => true,
  );
  ok3(r === true && chamadas.length === 3, "duas confirmações e conclui");
  ok3(JSON.stringify(chamadas[2]) === JSON.stringify({ ignorar_bloqueio: true, confirmar_retorno: true }), "reenvia acumulando");

  // Usuário desiste
  const r2 = await comConfirmacoes(async () => {
    throw erro409({ codigo: "horario_bloqueado" });
  }, async () => false);
  ok3(r2 === false, "desistiu");

  // Erro comum sobe
  let subiu = false;
  try {
    await comConfirmacoes(async () => {
      throw Object.assign(new Error("x"), { status: 400, data: { error: "x" } });
    }, async () => true);
  } catch {
    subiu = true;
  }
  ok3(subiu, "erro que não é confirmação sobe");
  console.log(`A4d comConfirmacoes OK — ${n} verificações.`);
});

// ---------------------------------------------------------------- A5: mês
import("../src/lib/agendaNova/semana").then(({ diasDaGradeMes, somarMeses, rotuloMes, mesmoMes, inicioDoMes }) => {
  let n = 0;
  const ok4 = (c: unknown, m: string) => {
    if (!c) throw new Error(`FALHOU: ${m}`);
    n++;
  };
  const nov = diasDaGradeMes("2026-11-13");
  ok4(nov.length === 42 && nov[0] === "2026-10-26" && nov[41] === "2026-12-06", `grade de novembro: ${nov[0]}..${nov[41]}`);
  ok4(nov.includes("2026-11-01") && nov.includes("2026-11-30"), "mês inteiro dentro da grade");
  ok4(diasDaGradeMes("2026-06-10")[0] === "2026-06-01", "mês que começa na segunda");
  ok4(somarMeses("2026-03-31", -1) === "2026-02-28", "31/03 - 1 mês = 28/02");
  ok4(somarMeses("2026-12-15", 1) === "2027-01-15", "virada de ano");
  ok4(rotuloMes("2026-11-13") === "novembro de 2026", "rótulo do mês");
  ok4(mesmoMes("2026-11-01", "2026-11-30") && !mesmoMes("2026-11-30", "2026-12-01"), "mesmo mês");
  ok4(inicioDoMes("2026-11-13") === "2026-11-01", "início do mês");
  console.log(`A5 mês OK — ${n} verificações.`);
});
