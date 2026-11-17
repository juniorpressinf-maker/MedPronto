/**
 * TF1 — campo "texto formatado" (editor): limpeza de HTML (segurança), texto puro e blocos do PDF.
 * Não usa banco.
 */
import { blocosHtml, htmlParaTexto, limparHtmlProntuario } from "../src/services/textoFormatado.js";

let n = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
  n++;
}

// 1) Segurança: nada executável passa
const ataque =
  '<p onclick="x()">oi<script>alert(1)</script><img src=x onerror=alert(2)>' +
  '<a href="javascript:alert(3)">link</a><style>p{}</style><iframe src="//x"></iframe></p>';
const limpo = limparHtmlProntuario(ataque);
assert(!/script|onerror|onclick|javascript|<img|<a |<style|<iframe|alert/i.test(limpo), `ataque removido: ${limpo}`);
assert(limpo.includes("oi") && limpo.includes("link"), "texto do ataque preservado");
assert(!/<\w+\s/.test(limpo), "nenhum atributo sobra");

// 2) Formatação permitida e normalizada
const f = limparHtmlProntuario('<b>neg</b> <i>it</i> <u>sub</u><h1>Tit</h1><div>bloco</div>');
assert(f.includes("<strong>neg</strong>") && f.includes("<em>it</em>") && f.includes("<u>sub</u>"), `inline: ${f}`);
assert(f.includes("<h3>Tit</h3>") && f.includes("<p>bloco</p>"), `blocos: ${f}`);

// 3) Tags mal fechadas ficam bem fechadas
const mal = limparHtmlProntuario("<p><strong>aberto");
assert(mal === "<p><strong>aberto</strong></p>", `fecha tags: ${mal}`);

// 4) Texto puro
const txt = htmlParaTexto("<h3>Queixa</h3><p>dor &amp; febre</p><ol><li><p>um</p></li><li><p>dois</p></li></ol><ul><li>a</li></ul>");
assert(txt.includes("Queixa") && txt.includes("dor & febre"), `texto: ${txt}`);
assert(txt.includes("1. um") && txt.includes("2. dois") && txt.includes("• a"), `listas: ${txt}`);
assert(htmlParaTexto("<p></p><p><br></p>") === "", "vazio é vazio");

// 5) Blocos para o PDF
const b = blocosHtml("<h3>T</h3><p>a <strong>b</strong></p><ol><li><p>x</p></li><li><p>y</p></li></ol>");
assert(b[0]?.tipo === "h3", "título");
assert(b[1]?.trechos.some((t) => t.negrito && t.texto === "b") ?? false, "negrito no trecho");
assert(b[2]?.tipo === "li" && b[2].marcador === "1." && b[3]?.marcador === "2.", "lista numerada");

console.log(`TF1 OK — ${n} verificações (limpeza, texto puro, blocos PDF).`);
