import PDFDocument from "pdfkit";
import { parseDataImageUrl } from "../utils/imageDataUrl.js";

export type PdfDocContext = {
  clinica_nome: string;
  clinica_telefone?: string | null;
  clinica_endereco?: string | null;
  clinica_logo?: string | null;
  clinica_cnpj?: string | null;
  medico_nome: string;
  medico_crm?: string | null;
  paciente_nome: string;
  paciente_nasc?: string | null;
  paciente_cpf?: string | null;
  data_emissao: string;
};

function formatDataBr(iso: string): string {
  const base = iso.trim().slice(0, 10);
  const [y, m, d] = base.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function areaUtil(doc: PDFKit.PDFDocument) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  return { left, width };
}

function drawHeader(doc: PDFKit.PDFDocument, ctx: PdfDocContext, titulo: string) {
  const { left, width } = areaUtil(doc);
  const logo = ctx.clinica_logo ? parseDataImageUrl(ctx.clinica_logo) : null;
  let textX = left;
  if (logo) {
    try {
      doc.image(logo.buffer, left, 45, { width: 56 });
      textX = left + 70;
    } catch {
      /* ignore bad image */
    }
  }

  const headerTextWidth = width - (textX - left);
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(ctx.clinica_nome || "Consultório", textX, 50, { width: headerTextWidth });
  doc.fontSize(9).font("Helvetica");
  const sub: string[] = [];
  if (ctx.clinica_endereco) sub.push(ctx.clinica_endereco);
  if (ctx.clinica_telefone) sub.push(ctx.clinica_telefone);
  if (sub.length) doc.text(sub.join(" · "), textX, 68, { width: headerTextWidth });

  doc.x = left;
  doc.moveDown(1.2);
  doc.fontSize(13).font("Helvetica-Bold").text(titulo, left, doc.y, {
    width,
    align: "center",
  });
  doc.x = left;
  doc.moveDown(0.5);

  doc.fontSize(10).font("Helvetica");
  doc.text(`Paciente: ${ctx.paciente_nome}`, left, doc.y, { width });
  const idade = ctx.paciente_nasc ? `Nasc.: ${formatDataBr(ctx.paciente_nasc)}` : "";
  const cpf = ctx.paciente_cpf ? `CPF: ${ctx.paciente_cpf}` : "";
  doc.text([idade, cpf].filter(Boolean).join("   "), left, doc.y, { width });
  doc.text(
    `Médico: ${ctx.medico_nome}${ctx.medico_crm ? ` — CRM ${ctx.medico_crm}` : ""}`,
    left,
    doc.y,
    { width },
  );
  doc.text(`Data: ${formatDataBr(ctx.data_emissao)}`, left, doc.y, { width });
  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor("#94a8c4").stroke();
  doc.x = left;
  doc.moveDown(0.8);
}

function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

export type ReceitaPdfItem = {
  medicamento: string;
  dosagem?: string | null;
  via?: string | null;
  posologia?: string | null;
  quantidade?: string | null;
  duracao_dias?: number | null;
};

export function gerarPdfReceita(
  ctx: PdfDocContext,
  itens: ReceitaPdfItem[],
  observacoes?: string | null,
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    drawHeader(doc, ctx, "RECEITUÁRIO");
    doc.fontSize(11).font("Helvetica-Bold").text("Medicamentos:");
    doc.moveDown(0.3);
    doc.font("Helvetica");
    if (itens.length === 0) {
      doc.text("(sem itens)");
    } else {
      itens.forEach((it, i) => {
        doc.font("Helvetica-Bold").text(`${i + 1}. ${it.medicamento}`);
        doc.font("Helvetica");
        const parts: string[] = [];
        if (it.dosagem) parts.push(`Dose: ${it.dosagem}`);
        if (it.via) parts.push(`Via: ${it.via}`);
        if (it.posologia) parts.push(it.posologia);
        if (it.quantidade) parts.push(`Qtd: ${it.quantidade}`);
        if (it.duracao_dias) parts.push(`${it.duracao_dias} dia(s)`);
        if (parts.length) doc.text(parts.join(" · "));
        doc.moveDown(0.4);
      });
    }
    if (observacoes?.trim()) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Observações:");
      doc.font("Helvetica").text(observacoes.trim());
    }
    doc.moveDown(2);
    doc.text("_________________________________________", { align: "center" });
    doc.text(ctx.medico_nome, { align: "center" });
    if (ctx.medico_crm) doc.text(`CRM ${ctx.medico_crm}`, { align: "center" });
  });
}

