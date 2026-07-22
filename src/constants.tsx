import { AppConfig, CustomCompetency, CustomLeaveType, OrgReviewConfig, OrgNotificationConfig, UserNotificationPreferences, PtrpPolicy } from './types';

export const DEPARTMENTS = [
  "Engenharia",
  "Recursos Humanos",
  "Financeiro",
  "Operações",
  "Marketing",
  "Vendas",
  "Produto",
  "Fábrica"
];

export const DESIGNATIONS = [
  "Desenvolvedor Sênior",
  "Desenvolvedor Júnior",
  "Gerente de RH",
  "Líder de Operações",
  "Assistente Financeiro",
  "Especialista de Marketing",
  "Designer UX",
  "Supervisor de Fábrica",
  "Técnico de Campo"
];

export const OFFICE_LOCATIONS = [
  { name: "Matriz", lat: -23.5505, lng: -46.6333, radius: 500 },
  { name: "Filial", lat: -22.9068, lng: -43.1729, radius: 500 },
  { name: "Fábrica", lat: -23.9999, lng: -46.5000, radius: 2000 },
  { name: "Escritório remoto", lat: 0, lng: 0, radius: 9999999 }
];

export const DEFAULT_COMPETENCIES: CustomCompetency[] = [
  {
    id: 'AGILITY',
    name: 'Agilidade',
    description: 'Adapta-se rapidamente a prioridades em mudança e conduz a gestão transparente da mudança.',
    behaviors: ['Transparência na mudança', 'Envolver outros nas decisões', 'Construir equipes flexíveis', 'Tomar decisões no tempo certo'],
  },
  {
    id: 'COLLABORATION',
    name: 'Colaboração',
    description: 'Trabalha bem entre equipes, compartilha conhecimento e constrói confiança.',
    behaviors: ['Compartilhamento de conhecimento', 'Fortalecer redes', 'Acolher diversidade de opinião', 'Construir confiança'],
  },
  {
    id: 'CUSTOMER_FOCUS',
    name: 'Foco no cliente',
    description: 'Entende e antecipa necessidades do cliente para entregar valor excepcional.',
    behaviors: ['Entender necessidades do cliente', 'Construir relacionamentos', 'Engajar em diálogo digital', 'Confirmar satisfação'],
  },
  {
    id: 'DEVELOPING_OTHERS',
    name: 'Desenvolvimento de pessoas',
    description: 'Investe no crescimento da equipe com coaching, feedback e oportunidades de desenvolvimento.',
    behaviors: ['Motivar a equipe', 'Definir prioridades de desenvolvimento', 'Dar feedback construtivo', 'Avaliar capacidades'],
  },
  {
    id: 'GLOBAL_MINDSET',
    name: 'Visão ampla',
    description: 'Pensa no impacto organizacional e adapta-se a diferentes contextos.',
    behaviors: ['Visão da organização', 'Consciência de implicações', 'Adaptação cultural', 'Pensamento interfuncional'],
  },
  {
    id: 'INNOVATION_MINDSET',
    name: 'Inovação',
    description: 'Incentiva experimentação, acolhe novas ideias e impulsiona soluções criativas.',
    behaviors: ['Prototipagem rápida', 'Compartilhar ideias abertamente', 'Incentivar experimentação', 'Expressão criativa'],
  },
];

// Keep old name as alias for backward compat during transition
export const PERFORMANCE_COMPETENCIES = DEFAULT_COMPETENCIES;

export const DEFAULT_RATING_SCALE: {
  value: number;
  label: string;
  color: string;
}[] = [
  { value: 1, label: 'Necessita melhoria significativa', color: 'bg-red-500' },
  { value: 2, label: 'Abaixo do esperado', color: 'bg-orange-500' },
  { value: 3, label: 'Atende às expectativas', color: 'bg-yellow-500' },
  { value: 4, label: 'Supera as expectativas', color: 'bg-blue-500' },
  { value: 5, label: 'Excepcional', color: 'bg-green-500' },
];

export const RATING_SCALE = DEFAULT_RATING_SCALE;

