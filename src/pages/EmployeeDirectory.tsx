
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  UserPlus,
  Upload,
  X,
  Camera,
  Edit,
  Trash2,
  Save,
  ShieldCheck,
  BadgeCheck,
  Mail,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Hash,
  Building2,
  Users,
  Key,
  FileSpreadsheet,
  FileDown,
  Filter,
  CheckSquare,
  Square,
  ChevronDown
} from 'lucide-react';
import { hrService } from '../services/hrService';
import { organizationService } from '../services/organization.service';
import { Employee, Team, User, Shift } from '../types';
import { useSubscription } from '../context/SubscriptionContext';
import HelpButton from '../components/onboarding/HelpButton';
import { tRole } from '../i18n/statusMaps';
import { useToast } from '../context/ToastContext';
import {
  assignableRoles,
  canAssignRole,
  canManageEmployeeRecord,
  isStaffAdmin,
  needsClockAdmission,
} from '../utils/roles';
import {
  DmprepLifecycleModal,
  type DmprepLifecycleType,
} from '../components/employees/DmprepLifecycleModal';
import { ClockStatusBadge } from '../components/employees/ClockOnboardingPanel';
import { formatIsoDateBr } from '../i18n/format';
import {
  applyStandardTable,
  createPdfDocument,
  drawMetricStrip,
  drawReportFooters,
  drawReportHeader,
  formatGeneratedAt,
} from '../utils/reportPdf';

const DirectorySkeleton = () => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 animate-pulse h-full flex flex-col">
    <div className="flex items-start gap-3 min-h-[5.75rem]">
      <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <div className="h-[2.75rem] bg-slate-100 rounded" />
        <div className="h-5 bg-slate-50 rounded w-1/2" />
        <div className="h-5 bg-slate-50 rounded w-20" />
      </div>
    </div>
    <div className="mt-4 space-y-2.5">
      <div className="h-5 bg-slate-50 rounded w-3/4" />
      <div className="h-5 bg-slate-50 rounded w-2/3" />
      <div className="h-5 bg-slate-50 rounded w-4/5" />
    </div>
    <div className="mt-auto pt-3 border-t border-slate-100 min-h-10" />
  </div>
);

type ClockFilter = 'all' | 'pending_export' | 'pending_bio';

interface EmployeeDirectoryProps {
  user: User;
  onNavigate?: (path: string, params?: { employeeId?: string }) => void;
}

