import { authService } from './auth.service';
import { employeeService } from './employee.service';
import { attendanceService } from './attendance.service';
import { leaveService } from './leave.service';
import { organizationService } from './organization.service';
import { verificationService } from './verification.service';
import { shiftService } from './shift.service';
import { punchService } from './punch.service';
import { timesheetService } from './timesheet.service';
import { hourBankService } from './hourBank.service';
import { rosterService } from './roster.service';
import { rosterSwapService } from './rosterSwap.service';
import { reviewService } from './review.service';
import { announcementService } from './announcement.service';
import { notificationService } from './notification.service';
import { superAdminService } from './superadmin.service';
import { apiClient } from './api.client';
import { dmprepSyncService } from './dmprepSync.service';
import { payrollReadinessService } from './payrollReadiness.service';
import { payrollConsolidationService } from './payrollConsolidation.service';
import { payrollAccountingService } from './payrollAccounting.service';
import { accountingExportService } from './accountingExport.service';
import { esocialRubricService } from './esocialRubric.service';
import { esocialPackageService } from './esocialPackage.service';
import { esocialTransmissionService } from './esocialTransmission.service';
import { timesheetPdfExportService } from './timesheetPdfExport.service';
import { clockSupervisorService } from './clockSupervisor.service';
import { clockCommandService } from './clockCommand.service';