export const DEFAULT_OVERALL_RATINGS: {
  value: string;
  label: string;
  color: string;
}[] = [
  { value: 'EXCELLENT', label: 'Excelente', color: 'bg-green-500' },
  { value: 'VERY_GOOD', label: 'Muito bom', color: 'bg-blue-500' },
  { value: 'GOOD', label: 'Bom', color: 'bg-yellow-500' },
  { value: 'NEEDS_IMPROVEMENT', label: 'Necessita melhoria', color: 'bg-orange-500' },
  { value: 'UNSATISFACTORY', label: 'Insatisfatório', color: 'bg-red-500' },
];

export const HR_OVERALL_RATINGS = DEFAULT_OVERALL_RATINGS;

export const DEFAULT_LEAVE_TYPES: CustomLeaveType[] = [
  { id: 'ANNUAL', name: 'Férias anuais', color: 'bg-primary', hasBalance: true },
  { id: 'CASUAL', name: 'Licença eventual', color: 'bg-emerald-500', hasBalance: true },
  { id: 'SICK', name: 'Atestado médico', color: 'bg-rose-500', hasBalance: true },
  { id: 'MATERNITY', name: 'Licença-maternidade', color: 'bg-pink-500', hasBalance: false },
  { id: 'PATERNITY', name: 'Licença-paternidade', color: 'bg-indigo-500', hasBalance: false },
  { id: 'EARNED', name: 'Licença remunerada', color: 'bg-amber-500', hasBalance: false },
  { id: 'UNPAID', name: 'Licença não remunerada', color: 'bg-slate-500', hasBalance: false },
];

export const DEFAULT_REVIEW_CONFIG: OrgReviewConfig = {
  competencies: DEFAULT_COMPETENCIES,
  ratingScale: {
    min: 1,
    max: 5,
    labels: DEFAULT_RATING_SCALE,
  },
  overallRatings: DEFAULT_OVERALL_RATINGS,
};

