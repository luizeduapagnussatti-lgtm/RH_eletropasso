
export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'HR' | 'EMPLOYEE' | 'TEAM_LEAD' | 'MANAGEMENT';
export type WorkType = 'OFFICE' | 'FIELD';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE';
export type ClockOnboardingStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING_EXPORT'
  | 'PENDING_BIO'
  | 'READY'
  | 'ERROR';

/** After soft-discharge: wait until PrintPoint confirms ExcludeEmployeesList. */
export type ClockDischargeStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING_HARDWARE'
  | 'HARDWARE_CONFIRMED'
  | 'HARDWARE_FAILED';

export type HardwareCommandType =
  | 'ADD_EMPLOYEE'
  | 'REMOVE_EMPLOYEE'
  | 'UPDATE_EMPLOYEE'
  | 'ADD_BIOMETRIC'
  | 'REMOVE_BIOMETRIC';

export type HardwareSyncStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED';

export interface HardwareSyncQueueJob {
  id: string;
  organizationId: string;
  commandType: HardwareCommandType;
  targetEmployeeId?: string;
  status: HardwareSyncStatus;
  payload: {
    pis?: string;
    name?: string;
    credential?: string;
    [key: string]: unknown;
  };
  hardwareResponse?: Record<string, unknown> | null;
  errorMessage?: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  targetEmployeeName?: string;
}
export type SubscriptionStatus = 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'AD_SUPPORTED';

export type UpgradeRequestType = 'DONATION' | 'TRIAL_EXTENSION' | 'AD_SUPPORTED';
export type UpgradeRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DonationTier = 'TIER_3MO' | 'TIER_6MO' | 'TIER_1YR' | 'TIER_LIFETIME';

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
  displayOrder: number;
  isActive: boolean;
  created?: string;
}

export interface ShowcaseOrganization {
  id: string;
  name: string;
  logo: string;
  country?: string;
  industry?: string;
  websiteUrl?: string;
  tagline?: string;
  displayOrder: number;
  isActive: boolean;
  created?: string;
}

export interface AppTheme {
  id: string;
  name: string;
  colors: {
    primary: string;
    hover: string;
    light: string;
  };
}

export type EsocialAmbiente = 'PRODUCAO' | 'PRODUCAO_RESTRITA';

export interface Organization {
  id: string;
  name: string;
  address?: string;
  logo?: string;
  country?: string;
  cnpj?: string;
  legalName?: string;
  esocialAmbiente?: EsocialAmbiente;
  payrollContactEmail?: string;
  subscriptionStatus?: SubscriptionStatus;
  trialEndDate?: string;
  created?: string;
  updated?: string;
  // Computed fields
  userCount?: number;
  adminEmail?: string;
  adminVerified?: boolean;
}

export type PayrollConsolidationStatus = 'DRAFT' | 'APPROVED' | 'LOCKED';

export interface PayrollConsolidation {
  id: string;
  organizationId: string;
  employeeId: string;
  periodId?: string;
  referenceMonth: string;
  regularHours: number;
  extraHours50: number;
  extraHours100: number;
  nightHours: number;
  lateHours: number;
  absenceHours: number;
  status: PayrollConsolidationStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  employeeName?: string;
  employeeCpf?: string;
  employeePis?: string;
}

export type EsocialRubricInternalType = 'REGULAR' | 'HE_50' | 'HE_100' | 'NIGHT' | 'ABSENCE';

export interface EsocialRubricMapping {
  id: string;
  organizationId: string;
  internalType: EsocialRubricInternalType;
  rubricCode: string;
  description: string;
  active: boolean;
}

export type EsocialEventStatus =
  | 'DRAFT'
  | 'READY'
  | 'VALIDATED'
  | 'ERROR'
  | 'EXPORTED'
  | 'SENT_TO_ACCOUNTANT'
  | 'TRANSMITTED'
  | 'ACCEPTED';

export interface EsocialEvent {
  id: string;
  organizationId: string;
  periodId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: EsocialEventStatus;
  xmlPath?: string;
  validationErrors?: unknown[];
  created?: string;
  updated?: string;
}

