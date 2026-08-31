import type { Request } from "express";
import { PDFDocument } from "pdf-lib";
import { usuarioTemModulo, type Modulo } from "../auth/modulos.js";
import type { Perfil } from "../auth/users.js";
import { getDb } from "../db/index.js";
import {
  gerarPdfAtestado,
  gerarPdfConsulta,
  gerarPdfPedidoExame,
  gerarPdfReceita,
} from "./documentPdf.js";
import {
  enriquecerProntuarioFicha,
  FichaProntuarioError,
  prepararCamposConsultaPdf,
} from "./fichaProntuario.js";
import { isConsultaEncerrada } from "./consultaEncerrada.js";
import { getDocumentoContext } from "./prontuarioAccess.js";

export type DocumentoLoteTipo =
  | "consulta"
  | "receita"
  | "atestado"
  | "pedido_exame";

const LABEL: Record<DocumentoLoteTipo, string> = {
  consulta: "Consulta",
  receita: "Receita",
  atestado: "Atestado",
  pedido_exame: "Pedido de exame",
};

function ctxFromRow(row: NonNullable<ReturnType<typeof getDocumentoContext>>) {
  return {
    clinica_nome: row.clinica_nome ?? "Consultório",
    clinica_telefone: row.clinica_telefone,
    clinica_endereco: row.clinica_endereco,
    clinica_logo: row.clinica_logo,
    medico_nome: row.medico_nome,
    medico_crm: row.medico_crm,
    paciente_nome: row.paciente_nome,
    paciente_nasc: row.paciente_nasc,
    paciente_cpf: row.paciente_cpf,
    data_emissao: row.data_atendimento,
  };
}

function pode(req: Request, ...modulos: Modulo[]): boolean {
  const u = req.usuario!;
  const perfil = u.perfil as Perfil;
  return modulos.some((m) => usuarioTemModulo(u.id, perfil, m));
}

