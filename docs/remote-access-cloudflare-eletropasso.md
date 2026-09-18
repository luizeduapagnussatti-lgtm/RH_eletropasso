# Acesso remoto PWA — Cloudflare Tunnel (eletropasso-wa.com.br)

**Decisão:** o celular Android não resolve bem `*.eletropasso.local` via Tailscale DNS
(tratado como mDNS). Para o aparelho de ponto, o caminho estável é **HTTPS público**
via o tunnel Cloudflare já usado no WhatsApp (`eletropasso-wa-hook`).

| URL | Destino interno |
|-----|-----------------|
| `https://rh.eletropasso-wa.com.br` | `http://host.docker.internal:3000` (vite preview) |
| `https://api-rh.eletropasso-wa.com.br` | `http://host.docker.internal:54321` (Supabase Kong) |

LAN da loja continua com `https://rh.eletropasso.local` (NPM + mkcert).  
O build de produção aponta a API para o hostname Cloudflare (funciona no celular **sem** Tailscale).

---

## 1) Public Hostnames no tunnel existente

1. Abra [Cloudflare Zero Trust → Networks → Tunnels](https://one.dash.cloudflare.com/).
2. Tunnel **`eletropasso-wa-hook`** → **Configure** → **Public Hostname** → **Add**.

### Hostname do PWA

| Campo | Valor |
|--------|--------|
| Subdomain | `rh` |
| Domain | `eletropasso-wa.com.br` |
| Path | (vazio) |
| Type | HTTP |
| URL | `host.docker.internal:3000` |

### Hostname da API

| Campo | Valor |
|--------|--------|
| Subdomain | `api-rh` |
| Domain | `eletropasso-wa.com.br` |
| Path | (vazio) |
| Type | HTTP |
| URL | `host.docker.internal:54321` |

Salvar. O DNS (CNAME proxied) é criado automaticamente na zona.

## 2) Container cloudflared (host gateway)

No compose do atendimento, o serviço `cloudflared-wa` precisa de:

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

Recriar:

```powershell
cd E:\eletropasso-infra\atendimento
docker compose --profile cloudflare-wa up -d cloudflared-wa
docker logs cloudflared_wa --tail 40
```

## 3) App RH

- `vite.config.ts` — `allowedHosts` inclui `rh.eletropasso-wa.com.br`
- `.env` / `.env.production` — `VITE_SUPABASE_URL` / `VITE_LAN_SHARE_URL` nos hostnames Cloudflare
- `supabase/config.toml` — `site_url` + redirects com o domínio público
- Rebuild + restart preview:

```powershell
powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\RH_eletropasso\scripts\Ensure-Frontend.ps1 -Mode preview -Rebuild -ForceRestart
```

Após mudar `config.toml`, reinicie o stack Supabase local (Auth) para aplicar redirects.

## 4) Teste de aceite

| De onde | URL | Esperado |
|---------|-----|----------|
| Celular **sem** Tailscale (4G) | `https://rh.eletropasso-wa.com.br` | Login PWA |
| Celular | `https://api-rh.eletropasso-wa.com.br/auth/v1/health` | JSON GoTrue |
| Loja Wi‑Fi | `https://rh.eletropasso.local` | Continua OK |

## Segurança

- Túnel termina TLS na Cloudflare; origem HTTP só na máquina da loja.
- A API usa a anon key + RLS (igual ao modelo Supabase). Não publicar service role.
- Opcional depois: **Cloudflare Access** (e-mail da empresa) na frente de `rh` / `api-rh`.
- Token do tunnel permanece só no `.env` do atendimento (não versionar).

## Relação com Tailscale

Tailscale continua útil para admin/servidor. Para o **PWA de ponto no celular**, use o domínio Cloudflare acima — é o caminho suportado.
