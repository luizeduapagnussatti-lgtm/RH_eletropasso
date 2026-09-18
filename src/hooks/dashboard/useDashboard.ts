
import { useState, useEffect } from 'react';
import { hrService } from '../../services/hrService';
import { Employee, Attendance, LeaveBalance, Holiday, Team, AppConfig, LeaveWorkflow, CustomLeaveType } from '../../types';
import { DEFAULT_LEAVE_TYPES } from '../../constants';
import { isClockReportEmployee } from '../../utils/roles';
import { todayIsoLocal } from '../../utils/payrollPeriod';
import { punchLocalDateKey } from '../../services/punch.service';

export interface DashboardData {
  freshUser: Employee;
  activeShift?: Attendance;
  userBalance: LeaveBalance | null;
  leaveUsed: number;
  upcomingHoliday: Holiday | null;
  teamMembersCount: number;
  activeTeamMembers: number;
  lateTodayCount: number;
  pendingLeaveCount: number;
  teamInfo: Team | null;
  appConfig: AppConfig | null;
  myManager?: Employee;
  myTeamName: string;
  approverLabel: string;
  leaveTypes: CustomLeaveType[];
}

export const useDashboard = (user: any) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const today = todayIsoLocal();
        const isAdmin = user.role === 'ADMIN' || user.role === 'HR';
        const isManager = user.role === 'MANAGER' || user.role === 'TEAM_LEAD' || user.role === 'MANAGEMENT';

        const [active, balance, emps, leaves, hols, atts, punches, teams, config, wfs, leaveTypes] = await Promise.all([
          hrService.getActiveAttendance(user.id),
          hrService.getLeaveBalance(user.id),
          hrService.getEmployees(),
          hrService.getLeaves(),
          hrService.getHolidays(),
          hrService.getAttendance({ since: today, until: today, maxRows: 500, skipSelfieUrls: true }),
          hrService.listPunches({ startDate: today, endDate: today }).catch(() => []),
          hrService.getTeams(),
          hrService.getConfig(),
          hrService.getWorkflows(),
          hrService.getLeaveTypes()
        ]);

        // CRITICAL: Find fresh user record
        const me = emps.find(e => e.id === user.id) || user;

        // 1. Calculate Stats
        const myUsedLeaves = leaves
          .filter(l => l.employeeId === user.id && l.status === 'APPROVED')
          .reduce((acc, curr) => acc + (curr.totalDays || 0), 0);

        const futureHols = hols
          .filter(h => h.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));

        // 2. Filter Team Members based on Role
        let visibleEmployees: Employee[] = [];
        let teamInfo: Team | null = null;

        if (isAdmin) {
          visibleEmployees = emps;
        } else if (isManager) {
          // STRICT MANAGER VISIBILITY:
          // 1. Find teams I lead
          const myLedTeams = teams.filter(t => t.leaderId === me.id);
          const myLedTeamIds = myLedTeams.map(t => t.id);
          
          // 2. Filter employees: Must report to me OR be in a team I lead
          visibleEmployees = emps.filter(e => 
            (e.teamId && myLedTeamIds.includes(e.teamId)) || 
            (e.lineManagerId === me.id)
          );
          
          // For Dashboard display, if I lead multiple teams, just show count. 
          // If I lead one, show that team name. If I lead none but have reports, show "Direct Reports".
          teamInfo = myLedTeams.length > 0 ? myLedTeams[0] : null;
        } else {
          // Employee: See peers in same team
          visibleEmployees = emps.filter(e => me.teamId && e.teamId === me.teamId);
        }

        const clockStaff = visibleEmployees.filter(e => isClockReportEmployee(e));
        const clockByKey = new Map<string, Employee>();
        for (const e of clockStaff) {
          if (e.id) clockByKey.set(e.id, e);
          if (e.employeeId) clockByKey.set(e.employeeId, e);
          if (e.clockCredential) clockByKey.set(e.clockCredential, e);
        }

        const presentIds = new Set<string>();
        const lateIds = new Set<string>();

        const resolveClockPerson = (id?: string | null) => {
          if (!id) return null;
          return clockByKey.get(id) ?? null;
        };

        for (const p of punches) {
          if (p.ignoredForCalc) continue;
          if (punchLocalDateKey(p.punchedAt) !== today) continue;
          const person = resolveClockPerson(p.employeeId);
          if (person) presentIds.add(person.id);
        }

        const todayAtts = atts.filter(a => {
          if (a.date !== today) return false;
          return Boolean(resolveClockPerson(a.employeeId));
        });
        for (const a of todayAtts) {
          const person = resolveClockPerson(a.employeeId);
          if (!person) continue;
          const present =
            a.status === 'PRESENT' ||
            a.status === 'LATE' ||
            a.status === 'EARLY_OUT' ||
            Boolean(a.checkIn);
          if (present) presentIds.add(person.id);
          if (a.status === 'LATE') lateIds.add(person.id);
        }

        const pendingLeaveCount = leaves.filter(l => {
          if (l.status !== 'PENDING_MANAGER' && l.status !== 'PENDING_HR') return false;
          const person = resolveClockPerson(l.employeeId);
          if (!person) return false;
          if (isAdmin) return true;
          if (isManager) {
            return Boolean(person) || l.lineManagerId === me.id;
          }
          return false;
        }).length;

        // 3. Context Info
        const myManager = emps.find(e => e.id === me.lineManagerId);
        const myTeamName = teams.find(t => t.id === me.teamId)?.name || 'Unassigned';
        const myWorkflow = wfs?.find((w: LeaveWorkflow) => w.department === me.department);
        const role = myWorkflow?.approverRole || 'LINE_MANAGER';
        const approverLabel = role === 'HR' ? 'HR Department' : (role === 'ADMIN' ? 'Admin' : 'Line Manager');

        setData({
          freshUser: me,
          activeShift: active,
          userBalance: balance,
          leaveUsed: myUsedLeaves,
          upcomingHoliday: futureHols[0] || null,
          teamMembersCount: clockStaff.length,
          activeTeamMembers: presentIds.size,
          lateTodayCount: lateIds.size,
          pendingLeaveCount,
          teamInfo,
          appConfig: config,
          myManager,
          myTeamName,
          approverLabel,
          leaveTypes: leaveTypes || DEFAULT_LEAVE_TYPES
        });

      } catch (err) {
        console.error("Dashboard data fetch failed", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user.id, user.role]);

  return { data, isLoading };
};
