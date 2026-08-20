# RH_Eletropasso

Sistema de gestão de RH da **Eletropasso** — ponto (PrintPoint / WatchComm), espelho de ponto, escalas, férias, folha/eSocial, diretório e organização — empacotado como **PWA** (desktop + celular).

Fork operacional do [OpenHR](https://www.openhrapp.com/), adaptado para uso interno da loja (marca Eletropasso, pt-BR por padrão, integração com relógio DIMEP PrintPoint III).

**Repositório:** [github.com/luizeduapagnussatti-lgtm/RH_eletropasso](https://github.com/luizeduapagnussatti-lgtm/RH_eletropasso)

---

## O que este sistema faz

| Área | Capacidade |
|------|------------|
| **Ponto** | Hub de ponto, batidas via relógio físico (WatchComm TCP) + espelho mensal com revisão/assinatura |
| **Relógio PrintPoint** | Console em Comunicação → Relógio de Ponto: sync de batidas, supervisores, diagnóstico, empregados, data/hora, feriados, configs e auditoria |
| **Escalas** | Escalas de trabalho, trocas sábado/feriado, visão “minha escala” |
| **Folha** | Consolidação, exportação API, workflow contábil, pendências de batida |
| **eSocial** | Cadastro empregador, rubricas, eventos (ver `docs/`) |
| **Colaboradores** | Admissão/desligamento, PIS × Credencial do relógio, e-mail de login editável |
| **RH clássico** | Férias, avaliações, comunicados, diretório, organização, relatórios |
| **Mobile** | PWA instalável; atalho LAN (`scripts/lan-client/`) |

Idioma padrão da UI: **pt-BR** (`openhr_lang` no localStorage). Strings via `react-i18next`.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite, PWA |
| Backend | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| Relógio | DIMEP PrintPoint III — protocolo WatchComm (agente Windows) |
| Sync batidas | `services/dmprep-sync` + Edge `dmprep-sync` / `ingest-punches` / `clock-command` / `clock-supervisors` |
| Deploy típico | Windows (loja) + Vite preview + Supabase Cloud |

---

## Branches Git (obrigatório)

| Branch | Papel |
|--------|--------|
| `main` | Baseline original — **não** usar no dia a dia |
| `master` | Versão **estável** / referência de deploy |
| `dev` | Desenvolvimento — **único** lugar de commit e push diário |

Fluxo: trabalhar em `dev` → commit + `git push origin dev` → promover para `master` só quando validado.

---

## Papéis (RBAC)

| Papel | Uso típico Eletropasso |
|-------|-------------------------|
| **ADMIN** | Configuração do sistema, Comunicação/relógio, settings sensíveis |
| **HR** | Operação diária: ponto, escalas, cartões, colaboradores, folha |
| **MANAGER / TEAM_LEAD** | Equipe (aprovação, visão limitada) |
| **EMPLOYEE** | Próprios dados (ponto, férias, escala) |
| **MANAGEMENT** | Diretoria — **não** entra em batida/folha de ponto (mesmo critério de ADMIN/HR) |
| **SUPER_ADMIN** | Plataforma multi-org (raro no uso diário) |

**Nota:** perfis ADMIN / HR / MANAGEMENT **não** devem bater ponto nem aparecer como pendência de folha. A “Credencial” do relógio é independente do **PIS** (campo `clock_credential` vs `pis_pasep`).

---

## Arquitetura (visão)

```
React PWA (Vite :3000)
    │
    ▼
hrService / domain services → Supabase SDK
    │
    ▼
Supabase Cloud
├── PostgreSQL + RLS (migrations 0001–0036)
├── Auth + Storage
└── Edge Functions (register, create-employee, clock-*, dmprep-sync, payroll-export, crons, …)
    │
    ▼
Windows (loja)
├── dmprep-sync (Node) — coleta WatchComm + scopes HTTP
├── watchcomm-poller (opcional / legado)
└── PrintPoint III (TCP WatchComm)
```

Roteamento: **state-based** (`currentPath` em `App.tsx`), sem React Router.

---

## Início rápido (desenvolvimento)

### Pré-requisitos

- Node.js 18+ / npm 9+
- Conta Supabase (ou instância self-hosted)
- Supabase CLI: `npm install -g supabase`

### 1. Clone e dependências

```bash
git clone https://github.com/luizeduapagnussatti-lgtm/RH_eletropasso.git
cd RH_eletropasso
git checkout dev
npm install
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `VITE_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sim | Chave `anon` pública |
| `VITE_VAPID_PUBLIC_KEY` | Não | Push no navegador |
| `VITE_LAN_SHARE_URL` | Não | Link LAN exibido no login (ex.: `https://rh.eletropasso.local`) |

### 3. Migrations

```bash
supabase link --project-ref <seu-project-ref>
supabase db push
```

Há **36** migrations em `supabase/migrations/` (schema OpenHR + PTRP/ponto + folha/eSocial + relógio). Lista oficial: `supabase/migrations/manifest.json`.

No Windows da loja também existe `scripts/Apply-SupabaseMigrations.ps1`.

### 4. Edge Functions (principais)

Além das funções OpenHR (register, create-employee, crons, etc.), este projeto inclui:

| Função | Uso |
|--------|-----|
| `dmprep-sync` | Proxy autenticado para o agente de sync / WatchComm |
| `ingest-punches` | Ingestão de batidas |
| `clock-supervisors` | CRUD + sync de supervisores do relógio |
| `clock-command` | Console de comandos WatchComm (diagnóstico, empregados, data/hora, configs) |
| `payroll-export` | Exportação de folha (API key por org) |
| `update-employee-access` | Atualiza e-mail de login / senha (admin) |

Deploy exemplo:

```bash
supabase functions deploy dmprep-sync
supabase functions deploy ingest-punches
supabase functions deploy clock-supervisors
supabase functions deploy clock-command
supabase functions deploy payroll-export
supabase functions deploy update-employee-access
# … demais funções em supabase/functions/
```

Secrets típicos: `CRON_SECRET`, e os usados pelo sync/relógio (ver READMEs em `services/dmprep-sync` e `supabase/functions/ingest-punches`).

### 5. App

```bash
npm run dev
```

Abre em `http://localhost:3000`.

**Produção local (loja):** `scripts/start-rh.ps1` sobe build + preview (porta 3000) e serviços auxiliares conforme autostart.

---

## Relógio de ponto (PrintPoint / WatchComm)

### Console na UI

**Comunicação → Relógio de Ponto** (papel ADMIN):

1. Sync de batidas  
2. Supervisores (cadastro RH + envio/limpeza no equipamento)  
3. Diagnóstico (status, identidade, empregador, digitais)  
4. Empregados (lista no relógio × RH; envio/remoção)  
5. Data e hora / DST / feriados  
6. Configurações do equipamento (guardas reforçadas)  
7. Auditoria (`clock_command_log`)

Mensagens de display: **não suportadas** neste firmware PrintPoint III (`supported=false`).

### Agente Windows

| Componente | Pasta | Função |
|------------|-------|--------|
| Sync / comandos | `services/dmprep-sync` | HTTP local + Invoke-WatchComm* |
| Poller WatchComm | `scripts/watchcomm-poller` | Coleta MRP + ingest batidas (produção) |
| Cliente LAN | `scripts/lan-client` | Atalho HTTPS na rede da loja |

Documentação detalhada:

- [`docs/watchcomm-printpoint-protocol.md`](docs/watchcomm-printpoint-protocol.md) — protocolo TCP, RSA, `login`/`senha`, erros 1730/1732
- [`services/dmprep-sync/README.md`](services/dmprep-sync/README.md)
- [`scripts/dmprep-agent/README.md`](scripts/dmprep-agent/README.md)
- [`scripts/watchcomm-poller/README.md`](scripts/watchcomm-poller/README.md)
- [`scripts/lan-client/README.md`](scripts/lan-client/README.md)

### Credencial vs PIS

- **PIS/PASEP** — identificação fiscal / espelho / eSocial  
- **Credencial do relógio** (`clock_credential`) — número digitado no PrintPoint (pode diferir do PIS)
- **Nunca reutilizar**: no desligamento a credencial permanece no profile `INACTIVE`; o próximo cadastro usa `MAX(todas) + 1`
- Fila de sync: tabela `hardware_sync_queue` + UI em Comunicação → Fila hardware

Tutoriais RH:

- [`docs/tutoriais/adicionar-colaborador.md`](docs/tutoriais/adicionar-colaborador.md)
- [`docs/tutoriais/desligar-colaborador.md`](docs/tutoriais/desligar-colaborador.md)
- Correção pontual Paulo/Henrique: [`scripts/sql/fix-paulo-henrique-credentials.sql`](scripts/sql/fix-paulo-henrique-credentials.sql)

---

## Módulos de tela (rotas internas)

| `currentPath` | Módulo |
|---------------|--------|
| `dashboard` | Painel |
| `ponto` | Hub de ponto |
| `timesheet` / `my-timesheet` | Espelho de ponto |
| `apuracao` | Apuração (ADMIN/HR) |
| `work-roster` / `my-roster` | Escalas |
| `payroll` | Folha |
| `comunicacao` | Comunicação + console do relógio (ADMIN) |
| `employees` | Diretório / admissão |
| `leave` | Férias |
| `attendance` | Batida (selfie/GPS) quando aplicável |
| `organization` / `settings` | Organização e preferências |
| `performance-review` | Avaliações |
| `reports` | Relatórios |

Guias de ajuda publicados: tutoriais pt-BR em `#/how-to-use` (seed em `scripts/tutorials/`).

---

## Documentação adicional

| Doc | Conteúdo |
|-----|----------|
| [`PRODUCT.md`](PRODUCT.md) | Propósito do produto e princípios |
| [`DESIGN.md`](DESIGN.md) | Tokens / look visual |
| [`Others/CLAUDE.md`](Others/CLAUDE.md) | Arquitetura detalhada, módulos congelados, checklist |
| [`docs/api-payroll-export.md`](docs/api-payroll-export.md) | API de exportação de folha |
| [`docs/esocial-processo-eletropasso.md`](docs/esocial-processo-eletropasso.md) | Processo eSocial |
| [`src/data/changelog.ts`](src/data/changelog.ts) | Histórico de mudanças do produto |

---

## Migrations (resumo Eletropasso)

Além do schema OpenHR (`0001`–`0015`), as migrations locais cobrem:

| Faixa | Tema |
|-------|------|
| `0017`–`0020` | PTRP: turnos, batidas, espelho, banco de horas |
| `0021`–`0023` | Folha, EPI, filas de recálculo |
| `0024`–`0026` | Escalas, perfil relógio, revisão do espelho |
| `0027`–`0032` | eSocial, API keys, workflow contábil, assinatura |
| `0033` | Trocas de escala |
| `0034`–`0035` | Supervisores + auditoria de comandos do relógio |
| `0036` | Credencial do relógio (`clock_credential`) |

---

## Build e scripts úteis

```bash
npm run dev       # desenvolvimento
npm run build     # produção (+ sitemap/feed)
npm run preview   # servir dist/
```

| Script | Uso |
|--------|-----|
| `scripts/start-rh.ps1` | Sobe o RH na máquina da loja |
| `scripts/install-rh-autostart.ps1` | Autostart Windows |
| `scripts/Apply-SupabaseMigrations.ps1` | Aplica migrations |
| `scripts/run-dmprep-sync.ps1` | Auxiliar do sync |

---

## Segurança e módulos congelados

Alguns arquivos de sessão/ponto são **congelados** (regressões históricas). Antes de editá-los, ler a seção *Frozen Modules* em [`Others/CLAUDE.md`](Others/CLAUDE.md) e obter aprovação explícita do plano.

Senhas de supervisores do relógio: criptografia AES no servidor; nunca exibir em claro na UI após salvar.

---

## Licença

Código derivado do OpenHR sob [MIT License](LICENSE). Customizações Eletropasso são uso interno da organização; o repositório remoto pode ser privado conforme política da loja.

---

## Palavras-chave

`RH Eletropasso` · `PrintPoint` · `WatchComm` · `DIMEP` · `espelho de ponto` · `escalas` · `folha` · `eSocial` · `Supabase` · `PWA RH` · `OpenHR fork`
