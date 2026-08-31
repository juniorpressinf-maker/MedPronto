import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  LayoutDashboard,
  Settings,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  label: string;
  path?: string;
  icon?: LucideIcon;
  badge?: string;
  modulo?: string | string[];
  children?: NavItem[];
};

/** Menu principal: cada item com `path` abre a rotina direto. Só Configurações usa `children`. */
export const navigation: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  {
    label: "Sala de espera",
    path: "/medico/fila",
    icon: Stethoscope,
    modulo: ["fila_medico", "fila_recepcao"],
  },
  {
    label: "Agenda",
    path: "/agenda",
    icon: Calendar,
    modulo: ["agenda", "fila_recepcao"],
  },
  {
    label: "Pacientes",
    path: "/pacientes",
    icon: Users,
    modulo: "pacientes",
  },
  {
    label: "Cobrança",
    path: "/cobranca",
    icon: Wallet,
    modulo: "cobranca",
  },
  {
    label: "Médicos",
    path: "/medicos",
    icon: UserRound,
    modulo: ["usuarios", "clinica"],
  },
  {
    label: "Configurações",
    icon: Settings,
    children: [
      {
        label: "Clínica",
        path: "/configuracoes/clinica",
        modulo: "clinica",
      },
      {
        label: "Usuários",
        path: "/configuracoes/usuarios",
        modulo: "usuarios",
      },
      {
        label: "Auditoria",
        path: "/configuracoes/auditoria",
        modulo: "usuarios",
      },
      {
        label: "Backup",
        path: "/configuracoes/backup",
        modulo: "backup",
      },
      {
        label: "Fichas clínicas",
        path: "/configuracoes/fichas",
        modulo: ["fichas_config", "fichas_medico"],
      },
      {
        label: "Modelos ASO",
        path: "/configuracoes/modelos-aso",
        modulo: ["fichas_config", "fichas_medico"],
      },
      {
        label: "Acesso remoto",
        path: "/configuracoes/remoto",
        modulo: "remoto",
      },
      {
        label: "Licença",
        path: "/configuracoes/licenca",
        modulo: "licenca",
      },
      {
        label: "WhatsApp",
        path: "/configuracoes/whatsapp",
        modulo: "whatsapp",
      },
    ],
  },
];

export const PLACEHOLDER_ROUTES: Record<string, string> = {};
