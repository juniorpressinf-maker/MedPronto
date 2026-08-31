import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { Layout } from "./components/Layout";
import { LicenseGate } from "./components/LicenseGate";
import { ModuloGuard } from "./components/ModuloGuard";
import { PageFocus } from "./components/PageFocus";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ClinicaBrandingProvider } from "./lib/clinicaBrandingContext";
import { MessageBoxProvider } from "./lib/messageBoxContext";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { AdmissionalFormPage } from "./pages/AdmissionalFormPage";
import { AgendaPage } from "./pages/AgendaPage";
import { AtendimentoPage } from "./pages/AtendimentoPage";
import { BackupPage } from "./pages/BackupPage";
import { ClinicaPage } from "./pages/ClinicaPage";
import { ClinicaSetupPage } from "./pages/ClinicaSetupPage";
import { FichasClinicasPage } from "./pages/FichasClinicasPage";
import { FilaMedicoPage } from "./pages/FilaMedicoPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LicencaPage } from "./pages/LicencaPage";
import { LoginPage } from "./pages/LoginPage";
import { MedicosPage } from "./pages/MedicosPage";
import { PacientesPage } from "./pages/PacientesPage";
import { RecuperarSenhaPage } from "./pages/RecuperarSenhaPage";
import { RemotoPage } from "./pages/RemotoPage";
import { WhatsAppPage } from "./pages/WhatsAppPage";
import { CobrancaLayout } from "./pages/cobranca/CobrancaLayout";
import { CobrancaHomePage } from "./pages/cobranca/CobrancaHomePage";
import { CobrancaConveniosPage } from "./pages/cobranca/CobrancaConveniosPage";
import { CobrancaProcedimentosPage } from "./pages/cobranca/CobrancaProcedimentosPage";
import { CobrancaCaixaPage } from "./pages/cobranca/CobrancaCaixaPage";
import { CobrancaContasPage } from "./pages/cobranca/CobrancaContasPage";
import { CobrancaContaPage } from "./pages/cobranca/CobrancaContaPage";
import { CobrancaPrecosPage } from "./pages/cobranca/CobrancaPrecosPage";
import { CobrancaReceberConveniosPage } from "./pages/cobranca/CobrancaReceberConveniosPage";
import { CobrancaRelatoriosPage } from "./pages/cobranca/CobrancaRelatoriosPage";
import { SetupPage } from "./pages/SetupPage";
import { UsuariosPage } from "./pages/UsuariosPage";

function AppRoutes() {
  const { setupNeeded, me, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="text-[var(--muted)]">Carregando…</div>
      </div>
    );
  }

  return (
    <>
      <PageFocus />
      <Routes>
      <Route path="/licenca" element={<LicencaPage standalone />} />
      <Route
        path="/setup"
        element={setupNeeded ? <SetupPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/login/recuperar-senha"
        element={
          setupNeeded ? (
            <Navigate to="/setup" replace />
          ) : (
            <RecuperarSenhaPage />
          )
        }
      />
      <Route
        path="/login"
        element={
          setupNeeded ? (
            <Navigate to="/setup" replace />
          ) : !me ? (
            <LoginPage />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/clinica/setup"
        element={
          <AuthGuard>
            <ClinicaSetupPage />
          </AuthGuard>
        }
      />
      <Route
        path="/"
        element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="medico/fila"
          element={
            <ModuloGuard modulo={["fila_medico", "fila_recepcao"]}>
              <FilaMedicoPage />
            </ModuloGuard>
          }
        />
        <Route
          path="medico/atendimento/:id"
          element={
            <ModuloGuard modulo={["prontuario_escrever", "prontuario_ler", "fila_medico"]}>
              <AtendimentoPage />
            </ModuloGuard>
          }
        />
        <Route
          path="agenda"
          element={
            <ModuloGuard modulo={["agenda", "fila_recepcao"]}>
              <AgendaPage />
            </ModuloGuard>
          }
        />
        <Route
          path="pacientes"
          element={
            <ModuloGuard modulo="pacientes">
              <PacientesPage />
            </ModuloGuard>
          }
        />
        <Route
          path="admissional"
          element={<Navigate to="/agenda" replace />}
        />
        <Route
          path="admissional/:id"
          element={
            <ModuloGuard modulo={["admissional", "admissional_agenda"]}>
              <AdmissionalFormPage />
            </ModuloGuard>
          }
        />
        <Route
          path="medicos"
          element={
            <ModuloGuard modulo={["usuarios", "clinica"]}>
              <MedicosPage />
            </ModuloGuard>
          }
        />
        <Route
          path="cobranca"
          element={
            <ModuloGuard modulo="cobranca">
              <CobrancaLayout />
            </ModuloGuard>
          }
        >
          <Route index element={<CobrancaHomePage />} />
          <Route path="contas" element={<CobrancaContasPage />} />
          <Route path="caixa" element={<CobrancaCaixaPage />} />
          <Route
            path="receber-convenios"
            element={
              <ModuloGuard modulo="cobranca_relatorios">
                <CobrancaReceberConveniosPage />
              </ModuloGuard>
            }
          />
          <Route
            path="relatorios"
            element={
              <ModuloGuard modulo="cobranca_relatorios">
                <CobrancaRelatoriosPage />
              </ModuloGuard>
            }
          />
          <Route path="contas/:id" element={<CobrancaContaPage />} />
          <Route
            path="convenios"
            element={
              <ModuloGuard modulo="cobranca_config">
                <CobrancaConveniosPage />
              </ModuloGuard>
            }
          />
          <Route
            path="procedimentos"
            element={
              <ModuloGuard modulo="cobranca_config">
                <CobrancaProcedimentosPage />
              </ModuloGuard>
            }
          />
          <Route
            path="precos"
            element={
              <ModuloGuard modulo="cobranca_config">
                <CobrancaPrecosPage />
              </ModuloGuard>
            }
          />
        </Route>
        <Route
          path="configuracoes/clinica"
          element={
            <ModuloGuard modulo="clinica">
              <ClinicaPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/usuarios"
          element={
            <ModuloGuard modulo="usuarios">
              <UsuariosPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/auditoria"
          element={
            <ModuloGuard modulo="usuarios">
              <AuditoriaPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/backup"
          element={
            <ModuloGuard modulo="backup">
              <BackupPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/fichas"
          element={
            <ModuloGuard modulo={["fichas_config", "fichas_medico"]}>
              <FichasClinicasPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/modelos-aso"
          element={
            <ModuloGuard modulo={["fichas_config", "fichas_medico"]}>
              <FichasClinicasPage destino="aso" />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/remoto"
          element={
            <ModuloGuard modulo="remoto">
              <RemotoPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/licenca"
          element={
            <ModuloGuard modulo="licenca">
              <LicencaPage />
            </ModuloGuard>
          }
        />
        <Route
          path="configuracoes/whatsapp"
          element={
            <ModuloGuard modulo="whatsapp">
              <WhatsAppPage />
            </ModuloGuard>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MessageBoxProvider>
        <ClinicaBrandingProvider>
          <LicenseGate>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </LicenseGate>
        </ClinicaBrandingProvider>
      </MessageBoxProvider>
    </BrowserRouter>
  );
}
