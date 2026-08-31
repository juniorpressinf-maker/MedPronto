import PDFDocument from "pdfkit";
import { parseDataImageUrl } from "../utils/imageDataUrl.js";
import type { RelatorioFaturamentoConvenio } from "./cobrancaFaturamentoConvenio.js";
import type { CobrancaRelatorio } from "./cobrancaRelatorios.js";

const FORMA_LABEL: Record<string, string> = {
  pix: "PIX",
  credito: "Cartão crédito",
  debito: "Cartão débito",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
  repasse_convenio: "Repasse convênio",
};

function formatDataBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

type ClinicaCtx = {
  nome: string;
  cnpj_cpf: string | null;
  telefone: string | null;
  endereco: string | null;
  logo: string | null;
};

function drawClinicaHeader(doc: PDFKit.PDFDocument, clinica: ClinicaCtx, titulo: string) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const logo = clinica.logo ? parseDataImageUrl(clinica.logo) : null;
  let textX = left;
  if (logo) {
    try {
      doc.image(logo.buffer, left, 42, { width: 52 });
      textX = left + 64;
    } catch {
      /* ignore */
    }
  }
  const tw = width - (textX - left);
  doc.fontSize(13).font("Helvetica-Bold").text(clinica.nome || "Clínica", textX, 46, {
    width: tw,
  });
  doc.fontSize(8).font("Helvetica");
  const sub: string[] = [];
  if (clinica.cnpj_cpf) sub.push(clinica.cnpj_cpf);
  if (clinica.endereco) sub.push(clinica.endereco);
  if (clinica.telefone) sub.push(clinica.telefone);
  if (sub.length) doc.text(sub.join(" · "), textX, 64, { width: tw });

  doc.x = left;
  doc.moveDown(1.4);
  doc.fontSize(12).font("Helvetica-Bold").text(titulo, left, doc.y, {
    width,
    align: "center",
  });
  doc.moveDown(0.3);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawTable(
  doc: PDFKit.PDFDocument,
  titulo: string,
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  ensureSpace(doc, 40);
  const left = doc.page.margins.left;
  if (titulo.trim()) {
    doc.fontSize(10).font("Helvetica-Bold").text(titulo, left, doc.y);
    doc.moveDown(0.4);
  }

  const rowH = 18;
  const tableW = colWidths.reduce((s, w) => s + w, 0);
  let y = doc.y;

  doc.fontSize(8).font("Helvetica-Bold");
  let x = left;
  headers.forEach((h, i) => {
    doc.rect(x, y, colWidths[i]!, rowH).fillAndStroke("#e8eef5", "#94a8c4");
    doc.fillColor("#1a2b42").text(h, x + 4, y + 5, {
      width: colWidths[i]! - 8,
      align: i > 0 ? "right" : "left",
    });
    x += colWidths[i]!;
  });
  y += rowH;

  doc.font("Helvetica").fillColor("#000");
  for (const row of rows) {
    ensureSpace(doc, rowH + 20);
    if (doc.y > y + 4) y = doc.y;
    x = left;
    row.forEach((cell, i) => {
      doc.rect(x, y, colWidths[i]!, rowH).strokeColor("#c5d0de").stroke();
      doc.text(cell, x + 4, y + 5, {
        width: colWidths[i]! - 8,
        align: i > 0 ? "right" : "left",
      });
      x += colWidths[i]!;
    });
    y += rowH;
  }
  doc.x = left;
  doc.y = y + 10;
  void tableW;
}

const STATUS_LABEL: Record<string, string> = {
  em_aberto: "Em aberto",
  a_faturar_convenio: "A faturar",
  pago: "Pago",
  isento: "Isento",
  parcialmente_pago: "Parcial",
  aguardando_pagamento: "Aguardando",
};