const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({ user, onNavigate }) => {
  const { t } = useTranslation('employees');
  const { showToast } = useToast();
  const isAdmin = isStaffAdmin(user?.role);
  const isManager = user?.role === 'MANAGER' || user?.role === 'TEAM_LEAD';
  const rolesForForm = assignableRoles(user?.role);

  // Subscription check
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState<Employee | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<{
    type: DmprepLifecycleType;
    employeeName: string;
    employeeId?: string;
    deleteId?: string;
  } | null>(null);
  
  const [depts, setDepts] = useState<string[]>([]);
  const [desigs, setDesigs] = useState<string[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isGeneratingCSV, setIsGeneratingCSV] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [selectedExportDepts, setSelectedExportDepts] = useState<string[]>([]);
  const [clockFilter, setClockFilter] = useState<ClockFilter>('all');
  const [showDeptFilter, setShowDeptFilter] = useState(false);
  const [orgInfo, setOrgInfo] = useState<{ name: string; address: string; logoDataUrl: string | null }>({ name: '', address: '', logoDataUrl: null });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchEmployees = async () => {
    setIsLoading(true);
    try {
      const data = await hrService.getEmployees();
      const teamsList = await hrService.getTeams();
      setTeams(teamsList);
      
      let filteredData = data;
      
      if (!isAdmin) {
        if (isManager) {
          // STRICT MANAGER LOGIC: 
          // 1. Find teams where I am the Leader
          const myLedTeamIds = teamsList.filter(t => t.leaderId === user.id).map(t => t.id);
          
          // 2. Show employees who are in those teams OR report directly to me
          filteredData = data.filter(e => 
            (e.teamId && myLedTeamIds.includes(e.teamId)) || 
            (e.lineManagerId === user.id)
          );
        } else {
          // EMPLOYEE LOGIC: Only see teammates (Peers)
          filteredData = data.filter(e => user.teamId && e.teamId === user.teamId);
        }
      }
      setEmployees(filteredData);
      console.log('First employee email:', filteredData[0]?.email);
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      await fetchEmployees();
      if (isAdmin) {
        const [departmentsList, designationsList, shiftsList] = await Promise.all([
          hrService.getDepartments(),
          hrService.getDesignations(),
          hrService.getShifts()
        ]);
        setDepts(departmentsList);
        setDesigs(designationsList);
        setShifts(shiftsList);

        try {
          const branding = await organizationService.getOrgBranding();
          setOrgInfo(branding);
        } catch (e) { console.warn("Failed to fetch org info for PDF header"); }
      }
    };
    loadInitialData();

    const unsubscribe = hrService.subscribe(() => {
      fetchEmployees();
    });
    return () => { unsubscribe(); };
  }, [isAdmin, isManager, user?.teamId, user?.id]);
  
  const initialNewEmpState = {
    name: '',
    email: '',
    employeeId: '', 
    username: '',
    password: '',
    nid: '',
    role: 'EMPLOYEE' as any,
    department: '',
    designation: '',
    avatar: '',
    joiningDate: new Date().toISOString().split('T')[0],
    mobile: '',
    emergencyContact: '',
    salary: 0,
    employmentType: 'PERMANENT' as any,
    location: 'Dhaka',
    workType: 'OFFICE' as any,
    lineManagerId: '',
    teamId: '',
    shiftId: ''
  };

  const [formState, setFormState] = useState(initialNewEmpState);

  const filtered = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch =
        (emp.name || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (emp.employeeId || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (emp.department || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (emp.email || '').toLowerCase().includes(debouncedSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (clockFilter === 'pending_export') {
        return emp.clockOnboardingStatus === 'PENDING_EXPORT' || emp.clockOnboardingStatus === 'ERROR';
      }
      if (clockFilter === 'pending_bio') {
        return emp.clockOnboardingStatus === 'PENDING_BIO';
      }
      return true;
    });
  }, [employees, debouncedSearch, clockFilter]);

  const toggleExportDept = (dept: string) => {
    setSelectedExportDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]);
  };

  const exportData = useMemo(() => {
    if (selectedExportDepts.length === 0) return filtered;
    return filtered.filter(emp => selectedExportDepts.includes(emp.department || 'Unassigned'));
  }, [filtered, selectedExportDepts]);

  const getExportFilename = (ext: string) => {
    if (selectedExportDepts.length === 0 || selectedExportDepts.length === depts.length) return `RH_Eletropasso_Employee_Directory.${ext}`;
    if (selectedExportDepts.length === 1) return `RH_Eletropasso_${selectedExportDepts[0].replace(/\s+/g, '_')}_Directory.${ext}`;
    return `RH_Eletropasso_${selectedExportDepts.length}_Departments_Directory.${ext}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormState({ ...formState, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenAdd = () => {
    if (!isAdmin) return;
    if (onNavigate) {
      onNavigate('employee-new');
      return;
    }
    setEditingId(null);
    setFormError(null);
    const defaultShift = shifts.find(s => s.isDefault);
    setFormState({
      ...initialNewEmpState,
      department: depts[0] || 'Unassigned',
      designation: desigs[0] || 'New Employee',
      shiftId: defaultShift?.id || '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    if (!isAdmin) return;
    if (!canManageEmployeeRecord(user?.role, emp.role)) {
      showToast(t('cannotEditAdmin'), 'error');
      return;
    }
    if (onNavigate) {
      onNavigate('employee-edit', { employeeId: emp.id });
      return;
    }
    setEditingId(emp.id);
    setFormError(null);
    
    setFormState({
      name: emp.name || '',
      email: emp.email || '',
      employeeId: emp.employeeId || '', 
      username: emp.username || '',
      password: '', // Password intentionally empty on edit load
      nid: emp.nid || '',
      role: (emp.role || 'EMPLOYEE') as any,
      department: emp.department || '',
      designation: emp.designation || '',
      avatar: emp.avatar || '',
      joiningDate: emp.joiningDate || new Date().toISOString().split('T')[0],
      mobile: emp.mobile || '',
      emergencyContact: emp.emergencyContact || '',
      salary: emp.salary || 0,
      employmentType: emp.employmentType || 'PERMANENT',
      location: emp.location || '',
      workType: emp.workType || 'OFFICE',
      lineManagerId: emp.lineManagerId || '',
      teamId: emp.teamId || '',
      shiftId: emp.shiftId || ''
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => {
    if (!isAdmin) return;
    const emp = employees.find((employee) => employee.id === id);
    if (!emp) return;
    if (!canManageEmployeeRecord(user?.role, emp.role)) {
      showToast(t('cannotEditAdmin'), 'error');
      return;
    }
    if (onNavigate) {
      onNavigate('employee-discharge', { employeeId: id });
      return;
    }
    setLifecycleModal({
      type: 'discharge',
      employeeName: emp.name,
      employeeId: emp.employeeId,
      deleteId: id,
    });
  };

  const confirmDeleteEmployee = async () => {
    if (!lifecycleModal?.deleteId) return;
    const emp = employees.find(e => e.id === lifecycleModal.deleteId);
    if (emp && needsClockAdmission(emp.role) && emp.employeeId) {
      await hrService.updateProfile(emp.id, { status: 'INACTIVE' }).catch(() => {});
      try {
        await hrService.triggerDmprepSync('export-employee-discharge', emp.id);
      } catch {
        /* best-effort DMPREP cleanup before account removal */
      }
    }
    await hrService.deleteEmployee(lifecycleModal.deleteId);
    setLifecycleModal(null);
    await fetchEmployees();
    showToast(t('dmprepChecklist.dischargeComplete', { name: lifecycleModal.employeeName }), 'success');
  };

  const handleActivate = async (emp: Employee) => {
    if (!isAdmin) return;
    if (!confirm(`Activate ${emp.name}'s account? This confirms their email so they can log in immediately.`)) return;
    const result = await hrService.activateUser(emp.id);
    if (result.success) {
      showToast(t('activated', { name: emp.name }), 'success');
      await fetchEmployees();
    } else {
      showToast(result.message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!canAssignRole(user?.role, formState.role)) {
      setFormError(t('cannotAssignAdmin'));
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    console.log('[EmployeeDirectory] Submitting form with state:', {
      name: formState.name,
      teamId: formState.teamId,
      shiftId: formState.shiftId,
      isEdit: !!editingId
    });

    try {
      if (editingId) {
        console.log('[EmployeeDirectory] Updating employee:', editingId);
        await hrService.updateProfile(editingId, formState as any);
        setShowModal(false);
      } else {
        console.log('[EmployeeDirectory] Creating new employee');
        await hrService.addEmployee(formState as any);
        setShowModal(false);
        if (needsClockAdmission(formState.role)) {
          const list = await hrService.getEmployees();
          const created = list.find(
            e => e.email === formState.email || e.employeeId === formState.employeeId
          );
          if (created && onNavigate) {
            onNavigate('employee-admission', { employeeId: created.id });
          } else {
            setLifecycleModal({
              type: 'admission',
              employeeName: formState.name,
              employeeId: formState.employeeId,
            });
          }
        } else {
          showToast(t('staffAccountCreated', { name: formState.name, role: tRole(formState.role) }), 'success');
        }
      }
    } catch (err: any) {
      console.error('[EmployeeDirectory] Submit error:', err);
      setFormError(err.message || t('operationFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTeamName = (teamId?: string) => {
    if (!teamId) return t('noTeam');
    return teams.find(tm => tm.id === teamId)?.name || t('unknownTeam');
  };

  const getShiftName = (shiftId?: string) => {
    if (!shiftId) return t('noShiftAssigned');
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return t('unknownShift');
    return `${shift.name} (${shift.startTime}-${shift.endTime})`;
  };

  const downloadCSV = () => {
    if (exportData.length === 0) return;
    setIsGeneratingCSV(true);
    try {
      const headers = ['Employee ID', 'Name', 'Email', 'Department', 'Designation', 'Role', 'Team', 'Status', 'Employment Type', 'Joining Date', 'Mobile', 'Location', 'Work Type'];
      const rows = exportData.map(emp => [
        emp.employeeId || '',
        emp.name || '',
        emp.email || '',
        emp.department || '',
        emp.designation || '',
        emp.role || '',
        getTeamName(emp.teamId),
        emp.status || '',
        emp.employmentType || '',
        emp.joiningDate || '',
        emp.mobile || '',
        emp.location || '',
        emp.workType || ''
      ]);

      const escapeCSV = (val: string) => {
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };

      const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getExportFilename('csv');
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV generation failed:', err);
    } finally {
      setIsGeneratingCSV(false);
    }
  };

  const downloadPDF = async () => {
    if (exportData.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      const doc = await createPdfDocument('landscape');

      const deptLabel =
        selectedExportDepts.length === 0 || selectedExportDepts.length === depts.length
          ? t('exportDeptAll')
          : selectedExportDepts.length === 1
            ? t('exportDeptSingle', { dept: selectedExportDepts[0] })
            : t('exportDeptMultiple', { count: selectedExportDepts.length });

      let cursorY = await drawReportHeader(doc, {
        org: orgInfo,
        title: t('exportDirectoryTitle'),
        subtitle: t('exportSubtitle', { label: deptLabel, count: exportData.length }),
      });

      const activeCount = exportData.filter(e => e.status === 'ACTIVE').length;
      const inactiveCount = exportData.length - activeCount;

      cursorY = drawMetricStrip(doc, cursorY, [
        { label: t('exportMetricTotal'), value: exportData.length, tone: 'neutral' },
        { label: t('exportMetricActive'), value: activeCount, tone: 'present' },
        { label: t('exportMetricInactive'), value: inactiveCount, tone: inactiveCount > 0 ? 'absent' : 'neutral' },
      ], t('exportSummary'));

      const tableHeaders = [
        t('exportColId'),
        t('exportColName'),
        t('exportColEmail'),
        t('exportColDepartment'),
        t('exportColDesignation'),
        t('exportColRole'),
        t('exportColTeam'),
        t('exportColStatus'),
        t('exportColType'),
        t('exportColJoining'),
        t('exportColMobile'),
        t('exportColLocation'),
        t('exportColWorkType'),
      ];
      const tableRows = exportData.map(emp => [
        emp.employeeId || '',
        emp.name || '',
        emp.email || '',
        emp.department || '',
        emp.designation || '',
        tRole(emp.role),
        getTeamName(emp.teamId),
        emp.status || '',
        emp.employmentType || '',
        emp.joiningDate ? formatIsoDateBr(emp.joiningDate) : '',
        emp.mobile || '',
        emp.location || '',
        emp.workType || '',
      ]);

      applyStandardTable(doc, {
        startY: cursorY,
        head: [tableHeaders],
        body: tableRows,
        styles: { fontSize: 7, cellPadding: 2 },
      });

      drawReportFooters(
        doc,
        t('exportGeneratedBy', { date: formatGeneratedAt() }),
        (current, total) => t('exportPage', { current, total })
      );

      doc.save(getExportFilename('pdf'));
    } catch (err: unknown) {
      console.error('PDF generation failed:', err);
      showToast(t('pdfFailed', { error: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              {isAdmin ? t('orgDirectory') : (isManager ? t('myTeamReports') : t('myTeammates'))}
            </h1>
            <HelpButton helpPointId="employees.directory" />
          </div>
          <p className="text-sm text-slate-500 font-medium tracking-tight">
            {isAdmin ? t('managingCount', { count: employees.length }) : t('viewingCount', { count: employees.length })}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowDeptFilter(!showDeptFilter)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest shadow-sm transition-all ${
                selectedExportDepts.length > 0 ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Filter size={14} />
              {selectedExportDepts.length > 0 ? t('deptsCount', { count: selectedExportDepts.length }) : t('depts')}
              <ChevronDown size={12} className={`transition-transform ${showDeptFilter ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={downloadCSV}
              disabled={exportData.length === 0 || isGeneratingCSV}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest shadow-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingCSV ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} CSV
            </button>
            <button
              onClick={downloadPDF}
              disabled={exportData.length === 0 || isGeneratingPDF}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-widest shadow-sm transition-all bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />} PDF
            </button>
            <button
              onClick={handleOpenAdd}
              disabled={!canWrite}
              className={`flex items-center gap-2 px-4 md:px-5 py-3 rounded-xl text-sm font-semibold shadow-sm transition-all ${
                canWrite
                  ? 'bg-primary text-white hover:bg-primary-hover'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <UserPlus size={16} />
              <span className="hidden sm:inline">{t('provisionNewUser')}</span>
              <span className="sm:hidden">{t('newUser')}</span>
            </button>
          </div>
        )}
      </div>

      {isAdmin && showDeptFilter && depts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-widest">
              {t('exportDepartments', { selected: selectedExportDepts.length, total: depts.length })}
            </p>
            <div className="flex gap-4">
              <button onClick={() => setSelectedExportDepts([...depts])} className="text-[9px] font-semibold uppercase text-indigo-600 hover:underline">{t('selectAll')}</button>
              <button onClick={() => setSelectedExportDepts([])} className="text-[9px] font-semibold uppercase text-rose-500 hover:underline">{t('clearAll')}</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-1">
            {depts.map(dept => {
              const isSelected = selectedExportDepts.includes(dept);
              const count = filtered.filter(e => e.department === dept).length;
              return (
                <button key={dept} onClick={() => toggleExportDept(dept)} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${isSelected ? 'bg-white border-primary/30 shadow-sm' : 'bg-slate-50/50 border-transparent opacity-60'}`}>
                  <div className={`p-1 rounded-md flex-shrink-0 ${isSelected ? 'bg-primary text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </div>
                  <span className={`text-[11px] font-bold truncate ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>{dept}</span>
                  <span className={`text-[9px] ml-auto flex-shrink-0 ${isSelected ? 'text-primary font-bold' : 'text-slate-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          {selectedExportDepts.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-3 px-1">
              {t('exportWillExport', { count: exportData.length })}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {(['all', 'pending_export', 'pending_bio'] as ClockFilter[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setClockFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                clockFilter === key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {t(`clockOnboarding.filter.${key}`)}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden />
          <input 
            type="search"
            placeholder={t('searchPlaceholder')}
            className="w-full min-h-12 pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-4 focus:ring-primary-light focus:border-primary transition-all placeholder:text-slate-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label={t('searchPlaceholder')}
          />
        </div>
        <button
          type="button"
          onClick={fetchEmployees}
          className="min-h-12 min-w-12 inline-flex items-center justify-center bg-slate-50 text-slate-600 rounded-xl border border-slate-200 hover:bg-white hover:text-slate-900 transition-all"
          title={t('refreshList')}
          aria-label={t('refreshList')}
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        {isLoading ? (
          <>
            <DirectorySkeleton />
            <DirectorySkeleton />
            <DirectorySkeleton />
          </>
        ) : filtered.map((emp) => (
          <div
            key={emp.id}
            className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm transition-all group relative h-full flex flex-col hover:border-slate-200 hover:shadow-md cursor-pointer focus-within:ring-2 focus-within:ring-primary/30"
            onClick={() => {
              if (onNavigate) {
                onNavigate('employee-view', { employeeId: emp.id });
              } else {
                setShowViewModal(emp);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (onNavigate) {
                  onNavigate('employee-view', { employeeId: emp.id });
                } else {
                  setShowViewModal(emp);
                }
              }
            }}
            role="button"
            tabIndex={0}
          >
            {/* Fixed-height identity band — keeps meta rows aligned across the grid */}
            <div className="flex items-start gap-3 min-h-[5.75rem]">
              <div className="relative shrink-0 pt-0.5">
                <img
                  src={emp.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name || 'User')}`}
                  className="w-12 h-12 rounded-xl object-cover bg-slate-100"
                  alt=""
                  width={48}
                  height={48}
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                    emp.status === 'INACTIVE' ? 'bg-slate-400' : 'bg-emerald-500'
                  }`}
                  title={emp.status === 'INACTIVE' ? t('inactive') : t('active')}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1 flex flex-col">
                <h3
                  className="font-semibold text-slate-900 text-base leading-snug line-clamp-2 break-normal min-h-[2.75rem]"
                  title={emp.name}
                >
                  {emp.name}
                </h3>
                <p className="text-sm text-slate-500 h-5 truncate" title={emp.designation || t('staff')}>
                  {emp.designation || t('staff')}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className={`inline-flex self-start px-2 py-0.5 rounded-md text-xs font-medium ${
                      emp.role === 'ADMIN'
                        ? 'bg-rose-50 text-rose-700'
                        : emp.role === 'HR'
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tRole(emp.role)}
                  </span>
                  <ClockStatusBadge status={emp.clockOnboardingStatus} />
                </div>
              </div>
            </div>

            {/* Meta band — same start Y on every card in the row */}
            <div className="mt-4 space-y-2.5 shrink-0">
              <div className="flex items-center gap-2.5 text-sm text-slate-700 min-w-0 h-5">
                <Users size={16} className="shrink-0 text-slate-400" aria-hidden />
                <span className="truncate" title={getTeamName(emp.teamId)}>
                  <span className="text-slate-500">{t('team')}: </span>
                  {getTeamName(emp.teamId)}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-700 min-w-0 h-5">
                <Building2 size={16} className="shrink-0 text-slate-400" aria-hidden />
                <span className="truncate" title={emp.department || t('notAvailable')}>
                  <span className="text-slate-500">{t('department')}: </span>
                  {emp.department || t('notAvailable')}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-slate-600 min-w-0 h-5">
                <Mail size={16} className="shrink-0 text-slate-400" aria-hidden />
                <span className="truncate" title={emp.email}>{emp.email}</span>
              </div>
            </div>

            {/* Actions always pinned to the card footer */}
            <div
              className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-1 min-h-10"
              onClick={(e) => e.stopPropagation()}
            >
              {isAdmin && canManageEmployeeRecord(user?.role, emp.role) ? (
                <>
                  {!emp.verified && (
                    <button
                      type="button"
                      onClick={() => handleActivate(emp)}
                      title={t('verifyAccount')}
                      aria-label={t('verifyAccount')}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-emerald-700/70 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                    >
                      <BadgeCheck size={18} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(emp)}
                    title={t('modifyAccount')}
                    aria-label={t('modifyAccount')}
                    className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-primary hover:bg-primary-light/40 transition-colors"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(emp.id)}
                    title={t('deleteConfirm')}
                    aria-label={t('deleteConfirm')}
                    className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-rose-700/70 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-full py-16 text-center space-y-3">
             <AlertCircle size={40} className="mx-auto text-slate-300" aria-hidden />
             <p className="text-sm font-medium text-slate-500">{t('noMatching')}</p>
          </div>
        )}
      </div>

      {/* View Modal */}
      {showViewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-primary p-8 flex justify-between items-center text-white">
              <h3 className="text-xl font-semibold uppercase tracking-tight">{t('personnelProfile')}</h3>
              <button onClick={() => setShowViewModal(null)} className="hover:bg-white/10 p-2 rounded-xl transition-all"><X size={28} /></button>
            </div>
            <div className="p-10 space-y-10 max-h-[80vh] overflow-y-auto no-scrollbar">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <img src={showViewModal.avatar || `https://ui-avatars.com/api/?name=${showViewModal.name}`} className="w-32 h-32 rounded-xl object-cover bg-slate-100 shadow-xl border-4 border-white" />
                  <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-xl border-2 border-white flex items-center justify-center ${showViewModal.role === 'ADMIN' ? 'bg-rose-500' : 'bg-primary shadow-lg'}`}>
                    <ShieldCheck size={16} className="text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-slate-900">{showViewModal.name}</h3>
                  <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em]">{showViewModal.designation}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-1">
                   <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Hash size={12} className="text-primary" /> {t('employeeId')}</p>
                   <p className="font-semibold text-slate-700">{showViewModal.employeeId}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-1">
                   <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Building2 size={12} className="text-primary" /> {t('department')}</p>
                   <p className="font-semibold text-slate-700">{showViewModal.department}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-1">
                   <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Mail size={12} className="text-primary" /> {t('workEmail')}</p>
                   <p className="font-semibold text-slate-700 truncate">{showViewModal.email}</p>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-1">
                   <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={12} className="text-primary" /> {t('teamName')}</p>
                   <p className="font-semibold text-slate-700">{getTeamName(showViewModal.teamId)}</p>
                </div>
                {shifts.length > 0 && (
                  <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-1 md:col-span-2">
                     <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                       {t('assignedShift')}
                     </p>
                     <p className="font-semibold text-slate-700">{getShiftName(showViewModal.shiftId)}</p>
                  </div>
                )}
              </div>

              <button 
                onClick={() => setShowViewModal(null)}
                className="w-full py-5 bg-slate-900 text-white rounded-xl font-semibold uppercase text-[11px] tracking-widest shadow-xl"
              >
                {t('closeProfile')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Management Modal */}
      {showModal && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-primary p-8 flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl"><UserPlus size={24}/></div>
                <h3 className="text-xl font-semibold uppercase tracking-tight">{editingId ? t('modifyAccount') : t('provisionAccount')}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="hover:bg-white/10 p-2 rounded-xl"><X size={28} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-10 space-y-8 max-h-[80vh] overflow-y-auto no-scrollbar">
              {formError && (
                <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-4 text-rose-700 animate-in shake">
                  <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
                  <p className="text-xs font-bold leading-relaxed">{formError}</p>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-10 items-center pb-10 border-b border-slate-100">
                <div 
                  className="w-40 h-40 rounded-xl bg-slate-50 border-4 border-slate-100 shadow-inner flex items-center justify-center relative overflow-hidden cursor-pointer group flex-shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {formState.avatar ? <img src={formState.avatar} className="w-full h-full object-cover" /> : <Camera size={40} className="text-slate-300" />}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Upload className="text-white" size={24} />
                  </div>
                  <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileChange} />
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('fullName')}</label>
                    <input type="text" required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={formState.name} onChange={e => setFormState({...formState,name:e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1"><Hash size={10} /> {t('officialEmployeeId')}</label>
                    <input type="text" placeholder={t('employeeIdPlaceholder')} required className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light border-indigo-100" value={formState.employeeId} onChange={e => setFormState({...formState, employeeId: e.target.value})} />
                    <p className="text-[10px] text-slate-400 px-1">{t('employeeIdPisHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('accessLevel')}</label>
                    <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={formState.role} onChange={e => setFormState({...formState, role: e.target.value as any})}>
                      {rolesForForm.map(roleCode => (
                        <option key={roleCode} value={roleCode}>{tRole(roleCode)}</option>
                      ))}
                    </select>
                    {formState.role && (
                      <p className="text-[10px] text-slate-500 px-1 mt-1.5 leading-relaxed">
                        {t(`roleHints.${formState.role}`, { defaultValue: '' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('workEmail')}</label>
                  <input type="email" required disabled={!!editingId} className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-sm outline-none disabled:opacity-50" value={formState.email} onChange={e => setFormState({...formState, email: e.target.value})} />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1">
                    <Key size={10} /> {editingId ? t('resetPassword') : t('initialPassword')}
                  </label>
                  <div className="relative">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      required={!editingId}
                      placeholder={editingId ? t('leaveBlankPassword') : t('setLoginPassword')}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" 
                      value={formState.password} 
                      onChange={e => setFormState({...formState, password: e.target.value})} 
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                      {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('assignedTeam')}</label>
                  <select
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
                    value={formState.teamId}
                    onChange={e => {
                      const selectedTeamId = e.target.value;
                      const selectedTeam = teams.find(t => t.id === selectedTeamId);
                      const leaderId = selectedTeam?.leaderId || '';
                      console.log('[EmployeeDirectory] Team changed to:', selectedTeamId, '| Auto-setting line manager:', leaderId);
                      setFormState({...formState, teamId: selectedTeamId, lineManagerId: leaderId});
                    }}
                  >
                    <option value="">{t('noTeamAssigned')}</option>
                    {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </div>
                {shifts.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('assignedShift')}</label>
                    <select
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light"
                      value={formState.shiftId}
                      onChange={e => {
                        console.log('[EmployeeDirectory] Shift changed to:', e.target.value);
                        setFormState({...formState, shiftId: e.target.value});
                      }}
                    >
                      <option value="">{t('noShiftAssigned')}</option>
                      {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime}){s.isDefault ? ' *' : ''}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('department')}</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={formState.department} onChange={e => setFormState({...formState, department: e.target.value})}>
                    {depts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">{t('designation')}</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-primary-light" value={formState.designation} onChange={e => setFormState({...formState, designation: e.target.value})}>
                    {desigs.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-8 border-t border-slate-50 flex flex-col sm:flex-row gap-4">
                <button type="button" disabled={isSubmitting} onClick={() => setShowModal(false)} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-xl font-semibold uppercase text-[11px] tracking-widest">{t('cancel')}</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 py-5 bg-primary text-white rounded-xl font-semibold uppercase text-[11px] tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-primary-hover">
                   {isSubmitting ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                   {editingId ? t('updateProfile') : t('provisionUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lifecycleModal ? (
        <DmprepLifecycleModal
          type={lifecycleModal.type}
          employeeName={lifecycleModal.employeeName}
          employeeId={lifecycleModal.employeeId}
          open
          onClose={() => setLifecycleModal(null)}
          onConfirm={
            lifecycleModal.type === 'discharge' && lifecycleModal.deleteId
              ? confirmDeleteEmployee
              : undefined
          }
        />
      ) : null}
    </div>
  );
};

export default EmployeeDirectory;
