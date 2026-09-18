/**
 * Plan org-graph cleanup when people leave (INACTIVE).
 * Pure — no I/O. Used by discharge + stale repair.
 */

export type DetachTeam = { id: string; leaderId?: string | null };
export type DetachProfile = {
  id: string;
  status?: string | null;
  lineManagerId?: string | null;
};
export type DetachLeave = {
  id: string;
  status?: string | null;
  lineManagerId?: string | null;
};

export type DischargeOrgDetachPlan = {
  teamIdsToClearLeader: string[];
  profileIdsToClearManager: string[];
  leaveIdsToRerouteHr: string[];
};

/** Ids of people who must no longer lead or manage. */
export function dischargedIdsFromProfiles(profiles: DetachProfile[]): string[] {
  return profiles.filter(p => p.status === 'INACTIVE').map(p => p.id);
}

/**
 * Clear team lead, direct reports' line manager, and open leave
 * still waiting on that manager (route to HR). Approved/rejected leave untouched.
 */
export function planDischargeOrgDetach(input: {
  dischargedIds: string[];
  teams: DetachTeam[];
  profiles: DetachProfile[];
  leaves?: DetachLeave[];
}): DischargeOrgDetachPlan {
  const discharged = new Set(input.dischargedIds.filter(Boolean));
  if (discharged.size === 0) {
    return { teamIdsToClearLeader: [], profileIdsToClearManager: [], leaveIdsToRerouteHr: [] };
  }

  const teamIdsToClearLeader = input.teams
    .filter(t => t.leaderId && discharged.has(t.leaderId))
    .map(t => t.id);

  const profileIdsToClearManager = input.profiles
    .filter(
      p =>
        p.status !== 'INACTIVE' &&
        p.lineManagerId &&
        discharged.has(p.lineManagerId),
    )
    .map(p => p.id);

  const leaveIdsToRerouteHr = (input.leaves || [])
    .filter(
      l =>
        l.status === 'PENDING_MANAGER' &&
        l.lineManagerId &&
        discharged.has(l.lineManagerId),
    )
    .map(l => l.id);

  return { teamIdsToClearLeader, profileIdsToClearManager, leaveIdsToRerouteHr };
}

/** Active team lead name, or null if missing / INACTIVE. */
export function activeTeamLeadName(
  team: { leaderId?: string | null },
  employees: { id: string; name?: string; status?: string | null }[],
): string | null {
  if (!team.leaderId) return null;
  const lead = employees.find(e => e.id === team.leaderId);
  if (!lead || lead.status === 'INACTIVE') return null;
  return lead.name || null;
}
