
import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText, Calendar, Clock, RefreshCw, User as UserIcon, Search, FileSpreadsheet, FileDown, MapPin,
  CheckCircle2, CheckCircle, Settings2, Mail, CheckSquare, Square, Layout,
  TrendingUp, CalendarDays, Users, PieChart
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { emailService } from '../services/emailService';
import { organizationService } from '../services/organization.service';
import { User, Employee, Attendance, LeaveRequest, AppConfig, Holiday, Shift, EmployeeAttendanceSummary } from '../types';
import {
  consolidateAttendance,
  getDateRangeFromPreset,
  calculateEmployeeSummaries,
  ALL_EMPLOYEES_FILTER,
  timesheetDaysToAttendance,
  mergeAttendanceSources,
  eachLocalISODate,
  localWeekdayLong,
  toLocalISODate,
} from '../utils/attendanceUtils';
import { buildTeamSummaryMetrics, topEmployeesByAbsentDays, formatScopeSubtitle } from '../utils/reportMetrics';
import { ReportsScopeBanner } from '../components/reports/ReportsScopeBanner';
import { ReportsSummaryMetrics } from '../components/reports/ReportsSummaryMetrics';
import { EmployeeSummaryTable } from '../components/reports/EmployeeSummaryTable';
import { ReportsSidePanel } from '../components/reports/ReportsSidePanel';
import { competenceForDate } from '../utils/payrollPeriod';
import { DEFAULT_PTRP_POLICY } from '../constants';
import {
  APP_NAME,
  applyStandardTable,
  createPdfDocument,
  drawMetricStrip,
  drawReportFooters,
  drawReportHeader,
  formatGeneratedAt,
  formatReportPeriod,
  PDF_COLORS,
} from '../utils/reportPdf';
import HelpButton from '../components/onboarding/HelpButton';
import { useToast } from '../context/ToastContext';
import { isClockReportEmployee, isPayrollExcluded } from '../utils/roles';
import { formatIsoDateBr } from '../i18n/format';
import { tStatus } from '../i18n/statusMaps';


interface ReportsProps {
  user: User;
  onNavigate?: (path: string, params?: any) => void;
}

