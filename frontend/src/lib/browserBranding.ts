import type { ClinicaBranding } from "./clinicaBrandingContext";

function faviconType(href: string): string {
  if (href.startsWith("data:image/svg")) return "image/svg+xml";
  if (href.startsWith("data:image/jpeg") || href.startsWith("data:image/jpg")) {
    return "image/jpeg";
  }
  if (href.startsWith("data:image/webp")) return "image/webp";
  if (href.startsWith("data:image/gif")) return "image/gif";
  return "image/png";
}

export function applyBrowserBranding(branding: ClinicaBranding): void {
  const nome = branding.nome.trim();
  document.title = nome || "MedPronto";

  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }

  if (branding.logo?.trim()) {
    link.href = branding.logo.trim();
    link.type = faviconType(link.href);
  } else {
    link.href = "/favicon.svg";
    link.type = "image/svg+xml";
  }
}
