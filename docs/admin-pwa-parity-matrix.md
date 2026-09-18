# Matriz Admin Desktop × PWA (2026-09-18)

Levantamento estático + classificação de gaps. ADMIN **não** usa `employeeMobileShell` (`shouldUseEmployeeMobileShell` só CLT/PJ).

Legenda descoberta PWA (antes da correção): **BN** = bottom nav · **Tile** = AdminDashboard · **Drawer** = hamburger Sidebar.

| Rota / item | Sidebar ADMIN | BN | Tile | App libera ADMIN? | Classificação |
|-------------|---------------|----|------|-------------------|---------------|
| dashboard | sim | sim | — | sim | OK |
| profile | sim | sim (Conta) | sim | sim | OK |
| help | sim | não | não | sim | UX — só drawer |
| ponto | sim | não | não | sim | UX — gap tile/BN |
| timesheet | sim | não | sim | sim | UX — sem BN |
| punch-corrections | sim | não | sim | sim | UX — sem BN |
| apuracao | sim | não | não | sim | UX — gap tile/BN |
| attendance-audit | sim | sim (Histórico) | sim | sim | OK parcial |
| employees | sim | não | sim | sim | UX — sem BN |
| org-shifts / holidays | via organization | não | via org | sim | UX |
| comunicacao | só ADMIN | não | não | sim (só ADMIN) | UX — gap crítico |
| reports | sim | não | sim | sim | UX — sem BN |
| payroll | sim | não | não | sim | UX — gap tile/BN |
| leave | sim | sim | sim | sim | OK |
| roster | sim | não | não | sim | UX — gap tile/BN |
| my-roster | não (punching) | — | — | soft → dashboard | Soft-redirect esperado |
| messaging-outbox | sim | não | não | sim | UX — gap tile |
| performance-review | sim | não | não | sim | UX — só drawer |
| announcements | sim | não | widget | sim | OK parcial |
| admin-notifications | sim | não | não | sim | UX — só drawer |
| organization | sim | não | sim | sim | UX — sem BN; layout denso |
| settings | só ADMIN | não | sim | sim | OK parcial |
| attendance / pwa-punch | não | — | — | soft → dashboard | Soft-redirect esperado |

## Hipóteses de “acesso negado”

1. **UX/descoberta (principal):** bottom nav genérico (Início/Histórico/Férias/Conta) omite espelho, escalas, equipe, comunicação.
2. **Soft-redirect silencioso:** `my-roster`, `attendance` → dashboard sem toast (parece bloqueio).
3. **Edge 403:** create/update employee se papel ≠ ADMIN/HR (não específico PWA).
4. **Layout:** Organization / Timesheet / Reports densos no telefone (usabilidade, não permissão).

## Correções nesta entrega

1. Bottom nav Admin/HR (viewport &lt; md): Início · Espelho · Escalas · Equipe · Mais (abre drawer; badge se fila de sync).
2. Tiles no AdminDashboard: escalas, operação do ponto, comunicação (só ADMIN), folha, apuração, fila de mensagens.
3. Soft-redirect com toast (`staffRouteBlocked` / `adminOnlyRoute` / `staffOnlyRoute`) para rotas de ponto pessoal, comunicação, org/settings sem papel adequado.

Ver implementação: [`MainLayout.tsx`](../src/layouts/MainLayout.tsx), [`AdminDashboard.tsx`](../src/components/dashboard/AdminDashboard.tsx), [`App.tsx`](../src/App.tsx).

