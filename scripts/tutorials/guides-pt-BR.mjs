/**
 * Tutoriais / guias RH_Eletropasso (pt-BR).
 * Consumido pelo seeder de tutorials — author = "RH_Eletropasso".
 * Slugs 1–25 alinhados ao HelpButton; 26–29 específicos Eletropasso.
 */

export const GUIDES = [
  // ─── Primeiros passos ─────────────────────────────────────────────
  {
    slug: 'welcome-to-openhr',
    title: 'Primeiros passos no RH_Eletropasso',
    category: 'Primeiros passos',
    displayOrder: 1,
    excerpt:
      'Bem-vindo ao RH_Eletropasso — ponto, espelho, férias, equipe e relatórios para a Eletropasso.',
    contentHtml: `
<h3>Bem-vindo ao RH_Eletropasso</h3>
<p>O <strong>RH_Eletropasso</strong> é o sistema interno de RH da Eletropasso (baseado no OpenHR). Aqui você registra jornada, consulta o espelho de ponto, solicita afastamentos e acompanha a equipe — conforme o seu perfil de acesso.</p>

<h3>O que você encontra no sistema</h3>
<ul>
  <li><a href="/how-to-use/how-to-clock-in-and-out"><strong>Ponto</strong></a> — selfie no app (escritório/campo) e batidas do relógio DMPREP/REP no chão de fábrica (CLT).</li>
  <li><a href="/how-to-use/espelho-de-ponto-ptrp"><strong>Espelho de ponto</strong></a> — apuração por competência 26→25, com Esperado / Feito / Falta e banco de horas.</li>
  <li><a href="/how-to-use/how-to-apply-for-leave"><strong>Férias e afastamentos</strong></a> — solicitação, saldo e fluxo de aprovação.</li>
  <li><a href="/how-to-use/managing-employees"><strong>Equipe</strong></a> — diretório, papéis e dados do colaborador.</li>
  <li><a href="/how-to-use/generating-reports"><strong>Relatórios</strong></a> — presença, ausências (pessoa-dia) e exportações.</li>
</ul>

<h3>Quem usa o quê</h3>
<ul>
  <li><strong>Admin</strong> — configuração da organização, sync DMPREP, políticas PTRP e liberações sensíveis.</li>
  <li><strong>Auxiliar de RH</strong> — operação diária (equipe, turnos, férias, auditoria, espelho, relatórios).</li>
  <li><strong>Gestor / Team Lead</strong> — equipe, aprovações e acompanhamento do time.</li>
  <li><strong>Colaborador</strong> — próprio ponto, espelho, férias e perfil.</li>
  <li><strong>Diretoria</strong> — acesso gerencial <em>sem</em> batida de ponto.</li>
</ul>

<h3>Como começar</h3>
<ol>
  <li>Faça login e confira o <a href="/how-to-use/understanding-dashboard">painel</a>.</li>
  <li>Atualize <a href="/how-to-use/managing-profile-settings">perfil e senha</a>.</li>
  <li>Se for CLT de chão: use o <a href="/how-to-use/sincronizacao-dmprep">relógio</a>; se for escritório/campo: veja <a href="/how-to-use/how-to-clock-in-and-out">como bater ponto no app</a>.</li>
  <li>Opcional: <a href="/how-to-use/install-openhr-pwa">instale o app (PWA)</a> no celular.</li>
</ol>

<h3>Guias relacionados</h3>
<ul>
  <li><a href="/how-to-use/roles-and-permissions">Papéis e permissões</a></li>
  <li><a href="/how-to-use/setting-up-organization">Configurar a organização</a> (Admin / Auxiliar de RH)</li>
</ul>
`.trim(),
  },

  {
    slug: 'roles-and-permissions',
    title: 'Papéis e permissões',
    category: 'Primeiros passos',
    displayOrder: 2,
    excerpt:
      'SUPER_ADMIN, ADMIN, Auxiliar de RH (HR), Gestor, Team Lead, Diretoria e Colaborador — o que cada um acessa.',
    contentHtml: `
<h3>Visão geral</h3>
<p>O RH_Eletropasso usa papéis (roles) para filtrar menus, dados e ações. O código no banco permanece em inglês; na interface usamos os nomes da Eletropasso.</p>

<h3>Papéis</h3>
<table>
  <thead><tr><th>Código</th><th>Nome na Eletropasso</th><th>Resumo</th></tr></thead>
  <tbody>
    <tr><td><strong>SUPER_ADMIN</strong></td><td>Super Admin</td><td>Plataforma (raro no deploy interno).</td></tr>
    <tr><td><strong>ADMIN</strong></td><td>Admin</td><td>Configuração completa, sync DMPREP, políticas PTRP, billing reservado.</td></tr>
    <tr><td><strong>HR</strong></td><td>Auxiliar de RH</td><td>Operação: equipe, turnos, férias, feriados, auditoria, espelho, relatórios.</td></tr>
    <tr><td><strong>MANAGER</strong></td><td>Gestor</td><td>Time + aprovações de férias/espelho da equipe.</td></tr>
    <tr><td><strong>TEAM_LEAD</strong></td><td>Líder de equipe</td><td>Escopo de time, similar ao gestor em várias telas.</td></tr>
    <tr><td><strong>MANAGEMENT</strong></td><td>Diretoria</td><td>Visão gerencial; <strong>não bate ponto</strong> (nem checklist DMPREP).</td></tr>
    <tr><td><strong>EMPLOYEE</strong></td><td>Colaborador</td><td>Próprios dados, ponto e solicitações.</td></tr>
  </tbody>
</table>

<h3>Quem bate ponto</h3>
<p>Em geral: <strong>EMPLOYEE</strong>, <strong>MANAGER</strong> e <strong>TEAM_LEAD</strong>. Contas <strong>ADMIN</strong>, <strong>Auxiliar de RH</strong> e <strong>Diretoria</strong> não passam pelo checklist de admissão no relógio.</p>

<h3>Isolamento por organização</h3>
<p>Todas as consultas filtram pela organização (multi-tenant). Na Eletropasso há um deploy interno — você só vê dados da sua empresa.</p>

<h3>Saiba mais</h3>
<ul>
  <li><a href="/how-to-use/managing-employees">Gerenciar equipe</a></li>
  <li><a href="/how-to-use/understanding-dashboard">Entender o painel</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'install-openhr-pwa',
    title: 'Instalar o RH_Eletropasso como app (PWA)',
    category: 'Primeiros passos',
    displayOrder: 3,
    excerpt:
      'Instale o RH_Eletropasso na tela inicial do celular ou no desktop — sem loja de apps.',
    contentHtml: `
<h3>O que é a PWA</h3>
<p>O RH_Eletropasso funciona como <strong>Progressive Web App</strong>: ícone na tela inicial, abre em tela cheia e usa câmera/GPS melhor no modo app (útil para <a href="/how-to-use/how-to-clock-in-and-out">ponto por selfie</a>).</p>

<h3>Android (Chrome)</h3>
<ol>
  <li>Abra o endereço do RH no Chrome.</li>
  <li>Menu (⋮) → <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
  <li>Confirme. Use o ícone daí em diante.</li>
</ol>

<h3>iPhone / iPad (Safari)</h3>
<ol>
  <li>Abra o RH no <strong>Safari</strong> (não em outros navegadores).</li>
  <li>Toque em Compartilhar → <strong>Adicionar à Tela de Início</strong>.</li>
  <li>Confirme o nome e adicione.</li>
</ol>

<h3>Desktop</h3>
<p>No Chrome/Edge, use o ícone de instalação na barra de endereço ou Menu → Instalar. Ideal para Admin e Auxiliar de RH no escritório.</p>

<h3>Dicas</h3>
<ul>
  <li>Permita câmera e localização quando o navegador pedir.</li>
  <li>Use sempre HTTPS (ou a URL interna oficial da empresa).</li>
  <li>Chão de fábrica CLT continua batendo no <a href="/how-to-use/sincronizacao-dmprep">relógio REP</a>; a PWA ajuda sobretudo quem usa selfie.</li>
</ul>
`.trim(),
  },

  // ─── Painel ───────────────────────────────────────────────────────
  {
    slug: 'understanding-dashboard',
    title: 'Entendendo o painel',
    category: 'Painel',
    displayOrder: 1,
    excerpt:
      'O que cada perfil vê no painel: atalhos, status do dia, aprovações e indicadores da organização.',
    contentHtml: `
<h3>Painel personalizado</h3>
<p>Após o login, o <strong>Dashboard</strong> mostra informações conforme o <a href="/how-to-use/roles-and-permissions">papel</a>. É o ponto de partida do dia a dia.</p>

<h3>Colaborador</h3>
<ul>
  <li>Atalhos: entrada/saída (escritório ou campo), finalizar sessão, solicitar afastamento.</li>
  <li>Status de hoje e saldo de férias/afastamentos.</li>
  <li>Comunicados recentes e próximo feriado.</li>
</ul>

<h3>Gestor / Líder</h3>
<ul>
  <li>Resumo de presença do time.</li>
  <li>Pendências de <a href="/how-to-use/leave-approval-for-managers">aprovação de férias</a>.</li>
  <li>Cartões dos reportes diretos.</li>
</ul>

<h3>Admin e Auxiliar de RH</h3>
<ul>
  <li>Indicadores da organização (equipe, presença, pendências).</li>
  <li>Atalhos para Equipe, Organização, <a href="/how-to-use/generating-reports">Relatórios</a> e <a href="/how-to-use/espelho-de-ponto-ptrp">Espelho</a>.</li>
</ul>

<h3>Dicas</h3>
<ol>
  <li>Comece o dia pelo painel — veja comunicados e pendências.</li>
  <li>Gestores: priorize o contador de aprovações.</li>
  <li>Para ponto CLT no chão, o fluxo principal é o relógio; o painel resume o restante.</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/welcome-to-openhr">Primeiros passos</a></li>
  <li><a href="/how-to-use/announcements-guide">Comunicados</a></li>
</ul>
`.trim(),
  },

  // ─── Ponto e jornada ──────────────────────────────────────────────
  {
    slug: 'how-to-clock-in-and-out',
    title: 'Como registrar entrada e saída',
    category: 'Ponto e jornada',
    displayOrder: 1,
    excerpt:
      'Ponto por selfie no app (escritório/campo) e batidas no relógio DMPREP/REP para CLT do chão de fábrica.',
    contentHtml: `
<h3>Dois jeitos de bater ponto na Eletropasso</h3>
<ol>
  <li><strong>App (selfie + GPS)</strong> — escritório, campo ou quem não usa o relógio físico.</li>
  <li><strong>Relógio DMPREP / PrintPoint (REP)</strong> — chão de fábrica CLT; as batidas entram no <a href="/how-to-use/espelho-de-ponto-ptrp">espelho de ponto</a> após a <a href="/how-to-use/sincronizacao-dmprep">sincronização</a>.</li>
</ol>

<h3>Ponto no app — antes de começar</h3>
<ul>
  <li>Permita <strong>câmera</strong> e <strong>localização</strong> no navegador.</li>
  <li>Prefira a <a href="/how-to-use/install-openhr-pwa">PWA</a> no celular.</li>
  <li>Conexão segura (HTTPS / URL interna oficial).</li>
</ul>

<h3>Entrada (selfie)</h3>
<ol>
  <li>No painel: <strong>Entrada escritório</strong> ou <strong>Entrada campo/fábrica</strong> — ou abra <strong>Ponto</strong> no menu.</li>
  <li>Confirme a localização (geofence do escritório ou área remota).</li>
  <li>No modo campo, preencha a observação (local/obra).</li>
  <li>Toque em <strong>Entrada</strong> — a selfie é capturada e o registro fica PRESENT ou LATE conforme o turno.</li>
</ol>

<h3>Saída</h3>
<ol>
  <li>Volte em <strong>Ponto</strong> ou use <strong>Finalizar sessão</strong> no painel.</li>
  <li>Confirme a selfie/local e toque em <strong>Saída</strong>.</li>
</ol>

<h3>Relógio REP (CLT chão)</h3>
<ul>
  <li>Cadastro e PIS ficam no RH; biometria é feita no relógio (funções 91/92).</li>
  <li>Bata normalmente no PrintPoint; a coleta envia as marcações para o sistema.</li>
  <li>O espelho <strong>não</strong> usa a selfie do celular — só batidas REP (ou manuais no espelho).</li>
</ul>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/understanding-attendance-logs">Meus registros de ponto</a></li>
  <li><a href="/how-to-use/configurando-turnos">Configurar turnos</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'understanding-attendance-logs',
    title: 'Entendendo meus registros de ponto',
    category: 'Ponto e jornada',
    displayOrder: 2,
    excerpt:
      'Como ler o histórico de ponto: status, consolidação do dia e diferença em relação ao espelho PTRP.',
    contentHtml: `
<h3>Onde ver</h3>
<p>No menu, abra <strong>Meu ponto</strong> (Attendance Logs). Você vê apenas os seus registros.</p>

<h3>O que cada linha mostra</h3>
<ul>
  <li><strong>Data</strong>, horários de entrada/saída e duração.</li>
  <li><strong>Status</strong> — presente, atrasado, ausente, etc. (rótulos em português na tela).</li>
  <li><strong>Local</strong> / tipo de jornada (escritório ou campo).</li>
  <li>Observações e, quando houver, selfie.</li>
</ul>

<h3>Consolidação</h3>
<p>Várias batidas no mesmo dia podem aparecer consolidadas em um registro diário. Use filtros de período para achar um dia específico.</p>

<h3>Espelho × logs de selfie</h3>
<p>Para CLT no chão, a apuração oficial da folha é o <a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a> (batidas REP). Os logs de selfie servem sobretudo a quem registra no app. Em dúvida, o Auxiliar de RH confere a <a href="/how-to-use/attendance-admin-audit">auditoria</a>.</p>

<h3>Dicas</h3>
<ul>
  <li>Confira no mesmo dia se a saída foi registrada.</li>
  <li>Divergência com o espelho: verifique PIS/matrícula e peça <strong>Recalcular período</strong> ao RH.</li>
</ul>
`.trim(),
  },

  {
    slug: 'attendance-admin-audit',
    title: 'Auditoria de ponto (Admin e RH)',
    category: 'Ponto e jornada',
    displayOrder: 3,
    excerpt:
      'Como Admin e Auxiliar de RH auditam registros, corrigem horários e tratam ausências.',
    contentHtml: `
<h3>Para quem é</h3>
<p><strong>Admin</strong> e <strong>Auxiliar de RH</strong> (e gestores, conforme menu) usam <strong>Auditoria de ponto</strong> para ver registros da organização ou do time.</p>

<h3>O que fazer na auditoria</h3>
<ul>
  <li>Filtrar por data, colaborador, departamento ou status.</li>
  <li>Abrir um registro e conferir horários, local e observações.</li>
  <li>Corrigir entrada/saída ou criar lançamento manual quando houver falha comprovada.</li>
  <li>Marcar ausência quando não houver jornada válida.</li>
</ul>

<h3>Espelho PTRP</h3>
<p>Para apuração 26→25 e banco de horas, use também o <a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a>: sincronize o relógio, depois <strong>Recalcular período</strong>. Marcações manuais no espelho complementam o REP.</p>

<h3>Boas práticas</h3>
<ol>
  <li>Documente o motivo na observação.</li>
  <li>Após mudar turno do colaborador, recalcule o espelho.</li>
  <li>Não misture correção de selfie com batida REP sem alinhar a fonte da verdade do dia.</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/sincronizacao-dmprep">Sincronização DMPREP</a></li>
  <li><a href="/how-to-use/banco-de-horas">Banco de horas</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'espelho-de-ponto-ptrp',
    title: 'Espelho de ponto (PTRP)',
    category: 'Ponto e jornada',
    displayOrder: 4,
    excerpt:
      'Competência 26→25, colunas Esperado/Feito/Falta, Recalcular após mudança de turno, sábado meio período e banco de horas.',
    contentHtml: `
<h3>O que é</h3>
<p>O <strong>Espelho de ponto</strong> apura a jornada CLT a partir das batidas do relógio (PrintPoint/REP), alinhado à Portaria 671. Não usa o check-in por selfie do celular.</p>

<h3>Competência 26 → 25</h3>
<p>A competência é o mês de fechamento da folha. Com início no dia <strong>26</strong>, por exemplo:</p>
<ul>
  <li><strong>Julho</strong> = 26/06 a 25/07 (folha fecha no dia 25).</li>
</ul>
<p>Isso é configurável em Organização (política PTRP / dia de início do período). Use <strong>1</strong> só se quiser mês calendário.</p>

<h3>Esperado, Feito e Falta</h3>
<ul>
  <li><strong>Esperado (Meta)</strong> — minutos previstos pelo turno (carga diária líquida / horários do dia).</li>
  <li><strong>Feito (Trabalhado)</strong> — minutos apurados das batidas.</li>
  <li><strong>Falta</strong> — diferença ainda não cumprida no período (até hoje).</li>
</ul>
<p>Na grade diária você também vê atraso, HE, status (normal, ausente, incompleto, feriado, licença, ajustado).</p>

<h3>Recalcular período</h3>
<p>Sempre que mudar <a href="/how-to-use/configurando-turnos">turno</a>, escala de sábado, feriado ou após importar batidas, clique em <strong>Recalcular período</strong>. Sem isso, Esperado/Feito podem ficar desatualizados.</p>

<h3>Sábado meio período</h3>
<p>Use <code>day_schedules</code> no turno (ex.: 08:00–11:45) e a escala de quem trabalha/folga no sábado. Só quem está em <strong>Trabalha</strong> gera expectativa/falta naquele sábado.</p>

<h3>Banco de horas</h3>
<p>Créditos de HE e débitos por falta alimentam o <a href="/how-to-use/banco-de-horas">banco de horas</a> no recalculo. Ajuste manual e fechamento de competência também geram lançamentos.</p>

<h3>Fluxo rápido (RH)</h3>
<ol>
  <li><a href="/how-to-use/sincronizacao-dmprep">Sincronizar</a> batidas do relógio.</li>
  <li>Abrir Espelho → competência + colaborador → Aplicar filtros.</li>
  <li><strong>Recalcular período</strong>.</li>
  <li>Revisar → aprovar / bloquear para folha.</li>
</ol>
`.trim(),
  },

  {
    slug: 'sincronizacao-dmprep',
    title: 'Sincronização DMPREP / relógio',
    category: 'Ponto e jornada',
    displayOrder: 5,
    excerpt:
      'Como as batidas do relógio chegam ao RH: mapeamento PIS/crachá, importação automática ou manual e acesso Admin.',
    contentHtml: `
<h3>Papel do DMPREP e do relógio</h3>
<p>O software DMPREP / coleta WatchComm lê as marcações do <strong>PrintPoint (REP)</strong>. O RH_Eletropasso importa essas batidas para o espelho. O cadastro (dados + PIS) nasce no RH; a biometria é feita no relógio.</p>

<h3>Mapeamento colaborador ↔ relógio</h3>
<ul>
  <li>O vínculo principal é o <strong>PIS</strong> (12 dígitos) / credencial no relógio.</li>
  <li>Na admissão: cadastre no RH → <strong>Enviar para DMPREP</strong> → no relógio, função <strong>91</strong> (digitais).</li>
  <li>Na demissão: função <strong>92</strong> no relógio antes de excluir a conta no RH.</li>
</ul>

<h3>Importação automática × manual</h3>
<ul>
  <li><strong>Automática</strong> — poller/agente coleta periodicamente (ex.: a cada ~1 h) e envia <code>ingest-punches</code>.</li>
  <li><strong>Manual</strong> — Admin dispara sync em <strong>Organização → Sistema → Sincronização relógio de ponto</strong>.</li>
</ul>

<h3>Quem pode sincronizar</h3>
<p>Ações de sync e painéis sensíveis do relógio são <strong>Admin</strong> (Auxiliar de RH opera espelho/equipe, mas a sincronização forçada fica restrita conforme a política da Eletropasso).</p>

<h3>Depois do sync</h3>
<ol>
  <li>Abra o <a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a>.</li>
  <li>Clique em <strong>Recalcular período</strong>.</li>
  <li>Se houver batidas sem horas: confira PIS e turno do colaborador.</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/managing-employees">Cadastro de equipe e export DMPREP</a></li>
  <li><a href="/how-to-use/how-to-clock-in-and-out">Ponto no app (selfie)</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'banco-de-horas',
    title: 'Banco de horas',
    category: 'Ponto e jornada',
    displayOrder: 6,
    excerpt:
      'Como créditos e débitos do banco de horas nascem do recalculo do espelho de ponto.',
    contentHtml: `
<h3>De onde vem o saldo</h3>
<p>O <strong>banco de horas</strong> é alimentado quando o <a href="/how-to-use/espelho-de-ponto-ptrp">espelho</a> recalcula o período. Cada dia gera (ou não) lançamentos no razão (<code>hour_bank_ledger</code>).</p>

<h3>Tipos comuns de lançamento</h3>
<ul>
  <li><strong>Crédito de HE</strong> — horas além do esperado do turno (se a política do turno envia HE ao banco).</li>
  <li><strong>Débito por falta</strong> — minutos não cumpridos / ausência.</li>
  <li><strong>Compensação</strong> e <strong>ajuste manual</strong> — feitos pelo RH no espelho.</li>
  <li><strong>Fechamento do período</strong> — consolidação ao bloquear a competência.</li>
</ul>

<h3>Como consultar</h3>
<ol>
  <li>Abra o Espelho → escolha competência e colaborador.</li>
  <li>Veja o painel <strong>Banco de horas</strong> (saldo) e o extrato do período.</li>
  <li>Se o saldo parecer antigo: <strong>Recalcular período</strong> (e confira se o sync do relógio já rodou).</li>
</ol>

<h3>Boas práticas</h3>
<ul>
  <li>Alinhe a <a href="/how-to-use/configurando-turnos">carga diária líquida</a> do turno antes de recalcular.</li>
  <li>Documente ajustes manuais na observação.</li>
  <li>Competência <strong>bloqueada</strong> não deve ser editada sem desbloqueio controlado.</li>
</ul>
`.trim(),
  },

  // ─── Férias e afastamentos ────────────────────────────────────────
  {
    slug: 'how-to-apply-for-leave',
    title: 'Como solicitar férias ou afastamento',
    category: 'Férias e afastamentos',
    displayOrder: 1,
    excerpt:
      'Passo a passo para consultar saldo, enviar solicitação e acompanhar o status da aprovação.',
    contentHtml: `
<h3>Antes de solicitar</h3>
<ul>
  <li>Confira o saldo no menu <strong>Férias / Afastamentos</strong>.</li>
  <li>Veja os tipos disponíveis (anuais, médicos, personalizados — ver <a href="/how-to-use/custom-leave-types">tipos personalizados</a>).</li>
  <li>Confira feriados e a <a href="/how-to-use/understanding-leave-policies">política</a> da empresa.</li>
</ul>

<h3>Enviar pedido</h3>
<ol>
  <li>Abra Férias → <strong>Solicitar</strong> (ou o atalho no painel).</li>
  <li>Escolha o tipo, datas inicial e final (dias totais calculados automaticamente; meio dia = 0,5 quando aplicável).</li>
  <li>Descreva o motivo com clareza.</li>
  <li>Envie. O status inicial costuma ser <strong>pendente do gestor</strong> ou <strong>pendente do RH</strong>, conforme o fluxo do departamento.</li>
</ol>

<h3>Acompanhar</h3>
<p>Na lista de solicitações você vê o status. Notificações no sino e e-mail avisam mudanças — veja <a href="/how-to-use/notifications-guide">notificações</a>.</p>

<h3>Dicas</h3>
<ul>
  <li>Peça com antecedência, especialmente férias longas.</li>
  <li>Se não tiver gestor cadastrado, o fluxo pode ir direto ao Auxiliar de RH.</li>
</ul>
`.trim(),
  },

  {
    slug: 'leave-approval-for-managers',
    title: 'Aprovação de afastamentos — Gestores',
    category: 'Férias e afastamentos',
    displayOrder: 2,
    excerpt:
      'Como gestores aprovam ou rejeitam pedidos da equipe no fluxo em etapas.',
    contentHtml: `
<h3>Seu papel no fluxo</h3>
<p>Como <strong>Gestor</strong> ou <strong>Team Lead</strong>, você analisa pedidos dos reportes diretos. Em geral: colaborador solicita → você aprova → <a href="/how-to-use/leave-approval-for-hr">Auxiliar de RH</a> confirma.</p>

<h3>Onde agir</h3>
<ul>
  <li>Painel: contador de pendências.</li>
  <li>Menu Férias: aba/filtro de aprovações do gestor.</li>
  <li>Sino de <a href="/how-to-use/notifications-guide">notificações</a>.</li>
</ul>

<h3>Como decidir</h3>
<ol>
  <li>Abra o pedido: tipo, datas, dias, motivo e saldo.</li>
  <li><strong>Aprovar</strong> (com observação opcional) ou <strong>Rejeitar</strong> (informe o motivo).</li>
  <li>Após aprovar, o status passa a pendente do RH (salvo fluxo direto ao RH).</li>
</ol>

<h3>Boas práticas</h3>
<ul>
  <li>Responda rápido para não travar a escala.</li>
  <li>Considere cobertura do time e o <a href="/how-to-use/espelho-de-ponto-ptrp">espelho</a> no período.</li>
</ul>
`.trim(),
  },

  {
    slug: 'leave-approval-for-hr',
    title: 'Aprovação de afastamentos — Auxiliar de RH',
    category: 'Férias e afastamentos',
    displayOrder: 3,
    excerpt:
      'Aprovação final, rejeição, lançamentos manuais e override por Admin/Auxiliar de RH.',
    contentHtml: `
<h3>Aprovação final</h3>
<p><strong>Auxiliar de RH</strong> e <strong>Admin</strong> fazem a etapa final: após o gestor (quando houver), o pedido fica <strong>aprovado</strong> ou <strong>rejeitado</strong> de forma definitiva.</p>

<h3>Ações disponíveis</h3>
<ul>
  <li>Aprovar / rejeitar com observação.</li>
  <li>Criar lançamento manual (ex.: afastamento já acordado, meio dia 0,5).</li>
  <li>Ajustar totais quando a política permitir edição.</li>
</ul>

<h3>Impacto no ponto</h3>
<p>Dias de afastamento aprovado refletem no <a href="/how-to-use/espelho-de-ponto-ptrp">espelho</a> (status de licença). Após mudanças relevantes, <strong>Recalcular período</strong>.</p>

<h3>Fluxo por departamento</h3>
<p>Em <a href="/how-to-use/understanding-leave-policies">políticas e workflows</a>, um departamento pode ir direto ao RH (sem gestor). Sem gestor cadastrado, o sistema também encaminha ao RH.</p>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/custom-leave-types">Tipos personalizados</a></li>
  <li><a href="/how-to-use/notification-settings">Configurar notificações</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'understanding-leave-policies',
    title: 'Políticas de férias e afastamentos',
    category: 'Férias e afastamentos',
    displayOrder: 4,
    excerpt:
      'Cotas, sobrescritas por colaborador, workflows por departamento e feriados.',
    contentHtml: `
<h3>Onde configurar</h3>
<p><strong>Organização → Férias / Políticas</strong> (Admin e Auxiliar de RH). Defina cotas padrão por tipo e exceções por colaborador.</p>

<h3>Saldo</h3>
<p>Saldo ≈ cota do tipo − soma dos dias <strong>aprovados</strong> daquele tipo. Pedidos pendentes não consomem o saldo final até a aprovação.</p>

<h3>Workflow por departamento</h3>
<ul>
  <li>Aprovador gestor → depois RH.</li>
  <li>Aprovador direto RH/Admin — pula o gestor.</li>
</ul>
<p>Detalhes em <a href="/how-to-use/leave-approval-for-managers">aprovação do gestor</a> e <a href="/how-to-use/leave-approval-for-hr">aprovação do RH</a>.</p>

<h3>Feriados</h3>
<p>Cadastre feriados em Organização. Eles influenciam calendário e a apuração do espelho (dias de feriado).</p>

<h3>Tipos</h3>
<p>Além dos padrões, crie tipos em <a href="/how-to-use/custom-leave-types">tipos personalizados</a> (com ou sem controle de saldo).</p>
`.trim(),
  },

  {
    slug: 'custom-leave-types',
    title: 'Tipos personalizados de afastamento',
    category: 'Férias e afastamentos',
    displayOrder: 5,
    excerpt:
      'Criar tipos além do padrão: com saldo, sem saldo, meio dia e uso no fluxo de aprovação.',
    contentHtml: `
<h3>Para que serve</h3>
<p>Além de anuais, médicos etc., a Eletropasso pode cadastrar tipos próprios (ex.: doação de sangue, liberação sindical) em Organização.</p>

<h3>Com saldo × sem saldo</h3>
<ul>
  <li><strong>Com saldo</strong> — exige cota na política; o sistema desconta ao aprovar.</li>
  <li><strong>Sem saldo</strong> — rastreia o pedido sem quota (útil para afastamentos legais específicos).</li>
</ul>

<h3>Meio dia</h3>
<p>Em lançamentos manuais (RH), o total de dias pode ser <strong>0,5</strong>. No pedido do colaborador, use a opção de meio período quando estiver habilitada.</p>

<h3>Como cadastrar (resumo)</h3>
<ol>
  <li>Organização → tipos de afastamento.</li>
  <li>Informe nome, se controla saldo e descrição.</li>
  <li>Ajuste cotas em <a href="/how-to-use/understanding-leave-policies">políticas</a>.</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/how-to-apply-for-leave">Solicitar afastamento</a></li>
</ul>
`.trim(),
  },

  // ─── Equipe ───────────────────────────────────────────────────────
  {
    slug: 'managing-employees',
    title: 'Gerenciar equipe (diretório)',
    category: 'Equipe',
    displayOrder: 1,
    excerpt:
      'Diretório Equipe: cadastro, papéis Admin vs Auxiliar de RH vs Diretoria (sem ponto) e export DMPREP.',
    contentHtml: `
<h3>Diretório Equipe</h3>
<p>Em <strong>Equipe</strong> você lista colaboradores, filtra por departamento/papel e abre a ficha (dados, turno, gestor, PIS).</p>

<h3>Papéis na prática</h3>
<ul>
  <li><strong>Admin</strong> — cria contas, define papéis sensíveis, exporta para DMPREP e exclusões.</li>
  <li><strong>Auxiliar de RH</strong> — opera cadastros, turnos, onboarding CLT e rotina da equipe.</li>
  <li><strong>Diretoria (MANAGEMENT)</strong> — conta gerencial <strong>sem batida de ponto</strong> e sem checklist de relógio.</li>
  <li><strong>Colaborador / Gestor / Líder</strong> — sujeitos a ponto (app ou REP, conforme o caso).</li>
</ul>

<h3>Admissão CLT (relógio)</h3>
<ol>
  <li>Cadastre com PIS válido.</li>
  <li><strong>Enviar para DMPREP</strong> (MDB).</li>
  <li>Biometria no PrintPoint (função 91).</li>
  <li>Primeira batida → status pronto no RH (após sync).</li>
</ol>
<p>Detalhes: <a href="/how-to-use/sincronizacao-dmprep">sincronização DMPREP</a>.</p>

<h3>Exportações</h3>
<p>CSV/PDF do diretório: veja <a href="/how-to-use/exporting-employee-data">exportar dados da equipe</a>.</p>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/roles-and-permissions">Papéis e permissões</a></li>
  <li><a href="/how-to-use/configurando-turnos">Atribuir turnos</a></li>
</ul>
`.trim(),
  },

  // ─── Organização ──────────────────────────────────────────────────
  {
    slug: 'setting-up-organization',
    title: 'Configurar a organização',
    category: 'Organização',
    displayOrder: 1,
    excerpt:
      'Departamentos, equipes, turnos, locais GPS, feriados, workflows e sistema (visão Admin/RH).',
    contentHtml: `
<h3>Quem configura</h3>
<p><strong>Admin</strong> e <strong>Auxiliar de RH</strong> usam o menu <strong>Organização</strong>. Itens sensíveis (política PTRP, sync de relógio, billing) ficam prioritariamente com Admin.</p>

<h3>Abas principais</h3>
<ul>
  <li><strong>Estrutura</strong> — departamentos e cargos.</li>
  <li><strong>Equipes</strong> — times e líderes.</li>
  <li><strong>Alocação</strong> — gestor/linha e encaixe organizacional.</li>
  <li><strong>Turnos</strong> — ver guia dedicado <a href="/how-to-use/configurando-turnos">Configurando turnos</a>.</li>
  <li><strong>Workflows</strong> — aprovação de afastamentos por departamento.</li>
  <li><strong>Férias / Feriados</strong> — políticas e calendário.</li>
  <li><strong>Notificações</strong> — <a href="/how-to-use/notification-settings">o que o sistema dispara</a>.</li>
  <li><strong>Sistema</strong> — PTRP (dia 26), sync DMPREP, parâmetros gerais.</li>
</ul>

<h3>Locais e geofence</h3>
<p>Cadastre escritórios com lat/lng e raio para o ponto por selfie validar a área.</p>

<h3>Checklist rápido pós-setup</h3>
<ol>
  <li>Turno padrão + cargas corretas.</li>
  <li>Colaboradores com gestor e turno.</li>
  <li>Política de afastamentos e feriados do ano.</li>
  <li>Teste de ponto (selfie ou uma batida REP de teste).</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/welcome-to-openhr">Primeiros passos</a></li>
  <li><a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'configurando-turnos',
    title: 'Configurando turnos',
    category: 'Organização',
    displayOrder: 2,
    excerpt:
      'Carga diária líquida (min) define o Esperado; carga semanal é metadado; day_schedules no sábado; Recalcular no espelho.',
    contentHtml: `
<h3>Onde editar</h3>
<p><strong>Organização → Turnos</strong>. Cada turno tem horário base, tolerâncias, dias da semana e cargas.</p>

<h3>Carga diária líquida (minutos)</h3>
<p>O campo de <strong>carga diária</strong> / <code>expectedDailyMinutes</code> é o que o espelho usa como <strong>Esperado</strong> do dia (jornada líquida em minutos). Ajuste com cuidado: é a base de Meta / Falta / HE.</p>

<h3>Carga semanal</h3>
<p>A carga semanal (<code>expectedWeeklyMinutes</code>) é sobretudo <strong>metadado</strong> informativo. A apuração diária do espelho não “divide” a semana automaticamente a partir desse campo — o que manda no dia é a carga diária (e overrides).</p>

<h3>Horários por dia (day_schedules)</h3>
<p>Use para <strong>sábado meio período</strong> (ex.: 08:00–11:45) ou qualquer dia com jornada diferente do padrão. Você pode sobrescrever início, fim, intervalo e minutos esperados daquele dia da semana.</p>

<h3>Após alterar um turno</h3>
<ol>
  <li>Salve o turno e confira quem está vinculado (ficha do colaborador / alocação).</li>
  <li>Abra o <a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a> da competência afetada.</li>
  <li>Clique em <strong>Recalcular período</strong> — obrigatório para atualizar Esperado/Feito/banco.</li>
</ol>

<h3>Escala de sábado</h3>
<p>Além do horário no turno, a escala (Trabalha / Folga) define quem é cobrado naquele sábado. Quem está em Folga não gera falta.</p>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/banco-de-horas">Banco de horas</a></li>
  <li><a href="/how-to-use/setting-up-organization">Configurar a organização</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'notification-settings',
    title: 'Configurar notificações da organização',
    category: 'Organização',
    displayOrder: 3,
    excerpt:
      'Tipos de aviso (ponto, férias, desempenho), retenção e o que Admin/RH controlam na aba Notificações.',
    contentHtml: `
<h3>Onde</h3>
<p><strong>Organização → Notificações</strong>. Complementa o guia do usuário em <a href="/how-to-use/notifications-guide">sino e gestão de avisos</a>.</p>

<h3>Tipos típicos</h3>
<ul>
  <li><strong>Ponto</strong> — atrasos, lembretes de saída, ausências.</li>
  <li><strong>Férias/afastamentos</strong> — envio, aprovação, rejeição.</li>
  <li><strong>Desempenho</strong> — abertura de ciclo, prazos, mudanças de status.</li>
</ul>

<h3>Retenção</h3>
<p>Avisos no sino e selfies antigas tendem a ser limpos automaticamente (retenção ~30 dias, conforme jobs do servidor). Isso não apaga o espelho nem o histórico oficial de ponto.</p>

<h3>E-mail</h3>
<p>No deploy interno da Eletropasso, o envio depende do SMTP configurado no backend. Teste com o Admin se os e-mails não chegarem.</p>

<h3>Preferências do usuário</h3>
<p>Cada pessoa pode ajustar preferências em <a href="/how-to-use/managing-profile-settings">perfil / configurações</a>, dentro do que a organização permite.</p>
`.trim(),
  },

  // ─── Desempenho ───────────────────────────────────────────────────
  {
    slug: 'performance-review-self-assessment',
    title: 'Avaliação de desempenho — autoavaliação',
    category: 'Desempenho',
    displayOrder: 1,
    excerpt:
      'Como o colaborador preenche competências, comentários e envia a autoavaliação.',
    contentHtml: `
<h3>Quando participar</h3>
<p>Quando o RH abre um ciclo ativo, você recebe aviso e vê a avaliação em <strong>Desempenho</strong>.</p>

<h3>Passos</h3>
<ol>
  <li>Abra o ciclo e a sua ficha de avaliação.</li>
  <li>Note cada competência na escala definida pela organização.</li>
  <li>Escreva comentários objetivos (entregas, exemplos).</li>
  <li><strong>Envie</strong> — o status passa a aguardar o gestor.</li>
</ol>

<h3>Dicas</h3>
<ul>
  <li>Use fatos do período do ciclo (o sistema pode mostrar resumo de ponto/afastamentos).</li>
  <li>Revise antes de enviar; após o envio, a edição fica limitada.</li>
</ul>

<h3>Próximas etapas</h3>
<p>O gestor preenche a visão dele (<a href="/how-to-use/performance-review-for-managers">guia do gestor</a>); o RH calibra (<a href="/how-to-use/performance-review-hr-calibration">calibração</a>).</p>
`.trim(),
  },

  {
    slug: 'performance-review-for-managers',
    title: 'Avaliação de desempenho — Gestores',
    category: 'Desempenho',
    displayOrder: 2,
    excerpt:
      'Como o gestor revisa a autoavaliação, avalia competências e envia para o RH.',
    contentHtml: `
<h3>Seu papel</h3>
<p>Após a autoavaliação do colaborador, o <strong>gestor</strong> registra notas e feedback e encaminha ao RH.</p>

<h3>Passos</h3>
<ol>
  <li>Em Desempenho, abra as avaliações pendentes dos reportes.</li>
  <li>Leia a autoavaliação e o resumo do período.</li>
  <li>Atribua notas por competência e comentários construtivos.</li>
  <li>Envie para calibração do RH.</li>
</ol>

<h3>Boas práticas</h3>
<ul>
  <li>Seja específico e alinhado a evidências.</li>
  <li>Não atrase o ciclo — o RH depende do seu envio.</li>
</ul>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/performance-review-self-assessment">Autoavaliação</a></li>
  <li><a href="/how-to-use/performance-review-hr-calibration">Calibração RH</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'performance-review-hr-calibration',
    title: 'Avaliação de desempenho — Calibração RH',
    category: 'Desempenho',
    displayOrder: 3,
    excerpt:
      'Como o Auxiliar de RH/Admin fecha o ciclo: nota final, observações e gestão do ciclo.',
    contentHtml: `
<h3>Calibração</h3>
<p><strong>Auxiliar de RH</strong> e <strong>Admin</strong> revisam o conjunto de avaliações, alinham critérios e atribuem a <strong>nota geral final</strong> com observações de RH.</p>

<h3>Gestão do ciclo</h3>
<ul>
  <li>Criar/ativar ciclo (datas, competências).</li>
  <li>Acompanhar quem está em rascunho, enviado ou revisado pelo gestor.</li>
  <li>Finalizar avaliações → status concluído.</li>
  <li>Encerrar o ciclo ao término do período.</li>
</ul>

<h3>Comunicação</h3>
<p>O sistema notifica abertura, prazos e conclusões. Ajuste tipos em <a href="/how-to-use/notification-settings">notificações da organização</a>.</p>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/performance-review-for-managers">Visão do gestor</a></li>
</ul>
`.trim(),
  },

  // ─── Relatórios ───────────────────────────────────────────────────
  {
    slug: 'generating-reports',
    title: 'Gerar relatórios',
    category: 'Relatórios',
    displayOrder: 1,
    excerpt:
      'Relatórios de presença e afastamentos: dias de ausência são pessoa-dia; dados mesclam timesheet_days do espelho.',
    contentHtml: `
<h3>Onde</h3>
<p>Menu <strong>Relatórios</strong> (Admin / Auxiliar de RH). Escolha tipo, período, filtros e exporte CSV/PDF ou envie por e-mail quando disponível.</p>

<h3>Dias de ausência = pessoa-dia</h3>
<p>Nos indicadores de ausência, o total é em <strong>pessoa-dias</strong> (um colaborador ausente em um dia = 1). Dez pessoas ausentes no mesmo dia = 10 — não é “dias de calendário únicos”.</p>

<h3>Fonte dos dados de ponto</h3>
<p>Os relatórios de presença/ausência <strong>mesclam</strong> a tabela legada de attendance com os dias apurados do espelho (<code>timesheet_days</code> / PTRP), mapeando crachá/PIS → colaborador. Assim o relatório não “infla” ausência quando o ponto real está só no espelho REP.</p>

<h3>Boas práticas</h3>
<ol>
  <li>Sincronize o relógio e <strong>Recalcule</strong> o espelho antes de fechar o mês.</li>
  <li>Use o mesmo intervalo da competência 26→25 quando for bater com a folha.</li>
  <li>Exporte CSV para análise; PDF para compartilhar com gestão.</li>
</ol>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/espelho-de-ponto-ptrp">Espelho de ponto</a></li>
  <li><a href="/how-to-use/exporting-employee-data">Exportar equipe</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'exporting-employee-data',
    title: 'Exportar dados da equipe',
    category: 'Relatórios',
    displayOrder: 2,
    excerpt:
      'Exportar o diretório Equipe em CSV (análise) ou PDF (compartilhamento).',
    contentHtml: `
<h3>Onde exportar</h3>
<p>Em <strong>Equipe</strong>, use os botões de exportação no topo da lista (além dos <a href="/how-to-use/generating-reports">relatórios</a> de ponto/férias).</p>

<h3>CSV</h3>
<p>Planilha com nome, e-mail, departamento, cargo, papel, time, status, admissão e contatos — ideal para Excel/Sheets.</p>

<h3>PDF</h3>
<p>Documento formatado com identidade da organização, totais e listagem — bom para arquivo ou reunião.</p>

<h3>Dicas</h3>
<ul>
  <li>Aplique filtros (departamento, papel) antes de exportar.</li>
  <li>Quem exporta: Admin / Auxiliar de RH (conforme permissão).</li>
  <li>Para batidas e espelho, use o CSV do <a href="/how-to-use/espelho-de-ponto-ptrp">espelho</a> ou os relatórios de presença.</li>
</ul>
`.trim(),
  },

  // ─── Configurações ────────────────────────────────────────────────
  {
    slug: 'managing-profile-settings',
    title: 'Perfil e configurações pessoais',
    category: 'Configurações',
    displayOrder: 1,
    excerpt:
      'Atualizar nome, e-mail, senha, avatar e preferências do aplicativo.',
    contentHtml: `
<h3>Meu perfil</h3>
<p>Em <strong>Meu perfil</strong> / Configurações você vê os dados cadastrais (alguns campos só o RH altera: departamento, papel, turno, PIS).</p>

<h3>O que você pode mudar</h3>
<ul>
  <li>Nome de exibição e foto (convertida automaticamente para WebP).</li>
  <li>E-mail de login (com cuidado — é sua credencial).</li>
  <li>Senha.</li>
  <li>Preferências de tema — ver <a href="/how-to-use/theme-customization">personalizar tema</a>.</li>
  <li>Preferências de notificação, quando liberadas.</li>
</ul>

<h3>Dados de RH</h3>
<p>Gestor, time, turno e matrícula/PIS: solicite correção ao <strong>Auxiliar de RH</strong>. Divergência de PIS afeta o <a href="/how-to-use/espelho-de-ponto-ptrp">espelho</a>.</p>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/install-openhr-pwa">Instalar PWA</a></li>
  <li><a href="/how-to-use/notifications-guide">Notificações</a></li>
</ul>
`.trim(),
  },

  {
    slug: 'notifications-guide',
    title: 'Notificações (sino e e-mail)',
    category: 'Configurações',
    displayOrder: 2,
    excerpt:
      'Como funcionam o sino e os e-mails: eventos, leitura e gestão para Admin/RH.',
    contentHtml: `
<h3>Sino</h3>
<p>O ícone de sino no topo lista avisos recentes. Toque para marcar como lido e seguir o link da ação (férias, avaliação, etc.).</p>

<h3>Eventos comuns</h3>
<ul>
  <li>Solicitação / aprovação / rejeição de afastamento.</li>
  <li>Alertas de atraso ou ausência (para gestores/RH).</li>
  <li>Ciclos de desempenho e lembretes de prazo.</li>
  <li><a href="/how-to-use/announcements-guide">Comunicados</a> importantes.</li>
</ul>

<h3>Admin / Auxiliar de RH</h3>
<p>Há telas para enviar avisos administrativos e acompanhar volume. A política global fica em <a href="/how-to-use/notification-settings">Organização → Notificações</a>.</p>

<h3>E-mail</h3>
<p>Os mesmos eventos podem gerar e-mail, conforme SMTP e tipos habilitados no deploy interno.</p>
`.trim(),
  },

  {
    slug: 'theme-customization',
    title: 'Personalizar tema',
    category: 'Configurações',
    displayOrder: 3,
    excerpt:
      'Cores do aplicativo, modo claro/escuro e preferência do sistema.',
    contentHtml: `
<h3>Onde</h3>
<p>Em Configurações / Perfil, abra a seção de <strong>tema</strong>. A escolha fica salva na sua conta/dispositivo.</p>

<h3>Opções</h3>
<ul>
  <li>Paletas de cor disponíveis na instalação.</li>
  <li>Modo <strong>claro</strong>, <strong>escuro</strong> ou <strong>sistema</strong> (segue o SO).</li>
</ul>

<h3>Observações</h3>
<ul>
  <li>O tema não altera regras de ponto nem permissões.</li>
  <li>Em TV/projetor, prefira modo claro com contraste alto.</li>
</ul>

<h3>Relacionados</h3>
<ul>
  <li><a href="/how-to-use/managing-profile-settings">Perfil e configurações</a></li>
</ul>
`.trim(),
  },

  // ─── Geral ────────────────────────────────────────────────────────
  {
    slug: 'announcements-guide',
    title: 'Comunicados',
    category: 'Geral',
    displayOrder: 1,
    excerpt:
      'Ler comunicados da empresa e, para Admin/RH, criar avisos com público e validade.',
    contentHtml: `
<h3>Para todos</h3>
<p>Em <strong>Comunicados</strong> você lê avisos da organização (prioridade, autor, validade). Os mais recentes também aparecem no <a href="/how-to-use/understanding-dashboard">painel</a>.</p>

<h3>Para Admin / Auxiliar de RH</h3>
<ol>
  <li>Criar comunicado: título, conteúdo, prioridade.</li>
  <li>Definir papéis-alvo (ex.: só gestores, toda a empresa).</li>
  <li>Opcional: data de expiração.</li>
  <li>Publicar — pode gerar notificação no sino.</li>
</ol>

<h3>Boas práticas</h3>
<ul>
  <li>Um assunto por comunicado.</li>
  <li>Expire avisos temporários (campanhas, prazos).</li>
  <li>Não use comunicados para dados pessoais sensíveis.</li>
</ul>
`.trim(),
  },

  {
    slug: 'subscription-upgrade-options',
    title: 'Assinatura e upgrades',
    category: 'Geral',
    displayOrder: 2,
    excerpt:
      'Nota curta: o RH_Eletropasso é deploy interno — sem trial público nem upgrades de loja.',
    contentHtml: `
<h3>Deploy interno Eletropasso</h3>
<p>Esta instalação do <strong>RH_Eletropasso</strong> é <strong>interna</strong> (servidores da empresa). Não há loja pública, trial comercial nem “doar para ativar” como no OpenHR aberto.</p>

<h3>O que isso significa no dia a dia</h3>
<ul>
  <li>Acesso controlado por conta e <a href="/how-to-use/roles-and-permissions">papel</a> corporativo.</li>
  <li>Dúvidas de disponibilidade do sistema: fale com TI / Admin local.</li>
  <li>Telas de “upgrade” eventualmente visíveis no código-base do OpenHR <strong>não se aplicam</strong> ao uso normal aqui.</li>
</ul>

<h3>Voltar ao essencial</h3>
<ul>
  <li><a href="/how-to-use/welcome-to-openhr">Primeiros passos</a></li>
  <li><a href="/how-to-use/understanding-dashboard">Painel</a></li>
</ul>
`.trim(),
  },
];
