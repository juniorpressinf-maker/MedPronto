import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { applyBrowserBranding } from "./browserBranding";

export type ClinicaBranding = {
  nome: string;
  cnpj_cpf: string;
  logo: string | null;
  configured: boolean;
};

type Ctx = {
  branding: ClinicaBranding;
  loading: boolean;
  refreshBranding: () => Promise<void>;
};

const empty: ClinicaBranding = {
  nome: "",
  cnpj_cpf: "",
  logo: null,
  configured: false,
};

const ClinicaBrandingContext = createContext<Ctx | null>(null);

export function ClinicaBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ClinicaBranding>(empty);
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const b = await api.clinicaBranding();
      setBranding(b);
    } catch {
      setBranding(empty);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  useEffect(() => {
    if (!loading) applyBrowserBranding(branding);
  }, [branding, loading]);

  return (
    <ClinicaBrandingContext.Provider value={{ branding, loading, refreshBranding }}>
      {children}
    </ClinicaBrandingContext.Provider>
  );
}

export function useClinicaBranding() {
  const ctx = useContext(ClinicaBrandingContext);
  if (!ctx) throw new Error("useClinicaBranding fora do provider");
  return ctx;
}
