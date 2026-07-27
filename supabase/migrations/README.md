# Migrations Supabase — RH_Eletropasso

## Manifesto

O catálogo oficial de todas as migrations está em:

- **`manifest.json`** — lista ordenada (0001–0030+) com `version`, `file` e `title`
- **`manifest.schema.json`** — schema JSON para validação do manifesto

## Registro no banco

A tabela **`public.schema_migrations`** guarda o que já foi aplicado:

| Coluna      | Descrição                          |
|-------------|------------------------------------|
| `version`   | Prefixo numérico (ex.: `0026`)     |
| `filename`  | Arquivo `.sql`                     |
| `title`     | Descrição legível                  |
| `applied_at`| Quando foi registrada              |
| `applied_by`| Script ou `baseline`               |

## Aplicar migrations

### Banco local (Docker Supabase)

```powershell
# DB novo / primeira vez com DB já populado até 0026:
.\scripts\Apply-SupabaseMigrations.ps1 -BaselineThrough 0026

# DB vazio (aplica tudo do zero, sem baseline):
.\scripts\Apply-SupabaseMigrations.ps1

# Simular sem executar:
.\scripts\Apply-SupabaseMigrations.ps1 -WhatIf
```

Parâmetros opcionais:

| Parâmetro           | Padrão                         |
|---------------------|--------------------------------|
| `-ContainerName`    | `supabase_db_RH_eletropasso`   |
| `-BaselineThrough`  | (vazio) — marcar versões antigas sem reexecutar SQL |

### Nova migration

1. Crie `00XX_descricao.sql` em `supabase/migrations/`
2. Adicione entrada em **`manifest.json`** (mesmo `version` do prefixo do arquivo)
3. Execute `.\scripts\Apply-SupabaseMigrations.ps1`

## Histórico (resumo)

| Faixa   | Tema                                      |
|---------|-------------------------------------------|
| 0001–0016 | Core OpenHR, RLS, storage, cron        |
| 0017–0026 | PTRP — ponto, espelho, revisão por colaborador |
| 0027–0030 | eSocial — empregador, rubricas, API keys |

Consulte `manifest.json` para o detalhe de cada arquivo.
