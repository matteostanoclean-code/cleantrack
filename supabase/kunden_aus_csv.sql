-- ============================================================
-- Kunden und Objekte aus Kontakte.csv aktualisieren
-- Erzeugt am 10.8.2026, 19:18:40
-- ============================================================
--
-- Abschnitt 1 sichert, Abschnitt 2 zeigt, Abschnitt 3 aendert.
-- Bitte Abschnitt fuer Abschnitt ausfuehren und dazwischen schauen.
--
-- 30 Kunden werden aktualisiert (Adresse, Kontakt, Schreibweise)
-- 1 Kunden werden neu angelegt
-- 12 Kunden werden geloescht
-- 12 Objekte werden geloescht (davon 12 mit Koordinaten)
-- 26 Objekte bleiben unberuehrt, inklusive ihrer Koordinaten

-- ---------- Abschnitt 1: Sicherung ----------
create table if not exists backup_customers_csv  as select * from public.customers;
create table if not exists backup_work_sites_csv as select * from public.work_sites;
select (select count(*) from backup_customers_csv) as kunden_gesichert,
       (select count(*) from backup_work_sites_csv) as objekte_gesichert;

-- ---------- Abschnitt 2: Was wird geloescht? Nur anzeigen ----------
select name, company_name, customer_name from public.customers where id in (
  '81b97b1a-42fc-4977-941b-8c1796b8ea20',
  '8d7312c2-8bba-471f-a498-4f4fa04d2d73',
  '5ccbcaec-7190-4353-9309-2812d334ade4',
  '968e2f98-8446-47cc-aa89-5fac78710337',
  'c9f8578a-bf73-4038-8a24-8e0d4dfecd07',
  'c979f556-fa71-4b4c-9915-0bd0f3f451e3',
  '3c1d46c9-813f-4aed-b869-5d8e2505c1f4',
  'ad10bca9-e19a-4119-b1e8-5e98de3892ad',
  '49b01a6b-23f2-499a-831b-cc5da4ad8e9e',
  'd78724b2-880a-4770-b806-b7df23bda3ea',
  'e5c47231-1875-4393-8883-7c80cc886247',
  'e7d083cf-963c-4fdd-8ad9-1bc2fd45f488'
);
select name, customer_name, latitude, longitude from public.work_sites where id in (
  'c7dd2854-328d-43a1-93ef-40a2c95b4834',
  'cdbf096d-3767-4271-b62d-24c5d3de95d7',
  'cf68cf29-a1a3-48f3-ac07-e74dd2ab1c1e',
  'ea6928e0-c158-4fa6-a985-f42a6b2c9c8f',
  '31c132cf-f6fa-411e-8b07-c1a56f2fbae7',
  '16c07e25-7700-41b1-b6dc-ef35ee7e2519',
  'ad636e12-7fa0-405c-9d65-bb80f8b9cc60',
  '653ab5e7-5967-4507-bf93-7b1cf3bdc4ce',
  '5fea4107-676e-4e9b-a296-a806e63cca06',
  '3c56fa65-3af3-4381-8861-7ffbf01f1937',
  '3fea83da-c780-4c5c-97ba-4d3d96cc921f',
  '20ebb259-8046-4d81-8f56-0c52f35bb1e2'
);

-- ---------- Abschnitt 3a: Bestandskunden aktualisieren ----------
update public.customers set
  name = 'PWA-Projekt Gmbh & Co. eGBR', company_name = 'PWA-Projekt Gmbh & Co. eGBR', customer_name = 'PWA-Projekt Gmbh & Co. eGBR',
  street = 'Ettlinger Straße 8', postal_code = '76307', city = 'Karlsbad Langensteinbach', country = 'DE',
  address = 'Ettlinger Straße 8, 76307 Karlsbad Langensteinbach', customer_address = 'Ettlinger Straße 8, 76307 Karlsbad Langensteinbach', address_addition = 'Objekt: Hertzstr. 5, 76307 Karlsbad Langensteinbach',
  email = 'rgrossmann@wenz-adam.de', customer_email = 'rgrossmann@wenz-adam.de', phone = '72027090200', customer_phone = '72027090200',
  contact_person = null