export function gerarPdfAtestado(
  ctx: PdfDocContext,
  dados: {
    dias_afastamento?: number | null;
    cid_codigo?: string | null;
    cid_descricao?: string | null;
    texto_livre?: string | null;
  },
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    drawHeader(doc, ctx, "ATESTADO MÉDICO");
    doc.fontSize(11).font("Helvetica");
    const dias = dados.dias_afastamento;
    if (dias != null && dias > 0) {
      doc.text(
        `Atesto para os devidos fins que o(a) paciente acima identificado(a) necessita de afastamento de suas atividades por ${dias} dia(s).`,
      );
      doc.moveDown(0.6);
    }
    if (dados.cid_codigo || dados.cid_descricao) {
      doc.text(
        `CID: ${[dados.cid_codigo, dados.cid_descricao].filter(Boolean).join(" — ")}`,
      );
      doc.moveDown(0.6);
    }
    if (dados.texto_livre?.trim()) {
      doc.text(dados.texto_livre.trim());
      doc.moveDown(0.6);
    }
    doc.moveDown(2);
    doc.text("_________________________________________", { align: "center" });
    doc.text(ctx.medico_nome, { align: "center" });
    if (ctx.medico_crm) doc.text(`CRM ${ctx.medico_crm}`, { align: "center" });
  });
}

export function gerarPdfPedidoExame(
  ctx: PdfDocContext,
  exames: string,
  observacoes?: string | null,
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    drawHeader(doc, ctx, "PEDIDO DE EXAME");
    doc.fontSize(11).font("Helvetica-Bold").text("Exames solicitados:");
    doc.moveDown(0.3);
    doc.font("Helvetica").text(exames.trim() || "(não informado)");
    if (observacoes?.trim()) {
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").text("Observações:");
      doc.font("Helvetica").text(observacoes.trim());
    }
    doc.moveDown(2);
    doc.text("_________________________________________", { align: "center" });
    doc.text(ctx.medico_nome, { align: "center" });
    if (ctx.medico_crm) doc.text(`CRM ${ctx.medico_crm}`, { align: "center" });
  });
}

export type ConsultaPdfCampo = {
  label: string;
  valor: string;
};

export function gerarPdfConsulta(
  ctx: PdfDocContext,
  tituloDocumento: string,
  campos: ConsultaPdfCampo[],
  extras?: {
    faixa?: string;
    faixaSub?: string;
    conclusao?: { label: string; valor: string; restricoes?: string | null };
  },
): Promise<Buffer> {
  const titulo = tituloDocumento.trim().toUpperCase() || "PRONTUÁRIO DE CONSULTA";
  return pdfToBuffer((doc) => {
    const { left, width } = areaUtil(doc);
    drawHeader(doc, ctx, titulo);
    if (extras?.faixa) {
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(10).text(extras.faixa, left, doc.y, {
        width,
        align: "center",
      });
      if (extras.faixaSub) {
        doc.font("Helvetica").fontSize(8).text(extras.faixaSub, left, doc.y, {
          width,
          align: "center",
        });
      }
      doc.moveDown(0.4);
    }
    doc.fontSize(11).font("Helvetica");
    for (const campo of campos) {
      doc.x = left;
      doc.font("Helvetica-Bold").text(`${campo.label}:`, left, doc.y, { width });
      doc.x = left;
      doc.font("Helvetica").text(campo.valor, left, doc.y, {
        width,
        lineGap: 2,
      });
      doc.moveDown(0.5);
    }
    if (extras?.conclusao) {
      doc.moveDown(0.4);
      doc.x = left;
      doc.font("Helvetica-Bold").text(`${extras.conclusao.label}:`, left, doc.y, {
        width,
      });
      doc.x = left;
      doc.font("Helvetica").text(extras.conclusao.valor, left, doc.y, { width });
      const rest = extras.conclusao.restricoes?.trim();
      if (rest) {
        doc.moveDown(0.3);
        doc.x = left;
        doc.font("Helvetica-Bold").text("Restrições:", left, doc.y, { width });
        doc.x = left;
        doc.font("Helvetica").text(rest, left, doc.y, { width, lineGap: 2 });
      }
    }
    doc.moveDown(1.5);
    doc.text("_________________________________________", { align: "center" });
    doc.text(ctx.medico_nome, { align: "center" });
    if (ctx.medico_crm) doc.text(`CRM ${ctx.medico_crm}`, { align: "center" });
  });
}

