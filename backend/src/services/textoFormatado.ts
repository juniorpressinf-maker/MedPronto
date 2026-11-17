/**
 * Campo de ficha "texto_formatado" (editor): o texto é guardado como HTML RESTRITO.
 * Tudo que entra passa por `limparHtmlProntuario` (lista branca, sem atributos) — nada de
 * script, estilo, link ou imagem. O mesmo parser alimenta o PDF (`blocosHtml`).
 *
 * Tags aceitas: p, br, strong, em, u, ul, ol, li, h3  (b→strong, i→em, h1/h2/h4→h3, div→p).
 */

type Tag = "p" | "br" | "strong" | "em" | "u" | "ul" | "ol" | "li" | "h3";

const MAPA: Record<string, Tag> = {
  p: "p",
  div: "p",
  br: "br",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "u",
  ul: "ul",
  ol: "ol",
  li: "li",
  h1: "h3",
  h2: "h3",
  h3: "h3",
  h4: "h3",
};

/** Conteúdo destas tags é descartado inteiro. */
const DESCARTAR = new Set(["script", "style", "iframe", "object", "embed", "template", "head", "title", "svg", "math"]);

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodificar(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Token = { tipo: "texto"; valor: string } | { tipo: "abre" | "fecha"; tag: string };

function tokenizar(html: string): Token[] {
  const out: Token[] = [];
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[2]) out.push({ tipo: m[1] ? "fecha" : "abre", tag: m[2].toLowerCase() });
    else if (m[3] != null) out.push({ tipo: "texto", valor: decodificar(m[3]) });
    else out.push({ tipo: "texto", valor: "<" });
  }
  return out;
}

/** HTML do editor -> HTML seguro (só tags permitidas, sem atributos, sempre bem fechado). */
export function limparHtmlProntuario(html: unknown): string {
  if (typeof html !== "string" || !html.trim()) return "";
  const pilha: Tag[] = [];
  let out = "";
  let descartando = 0;

  const fecharAte = (t: Tag) => {
    const i = pilha.lastIndexOf(t);
    if (i < 0) return;
    while (pilha.length > i) out += `</${pilha.pop()}>`;
  };

  for (const tk of tokenizar(html.slice(0, 200_000))) {
    if (tk.tipo !== "texto" && DESCARTAR.has(tk.tag)) {
      descartando = Math.max(0, descartando + (tk.tipo === "abre" ? 1 : -1));
      continue;
    }
    if (descartando) continue;
    if (tk.tipo === "texto") {
      out += escapar(tk.valor);
      continue;
    }
    const tag = MAPA[tk.tag];
    if (!tag) continue; // tag não permitida: some, o texto dentro fica
    if (tag === "br") {
      if (tk.tipo === "abre") out += "<br>";
      continue;
    }
    if (tk.tipo === "abre") {
      // blocos não se aninham em parágrafo/título: fecha antes
      if (tag === "p" || tag === "h3" || tag === "ul" || tag === "ol") {
        for (const b of ["p", "h3"] as Tag[]) fecharAte(b);
      }
      if (tag === "li") fecharAte("li");
      pilha.push(tag);
      out += `<${tag}>`;
    } else {
      fecharAte(tag);
    }
  }
  while (pilha.length) out += `</${pilha.pop()}>`;
  // parágrafos vazios repetidos não valem
  return out.replace(/(<p>(<br>)?<\/p>){2,}/g, "<p></p>").trim();
}

/** Texto puro (busca, "tem conteúdo?", resumo). Parágrafos e itens viram linhas. */
export function htmlParaTexto(html: unknown): string {
  if (typeof html !== "string") return "";
  let ordem: number[] = [];
  let txt = "";
  for (const tk of tokenizar(html)) {
    if (tk.tipo === "texto") {
      txt += tk.valor;
      continue;
    }
    const tag = MAPA[tk.tag] ?? tk.tag;
    if (tk.tipo === "abre") {
      if (tag === "ol") ordem.push(0);
      if (tag === "ul") ordem.push(-1);
      if (tag === "li") {
        const n = ordem.length ? ordem[ordem.length - 1]! : -1;
        if (n >= 0) ordem[ordem.length - 1] = n + 1;
        txt += `\n${n >= 0 ? `${n + 1}. ` : "• "}`;
      }
      if (tag === "br") txt += "\n";
      // <p> dentro de <li> (padrão do editor) não quebra a linha do marcador
      if ((tag === "p" || tag === "h3") && !/(\d+\. |• )$/.test(txt)) txt += "\n";
    } else if (tag === "ul" || tag === "ol") {
      ordem = ordem.slice(0, -1);
    }
  }
  return txt.replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type TrechoTexto = { texto: string; negrito: boolean; italico: boolean; sublinhado: boolean };
export type BlocoTexto = {
  tipo: "p" | "h3" | "li";
  /** li: "•" ou "1." */
  marcador?: string;
  trechos: TrechoTexto[];
};

/** HTML limpo -> blocos para desenhar no PDF. */
export function blocosHtml(html: unknown): BlocoTexto[] {
  const limpo = limparHtmlProntuario(html);
  const blocos: BlocoTexto[] = [];
  const estilo = { strong: 0, em: 0, u: 0 };
  const listas: { tipo: "ul" | "ol"; n: number }[] = [];
  let atual: BlocoTexto | null = null;

  const garantir = (): BlocoTexto => {
    if (!atual) {
      atual = { tipo: "p", trechos: [] };
      blocos.push(atual);
    }
    return atual;
  };

  for (const tk of tokenizar(limpo)) {
    if (tk.tipo === "texto") {
      if (!tk.valor) continue;
      garantir().trechos.push({
        texto: tk.valor,
        negrito: estilo.strong > 0,
        italico: estilo.em > 0,
        sublinhado: estilo.u > 0,
      });
      continue;
    }
    const tag = tk.tag as Tag;
    const abre = tk.tipo === "abre";
    if (tag === "strong" || tag === "em" || tag === "u") {
      estilo[tag] = Math.max(0, estilo[tag] + (abre ? 1 : -1));
    } else if (tag === "br") {
      garantir().trechos.push({ texto: "\n", negrito: false, italico: false, sublinhado: false });
    } else if (tag === "ul" || tag === "ol") {
      if (abre) listas.push({ tipo: tag, n: 0 });
      else listas.pop();
      atual = null;
    } else if (tag === "li") {
      if (abre) {
        const l = listas[listas.length - 1];
        let marcador = "•";
        if (l?.tipo === "ol") {
          l.n += 1;
          marcador = `${l.n}.`;
        }
        atual = { tipo: "li", marcador, trechos: [] };
        blocos.push(atual);
      } else atual = null;
    } else if (tag === "p" || tag === "h3") {
      if (abre) {
        // <p> dentro de <li> (padrão do editor) continua o mesmo item
        if (!(atual && (atual as BlocoTexto).tipo === "li")) {
          atual = { tipo: tag, trechos: [] };
          blocos.push(atual);
        }
      } else if (!(atual && (atual as BlocoTexto).tipo === "li")) atual = null;
    }
  }
  return blocos;
}
