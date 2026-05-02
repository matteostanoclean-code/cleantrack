
"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Tab = "planung" | "zeitfreigabe" | "abwesenheiten" | "lohn" | "mitarbeiter" | "objekte" | "aufgaben" | "material" | "geraete" | "schluessel" | "faktura" | "hilfe" | "einstellungen" | "chat";
type Row = Record<string, any>;
type RepeatMode = "single" | "repeat";

const today = new Date().toISOString().split("T")[0];

function iso(date: Date) {
  return date.toISOString().split("T")[0];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() === 0 ? 7 : copy.getDay();
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function mins(start?: string, end?: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let a = sh * 60 + sm;
  let b = eh * 60 + em;
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function hours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
}

function cleanPdfText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^\x00-\x7F]/g, "");
}

function downloadPdf(title: string, lines: string[], filename: string) {
  const text = [`BT /F1 18 Tf 50 790 Td (${cleanPdfText(title)}) Tj ET`];
  lines.forEach((line, i) => text.push(`BT /F1 11 Tf 50 ${750 - i * 22} Td (${cleanPdfText(line)}) Tj ET`));
  const content = text.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("planung");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [message, setMessage] = useState("");

  const [employees, setEmployees] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [entries, setEntries] = useState<Row[]>([]);
  const [absences, setAbsences] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [equipment, setEquipment] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [chatMessages, setChatMessages] = useState<Row[]>([]);

  const [taskModal, setTaskModal] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskMode, setTaskMode] = useState<RepeatMode>("single");
  const [taskSite, setTaskSite] = useState("");
  const [taskTitle, setTaskTitle] = useState("Unterhaltsreinigung");
  const [taskDate, setTaskDate] = useState(today);
  const [taskFrom, setTaskFrom] = useState("08:00");
  const [taskTo, setTaskTo] = useState("10:00");
  const [taskEmployee, setTaskEmployee] = useState("");
  const [taskRepeatEnd, setTaskRepeatEnd] = useState("");
  const [taskRepeatEvery, setTaskRepeatEvery] = useState("1");
  const [taskNotes, setTaskNotes] = useState("");

  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteRadius, setSiteRadius] = useState("50");
  const [siteLat, setSiteLat] = useState("");
  const [siteLng, setSiteLng] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);

  const [materialId, setMaterialId] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialUnit, setMaterialUnit] = useState("Stück");
  const [materialStock, setMaterialStock] = useState("0");
  const [materialMinStock, setMaterialMinStock] = useState("0");
  const [materialImage, setMaterialImage] = useState("");
  const [materialNotes, setMaterialNotes] = useState("");

  const [deviceId, setDeviceId] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceCategory, setDeviceCategory] = useState("");
  const [deviceSerial, setDeviceSerial] = useState("");
  const [deviceEmployee, setDeviceEmployee] = useState("");
  const [deviceStatus, setDeviceStatus] = useState("Aktiv");
  const [deviceImage, setDeviceImage] = useState("");
  const [deviceNotes, setDeviceNotes] = useState("");

  const [keyId, setKeyId] = useState("");
  const [keyName, setKeyName] = useState("");
  const [keyNumber, setKeyNumber] = useState("");
  const [keyCustomer, setKeyCustomer] = useState("");
  const [keyObject, setKeyObject] = useState("");
  const [keyEmployee, setKeyEmployee] = useState("");
  const [keyStatus, setKeyStatus] = useState("Ausgegeben");
  const [keyHandover, setKeyHandover] = useState(today);
  const [keyReturn, setKeyReturn] = useState("");
  const [keyNotes, setKeyNotes] = useState("");

  const [absenceEmployee, setAbsenceEmployee] = useState("");
  const [absenceType, setAbsenceType] = useState("Urlaub");
  const [absenceStart, setAbsenceStart] = useState(today);
  const [absenceEnd, setAbsenceEnd] = useState(today);
  const [absenceReason, setAbsenceReason] = useState("");

  const [chatEmployee, setChatEmployee] = useState("");
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    loadAll();
  }, [allowed]);

  useEffect(() => {
    if (tab !== "chat" || !chatEmployee) return;
    loadChat(chatEmployee);
    const t = setInterval(() => loadChat(chatEmployee), 5000);
    return () => clearInterval(t);
  }, [tab, chatEmployee]);

  async function checkAdmin() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase.from("employee_profiles").select("role").eq("auth_user_id", data.user.id).single();
    setAllowed(profile?.role === "admin");
    setLoading(false);
  }

  async function loadAll() {
    await Promise.all([loadEmployees(), loadSites(), loadTasks(), loadEntries(), loadAbsences(), loadMaterials(), loadEquipment(), loadKeys()]);
  }

  async function loadEmployees() {
    const { data } = await supabase.from("employee_profiles").select("*").order("name");
    setEmployees(data || []);
  }

  async function loadSites() {
    const { data } = await supabase.from("work_sites").select("*").order("name");
    setSites(data || []);
  }

  async function loadTasks() {
    const { data } = await supabase.from("tasks").select("*").order("task_date");
    setTasks(data || []);
  }

  async function loadEntries() {
    const { data } = await supabase.from("time_entries").select("*").order("created_at", { ascending: false }).limit(500);
    setEntries(data || []);
  }

  async function loadAbsences() {
    const { data } = await supabase.from("absence_requests").select("*").order("start_date", { ascending: false });
    setAbsences(data || []);
  }

  async function loadMaterials() {
    const { data } = await supabase.from("material_products").select("*").order("name");
    setMaterials(data || []);
  }

  async function loadEquipment() {
    const { data } = await supabase.from("equipment_items").select("*").order("name");
    setEquipment(data || []);
  }

  async function loadKeys() {
    const { data } = await supabase.from("key_items").select("*").order("key_name");
    setKeys(data || []);
  }

  async function loadChat(employeeName: string) {
    const { data } = await supabase.from("chat_messages").select("*").eq("employee_name", employeeName).order("created_at");
    setChatMessages(data || []);
    await supabase.from("chat_messages").update({ read_by_admin: true }).eq("employee_name", employeeName).eq("sender_role", "employee");
  }

  const activeEmployees = employees.filter((x) => x.active !== false && x.role !== "admin");
  const activeSites = sites.filter((x) => x.active !== false);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(selectedDate), i)), [selectedDate]);
  const pendingEntries = entries.filter((x) => x.approved !== true && x.status !== "rejected");
  const openAbsences = absences.filter((x) => !x.status || x.status === "open").length;

  async function sendPush(employeeName: string, title: string, body: string, url: string) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/push/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ employeeName, title, message: body, url }) });
    } catch {}
  }

  function openTask(day?: Date, employee?: Row) {
    setTaskId("");
    setTaskMode("single");
    setTaskSite("");
    setTaskTitle("Unterhaltsreinigung");
    setTaskDate(day ? iso(day) : today);
    setTaskFrom("08:00");
    setTaskTo("10:00");
    setTaskEmployee(employee?.name || "");
    setTaskRepeatEnd("");
    setTaskRepeatEvery("1");
    setTaskNotes("");
    setTaskModal(true);
  }

  function editTask(task: Row) {
    setTaskId(task.id);
    setTaskMode("single");
    setTaskSite(task.work_site_id || "");
    setTaskTitle(task.title || "Unterhaltsreinigung");
    setTaskDate(task.task_date || today);
    setTaskFrom(task.start_time || "08:00");
    setTaskTo(task.end_time || "10:00");
    setTaskEmployee(task.employee_name || "");
    setTaskNotes(task.notes || "");
    setTaskModal(true);
  }

  async function saveTask() {
    const site = activeSites.find((x) => x.id === taskSite);
    if (!site || !taskEmployee || !taskTitle) {
      setMessage("Bitte Objekt, Auftrag und Mitarbeiter auswählen.");
      return;
    }
    const duration = mins(taskFrom, taskTo);
    const base = { title: taskTitle, site: site.name, employee_name: taskEmployee, start_time: taskFrom, end_time: taskTo, max_minutes: duration, planned_minutes: duration, work_site_id: site.id, notes: taskNotes || null, done: false };
    if (taskId) {
      const { error } = await supabase.from("tasks").update({ ...base, task_date: taskDate }).eq("id", taskId);
      if (error) return setMessage(error.message);
      await sendPush(taskEmployee, "Einsatz geändert", `${site.name} am ${taskDate}`, "/mitarbeiter?tab=schedule");
    } else if (taskMode === "repeat" && taskRepeatEnd) {
      const rows = [];
      let cur = new Date(taskDate);
      const end = new Date(taskRepeatEnd);
      const every = Math.max(1, Number(taskRepeatEvery || 1));
      const group = crypto.randomUUID();
      let guard = 0;
      while (cur <= end && guard < 104) {
        rows.push({ ...base, task_date: iso(cur), recurrence_group_id: group });
        cur = addDays(cur, every * 7);
        guard += 1;
      }
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) return setMessage(error.message);
      await sendPush(taskEmployee, "Neue Einsatzserie", `${site.name} ab ${taskDate}`, "/mitarbeiter?tab=schedule");
    } else {
      const { error } = await supabase.from("tasks").insert([{ ...base, task_date: taskDate }]);
      if (error) return setMessage(error.message);
      await sendPush(taskEmployee, "Neuer Einsatz", `${site.name} am ${taskDate}`, "/mitarbeiter?tab=schedule");
    }
    setTaskModal(false);
    await loadTasks();
  }

  async function deleteTask(task: Row) {
    if (!window.confirm("Einsatz wirklich löschen?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) return setMessage(error.message);
    if (task.employee_name) await sendPush(task.employee_name, "Einsatz gelöscht", `${task.site} am ${task.task_date}`, "/mitarbeiter?tab=schedule");
    await loadTasks();
  }

  async function approveEntry(entry: Row, approved: boolean) {
    await supabase.from("time_entries").update({ approved, status: approved ? "approved" : "rejected" }).eq("id", entry.id);
    await loadEntries();
  }

  async function geocode() {
    if (!siteAddress) return setMessage("Bitte Adresse eintragen.");
    setGeoLoading(true);
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(siteAddress)}`);
    const json = await res.json();
    setGeoLoading(false);
    if (!res.ok) return setMessage(json.error || "GPS konnte nicht ermittelt werden.");
    setSiteLat(String(json.latitude));
    setSiteLng(String(json.longitude));
    setMessage("GPS wurde ermittelt.");
  }

  function editSite(site: Row) {
    setSiteId(site.id);
    setSiteName(site.name || "");
    setSiteAddress(site.address || "");
    setSiteRadius(String(site.allowed_radius_m || 50));
    setSiteLat(site.latitude === null ? "" : String(site.latitude));
    setSiteLng(site.longitude === null ? "" : String(site.longitude));
    setSiteNotes(site.notes || "");
  }

  async function saveSite() {
    if (!siteName || !siteAddress) return setMessage("Bitte Objektname und Adresse eintragen.");
    const payload = { name: siteName, address: siteAddress, allowed_radius_m: Number(siteRadius || 50), latitude: siteLat ? Number(siteLat) : null, longitude: siteLng ? Number(siteLng) : null, notes: siteNotes || null, active: true };
    const req = siteId ? supabase.from("work_sites").update(payload).eq("id", siteId) : supabase.from("work_sites").insert([payload]);
    const { error } = await req;
    if (error) return setMessage(error.message);
    setSiteId(""); setSiteName(""); setSiteAddress(""); setSiteRadius("50"); setSiteLat(""); setSiteLng(""); setSiteNotes("");
    await loadSites();
  }

  async function uploadImage(file: File | null, folder: string) {
    if (!file) return "";
    if (!file.type.startsWith("image/")) throw new Error("Bitte Bild auswählen.");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("materials").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("materials").getPublicUrl(path);
    return data.publicUrl;
  }

  function editMaterial(row: Row) {
    setMaterialId(row.id); setMaterialName(row.name || ""); setMaterialCategory(row.category || ""); setMaterialUnit(row.unit || "Stück"); setMaterialStock(String(row.current_stock || 0)); setMaterialMinStock(String(row.min_stock || 0)); setMaterialImage(row.image_url || ""); setMaterialNotes(row.notes || "");
  }

  async function saveMaterial() {
    if (!materialName) return setMessage("Bitte Produktname eintragen.");
    const payload = { name: materialName, category: materialCategory || null, unit: materialUnit || "Stück", current_stock: Number(materialStock || 0), min_stock: Number(materialMinStock || 0), image_url: materialImage || null, notes: materialNotes || null };
    const req = materialId ? supabase.from("material_products").update(payload).eq("id", materialId) : supabase.from("material_products").insert([payload]);
    const { error } = await req;
    if (error) return setMessage(error.message);
    setMaterialId(""); setMaterialName(""); setMaterialCategory(""); setMaterialUnit("Stück"); setMaterialStock("0"); setMaterialMinStock("0"); setMaterialImage(""); setMaterialNotes("");
    await loadMaterials();
  }

  function editDevice(row: Row) {
    setDeviceId(row.id); setDeviceName(row.name || ""); setDeviceCategory(row.category || ""); setDeviceSerial(row.serial_number || ""); setDeviceEmployee(row.assigned_to || ""); setDeviceStatus(row.status || "Aktiv"); setDeviceImage(row.image_url || ""); setDeviceNotes(row.notes || "");
  }

  async function saveDevice() {
    if (!deviceName) return setMessage("Bitte Gerätename eintragen.");
    const payload = { name: deviceName, category: deviceCategory || null, serial_number: deviceSerial || null, assigned_to: deviceEmployee || null, status: deviceStatus, image_url: deviceImage || null, notes: deviceNotes || null };
    const req = deviceId ? supabase.from("equipment_items").update(payload).eq("id", deviceId) : supabase.from("equipment_items").insert([payload]);
    const { error } = await req;
    if (error) return setMessage(error.message);
    setDeviceId(""); setDeviceName(""); setDeviceCategory(""); setDeviceSerial(""); setDeviceEmployee(""); setDeviceStatus("Aktiv"); setDeviceImage(""); setDeviceNotes("");
    await loadEquipment();
  }

  function editKey(row: Row) {
    setKeyId(row.id); setKeyName(row.key_name || ""); setKeyNumber(row.key_number || ""); setKeyCustomer(row.customer_name || ""); setKeyObject(row.object_name || ""); setKeyEmployee(row.employee_name || ""); setKeyStatus(row.status || "Ausgegeben"); setKeyHandover(row.handover_date || today); setKeyReturn(row.return_date || ""); setKeyNotes(row.notes || "");
  }

  async function saveKey() {
    if (!keyName) return setMessage("Bitte Schlüsselbezeichnung eintragen.");
    const payload = { key_name: keyName, key_number: keyNumber || null, customer_name: keyCustomer || null, object_name: keyObject || null, employee_name: keyEmployee || null, status: keyStatus, handover_date: keyHandover || null, return_date: keyReturn || null, notes: keyNotes || null };
    const req = keyId ? supabase.from("key_items").update(payload).eq("id", keyId) : supabase.from("key_items").insert([payload]);
    const { error } = await req;
    if (error) return setMessage(error.message);
    setKeyId(""); setKeyName(""); setKeyNumber(""); setKeyCustomer(""); setKeyObject(""); setKeyEmployee(""); setKeyStatus("Ausgegeben"); setKeyHandover(today); setKeyReturn(""); setKeyNotes("");
    await loadKeys();
  }

  function keyPdf(row?: Row) {
    const r = row || { key_name: keyName, key_number: keyNumber, customer_name: keyCustomer, object_name: keyObject, employee_name: keyEmployee, status: keyStatus, handover_date: keyHandover, return_date: keyReturn, notes: keyNotes };
    downloadPdf("CleanTrack - Schluesseluebergabe", [
      "Schluesseluebergabe an den Kunden",
      "",
      `Kunde: ${r.customer_name || "____________________________"}`,
      `Objekt: ${r.object_name || "____________________________"}`,
      `Schluessel: ${r.key_name || "____________________________"}`,
      `Schluesselnummer: ${r.key_number || "____________________________"}`,
      `Ausgegeben an: ${r.employee_name || "____________________________"}`,
      `Uebergabedatum: ${r.handover_date || "____________________________"}`,
      `Rueckgabedatum: ${r.return_date || "____________________________"}`,
      `Status: ${r.status || "Ausgegeben"}`,
      "",
      "Notizen:",
      r.notes || "____________________________________________________________",
      "",
      "Mit meiner Unterschrift bestaetige ich die ordnungsgemaesse Uebergabe der oben genannten Schluessel.",
      "",
      "Unterschrift Kunde: ________________________________",
      "",
      "Unterschrift Mitarbeiter: ___________________________",
    ], `schluesseluebergabe-${r.key_name || "schluessel"}.pdf`);
  }

  async function createAbsence() {
    if (!absenceEmployee) return setMessage("Bitte Mitarbeiter auswählen.");
    const { error } = await supabase.from("absence_requests").insert([{ employee_name: absenceEmployee, absence_type: absenceType, start_date: absenceStart, end_date: absenceEnd, reason: absenceReason || null, status: "open" }]);
    if (error) return setMessage(error.message);
    setAbsenceReason(""); await loadAbsences();
  }

  async function decideAbsence(row: Row, status: "approved" | "rejected") {
    await supabase.from("absence_requests").update({ status }).eq("id", row.id);
    await sendPush(row.employee_name, status === "approved" ? "Abwesenheit genehmigt" : "Abwesenheit abgelehnt", `${row.absence_type}: ${row.start_date} - ${row.end_date}`, "/mitarbeiter?tab=profile");
    await loadAbsences();
  }

  async function sendChat() {
    if (!chatEmployee || !chatText.trim()) return setMessage("Bitte Mitarbeiter und Nachricht auswählen.");
    const text = chatText.trim(); setChatText("");
    const { error } = await supabase.from("chat_messages").insert([{ employee_name: chatEmployee, sender_role: "admin", sender_name: "Admin", message: text, read_by_admin: true, read_by_employee: false }]);
    if (error) return setMessage(error.message);
    await sendPush(chatEmployee, "Neue Nachricht", text, "/mitarbeiter?tab=chat");
    await loadChat(chatEmployee);
  }

  if (loading) return <main className="p-8">Lade...</main>;
  if (!allowed) return <main className="min-h-screen bg-slate-100 p-8"><div className="rounded-2xl bg-white p-8"><h1 className="text-2xl font-bold">Kein Zugriff</h1><p className="text-slate-500">Dieser Bereich ist nur für Administratoren sichtbar.</p></div></main>;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 overflow-y-auto bg-[#111a35] p-5 text-white lg:block">
          <div className="mb-6 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-black">C</div><div><p className="font-bold">Matteo Stano Clean</p><p className="font-bold">Gebäudereinigung</p></div></div>
          <div className="mb-6 rounded-lg bg-white/10 px-4 py-3"><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent outline-none placeholder:text-white/70" placeholder="🔍 Suche" /></div>
          <nav className="space-y-5">
            <NavGroup items={[["planung", "▦", "Einsatzplaner", 0], ["zeitfreigabe", "⏱", "Zeitenfreigabe", pendingEntries.length], ["abwesenheiten", "✈", "Abwesenheiten", openAbsences], ["lohn", "💰", "Lohnabrechnung", 0]]} tab={tab} setTab={setTab} />
            <NavGroup items={[["mitarbeiter", "👥", "Mitarbeiter", 0], ["objekte", "🏢", "Objekte", 0], ["aufgaben", "🧾", "Aufgaben", 0], ["material", "📦", "Materialwesen", 0], ["geraete", "🔧", "Geräte", 0], ["schluessel", "🔑", "Schlüssel", 0]]} tab={tab} setTab={setTab} />
            <NavGroup items={[["faktura", "▥", "Faktura", 0], ["chat", "💬", "Chat", 0], ["hilfe", "❔", "Hilfe", 0], ["einstellungen", "⚙", "Einstellungen", 0]]} tab={tab} setTab={setTab} />
          </nav>
          <div className="mt-8 border-t border-white/10 pt-5"><p className="font-bold">Matteo Stano</p><p className="text-sm text-white/60">Admin</p></div>
        </aside>
        <section className="flex-1 overflow-x-hidden p-4 lg:p-8">
          {message && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 font-bold text-blue-700">{message}</div>}
          {tab === "planung" && <Planner week={week} selectedDate={selectedDate} setSelectedDate={setSelectedDate} setPrev={() => setSelectedDate(addDays(selectedDate, -7))} setNext={() => setSelectedDate(addDays(selectedDate, 7))} setToday={() => setSelectedDate(new Date())} employees={activeEmployees} tasks={tasks} openTask={openTask} editTask={editTask} deleteTask={deleteTask} />}
          {tab === "zeitfreigabe" && <TimeApproval entries={pendingEntries} approve={(row: any) => approveEntry(row, true)} reject={(row: any) => approveEntry(row, false)} />}
          {tab === "abwesenheiten" && <Absences employees={activeEmployees} absences={absences} absenceEmployee={absenceEmployee} setAbsenceEmployee={setAbsenceEmployee} absenceType={absenceType} setAbsenceType={setAbsenceType} absenceStart={absenceStart} setAbsenceStart={setAbsenceStart} absenceEnd={absenceEnd} setAbsenceEnd={setAbsenceEnd} absenceReason={absenceReason} setAbsenceReason={setAbsenceReason} createAbsence={createAbsence} decideAbsence={decideAbsence} />}
          {tab === "lohn" && <Payroll employees={activeEmployees} entries={entries} />}
          {tab === "mitarbeiter" && <Employees employees={employees} />}
          {tab === "objekte" && <Objects sites={activeSites} siteId={siteId} siteName={siteName} setSiteName={setSiteName} siteAddress={siteAddress} setSiteAddress={setSiteAddress} siteRadius={siteRadius} setSiteRadius={setSiteRadius} siteLat={siteLat} setSiteLat={setSiteLat} siteLng={siteLng} setSiteLng={setSiteLng} siteNotes={siteNotes} setSiteNotes={setSiteNotes} geo={geocode} geoLoading={geoLoading} saveSite={saveSite} editSite={editSite} deactivate={async (id: string) => { await supabase.from("work_sites").update({ active: false }).eq("id", id); await loadSites(); }} />}
          {tab === "aufgaben" && <Tasks tasks={tasks} editTask={editTask} deleteTask={deleteTask} />}
          {tab === "material" && <Material materials={materials} materialId={materialId} materialName={materialName} setMaterialName={setMaterialName} materialCategory={materialCategory} setMaterialCategory={setMaterialCategory} materialUnit={materialUnit} setMaterialUnit={setMaterialUnit} materialStock={materialStock} setMaterialStock={setMaterialStock} materialMinStock={materialMinStock} setMaterialMinStock={setMaterialMinStock} materialImage={materialImage} setMaterialImage={setMaterialImage} materialNotes={materialNotes} setMaterialNotes={setMaterialNotes} upload={async (f: File) => setMaterialImage(await uploadImage(f, "materials"))} save={saveMaterial} edit={editMaterial} remove={async (r: any) => { await supabase.from("material_products").delete().eq("id", r.id); await loadMaterials(); }} />}
          {tab === "geraete" && <Devices equipment={equipment} employees={activeEmployees} deviceId={deviceId} deviceName={deviceName} setDeviceName={setDeviceName} deviceCategory={deviceCategory} setDeviceCategory={setDeviceCategory} deviceSerial={deviceSerial} setDeviceSerial={setDeviceSerial} deviceEmployee={deviceEmployee} setDeviceEmployee={setDeviceEmployee} deviceStatus={deviceStatus} setDeviceStatus={setDeviceStatus} deviceImage={deviceImage} setDeviceImage={setDeviceImage} deviceNotes={deviceNotes} setDeviceNotes={setDeviceNotes} upload={async (f: File) => setDeviceImage(await uploadImage(f, "equipment"))} save={saveDevice} edit={editDevice} remove={async (r: any) => { await supabase.from("equipment_items").delete().eq("id", r.id); await loadEquipment(); }} />}
          {tab === "schluessel" && <Keys keysList={keys} employees={activeEmployees} sites={activeSites} keyId={keyId} keyName={keyName} setKeyName={setKeyName} keyNumber={keyNumber} setKeyNumber={setKeyNumber} keyCustomer={keyCustomer} setKeyCustomer={setKeyCustomer} keyObject={keyObject} setKeyObject={setKeyObject} keyEmployee={keyEmployee} setKeyEmployee={setKeyEmployee} keyStatus={keyStatus} setKeyStatus={setKeyStatus} keyHandover={keyHandover} setKeyHandover={setKeyHandover} keyReturn={keyReturn} setKeyReturn={setKeyReturn} keyNotes={keyNotes} setKeyNotes={setKeyNotes} save={saveKey} edit={editKey} remove={async (r: any) => { await supabase.from("key_items").delete().eq("id", r.id); await loadKeys(); }} pdf={keyPdf} />}
          {tab === "chat" && <Chat employees={activeEmployees} employee={chatEmployee} setEmployee={(v: string) => { setChatEmployee(v); loadChat(v); }} messages={chatMessages} text={chatText} setText={setChatText} send={sendChat} />}
          {(["faktura", "hilfe", "einstellungen"] as Tab[]).includes(tab) && <Placeholder title={tab} />}
        </section>
      </div>
      {taskModal && <TaskModal close={() => setTaskModal(false)} taskId={taskId} mode={taskMode} setMode={setTaskMode} sites={activeSites} employees={activeEmployees} taskSite={taskSite} setTaskSite={setTaskSite} taskTitle={taskTitle} setTaskTitle={setTaskTitle} taskDate={taskDate} setTaskDate={setTaskDate} taskFrom={taskFrom} setTaskFrom={setTaskFrom} taskTo={taskTo} setTaskTo={setTaskTo} taskEmployee={taskEmployee} setTaskEmployee={setTaskEmployee} taskRepeatEnd={taskRepeatEnd} setTaskRepeatEnd={setTaskRepeatEnd} taskRepeatEvery={taskRepeatEvery} setTaskRepeatEvery={setTaskRepeatEvery} taskNotes={taskNotes} setTaskNotes={setTaskNotes} save={saveTask} />}
    </main>
  );
}

function NavGroup({ items, tab, setTab }: { items: [Tab, string, string, number][]; tab: Tab; setTab: (value: Tab) => void }) {
  return <div className="space-y-1 border-b border-white/10 pb-5">{items.map(([id, icon, label, badge]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? "flex w-full items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-left font-bold" : "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left hover:bg-white/10"}><span className="flex items-center gap-3"><span>{icon}</span>{label}</span>{badge > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs">{badge}</span>}</button>)}</div>;
}
function Header({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) { return <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-600">{icon}</div><h1 className="text-2xl font-bold capitalize">{title}</h1></div>{children}</div>; }
function Button({ children, onClick, primary }: { children: React.ReactNode; onClick?: () => void; primary?: boolean }) { return <button onClick={onClick} className={primary ? "rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-sm" : "rounded-xl border bg-white px-5 py-3 font-medium shadow-sm hover:bg-slate-50"}>{children}</button>; }
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{headers.map((h) => <th key={h} className="p-3 text-left font-semibold">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Empty({ text }: { text: string }) { return <div className="mt-20 text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">×</div><p className="text-lg font-medium">{text}</p></div>; }

function Planner(p: any) { return <div><Header icon="▦" title="Einsatzplaner"><div className="flex gap-2"><Button onClick={p.setPrev}>‹</Button><Button onClick={p.setToday}>Heute</Button><Button onClick={p.setNext}>›</Button><Button primary onClick={() => p.openTask()}>⊕ Einsatz erstellen</Button></div></Header><div className="overflow-x-auto rounded-xl border bg-white shadow-sm"><div className="grid min-w-[1320px] grid-cols-[260px_repeat(7,1fr)] border-b bg-slate-50"><div className="p-4 font-bold text-slate-500">Mitarbeiter</div>{p.week.map((d: Date) => <button key={d.toISOString()} onClick={() => p.setSelectedDate(d)} className="border-l p-3 text-center font-bold"><p className="text-xs text-slate-500">{d.toLocaleDateString("de-DE", { weekday: "short" })}</p><p>{d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</p></button>)}</div>{p.employees.map((e: Row) => <div key={e.id} className="grid min-w-[1320px] grid-cols-[260px_repeat(7,1fr)] border-b"><div className="flex items-center gap-3 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{initials(e.name)}</div><div><p className="font-bold">{e.name}</p><div className="mt-2 h-1.5 w-28 rounded-full bg-red-500" /></div></div>{p.week.map((d: Date) => { const date = iso(d); const dayTasks = p.tasks.filter((t: Row) => t.employee_name === e.name && t.task_date === date); return <div key={date} className="min-h-28 border-l p-2 hover:bg-slate-50">{dayTasks.map((t: Row) => <div key={t.id} className="mb-2 rounded-lg border-l-4 border-blue-500 bg-white p-3 text-xs shadow-sm"><div className="flex justify-between"><span>{t.start_time} → {t.end_time}</span><span><button onClick={() => p.editTask(t)}>✎</button> <button onClick={() => p.deleteTask(t)}>×</button></span></div><p className="mt-1 font-bold">{t.site}</p><span className="mt-2 inline-block rounded bg-orange-100 px-2 py-1 text-[11px] text-orange-700">{t.title}</span></div>)}{dayTasks.length === 0 && <button onClick={() => p.openTask(d, e)} className="h-full min-h-20 w-full rounded-lg border border-dashed text-slate-300 hover:border-blue-300 hover:text-blue-500">+</button>}</div>; })}</div>)}</div></div>; }
function TaskModal(p: any) { return <div className="fixed inset-0 z-50 flex justify-end bg-black/30"><div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl"><div className="mb-5 flex items-center justify-between border-b pb-4"><h2 className="text-xl font-bold">{p.taskId ? "Einsatz bearbeiten" : "Einsatz erstellen"}</h2><button onClick={p.close} className="text-2xl text-slate-400">×</button></div><div className="space-y-4"><select value={p.taskSite} onChange={(e) => p.setTaskSite(e.target.value)} className="field"><option value="">Objekt auswählen</option>{p.sites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input value={p.taskTitle} onChange={(e) => p.setTaskTitle(e.target.value)} className="field" placeholder="Auftrag" /><div className="rounded-xl bg-slate-50 p-5"><div className="mb-4 flex gap-2"><button onClick={() => p.setMode("single")} className={p.mode === "single" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 text-blue-600" : "rounded-lg border bg-white px-4 py-2"}>Einmalig</button><button onClick={() => p.setMode("repeat")} className={p.mode === "repeat" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 text-blue-600" : "rounded-lg border bg-white px-4 py-2"}>Wiederholend</button></div><div className="grid gap-3 md:grid-cols-4"><input type="date" value={p.taskDate} onChange={(e) => p.setTaskDate(e.target.value)} className="field" /><input type="time" value={p.taskFrom} onChange={(e) => p.setTaskFrom(e.target.value)} className="field" /><input type="time" value={p.taskTo} onChange={(e) => p.setTaskTo(e.target.value)} className="field" /><div className="field font-bold">{hours(mins(p.taskFrom, p.taskTo))} Std.</div></div>{p.mode === "repeat" && <div className="mt-3 grid gap-3 md:grid-cols-2"><input type="number" value={p.taskRepeatEvery} onChange={(e) => p.setTaskRepeatEvery(e.target.value)} className="field" placeholder="alle x Wochen" /><input type="date" value={p.taskRepeatEnd} onChange={(e) => p.setTaskRepeatEnd(e.target.value)} className="field" /></div>}</div><select value={p.taskEmployee} onChange={(e) => p.setTaskEmployee(e.target.value)} className="field"><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><textarea value={p.taskNotes} onChange={(e) => p.setTaskNotes(e.target.value)} className="field min-h-24" placeholder="Kommentar" /></div><div className="sticky bottom-0 mt-8 flex justify-end gap-2 border-t bg-white py-4"><Button onClick={p.close}>Abbrechen</Button><Button primary onClick={p.save}>Speichern</Button></div></div></div>; }
function TimeApproval(p: any) { return <div><Header icon="⏱" title="Zeitenfreigabe"><Button>Exportieren</Button></Header><Table headers={["Datum", "Name", "Einsatz", "Fehler", "Soll-Zeit", "Abweichung", "Akzeptieren", "Ablehnen"]}>{p.entries.map((e: Row) => <tr key={e.id} className="border-b"><td className="p-3">{new Date(e.created_at).toLocaleDateString("de-DE")}</td><td className="p-3 font-bold">{e.employee_name}</td><td className="p-3">{e.work_site_name}</td><td className="p-3">{e.action}</td><td className="p-3">{hours(e.planned_minutes || 0)}</td><td className="p-3 text-red-500">{e.overtime_minutes ? `+${e.overtime_minutes} Min.` : "-"}</td><td className="p-3"><button onClick={() => p.approve(e)} className="rounded-lg bg-green-100 px-3 py-2 font-bold text-green-700">Bestätigen</button></td><td className="p-3"><button onClick={() => p.reject(e)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Ablehnen</button></td></tr>)}</Table>{p.entries.length === 0 && <Empty text="Noch keine Daten hinterlegt" />}</div>; }
function Absences(p: any) { const days = Array.from({ length: 28 }, (_, i) => addDays(weekStart(new Date()), i)); return <div><Header icon="✈" title="Abwesenheiten"><Button primary onClick={p.createAbsence}>⊕ Abwesenheit erstellen</Button></Header><div className="mb-5 grid gap-3 rounded-xl border bg-white p-5 md:grid-cols-6"><select value={p.absenceEmployee} onChange={(e) => p.setAbsenceEmployee(e.target.value)} className="field"><option value="">Mitarbeiter</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><select value={p.absenceType} onChange={(e) => p.setAbsenceType(e.target.value)} className="field"><option>Urlaub</option><option>Krankheit</option><option>Abwesend</option></select><input type="date" value={p.absenceStart} onChange={(e) => p.setAbsenceStart(e.target.value)} className="field" /><input type="date" value={p.absenceEnd} onChange={(e) => p.setAbsenceEnd(e.target.value)} className="field" /><input value={p.absenceReason} onChange={(e) => p.setAbsenceReason(e.target.value)} className="field" placeholder="Grund" /><button onClick={p.createAbsence} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div><div className="overflow-x-auto rounded-xl border bg-white"><div className="grid min-w-[1250px] grid-cols-[260px_repeat(28,1fr)] border-b bg-slate-50"><div className="p-4 font-bold text-slate-500">Mitarbeiter</div>{days.map((d) => <div key={d.toISOString()} className="border-l p-2 text-center text-xs"><p>{d.toLocaleDateString("de-DE", { weekday: "short" })}</p><p className="font-bold">{d.getDate()}</p></div>)}</div>{p.employees.map((e: Row) => <div key={e.id} className="grid min-w-[1250px] grid-cols-[260px_repeat(28,1fr)] border-b"><div className="p-4 font-bold">{e.name}</div>{days.map((d) => { const x = iso(d); const a = p.absences.find((r: Row) => r.employee_name === e.name && r.start_date <= x && r.end_date >= x); return <div key={x} className={a ? "border-l bg-blue-100 p-2 text-xs text-blue-700" : "border-l p-2 text-xs"}>{a ? a.absence_type : ""}</div>; })}</div>)}</div><div className="mt-5 grid gap-3 lg:grid-cols-3">{p.absences.map((r: Row) => <div key={r.id} className="rounded-xl border bg-white p-4"><p className="font-bold">{r.employee_name}</p><p className="text-sm text-slate-500">{r.absence_type}: {r.start_date} - {r.end_date}</p><p>Status: <b>{r.status || "open"}</b></p><div className="mt-3 flex gap-2"><button onClick={() => p.decideAbsence(r, "approved")} className="rounded-lg bg-green-100 px-3 py-2 font-bold text-green-700">Genehmigen</button><button onClick={() => p.decideAbsence(r, "rejected")} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Ablehnen</button></div></div>)}</div></div>; }
function Payroll(p: any) { return <div><Header icon="💰" title="Lohnabrechnung"><Button>Exportieren</Button></Header><Table headers={["Mitarbeiter", "Stunden", "Stundenlohn", "AG-Faktor", "Kosten"]}>{p.employees.map((e: Row) => { const count = p.entries.filter((x: Row) => x.employee_name === e.name).length; const h = count; const rate = Number(e.hourly_rate || 0); const factor = Number(e.employer_cost_factor || 1.25); return <tr key={e.id} className="border-b"><td className="p-3 font-bold">{e.name}</td><td className="p-3">{h}:00</td><td className="p-3">{rate.toFixed(2)} €</td><td className="p-3">{factor.toFixed(2)}</td><td className="p-3 font-bold">{(h * rate * factor).toFixed(2)} €</td></tr>; })}</Table></div>; }
function Employees(p: any) { return <div><Header icon="👥" title="Mitarbeiter"><Button>Exportieren</Button><Button primary>⊕ Mitarbeiter erstellen</Button></Header><Table headers={["Name", "Nummer", "Adresse", "Mitarbeitergruppe", "Zuletzt aktiv", "Status"]}>{p.employees.map((e: Row, i: number) => <tr key={e.id} className="border-b"><td className="p-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{initials(e.name)}</span><b>{e.name}</b></div></td><td className="p-3">{i + 1}</td><td className="p-3">{e.address || "-"}</td><td className="p-3">-</td><td className="p-3"><span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">vor 6 Minuten</span></td><td className="p-3"><span className="rounded bg-green-500 px-2 py-1 text-xs font-bold text-white">{e.active === false ? "Passiv" : "Aktiv"}</span></td></tr>)}</Table></div>; }
function Objects(p: any) { return <div><Header icon="🏢" title="Objekte" /><div className="mb-6 rounded-xl border bg-white p-5"><p className="mb-4 text-slate-500">Adresse eingeben, GPS automatisch berechnen, Notizen speichern.</p><div className="grid gap-3 lg:grid-cols-7"><input value={p.siteName} onChange={(e) => p.setSiteName(e.target.value)} className="field" placeholder="Objektname" /><input value={p.siteAddress} onChange={(e) => p.setSiteAddress(e.target.value)} className="field lg:col-span-2" placeholder="Adresse" /><input value={p.siteRadius} onChange={(e) => p.setSiteRadius(e.target.value)} className="field" placeholder="Radius" /><input value={p.siteLat} onChange={(e) => p.setSiteLat(e.target.value)} className="field" placeholder="Breitengrad" /><input value={p.siteLng} onChange={(e) => p.setSiteLng(e.target.value)} className="field" placeholder="Längengrad" /><button onClick={p.geo} className="rounded-xl bg-purple-100 px-4 py-3 font-bold text-purple-700">{p.geoLoading ? "Prüfe..." : "GPS ermitteln"}</button><textarea value={p.siteNotes} onChange={(e) => p.setSiteNotes(e.target.value)} className="field min-h-20 lg:col-span-5" placeholder="Notizen, Schlüssel, Zugang..." /><button onClick={p.saveSite} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div></div><div className="grid gap-4 lg:grid-cols-3">{p.sites.map((s: Row) => <div key={s.id} className="rounded-xl border bg-white p-5"><p className="text-lg font-bold">{s.name}</p><p className="text-sm text-slate-500">{s.address || "Keine Adresse"}</p><p className="mt-2 text-sm">GPS: {s.latitude}, {s.longitude}</p>{s.notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">{s.notes}</p>}<div className="mt-4 flex gap-2"><button onClick={() => p.editSite(s)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button><button onClick={() => p.deactivate(s.id)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Deaktivieren</button></div></div>)}</div></div>; }
function Tasks(p: any) { return <div><Header icon="🧾" title="Aufgaben" /><Table headers={["Datum", "Zeit", "Objekt", "Mitarbeiter", "Auftrag", "Status", "Aktion"]}>{p.tasks.map((t: Row) => <tr key={t.id} className="border-b"><td className="p-3">{t.task_date}</td><td className="p-3">{t.start_time} - {t.end_time}</td><td className="p-3">{t.site}</td><td className="p-3">{t.employee_name}</td><td className="p-3">{t.title}</td><td className="p-3">{t.done ? "Erledigt" : "Offen"}</td><td className="p-3"><button onClick={() => p.editTask(t)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => p.deleteTask(t)} className="text-red-600">Löschen</button></td></tr>)}</Table></div>; }
function Material(p: any) { return <div><Header icon="📦" title="Materialwesen"><Button primary onClick={p.save}>⊕ Produkt speichern</Button></Header><div className="mb-6 rounded-xl border bg-white p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.materialName} onChange={(e) => p.setMaterialName(e.target.value)} className="field" placeholder="Produktname" /><input value={p.materialCategory} onChange={(e) => p.setMaterialCategory(e.target.value)} className="field" placeholder="Kategorie" /><input value={p.materialUnit} onChange={(e) => p.setMaterialUnit(e.target.value)} className="field" placeholder="Einheit" /><input type="number" value={p.materialStock} onChange={(e) => p.setMaterialStock(e.target.value)} className="field" placeholder="Bestand" /><input type="number" value={p.materialMinStock} onChange={(e) => p.setMaterialMinStock(e.target.value)} className="field" placeholder="Mindestbestand" /><input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => p.upload(e.target.files?.[0] || null)} className="field" /><textarea value={p.materialNotes} onChange={(e) => p.setMaterialNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div>{p.materialImage && <img src={p.materialImage} alt="Material" className="mt-4 h-24 w-24 rounded-xl object-cover" />}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{p.materials.map((m: Row) => <div key={m.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="mb-3 h-40 overflow-hidden rounded-xl bg-slate-100">{m.image_url ? <img src={m.image_url} alt={m.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">📦</div>}</div><p className="font-bold">{m.name}</p><p className="text-sm text-slate-500">{m.category || "Ohne Kategorie"}</p><p className="mt-2 text-sm">Bestand: <b>{m.current_stock || 0}</b> {m.unit || "Stück"}</p><div className="mt-4 flex gap-2"><button onClick={() => p.edit(m)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button><button onClick={() => p.remove(m)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Löschen</button></div></div>)}</div></div>; }
function Devices(p: any) { return <div><Header icon="🔧" title="Geräte"><Button primary onClick={p.save}>⊕ Gerät speichern</Button></Header><div className="mb-6 rounded-xl border bg-white p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.deviceName} onChange={(e) => p.setDeviceName(e.target.value)} className="field" placeholder="Gerätename" /><input value={p.deviceCategory} onChange={(e) => p.setDeviceCategory(e.target.value)} className="field" placeholder="Kategorie" /><input value={p.deviceSerial} onChange={(e) => p.setDeviceSerial(e.target.value)} className="field" placeholder="Seriennummer" /><select value={p.deviceEmployee} onChange={(e) => p.setDeviceEmployee(e.target.value)} className="field"><option value="">Zugewiesen an</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><select value={p.deviceStatus} onChange={(e) => p.setDeviceStatus(e.target.value)} className="field"><option>Aktiv</option><option>Wartung</option><option>Defekt</option><option>Archiv</option></select><input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => p.upload(e.target.files?.[0] || null)} className="field" /><textarea value={p.deviceNotes} onChange={(e) => p.setDeviceNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div>{p.deviceImage && <img src={p.deviceImage} alt="Gerät" className="mt-4 h-24 w-24 rounded-xl object-cover" />}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{p.equipment.map((d: Row) => <div key={d.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="mb-3 h-36 overflow-hidden rounded-xl bg-slate-100">{d.image_url ? <img src={d.image_url} alt={d.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">🔧</div>}</div><p className="font-bold">{d.name}</p><p className="text-sm text-slate-500">{d.category || "Ohne Kategorie"}</p><p className="text-sm">Seriennr.: {d.serial_number || "-"}</p><p className="text-sm">Zuweisung: {d.assigned_to || "-"}</p><div className="mt-4 flex gap-2"><button onClick={() => p.edit(d)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button><button onClick={() => p.remove(d)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Löschen</button></div></div>)}</div></div>; }
function Keys(p: any) { return <div><Header icon="🔑" title="Schlüssel"><Button onClick={() => p.pdf()}>PDF Übergabe</Button><Button primary onClick={p.save}>⊕ Schlüssel speichern</Button></Header><div className="mb-6 rounded-xl border bg-white p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.keyName} onChange={(e) => p.setKeyName(e.target.value)} className="field" placeholder="Schlüsselbezeichnung" /><input value={p.keyNumber} onChange={(e) => p.setKeyNumber(e.target.value)} className="field" placeholder="Schlüsselnummer" /><input value={p.keyCustomer} onChange={(e) => p.setKeyCustomer(e.target.value)} className="field" placeholder="Kunde" /><select value={p.keyObject} onChange={(e) => p.setKeyObject(e.target.value)} className="field"><option value="">Objekt</option>{p.sites.map((s: Row) => <option key={s.id} value={s.name}>{s.name}</option>)}</select><select value={p.keyEmployee} onChange={(e) => p.setKeyEmployee(e.target.value)} className="field"><option value="">Ausgegeben an</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><select value={p.keyStatus} onChange={(e) => p.setKeyStatus(e.target.value)} className="field"><option>Ausgegeben</option><option>Zurückgegeben</option><option>Verloren</option><option>Archiv</option></select><input type="date" value={p.keyHandover} onChange={(e) => p.setKeyHandover(e.target.value)} className="field" /><input type="date" value={p.keyReturn} onChange={(e) => p.setKeyReturn(e.target.value)} className="field" /><textarea value={p.keyNotes} onChange={(e) => p.setKeyNotes(e.target.value)} className="field min-h-20 md:col-span-2" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div></div><Table headers={["Schlüssel", "Nummer", "Kunde", "Objekt", "Ausgegeben an", "Status", "PDF", "Aktion"]}>{p.keysList.map((k: Row) => <tr key={k.id} className="border-b"><td className="p-3 font-bold">{k.key_name}</td><td className="p-3">{k.key_number || "-"}</td><td className="p-3">{k.customer_name || "-"}</td><td className="p-3">{k.object_name || "-"}</td><td className="p-3">{k.employee_name || "-"}</td><td className="p-3">{k.status}</td><td className="p-3"><button onClick={() => p.pdf(k)} className="rounded-lg bg-purple-100 px-3 py-2 font-bold text-purple-700">PDF</button></td><td className="p-3"><button onClick={() => p.edit(k)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => p.remove(k)} className="text-red-600">Löschen</button></td></tr>)}</Table></div>; }
function Chat(p: any) { return <div><Header icon="💬" title="Chat" /><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><div className="rounded-xl bg-slate-100 p-4"><h2 className="mb-3 font-bold">Mitarbeiter</h2>{p.employees.map((e: Row) => <button key={e.id} onClick={() => p.setEmployee(e.name)} className={p.employee === e.name ? "mb-2 w-full rounded-xl bg-blue-600 p-3 text-left font-bold text-white" : "mb-2 w-full rounded-xl bg-white p-3 text-left"}>{e.name}</button>)}</div><div className="rounded-xl border bg-white p-5"><h2 className="mb-4 font-bold">{p.employee ? `Chat mit ${p.employee}` : "Bitte Mitarbeiter auswählen"}</h2><div className="mb-4 h-[55vh] overflow-y-auto rounded-xl bg-slate-50 p-4">{p.messages.length === 0 && <p className="text-center text-slate-400">Noch keine Nachrichten vorhanden.</p>}{p.messages.map((m: Row) => <div key={m.id} className={m.sender_role === "admin" ? "mb-3 ml-16 rounded-xl bg-blue-100 p-3" : "mb-3 mr-16 rounded-xl bg-white p-3"}><p className="text-sm font-bold">{m.sender_role === "admin" ? "Ich" : m.sender_name || m.employee_name}</p><p>{m.message}</p></div>)}</div><div className="flex gap-2"><input value={p.text} onChange={(e) => p.setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") p.send(); }} className="field" placeholder="Nachricht schreiben..." /><button onClick={p.send} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Senden</button></div></div></div></div>; }
function Placeholder({ title }: { title: string }) { return <div className="rounded-xl border bg-white p-10 text-center"><h1 className="text-2xl font-bold capitalize">{title}</h1><p className="mt-2 text-slate-500">Dieser Bereich ist vorbereitet.</p></div>; }