export function gerarPdfFaturamentoConvenio(
  rel: RelatorioFaturamentoConvenio,
  clinica: ClinicaCtx,
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    const titulo =
      rel.convenio_nome != null
        ? `Faturamento — ${rel.convenio_nome}`
        : "Faturamento por convênio";
    drawClinicaHeader(doc, clinica, titulo);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    const periodo =
      rel.convenio_nome != null
        ? `Período: ${formatDataBr(rel.de)} a ${formatDataBr(rel.ate)} · ${rel.convenio_nome}`
        : `Período: ${formatDataBr(rel.de)} a ${formatDataBr(rel.ate)} · Todos os convênios`;
    doc.fontSize(9).font("Helvetica").text(periodo, left, doc.y, { width, align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .text(
        `${rel.qtd_contas} conta(s) · Total ${formatBRL(rel.total_liquido_centavos)}`,
        left,
        doc.y,
        { width, align: "center" },
      );
    doc.moveDown(0.8);

    if (rel.grupos.length === 0) {
      doc.fontSize(10).text("Nenhum atendimento de convênio no período.", left, doc.y);
    }

    for (const grupo of rel.grupos) {
      ensureSpace(doc, 60);
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1a2b42")
        .text(
          `${grupo.convenio_nome} — ${grupo.contas.length} conta(s) · ${formatBRL(grupo.total_liquido_centavos)}`,
          left,
          doc.y,
        );
      doc.moveDown(0.4);
      doc.font("Helvetica").fillColor("#000");

      const rows = grupo.contas.map((c) => {
        const procs =
          c.itens.length > 0
            ? c.itens
                .map(
                  (i) =>
                    `${i.procedimento_nome}${i.quantidade > 1 ? ` x${i.quantidade}` : ""}`,
                )
                .join("; ")
            : "—";
        const guia = [c.numero_guia, c.senha].filter(Boolean).join(" / ") || "—";
        const hora = c.agendamento_hora?.trim()
          ? c.agendamento_hora.trim().slice(0, 5)
          : "Avulso";
        return [
          formatDataBr(c.data),
          hora,
          c.paciente_nome,
          procs.length > 36 ? `${procs.slice(0, 34)}…` : procs,
          guia.length > 18 ? `${guia.slice(0, 16)}…` : guia,
          STATUS_LABEL[c.status] ?? c.status,
          formatBRL(c.total_liquido_centavos),
        ];
      });

      drawTable(
        doc,
        "",
        ["Data", "Hora", "Paciente", "Procedimentos", "Guia", "Status", "Valor"],
        rows,
        [
          width * 0.1,
          width * 0.08,
          width * 0.18,
          width * 0.24,
          width * 0.12,
          width * 0.12,
          width * 0.16,
        ],
      );
      doc.moveDown(0.4);
    }

    doc
      .fontSize(7)
      .fillColor("#6b7c92")
      .text(
        `Emitido em ${new Date().toLocaleString("pt-BR")} · MedPronto`,
        left,
        doc.page.height - doc.page.margins.bottom - 12,
        { width, align: "center" },
      );
  });
}

export function gerarPdfRelatorioCobranca(
  rel: CobrancaRelatorio,
  clinica: ClinicaCtx,
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    drawClinicaHeader(doc, clinica, "Relatório de cobrança");
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    doc
      .fontSize(9)
      .font("Helvetica")
      .text(
        `Período: ${formatDataBr(rel.de)} a ${formatDataBr(rel.ate)}`,
        left,
        doc.y,
        { width, align: "center" },
      );
    doc.moveDown(0.8);

    const resumoY = doc.y;
    const boxW = (width - 12) / 2;
    const boxH = 44;
    const resumos = [
      { label: "Particular recebido", valor: formatBRL(rel.resumo.arrecadado_centavos) },
      { label: "Convênio recebido", valor: formatBRL(rel.resumo.recebido_convenio_centavos) },
      { label: "Convênio a faturar", valor: formatBRL(rel.resumo.a_faturar_centavos) },
      { label: "Contas no período", valor: String(rel.resumo.contas_periodo) },
      { label: "Contas fechadas", valor: String(rel.resumo.contas_fechadas) },
    ];
    resumos.forEach((r, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = left + col * (boxW + 12);
      const y = resumoY + row * (boxH + 8);
      doc.roundedRect(x, y, boxW, boxH, 4).fillAndStroke("#f4f7fb", "#94a8c4");
      doc.fillColor("#4a5f78").fontSize(8).text(r.label, x + 8, y + 8, { width: boxW - 16 });
      doc.fillColor("#0f3d1f").fontSize(11).font("Helvetica-Bold").text(r.valor, x + 8, y + 22, {
        width: boxW - 16,
      });
    });
    doc.font("Helvetica");
    doc.y = resumoY + 2 * (boxH + 8) + 8;

    if (rel.por_forma.length > 0) {
      drawTable(
        doc,
        "Por forma de pagamento",
        ["Forma", "Valor"],
        rel.por_forma.map((f) => [
          FORMA_LABEL[f.forma] ?? f.forma,
          formatBRL(f.valor_centavos),
        ]),
        [width * 0.55, width * 0.45],
      );
    }

    if (rel.por_convenio.length > 0) {
      drawTable(
        doc,
        "Por convênio",
        ["Convênio", "Contas", "Total itens", "Recebido", "A faturar"],
        rel.por_convenio.map((c) => [
          c.convenio_nome,
          String(c.atendimentos),
          formatBRL(c.total_itens_centavos),
          formatBRL(c.arrecadado_centavos),
          formatBRL(c.a_faturar_centavos),
        ]),
        [width * 0.28, width * 0.1, width * 0.2, width * 0.2, width * 0.22],
      );
    }

    if (rel.por_procedimento.length > 0) {
      drawTable(
        doc,
        "Por procedimento",
        ["Procedimento", "Qtd", "Valor"],
        rel.por_procedimento.map((p) => [
          p.procedimento_nome,
          String(p.quantidade),
          formatBRL(p.valor_centavos),
        ]),
        [width * 0.55, width * 0.12, width * 0.33],
      );
    }

    doc
      .fontSize(7)
      .fillColor("#6b7c92")
      .text(
        `Emitido em ${new Date().toLocaleString("pt-BR")} · MedPronto`,
        left,
        doc.page.height - doc.page.margins.bottom - 12,
        { width, align: "center" },
      );
  });
}