export type PayrollAccountingWorkflowStatus =
  | 'READY'
  | 'SENT_TO_ACCOUNTING'
  | 'FOLHA_RECEIVED'
  | 'ACK_COLLECTING'
  | 'CLOSED';

export type PayrollSlipAckStatus = 'PENDING' | 'SIGNED' | 'CORRECTION_REQUESTED';

export interface PayrollAccountingHandoff {
  id: string;
  organizationId: string;
  periodId: string;
  workflowStatus: PayrollAccountingWorkflowStatus;
  sentToAccountingAt?: string;
  sentBy?: string;
  folhaReceivedAt?: string;
  folhaReceivedBy?: string;
  closedAt?: string;
  notes?: string;
}

export interface PayrollPaymentSlip {
  id: string;
  organizationId: string;
  periodId: string;
  employeeId: string;
  refRegularHours: number;
  refHe50Hours: number;
  refHe100Hours: number;
  refNightHours: number;
  refLateHours: number;
  refAbsenceHours: number;
  accHe50Hours?: number;
  accHe100Hours?: number;
  accNightHours?: number;
  accLateHours?: number;
  accAbsenceHours?: number;
  slipFilePath?: string;
  acknowledgmentStatus: PayrollSlipAckStatus;
  signedAt?: string;
  correctionNotes?: string;
  employeeName?: string;
  employeeCpf?: string;
  employeePis?: string;
}

export interface ClockSupervisor {
  id: string;
  organizationId: string;
  profileId?: string;
  code: string;
  pis: string;
  name: string;
  hasPassword: boolean;
  hasTechnicalPermission: boolean;
  hasDatetimePermission: boolean;
  hasPendrivePermission: boolean;
  hasBobbinPermission: boolean;
  isActive: boolean;
  created?: string;
  updated?: string;
}

export interface ClockSupervisorInput {
  id?: string;
  profileId?: string | null;
  code: string;
  pis: string;
  name: string;
  password?: string;
  hasTechnicalPermission: boolean;
  hasDatetimePermission: boolean;
  hasPendrivePermission: boolean;
  hasBobbinPermission: boolean;
  isActive: boolean;
}

export interface ClockSupervisorCommand {
  id: string;
  action: 'SEND' | 'CLEAR';
  status: 'SUCCESS' | 'ERROR';
  supervisorCount: number;
  performedBy?: string;
  errorMessage?: string;
  created: string;
}

/** WatchComm ops exposed via `/functions/v1/clock-command` (deny-list dangerous ops). */
export type ClockCommandOp =
  | 'status'
  | 'identity'
  | 'employer-read'
  | 'employee-list-read'
  | 'fingerprint-list-read'
  | 'set-datetime'
  | 'set-dst'
  | 'remove-dst'
  | 'include-holidays'
  | 'send-display-message'
  | 'clear-display-message'
  | 'send-employees'
  | 'remove-employee'
  | 'exclude-fingerprint'
  | 'exclude-fingerprint-orphans'
  | 'program-biometric-reader-use'
  | 'program-trigger-type'
  | 'update-communication-user'
  | 'set-net-info'
  | 'change-employer';

export interface ClockCommandResult {
  success: boolean;
  op: ClockCommandOp;
  command?: Record<string, unknown>;
  busy?: boolean;
  error?: string;
}

export interface ClockCommandLogEntry {
  id: string;
  operation: string;
  status: 'SUCCESS' | 'ERROR' | string;
  payloadSummary?: Record<string, unknown>;
  result?: Record<string, unknown>;
  performedBy?: string;
  errorMessage?: string;
  created: string;
}

/** Employee row as returned by `employee-list-read` on the clock. */
export interface ClockEmployeeOnDevice {
  pis: string;
  name?: string;
  code?: string;
}

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  trialEndDate?: string;
  daysRemaining?: number;
  isSuperAdmin: boolean;
  isReadOnly: boolean;  // true for EXPIRED
  isBlocked: boolean;   // true for SUSPENDED
  showAds: boolean;     // true for AD_SUPPORTED
}

