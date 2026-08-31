import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgendaCalendarioMes } from "../components/AgendaCalendarioMes";
import { AgendaMesMedicosCard } from "../components/AgendaMesMedicosCard";
import { PageHeader } from "../components/PageHeader";
import { VoltarButton } from "../components/VoltarButton";
import { intervaloGradeMes, segundaIsoDaSemana, tituloMesPt, tituloSemanaPt } from "../lib/agendaCalendario";
import {
  addMesIso,
  agendaDiaPath,
  agendaMesPath,
  hojeIso,
  isMesIso,
  lerMedicoIdAgenda,
  lerSemanaAgenda,
  lerVoltarAgenda,
  mesAtualIso,
} from "../lib/agendaNav";
import {
  peekAgendaFormDraft,
  peekAgendaPrefill,
} from "../lib/agendaPrefill";
import { ApiError, api, type MedicoRow } from "../lib/api";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { useMessageBox } from "../lib/messageBoxContext";
import "../agenda-folha.css";

export function AgendaMesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { branding } = useClinicaBranding();
  const msg = useMessageBox();
  const hoje = hojeIso();

  const mesParam = searchParams.get("mes") ?? "";
  const mes = isMesIso(mesParam) ? mesParam : mesAtualIso();
  const medicoId = lerMedicoIdAgenda(searchParams);
  const voltarInicio = lerVoltarAgenda(searchParams, "/");
  const semanaBruta = lerSemanaAgenda(searchParams);
  const semanaFiltro = semanaBruta ? segundaIsoDaSemana(semanaBruta) : "";
  const { de, ate } = useMemo(() => intervaloGradeMes(mes), [mes]);

  const qMes = useCallback(
    (extra: { medicoId?: number | ""; semana?: string | null } = {}) => ({
      medicoId: extra.medicoId !== undefined ? extra.medicoId : medicoId,
      voltar: voltarInicio === "/" ? null : voltarInicio,
      semana: extra.semana !== undefined ? extra.semana : semanaFiltro || null,
    }),
    [medicoId, semanaFiltro, voltarInicio],
  );

  const [medicos, setMedicos] = useState<MedicoRow[]>([]);
  const [porData, setPorData] = useState<
    Record<string, { total: number; ativos: number }>
  >({});
  const [porMedico, setPorMedico] = useState<
    {
      medico_id: number;
      medico_nome: string;
      agendamentos: number;
      pacientes: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const draft = peekAgendaFormDraft();
    if (draft?.data) {
      navigate(
        agendaDiaPath(draft.data, {
          medicoId,
          voltar: agendaMesPath(mesDeDraftOuAtual(draft.data), { medicoId }),
        }),
        { replace: true },
      );
      return;
    }
    const prefill = peekAgendaPrefill();
    if (prefill) {
      navigate(
        agendaDiaPath(hoje, {
          medicoId,
          voltar: agendaMesPath(mes, { medicoId }),
        }),
        { replace: true },
      );
    }
  }, [hoje, medicoId, mes, navigate]);

  const irMes = useCallback(
    (proximo: string) => {
      navigate(agendaMesPath(proximo, qMes({ semana: null })));
    },
    [navigate, qMes],
  );

  const irDia = useCallback(
    (iso: string) => {
      navigate(
        agendaDiaPath(iso, {
          medicoId,
          voltar: agendaMesPath(mes, qMes()),
        }),
      );
    },
    [medicoId, mes, navigate, qMes],
  );

  const alternarSemana = useCallback(
    (segunda: string) => {
      const proxima = semanaFiltro === segunda ? null : segunda;
      navigate(agendaMesPath(mes, qMes({ semana: proxima })), { replace: true });
    },
    [mes, navigate, qMes, semanaFiltro],
  );

  const carregar = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const r = await api.agendamentosResumo(
          de,
          ate,
          medicoId ? Number(medicoId) : undefined,
          mes,
          semanaFiltro || undefined,
        );
        const map: Record<string, { total: number; ativos: number }> = {};
        for (const d of r.dias) {
          map[d.data] = { total: Number(d.total), ativos: Number(d.ativos) };
        }
        setPorData(map);
        setPorMedico(
          (r.medicos ?? []).map((row) => ({
            medico_id: Number(row.medico_id),
            medico_nome: String(row.medico_nome ?? ""),
            agendamentos: Number(row.agendamentos) || 0,
            pacientes: Number(row.pacientes) || 0,
          })),
        );
      } catch (e) {
        if (!opts?.silent) {
          void msg.error(e instanceof ApiError ? e.message : "Erro na agenda");
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [ate, de, medicoId, mes, msg, semanaFiltro],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const t = window.setInterval(() => void carregar({ silent: true }), 8000);
    return () => window.clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    void api.medicosList().then(setMedicos).catch(() => undefined);
  }, []);

  const linhasMedico = useMemo(() => {
    const byId = new Map(porMedico.map((m) => [String(Number(m.medico_id)), m]));
    const linhas = medicos.map((m) => {
      const r = byId.get(String(Number(m.id)));
      return {
        medico_id: Number(m.id),
        medico_nome: m.nome,
        pacientes: r?.pacientes ?? 0,
        agendamentos: r?.agendamentos ?? 0,
      };
    });
    for (const r of porMedico) {
      if (!linhas.some((x) => String(x.medico_id) === String(r.medico_id))) {
        linhas.push({
          ...r,
          medico_id: Number(r.medico_id),
        });
      }
    }
    linhas.sort(
      (a, b) =>
        b.pacientes - a.pacientes ||
        a.medico_nome.localeCompare(b.medico_nome, "pt"),
    );
    return linhas.filter(
      (m) => Number(m.agendamentos) > 0 || Number(m.pacientes) > 0,
    );
  }, [medicos, porMedico]);

  const totalMes = Object.entries(porData).reduce((acc, [iso, v]) => {
    return iso.startsWith(mes) ? acc + v.ativos : acc;
  }, 0);

  return (
    <div className="page-stack flex-1 min-h-0 overflow-hidden">
      <PageHeader
        title="Agenda"
        subtitle="Escolha o dia — depois volta para este mês"
        actions={
          <div className="form-actions form-actions--toolbar">
            <VoltarButton
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(voltarInicio)}
            >
              {voltarInicio === "/" ? "Voltar ao início" : "Voltar"}
            </VoltarButton>
            <div className="form-actions__direita">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => irDia(hoje)}
            >
              Abrir hoje
            </button>
            </div>
          </div>
        }
      />
      <div className="page-stack flex-1 min-h-0 overflow-auto p-4">
      <div className="agenda-mes-layout">
        <div className="est-card est-card--page p-0 overflow-hidden agenda-mes-layout__folha">
          <div className="agenda-folha-wrap">
            <div className="agenda-folha-livro">
              <div className="agenda-folha agenda-folha--mes">
                <div className="agenda-folha__furos" aria-hidden="true">
                  <span className="agenda-folha__furo" />
                  <span className="agenda-folha__furo" />
                  <span className="agenda-folha__furo" />
                </div>
                <header className="agenda-folha__topo">
                  <div className="agenda-folha__topo-esq">
                    {branding?.logo ? (
                      <img
                        src={branding.logo}
                        alt=""
                        className="agenda-folha__logo"
                      />
                    ) : null}
                    <div>
                      <h2 className="agenda-folha__titulo">Agenda do mês</h2>
                      <p className="agenda-folha__subtitulo">
                        {branding?.nome ?? "Consultório"}
                      </p>
                    </div>
                  </div>
                  <div className="agenda-folha__data-caixa">
                    <div className="agenda-folha__data-linha">
                      <span>Mês</span>
                      <span className="agenda-folha__data-valor">
                        {tituloMesPt(mes)}
                      </span>
                    </div>
                    <div className="agenda-folha__data-linha">
                      <span>Marcações</span>
                      <span className="agenda-folha__data-valor">
                        {loading ? "…" : totalMes}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="agenda-folha__filtros agenda-mes__nav">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => irMes(addMesIso(mes, -1))}
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft size={18} aria-hidden />
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => irMes(mesAtualIso())}
                    disabled={mes === mesAtualIso()}
                  >
                    Mês atual
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => irMes(addMesIso(mes, 1))}
                    aria-label="Próximo mês"
                  >
                    Próximo
                    <ChevronRight size={18} aria-hidden />
                  </button>
                  <label className="agenda-dia-field agenda-dia-campo">
                    <span className="text-sm font-medium">Médico</span>
                    <select
                      className="legacy-input"
                      value={medicoId}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : "";
                        navigate(
                          agendaMesPath(mes, qMes({ medicoId: v })),
                          { replace: true },
                        );
                      }}
                    >
                      <option value="">Todos</option>
                      {medicos.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.crm ? `${m.nome} — ${m.crm}` : m.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="agenda-mes__legenda">
                  Marcador à esquerda: filtra os totais da semana. Desmarque para
                  voltar ao mês. Clique no dia abre a folha.
                </p>

                <AgendaCalendarioMes
                  mes={mes}
                  hoje={hoje}
                  semanaFiltro={semanaFiltro}
                  porData={porData}
                  onEscolherDia={irDia}
                  onAlternarSemana={alternarSemana}
                />
              </div>
            </div>
          </div>
        </div>
        <AgendaMesMedicosCard
          titulo={semanaFiltro ? "Totais da semana" : "Totais do mês"}
          subtitulo={semanaFiltro ? tituloSemanaPt(semanaFiltro) : tituloMesPt(mes)}
          loading={loading}
          medicos={linhasMedico}
          medicoFiltro={medicoId}
          onEscolherMedico={(id) => {
            navigate(agendaMesPath(mes, qMes({ medicoId: id })), { replace: true });
          }}
        />
      </div>
      </div>
    </div>
  );
}

function mesDeDraftOuAtual(data: string): string {
  return data.slice(0, 7);
}
