# Regras de uso do `d:\agenda` no MedPronto

## Escrita (portar / implementar)

O projeto **`d:\agenda`** é referência **obrigatória** apenas para estas áreas de infraestrutura:

| Área | O que portar |
|------|----------------|
| **Atalhos / launcher** | `iniciar.ps1`, `iniciar.vbs`, `criar_atalho.ps1`, `open_medpronto_browser.ps1` |
| **Empacotar instalador** | `Empacotar Instalador.bat`, `empacotar-instalador.ps1`, `scripts/empacotar-lib.ps1`, `baixar-node-portatil.ps1` |
| **Atualizar** | Rebuild em `Ensure-Build`; Mac: scripts `atualizar-*` (quando necessário) |
| **Senhas / auth** | scrypt, cookie HMAC, recuperação com senha de desbloqueio |
| **Primeira instalação** | `/setup` → admin; `/clinica/setup` → clínica + e-mail |
| **Backup / restore** | ZIP SQLite + uploads; exit code 42; restore no boot |

**Não simplificar** com atalhos (ex.: trocar `better-sqlite3` por outro driver sem motivo).  
Runtime oficial: **Node 22 LTS portátil** em `.\node\` (igual Agenda).

**Build automático:** ao abrir pelo atalho (`iniciar.vbs`), o launcher compila frontend/backend se o código-fonte for mais recente que `frontend/dist` ou `backend/dist` — não é preciso rodar `npm run build` manualmente.

## Ver mudanças após alteração no código

**Quem usa o sistema (Gervasio):** depois de qualquer mudança feita pelo agente, basta **uma** destas opções:

1. **Parar** o MedPronto (`parar.bat` / atalho parar) e **abrir de novo** (`iniciar.vbs`), ou  
2. **Ctrl+F5** no navegador (recarregar forçado).

Nada mais — sem terminal, sem `npm run build`, sem comandos manuais.

**Quem altera o código (agente):** ao terminar mudanças em `frontend/` ou `backend/`, **recompilar** antes de encerrar (`npm run build -w frontend` e/ou backend, com Node em `.\node\`). Assim o usuário só precisa parar/abrir ou Ctrl+F5.

## Leitura (sem gravar cópia)

Para **telas, cores, tabelas, buscas e menu** clínicos: usar `d:\agenda` só como **leitura** de padrão visual, sem copiar módulos de negócio (despesas, etc.), **salvo autorização explícita**.

## Mapeamento Agenda → MedPronto

| Agenda | MedPronto |
|--------|-----------|
| Porta API `3020` | `3021` |
| Vite dev `5175` | `5176` |
| `agenda.db` | `medpronto.db` |
| `empresa` | `clinica` |
| `/empresa/setup` | `/clinica/setup` |
| Cookie `agenda_sid` | `medpronto_sid` |
| Licença `AGENDA-` | `MEDPRONTO-` |
| Backup `auth/` (WhatsApp) | `uploads/` (exames) |

## Arquivos já portados (Fase 0 infra)

### Backend
- `backend/src/auth/*`
- `backend/src/utils/backup.ts`
- `backend/src/licenca.ts`
- `backend/src/routes/auth.ts`, `clinica.ts`, `backup.ts`, `licenca.ts`
- `database/002_infra_agenda.sql`

### Frontend
- Login, Setup, ClinicaSetup, RecuperarSenha, Backup, Licenca
- AuthGuard, LicenseGate, authContext, clinicaBranding

### Scripts (raiz e `scripts/`)
- **`MedPronto-instalacao-completa.exe`** / **`MedPronto-atualizacao.exe`** — gerados pelo Empacotar (assistente Inno com barra de progresso; fluxo offline, sem ZIP)  
- `instalar.bat`, `iniciar.ps1`, `parar.bat`, `Empacotar Instalador.bat` / `empacotar-instalador.ps1`
- `reset-acesso.mjs`, `zerar-base.mjs`

## Desenvolvimento local

```powershell
# Usar Node 22 do Agenda ou baixar com scripts\baixar-node-portatil.ps1
$env:PATH = "d:\agenda\node;$env:PATH"
cd d:\MedPronto
npm run dev
```

Produção / cliente: atalho → `iniciar.vbs` → API na porta **3021**.
