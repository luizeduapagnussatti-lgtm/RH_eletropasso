# Product

## Register

product

## Platform

web

## Users

Primary: funcionários, gestores, RH e administradores da **Eletropasso** que usam o sistema no dia a dia (desktop e PWA no celular) para ponto, férias, avaliações, avisos e configuração organizacional.

Secondary: Super Admin da plataforma (multi-tenant / operação OpenHR), com superfície separada e rara no uso diário Eletropasso.

Contexto típico: tarefas operacionais com interrupções, rede variável, e necessidade de clareza imediata do que fazer a seguir (bater ponto, aprovar pedido, ler aviso).

## Product Purpose

**RH_Eletropasso** é o sistema de gestão de RH da Eletropasso: ponto com câmera/geolocalização, férias com workflow, avaliações de desempenho, comunicados, diretório, organização e relatórios — empacotado como PWA instalável.

Sucesso: o usuário conclui o fluxo certo no menor número de passos, com feedback legível, sem ambiguidades de marca ou de estado (sessão ativa, pendências, permissões).

## Positioning

RH interno da Eletropasso — operacional, confiável e da casa — não um SaaS genérico "mais um dashboard".

## Brand Personality

Sóbrica, clara, corporativa. Tom profissional e direto (pt-BR default). Visual deve reforçar identidade Eletropasso (wordmark da loja nos headers/login; ícone circular RH em PWA/sidebar) sem teatralidade de marketing.

## Anti-references

- Landing pages de startup com hero dramático, gradientes roxos e cards empilhados no app shell
- UI "template admin" cinza sem hierarquia (tudo com a mesma densidade e peso)
- Misturar os dois logos: wordmark Eletropasso e ícone circular RH não são intercambiáveis (login = só wordmark; PWA/favicon/sidebar = ícone RH)
- Sobrecarregar a primeira viewport com widgets promocionais ou badges flotantes

## Design Principles

1. **Clareza operacional primeiro** — cada tela resolve um trabalho; hierarquia visual aponta a ação principal.
2. **Marca Eletropasso sem misturar ativos** — logos e superfícies respeitam o contrato de branding já definido no código.
3. **Densidade útil, não decoração** — preferir espaço e tipografia legível a cards aninhados e chrome genérico.
4. **PWA realista** — safe areas, toque, estados de erro/permissão legíveis; dark mode e tema de acento coexistentes.
5. **i18n e papéis** — labels via i18n; UI e dados respeitam o papel (ADMIN/HR/MANAGER/EMPLOYEE).

## Accessibility & Inclusion

Alvo prático: contraste de texto de corpo ≥ 4.5:1; alvos de toque adequados em mobile/PWA; suporte a `prefers-reduced-motion`; não depender só de cor para status críticos (aprovado/rejeitado/atraso). Não há exigência formal WCAG auditada neste momento — tratar WCAG 2.1 AA como norte em novas telas.