export type AdmissionalPdfDados = {
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
  exames: Record<string, { realizado: boolean; data: string }>;
  exames_outros: string;
  nr35: string;
  observacoes: string;
};

const ASO_TIPOS: { id: string; label: string }[] = [
  { id: "admissional", label: "Admissional" },
  { id: "demissional", label: "Demissional" },
  { id: "periodico", label: "Periódico" },
  { id: "retorno_trabalho", label: "Retorno ao trabalho" },
  { id: "mudanca_funcao", label: "Mudança de função" },
];

const ASO_QUIMICOS_PDF = [
  "Detergente", "Desinfetante", "Álcool Etílico", "Sabão Líquido", "Ferro", "Poeira",
  "Hipoclorito de sódio 1%", "Clorado 10%", "Hidrocarbonetos", "Organofosforado", "Cromo",
  "Fosfina", "Tolueno", "Xileno", "Benzeno", "Etilbenzeno", "Níquel", "Chumbo", "Estanho",
  "Hidróxido de sódio", "Pigmento", "Resina", "Cimento", "Piretroides",
] as const;

const ASO_QUIMICO_IDS = [
  "detergente", "desinfetante", "alcool_etilico", "sabao_liquido", "ferro", "poeira",
  "hipoclorito_1", "clorado_10", "hidrocarbonetos", "organofosforado", "cromo", "fosfina",
  "tolueno", "xileno", "benzeno", "etilbenzeno", "niquel", "chumbo", "estanho",
  "hidroxido_sodio", "pigmento", "resina", "cimento", "piretroides",
] as const;

const ASO_FISICOS_PDF: { id: string; label: string }[] = [
  { id: "calor", label: "Calor" },
  { id: "frio", label: "Frio" },
  { id: "radiacao_uv", label: "Radiação UV" },
  { id: "ruido", label: "Ruído" },
  { id: "umidade", label: "Umidade" },
];

const ASO_EXAMES_PDF: { id: string; label: string }[] = [
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

const ASO_NR35_PDF: { id: string; label: string }[] = [
  { id: "apto_altura", label: "apto para trabalho em altura" },
  { id: "inapto_altura", label: "inapto para trabalho em altura" },
  { id: "nao_aplica", label: "não se aplica" },
];

const ASO_TEXTO_LEGAL =
  "De acordo com o item 7.4.5. da NR7, o presente Atestado de Saúde Ocupacional é parte integrante do Prontuário Médico. (de acordo com a portaria n°24 de 29/12/1994 e do código de SSST 01/10/1996).";

const ADM_PDF = {
  margin: 48,
  pageH: 842,
  footer: 52,
  border: "#1a1a1a",
  line: "#bdbdbd",
  muted: "#444444",
  ruledH: 16,
  sectionPad: 6,
  sectionGap: 7,
} as const;

const CONCLUSAO_OPCOES: { value: string; label: string }[] = [
  { value: "apto", label: "Apto" },
  { value: "inapto", label: "Inapto" },
  { value: "apto_com_restricao", label: "Apto com restrição" },
];

function admContentWidth(): number {
  return 595.28 - ADM_PDF.margin * 2;
}

function admBottomLimit(): number {
  return ADM_PDF.pageH - ADM_PDF.footer;
}

function admCampo(valor: string | null | undefined): string {
  const v = String(valor ?? "").trim();
  return v || "—";
}

function admUpper(valor: string | null | undefined): string {
  return String(valor ?? "").trim().toUpperCase();
}

function admEnsureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  needed: number,
): number {
  if (y + needed <= admBottomLimit()) return y;
  doc.addPage();
  return ADM_PDF.margin;
}