export interface UpgradeRequest {
  id: string;
  organizationId: string;
  organizationName?: string;
  requestType: UpgradeRequestType;
  status: UpgradeRequestStatus;
  // Donation fields
  donationAmount?: number;
  donationTier?: DonationTier;
  donationReference?: string;
  donationScreenshot?: string;
  // Extension fields
  extensionReason?: string;
  extensionDays?: number;
  // Processing fields
  adminNotes?: string;
  processedBy?: string;
  processedAt?: string;
  created?: string;
}

export interface PlatformStats {
  totalOrganizations: number;
  totalUsers: number;
  activeOrganizations: number;
  trialOrganizations: number;
  expiredOrganizations: number;
  recentRegistrations: number;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  department?: string;
  organizationId?: string;
}

export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'TEMPORARY' | 'PJ';

export interface User {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  designation: string;
  avatar?: string;
  username?: string;
  teamId?: string;
  shiftId?: string;
  organizationId?: string;
  verified?: boolean;
  /** Vínculo: PJ = escalas only, sem ponto/espelho. */
  employmentType?: EmploymentType;
}

export type MessagingChannel = 'EMAIL' | 'WHATSAPP' | 'APP';
export type MessagingOutboxStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface OrgMessagingConfig {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  fromEmail: string;
  whatsappFrom: string;
  /** Seconds between WhatsApp messages in a batch (anti-ban Meta). Default 4. */
  whatsappDelaySeconds?: number;
  /** Milliseconds between e-mails in a batch. Default 800. */
  emailDelayMs?: number;
  /** Max WhatsApp messages per HTTP batch (client may split further). Default 25. */
  maxWhatsappPerBatch?: number;
  /** Longer pause every N WhatsApp sends. Default 10. */
  batchPauseEvery?: number;
  /** Seconds for the longer pause. Default 15. */
  batchPauseSeconds?: number;
}

export interface MessagingBatchOptions {
  whatsappDelayMs?: number;
  emailDelayMs?: number;
  jitterMs?: number;
  pauseEveryWhatsapp?: number;
  pauseDurationMs?: number;
  maxConsecutiveFailures?: number;
}

export interface MessagingOutboxEntry {
  id: string;
  organizationId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  recipientProfileId?: string;
  recipient: string;
  subject?: string;
  body: string;
  mediaFileName?: string;
  status: MessagingOutboxStatus;
  errorMessage?: string;
  referenceType?: string;
  referenceId?: string;
  sentAt?: string;
  created: string;
  updated: string;
}

export interface MessagingDispatchItem {
  recipientProfileId?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  subject?: string;
  body: string;
  mediaBase64?: string;
  mediaFileName?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface MessagingDispatchResult {
  id: string;
  status: MessagingOutboxStatus;
  error?: string;
}

export interface Employee extends User {
  joiningDate: string;
  /** Last day employed (inclusive). Days after this are outside employment. */
  terminationDate?: string;
  mobile: string;
  whatsappE164?: string;
  whatsappOptIn?: boolean;
  messagingChannelPref?: MessagingChannel[];
  emergencyContact: string;
  salary: number;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  location: string;
  cpf?: string;
  /** PrintPoint / DMP REP Credencial (Matrícula). May differ from PIS (employeeId). */
  clockCredential?: string;
  /** RH confirms fingerprint was enrolled on the PrintPoint (function 91). */
  clockBiometricRegistered?: boolean;
  nid?: string;
  password?: string;
  lineManagerId?: string;
  workType: WorkType;
  clockOnboardingStatus?: ClockOnboardingStatus;
  clockOnboardingAt?: string;
  clockOnboardingNotes?: string;
  /** Soft-discharge sync with PrintPoint; credential must remain set when INACTIVE. */
  clockDischargeStatus?: ClockDischargeStatus;
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'EARLY_OUT';
  location?: { lat: number; lng: number; address?: string };
  remarks?: string;
  selfie?: string;
  dutyType?: 'OFFICE' | 'FACTORY';
  organizationId?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  lineManagerId?: string;
  type: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: 'PENDING_MANAGER' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';
  appliedDate: string;
  approverRemarks?: string;
  managerRemarks?: string;
  organizationId?: string;
  attachmentPath?: string;
  cid?: string;
  certificateValidUntil?: string;
}

export interface LeaveBalance {
  employeeId: string;
  [key: string]: string | number;
}

export interface LeavePolicy {
  defaults: Record<string, number>;
  overrides: Record<string, Record<string, number>>;
}

export interface LeaveWorkflow {
  department: string;
  approverRole: 'LINE_MANAGER' | 'HR' | 'ADMIN';
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  isGovernment: boolean;
  type: 'FESTIVAL' | 'ISLAMIC' | 'NATIONAL' | 'STATE';
}

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
  status: 'SENT' | 'FAILED' | 'QUEUED';
  provider: string;
}

