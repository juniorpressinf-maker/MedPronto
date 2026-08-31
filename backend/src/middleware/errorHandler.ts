import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    const flat = err.flatten().fieldErrors as Record<string, string[] | undefined>;
    const issue = err.issues[0];
    res.status(400).json({
      error: issue?.message ?? "Dados inválidos",
      details: flat,
    });
    return;
  }

  const sqliteErr = err as { code?: string; message?: string };
  if (sqliteErr.code === "SQLITE_CONSTRAINT_UNIQUE") {
    res.status(409).json({ error: "Registro já cadastrado" });
    return;
  }
  if (sqliteErr.message?.includes("Não misture consulta e ASO")) {
    res.status(400).json({
      error: "Não misture consulta e ASO no mesmo horário",
    });
    return;
  }
  if (sqliteErr.message?.includes("item de conta que não está em aberto")) {
    res.status(400).json({
      error: "Não é permitido alterar item de conta que não está em aberto",
    });
    return;
  }
  if (sqliteErr.message?.includes("no column named")) {
    res.status(500).json({
      error:
        "Banco de dados desatualizado. Feche e abra o MedPronto de novo para aplicar a atualização.",
    });
    return;
  }

  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 600) {
    res.status(status).json({ error: (err as Error).message ?? "Erro" });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: sqliteErr.message ?? "Erro interno do servidor",
  });
}
