import { getDb } from "../db/index.js";
import { hojeIsoLocal, isDiaNaoUtil } from "../lib/diasUteis.js";
import { getConfigWhatsApp, processarEnviosAutomaticosDoDia } from "./whatsappService.js";

const HORA_PADRAO = 17;
const INTERVALO_MS = 15 * 60 * 1000;

function ultimoCronDia(): string {
  const row = getDb()
    .prepare(`SELECT valor FROM app_meta WHERE chave = 'whatsapp_cron_ultimo_dia'`)
    .get() as { valor: string } | undefined;
  return String(row?.valor ?? "").trim();
}

function marcarCronHoje(): void {
  getDb()
    .prepare(
      `INSERT INTO app_meta (chave, valor) VALUES ('whatsapp_cron_ultimo_dia', ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    )
    .run(hojeIsoLocal());
}

async function tickCron(): Promise<void> {
  try {
    const cfg = getConfigWhatsApp();
    if (!cfg.ativo) return;

    const hoje = hojeIsoLocal();
    if (isDiaNaoUtil(hoje)) return;

    const horaMeta = getDb()
      .prepare(`SELECT valor FROM app_meta WHERE chave = 'whatsapp_hora_envio'`)
      .get() as { valor: string } | undefined;
    const horaAlvo = horaMeta?.valor ? Number(horaMeta.valor) : HORA_PADRAO;
    const agora = new Date();
    if (agora.getHours() !== horaAlvo) return;
    if (ultimoCronDia() === hoje) return;

    const r = await processarEnviosAutomaticosDoDia(hoje);
    marcarCronHoje();
    if (r.enviados > 0 || r.erros > 0) {
      console.log(
        `[whatsapp-cron] Disparo ${hoje}: ${r.enviados} enviado(s), ${r.erros} erro(s)`,
      );
    }
  } catch (e) {
    console.error("[whatsapp-cron]", e);
  }
}

export function iniciarWhatsAppCron(): void {
  void tickCron();
  setInterval(() => void tickCron(), INTERVALO_MS);
}