where id = 'da92da44-6da4-4ac3-9810-48bd12be6a44';
update public.customers set
  name = 'EUROVIA Bau GmbH', company_name = 'EUROVIA Bau GmbH', customer_name = 'EUROVIA Bau GmbH',
  street = 'Gutenbergstraße 4', postal_code = '75203', city = 'Königsbach-Stein', country = 'DE',
  address = 'Gutenbergstraße 4, 75203 Königsbach-Stein', customer_address = 'Gutenbergstraße 4, 75203 Königsbach-Stein', address_addition = null,
  email = 're-stuttgart@eurovia.de', customer_email = 're-stuttgart@eurovia.de', phone = '07232 31773-17', customer_phone = '07232 31773-17',
  contact_person = 'Özlem Garenfeld'
where id = 'ebae6761-6abb-4f77-99c0-72084b7a07ea';
update public.customers set
  name = 'Bikestore-KA Gmbh', company_name = 'Bikestore-KA Gmbh', customer_name = 'Bikestore-KA Gmbh',
  street = 'Eisenbahnstraße 42', postal_code = '76229', city = 'Karlsruhe', country = 'DE',
  address = 'Eisenbahnstraße 42, 76229 Karlsruhe', customer_address = 'Eisenbahnstraße 42, 76229 Karlsruhe', address_addition = null,
  email = 'sven.knopf@bikestore-ka.de', customer_email = 'sven.knopf@bikestore-ka.de', phone = '0721 79 0 77 11', customer_phone = '0721 79 0 77 11',
  contact_person = 'Sven Knopf'
where id = '084bba74-793f-4b86-b7d6-d1cd1712e586';
update public.customers set
  name = 'Adelheid Grund', company_name = 'Adelheid Grund', customer_name = 'Adelheid Grund',
  street = 'Schlehenweg 6', postal_code = '75443', city = 'Ötisheim', country = 'DE',
  address = 'Schlehenweg 6, 75443 Ötisheim', customer_address = 'Schlehenweg 6, 75443 Ötisheim', address_addition = 'Objekt: Dorfwiesentr.',
  email = 'adelheid-grund@web.de', customer_email = 'adelheid-grund@web.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'acd68e6e-1367-4769-8a15-ded795019dc0';
update public.customers set
  name = 'WEG Wilhelmstr. 63', company_name = 'WEG Wilhelmstr. 63', customer_name = 'WEG Wilhelmstr. 63',
  street = 'Wilhelmstr. 63', postal_code = '75228', city = 'Ispringen', country = 'DE',
  address = 'Wilhelmstr. 63, 75228 Ispringen', customer_address = 'Wilhelmstr. 63, 75228 Ispringen', address_addition = null,
  email = 'cisik@gmx.de', customer_email = 'cisik@gmx.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'b7179c34-eb1a-4fc0-906c-fb86e59e63e0';
update public.customers set
  name = 'RS Hausverwaltung GmbH', company_name = 'RS Hausverwaltung GmbH', customer_name = 'RS Hausverwaltung GmbH',
  street = 'Karlsruher Str. 87a', postal_code = '75179', city = 'Pforzheim', country = 'DE',
  address = 'Karlsruher Str. 87a, 75179 Pforzheim', customer_address = 'Karlsruher Str. 87a, 75179 Pforzheim', address_addition = null,
  email = 'ramona.schubert@rshv.de', customer_email = 'ramona.schubert@rshv.de', phone = null, customer_phone = null,
  contact_person = 'René Steding'
where id = 'e804142d-2124-4b9a-910f-f0025b258721';
update public.customers set
  name = '1. FC Ispringen 1909 e.V.', company_name = '1. FC Ispringen 1909 e.V.', customer_name = '1. FC Ispringen 1909 e.V.',
  street = 'Turnstr. 39', postal_code = '75228', city = 'Ispringen', country = 'DE',
  address = 'Turnstr. 39, 75228 Ispringen', customer_address = 'Turnstr. 39, 75228 Ispringen', address_addition = null,
  email = 'alexander.cycon@fc-ispringen.de', customer_email = 'alexander.cycon@fc-ispringen.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'b299dd2e-db38-4323-bd90-6bae536f7292';
