# Acesso remoto — Tailscale (VPN) + RH local

**Decisão:** não usar Vercel neste modelo.  
Frontend PWA + API Supabase + Postgres ficam no **servidor da loja** (`192.168.15.245`). Acesso de fora = **Tailscale** (VPN mesh), sem abrir o banco na internet.

```text
[Celular / PC em casa]
        │  Tailscale (criptografado)
        ▼
[Servidor .245 — subnet router]
        │  LAN
        ├── https://rh.eletropasso.local      → PWA
        ├── https://api-rh.eletropasso.local  → Supabase
        └── WatchComm / REP (inalterado)
```

## Por que não Vercel aqui

| | Vercel + API local | Front local + Tailscale |
|--|--------------------|-------------------------|
| URL do app | Domínio público | Mesmos `*.eletropasso.local` via VPN |
| Certificado / Auth redirects | Precisa reconfigurar | Igual ao da loja |
| Superfície de ataque | Front público + API precisa ser alcançável | Só quem está no Tailnet |
| PWA / Service Worker | Dois “mundos” (LAN vs cloud) | Uma origem só |
| Relógio / ingest | Continua local | Continua local |

Use Vercel só no futuro se migrarem API+banco para nuvem de propósito.

---

## Pré-requisitos

- Conta [Tailscale](https://login.tailscale.com) (plano Free cobre a loja)
- Servidor Windows/Linux da loja: `192.168.15.245` (onde já rodam NPM + Supabase + front)
- Admin local no servidor para instalar o cliente Tailscale

---

## 1. Servidor da loja (subnet router)

1. Instale o Tailscale no **servidor** (.245):  
   https://tailscale.com/download
2. Faça login com a conta da empresa (ex.: `rh@eletropasso…`).
3. No [Admin Console](https://login.tailscale.com/admin/machines), localize a máquina do servidor.
4. Habilite **Subnet routes** e anuncie a LAN:

   ```text
   192.168.15.0/24
   ```

   No Windows (PowerShell **admin**, após instalar Tailscale):

   ```powershell
   tailscale up --advertise-routes=192.168.15.0/24 --accept-dns=false
   ```

5. No Admin Console → máquina do servidor → **Edit route settings** → **Approve** a rota `192.168.15.0/24`.
6. (Opcional, recomendado) Marque a máquina como **Key expiry disabled** ou renove a chave com calendário, para o servidor não “cair” da VPN sem aviso.

Confirme na loja que `https://rh.eletropasso.local` e `https://api-rh.eletropasso.local` continuam OK **sem** Tailscale (rede local).

---

## 2. Celular / PC remoto (gestor, RH em casa)

1. Instale Tailscale (Android / iOS / Windows).
2. Login na **mesma** conta / Tailnet.
3. Em **Settings → Exit / Subnet** (ou **Use Tailscale subnets**), aceite as rotas da loja (`192.168.15.0/24`). Sem isso o celular não alcança `192.168.15.245`.
4. **DNS** (causa típica de “página não encontrada” no Android — o nome `.local` não resolve sozinho):

   No [Admin Console → DNS](https://login.tailscale.com/admin/dns), em **Split DNS** / Nameservers:

   - Nameserver: **`100.125.155.8`** (IP Tailscale do `servidor`)
   - Restringir ao domínio: **`eletropasso.local`**
   - No celular: **Use Tailscale DNS** ligado; **Use Tailscale subnets** ligado (ainda necessário para outros hosts da LAN)

   No servidor o container **`eletropasso-coredns`** (`scripts/Ensure-CoreDns.ps1`) responde `rh` / `api-rh` → **IP Tailscale** (`100.x`), para o HTTPS do PWA ir pelo overlay e não depender da rota `192.168.15.0/24`. Watchdog a cada 5 min recria o container se o bind quebrar após reboot (Docker antes do Tailscale).

   Alternativa Windows: `scripts/lan-client/RUN_INSTALL_ONCE.bat` (arquivo `hosts`).

5. Confie na CA (`scripts/lan-client/eletropasso-lan-ca.crt`) — instalar como **certificado da CA**.
6. Abra: `https://rh.eletropasso.local` com Tailscale **ligado**.

Não use só `https://192.168.15.245` para o PWA (no NPM o IP:80 é outro serviço; o RH exige o nome no HTTPS).

**Celular (ponto):** use o Tunnel Cloudflare — ver [`remote-access-cloudflare-eletropasso.md`](./remote-access-cloudflare-eletropasso.md)  
(`https://rh.eletropasso-wa.com.br`). O `.local` via Tailscale no Android costuma ficar em loading infinito.

Sem Tailscale ligado, o app **`.local`** **não** deve abrir de fora — isso é o desejado.

---

## 3. DNS na Tailnet (CoreDNS)

Container **`eletropasso-coredns`** em `100.125.155.8:53`. Split DNS no painel aponta para o IP Tailscale do servidor. As respostas A de `rh` / `api-rh` são o próprio IP Tailscale, para o PWA não precisar da subnet só para abrir o app.

Após manutenção/reboot: `Ensure-CoreDns.ps1` (via `start-rh.ps1` + watchdog) recria o container se o IP Tailscale mudou ou o DNS não responde o A esperado.

---

## 4. Checklist de segurança

- [ ] Postgres / porta `54321` **não** abertos no roteador (sem port forward)
- [ ] NPM só escuta LAN; acesso externo só via Tailscale
- [ ] Tailnet com **apenas** contas da empresa; MFA na conta Tailscale
- [ ] Remover máquina do Tailnet quando o notebook sair da empresa
- [ ] Backups do volume Docker/Postgres no servidor (rotina local)
- [ ] Poller WatchComm / ingest continua só no servidor local

---

## 5. Teste de aceite

| Passo | Esperado |
|-------|----------|
| Na loja, Wi‑Fi, **sem** Tailscale | Login + espelho OK |
| Em casa, **sem** Tailscale | `rh.eletropasso.local` **não** resolve / não abre |
| Em casa, Tailscale **ligado** + hosts + CA | Login + espelho OK |
| Batida REP na loja | Ingest local inalterado |

---

## 6. O que não fazer

- Não publicar Funnel Tailscale / Cloudflare Tunnel **público** para a API de RH sem autenticação extra.
- Não colocar o front na Vercel apontando para API só na LAN (quebra fora da VPN e duplica origem do PWA).
- Não expor `5432` / `54321` no IP público do modem.

---

## Referências internas

- Preparar PC/celular na LAN: [`scripts/lan-client/README.md`](../scripts/lan-client/README.md)
- Upstream NPM (IPv4): `scripts/Ensure-NpmRhUpstream.ps1`, `scripts/fix-npm-rh-ipv4.py`
- HTTPS mkcert (rh + api-rh): `scripts/Ensure-NpmRhSsl.ps1` — cópia ouro em `E:\RH_eletropasso\certs\npm-mkcert\`; watchdog a cada 5 min evita voltar ao certificado legado autoassinado

## 7. Estabilidade (reboot / longo prazo)

Já no servidor:

- Serviço **Tailscale** = Automatic + unattended
- Serviço **Docker** (`com.docker.service`) = Automatic
- Containers NPM / Supabase / **eletropasso-coredns** = `restart: unless-stopped`
- Tarefa **RH_Eletropasso_AutoStart** (boot + 5 min) chama `start-rh.ps1`, que sobe Docker → CoreDNS → Supabase → front
- Watchdogs: frontend, NPM upstream, **NPM mkcert SSL**, Supabase API, **CoreDNS Tailscale**
- Selfies de batida PWA (`selfies/*/pwa-punches/*`): retenção **90 dias** via Edge Function `cron-pwa-punch-selfie-cleanup` (pg_cron 02:00 UTC). Não apaga selfie clássica de `attendance` nem `timesheet-signatures`.

**Você (painel Tailscale) — uma vez:**

1. Máquinas → **servidor** → menu **⋯**
2. **Disable key expiry** (Desativar expiração da chave)
3. Sem isso a máquina pode pedir reautorização ~meses depois (hoje KeyExpiry ~2027-02)

