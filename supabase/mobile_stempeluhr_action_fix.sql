-- Erlaubt alte und neue Werte für die Stempeluhr-Spalte time_entries.action.
-- Diese Datei behebt: violates check constraint "time_entries_action_check".

alter table public.time_entries
  drop constraint if exists time_entries_action_check;

alter table public.time_entries
  add constraint time_entries_action_check
  check (
    action is null
    or action in (
      'clock_in',
      'clock_out',
      'break_start',
      'break_end',
      'start',
      'end',
      'pause_start',
      'pause_end',
      'check_in',
      'check_out',
      'absence',
      'manual',
      'auto_clock_out'
    )
  );