export interface RelayConfig {
  username: string;
  fromName: string;
  isActive: boolean;
  relayUrl: string;
  resendApiKey?: string;
  useDirectResend?: boolean;
}

export interface OfficeLocation {
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  status: 'DRAFT' | 'PUBLISHED';
  authorId: string;
  authorName: string;
  publishedAt: string;
  created: string;
  updated: string;
}

export interface Tutorial {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  status: 'DRAFT' | 'PUBLISHED';
  authorName: string;
  displayOrder: number;
  parentId: string;
  category: string;
  publishedAt: string;
  created: string;
  updated: string;
}

export type ShiftWeekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

/** Per-weekday override of base shift times (e.g. Saturday half-day). */
export interface ShiftDaySchedule {
  startTime: string;
  endTime: string;
  breakDurationMinutes?: number;
  breakEarliestStart?: string;
  breakLatestEnd?: string;
  expectedDailyMinutes?: number;
}

export interface Shift {
  id: string;
  name: string;
  code?: string;
  scheduleType?: 'FIXED' | 'FLEXIBLE' | 'SHIFT_12X36' | 'SCALE';
  startTime: string;
  endTime: string;
  lateGracePeriod: number;
  earlyOutGracePeriod: number;
  earliestCheckIn: string;
  autoSessionCloseTime: string;
  workingDays: string[];
  isDefault: boolean;
  breakDurationMinutes?: number;
  breakFlexible?: boolean;
  breakEarliestStart?: string;
  breakLatestEnd?: string;
  expectedDailyMinutes?: number;
  expectedWeeklyMinutes?: number;
  nightStart?: string;
  nightEnd?: string;
  overtimeToBank?: boolean;
  active?: boolean;
  /** Overrides keyed by weekday name (Monday…Sunday). Missing days use base times. */
  daySchedules?: Partial<Record<ShiftWeekday, ShiftDaySchedule>>;
}

export interface ShiftOverride {
  id: string;
  employeeId: string;
  shiftId: string;
  startDate: string;
  endDate: string;
  reason: string;
  organizationId?: string;
}

/** Who works / is off on a roster day (Saturday or holiday). */
export type RosterAssignmentStatus = 'WORK' | 'OFF';
export type RosterDayKind = 'SATURDAY' | 'HOLIDAY';

export interface WorkRosterAssignment {
  id: string;
  organizationId?: string;
  workDate: string;
  employeeId: string;
  status: RosterAssignmentStatus;
  dayKind: RosterDayKind;
  notes?: string;
  createdBy?: string;
  created?: string;
  updated?: string;
}

export type RosterSwapStatus =
  | 'PENDING_PEER'
  | 'PENDING_MANAGER'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface RosterSwapRequest {
  id: string;
  organizationId: string;
  workDate: string;
  dayKind: RosterDayKind;
  requesterEmployeeId: string;
  requesterProfileId?: string;
  targetEmployeeId: string;
  targetProfileId?: string;
  status: RosterSwapStatus;
  reason?: string;
  peerRespondedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  created?: string;
  updated?: string;
}

