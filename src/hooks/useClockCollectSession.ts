import { useEffect, useState } from 'react';
import {
  getClockCollectState,
  subscribeClockCollect,
  type ClockCollectState,
} from '../services/clockCollectSession';

export function useClockCollectSession(): ClockCollectState {
  const [state, setState] = useState<ClockCollectState>(getClockCollectState);
  useEffect(() => subscribeClockCollect(setState), []);
  return state;
}
