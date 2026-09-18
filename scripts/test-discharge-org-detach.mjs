/**
 * Discharge org detach: inactive leaders leave team + reports.
 * Run: npx vite-node scripts/test-discharge-org-detach.mjs
 */
import assert from 'node:assert/strict';
import {
  activeTeamLeadName,
  dischargedIdsFromProfiles,
  planDischargeOrgDetach,
} from '../src/utils/dischargeOrgDetach.ts';

const giseli = { id: 'g1', status: 'INACTIVE', lineManagerId: null };
const sonia = { id: 's1', status: 'ACTIVE', lineManagerId: 'g1', name: 'Sonia' };
const maycol = { id: 'm1', status: 'ACTIVE', lineManagerId: 'g1', name: 'Maycol' };
const other = { id: 'o1', status: 'ACTIVE', lineManagerId: 's1', name: 'Other' };

const team = { id: 't1', leaderId: 'g1' };
const teamOk = { id: 't2', leaderId: 's1' };

assert.deepEqual(dischargedIdsFromProfiles([giseli, sonia, maycol]), ['g1']);

{
  const plan = planDischargeOrgDetach({
    dischargedIds: ['g1'],
    teams: [team, teamOk],
    profiles: [giseli, sonia, maycol, other],
    leaves: [
      { id: 'l1', status: 'PENDING_MANAGER', lineManagerId: 'g1' },
      { id: 'l2', status: 'APPROVED', lineManagerId: 'g1' },
      { id: 'l3', status: 'PENDING_MANAGER', lineManagerId: 's1' },
    ],
  });
  assert.deepEqual(plan.teamIdsToClearLeader, ['t1'], 'INACTIVE leader clears team slot');
  assert.deepEqual(
    plan.profileIdsToClearManager.sort(),
    ['m1', 's1'],
    'active reports lose discharged manager',
  );
  assert.deepEqual(plan.leaveIdsToRerouteHr, ['l1'], 'only PENDING_MANAGER leaves reroute');
}

{
  const plan = planDischargeOrgDetach({
    dischargedIds: [],
    teams: [team],
    profiles: [sonia],
    leaves: [{ id: 'l1', status: 'PENDING_MANAGER', lineManagerId: 'g1' }],
  });
  assert.deepEqual(plan.teamIdsToClearLeader, []);
  assert.deepEqual(plan.profileIdsToClearManager, []);
  assert.deepEqual(plan.leaveIdsToRerouteHr, []);
}

assert.equal(activeTeamLeadName(team, [giseli, sonia]), null, 'INACTIVE lead → no name');
assert.equal(activeTeamLeadName(teamOk, [{ ...sonia, name: 'Sonia Fatima' }]), 'Sonia Fatima');
assert.equal(activeTeamLeadName({ leaderId: null }, [sonia]), null);

console.log('test-discharge-org-detach: ok');