function loadReceita(prontuarioId: number) {
  const receita = getDb()
    .prepare(`SELECT * FROM receitas WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
    .get(prontuarioId) as { id: number; observacoes: string | null } | undefined;
  if (!receita) return null;
  const itens = getDb()
    .prepare(`SELECT * FROM receita_itens WHERE receita_id = ? ORDER BY id`)
    .all(receita.id);
  if (!itens.length) return null;
  return { receita, itens };
}

async function pdfConsulta(prontuarioId: number): Promise<Buffer | null> {
  const row = getDb()
    .prepare(
      `SELECT pr.id, pr.agendamento_id, pr.retificacao_de_id, pr.retificacao_finalizada,
              pr.ficha_template_id, pr.template_snapshot_json, pr.dados_json,
              pr.queixa_principal, pr.anamnese, pr.exame_fisico, pr.hipotese_diagnostica,
              pr.cid_codigo, pr.cid_descricao, pr.conduta, pr.plano,
              pr.retorno_dias, pr.retorno_ate
       FROM prontuarios pr WHERE pr.id = ?`,
    )
    .get(prontuarioId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const consulta_encerrada = isConsultaEncerrada({
    agendamento_id: row.agendamento_id as number | null,
    retificacao_de_id: row.retificacao_de_id as number | null,
    retificacao_finalizada: row.retificacao_finalizada as number | boolean | null,
  });

  let ficha;
  try {
    ficha = enriquecerProntuarioFicha({
      ...(row as Parameters<typeof enriquecerProntuarioFicha>[0]),
      consulta_encerrada,
    });
  } catch (e) {
    if (e instanceof FichaProntuarioError) return null;
    throw e;
  }

  const camposPdf = prepararCamposConsultaPdf(
    ficha.ficha_campos,
    ficha.dados,
    row.retorno_ate as string | null | undefined,
  );
  if (camposPdf.length === 0) return null;

  const ctxRow = getDocumentoContext(prontuarioId);
  if (!ctxRow) return null;

  return gerarPdfConsulta(
    ctxFromRow(ctxRow),
    ficha.ficha_titulo_documento,
    camposPdf,
  );
}

async function pdfReceita(prontuarioId: number): Promise<Buffer | null> {
  const row = getDocumentoContext(prontuarioId);
  if (!row) return null;
  const loaded = loadReceita(prontuarioId);
  if (!loaded) return null;
  return gerarPdfReceita(
    ctxFromRow(row),
    loaded.itens as {
      medicamento: string;
      dosagem?: string | null;
      via?: string | null;
      posologia?: string | null;
      quantidade?: string | null;
      duracao_dias?: number | null;
    }[],
    loaded.receita.observacoes,
  );
}

async function pdfAtestado(prontuarioId: number): Promise<Buffer | null> {
  const row = getDocumentoContext(prontuarioId);
  if (!row) return null;
  const atestado = getDb()
    .prepare(`SELECT * FROM atestados WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
    .get(prontuarioId) as
    | {
        dias_afastamento: number | null;
        cid_codigo: string | null;
        cid_descricao: string | null;
        texto_livre: string | null;
      }
    | undefined;
  if (!atestado) return null;
  return gerarPdfAtestado(ctxFromRow(row), atestado);
}

async function pdfPedidoExame(prontuarioId: number): Promise<Buffer | null> {
  const row = getDocumentoContext(prontuarioId);
  if (!row) return null;
  const pedido = getDb()
    .prepare(`SELECT * FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`)
    .get(prontuarioId) as
    | { exames_solicitados: string; observacoes: string | null }
    | undefined;
  if (!pedido?.exames_solicitados?.trim()) return null;
  return gerarPdfPedidoExame(
    ctxFromRow(row),
    pedido.exames_solicitados,
    pedido.observacoes,
  );
}

async function temConsultaPdf(prontuarioId: number): Promise<boolean> {
  const row = getDb()
    .prepare(
      `SELECT pr.agendamento_id, pr.retificacao_de_id, pr.retificacao_finalizada,
              pr.ficha_template_id, pr.template_snapshot_json, pr.dados_json,
              pr.queixa_principal, pr.anamnese, pr.exame_fisico, pr.hipotese_diagnostica,
              pr.cid_codigo, pr.cid_descricao, pr.conduta, pr.plano,
              pr.retorno_dias, pr.retorno_ate
       FROM prontuarios pr WHERE pr.id = ?`,
    )
    .get(prontuarioId) as Record<string, unknown> | undefined;
  if (!row) return false;

  const consulta_encerrada = isConsultaEncerrada({
    agendamento_id: row.agendamento_id as number | null,
    retificacao_de_id: row.retificacao_de_id as number | null,
    retificacao_finalizada: row.retificacao_finalizada as number | boolean | null,
  });

  try {
    const ficha = enriquecerProntuarioFicha({
      ...(row as Parameters<typeof enriquecerProntuarioFicha>[0]),
      consulta_encerrada,
    });
    return (
      prepararCamposConsultaPdf(
        ficha.ficha_campos,
        ficha.dados,
        row.retorno_ate as string | null | undefined,
      ).length > 0
    );
  } catch (e) {
    if (e instanceof FichaProntuarioError) return false;
    throw e;
  }
}

function temReceitaPdf(prontuarioId: number): boolean {
  return loadReceita(prontuarioId) != null;
}

function temAtestadoPdf(prontuarioId: number): boolean {
  return Boolean(
    getDb()
      .prepare(`SELECT 1 FROM atestados WHERE prontuario_id = ? LIMIT 1`)
      .get(prontuarioId),
  );
}

function temPedidoPdf(prontuarioId: number): boolean {
  const pedido = getDb()
    .prepare(
      `SELECT exames_solicitados FROM pedidos_exame WHERE prontuario_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(prontuarioId) as { exames_solicitados: string } | undefined;
  return Boolean(pedido?.exames_solicitados?.trim());
}

export async function listarDocumentosLote(
  prontuarioId: number,
  req: Request,
): Promise<{ tipo: DocumentoLoteTipo; label: string }[]> {
  const ordem: DocumentoLoteTipo[] = [
    "consulta",
    "receita",
    "atestado",
    "pedido_exame",
  ];
  const out: { tipo: DocumentoLoteTipo; label: string }[] = [];

  for (const tipo of ordem) {
    if (tipo === "consulta" && !pode(req, "prontuario_ler", "prontuario_escrever")) {
      continue;
    }
    if (tipo === "receita" && !pode(req, "receituario", "prontuario_ler")) continue;
    if (
      (tipo === "atestado" || tipo === "pedido_exame") &&
      !pode(req, "documentos", "prontuario_ler")
    ) {
      continue;
    }

    const ok =
      tipo === "consulta"
        ? await temConsultaPdf(prontuarioId)
        : tipo === "receita"
          ? temReceitaPdf(prontuarioId)
          : tipo === "atestado"
            ? temAtestadoPdf(prontuarioId)
            : temPedidoPdf(prontuarioId);

    if (ok) {
      out.push({ tipo, label: LABEL[tipo] });
    }
  }

  return out;
}

export async function mesclarPdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const indices = doc.getPageIndices();
    const pages = await merged.copyPages(doc, indices);
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return Buffer.from(await merged.save());
}

export async function gerarDocumentosLotePdf(
  prontuarioId: number,
  req: Request,
): Promise<{ pdf: Buffer; incluidos: DocumentoLoteTipo[] }> {
  const disponiveis = await listarDocumentosLote(prontuarioId, req);
  if (!disponiveis.length) {
    throw new Error("Nenhum documento disponível para impressão em lote");
  }

  const buffers: Buffer[] = [];
  const incluidos: DocumentoLoteTipo[] = [];

  for (const { tipo } of disponiveis) {
    let buf: Buffer | null = null;
    if (tipo === "consulta") buf = await pdfConsulta(prontuarioId);
    if (tipo === "receita") buf = await pdfReceita(prontuarioId);
    if (tipo === "atestado") buf = await pdfAtestado(prontuarioId);
    if (tipo === "pedido_exame") buf = await pdfPedidoExame(prontuarioId);
    if (buf) {
      buffers.push(buf);
      incluidos.push(tipo);
    }
  }

  if (!buffers.length) {
    throw new Error("Nenhum documento disponível para impressão em lote");
  }

  const pdf = await mesclarPdfs(buffers);
  return { pdf, incluidos };
}