export type PunchDirection = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END' | 'UNKNOWN';
export type PunchSource = 'CLOCK' | 'MANUAL' | 'IMPORT' | 'SYSTEM';
/** Who set ignored_for_calc — AUTO from proximity dedupe; MANUAL from manager override. */
export type PunchIgnoreSource = 'AUTO' | 'MANUAL';

export interface Punch {
  id: string;
  organizationId?: string;
  employeeId: string;
  punchedAt: string;
  direction: PunchDirection;
  source: PunchSource;
  deviceId?: string;
  nsr?: string;
  rawPayload?: Record<string, unknown>;
  timesheetDayId?: string;
  /** When true, punch stays in audit but is excluded from slots/calc. */
  ignoredForCalc?: boolean;
  ignoreSource?: PunchIgnoreSource;
  ignoredAt?: string;
  ignoredBy?: string;
}

export type TimesheetPeriodStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'LOCKED';

export type TimesheetEmployeeReviewStatus = 'OPEN' | 'IN_REVIEW' | 'EMPLOYEE_SIGNED' | 'APPROVED';

export interface TimesheetEmployeeReview {
  id: string;
  organizationId: string;
  periodId: string;
  employeeId: string;
  profileId?: string;
  status: TimesheetEmployeeReviewStatus;
  submittedAt?: string;
  submittedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  employeeSignedAt?: string;
  employeeSelfiePath?: string;
  employeeSignaturePath?: string;
  employeeSignMetadata?: Record<string, unknown>;
}

export interface TimesheetPeriod {
  id: string;
  organizationId: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  status: TimesheetPeriodStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export type TimesheetDayStatus =
  | 'OK'
  | 'LATE'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'INCOMPLETE'
  | 'ADJUSTED'
  | 'OFF';

export interface TimesheetDay {
  id: string;
  organizationId: string;
  periodId: string;
  employeeId: string;
  workDate: string;
  shiftId?: string;
  expectedMinutes: number;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  absenceMinutes: number;
  status: TimesheetDayStatus;
  leaveRequestId?: string;
  firstPunchAt?: string;
  lastPunchAt?: string;
  calcVersion: number;
  manualAdjustment?: Record<string, unknown>;
  employeeAck: boolean;
  managerAck: boolean;
  remarks?: string;
}

export type HourBankEntryType = 'OT_CREDIT' | 'ABSENCE_DEBIT' | 'COMPENSATION' | 'MANUAL' | 'PERIOD_CLOSE';

export interface HourBankLedgerEntry {
  id: string;
  organizationId: string;
  employeeId: string;
  entryDate: string;
  minutesDelta: number;
  entryType: HourBankEntryType;
  timesheetDayId?: string;
  periodId?: string;
  balanceAfter?: number;
  createdBy?: string;
  notes?: string;
  created?: string;
}

export interface PtrpPolicy {
  bankEnabled: boolean;
  periodStartDay: number;
  weeklyOtThresholdMinutes: number;
  defaultBreakMinutes: number;
}

export interface AppConfig {
  companyName: string;
  timezone: string;
  currency: string;
  dateFormat: string;
  workingDays: string[];
  officeStartTime: string;
  officeEndTime: string;
  lateGracePeriod: number;
  earlyOutGracePeriod: number;
  earliestCheckIn?: string; // HH:mm - Earliest allowed punch-in
  autoSessionCloseTime?: string; // HH:mm - Auto check-out time
  defaultReportRecipient?: string;
  smtp?: RelayConfig;
  overtimeEnabled?: boolean;
  ptrpPolicy?: PtrpPolicy;
  /**
   * ISO date (YYYY-MM-DD) when the timekeeping device started collecting
   * punches. Timesheet days before this are treated as no-data (never a false
   * absence, never a bank debit). Leave empty if the clock has always run.
   */
  timesheetClockStartDate?: string;
  autoAbsentEnabled?: boolean;
  autoAbsentTime?: string; // HH:mm
  officeLocations?: OfficeLocation[];
  dutyLabel1?: string; // Display label for OFFICE duty type (default "Office")
  dutyLabel2?: string; // Display label for FACTORY duty type (default "Factory")
}

export interface RegistrationData {
  orgName: string;
  adminName: string;
  email: string;
  password: string;
  country: string;
  address?: string;
  logo?: File | null;
}

// Announcement Types
export type AnnouncementPriority = 'NORMAL' | 'URGENT';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  priority: AnnouncementPriority;
  targetRoles: Role[];
  expiresAt?: string;
  organizationId: string;
  created: string;
  updated: string;
}