update public.customers set
  name = 'Achatz GmbH Bauunternehmung', company_name = 'Achatz GmbH Bauunternehmung', customer_name = 'Achatz GmbH Bauunternehmung',
  street = 'Bergiusstrasse 19-21', postal_code = '68219', city = 'Mannheim', country = 'DE',
  address = 'Bergiusstrasse 19-21, 68219 Mannheim', customer_address = 'Bergiusstrasse 19-21, 68219 Mannheim', address_addition = null,
  email = 'rechnung@achatz-bau.de', customer_email = 'rechnung@achatz-bau.de', phone = null, customer_phone = null,
  contact_person = null
where id = '534024f0-90f5-4b1a-a30d-1ff83c998b66';
update public.customers set
  name = 'Adelheid Grund', company_name = 'Adelheid Grund', customer_name = 'Adelheid Grund',
  street = 'Schlehenweg 6', postal_code = '75443', city = 'Ötisheim', country = 'DE',
  address = 'Schlehenweg 6, 75443 Ötisheim', customer_address = 'Schlehenweg 6, 75443 Ötisheim', address_addition = 'Objekt: Dorfwiesentr.',
  email = 'adelheid-grund@web.de', customer_email = 'adelheid-grund@web.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'a19eb6cb-a18b-4113-9462-8804dd6f015b';
update public.customers set
  name = 'Arztpraxis  Christof Schroth', company_name = 'Arztpraxis  Christof Schroth', customer_name = 'Arztpraxis  Christof Schroth',
  street = 'Pforzheimer Str. 10', postal_code = '75239', city = 'Eisingen', country = 'DE',
  address = 'Pforzheimer Str. 10, 75239 Eisingen', customer_address = 'Pforzheimer Str. 10, 75239 Eisingen', address_addition = null,
  email = null, customer_email = null, phone = null, customer_phone = null,
  contact_person = 'Christof Schroth'
where id = 'ca4ebd4a-1d56-4389-87ac-f8d9df10323c';
update public.customers set
  name = 'ASM HASEMO GmbH', company_name = 'ASM HASEMO GmbH', customer_name = 'ASM HASEMO GmbH',
  street = 'Allmendring 17', postal_code = '75203', city = 'Königsbach-Stein', country = 'DE',
  address = 'Allmendring 17, 75203 Königsbach-Stein', customer_address = 'Allmendring 17, 75203 Königsbach-Stein', address_addition = null,
  email = null, customer_email = null, phone = null, customer_phone = null,
  contact_person = 'Simone Neff'
where id = 'e687ab5f-7a3a-4400-ae15-fedb37603a2b';
update public.customers set
  name = 'Bäckerei und Konditorei Martin Maier GmbH', company_name = 'Bäckerei und Konditorei Martin Maier GmbH', customer_name = 'Bäckerei und Konditorei Martin Maier GmbH',
  street = 'Walther-Rathenau-Straße 11', postal_code = '75203', city = 'Königsbach-Stein', country = 'DE',
  address = 'Walther-Rathenau-Straße 11, 75203 Königsbach-Stein', customer_address = 'Walther-Rathenau-Straße 11, 75203 Königsbach-Stein', address_addition = null,
  email = 'info@maiersbaeckerei.de', customer_email = 'info@maiersbaeckerei.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'a787739f-8902-44de-9c24-879fc21bc8bc';   -- Schreibweise wird repariert
update public.customers set
  name = 'Bechtold GmbH & Co. KG', company_name = 'Bechtold GmbH & Co. KG', customer_name = 'Bechtold GmbH & Co. KG',
  street = 'Heidigstraße 2', postal_code = '76709', city = 'Kronau', country = 'DE',
  address = 'Heidigstraße 2, 76709 Kronau', customer_address = 'Heidigstraße 2, 76709 Kronau', address_addition = null,
  email = 'rechnung@bechtoldfenster.de', customer_email = 'rechnung@bechtoldfenster.de', phone = null, customer_phone = null,
  contact_person = 'Constanze Rauser'
