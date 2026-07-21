# DMPREP ↔ Relógio — investigação (2026-07-21)

## Resumo

O **DMP REP** é a ponte comprovada entre o PrintPoint III e o arquivo
`MOVIMENT.txt`. O caminho **OpenHR → relógio** (enviar cadastro/biometria)
**não possui API HTTP documentada** neste projeto. A operação oficial passa
pelo software DMPREP no PC `192.168.15.69`.

## O que o banco `DIMEP.MDB` revela

Tabelas relevantes:

| Tabela | Indício |
|--------|---------|
| `Funcionario` | Cadastro mestre (Codigo, Nome, PIS, Credencial, DtAdmissao) |
| `RelogiosREP` | Relógios cadastrados (IP, NumeroSerie, ChaveRSA) |
| `Marcacao` | Marcações processadas pelo DMPREP |
| `TEMP_PIS_REP` / `TEMP_CARTOES_REP` | Staging para envio ao REP |
| `TemplatesREP` / `DedoXTemplatesREP` | Templates biométricos |

Não há tabela ou campo exposto que permita, a partir do OpenHR, disparar
**envio automático** ao relógio sem o executável DMPREP (`WatchComm.dll`,
protocolo TCP binário + RSA).

## Fluxos suportados hoje

```
Relógio ──TCP──► DMPREP ──► MOVIMENT.txt ──► dmprep-sync ──► OpenHR
DMPREP ──► DIMEP.MDB ──► import employees ──► OpenHR profiles
```

## Fluxo manual necessário (admissão)

1. Cadastrar funcionário no **DMP REP** (PIS = credencial de 12 dígitos).
2. Enviar cadastro/biometria ao relógio pelo menu do DMPREP (*Operações REP*).
3. Cadastrar no OpenHR com **mesma matrícula/PIS** (12 dígitos).
4. Clicar **Sincronizar DMPREP** ou aguardar o poll automático.

## Fluxo manual necessário (desligamento)

1. Inativar/remover no **DMP REP** e excluir biometria do relógio.
2. Excluir ou inativar no OpenHR.
3. Sincronizar batidas finais se necessário.

## Próximos passos possíveis (não implementados)

- Automação UI do DMPREP (AutoIt / RPA) — frágil, depende de versão.
- SDK/protocolo DIMEP homologado — requer contrato/suporte TOTVS/DIMEP.
- Agente Windows que monitora `DIMEP.MDB` e replica **push** OpenHR → DMPREP
  (ainda exigiria API de escrita no MDB + trigger de envio REP).

Até lá, o OpenHR usa **checklist operacional** na admissão/desligamento.
