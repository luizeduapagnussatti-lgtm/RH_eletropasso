# Tutorial: Desligar colaborador

## Pré-requisitos

- Papel: **ADMIN** ou **HR**
- Data de demissão (último dia trabalhado, inclusive)
- Relógio online **quando for confirmar a exclusão** (pode ser depois do desligamento no RH)

## Passo a passo

### 1. Abrir o desligamento

Escolha um atalho:

- **Cartões** → ícone de excluir no card
- Ficha do colaborador → **Encerrar contrato**
- **Espelho** → Ajustar dia → **Encerrar contrato**

### 2. Checklist operacional (recomendado antes)

- [ ] Digital excluída no PrintPoint (ou planejada na fila)
- [ ] Crachá / uniformes / materiais devolvidos
- [ ] Acerto financeiro iniciado

### 3. Confirmar no sistema

1. Informe a **data de demissão**
2. Se a pessoa bate ponto, complete o checklist da tela
3. Clique em **Confirmar desligamento**

### 4. O que acontece no RH (imediato)

- Status → **INACTIVE**
- `termination_date` gravada
- **Credencial preservada** (não zera — evita reuso)
- `clock_discharge_status` → **PENDING_HARDWARE** (se batia ponto)
- E-mail corporativo liberado para outro colaborador
- Espelho fechado até a data de demissão
- Job `REMOVE_EMPLOYEE` na fila `hardware_sync_queue`

### 5. Finalizar no relógio

1. Na própria tela de desligamento, use a **fila de sincronização**, **ou**
2. Menu → **Comunicação** → aba **Fila hardware** / **Sincronização**
3. Clique em **Tentar agora** no comando de remoção (ou **Já removi no relógio** se já excluiu pela função 92)
4. Quando confirmar: `clock_discharge_status` → **HARDWARE_CONFIRMED**
5. A tela mostra **Desligamento finalizado** — só então use **Concluir desligamento**

Se o relógio estiver offline, o RH já está desligado; finalize a exclusão quando o equipamento voltar.

### 6. Espelho e acesso após demissão

- Ciência do **gestor** até o último dia continua obrigatória
- O colaborador **não** assina o espelho no app (nem bloco presencial no PDF) — entrega física no acerto
- Login no PWA é **revogado** (`INACTIVE` + conta desativada)
- Credencial do crachá **permanece reservada** (nunca reutilizada)

## Se a exclusão do relógio falhar

1. Confirme conexão (coleta de batidas / diagnóstico)
2. Tente de novo na fila (até 3 tentativas automáticas de contagem)
3. Se você **já excluiu no equipamento** (função 92), use **Já removi no relógio** — o sistema lê a lista e só confirma se o PIS sumiu
4. Se necessário, exclua manualmente no equipamento e **cancele** o job na fila (último recurso)

## Regra de ouro

**Nunca reaproveitar a credencial** de um demitido. O próximo colaborador recebe `MAX(credenciais) + 1`, incluindo as dos inativos.

## Relação com o incidente Paulo / Henrique

O bug era: no desligamento a credencial era apagada (`null`), e o próximo cadastro recalculava MAX sem ela — reusando o número 97.  
Agora a credencial permanece no profile INACTIVE e a exclusão do relógio fica rastreada na fila.