where id = '7ac5d058-9543-48f7-ba40-1e58be5b3e28';
update public.customers set
  name = 'Bikestore-KA Gmbh', company_name = 'Bikestore-KA Gmbh', customer_name = 'Bikestore-KA Gmbh',
  street = 'Eisenbahnstraße 42', postal_code = '76229', city = 'Karlsruhe', country = 'DE',
  address = 'Eisenbahnstraße 42, 76229 Karlsruhe', customer_address = 'Eisenbahnstraße 42, 76229 Karlsruhe', address_addition = null,
  email = 'sven.knopf@bikestore-ka.de', customer_email = 'sven.knopf@bikestore-ka.de', phone = '0721 79 0 77 11', customer_phone = '0721 79 0 77 11',
  contact_person = 'Sven Knopf'
where id = '63447f8c-cdcd-4a81-8078-7406c13b59dd';
update public.customers set
  name = 'BIS Sachverständigen GmbH & CO. KG', company_name = 'BIS Sachverständigen GmbH & CO. KG', customer_name = 'BIS Sachverständigen GmbH & CO. KG',
  street = 'Fliederweg 17', postal_code = '75203', city = 'Königsbach-Stein', country = 'DE',
  address = 'Fliederweg 17, 75203 Königsbach-Stein', customer_address = 'Fliederweg 17, 75203 Königsbach-Stein', address_addition = null,
  email = 'rebecca.wirth@bis-s.de', customer_email = 'rebecca.wirth@bis-s.de', phone = '1752226006', customer_phone = '1752226006',
  contact_person = 'Rebecca Wirth'
where id = 'ac57f3c4-3f9b-4be1-93af-11504e0c7e57';   -- Schreibweise wird repariert
update public.customers set
  name = 'Dr. med. Eckart Weiser', company_name = 'Dr. med. Eckart Weiser', customer_name = 'Dr. med. Eckart Weiser',
  street = 'Königsbacher Str. 51', postal_code = '75196', city = 'Remchingen', country = 'DE',
  address = 'Königsbacher Str. 51, 75196 Remchingen', customer_address = 'Königsbacher Str. 51, 75196 Remchingen', address_addition = null,
  email = 'Dr.weiser@mail.de', customer_email = 'Dr.weiser@mail.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'c2564c78-0172-4fe0-8c2a-e09f89b0e8f2';
update public.customers set
  name = 'Dr. med. Uwe Fröhlich', company_name = 'Dr. med. Uwe Fröhlich', customer_name = 'Dr. med. Uwe Fröhlich',
  street = 'Eichendorffstraße 7', postal_code = '75181', city = 'Pforzheim', country = 'DE',
  address = 'Eichendorffstraße 7, 75181 Pforzheim', customer_address = 'Eichendorffstraße 7, 75181 Pforzheim', address_addition = null,
  email = 'druwefroehlich@gmail.com', customer_email = 'druwefroehlich@gmail.com', phone = null, customer_phone = null,
  contact_person = null
where id = 'af360a8f-da5c-4660-bc8f-7c7e722a30ad';   -- Schreibweise wird repariert
update public.customers set
  name = 'Evang. Kirchengemeinde Remchingen', company_name = 'Evang. Kirchengemeinde Remchingen', customer_name = 'Evang. Kirchengemeinde Remchingen',
  street = 'Im Grund 3', postal_code = '75196', city = 'Remchingen', country = 'DE',
  address = 'Im Grund 3, 75196 Remchingen', customer_address = 'Im Grund 3, 75196 Remchingen', address_addition = 'Objekt: St. Martin, Karlsbader Str. 21, 75196 Remchingen',
  email = 'Dagny.vonderGoltz@kbz.ekiba.de', customer_email = 'Dagny.vonderGoltz@kbz.ekiba.de', phone = '07232-71047', customer_phone = '07232-71047',
  contact_person = 'Dagny von der Goltz'
where id = '20a7de5b-bc67-412d-9b28-aab29cd1634f';
update public.customers set
  name = 'Hausgemeinschaft Starenweg 7', company_name = 'Hausgemeinschaft Starenweg 7', customer_name = 'Hausgemeinschaft Starenweg 7',
  street = 'Starenweg 7', postal_code = '75245', city = 'Neulingen', country = 'DE',
  address = 'Starenweg 7, 75245 Neulingen', customer_address = 'Starenweg 7, 75245 Neulingen', address_addition = null,
  email = 'vollmer.123@freenet.de', customer_email = 'vollmer.123@freenet.de', phone = null, customer_phone = null,
  contact_person = null
