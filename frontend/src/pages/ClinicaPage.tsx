import { Building2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ClinicaForm,
  type ClinicaFormData,
} from "../components/ClinicaForm";
import { PageHeader } from "../components/PageHeader";
import { ApiError, api } from "../lib/api";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";
import { useMessageBox } from "../lib/messageBoxContext";

function rowToForm(r: {
  nome: string;
  cnpj_cpf: string | null;
  telefone: string | null;
  endereco: string | null;
  email: string | null;
  logo: string | null;
}): ClinicaFormData {
  return {
    nome: String(r.nome ?? "").trim().toUpperCase(),
    cnpj_cpf: String(r.cnpj_cpf ?? "").trim(),
    telefone: String(r.telefone ?? "").trim(),
    endereco: String(r.endereco ?? "").trim(),
    email: String(r.email ?? "").trim(),
    email_senha: "",
    logo: String(r.logo ?? "").trim(),
  };
}

export function ClinicaPage() {
  const msg = useMessageBox();
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshBranding } = useClinicaBranding();
  const [initial, setInitial] = useState<ClinicaFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setInitial(null);
    try {
      const row = await api.clinicaGet();
      if (!row) {
        navigate("/clinica/setup", { replace: true });
        return;
      }
      setInitial(rowToForm(row));
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [navigate, msg]);

  useEffect(() => {
    void carregar();
  }, [carregar, location.pathname]);

  const save = async (data: ClinicaFormData) => {
    setSaving(true);
    try {
      await api.clinicaUpdate({
        email: data.email.trim(),
        email_senha: data.email_senha || undefined,
        logo: data.logo,
        telefone: data.telefone.trim() || undefined,
        endereco: data.endereco.trim() || undefined,
      });
      await refreshBranding();
      const row = await api.clinicaGet();
      if (row) setInitial(rowToForm(row));
      void msg.success("Dados da clínica atualizados.");
    } catch (e) {
      void msg.error(e instanceof ApiError ? e.message : "Erro ao gravar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <PageHeader
        title="Clínica"
        subtitle="Nome, CNPJ/CPF, contato, e-mail e logomarca"
      />
      <div className="page-body clinica-page overflow-auto">
        <section className="cfg-card cfg-card--empresa clinica-page__card">
          <div className="cfg-card__head cfg-card__head--compact">
            <Building2 className="cfg-card__icon" />
            <h3 className="cfg-card__title">Dados da clínica</h3>
          </div>
          <div className="cfg-card__body cfg-card__body--empresa">
            {loading ? (
              <p className="cfg-muted">Carregando…</p>
            ) : !initial ? (
              <p className="cfg-muted">
                Não foi possível carregar os dados da clínica.
              </p>
            ) : (
              <ClinicaForm
                key={initial.nome}
                mode="edit"
                initial={initial}
                saving={saving}
                onSubmit={save}
                onBack={() => navigate("/")}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
