import { Stethoscope } from "lucide-react";
import { useClinicaBranding } from "../lib/clinicaBrandingContext";

type Props = {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  /** Menu lateral: linha 1 = MedPronto, linha 2 = nome da clínica. */
  stackProgramAndClinic?: boolean;
  tone?: "dark" | "light";
};

export function ClinicaBrandMark({
  size = "md",
  showSubtitle = true,
  stackProgramAndClinic = false,
  tone = "dark",
}: Props) {
  const { branding } = useClinicaBranding();
  const nomeClinica = branding.nome.trim();
  const nome = nomeClinica || "MedPronto";
  const sub = branding.configured ? "Clínica" : "Consultório médico";

  const box =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const img =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  const title = size === "lg" ? "text-2xl" : "text-sm";
  const subtitle = size === "lg" ? "text-sm" : "text-xs";

  const titleCls =
    tone === "light"
      ? `${title} font-bold text-[var(--text)] truncate`
      : `${title} font-bold text-white truncate leading-tight`;
  const subCls =
    tone === "light"
      ? `${subtitle} text-[var(--muted)] truncate`
      : `${subtitle} text-[var(--nav-text)] opacity-80 truncate`;

  return (
    <div
      className={`flex min-w-0 gap-2${
        stackProgramAndClinic ? " items-start app-brand-stack" : " items-center"
      }`}
    >
      {branding.logo ? (
        <img
          src={branding.logo}
          alt=""
          className={`${img} shrink-0 rounded-lg object-contain bg-white shadow-sm`}
        />
      ) : (
        <div
          className={`flex ${box} shrink-0 items-center justify-center rounded-lg bg-[var(--nav-active)] text-white shadow-sm`}
        >
          <Stethoscope className={size === "lg" ? "h-8 w-8" : "h-5 w-5"} />
        </div>
      )}
      <div className="min-w-0">
        {stackProgramAndClinic ? (
          <>
            <h1 className={titleCls}>MedPronto</h1>
            <p className={subCls}>
              {nomeClinica || "Consultório médico"}
            </p>
          </>
        ) : (
          <>
            <h1 className={titleCls}>{nome}</h1>
            {showSubtitle && <p className={subCls}>{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}
