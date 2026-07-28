-- Employment termination date (last day employed, inclusive).
-- Used by timesheet recalculation to avoid ABSENT after discharge.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS termination_date date;

COMMENT ON COLUMN public.profiles.termination_date IS
  'Last day employed (inclusive). Days after this are outside the employment window for timesheet.';
