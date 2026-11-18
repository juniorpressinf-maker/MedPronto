import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  FileClock,
  FolderOpen,
  LayoutDashboard,
  Mic,
  Settings,
  Stethoscope,
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

/** Menu principal: cada item com `path` abre a rotina direto. Cadastros e Configurações usam `children`. */
export const navigation: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  {
    label: "Sala de espera",
    path: "/medico/fila",
    icon: Stethoscope,
    modulo: ["fila_medico", "fila_recepcao"],
  },
  {
    label: "Laudos pendentes",
    path: "/medico/laudos-pendentes",
    icon: FileClock,
    modulo: ["fila_medico", "fila_recepcao", "exames_anexos"],
  },
  {
    label: "Transcrição de voz",
    path: "/medico/transcricao-piloto",
    icon: Mic,
    badge: "piloto",
    modulo: ["prontuario_escrever", "fila_medico"],
  },
  {
    label: "Agenda",
    path: "/agenda",
    icon: Calendar,
    modulo: ["agenda", "fila_recepcao"],
  },
  {
    label: "Cobrança",
    path: "/cobranca",
    icon: Wallet,
    modulo: "cobranca",
  },
  {
    label: "Cadastros",
    icon: FolderOpen,
    children: [
      { label: "Pacientes", path: "/pacientes", modulo: "pacientes" },
      { label: "Médicos", path: "/medicos", modulo: ["usuarios", "clinica"] },
      {
        label: "Medicamentos/Exames",
        path: "/cadastros/medicamentos-exames",
        modulo: ["fichas_config", "fichas_medico"],
      },
    ],
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
