import { LogOut, MessageCircle, QrCode, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import {
  ApiError,
  api,
  type CobrancaProcedimento,
  type WhatsAppConfig,
  type WhatsAppLogRow,
  type WhatsAppPainelStatus,
} from "../lib/api";
import { useAuth } from "../lib/authContext";
import { temModulo } from "../lib/permissoes";
import { useMessageBox } from "../lib/messageBoxContext";

const TEMPLATE_AJUDA =
  "Variáveis: {nome} (primeiro nome), {data}, {hora}, {medico}, {preparo} (cada exame em MAIÚSCULAS, com a orientação e uma linha em branco entre eles). Ex.: Olá {nome}, confirmamos seu procedimento em {data} às {hora} com {medico}. {preparo} Por favor, confirme sua presença respondendo SIM.";

const STATUS_LABEL: Record<string, string> = {
  desconectado: "Desconectado",
  conectando: "Conectando…",
  reconectando: "Reconectando…",
  aguardando_qr: "Aguardando QR Code",
  conectado: "Conectado",
};

export function WhatsAppPage() {
  const msg = useMessageBox();
  const { permissoes } = useAuth();
  const temCadastroProcedimento = temModulo(permissoes, "cobranca_config");
  const [cfg, setCfg] = useState<WhatsAppConfig | null>(null);
  const [wa, setWa] = useState<WhatsAppPainelStatus | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [preparos, setPreparos] = useState<CobrancaProcedimento[]>([]);
  const [preparoDraft, setPreparoDraft] = useState<Record<number, string>>({});
  const [salvandoPreparoId, setSalvandoPreparoId] = useState<number | null>(null);

  const carregarStatus = useCallback(async () => {
    try {
      const st = await api.whatsappStatus();
      setWa(st);
    } catch {
      /* polling silencioso */
    }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const [c, l, st, procs] = await Promise.all([
        api.whatsappConfigGet(),
        api.whatsappLogs(30),
        api.whatsappStatus(),
        temCadastroProcedimento
          ? Promise.resolve([] as CobrancaProcedimento[])
          : api.whatsappPreparosList().catch(() => [] as CobrancaProcedimento[]),
      ]);
      setCfg(c);
      setLogs(l);
      setWa(st);
      setPreparos(procs);
      setPreparoDraft(
        Object.fromEntries(
          procs.map((p) => [p.id, p.orientacoes_paciente ?? ""]),
        ),
      );
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [msg, temCadastroProcedimento]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const id = window.setInterval(() => void carregarStatus(), 2000);
    return () => window.clearInterval(id);
  }, [carregarStatus]);

  const salvar = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      await api.whatsappConfigSave({
        ativo: Boolean(cfg.ativo),
        template_confirmacao: cfg.template_confirmacao ?? "",
        hora_envio_automatico: cfg.hora_envio_automatico ?? 17,
        hora_fixa_ativa: Boolean(cfg.hora_fixa_ativa),
        hora_fixa_mensagem: cfg.hora_fixa_ativa
          ? (cfg.hora_fixa_mensagem?.trim() || "08:00")
          : null,
      });
      void msg.success("Configuração salva.");
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const salvarPreparo = async (id: number) => {
    setSalvandoPreparoId(id);
    try {
      const texto = (preparoDraft[id] ?? "").trim();
      const atualizado = await api.whatsappPreparoSave(id, texto || null);
      setPreparos((lista) =>
        lista.map((p) => (p.id === id ? atualizado : p)),
      );
      setPreparoDraft((d) => ({
        ...d,
        [id]: atualizado.orientacoes_paciente ?? "",
      }));
      void msg.success("Orientações salvas.");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao salvar orientações");
    } finally {
      setSalvandoPreparoId(null);
    }
  };

  const enviarHoje = async () => {
    const ok = await msg.confirm({
      title: "Enviar confirmações?",
      message:
        "Serão enviadas mensagens dos agendamentos cujo dia de disparo é hoje (último dia útil antes do horário — ex.: segunda-feira dispara na sexta anterior).",
      confirmLabel: "Enviar",
    });
    if (!ok) return;
    setEnviandoLote(true);
    try {
      const r = await api.whatsappEnviarHoje();
      if (r.ignorado === "dia_nao_util") {
        void msg.warning("Hoje é fim de semana ou feriado — não há disparo automático.");
        return;
      }
      void msg.success(`${r.enviados} enviado(s), ${r.erros} erro(s).`);
      await carregar();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro no envio");
    } finally {
      setEnviandoLote(false);
    }
  };

  const novoQr = async () => {
    setWaBusy(true);
    try {
      await api.whatsappNovoQr();
      await carregarStatus();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gerar QR");
    } finally {
      setWaBusy(false);
    }
  };

  const logout = async () => {
    const ok = await msg.confirm({
      title: "Sair do WhatsApp?",
      message: "Será necessário escanear o QR Code novamente.",
      confirmLabel: "Sair",
    });
    if (!ok) return;
    setWaBusy(true);
    try {
      await api.whatsappLogout();
      await carregarStatus();
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao sair");
    } finally {
      setWaBusy(false);
    }
  };

  const status = wa?.status ?? "desconectado";

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="WhatsApp"
        subtitle="Conexão local (QR Code) — requer internet no envio"
      />
      <div className="wa-page px-4 pb-4">
        {loading || !cfg ? (
          <p className="cfg-muted p-4">Carregando…</p>
        ) : (
          <>
            <section className="cfg-card">
              <div className="cfg-card__head cfg-card__head--compact">
                <MessageCircle className="cfg-card__icon" />
                <h3 className="cfg-card__title">Conexão</h3>
              </div>
              <div className="cfg-card__body">
                <p className="text-sm mb-3">
                  Status:{" "}
                  <strong>{STATUS_LABEL[status] ?? status}</strong>
                  {status === "conectado" && wa?.me?.id ? (
                    <>
                      {" "}
                      — logado como <code className="text-xs">{wa.me.id}</code>
                    </>
                  ) : null}
                </p>

                {status === "aguardando_qr" && wa?.qrSvg ? (
                  <div className="flex flex-wrap gap-6 items-start">
                    <div
                      className="rounded-lg border border-[var(--border)] bg-white p-2 shrink-0"
                      dangerouslySetInnerHTML={{ __html: wa.qrSvg }}
                    />
                    <div className="min-w-[220px] flex-1 text-sm text-[var(--muted)]">
                      <h4 className="font-semibold text-[var(--text)] m-0 mb-2">
                        Escaneie o QR Code no celular
                      </h4>
                      <ol className="m-0 pl-5 space-y-1 leading-relaxed">
                        <li>Abra o <strong>WhatsApp</strong> no celular</li>
                        <li>Menu (⋮) ou <strong>Configurações</strong></li>
                        <li><strong>Aparelhos conectados</strong></li>
                        <li><strong>Conectar um aparelho</strong></li>
                        <li>Aponte a câmera para o QR ao lado</li>
                      </ol>
                      <p className="text-xs mt-2 mb-0">
                        O QR atualiza sozinho. Ao escanear, o status vira
                        &quot;Conectado&quot;.
                      </p>
                    </div>
                  </div>
                ) : null}

                {status === "aguardando_qr" && !wa?.qrSvg ? (
                  <p className="text-sm text-[var(--muted)]">Gerando QR Code…</p>
                ) : null}

                {status === "conectado" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-green-800 m-0 font-medium">
                      Conectado e pronto para enviar confirmações.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={waBusy}
                      onClick={() => void logout()}
                    >
                      <LogOut className="inline h-4 w-4 mr-1" aria-hidden />
                      Sair (logout)
                    </button>
                  </div>
                ) : null}

                {status === "conectando" || status === "reconectando" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--muted)] m-0">
                      {status === "reconectando"
                        ? "Reconectando ao WhatsApp…"
                        : "Conectando ao WhatsApp…"}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={waBusy}
                      onClick={() => void novoQr()}
                    >
                      <QrCode className="inline h-4 w-4 mr-1" aria-hidden />
                      Gerar novo QR Code
                    </button>
                  </div>
                ) : null}

                {status === "desconectado" ? (
                  <div className="space-y-2">
                    <p className="text-sm text-[var(--muted)] m-0">
                      Não conectado. Gere o QR Code para vincular o número da
                      clínica.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={waBusy}
                      onClick={() => void novoQr()}
                    >
                      <QrCode className="inline h-4 w-4 mr-1" aria-hidden />
                      Gerar QR Code
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="wa-page__row">
            <section className="cfg-card wa-page__confirm">
              <div className="cfg-card__head cfg-card__head--compact">
                <h3 className="cfg-card__title">Confirmação de agendamentos</h3>
              </div>
              <div className="cfg-card__body space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(cfg.ativo)}
                    onChange={(e) =>
                      setCfg((c) =>
                        c ? { ...c, ativo: e.target.checked ? 1 : 0 } : c,
                      )
                    }
                  />
                  Envio automático e manual habilitados (exige WhatsApp conectado)
                </label>
                <label className="block text-sm">
                  <span className="font-medium">
                    Hora do envio automático (dias úteis)
                  </span>
                  <input
                    className="legacy-input mt-1 w-24"
                    type="number"
                    min={0}
                    max={23}
                    value={cfg.hora_envio_automatico ?? 17}
                    onChange={(e) =>
                      setCfg((c) =>
                        c
                          ? {
                              ...c,
                              hora_envio_automatico: Number(e.target.value),
                            }
                          : c,
                      )
                    }
                  />
                  <span className="ml-2 text-[var(--muted)]">h (0–23)</span>
                </label>
                <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(cfg.hora_fixa_ativa)}
                      onChange={(e) =>
                        setCfg((c) =>
                          c
                            ? {
                                ...c,
                                hora_fixa_ativa: e.target.checked ? 1 : 0,
                                hora_fixa_mensagem:
                                  c.hora_fixa_mensagem?.trim() || "08:00",
                              }
                            : c,
                        )
                      }
                    />
                    <span>
                      <strong>Horário fixo na mensagem</strong> — um único horário
                      para todos os médicos. Se a agenda marca 08:00 de manhã e
                      14:00 à tarde, deixe desmarcado para o Zap usar a hora de
                      cada agendamento.
                    </span>
                  </label>
                  {cfg.hora_fixa_ativa ? (
                    <label className="block text-sm pl-6">
                      <span className="font-medium">Horário informado ao paciente</span>
                      <input
                        type="time"
                        className="legacy-input mt-1"
                        value={cfg.hora_fixa_mensagem?.trim() || "08:00"}
                        onChange={(e) =>
                          setCfg((c) =>
                            c
                              ? { ...c, hora_fixa_mensagem: e.target.value }
                              : c,
                          )
                        }
                      />
                      <p className="mt-1 text-xs text-[var(--muted)] mb-0">
                        O placeholder {"{hora}"} usará este valor em todos os envios.
                        Desmarcado: usa o horário de cada agendamento.
                      </p>
                    </label>
                  ) : (
                    <p className="text-xs text-[var(--muted)] m-0 pl-6">
                      Desmarcado: cada mensagem usa o horário cadastrado na agenda.
                    </p>
                  )}
                </div>
                <label className="block text-sm">
                  <span className="font-medium">Mensagem de confirmação</span>
                  <textarea
                    className="legacy-input mt-1 w-full min-h-[5rem]"
                    value={cfg.template_confirmacao ?? ""}
                    onChange={(e) =>
                      setCfg((c) =>
                        c
                          ? { ...c, template_confirmacao: e.target.value }
                          : c,
                      )
                    }
                  />
                  <p className="mt-1 text-xs text-[var(--muted)]">{TEMPLATE_AJUDA}</p>
                </label>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => void salvar()}
                  >
                    {saving ? "Salvando…" : "Salvar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={
                      enviandoLote || !cfg.ativo || status !== "conectado"
                    }
                    onClick={() => void enviarHoje()}
                  >
                    <Send className="inline h-4 w-4 mr-1" aria-hidden />
                    {enviandoLote ? "Enviando…" : "Enviar disparos de hoje"}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)] m-0">
                  Regra: disparo no último dia útil antes da consulta (segunda → sexta
                  anterior; feriados nacionais considerados). O cron automático só roda em
                  dias úteis.
                </p>
              </div>
            </section>

            <section className="cfg-card wa-page__logs">
              <div className="cfg-card__head cfg-card__head--compact">
                <h3 className="cfg-card__title">Últimos envios</h3>
              </div>
              <div className="cfg-card__body wa-page__logs-body">
                {logs.length === 0 ? (
                  <p className="cfg-muted text-sm">Nenhum envio registrado.</p>
                ) : (
                  <table className="legacy-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Paciente</th>
                        <th>Telefone</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap align-top">{l.created_at}</td>
                          <td className="align-top">{l.paciente_nome ?? "—"}</td>
                          <td className="align-top">{l.telefone ?? "—"}</td>
                          <td className="align-top">
                            <span
                              className={
                                l.status === "erro"
                                  ? "text-red-700 font-medium"
                                  : l.status === "enviado"
                                    ? "text-green-800"
                                    : ""
                              }
                            >
                              {l.status}
                            </span>
                            {l.mensagem ? (
                              <pre className="m-0 mt-1 whitespace-pre-wrap text-xs text-[var(--muted)] font-sans max-w-full">
                                {l.mensagem}
                              </pre>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
            </div>

            {temCadastroProcedimento ? (
              <section className="cfg-card">
                <div className="cfg-card__head cfg-card__head--compact">
                  <h3 className="cfg-card__title">Orientações ao paciente</h3>
                </div>
                <div className="cfg-card__body">
                  <p className="text-sm text-[var(--muted)] m-0">
                    O {"{preparo}"} lista cada exame em maiúsculas, com a
                    orientação embaixo e uma linha em branco entre eles (ex.:
                    ENDOSCOPIA = jejum de 12 horas). Cadastre uma vez em{" "}
                    <Link
                      to="/cobranca/procedimentos"
                      className="text-brand-600 underline"
                    >
                      Cobrança → Procedimentos
                    </Link>
                    . Se estiver vazio, some da mensagem.
                  </p>
                </div>
              </section>
            ) : (
              <section className="cfg-card">
                <div className="cfg-card__head cfg-card__head--compact">
                  <h3 className="cfg-card__title">Orientações ao paciente</h3>
                </div>
                <div className="cfg-card__body space-y-3">
                  <p className="text-sm text-[var(--muted)] m-0">
                    Texto de preparo de cada procedimento. No Zap aparece o nome
                    do exame em maiúsculas, o texto e uma linha em branco entre
                    eles. Vazio some da mensagem. ASO também recebe confirmação.
                  </p>
                  {preparos.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] m-0">
                      Nenhum procedimento ativo cadastrado.
                    </p>
                  ) : (
                    preparos.map((p) => (
                      <label key={p.id} className="block text-sm">
                        <span className="font-medium">{p.nome}</span>
                        <textarea
                          className="legacy-input mt-1 w-full min-h-[3.5rem]"
                          placeholder="Ex.: Jejum de 8 horas. Trazer pedido e documento."
                          value={preparoDraft[p.id] ?? ""}
                          onChange={(e) =>
                            setPreparoDraft((d) => ({
                              ...d,
                              [p.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm mt-1"
                          disabled={salvandoPreparoId === p.id}
                          onClick={() => void salvarPreparo(p.id)}
                        >
                          {salvandoPreparoId === p.id ? "Salvando…" : "Salvar"}
                        </button>
                      </label>
                    ))
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
