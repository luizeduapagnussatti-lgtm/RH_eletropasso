# Tutorial: Adicionar novo colaborador

## Pré-requisitos

- Papel: **ADMIN** ou **HR**
- Dados: nome, e-mail corporativo, senha (≥ 8 caracteres)
- Se a pessoa **bate ponto** (CLT / EMPLOYEE, MANAGER, TEAM_LEAD): **PIS** (11–12 dígitos)
- Relógio PrintPoint ligado e na rede (para finalizar o envio)

## Passo a passo

### 1. Abrir o cadastro

1. Menu lateral → **Cartões** (Equipe)
2. Botão **Novo colaborador**

### 2. Identidade

- Nome completo
- PIS/NIS (obrigatório para quem bate ponto)
- CPF (opcional)

O sistema gera automaticamente uma **credencial (crachá)** única.  
Essa credencial **nunca é reutilizada**, mesmo depois do desligamento.

### 3. Contrato

- Departamento, cargo, tipo de emprego, data de admissão
- Gestor, equipe e turno (quando aplicável)

### 4. Acesso

- E-mail (login) e senha
- Papel (EMPLOYEE / MANAGER / HR / ADMIN…)

### 5. Revisão e cadastro

Confira os dados e clique em **Cadastrar**.

### 6. Admissão no relógio (quem bate ponto)

1. A tela de **Admissão** abre automaticamente
2. Anote a **credencial** exibida
3. Se aparecer **Sincronização pendente**, clique em **Tentar agora** (ou vá em **Comunicação → Fila hardware**)
4. Leve a pessoa ao relógio e cadastre a **biometria**
5. No sistema, marque **Biometria cadastrada** quando concluir

## O que o sistema faz

| Passo | Efeito |
|-------|--------|
| Cadastro | Profile `ACTIVE` + `clock_credential` = MAX(todas as credenciais) + 1 |
| Quem bate ponto | Job `ADD_EMPLOYEE` na fila `hardware_sync_queue` |
| Confirmação no relógio | Status da fila → `CONFIRMED` |

## Problemas comuns

| Erro | O que fazer |
|------|-------------|
| E-mail já registrado | Verifique se já existe colaborador ativo; e-mail de demitido é liberado automaticamente |
| PIS já registrado | Outro profile (ativo ou inativo) já usa esse PIS |
| Relógio ocupado / offline | O comando fica na fila — tente de novo em Comunicação |

## Regra de ouro

A credencial do crachá **não volta para o pool**. Cada número fica reservado no histórico do colaborador.