const Reports: React.FC<ReportsProps> = ({ user, onNavigate }) => {
  const { t } = useTranslation('reports');
  const { showToast } = useToast();
  const [reportType, setReportType] = useState('ATTENDANCE');
  const [periodPreset, setPeriodPreset] = useState<string>('THIS_MONTH');
  
  // Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftOverrides, setShiftOverrides] = useState<any[]>([]);

  // Log State
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const [isHookMissing, setIsHookMissing] = useState(false);
  
  // Filter States
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState(ALL_EMPLOYEES_FILTER);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Recipient State
  const [customRecipients, setCustomRecipients] = useState('');

  // Org Info for PDF header
  const [orgInfo, setOrgInfo] = useState<{ name: string; address: string; logoDataUrl: string | null }>({ name: '', address: '', logoDataUrl: null });

  // UI States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [enabledColumns, setEnabledColumns] = useState<Record<string, boolean>>({
    'Employee_ID': true, 'Name': true, 'Date': true, 'Status_Type': true,
    'Check_In': true, 'Check_Out': true, 'Location': true, 'Latitude': true, 'Longitude': true, 'Remarks': true
  });

  const columnOptions = useMemo(() => [
    { key: 'Employee_ID', label: t('columns.Employee_ID'), icon: UserIcon },
    { key: 'Name', label: t('columns.Name'), icon: Layout },
    { key: 'Date', label: t('columns.Date'), icon: Calendar },
    { key: 'Status_Type', label: t('columns.Status_Type'), icon: CheckCircle2 },
    { key: 'Check_In', label: t('columns.Check_In'), icon: Clock },
    { key: 'Check_Out', label: t('columns.Check_Out'), icon: Clock },
    { key: 'Location', label: t('columns.Location'), icon: MapPin },
    { key: 'Latitude', label: t('columns.Latitude'), icon: Search },
    { key: 'Longitude', label: t('columns.Longitude'), icon: Search },
    { key: 'Remarks', label: t('columns.Remarks'), icon: FileText },
  ], [t]);

  const fetchLogs = async () => {
    try {
      const logs = await hrService.getReportQueueLog();
      setEmailLogs(logs);
      const now = new Date();
      const recentPending = logs.some(l => {
        const created = new Date(l.created);
        const diffSeconds = (now.getTime() - created.getTime()) / 1000;
        return l.status === 'PENDING' && diffSeconds > 10;
      });
      setIsHookMissing(recentPending);
    } catch(e) { console.warn("Failed to fetch logs"); }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Reports page needs a wide window (quarterly/annual summaries).
        // Default service window is 30d; override to ~1 year here.
        const yearAgo = new Date();
        yearAgo.setDate(yearAgo.getDate() - 365);
        const sinceYearAgo = yearAgo.toISOString().split('T')[0];

        const [emps, atts, lvs, depts, config, hols, shiftsList, overridesList, timesheetDays] = await Promise.all([
          hrService.getEmployees(),
          hrService.getAttendance({ since: sinceYearAgo, maxRows: 10000 }),
          hrService.getLeaves(),
          hrService.getDepartments(),
          hrService.getConfig(),
          hrService.getHolidays(),
          hrService.getShifts(),
          hrService.getShiftOverrides(),
          hrService.listTimesheetDaysInRange(sinceYearAgo, new Date().toISOString().split('T')[0]).catch(() => []),
        ]);
        setEmployees(emps);
        const fromPtrp = timesheetDaysToAttendance(timesheetDays, emps);
        setAttendance(mergeAttendanceSources(atts, fromPtrp));
        setLeaves(lvs);
        setDbDepartments(depts);
        setAppConfig(config);
        setHolidays(hols);
        setShifts(shiftsList);
        setShiftOverrides(overridesList);
        setSelectedDepts(depts);
        setCustomRecipients(config.defaultReportRecipient || user.email || '');

        // Fetch organization info for PDF header
        try {
          const branding = await organizationService.getOrgBranding();
          setOrgInfo(branding);
        } catch (e) { console.warn("Failed to fetch org info for PDF header"); }

        await fetchLogs();
      } catch (err) {
        console.error("Report data load failed", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
    let interval = setInterval(fetchLogs, 15000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLogs();
        interval = setInterval(fetchLogs, 15000);
      } else {
        clearInterval(interval);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user.id]);

  const toggleDept = (dept: string) => {
    setSelectedDepts(prev =>
      prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
    );
  };

  // Sync date range when period preset changes
  useEffect(() => {
    if (periodPreset === 'CUSTOM') return;
    const range = getDateRangeFromPreset(periodPreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  }, [periodPreset]);

  const handlePresetClick = (preset: string) => {
    setPeriodPreset(preset);
    if (preset !== 'CUSTOM') {
      const range = getDateRangeFromPreset(preset);
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  };

  const handleDateChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    setPeriodPreset('CUSTOM');
  };

  const reportData = useMemo(() => {
    let combinedData: any[] = [];
    const isAttendanceReport = reportType === 'ATTENDANCE' || reportType === 'ABSENT' || reportType === 'LATE';

    // 1. Filter Records
    const filteredAttendance = attendance.filter(item => {
      if (item.date < startDate || item.date > endDate) return false;
      const emp = employees.find(e => e.id === item.employeeId);
      if (!emp) return false;
      if (selectedDepts.length === 0 || !selectedDepts.includes(emp.department)) return false;
      if (employeeFilter !== ALL_EMPLOYEES_FILTER && item.employeeId !== employeeFilter) return false;
      return true;
    });

    const filteredLeaves = leaves.filter(item => {
      if (item.startDate < startDate || item.startDate > endDate) return false;
      const emp = employees.find(e => e.id === item.employeeId);
      if (!emp) return false;
      if (selectedDepts.length === 0 || !selectedDepts.includes(emp.department)) return false;
      if (employeeFilter !== ALL_EMPLOYEES_FILTER && item.employeeId !== employeeFilter) return false;
      return true;
    });

    if (isAttendanceReport) {
      // Consolidate Attendance (Utilize Shared Logic)
      // This ensures Min(CheckIn) and Max(CheckOut) are used
      combinedData = consolidateAttendance(filteredAttendance);

      // Gap Analysis — per-employee shift working days
      if (appConfig) {
        const globalWorkingDays = appConfig.workingDays || [];
        const defaultShift = shifts.find(s => s.isDefault);

        const targetEmployees = employees.filter(e => {
          if (e.status !== 'ACTIVE') return false;
          if (isPayrollExcluded(e)) return false;
          if (selectedDepts.length === 0 || !selectedDepts.includes(e.department)) return false;
          if (employeeFilter !== ALL_EMPLOYEES_FILTER && e.id !== employeeFilter) return false;
          return true;
        });

        // Normalize 3-letter day abbreviations (DB default) to full names
        const DAY_MAP: Record<string, string> = {
          MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
          FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
        };
        const normDays = (days: string[]) => days.map(d => DAY_MAP[d.toUpperCase()] || d);

        // Helper to resolve shift working days for an employee on a given date
        const getWorkingDays = (emp: Employee, dateStr: string): string[] => {
          // Check overrides first
          const override = shiftOverrides.find(
            (o: any) => o.employeeId === emp.id && dateStr >= o.startDate && dateStr <= o.endDate
          );
          if (override) {
            const oShift = shifts.find(s => s.id === override.shiftId);
            if (oShift) return normDays(oShift.workingDays);
          }
          // Employee assignment
          if (emp.shiftId) {
            const aShift = shifts.find(s => s.id === emp.shiftId);
            if (aShift) return normDays(aShift.workingDays);
          }
          // Default shift
          if (defaultShift) return normDays(defaultShift.workingDays);
          // Global fallback (already full names from appConfig)
          return globalWorkingDays;
        };

        // Use a set for quick lookup
        const presentSet = new Set(combinedData.map(d => `${d.employeeId}_${d.date}`));
        const todayStr = toLocalISODate();
        const effectiveEnd = endDate > todayStr ? todayStr : endDate;

        for (const dateStr of eachLocalISODate(startDate, effectiveEnd)) {
          const dayName = localWeekdayLong(dateStr);
          const isHoliday = holidays.some(h => h.date === dateStr);

          if (isHoliday) continue;

          targetEmployees.forEach(emp => {
            if (emp.joiningDate && emp.joiningDate > dateStr) return;
            if (emp.terminationDate && emp.terminationDate < dateStr) return;

            const empWorkingDays = getWorkingDays(emp, dateStr);
            if (!empWorkingDays.includes(dayName)) return;

            const isPresent = presentSet.has(`${emp.id}_${dateStr}`);
            const isOnLeave = filteredLeaves.some(l =>
              l.employeeId === emp.id && l.status === 'APPROVED' &&
              dateStr >= l.startDate.split(' ')[0] && dateStr <= l.endDate.split(' ')[0]
            );

            if (!isPresent && !isOnLeave) {
              combinedData.push({
                id: `absent-${emp.id}-${dateStr}`,
                employeeId: emp.id,
                employeeName: emp.name,
                date: dateStr,
                status: 'ABSENT',
                checkIn: '-',
                checkOut: '-',
                location: { address: '__EXPORT_NOT_DETECTED__' },
                remarks: '__EXPORT_SYSTEM_ABSENT__',
              });
            }
          });
        }
      }
    } else {
      combinedData = filteredLeaves;
    }

    if (reportType === 'LATE') combinedData = combinedData.filter(a => a.status === 'LATE');
    if (reportType === 'ABSENT') combinedData = combinedData.filter(a => a.status === 'ABSENT');

    return combinedData.sort((a, b) => {
        const dateA = a.date || a.startDate;
        const dateB = b.date || b.startDate;
        return dateB.localeCompare(dateA);
    });
  }, [reportType, startDate, endDate, selectedDepts, employeeFilter, attendance, employees, leaves, appConfig, holidays, shifts, shiftOverrides]);

  // Compute per-employee summary for the Summary tab
  const employeeSummaries = useMemo<EmployeeAttendanceSummary[]>(() => {
    if (!appConfig || employees.length === 0) return [];

    // Consolidate filtered attendance (same logic as reportData for consistency)
    const filteredAttendance = attendance.filter(item => {
      if (item.date < startDate || item.date > endDate) return false;
      const emp = employees.find(e => e.id === item.employeeId);
      if (!emp) return false;
      if (selectedDepts.length === 0 || !selectedDepts.includes(emp.department)) return false;
      if (employeeFilter !== ALL_EMPLOYEES_FILTER && item.employeeId !== employeeFilter) return false;
      return true;
    });

    const consolidated = consolidateAttendance(filteredAttendance);

    // Approved leaves in range
    const approvedLeaves = leaves.filter(l => {
      if (l.status !== 'APPROVED') return false;
      return l.startDate <= endDate && l.endDate >= startDate;
    });

    // Clock-punching staff only — PJ (roster-only) must not inflate absences.
    const clockEmployees = employees.filter(e => isClockReportEmployee(e));

    return calculateEmployeeSummaries({
      employees: clockEmployees,
      consolidatedAttendance: consolidated,
      approvedLeaves,
      shifts,
      shiftOverrides,
      appConfig,
      holidays,
      startDate,
      endDate,
      selectedDepts,
      employeeFilter,
    });
  }, [attendance, leaves, employees, shifts, shiftOverrides, appConfig, holidays, startDate, endDate, selectedDepts, employeeFilter]);

  const teamMetrics = useMemo(
    () => buildTeamSummaryMetrics(employeeSummaries),
    [employeeSummaries]
  );

  const topAbsentEmployees = useMemo(
    () => topEmployeesByAbsentDays(employeeSummaries, 3),
    [employeeSummaries]
  );

  const singleEmployeeName = useMemo(() => {
    if (employeeFilter === ALL_EMPLOYEES_FILTER) return undefined;
    return employees.find(e => e.id === employeeFilter)?.name;
  }, [employeeFilter, employees]);

  const exportNotAvailable = t('export.notAvailable');
  const exportNoPunch = t('export.noPunch');

  const formatExportLocation = (address?: string) => {
    if (!address || address === 'N/A' || address === '__EXPORT_NOT_DETECTED__' || address === 'Not Detected') {
      return t('export.locationNotDetected');
    }
    return address;
  };

  const formatExportRemarks = (remarks?: string) => {
    if (!remarks) return '';
    if (remarks === '__EXPORT_SYSTEM_ABSENT__' || remarks === 'System Generated: No punch-in detected.') {
      return t('export.systemAbsentRemark');
    }
    if (remarks.startsWith('[Manual Entry]')) {
      return remarks.replace('[Manual Entry]', t('export.manualEntryPrefix'));
    }
    return remarks;
  };

  const formatExportStatus = (row: { status?: string; type?: string }) => {
    const code = row.status || row.type;
    if (!code) return exportNotAvailable;
    if (reportType === 'LEAVE') return tStatus('leave', code);
    return tStatus('attendance', code);
  };

  const formatExportDate = (value?: string) => {
    if (!value || value === exportNotAvailable) return exportNotAvailable;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatIsoDateBr(value.slice(0, 10));
    return value;
  };

  const formatExportTime = (value?: string) => {
    if (!value || value === '-' || value === exportNotAvailable || value === 'N/A') return exportNoPunch;
    return value;
  };

  const formatExportCoord = (value?: string | number) => {
    if (value === undefined || value === null || value === '' || value === 'N/A' || value === 0) {
      return exportNotAvailable;
    }
    return String(value);
  };

  const getCleanReportData = () => {
    return reportData.map((row: any) => {
      const emp = employees.find(e => e.id === row.employeeId);
      const fullRow: Record<string, string> = {
        Employee_ID: emp?.employeeId || exportNotAvailable,
        Name: row.employeeName || row.name || exportNotAvailable,
        Date: formatExportDate(row.date || row.startDate),
        Status_Type: formatExportStatus(row),
        Check_In: formatExportTime(row.checkIn),
        Check_Out: formatExportTime(row.checkOut),
        Location: formatExportLocation(row.location?.address),
        Latitude: formatExportCoord(row.location?.lat),
        Longitude: formatExportCoord(row.location?.lng),
        Remarks: formatExportRemarks(row.remarks || row.reason || ''),
      };
      const filteredRow: Record<string, string> = {};
      Object.keys(enabledColumns).forEach(col => {
        if (enabledColumns[col]) filteredRow[col] = fullRow[col];
      });
      return filteredRow;
    });
  };

  const downloadCSV = () => {
    if (reportData.length === 0) { showToast(t('noData'), "warning"); return; }
    setIsGenerating(true);
    setTimeout(() => {
      const cleanData = getCleanReportData();
      const columns = Object.keys(cleanData[0]);
      const headers = columns.map(col => {
        const opt = columnOptions.find(o => o.key === col);
        return opt ? opt.label : col;
      });
      const rows = cleanData.map(obj => columns.map(col => String(obj[col] ?? '')));
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + headers.join(',') + '\n' + rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
      const link = document.createElement("a");
      link.setAttribute("href", encodeURI(csvContent));
      link.setAttribute("download", `RH_Eletropasso_${reportType}_Export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsGenerating(false);
    }, 500);
  };

  const downloadPDF = async () => {
    if (reportData.length === 0) { showToast(t('noData'), "warning"); return; }
    setIsGeneratingPDF(true);
    try {
      const doc = await createPdfDocument('landscape');
      const typeLabel = t(`reportTypes.${reportType}`, { defaultValue: reportType });

      let cursorY = await drawReportHeader(doc, {
        org: orgInfo,
        title: t('pdfReportTitle', { type: typeLabel }),
        subtitle: t('pdfDateRange', { start: formatIsoDateBr(startDate), end: formatIsoDateBr(endDate) }),
      });

      const totalRecords = reportData.length;
      const presentCount = reportData.filter((r: any) => r.status === 'PRESENT').length;
      const absentCount = reportData.filter((r: any) => r.status === 'ABSENT').length;
      const lateCount = reportData.filter((r: any) => r.status === 'LATE').length;
      const otherCount = totalRecords - presentCount - absentCount - lateCount;

      cursorY = drawMetricStrip(doc, cursorY, [
        { label: t('pdf.metrics.total'), value: totalRecords, tone: 'neutral' },
        { label: t('present'), value: presentCount, tone: 'present' },
        { label: t('absent'), value: absentCount, tone: 'absent' },
        { label: t('late'), value: lateCount, tone: 'late' },
        { label: t('pdf.metrics.other'), value: otherCount, tone: 'neutral' },
      ], t('summary'));

      const cleanData = getCleanReportData();
      const columns = Object.keys(cleanData[0]);
      const tableHeaders = columns.map(col => {
        const opt = columnOptions.find(o => o.key === col);
        return opt ? opt.label : col;
      });
      const tableRows = cleanData.map(row => columns.map(col => String(row[col] ?? '')));

      applyStandardTable(doc, {
        startY: cursorY,
        head: [tableHeaders],
        body: tableRows,
      });

      drawReportFooters(
        doc,
        t('pdfGeneratedBy', { date: formatGeneratedAt() }),
        (current, total) => t('pdfPage', { current, total })
      );

      doc.save(`${APP_NAME}_detalhe_${reportType}_${startDate}_${endDate}.pdf`);
    } catch (err: any) {
      console.error("PDF generation failed:", err);
      showToast(t('pdfFailed', { error: err?.message || err }), "error");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // --- Summary Tab Exports ---

  const downloadSummaryCSV = () => {
    if (employeeSummaries.length === 0) { showToast(t('noSummaryData'), "warning"); return; }
    setIsGenerating(true);
    setTimeout(() => {
      const headers = [
        t('pdf.csv.employeeId'),
        t('pdf.csv.name'),
        t('pdf.csv.department'),
        t('pdf.csv.designation'),
        t('pdf.csv.workDays'),
        t('pdf.csv.present'),
        t('pdf.csv.absent'),
        t('pdf.csv.late'),
        t('pdf.csv.leave'),
        t('pdf.csv.half'),
        t('pdf.csv.pct'),
      ];
      const rows = employeeSummaries.map(s => [
        s.employeeId, s.employeeName, s.department, s.designation,
        s.totalWorkingDays, s.presentDays, s.absentDays, s.lateDays,
        s.leaveDays, s.halfDays, `${s.attendancePercentage}%`
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const m = buildTeamSummaryMetrics(employeeSummaries);
      const totalRow = [
        '', t('table.totalRow'), '', '',
        m.totals.workingDays, m.totals.presentDays, m.totals.absentDays,
        m.totals.lateDays, m.totals.leaveDays, m.totals.halfDays, '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + headers.join(',') + '\n' + rows.join('\n') + '\n' + totalRow;
      const link = document.createElement('a');
      link.setAttribute('href', encodeURI(csvContent));
      link.setAttribute('download', `${APP_NAME}_resumo_ponto_${startDate}_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsGenerating(false);
    }, 500);
  };

  const downloadSummaryPDF = async () => {
    if (employeeSummaries.length === 0) { showToast(t('noSummaryData'), "warning"); return; }
    setIsGeneratingPDF(true);
    try {
      const doc = await createPdfDocument('landscape');

      let cursorY = await drawReportHeader(doc, {
        org: orgInfo,
        title: t('pdfEmployeeSummaryTitle'),
        subtitle: [
          t('pdfPeriodEmployees', {
            start: formatIsoDateBr(startDate),
            end: formatIsoDateBr(endDate),
            count: employeeSummaries.length,
          }),
          t('pdfTeamTotalsNote', { count: employeeSummaries.length }),
          formatScopeSubtitle(t, {
            periodLabel: t(`presets.${periodPreset}`, { defaultValue: periodPreset }),
            startDate: formatIsoDateBr(startDate),
            endDate: formatIsoDateBr(endDate),
            employeeCount: employeeSummaries.length,
            deptCount: selectedDepts.length,
            totalDepts: dbDepartments.length,
            singleEmployeeName,
          }),
        ].join('\n'),
      });

      const metrics = buildTeamSummaryMetrics(employeeSummaries);

      cursorY = drawMetricStrip(doc, cursorY, [
        { label: t('stats.totalPresent'), value: metrics.totals.presentDays, tone: 'present' },
        { label: t('stats.totalAbsent'), value: metrics.totals.absentDays, tone: 'absent' },
        { label: t('stats.totalLate'), value: metrics.totals.lateDays, tone: 'late' },
        { label: t('stats.totalLeave'), value: metrics.totals.leaveDays, tone: 'leave' },
        {
          label: t('stats.avgAttendanceFull'),
          value: `${metrics.avgAttendancePct}%`,
          tone: metrics.avgAttendancePct >= 90 ? 'present' : metrics.avgAttendancePct >= 70 ? 'late' : 'absent',
        },
      ], t('summary'));

      const tableHeaders = [
        '#',
        t('pdf.table.employee'),
        t('pdf.table.dept'),
        t('pdf.table.workDays'),
        t('pdf.table.present'),
        t('pdf.table.absent'),
        t('pdf.table.late'),
        t('pdf.table.leave'),
        t('pdf.table.half'),
        t('pdf.table.pct'),
      ];
      const tableRows = employeeSummaries.map((s, i) => [
        i + 1,
        s.employeeName,
        s.department,
        s.totalWorkingDays,
        s.presentDays,
        s.absentDays,
        s.lateDays,
        s.leaveDays,
        s.halfDays,
        `${s.attendancePercentage}%`,
      ]);

      applyStandardTable(doc, {
        startY: cursorY,
        head: [tableHeaders],
        body: tableRows,
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 52 },
          2: { cellWidth: 32 },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 18, halign: 'center' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 18, halign: 'center' },
          8: { cellWidth: 14, halign: 'center' },
          9: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 9) {
            const pct = parseInt(String(data.cell.raw).replace('%', ''), 10);
            if (!Number.isNaN(pct)) {
              if (pct >= 90) data.cell.styles.textColor = PDF_COLORS.present;
              else if (pct >= 70) data.cell.styles.textColor = PDF_COLORS.late;
              else data.cell.styles.textColor = PDF_COLORS.absent;
            }
          }
          if (data.section === 'body' && data.column.index === 5 && Number(data.cell.raw) > 0) {
            data.cell.styles.textColor = PDF_COLORS.absent;
          }
        },
      });

      drawReportFooters(
        doc,
        t('pdfGeneratedBy', { date: formatGeneratedAt() }),
        (current, total) => t('pdfPage', { current, total })
      );

      doc.save(`${APP_NAME}_resumo_ponto_${startDate}_${endDate}.pdf`);
    } catch (err: any) {
      console.error("Summary PDF generation failed:", err);
      showToast(t('pdfFailed', { error: err?.message || err }), "error");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleEmailSummaryReport = async () => {
    if (employeeSummaries.length === 0) { showToast(t('noSummaryData'), "warning"); return; }
    setIsEmailing(true);
    try {
      const rawTarget = customRecipients;
      if (!rawTarget) throw new Error(t('emailErrors.noRecipient'));
      const targets = rawTarget.split(',').map(addr => addr.trim()).filter(addr => addr.includes('@'));
      if (targets.length === 0) throw new Error(t('emailErrors.noValidEmails'));

      const periodLabel = t(`presets.${periodPreset}`, { defaultValue: periodPreset });
      const dateRange = formatReportPeriod(startDate, endDate);

      for (const target of targets) {
        await emailService.sendEmployeeSummaryReport(target, employeeSummaries, periodLabel, dateRange);
      }
      showToast(t('emailQueuedSummary', { count: targets.length }), "success");
      setTimeout(fetchLogs, 1000);
    } catch (err: any) { showToast(err.message || t('emailErrors.relayFailed'), "error"); }
    finally { setIsEmailing(false); }
  };

  /** E-mail do relatório detalhado (registros linha a linha). */
  const handleEmailDetailReport = async () => {
    if (reportData.length === 0) { showToast(t('noDataToEmail'), "warning"); return; }
    setIsEmailing(true);
    try {
      const rawTarget = customRecipients;
      if (!rawTarget) throw new Error(t('emailErrors.noRecipient'));
      const targets = rawTarget.split(',').map(addr => addr.trim()).filter(addr => addr.includes('@'));
      if (targets.length === 0) throw new Error(t('emailErrors.noValidEmails'));

      const BATCH_SIZE = 350;
      const chunks = [];
      for (let i = 0; i < reportData.length; i += BATCH_SIZE) { chunks.push(reportData.slice(i, i + BATCH_SIZE)); }

      let totalEmails = 0;
      for (const target of targets) {
        for (let i = 0; i < chunks.length; i++) {
           const chunk = chunks[i];
           const suffix = chunks.length > 1 ? ` [Part ${i+1}/${chunks.length}]` : '';
           await emailService.sendDailyAttendanceSummary(target, chunk as Attendance[], suffix);
           totalEmails++;
        }
      }
      showToast(t('emailQueuedDetail', { count: targets.length }), "success");
      setTimeout(fetchLogs, 1000);
    } catch (err: any) { showToast(err.message || t('emailErrors.relayFailed'), "error"); } 
    finally { setIsEmailing(false); }
  };

  if (isLoading) return <div className="flex flex-col items-center justify-center h-64 text-slate-400"><RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" /><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t('loading')}</p></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-3xl font-bold text-slate-900 tracking-tight">{t('title')}</h1><HelpButton helpPointId="reports.generator" /></div>
          <p className="text-slate-500 font-medium text-sm">{t('subtitle')}</p>
        </div>
        {onNavigate && (user.role === 'ADMIN' || user.role === 'HR') && (
          <button
            type="button"
            onClick={() => onNavigate('apuracao')}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            {t('apuracaoIntroCta')}
          </button>
        )}
      </header>

      {(user.role === 'ADMIN' || user.role === 'HR') && (
        <p className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
          {t('apuracaoIntro')}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">

          {/* ===== SHARED FILTERS ===== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 md:p-12 space-y-8">
            {/* Period Presets */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-widest">{t('period')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'THIS_WEEK', icon: CalendarDays },
                  { key: 'THIS_MONTH', icon: Calendar },
                  { key: 'THIS_YEAR', icon: TrendingUp },
                  { key: 'LAST_MONTH', icon: Calendar },
                  { key: 'LAST_YEAR', icon: TrendingUp },
                ].map(p => (
                  <button key={p.key} onClick={() => handlePresetClick(p.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-semibold uppercase tracking-wider transition-all border ${
                      periodPreset === p.key ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'
                    }`}>
                    <p.icon size={14} />{t(`presets.${p.key}`)}
                  </button>
                ))}
                <button onClick={() => handlePresetClick('CUSTOM')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-semibold uppercase tracking-wider transition-all border ${
                    periodPreset === 'CUSTOM' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-indigo-200 hover:text-indigo-600'
                  }`}>
                  <CalendarDays size={14} />{t('presets.CUSTOM')}
                </button>
              </div>
              {periodPreset === 'CUSTOM' && (
                <div className="flex gap-2 pt-2">
                  <div className="flex-1 min-w-0 space-y-1"><label className="text-[8px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">{t('from')}</label><input type="date" className="w-full min-w-0 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none" value={startDate} onChange={handleDateChange(setStartDate)} /></div>
                  <div className="flex-1 min-w-0 space-y-1"><label className="text-[8px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">{t('to')}</label><input type="date" className="w-full min-w-0 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold outline-none" value={endDate} onChange={handleDateChange(setEndDate)} /></div>
                </div>
              )}
            </div>

            {/* Department Filter */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-widest">{t('departments', { selected: selectedDepts.length, total: dbDepartments.length })}</p>
                <div className="flex gap-4">
                  <button onClick={() => setSelectedDepts(dbDepartments)} className="text-[9px] font-semibold uppercase text-indigo-600 hover:underline">{t('selectAll')}</button>
                  <button onClick={() => setSelectedDepts([])} className="text-[9px] font-semibold uppercase text-rose-500 hover:underline">{t('clearAll')}</button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto no-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-1 border border-slate-50 rounded-3xl py-4 bg-slate-50/30">
                {dbDepartments.map(dept => {
                  const isSelected = selectedDepts.includes(dept);
                  return (
                    <button key={dept} onClick={() => toggleDept(dept)} className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left ${isSelected ? 'bg-white border-primary/30 shadow-sm' : 'bg-transparent border-transparent opacity-60'}`}>
                      <div className={`p-1 rounded-md ${isSelected ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400'}`}>{isSelected ? <CheckSquare size={14} /> : <Square size={14} />}</div>
                      <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>{dept}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Employee Scoping + Recipient */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">{t('employeeScoping')}</label>
                <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none" value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
                  <option value={ALL_EMPLOYEES_FILTER}>{t('allEmployees')}</option>
                  {employees
                    .filter(e => isClockReportEmployee(e) && selectedDepts.includes(e.department || ''))
                    .map(e => <option key={e.id} value={e.id}>{e.name} ({e.employeeId})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">{t('recipients')}</label>
                <input type="text" placeholder={t('recipientsPlaceholder')} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-xs outline-none" value={customRecipients} onChange={e => setCustomRecipients(e.target.value)}/>
              </div>
            </div>
          </div>

          {/* ===== SECTION 1: EMPLOYEE SUMMARY ===== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 md:p-12 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 rounded-xl"><PieChart size={20} className="text-indigo-600" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t('employeeSummaryTitle')}</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('perEmployeeBreakdown')}</p>
              </div>
            </div>

            <ReportsScopeBanner
              periodPreset={periodPreset}
              startDate={startDate}
              endDate={endDate}
              employeeCount={employeeSummaries.length}
              selectedDeptCount={selectedDepts.length}
              totalDepts={dbDepartments.length}
              singleEmployeeName={singleEmployeeName}
            />

            {/* Stat Cards */}
            {employeeSummaries.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
                <Users size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-400">{t('noEmployeeData')}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedDepts.length === 0 ? t('selectDepartmentsHint') : t('adjustFilters')}
                </p>
                {selectedDepts.length === 0 && dbDepartments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDepts(dbDepartments)}
                    className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-semibold uppercase tracking-wider hover:bg-indigo-700 transition-colors"
                  >
                    {t('selectAll')}
                  </button>
                )}
              </div>
            ) : (
              <ReportsSummaryMetrics metrics={teamMetrics} />
            )}

            {employeeSummaries.length > 0 && (
              <EmployeeSummaryTable
                key={`${employeeFilter}-${employeeSummaries.length}`}
                summaries={employeeSummaries}
                employeeFilter={employeeFilter}
              />
            )}

            {employeeSummaries.length > 0 && (
            <p className="text-[9px] text-slate-400 text-center">
              {t('employeeSummaryHint')}
            </p>
            )}

            {/* Summary Export Buttons */}
            <div className="pt-4 border-t border-slate-50 space-y-3">
              <div className="flex gap-3">
                <button onClick={downloadSummaryCSV} disabled={isGenerating || employeeSummaries.length === 0} className="flex-1 flex items-center justify-center gap-3 py-4 bg-primary text-white rounded-xl font-semibold text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-primary-hover transition-all active:scale-95 disabled:opacity-50">{isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} {t('csvSummary')}</button>
                <button onClick={downloadSummaryPDF} disabled={isGeneratingPDF || employeeSummaries.length === 0} className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-xl font-semibold text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50">{isGeneratingPDF ? <RefreshCw className="animate-spin" size={16} /> : <FileDown size={16} />} {t('pdfSummary')}</button>
              </div>
              <button onClick={handleEmailSummaryReport} disabled={isEmailing || employeeSummaries.length === 0} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50">{isEmailing ? <RefreshCw className="animate-spin" size={16} /> : <Mail size={16} />} {t('emailSummaryReport')}</button>
            </div>
          </div>

          {/* ===== SECTION 2: DETAIL RECORDS ===== */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 md:p-12 space-y-8">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-100 rounded-xl"><FileText size={20} className="text-slate-700" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">{t('detailRecordsTitle')}</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t('detailRecordsHint')}</p>
              </div>
            </div>

            {/* Report Type */}
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-widest">{t('reportType')}</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {['ATTENDANCE', 'ABSENT', 'LATE', 'LEAVE', 'TIMESHEET'].map((id) => (
                  <button key={id} onClick={() => setReportType(id)} className={`flex items-center gap-2 p-4 rounded-xl border transition-all ${reportType === id ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                    <div className={`p-2 rounded-lg ${reportType === id ? 'bg-white/10' : 'bg-indigo-500 text-white'}`}><FileText size={14} /></div>
                    <span className="font-semibold text-[10px] uppercase tracking-tight">{t(`reportTypes.${id}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            {reportType === 'TIMESHEET' ? (
              <div className="pt-4 border-t border-slate-50">
                <button
                  onClick={async () => {
                    try {
                      const d = new Date(startDate + 'T12:00:00');
                      let startDay = DEFAULT_PTRP_POLICY.periodStartDay;
                      try {
                        const cfg = await hrService.getConfig();
                        startDay = cfg?.ptrpPolicy?.periodStartDay ?? startDay;
                      } catch { /* use default */ }
                      const c = competenceForDate(d, startDay);
                      const period = await hrService.getOrCreateTimesheetPeriod(c.year, c.month);
                      const csv = await hrService.exportTimesheetCsv(period.id);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `espelho_ptrp_${period.year}_${String(period.month).padStart(2, '0')}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast(t('exportSuccess'), 'success');
                    } catch (e: any) {
                      showToast(e?.message || t('exportFailed'), 'error');
                    }
                  }}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-primary text-white rounded-xl font-semibold text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-primary-hover transition-all"
                >
                  <FileSpreadsheet size={16} /> {t('csvExport')}
                </button>
              </div>
            ) : (
            <>
            {/* Configure Columns (collapsible) */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-[10px] font-semibold uppercase text-slate-400 tracking-widest hover:text-slate-600 transition-colors">
                <Settings2 size={14} />
                {t('configureColumns', { count: Object.values(enabledColumns).filter(Boolean).length })}
                <span className="ml-auto text-[9px] text-slate-300 group-open:hidden">{t('clickToExpand')}</span>
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-50">
                {columnOptions.map((col) => (
                  <button key={col.key} onClick={() => setEnabledColumns(p => ({...p, [col.key]: !p[col.key]}))} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${enabledColumns[col.key] ? 'bg-primary/5 border-primary/20' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${enabledColumns[col.key] ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400'}`}><col.icon size={14} /></div>
                      <span className="text-[10px] font-semibold uppercase tracking-tight">{col.label}</span>
                    </div>
                    {enabledColumns[col.key] && <CheckCircle size={16} className="text-primary" />}
                  </button>
                ))}
              </div>
            </details>

            {/* Detail Export Buttons */}
            <div className="pt-4 border-t border-slate-50 space-y-3">
              <div className="flex gap-3">
                <button onClick={downloadCSV} disabled={isGenerating || reportData.length === 0} className="flex-1 flex items-center justify-center gap-3 py-4 bg-primary text-white rounded-xl font-semibold text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-primary-hover transition-all active:scale-95 disabled:opacity-50">{isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />} {t('csvExport')}</button>
                <button onClick={downloadPDF} disabled={isGeneratingPDF || reportData.length === 0} className="flex-1 flex items-center justify-center gap-3 py-4 bg-slate-900 text-white rounded-xl font-semibold text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50">{isGeneratingPDF ? <RefreshCw className="animate-spin" size={16} /> : <FileDown size={16} />} {t('pdfExport')}</button>
              </div>
              <button onClick={handleEmailDetailReport} disabled={isEmailing || reportData.length === 0} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-semibold uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm disabled:opacity-50">{isEmailing ? <RefreshCw className="animate-spin" size={16} /> : <Mail size={16} />} {t('emailDetailReport')}</button>
            </div>
            </>
            )}
          </div>

        </div>

        {/* ===== SIDE PANEL ===== */}
        <div className="sticky top-24 h-fit">
        <ReportsSidePanel
          periodPreset={periodPreset}
          startDate={startDate}
          endDate={endDate}
          employeeCount={employeeSummaries.length}
          selectedDeptCount={selectedDepts.length}
          totalDepts={dbDepartments.length}
          singleEmployeeName={singleEmployeeName}
          topAbsent={topAbsentEmployees}
          emailLogs={emailLogs}
          isHookMissing={isHookMissing}
          onRefreshLogs={fetchLogs}
        />
        </div>
      </div>
    </div>
  );
};

export default Reports;