// Notification Types
export type NotificationType = 'ANNOUNCEMENT' | 'LEAVE' | 'ATTENDANCE' | 'REVIEW' | 'SYSTEM' | 'NEW_REGISTRATION' | 'UPGRADE_REQUEST';
export type NotificationPriority = 'NORMAL' | 'URGENT';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  isRead: boolean;
  priority: NotificationPriority;
  referenceId?: string;
  referenceType?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  organizationId: string;
  created: string;
  updated: string;
}

// Notification Config Types
export type EmailDigestFrequency = 'IMMEDIATE' | 'DAILY' | 'WEEKLY' | 'OFF';

export interface OrgNotificationConfig {
  enabledTypes: NotificationType[];
  emailDigestFrequency: EmailDigestFrequency;
  quietHoursEnabled: boolean;
  quietHoursStart: string;   // HH:mm
  quietHoursEnd: string;     // HH:mm
}

export interface UserNotificationPreferences {
  mutedTypes: NotificationType[];
  emailDigestFrequency: EmailDigestFrequency;
}

// Performance Review Types
export type ReviewCycleType = 'MID_YEAR' | 'YEAR_END';
export type ReviewCycleStatus = 'UPCOMING' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
export type ReviewStatus = 'DRAFT' | 'SELF_REVIEW_SUBMITTED' | 'MANAGER_REVIEWED' | 'COMPLETED';
export type CompetencyId = string;
export type HROverallRating = string;

export interface CustomCompetency {
  id: string;
  name: string;
  description: string;
  behaviors: string[];
}

export interface CustomRatingScale {
  min: number;
  max: number;
  labels: { value: number; label: string; color: string }[];
}

export interface OrgReviewConfig {
  competencies: CustomCompetency[];
  ratingScale: CustomRatingScale;
  overallRatings: { value: string; label: string; color: string }[];
}

export interface CustomLeaveType {
  id: string;
  name: string;
  color: string;
  hasBalance: boolean;
}

export interface ReviewCycle {
  id: string;
  name: string;
  cycleType: ReviewCycleType;
  startDate: string;
  endDate: string;
  reviewStartDate: string;
  reviewEndDate: string;
  activeCompetencies: string[];
  isActive: boolean;
  status: ReviewCycleStatus;
  organizationId: string;
}

export interface CompetencyRating {
  competencyId: string;
  rating: number;
  comment: string;
}

export interface AttendanceSummary {
  totalWorkingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  earlyOutDays: number;
  attendancePercentage: number;
}

// Per-employee summary row for the Employee Summary Report
export interface EmployeeAttendanceSummary {
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number;
  halfDays: number;
  attendancePercentage: number;
}

export interface LeaveSummary {
  typeBreakdown: Record<string, number>;
  totalLeaveDays: number;
  // Legacy fields for backward compat with old reviews
  annualLeaveTaken?: number;
  casualLeaveTaken?: number;
  sickLeaveTaken?: number;
  unpaidLeaveTaken?: number;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  employeeName: string;
  cycleId: string;
  lineManagerId?: string;
  managerName?: string;
  status: ReviewStatus;
  submittedAt?: string;
  managerReviewedAt?: string;
  completedAt?: string;
  // Self-assessment ratings
  selfRatings: CompetencyRating[];
  // Manager ratings
  managerRatings: CompetencyRating[];
  // Attendance summary
  attendanceSummary: AttendanceSummary;
  // Leave summary
  leaveSummary: LeaveSummary;
  // HR finalization
  hrFinalRemarks?: string;
  hrOverallRating?: HROverallRating;
  finalizedBy?: string;
  organizationId: string;
}
