# Agente DMPREP (PC 192.168.15.69)

Sincroniza batidas do relógio para o OpenHR **silenciosamente**, sem janela de CMD.

## O que faz (a cada execução)

1. Lê **novas linhas** do `MOVIMENT.txt` (após exportação DMPREP)
2. **Fallback:** lê `Marcacao` no `DIMEP.MDB` (OleDb ACE/Jet)
3. Envia lotes para `ingest-punches` (HTTPS `api-rh.eletropasso.local`)
4. Opcional: dispara sync no servidor RH (`192.168.15.245:3099`)
5. Grava log em `C:\RH_eletropasso\dmprep-agent\logs\`

## Instalação (uma vez no PC .69)

1. Copie a pasta `scripts/dmprep-agent` para `C:\RH_eletropasso\dmprep-agent`
2. Edite `config.json` se necessário (chaves já vêm preenchidas para LAN)
3. **PowerShell como Administrador:**

```powershell
cd C:\RH_eletropasso\dmprep-agent
Set-ExecutionPolicy -Scope Process Bypass -Force
.\Install-DmprepAgent.ps1
```

4. Teste:

```text
wscript.exe C:\RH_eletropasso\dmprep-agent\Run-DmprepAgent.vbs
```

## Agendamento

| Tarefa | Horário |
|--------|---------|
| `RH_DmprepAgent_1200` | Todo dia **12:00** |
| `RH_DmprepAgent_1800` | Todo dia **18:00** |

Conta: **SYSTEM** (roda mesmo sem usuário logado, sem janela visível).

## Fluxo operacional recomendado

O agente **não substitui** a coleta/exportação do DMPREP quando novas batidas só existem no relógio:

| Passo | Quem | Quando |
|-------|------|--------|
| Coleta relógio → MDB | DMPREP manual ou rotina interna | Antes do agente |
| Exportação → MOVIMENT | DMPREP **Utilitários → Exportação → Marcações** | Se quiser arquivo TXT |
| Sync OpenHR | **Este agente** (12h / 18h) | Automático |

Se a coleta DMPREP não rodou, o **fallback MDB** envia o que já estiver em `Marcacao`.

## Requisito OleDb (fallback MDB)

Se o log mostrar *"Nenhum provider OleDb"*, instale no PC .69:

**Microsoft Access Database Engine 2016 Redistributable** (ACE OLEDB 12.0), mesma arquitetura (x86/x64) do PowerShell.

Sem OleDb, o agente ainda funciona lendo apenas `MOVIMENT.txt`.

## Fallback: sync pelo servidor RH (.245)

Se o PC .69 nao permitir agendamento remoto (RPC/firewall), o servidor RH pode ler `MOVIMENT.txt` via compartilhamento admin (`\\192.168.15.69\C$`):

```powershell
# No servidor .245 (ja configurado):
# Tarefas RH_DmprepSync_FromServer_1200 e _1800 (12h e 18h)
# Log: scripts/dmprep-agent/logs/
```

Teste manual:

```powershell
.\Run-Sync-FromServer.bat
```

No PC .69, rode **INSTALAR.bat como Administrador** quando possivel (tarefas locais SYSTEM + fallback MDB).

## Arquivos

| Arquivo | Função |
|---------|--------|
| `Run-DmprepAgent.vbs` | Launcher oculto (Task Scheduler chama este) |
| `Sync-DmprepPunches.ps1` | Lógica principal |
| `Install-DmprepAgent.ps1` | Cria tarefas 12h/18h |
| `config.json` | Caminhos e credenciais |
| `state.json` | Cursor MOVIMENT + watermark MDB |