export const DEFAULT_NOTIFICATION_CONFIG: OrgNotificationConfig = {
  enabledTypes: ['ANNOUNCEMENT', 'LEAVE', 'ATTENDANCE', 'REVIEW', 'SYSTEM'],
  emailDigestFrequency: 'IMMEDIATE',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const DEFAULT_USER_NOTIFICATION_PREFS: UserNotificationPreferences = {
  mutedTypes: [],
  emailDigestFrequency: 'IMMEDIATE',
};

export const TIMEZONE_OPTIONS = [
  { group: "UTC", zones: [
    { label: "UTC (GMT+0)", value: "UTC" },
  ]},
  { group: "Africa", zones: [
    { label: "Africa/Cairo (GMT+2)", value: "Africa/Cairo" },
    { label: "Africa/Johannesburg (GMT+2)", value: "Africa/Johannesburg" },
    { label: "Africa/Lagos (GMT+1)", value: "Africa/Lagos" },
    { label: "Africa/Nairobi (GMT+3)", value: "Africa/Nairobi" },
  ]},
  { group: "America", zones: [
    { label: "America/Argentina/Buenos_Aires (GMT-3)", value: "America/Argentina/Buenos_Aires" },
    { label: "America/Mexico_City (GMT-6)", value: "America/Mexico_City" },
    { label: "America/New_York (GMT-5)", value: "America/New_York" },
    { label: "America/Sao_Paulo (GMT-3)", value: "America/Sao_Paulo" },
    { label: "America/Toronto (GMT-5)", value: "America/Toronto" },
  ]},
  { group: "Asia", zones: [
    { label: "Asia/Bahrain (GMT+3)", value: "Asia/Bahrain" },
    { label: "Asia/Bangkok (GMT+7)", value: "Asia/Bangkok" },
    { label: "Asia/Colombo (GMT+5:30)", value: "Asia/Colombo" },
    { label: "Asia/Dhaka (GMT+6)", value: "Asia/Dhaka" },
    { label: "Asia/Dubai (GMT+4)", value: "Asia/Dubai" },
    { label: "Asia/Ho_Chi_Minh (GMT+7)", value: "Asia/Ho_Chi_Minh" },
    { label: "Asia/Hong_Kong (GMT+8)", value: "Asia/Hong_Kong" },
    { label: "Asia/Jakarta (GMT+7)", value: "Asia/Jakarta" },
    { label: "Asia/Jerusalem (GMT+2)", value: "Asia/Jerusalem" },
    { label: "Asia/Karachi (GMT+5)", value: "Asia/Karachi" },
    { label: "Asia/Kathmandu (GMT+5:45)", value: "Asia/Kathmandu" },
    { label: "Asia/Kolkata (GMT+5:30)", value: "Asia/Kolkata" },
    { label: "Asia/Kuala_Lumpur (GMT+8)", value: "Asia/Kuala_Lumpur" },
    { label: "Asia/Kuwait (GMT+3)", value: "Asia/Kuwait" },
    { label: "Asia/Manila (GMT+8)", value: "Asia/Manila" },
    { label: "Asia/Muscat (GMT+4)", value: "Asia/Muscat" },
    { label: "Asia/Qatar (GMT+3)", value: "Asia/Qatar" },
    { label: "Asia/Riyadh (GMT+3)", value: "Asia/Riyadh" },
    { label: "Asia/Seoul (GMT+9)", value: "Asia/Seoul" },
    { label: "Asia/Shanghai (GMT+8)", value: "Asia/Shanghai" },
    { label: "Asia/Singapore (GMT+8)", value: "Asia/Singapore" },
    { label: "Asia/Taipei (GMT+8)", value: "Asia/Taipei" },
    { label: "Asia/Tokyo (GMT+9)", value: "Asia/Tokyo" },
  ]},
  { group: "Australia", zones: [
    { label: "Australia/Sydney (GMT+10)", value: "Australia/Sydney" },
  ]},
  { group: "Europe", zones: [
    { label: "Europe/Amsterdam (GMT+1)", value: "Europe/Amsterdam" },
    { label: "Europe/Berlin (GMT+1)", value: "Europe/Berlin" },
    { label: "Europe/Brussels (GMT+1)", value: "Europe/Brussels" },
    { label: "Europe/Copenhagen (GMT+1)", value: "Europe/Copenhagen" },
    { label: "Europe/Dublin (GMT+0)", value: "Europe/Dublin" },
    { label: "Europe/Helsinki (GMT+2)", value: "Europe/Helsinki" },
    { label: "Europe/Istanbul (GMT+3)", value: "Europe/Istanbul" },
    { label: "Europe/London (GMT+0)", value: "Europe/London" },
    { label: "Europe/Madrid (GMT+1)", value: "Europe/Madrid" },
    { label: "Europe/Oslo (GMT+1)", value: "Europe/Oslo" },
    { label: "Europe/Paris (GMT+1)", value: "Europe/Paris" },
    { label: "Europe/Rome (GMT+1)", value: "Europe/Rome" },
    { label: "Europe/Stockholm (GMT+1)", value: "Europe/Stockholm" },
    { label: "Europe/Vienna (GMT+1)", value: "Europe/Vienna" },
    { label: "Europe/Zurich (GMT+1)", value: "Europe/Zurich" },
  ]},
  { group: "Pacific", zones: [
    { label: "Pacific/Auckland (GMT+12)", value: "Pacific/Auckland" },
  ]},
];

export const DEFAULT_CONFIG: AppConfig = {
  companyName: "Eletropasso — Materiais Elétricos e Energia Solar",
  timezone: "UTC",
  currency: "USD",
  dateFormat: "DD/MM/YYYY",
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  officeStartTime: "09:00",
  officeEndTime: "18:00",
  lateGracePeriod: 5,
  earlyOutGracePeriod: 15,
  defaultReportRecipient: "",
  dutyLabel1: "Escritório",
  dutyLabel2: "Fábrica",
  ptrpPolicy: {
    bankEnabled: false,
    periodStartDay: 1,
    weeklyOtThresholdMinutes: 2400,
    defaultBreakMinutes: 60,
  },
};

export const DEFAULT_PTRP_POLICY: PtrpPolicy = {
  bankEnabled: false,
  periodStartDay: 1,
  weeklyOtThresholdMinutes: 2400,
  defaultBreakMinutes: 60,
};