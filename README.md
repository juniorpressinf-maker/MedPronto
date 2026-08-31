# MedPronto

Sistema de consultório médico — agenda de pacientes, prontuário e receituário.

- **Plano:** [docs/Plano_MedPronto_v2.md](docs/Plano_MedPronto_v2.md)
- **Infra (Agenda):** [docs/REGRAS_INFRA.md](docs/REGRAS_INFRA.md)

## Visual

Tema e componentes de UI seguem **`d:\agenda`** (leitura).  
Infraestrutura (auth, backup, instalador) foi **portada** do Agenda conforme `REGRAS_INFRA.md`.

## Desenvolvimento

Requer **Node 22 LTS** (use `d:\agenda\node` ou `scripts\baixar-node-portatil.ps1`):

```powershell
$env:PATH = "d:\agenda\node;$env:PATH"
cd d:\MedPronto
npm install
npm run db:migrate
npm run dev
```

- Frontend: http://localhost:5176  
- API: http://localhost:3021  

## Produção / cliente (Windows)

1. **`Empacotar Instalador.bat`** — gera `MedPronto-instalacao-completa.exe` (computador novo) e `MedPronto-atualizacao.exe` (clínica que já usa o sistema)
2. Cliente baixa o EXE e executa — confirma a pasta **antes** de copiar arquivos
3. Atalho **MedPronto** → `iniciar.vbs` → navegador em modo app na porta **3021**

## Primeiro acesso

1. `/setup` — criar administrador  
2. `/clinica/setup` — dados da clínica + e-mail (recuperação de senha)  
3. O sistema cria automaticamente:
   - **Médico** — login `medico`, senha `medico123` (altere em Config → Usuários)
   - **Secretaria** — login `secretaria`, senha `sec123`
4. Login normal — use o perfil adequado (médico para atendimento, secretaria para agenda)

Para uma consulta de demonstração hoje: `preparar-teste.bat`  

## Backup

Configurações → Backup — ZIP com `medpronto.db` + pasta `uploads/`.  
Restauração reinicia a API (código de saída 42), igual ao Agenda.

## Fase atual

**Fase 0** — estrutura + infra portada do Agenda + CID-10 + preview prontuário papel.  
**Fase 1** — agenda, fila e atendimento clínico.
