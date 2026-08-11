-- Alte Test-Einladungen vom 09.05.2026 entfernen
--
-- In employee_invites liegen zehn ungenutzte Einladungen aus der Testphase
-- mit Adressen wie ma1@test.de und test@test.de. Sie tun nichts, sind aber
-- Ballast und koennten spaeter fuer echte Eintraege gehalten werden.

-- Erst anschauen:
select name, email, used, created_at
from public.employee_invites
order by created_at desc;

-- Dann loeschen: alles, was nie benutzt wurde und auf @test.de zeigt.
delete from public.employee_invites
where used is not true
  and email ilike '%@test.de';

-- Kontrolle: hier sollte 0 stehen.
select count(*) as verbliebene_test_einladungen
from public.employee_invites
where email ilike '%@test.de';