function admLineCount(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  minLines: number,
): number {
  const t = admUpper(text);
  if (!t) return minLines;
  doc.font("Helvetica").fontSize(10);
  const h = doc.heightOfString(t, { width, lineGap: 2 });
  return Math.max(minLines, Math.ceil(h / ADM_PDF.ruledH) + 1);
}

function admDrawRuledBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  lineCount: number,
  text: string,
): number {
  const innerX = x + ADM_PDF.sectionPad;
  const innerW = width - ADM_PDF.sectionPad * 2;
  const blockH = lineCount * ADM_PDF.ruledH + ADM_PDF.sectionPad + 4;

  for (let i = 1; i <= lineCount; i++) {
    const ly = y + ADM_PDF.sectionPad + i * ADM_PDF.ruledH;
    doc
      .strokeColor(ADM_PDF.line)
      .moveTo(innerX, ly)
      .lineTo(innerX + innerW, ly)
      .stroke();
  }

  const t = admUpper(text);
  if (t) {
    doc
      .fillColor("#000000")
      .font("Helvetica")
      .fontSize(10)
      .text(t, innerX + 2, y + ADM_PDF.sectionPad + 2, {
        width: innerW - 4,
        lineGap: ADM_PDF.ruledH - 12,
      });
  }

  return blockH;
}

function admDrawSectionBorder(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  doc.strokeColor(ADM_PDF.border).rect(x, y, width, height).stroke();
}

function admMark(checked: boolean): string {
  return checked ? "(X)" : "( )";
}

function admDrawAsoHeader(
  doc: PDFKit.PDFDocument,
  ctx: PdfDocContext,
  x: number,
  y: number,
  width: number,
): number {
  const logo = ctx.clinica_logo ? parseDataImageUrl(ctx.clinica_logo) : null;
  let textX = x;
  if (logo) {
    try {
      doc.image(logo.buffer, x, y, { fit: [70, 42] });
      textX = x + 76;
    } catch {
      /* ignore */
    }
  }
  doc.fillColor("#000000").font("Helvetica-Bold").fontSize(12);
  doc.text(ctx.clinica_nome || "Consultório", textX, y, { width: width - 80 });
  if (ctx.clinica_cnpj?.trim()) {
    doc.font("Helvetica").fontSize(9).text(`CNPJ: ${ctx.clinica_cnpj.trim()}`, textX, y + 16);
  }
  y += 48;
  doc.font("Helvetica-Bold").fontSize(13).text("ATESTADO DE SAÚDE OCUPACIONAL", x, y, {
    width,
    align: "center",
  });
  return y + 28;
}

function admDrawLabeledLine(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW: number,
  lineW: number,
): number {
  doc.font("Helvetica-Bold").fontSize(9).text(label, x, y);
  doc.font("Helvetica").fontSize(10).text(admCampo(value), x + labelW, y, { width: lineW });
  doc
    .strokeColor(ADM_PDF.border)
    .moveTo(x + labelW, y + 12)
    .lineTo(x + labelW + lineW, y + 12)
    .stroke();
  return y + 18;
}

