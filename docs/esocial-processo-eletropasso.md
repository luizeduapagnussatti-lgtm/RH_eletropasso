# Processo Folha / Contabilidade — Eletropasso (OpenHR)

Documento interno para RH, ADMIN e contador. Descreve o **fluxo real da loja**: espelho aprovado no OpenHR, envio à contabilidade externa, devolução da folha e coleta de ciência.

## Fluxo mensal (Eletropasso)

```
Espelho PTRP aprovado/bloqueado
        ↓
RH gera resumo de horas (HE 50/100, noturno, atraso, faltas)
        ↓
RH baixa ZIP e envia à contabilidade
        ↓
Contabilidade lança na folha (Excel/sistema próprio)
        ↓
Contabilidade devolve holerites + valores lançados
        ↓
RH registra valores da folha, anexa holerite e coleta ciência do colaborador
        ↓
Competência encerrada (correções voltam à contabilidade se necessário)
```

### Detalhamento por etapa

| Etapa | Quem | O quê |
|-------|------|--------|
| 1. Espelho | RH / gestor | Competência PTRP conferida; gestor ou RH aprova cada colaborador (**sem** ciência do colaborador no espelho) |
| 2. Resumo | RH | `payroll_consolidations` — totais por colaborador |
| 3. Envio | RH | ZIP `resumo-contabilidade.csv` + `espelho-detalhado.csv` → contador |
| 4. Folha | Contador | Lança HE, falta, atraso, adicional noturno na folha |
| 5. Devolução | Contador → RH | Holerites + valores efetivamente lançados |
| 6. Ciência | RH + colaborador | Assinatura/ciência junto com holerite; divergência → correção |

## Regras de horas extras (Eletropasso)

| Tipo | Regra |
|------|--------|
| HE 100% | Domingo ou feriado (calendário da organização) |
| HE 50% | Demais dias (seg–sáb) |
| Adicional noturno | Rubrica separada — não misturar com HE |
| Atraso | Minutos de atraso apurados no espelho (`late_minutes`) |
| Faltas | `absence_minutes` / status ABSENT |

## Papéis

| Papel | Responsabilidade |
|-------|------------------|
| ADMIN | CNPJ, ambiente eSocial, rubricas, e-mail contador |
| HR | Espelho, envio contabilidade, registro folha, ciência |
| Contador | Folha externa (Excel); devolve holerites |
| Colaborador | Ciência/assinatura do holerite (coletada pelo RH) |

## Tabelas (migration 0031)

- `payroll_accounting_handoffs` — status do workflow por competência
- `payroll_payment_slips` — referência OpenHR vs valores da contabilidade + ciência
- Storage bucket `payroll-slips` — PDF/imagem do holerite

## eSocial (opcional / avançado)

A seção **Avançado** na página Folha & Contabilidade mantém export JSON/CSV, XML S-1200 rascunho e pacote ZIP para quando a transmissão gov estiver ativa. O fluxo diário da loja **não depende** disso — a contabilidade processa a folha com o espelho enviado.

## Pendências cadastrais

Antes de enviar à contabilidade, cada colaborador ativo com dias apurados precisa:

- CPF válido
- PIS (`employee_id`, 11–12 dígitos)
- Data de admissão (`joining_date`)

## Formato export contabilidade

O ZIP inclui:

- **resumo-contabilidade.csv** — CPF, PIS, nome, horas normais, HE50, HE100, noturno, atraso, faltas
- **espelho-detalhado.csv** — linha por dia apurado
- **LEIA-ME.txt** — instruções do pacote

Ver também `docs/api-payroll-export.md` para contrato JSON v1 e API.