export const hrService = {
  subscribe: apiClient.subscribe.bind(apiClient),
  notify: apiClient.notify.bind(apiClient),

  // Auth
  login: authService.login,
  logout: authService.logout,
  finalizePasswordReset: authService.finalizePasswordReset,
  registerOrganization: authService.registerOrganization,
  requestVerificationEmail: authService.requestVerificationEmail,
  confirmVerification: verificationService.verifyEmailToken,

  // Employee
  getEmployees: employeeService.getEmployees,
  addEmployee: employeeService.addEmployee,
  updateProfile: employeeService.updateProfile,
  deleteEmployee: employeeService.deleteEmployee,
  activateUser: verificationService.adminActivateUser,
  listClockSupervisors: clockSupervisorService.list,
  getClockSupervisorOverview: clockSupervisorService.getOverview,
  createClockSupervisor: clockSupervisorService.create,
  updateClockSupervisor: clockSupervisorService.update,
  deleteClockSupervisor: clockSupervisorService.remove,

  // Attendance
  getAttendance: attendanceService.getAttendance,
  getActiveAttendance: attendanceService.getActiveAttendance,
  getActiveAttendanceWithReconciliation: attendanceService.getActiveAttendanceWithReconciliation,
  saveAttendance: attendanceService.saveAttendance,
  updateAttendance: attendanceService.updateAttendance,
  deleteAttendance: attendanceService.deleteAttendance,
  retryPendingSelfies: attendanceService.retryPendingSelfies,
  drainCheckInQueue: attendanceService.drainCheckInQueue,

  // Leaves (Delegate to leaveService)
  getLeaves: leaveService.getLeaves,
  saveLeaveRequest: leaveService.saveLeaveRequest,
  updateLeaveStatus: leaveService.updateLeaveStatus,
  getLeaveBalance: leaveService.getLeaveBalance,
  adminCreateLeave: leaveService.adminCreateLeave,
  adminUpdateLeave: leaveService.adminUpdateLeave,
  adminDeleteLeave: leaveService.adminDeleteLeave,

  // Organization & Config
  prefetchMetadata: organizationService.prefetchMetadata,
  getConfig: organizationService.getConfig,
  setConfig: organizationService.setConfig,
  getDepartments: organizationService.getDepartments,
  setDepartments: organizationService.setDepartments,
  getDesignations: organizationService.getDesignations,
  setDesignations: organizationService.setDesignations,
  getHolidays: organizationService.getHolidays,
  setHolidays: organizationService.setHolidays,
  getTeams: organizationService.getTeams,
  createTeam: organizationService.createTeam,
  updateTeam: organizationService.updateTeam,
  deleteTeam: organizationService.deleteTeam,
  getWorkflows: organizationService.getWorkflows,
  setWorkflows: organizationService.setWorkflows,
  getLeavePolicy: organizationService.getLeavePolicy,
  setLeavePolicy: organizationService.setLeavePolicy,
  getReviewConfig: organizationService.getReviewConfig,
  setReviewConfig: organizationService.setReviewConfig,
  getLeaveTypes: organizationService.getLeaveTypes,
  setLeaveTypes: organizationService.setLeaveTypes,
  sendCustomEmail: organizationService.sendCustomEmail,
  getReportQueueLog: organizationService.getReportQueueLog,
  testPocketBaseConnection: organizationService.testPocketBaseConnection,

  // Shifts
  getShifts: shiftService.getShifts.bind(shiftService),
  createShift: shiftService.createShift.bind(shiftService),
  updateShift: shiftService.updateShift.bind(shiftService),
  deleteShift: shiftService.deleteShift.bind(shiftService),
  getShiftOverrides: shiftService.getShiftOverrides.bind(shiftService),
  setShiftOverrides: shiftService.setShiftOverrides.bind(shiftService),
  resolveShiftForEmployee: shiftService.resolveShiftForEmployee.bind(shiftService),

  // Work roster (Saturdays / holidays)
  listRosterAssignments: rosterService.listAssignments.bind(rosterService),
  listRosterForDate: rosterService.listForDate.bind(rosterService),
  listRosterForEmployee: rosterService.listForEmployee.bind(rosterService),
  saveRosterDay: rosterService.saveDay.bind(rosterService),
  listRosterSwapRequests: rosterSwapService.listForProfile.bind(rosterSwapService),
  listPendingRosterSwaps: rosterSwapService.listPendingManager.bind(rosterSwapService),
  createRosterSwapRequest: rosterSwapService.createRequest.bind(rosterSwapService),
  respondRosterSwapPeer: rosterSwapService.respondPeer.bind(rosterSwapService),
  approveRosterSwap: rosterSwapService.approveManager.bind(rosterSwapService),
  cancelRosterSwapRequest: rosterSwapService.cancelRequest.bind(rosterSwapService),

  // PTRP — punches / timesheet / hour bank
  // listPunches uses `this.applyProximityAutoIgnorePlan` — must keep punchService as `this`
  listPunches: punchService.listPunches.bind(punchService),
  createManualPunch: punchService.createManualPunch.bind(punchService),
  updateManualPunch: punchService.updateManualPunch.bind(punchService),
  deletePunch: punchService.deletePunch.bind(punchService),
  setPunchIgnoredForCalc: punchService.setPunchIgnoredForCalc.bind(punchService),
  applyFixedBreakPunches: punchService.applyFixedBreakPunches.bind(punchService),
  getOrCreateTimesheetPeriod: timesheetService.getOrCreatePeriod.bind(timesheetService),
  listTimesheetPeriods: timesheetService.listPeriods.bind(timesheetService),
  setTimesheetPeriodStatus: timesheetService.setPeriodStatus.bind(timesheetService),
  listTimesheetDays: timesheetService.listDays.bind(timesheetService),
  listTimesheetDaysInRange: timesheetService.listDaysInRange.bind(timesheetService),
  recalculateTimesheetDay: timesheetService.recalculateDay.bind(timesheetService),
  recalculateTimesheetPeriod: timesheetService.recalculatePeriod.bind(timesheetService),
  acknowledgeTimesheetDay: timesheetService.acknowledgeDay.bind(timesheetService),
  acknowledgeTimesheetDays: timesheetService.acknowledgeDays.bind(timesheetService),
  applyTimesheetAdjustment: timesheetService.applyManualAdjustment.bind(timesheetService),
  exportTimesheetCsv: timesheetService.exportPeriodCsv.bind(timesheetService),
  exportTimesheetMirrorPdf: timesheetPdfExportService.exportMirrorPdf.bind(timesheetPdfExportService),
  generateEsocialStub: timesheetService.generateEsocialStub.bind(timesheetService),

  // Pré-folha / eSocial
  listPayrollReadinessGaps: payrollReadinessService.listGapsForPeriod.bind(payrollReadinessService),
  exportPayrollReadinessCsv: payrollReadinessService.exportGapsCsv.bind(payrollReadinessService),
  listPayrollConsolidations: payrollConsolidationService.listForPeriod.bind(payrollConsolidationService),
  buildPayrollConsolidation: payrollConsolidationService.buildForPeriod.bind(payrollConsolidationService),
  setPayrollConsolidationStatus: payrollConsolidationService.setStatus.bind(payrollConsolidationService),
  buildPayrollExportV1: payrollConsolidationService.buildExportV1.bind(payrollConsolidationService),
  exportPayrollCsv: payrollConsolidationService.exportCsv.bind(payrollConsolidationService),
  getPayrollAccountingHandoff: payrollAccountingService.getHandoff.bind(payrollAccountingService),
  listPayrollPaymentSlips: payrollAccountingService.listSlips.bind(payrollAccountingService),
  sendPayrollToAccounting: payrollAccountingService.sendToAccounting.bind(payrollAccountingService),
  markPayrollFolhaReceived: payrollAccountingService.markFolhaReceived.bind(payrollAccountingService),
  updatePayrollSlipAccounting: payrollAccountingService.updateSlipAccountingValues.bind(payrollAccountingService),
  uploadPayrollSlipFile: payrollAccountingService.uploadSlipFile.bind(payrollAccountingService),
  signPayrollSlip: payrollAccountingService.signSlip.bind(payrollAccountingService),
  requestPayrollSlipCorrection: payrollAccountingService.requestCorrection.bind(payrollAccountingService),
  closePayrollAccountingPeriod: payrollAccountingService.closePeriod.bind(payrollAccountingService),
  buildAccountingMirrorZip: accountingExportService.buildAccountingZip.bind(accountingExportService),
  listEsocialRubrics: esocialRubricService.list.bind(esocialRubricService),
  saveEsocialRubrics: esocialRubricService.saveAll.bind(esocialRubricService),
  generateS1200Draft: esocialPackageService.generateAndStoreS1200.bind(esocialPackageService),
  buildEsocialZipPackage: esocialPackageService.buildZipPackage.bind(esocialPackageService),
  markEsocialSentToAccountant: esocialPackageService.markSentToAccountant.bind(esocialPackageService),
  listEsocialEventsForPeriod: esocialPackageService.listEventsForPeriod.bind(esocialPackageService),
  getEsocialTransmissionConfig: esocialTransmissionService.getConfig.bind(esocialTransmissionService),
  listTimesheetEmployeeReviews: timesheetService.listEmployeeReviews.bind(timesheetService),
  getTimesheetEmployeeReview: timesheetService.getEmployeeReview.bind(timesheetService),
  submitTimesheetEmployeeReview: timesheetService.submitEmployeeReview.bind(timesheetService),
  approveTimesheetEmployeeReview: timesheetService.approveEmployeeReview.bind(timesheetService),
  signTimesheetEmployeeReview: timesheetService.signEmployeeReview.bind(timesheetService),
  getTimesheetSignatureUrl: timesheetService.getTimesheetSignatureUrl.bind(timesheetService),
  getTimesheetPeriodLockReadiness: timesheetService.getPeriodLockReadiness.bind(timesheetService),
  lockTimesheetPeriod: timesheetService.lockPeriod.bind(timesheetService),
  listHourBankEntries: hourBankService.listEntries.bind(hourBankService),
  getHourBankBalance: hourBankService.getBalance.bind(hourBankService),
  addHourBankEntry: hourBankService.addEntry.bind(hourBankService),

  // Performance Reviews
  getReviewCycles: reviewService.getReviewCycles,
  createReviewCycle: reviewService.createReviewCycle,
  updateReviewCycle: reviewService.updateReviewCycle,
  deleteReviewCycle: reviewService.deleteReviewCycle,
  getReviews: reviewService.getReviews,
  getReviewById: reviewService.getReviewById,
  createReview: reviewService.createReview,
  submitSelfAssessment: reviewService.submitSelfAssessment,
  submitManagerReview: reviewService.submitManagerReview,
  finalizeReview: reviewService.finalizeReview,
  deleteReview: reviewService.deleteReview,
  adminUpdateReview: reviewService.adminUpdateReview,
  calculateAttendanceSummary: reviewService.calculateAttendanceSummary,
  calculateLeaveSummary: reviewService.calculateLeaveSummary,

  // Announcements
  getAnnouncements: announcementService.getAnnouncements,
  createAnnouncement: announcementService.createAnnouncement,
  updateAnnouncement: announcementService.updateAnnouncement,
  deleteAnnouncement: announcementService.deleteAnnouncement,

  // Notifications
  getNotifications: notificationService.getNotifications,
  getAllNotifications: notificationService.getAllNotifications,
  deleteNotification: notificationService.deleteNotification,
  deleteAllNotifications: notificationService.deleteAllNotifications,
  createNotification: notificationService.createNotification,
  createBulkNotifications: notificationService.createBulkNotifications,
  getUnreadCount: notificationService.getUnreadCount,
  markAsRead: notificationService.markAsRead,
  markAllAsRead: notificationService.markAllAsRead,
  getUserNotificationPreferences: notificationService.getUserPreferences,
  setUserNotificationPreferences: notificationService.setUserPreferences,

  // Notification Config (Org-level)
  getNotificationConfig: organizationService.getNotificationConfig,
  setNotificationConfig: organizationService.setNotificationConfig,

  // Onboarding & Guide Links
  getOnboardingStatus: organizationService.getOnboardingStatus,
  setOnboardingStatus: organizationService.setOnboardingStatus,
  getGuideHelpLinks: organizationService.getGuideHelpLinks,

  // Super Admin — Bulk Email
  resolveBulkRecipients: superAdminService.resolveBulkRecipients.bind(superAdminService),
  previewBulkRecipients: superAdminService.previewBulkRecipients.bind(superAdminService),
  sendBulkEmail: superAdminService.sendBulkEmail.bind(superAdminService),
  getRecentBulkCampaigns: superAdminService.getRecentBulkCampaigns.bind(superAdminService),
  getBulkCampaignDetail: superAdminService.getBulkCampaignDetail.bind(superAdminService),

  // DMPREP integration
  triggerDmprepSync: dmprepSyncService.triggerSync.bind(dmprepSyncService),
  getDmprepSyncStatus: dmprepSyncService.getStatus.bind(dmprepSyncService),

  // PrintPoint WatchComm commands (ADMIN console)
  runClockCommand: clockCommandService.run.bind(clockCommandService),
  listClockCommands: clockCommandService.list.bind(clockCommandService),
};