function admDrawCheckboxRow(
  doc: PDFKit.PDFDocument,
  items: { id: string; label: string }[],
  selected: string,
  x: number,
  y: number,
  width: number,
  title?: string,
): number {
  y = admEnsureSpace(doc, y, 24);
  if (title) {
    doc.font("Helvetica-Bold").fontSize(9).text(title, x, y);
    y += 12;
  }
  doc.font("Helvetica").fontSize(8);
  let cx = x;
  for (const item of items) {
    const mark = admMark(selected === item.id);
    const txt = `${mark} ${item.label}`;
    const tw = doc.widthOfString(txt) + 10;
    if (cx + tw > x + width) {
      cx = x;
      y += 12;
    }
    doc.text(txt, cx, y, { lineBreak: false });
    cx += tw;
  }
  return y + 16;
}

function admDrawCheckboxGrid(
  doc: PDFKit.PDFDocument,
  labels: readonly string[],
  ids: readonly string[],
  map: Record<string, boolean>,
  x: number,
  y: number,
  width: number,
  cols: number,
): number {
  const colW = width / cols;
  doc.font("Helvetica").fontSize(7.5);
  let row = 0;
  let col = 0;
  for (let i = 0; i < labels.length; i++) {
    const id = ids[i]!;
    const px = x + col * colW;
    const py = y + row * 11;
    doc.text(`${admMark(Boolean(map[id]))} ${labels[i]}`, px, py, {
      width: colW - 4,
      lineBreak: false,
    });
    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }
  return y + (row + (col > 0 ? 1 : 0)) * 11 + 4;
}