where id = '40395584-6df6-47b4-8144-23c5ceda6cdd';
update public.customers set
  name = 'M2 Services GmbH', company_name = 'M2 Services GmbH', customer_name = 'M2 Services GmbH',
  street = 'Hildebrandstr.3', postal_code = '75172', city = 'Pforzheim', country = 'DE',
  address = 'Hildebrandstr.3, 75172 Pforzheim', customer_address = 'Hildebrandstr.3, 75172 Pforzheim', address_addition = null,
  email = 'marija.vukovic@gmx.de', customer_email = 'marija.vukovic@gmx.de', phone = '07231-4432687', customer_phone = '07231-4432687',
  contact_person = 'Marija Knezevic'
where id = 'b6cdcdfe-397e-4549-b976-a4da161b9609';
update public.customers set
  name = 'MG Industrieelektronik GmbH', company_name = 'MG Industrieelektronik GmbH', customer_name = 'MG Industrieelektronik GmbH',
  street = 'Nobelstrasse 7', postal_code = '76275', city = 'Ettlingen', country = 'DE',
  address = 'Nobelstrasse 7, 76275 Ettlingen', customer_address = 'Nobelstrasse 7, 76275 Ettlingen', address_addition = null,
  email = 'info@mg-industrieelektronik.de', customer_email = 'info@mg-industrieelektronik.de', phone = '07243 5801 0', customer_phone = '07243 5801 0',
  contact_person = null
where id = '831643b3-0856-4fe5-b447-e5f5b603fbc5';
update public.customers set
  name = 'RS Hausverwaltung GmbH', company_name = 'RS Hausverwaltung GmbH', customer_name = 'RS Hausverwaltung GmbH',
  street = 'Karlsruher Str. 87a', postal_code = '75179', city = 'Pforzheim', country = 'DE',
  address = 'Karlsruher Str. 87a, 75179 Pforzheim', customer_address = 'Karlsruher Str. 87a, 75179 Pforzheim', address_addition = null,
  email = 'ramona.schubert@rshv.de', customer_email = 'ramona.schubert@rshv.de', phone = null, customer_phone = null,
  contact_person = 'René Steding'
where id = '8b425e98-e98b-4484-86cf-e99728525692';
update public.customers set
  name = 'Praxis für Logopädie', company_name = 'Praxis für Logopädie', customer_name = 'Praxis für Logopädie',
  street = 'Scheffelstr. 30', postal_code = '76307', city = 'Karlsbad', country = 'DE',
  address = 'Scheffelstr. 30, 76307 Karlsbad', customer_address = 'Scheffelstr. 30, 76307 Karlsbad', address_addition = null,
  email = 'brittakratz@web.de', customer_email = 'brittakratz@web.de', phone = null, customer_phone = null,
  contact_person = null
where id = '341b6d0c-249c-41a4-afb1-c36602bb13ac';
update public.customers set
  name = 'Jutta Wilßer', company_name = 'Jutta Wilßer', customer_name = 'Jutta Wilßer',
  street = 'Auf der Höhe 33', postal_code = '75181', city = 'Pforzheim', country = 'DE',
  address = 'Auf der Höhe 33, 75181 Pforzheim', customer_address = 'Auf der Höhe 33, 75181 Pforzheim', address_addition = null,
  email = 'jutta.wilsser@gmx.de', customer_email = 'jutta.wilsser@gmx.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'aa61c6ec-470a-4fa3-a3ea-a28c7bdc022b';
update public.customers set
  name = 'EUROVIA Bau GmbH', company_name = 'EUROVIA Bau GmbH', customer_name = 'EUROVIA Bau GmbH',
  street = 'Gutenbergstraße 4', postal_code = '75203', city = 'Königsbach-Stein', country = 'DE',
  address = 'Gutenbergstraße 4, 75203 Königsbach-Stein', customer_address = 'Gutenbergstraße 4, 75203 Königsbach-Stein', address_addition = null,
  email = 're-stuttgart@eurovia.de', customer_email = 're-stuttgart@eurovia.de', phone = '07232 31773-17', customer_phone = '07232 31773-17',
  contact_person = 'Özlem Garenfeld'
