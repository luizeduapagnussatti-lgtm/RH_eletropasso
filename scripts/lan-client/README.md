# Preparar PC da loja — rh.eletropasso.local

Na sua máquina (`.57`) funciona porque você já tem **dois** itens que os outros PCs ainda não têm:

1. **Nome no DNS local** — o Windows sabe que `rh.eletropasso.local` → `192.168.15.245`
2. **Certificado confiável** — o Chrome/Edge confia no HTTPS do NPM (CA ou certificado instalado)

Sem isso, o outro PC ou **não acha o site** (DNS) ou mostra **“Sua conexão não é privada”** (certificado).

## Instalação rápida (Windows)

1. Copie esta pasta `scripts/lan-client/` para o PC da loja (ou acesse pelo compartilhamento de rede).
2. Exporte o certificado raiz que você usa na `.57`:
   - Abra `https://rh.eletropasso.local` no Chrome → cadeado → **Conexão é segura** → **O certificado é válido**
   - Aba **Certificação** → selecione o certificado **raiz / emissor** (CA do NPM ou mkcert) → **Exportar…** → Base-64 `.CER`
   - Salve como `eletropasso-lan-ca.cer` **nesta pasta** (`scripts/lan-client/`)
3. Clique com botão direito em **`RUN_INSTALL_ONCE.bat`** → **Executar como administrador**
4. Feche e abra o Chrome/Edge e acesse `https://rh.eletropasso.local`

O script:

- Adiciona no `hosts` do Windows:
  - `192.168.15.245 rh.eletropasso.local`
  - `192.168.15.245 api-rh.eletropasso.local`
- Importa `eletropasso-lan-ca.cer` em **Autoridades de certificação raiz confiáveis** (se o arquivo existir)

## WhatsApp

O WhatsApp **pode não deixar clicar** em endereços `.local`. Peça para **colar** o link completo na barra do navegador:

`https://rh.eletropasso.local`

Use o botão **Copiar link** na tela de login ou em Configurações.

## Alternativa: DNS no roteador

Se o roteador da loja permitir entradas DNS estáticas, aponte `rh.eletropasso.local` e `api-rh.eletropasso.local` para `192.168.15.245`. Ainda será necessário confiar no certificado em cada PC (ou usar certificado assinado por CA interna via GPO).

## Servidor (.245)

Confirme que o Nginx Proxy Manager tem proxy hosts SSL para:

- `rh.eletropasso.local` → frontend (porta 3000 ou `dist`)
- `api-rh.eletropasso.local` → Supabase/API (porta 54321 ou stack Docker)
