import React from 'react';
import { ClockSupervisorsPanel } from '../organization/ClockSupervisorsPanel';

/** Supervisors management lives in the existing organization panel. */
export const ClockSupervisorsTab: React.FC = () => (
  <div className="space-y-4">
    <ClockSupervisorsPanel />
  </div>
);
