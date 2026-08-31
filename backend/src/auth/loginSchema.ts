import { z } from "zod";

const LOGIN_MSG =
  "O login não pode ser um e-mail. Use um nome de usuário (ex.: admin).";

/** Login de acesso ao MedPronto — nunca um endereço de e-mail. */
export const loginSchema = z
  .string()
  .trim()
  .min(3, "Login deve ter no mínimo 3 caracteres.")
  .max(30, "Login deve ter no máximo 30 caracteres.")
  .transform((s) => s.toLowerCase())
  .refine((s) => !s.includes("@"), LOGIN_MSG)
  .refine((s) => /^[a-z][a-z0-9._-]*$/.test(s), LOGIN_MSG);

export function loginPareceEmail(valor: string): boolean {
  return valor.trim().includes("@");
}