where id = '8d941133-60b8-448d-ba08-aa4f25f98a61';
update public.customers set
  name = 'Staib-Zarda GdbR', company_name = 'Staib-Zarda GdbR', customer_name = 'Staib-Zarda GdbR',
  street = 'Zeisigweg 5/1', postal_code = '75217', city = 'Birkenfeld', country = 'DE',
  address = 'Zeisigweg 5/1, 75217 Birkenfeld', customer_address = 'Zeisigweg 5/1, 75217 Birkenfeld', address_addition = null,
  email = 'info@architekt-staib.de', customer_email = 'info@architekt-staib.de', phone = '7231984161', customer_phone = '7231984161',
  contact_person = 'Susanne Staib'
where id = '0d7a80f1-a9c8-4e87-abd7-c99b3daeffd5';
update public.customers set
  name = 'WEG Wilhelmstr. 63', company_name = 'WEG Wilhelmstr. 63', customer_name = 'WEG Wilhelmstr. 63',
  street = 'Wilhelmstr. 63', postal_code = '75228', city = 'Ispringen', country = 'DE',
  address = 'Wilhelmstr. 63, 75228 Ispringen', customer_address = 'Wilhelmstr. 63, 75228 Ispringen', address_addition = null,
  email = 'cisik@gmx.de', customer_email = 'cisik@gmx.de', phone = null, customer_phone = null,
  contact_person = null
where id = '9b236ce9-c3b0-4a55-8df6-d5732bbf1253';
update public.customers set
  name = 'WKM Medizintechnik und Sauerstoff-Therapie GmbH', company_name = 'WKM Medizintechnik und Sauerstoff-Therapie GmbH', customer_name = 'WKM Medizintechnik und Sauerstoff-Therapie GmbH',
  street = 'Gutenbergstr. 39/1', postal_code = '72555', city = 'Metzingen', country = 'DE',
  address = 'Gutenbergstr. 39/1, 72555 Metzingen', customer_address = 'Gutenbergstr. 39/1, 72555 Metzingen', address_addition = 'Objekt: Weberstraße 52, 75239 Eisingen',
  email = 'rechnung@wkmbw-medizintechnik.de', customer_email = 'rechnung@wkmbw-medizintechnik.de', phone = null, customer_phone = null,
  contact_person = 'Jörg Müller'
where id = 'da647fb2-4317-466e-82ac-63acf45fedd7';
update public.customers set
  name = 'Wilhelm Schwender', company_name = 'Wilhelm Schwender', customer_name = 'Wilhelm Schwender',
  street = 'Theodor-Schöllig-Str. 3', postal_code = '69427', city = 'Mudau', country = 'DE',
  address = 'Theodor-Schöllig-Str. 3, 69427 Mudau', customer_address = 'Theodor-Schöllig-Str. 3, 69427 Mudau', address_addition = null,
  email = null, customer_email = null, phone = null, customer_phone = null,
  contact_person = 'Wilhelm Schwender'
where id = '81b6072d-f3a6-4f73-9fa0-a08f99fb16f2';
update public.customers set
  name = 'JonFit GmbH', company_name = 'JonFit GmbH', customer_name = 'JonFit GmbH',
  street = 'Hertzstraße 7', postal_code = '76307', city = 'Karlsbad - Langensteinbach', country = 'DE',
  address = 'Hertzstraße 7, 76307 Karlsbad - Langensteinbach', customer_address = 'Hertzstraße 7, 76307 Karlsbad - Langensteinbach', address_addition = null,
  email = 'info@jonfit.de', customer_email = 'info@jonfit.de', phone = null, customer_phone = null,
  contact_person = null
where id = 'a8d5748a-3790-4658-800b-a1ab5a49dd02';

