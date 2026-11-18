import { Router } from "express";
import { requireAuth, requireModulo } from "../auth/middleware.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { logAcesso } from "../services/logAcesso.js";

/**
 * PILOTO transcrição de voz — apoio para usar o microfone em outro PC da rede.
 *
 * O Chrome/Edge só liberam o microfone em https ou localhost. Abrindo o MedPronto
 * por http://IP-do-servidor:3021, o microfone fica bloqueado. Esta rota gera um
 * .bat que grava (uma vez, como administrador) duas políticas oficiais do
 * Chrome e do Edge para o endereço do MedPronto:
 *   - OverrideSecurityRestrictionsOnInsecureOrigin → trata o endereço como seguro
 *   - AudioCaptureAllowedUrls → microfone liberado sem perguntar
 */
export const transcricaoRouter = Router();

transcricaoRouter.use(requireAuth(), requireModulo("prontuario_escrever", "fila_medico"));

/** Só aceita http://host[:porta] simples — o valor vai dentro do script. */
const ORIGEM_RE = /^http:\/\/[A-Za-z0-9.-]{1,253}(:\d{1,5})?$/;

function scriptPowerShell(origem: string): string {
  return `
$ErrorActionPreference = 'Stop'
$origem = '${origem}'
$chaves = @(
  'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome\\OverrideSecurityRestrictionsOnInsecureOrigin',
  'HKLM:\\SOFTWARE\\Policies\\Google\\Chrome\\AudioCaptureAllowedUrls',
  'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\OverrideSecurityRestrictionsOnInsecureOrigin',
  'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\AudioCaptureAllowedUrls'
)
foreach ($k in $chaves) {
  if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }
  $item = Get-Item -LiteralPath $k
  $nomes = @($item.GetValueNames())
  $valores = @($nomes | ForEach-Object { [string]$item.GetValue($_) })
  if ($valores -contains $origem) { Write-Host ('  ja estava liberado: ' + $k); continue }
  $i = 1
  while ($nomes -contains [string]$i) { $i++ }
  New-ItemProperty -LiteralPath $k -Name ([string]$i) -Value $origem -PropertyType String -Force | Out-Null
  Write-Host ('  liberado: ' + $k)
}
`.trim();
}

/** PowerShell -EncodedCommand espera UTF-16LE em base64 (evita qualquer problema de aspas no .bat). */
function codificarParaPowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function montarBat(origem: string): string {
  const cmd = codificarParaPowerShell(scriptPowerShell(origem));
  const linhas = [
    "@echo off",
    "title MedPronto - Liberar microfone",
    "net session >nul 2>&1",
    "if %errorlevel% neq 0 (",
    "  echo Pedindo permissao de administrador...",
    "  powershell -NoProfile -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\"",
    "  exit /b",
    ")",
    "echo.",
    "echo ==============================================",
    "echo   MEDPRONTO - LIBERAR MICROFONE NESTE COMPUTADOR",
    "echo ==============================================",
    "echo.",
    `echo   Endereco: ${origem}`,
    "echo.",
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${cmd}`,
    "if %errorlevel% neq 0 (",
    "  echo.",
    "  echo   NAO FOI POSSIVEL GRAVAR A CONFIGURACAO.",
    "  echo   Chame o suporte do MedPronto.",
    "  echo.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "echo   PRONTO! Agora FECHE TODAS as janelas do Chrome e do Edge",
    "echo   e abra o MedPronto de novo. O microfone vai funcionar.",
    "echo.",
    "pause",
  ];
  // .bat precisa de CRLF
  return linhas.join("\r\n") + "\r\n";
}

transcricaoRouter.get(
  "/liberar-microfone.bat",
  asyncHandler(async (req, res) => {
    const doNavegador = String(req.query.origem ?? "").trim().replace(/\/+$/, "");
    const doServidor = `http://${req.get("host") ?? ""}`;
    const origem = ORIGEM_RE.test(doNavegador) ? doNavegador : doServidor;
    if (!ORIGEM_RE.test(origem)) {
      res.status(400).json({ error: "Endereço do MedPronto inválido para liberar o microfone." });
      return;
    }
    logAcesso({
      usuarioId: req.usuario!.id,
      acao: "transcricao_liberar_microfone",
      detalhe: `origem=${origem}`,
    });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="liberar-microfone-medpronto.bat"');
    res.send(montarBat(origem));
  }),
);
