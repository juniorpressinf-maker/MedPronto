#!/usr/bin/env node
/** Gera contra-senha de prorrogação (uso único) para uma máquina. */
import { gerarContraSenhaLicenca } from "../backend/dist/licenca.js";

const fp = process.argv[2];
const dias = process.argv[3] ?? "7";

if (!fp) {
  console.error("Uso: node scripts/gerar-contra-senha.mjs <fingerprint> [dias]");
  process.exit(1);
}

try {
  const codigo = gerarContraSenhaLicenca(fp, dias);
  console.log(codigo);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