export function gerarPdfAdmissional(
  ctx: PdfDocContext,
  payload: {
    dados: AdmissionalPdfDados;
    conclusao: string;
    restricoes_texto?: string | null;
    admissional_id: number;
    finalizado_em?: string | null;
    retificacao_de_id?: number | null;
    motivo_retificacao?: string | null;
  },
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    const d = payload.dados;
    const x = ADM_PDF.margin;
    const w = admContentWidth();
    let y: number = ADM_PDF.margin;

    y = admDrawAsoHeader(doc, ctx, x, y, w);
    if (payload.retificacao_de_id) {
      y = admEnsureSpace(doc, y, 36);
      doc
        .fillColor("#000000")
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          `RETIFICAÇÃO DO ASO Nº ${payload.retificacao_de_id}  ·  folha nº ${payload.admissional_id}`,
          x,
          y,
          { width: w, align: "center" },
        );
      y += 14;
      const motivo = String(payload.motivo_retificacao ?? "").trim();
      if (motivo) {
        doc.font("Helvetica").fontSize(8).text(`Motivo: ${motivo}`, x, y, {
          width: w,
          align: "center",
        });
        y += 16;
      } else {
        y += 6;
      }
    }
    y = admDrawLabeledLine(doc, "Nome da Empresa:", d.empresa, x, y, 92, w - 92);
    y = admDrawLabeledLine(
      doc,
      "Nome do Funcionário:",
      ctx.paciente_nome,
      x,
      y,
      108,
      w - 108,
    );
    y = admDrawLabeledLine(doc, "C.I.:", d.ci, x, y, 28, w * 0.35 - 28);
    const cpfX = x + w * 0.38;
    y -= 18;
    admDrawLabeledLine(doc, "CPF:", ctx.paciente_cpf ?? "", cpfX, y, 28, w * 0.62 - 28);
    y += 18;
    y = admDrawLabeledLine(doc, "Função:", d.funcao, x, y, 42, w - 42);

    y = admDrawCheckboxRow(doc, ASO_TIPOS, d.tipo_atestado, x, y, w, "Tipo de atestado:");

    y = admEnsureSpace(doc, y, 50);
    admDrawSectionBorder(doc, x, y, w, 40);
    doc.font("Helvetica-Bold").fontSize(9).text("Riscos Ocupacionais:", x + 6, y + 5);
    doc.font("Helvetica").fontSize(9).text(d.riscos_texto.trim() || " ", x + 6, y + 18, {
      width: w - 12,
      height: 20,
    });
    y += 46;

    doc.font("Helvetica-Bold").fontSize(8).text("Químicos:", x, y);
    y += 10;
    y = admDrawCheckboxGrid(doc, ASO_QUIMICOS_PDF, ASO_QUIMICO_IDS, d.quimicos, x, y, w, 4);

    doc.font("Helvetica-Bold").fontSize(8).text("Físicos:", x, y);
    y += 10;
    let cx = x;
    doc.font("Helvetica").fontSize(8);
    for (const f of ASO_FISICOS_PDF) {
      const txt = `${admMark(Boolean(d.fisicos[f.id]))} ${f.label}`;
      doc.text(txt, cx, y, { lineBreak: false });
      cx += doc.widthOfString(txt) + 12;
    }
    y += 14;
    doc.text(
      `${admMark(d.biologicos)} Biológicos    ${admMark(d.ergonomicos)} Ergonômicos`,
      x,
      y,
    );
    y += 12;
    doc.text(
      `${admMark(Boolean(d.acidentes.quedas))} Quedas  ${admMark(Boolean(d.acidentes.choque))} Choque  ${admMark(Boolean(d.acidentes.outros))} Outros (Acidentes)`,
      x,
      y,
    );
    y += 14;
    if (d.riscos_outros.trim()) {
      doc.text(`Outros riscos: ${d.riscos_outros.trim()}`, x, y, { width: w });
      y += 14;
    }

    y = admEnsureSpace(doc, y, 80);
    doc.font("Helvetica-Bold").fontSize(9).text("Exames Realizados:", x, y);
    y += 12;
    doc.font("Helvetica").fontSize(8);
    for (const ex of ASO_EXAMES_PDF) {
      const ev = d.exames[ex.id];
      const mark = admMark(Boolean(ev?.realizado));
      const data = ev?.data?.trim() ? ev.data.trim() : "___/___/______";
      doc.text(`${mark} ${ex.label}  ${data}`, x, y, { width: w });
      y += 11;
    }
    if (d.exames_outros.trim()) {
      doc.text(`Outros: ${d.exames_outros.trim()}`, x, y, { width: w });
      y += 12;
    }

    y = admEnsureSpace(doc, y, 40);
    doc.font("Helvetica").fontSize(7.5).text(ASO_TEXTO_LEGAL, x, y, { width: w, align: "justify" });
    y += 36;

    doc.font("Helvetica-Bold").fontSize(9);
    doc.text(
      `${admMark(payload.conclusao === "apto" || payload.conclusao === "apto_com_restricao")} Apto    ${admMark(payload.conclusao === "inapto")} Inapto`,
      x,
      y,
    );
    y += 14;
    if (payload.conclusao === "apto_com_restricao" && payload.restricoes_texto?.trim()) {
      doc.font("Helvetica").fontSize(8).text(`Restrições: ${payload.restricoes_texto.trim()}`, x, y, {
        width: w,
      });
      y += 14;
    }

    doc.font("Helvetica-Bold").fontSize(8).text("NR 35:", x, y);
    y += 10;
    y = admDrawCheckboxRow(doc, ASO_NR35_PDF, d.nr35, x, y, w);

    y = admEnsureSpace(doc, y, 60);
    const localData = formatDataBr(ctx.data_emissao);
    doc.font("Helvetica").fontSize(9).text(`${ctx.clinica_endereco ? "" : ""}${localData}`, x, y, {
      width: w,
      align: "center",
    });
    y += 24;
    doc.text("_________________________________________", x, y, { width: w, align: "center" });
    y += 14;
    doc.text("Médico Examinador", x, y, { width: w, align: "center" });
    doc.text(ctx.medico_nome, x, y + 12, { width: w, align: "center" });
    if (ctx.medico_crm) doc.text(`CRM ${ctx.medico_crm}`, x, y + 24, { width: w, align: "center" });
    y += 48;
    doc.fontSize(8).text("Recebi a segunda via do atestado", x, y, { width: w, align: "center" });
    y += 20;
    doc.text("_________________________________________", x, y, { width: w, align: "center" });
    doc.text("ASSINATURA:", x, y + 12, { width: w, align: "center" });
  });
}
