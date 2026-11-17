# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

MedPronto — sistema de consultório médico (agenda, fila, prontuário, receituário, ASO/admissional, cobrança, WhatsApp, chat interno). App local Windows: Node 22 LTS portátil em `.\node\`, SQLite (`better-sqlite3`), backend Express servindo o `frontend/dist` em produção na porta **3021**. Código, comentários, nomes e UI em **português**.

Infra (auth, backup, instalador, launcher) foi portada de `d:\agenda` — ver `docs/REGRAS_INFRA.md`. `d:\agenda` é só referência de leitura para visual; não copiar módulos de negócio sem autorização. Não trocar `better-sqlite3` nem simplificar a infra portada.

## Comandos

Usar o Node portátil: `$env:PATH = "d:\MedPronto\node;$env:PATH"` (a partir de `d:\MedPronto`).

- `npm run dev` — API (tsx, :3021) + Vite (:5176, proxy `/api` → 3021)
- `npm run build -w frontend` / `npm run build -w backend` — build individual (`tsc` → `backend/dist`; `tsc -b && vite build` → `frontend/dist`)
- `npm run db:migrate` — roda migrações a partir de `backend/dist/db/migrate.js` (exige backend compilado). A API também migra no boot.
- Testes: scripts de aceite avulsos em `backend/scripts/test-*.ts`, um por script npm: `npm run test:u13 -w backend`; todos: `npm run test:todos -w backend`. Não há runner (jest/vitest) nem lint. Os testes rodam numa **cópia** de `data/medpronto.db` (`scripts/lib/rodarEmCopia.ts`, uma cópia por teste, apagada no fim). Rodar `tsx scripts/test-*.ts` direto é bloqueado por `scripts/lib/exigirCopia.ts` (primeiro import de cada teste que grava). Teste novo: começar com `import "./lib/exigirCopia.js";` e registrar no `package.json` via `rodarEmCopia.ts` — ou usar `prepararBancoCopia` (`scripts/lib/bancoCopia.ts`) como `test-b1`.
- `npm run preparar-teste` — cria consulta de demonstração para hoje.
- Listas de medicamentos/exames (busca na receita/pedido): `backend/recursos/*.json`, geradas por `backend/scripts/gerar-catalogos.ts` (ANVISA + TUSS) e carregadas no boot. Arquivo que precisa ir ao cliente NUNCA fica numa pasta `data` (o empacotador exclui toda pasta com esse nome).

## Ver mudanças (regra do `.cursor/rules`)

O usuário final só para/abre o atalho (`iniciar.vbs` recompila se o fonte for mais novo que `dist`) ou dá Ctrl+F5. Nunca pedir a ele para rodar npm/terminal. Após alterar `frontend/` ou `backend/`, é necessário recompilar o workspace afetado — mas, pela regra global do usuário, **perguntar antes** de rodar build.

## Arquitetura

**Backend (`backend/src`, ESM, imports com `.js`)**
- `index.ts` aplica restauração de backup pendente *antes* de abrir o banco, depois importa `main.ts`.
- `main.ts`: roda migrações, garante usuários padrão (`medico`/`secretaria`) e modelo ASO, inicia cron e cliente WhatsApp (Baileys), monta `/api` (`routes/index.ts`) e serve o frontend.
- Camadas: `routes/*` (Express routers, validação com zod) → `services/*` (regra de negócio, SQL síncrono via `getDb()`). Erros via `middleware/asyncHandler` + `errorHandler`.
- Restore de backup encerra o processo com **exit code 42**; o launcher reinicia.
- `config.ts`: caminhos do `.env` são relativos à raiz do projeto. Licença bloqueia só com `ENFORCE_LICENSE=true`.

**Auth / permissões**
- Sessão por cookie HMAC `medpronto_sid`, senhas scrypt (`auth/`).
- Permissões por **módulo**: lista `MODULOS` em `backend/src/auth/modulos.ts`. Rotas usam `requireAuth()` + `requireModulo("...")`. Ao criar módulo novo, atualizar também `frontend/src/lib/permissoes.ts`, `permissoesDefaults.ts` e `modulo` em `frontend/src/config/navigation.ts`.

**Banco / migrações**
- `database/NNN_*.sql`, aplicadas em ordem alfabética e registradas em `schema_migrations` (pelo nome do arquivo). Há prefixos numéricos repetidos (ex.: `011_*`, `012_*`, `013_*`) — o nome inteiro é a chave.
- `ALTER TABLE ... ADD COLUMN` é tornado idempotente automaticamente; o resto do SQL não. Nunca editar migração já aplicada — criar nova.
- Integridade é reforçada por triggers SQL (ver `docs/INTEGRIDADE_VINCULOS.md`).

**Frontend (`frontend/src`)** — React 19 + React Router 7 + Tailwind 4 + lucide.
- `lib/api.ts` é o cliente HTTP único (`/api`, `credentials: include`, `ApiError`).
- Contextos: `authContext`, `clinicaBrandingContext`, `messageBoxContext`. Guards: `AuthGuard`, `LicenseGate`, `ModuloGuard`.
- Menu em `config/navigation.ts`. CSS específicos para documentos impressos (`prontuario-papel.css`, `ficha-folha.css`, `admissional-aso.css`, `agenda-folha.css`).

## Documentação de domínio

`docs/` tem a especificação de cada módulo — ler antes de mexer: `MODULO_COBRANCA.md`, `MODULO_ADMISSIONAL.md`, `MODULO_ASO_MODELOS.md`, `MODULO_FICHAS_CLINICAS.md`, `PLANO_UNIFICACAO_ATENDIMENTO.md`, `INTEGRIDADE_VINCULOS.md`, `Plano_MedPronto_v2.md`. Os códigos dos testes (`m*`, `u*`, `a5`, `c*`...) referenciam etapas desses planos.

## Distribuição

`Empacotar Instalador.bat` gera `MedPronto-instalacao-completa.exe` e `MedPronto-atualizacao.exe`. Scripts PowerShell do launcher/instalador ficam em `scripts/`. Primeiro acesso: `/setup` (admin) → `/clinica/setup`.
