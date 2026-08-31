# MedPronto — Spec para TestSprite (Frontend)

Sistema de consultório médico: agenda, prontuário e receituário.

## Ambiente local

- **URL app:** `http://127.0.0.1:3021` (API + frontend na mesma porta)
- **Login:** `http://127.0.0.1:3021/login`
- Conta de teste: usuário `admin` / senha `123456`
- (Outras contas demo, se existirem: médico `medico`/`medico123`, secretaria `secretaria`/`sec123`)

## Escopo smoke (prioridade)

1. Login com `admin` / `123456`
2. Dashboard / início após login
3. Agenda — listar / abrir tela de agenda
4. Pacientes — cadastro ou busca
5. Atendimento / fila (se disponível no perfil médico)
6. Configurações — abrir sem erro

## Não testar

- Impressora física
- Backup/restauração destrutiva
- Integrações externas de e-mail reais
- Empacotador / instalador Windows

## Idioma

UI em português (Brasil). Auth por cookie de sessão (não Bearer).