-- ---------- Abschnitt 3b: Objektnamen korrigieren ----------
update public.work_sites set customer_name = 'BIS Sachverständigen GmbH & CO. KG', name = 'BIS Sachverständigen GmbH & CO. KG' where id = '12f73b2e-6f20-42ee-9c90-217b5c2176b4';
update public.work_sites set customer_name = 'Dr. med. Uwe Fröhlich', name = 'Dr. med. Uwe Fröhlich' where id = 'cb60115d-e5b4-49e6-9c80-7c08325b6451';
update public.work_sites set customer_name = 'Bäckerei und Konditorei Martin Maier GmbH', name = 'Bäckerei und Konditorei Martin Maier GmbH' where id = '4ce06191-b960-40ab-a812-3882b47d2a95';
update public.work_sites set customer_name = 'Jutta Wilßer', name = 'Jutta Wilßer' where id = 'bfb3ee5f-6119-4c52-8c1b-7022d5efd017';
update public.work_sites set customer_name = 'Praxis für Logopädie' where id = '9d1d3ec6-0cfc-4bc4-9506-5d6baede53c3';

-- ---------- Abschnitt 3c: Neue Kunden anlegen ----------
insert into public.customers (name, company_name, customer_name, street, postal_code, city, country, address, customer_address, address_addition, email, customer_email, phone, customer_phone, contact_person, active)
values ('LEC Construction International GmbH', 'LEC Construction International GmbH', 'LEC Construction International GmbH', 'Obenhauptstraße 7', '22335', 'Hamburg', 'DE', 'Obenhauptstraße 7, 22335 Hamburg', 'Obenhauptstraße 7, 22335 Hamburg', null, 'sintija.krilovska@lecgmbh.de', 'sintija.krilovska@lecgmbh.de', null, null, null, true);

-- ---------- Abschnitt 3d: Loeschen ----------
-- ACHTUNG: hier verschwinden Objekte samt Koordinaten. Erst Abschnitt 2 lesen.
delete from public.work_sites where id in (
  'c7dd2854-328d-43a1-93ef-40a2c95b4834',
  'cdbf096d-3767-4271-b62d-24c5d3de95d7',
  'cf68cf29-a1a3-48f3-ac07-e74dd2ab1c1e',
  'ea6928e0-c158-4fa6-a985-f42a6b2c9c8f',
  '31c132cf-f6fa-411e-8b07-c1a56f2fbae7',
  '16c07e25-7700-41b1-b6dc-ef35ee7e2519',
  'ad636e12-7fa0-405c-9d65-bb80f8b9cc60',
  '653ab5e7-5967-4507-bf93-7b1cf3bdc4ce',
  '5fea4107-676e-4e9b-a296-a806e63cca06',
  '3c56fa65-3af3-4381-8861-7ffbf01f1937',
  '3fea83da-c780-4c5c-97ba-4d3d96cc921f',
  '20ebb259-8046-4d81-8f56-0c52f35bb1e2'
);
delete from public.customers where id in (
  '81b97b1a-42fc-4977-941b-8c1796b8ea20',
  '8d7312c2-8bba-471f-a498-4f4fa04d2d73',
  '5ccbcaec-7190-4353-9309-2812d334ade4',
  '968e2f98-8446-47cc-aa89-5fac78710337',
  'c9f8578a-bf73-4038-8a24-8e0d4dfecd07',
  'c979f556-fa71-4b4c-9915-0bd0f3f451e3',
  '3c1d46c9-813f-4aed-b869-5d8e2505c1f4',
  'ad10bca9-e19a-4119-b1e8-5e98de3892ad',
  '49b01a6b-23f2-499a-831b-cc5da4ad8e9e',
  'd78724b2-880a-4770-b806-b7df23bda3ea',
  'e5c47231-1875-4393-8883-7c80cc886247',
  'e7d083cf-963c-4fdd-8ad9-1bc2fd45f488'
);

-- ---------- Abschnitt 4: Ergebnis ----------
select (select count(*) from public.customers) as kunden,
       (select count(*) from public.work_sites) as objekte,
       (select count(*) from public.work_sites where latitude is null) as objekte_ohne_koordinaten;

-- ---------- Abschnitt 5: Notfall, alles zurueckholen ----------
-- delete from public.work_sites; insert into public.work_sites select * from backup_work_sites_csv;
-- delete from public.customers; insert into public.customers select * from backup_customers_csv;
