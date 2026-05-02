
"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Tab = "planung" | "zeitfreigabe" | "abwesenheiten" | "lohn" | "mitarbeiter" | "objekte" | "kunden" | "kontakte" | "auswertung" | "aufgaben" | "material" | "geraete" | "schluessel" | "faktura" | "hilfe" | "einstellungen" | "chat";
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


function closeAdminDropdowns() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cleantrack-close-dropdowns"));
  }
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
  const [taskDuration, setTaskDuration] = useState("120");
  const [taskEmployee, setTaskEmployee] = useState("");
  const [taskRepeatDays, setTaskRepeatDays] = useState<number[]>([new Date(today).getDay() || 7]);
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
    setTaskDuration("120");
    setTaskEmployee(employee?.name || "");
    const baseDay = day ? day.getDay() || 7 : new Date(today).getDay() || 7;
    setTaskRepeatDays([baseDay]);
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
    setTaskDuration(String(task.planned_minutes || task.max_minutes || mins(task.start_time || "08:00", task.end_time || "10:00") || 120));
    setTaskEmployee(task.employee_name || "");
    setTaskRepeatDays([new Date(task.task_date || today).getDay() || 7]);
    setTaskNotes(task.notes || "");
    setTaskModal(true);
  }

  async function saveTask() {
    const site = activeSites.find((x) => x.id === taskSite);
    if (!site || !taskEmployee || !taskTitle) {
      setMessage("Bitte Objekt, Auftrag und Mitarbeiter auswählen.");
      return;
    }
    const duration = Math.max(1, Number(taskDuration || 0));
    const base = { title: taskTitle, site: site.name, employee_name: taskEmployee, start_time: taskFrom, end_time: taskTo, max_minutes: duration, planned_minutes: duration, work_site_id: site.id, notes: taskNotes || null, done: false };
    if (taskId) {
      const { error } = await supabase.from("tasks").update({ ...base, task_date: taskDate }).eq("id", taskId);
      if (error) return setMessage(error.message);
      await sendPush(taskEmployee, "Einsatz geändert", `${site.name} am ${taskDate}`, "/mitarbeiter?tab=schedule");
    } else if (taskMode === "repeat" && taskRepeatEnd) {
      const rows = [];
      const start = new Date(taskDate);
      const end = new Date(taskRepeatEnd);
      const every = Math.max(1, Number(taskRepeatEvery || 1));
      const selectedDays = taskRepeatDays.length > 0 ? taskRepeatDays : [start.getDay() || 7];
      const group = crypto.randomUUID();
      let cur = new Date(start);
      let guard = 0;
      while (cur <= end && guard < 370) {
        const day = cur.getDay() || 7;
        const diffWeeks = Math.floor((weekStart(cur).getTime() - weekStart(start).getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (selectedDays.includes(day) && diffWeeks % every === 0) {
          rows.push({ ...base, task_date: iso(cur), recurrence_group_id: group });
        }
        cur = addDays(cur, 1);
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
    closeAdminDropdowns();
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
    closeAdminDropdowns();
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
    closeAdminDropdowns();
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
    closeAdminDropdowns();
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
    closeAdminDropdowns();
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
    setAbsenceReason(""); closeAdminDropdowns(); await loadAbsences();
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
            <div className="border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setTab("mitarbeiter")}
                className={tab === "mitarbeiter" ? "mb-1 flex w-full items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-left font-bold text-white" : "mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-white/90 hover:bg-white/10"}
              >
                <span className="flex items-center gap-3"><span>👥</span>Mitarbeiter</span>
              </button>
              <button
                type="button"
                onClick={() => setTab("objekte")}
                className={["objekte", "kunden", "kontakte", "auswertung"].includes(tab) ? "mb-1 flex w-full items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-left font-bold text-white" : "mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-white/90 hover:bg-white/10"}
              >
                <span className="flex items-center gap-3"><span>🏢</span>Objekte</span><span>⌃</span>
              </button>
              <div className="mb-2 ml-10 space-y-1 border-l border-white/10 pl-4">
                <button type="button" onClick={() => setTab("objekte")} className={tab === "objekte" ? "block w-full rounded-lg px-3 py-2 text-left font-bold text-white" : "block w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"}>Objektliste</button>
                <button type="button" onClick={() => setTab("kunden")} className={tab === "kunden" ? "block w-full rounded-lg px-3 py-2 text-left font-bold text-white" : "block w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"}>Kunden</button>
                <button type="button" onClick={() => setTab("kontakte")} className={tab === "kontakte" ? "block w-full rounded-lg px-3 py-2 text-left font-bold text-white" : "block w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"}>Kontakte</button>
                <button type="button" onClick={() => setTab("auswertung")} className={tab === "auswertung" ? "block w-full rounded-lg px-3 py-2 text-left font-bold text-white" : "block w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"}>Auswertung</button>
              </div>
              {([["aufgaben", "🧾", "Aufgaben", 0], ["material", "📦", "Materialwesen", 0], ["geraete", "🔧", "Geräte", 0], ["schluessel", "🔑", "Schlüssel", 0]] as [Tab, string, string, number][]).map(([id, icon, label, badge]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? "mb-1 flex w-full items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-left font-bold text-white" : "mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-white/90 hover:bg-white/10"}>
                  <span className="flex items-center gap-3"><span>{icon}</span>{label}</span>{badge > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{badge}</span>}
                </button>
              ))}
            </div>
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
          {tab === "mitarbeiter" && <Employees employees={employees} entries={entries} absences={absences} tasks={tasks} />}
          {tab === "objekte" && <Objects sites={activeSites} siteId={siteId} siteName={siteName} setSiteName={setSiteName} siteAddress={siteAddress} setSiteAddress={setSiteAddress} siteRadius={siteRadius} setSiteRadius={setSiteRadius} siteLat={siteLat} setSiteLat={setSiteLat} siteLng={siteLng} setSiteLng={setSiteLng} siteNotes={siteNotes} setSiteNotes={setSiteNotes} geo={geocode} geoLoading={geoLoading} saveSite={saveSite} editSite={editSite} deactivate={async (id: string) => { await supabase.from("work_sites").update({ active: false }).eq("id", id); await loadSites(); }} />}
          {tab === "kunden" && <Customers sites={sites} />}
          {tab === "kontakte" && <Contacts sites={sites} employees={employees} />}
          {tab === "auswertung" && <ObjectAnalysis sites={sites} tasks={tasks} entries={entries} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}
          {tab === "aufgaben" && <Tasks tasks={tasks} editTask={editTask} deleteTask={deleteTask} />}
          {tab === "material" && <Material materials={materials} materialId={materialId} materialName={materialName} setMaterialName={setMaterialName} materialCategory={materialCategory} setMaterialCategory={setMaterialCategory} materialUnit={materialUnit} setMaterialUnit={setMaterialUnit} materialStock={materialStock} setMaterialStock={setMaterialStock} materialMinStock={materialMinStock} setMaterialMinStock={setMaterialMinStock} materialImage={materialImage} setMaterialImage={setMaterialImage} materialNotes={materialNotes} setMaterialNotes={setMaterialNotes} upload={async (f: File) => setMaterialImage(await uploadImage(f, "materials"))} save={saveMaterial} edit={editMaterial} remove={async (r: any) => { await supabase.from("material_products").delete().eq("id", r.id); await loadMaterials(); }} />}
          {tab === "geraete" && <Devices equipment={equipment} employees={activeEmployees} deviceId={deviceId} deviceName={deviceName} setDeviceName={setDeviceName} deviceCategory={deviceCategory} setDeviceCategory={setDeviceCategory} deviceSerial={deviceSerial} setDeviceSerial={setDeviceSerial} deviceEmployee={deviceEmployee} setDeviceEmployee={setDeviceEmployee} deviceStatus={deviceStatus} setDeviceStatus={setDeviceStatus} deviceImage={deviceImage} setDeviceImage={setDeviceImage} deviceNotes={deviceNotes} setDeviceNotes={setDeviceNotes} upload={async (f: File) => setDeviceImage(await uploadImage(f, "equipment"))} save={saveDevice} edit={editDevice} remove={async (r: any) => { await supabase.from("equipment_items").delete().eq("id", r.id); await loadEquipment(); }} />}
          {tab === "schluessel" && <Keys keysList={keys} employees={activeEmployees} sites={activeSites} keyId={keyId} keyName={keyName} setKeyName={setKeyName} keyNumber={keyNumber} setKeyNumber={setKeyNumber} keyCustomer={keyCustomer} setKeyCustomer={setKeyCustomer} keyObject={keyObject} setKeyObject={setKeyObject} keyEmployee={keyEmployee} setKeyEmployee={setKeyEmployee} keyStatus={keyStatus} setKeyStatus={setKeyStatus} keyHandover={keyHandover} setKeyHandover={setKeyHandover} keyReturn={keyReturn} setKeyReturn={setKeyReturn} keyNotes={keyNotes} setKeyNotes={setKeyNotes} save={saveKey} edit={editKey} remove={async (r: any) => { await supabase.from("key_items").delete().eq("id", r.id); await loadKeys(); }} pdf={keyPdf} />}
          {tab === "chat" && <Chat employees={activeEmployees} employee={chatEmployee} setEmployee={(v: string) => { setChatEmployee(v); loadChat(v); }} messages={chatMessages} text={chatText} setText={setChatText} send={sendChat} />}
          {(["faktura", "hilfe", "einstellungen"] as Tab[]).includes(tab) && <Placeholder title={tab} />}
        </section>
      </div>
      {taskModal && <TaskModal close={() => setTaskModal(false)} taskId={taskId} mode={taskMode} setMode={setTaskMode} sites={activeSites} employees={activeEmployees} taskSite={taskSite} setTaskSite={setTaskSite} taskTitle={taskTitle} setTaskTitle={setTaskTitle} taskDate={taskDate} setTaskDate={setTaskDate} taskFrom={taskFrom} setTaskFrom={setTaskFrom} taskTo={taskTo} setTaskTo={setTaskTo} taskDuration={taskDuration} setTaskDuration={setTaskDuration} taskEmployee={taskEmployee} taskRepeatDays={taskRepeatDays} setTaskRepeatDays={setTaskRepeatDays} setTaskEmployee={setTaskEmployee} taskRepeatEnd={taskRepeatEnd} setTaskRepeatEnd={setTaskRepeatEnd} taskRepeatEvery={taskRepeatEvery} setTaskRepeatEvery={setTaskRepeatEvery} taskNotes={taskNotes} setTaskNotes={setTaskNotes} save={saveTask} />}
    </main>
  );
}


function NavGroup({ items, tab, setTab }: { items: [Tab, string, string, number][]; tab: Tab; setTab: (tab: Tab) => void }) {
  return (
    <div className="border-t border-white/10 pt-4">
      {items.map(([id, icon, label, badge]) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className={
            tab === id
              ? "mb-1 flex w-full items-center justify-between rounded-xl bg-blue-600 px-4 py-3 text-left font-bold text-white"
              : "mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-white/90 hover:bg-white/10"
          }
        >
          <span className="flex items-center gap-3"><span>{icon}</span>{label}</span>
          {badge > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{badge}</span>}
        </button>
      ))}
    </div>
  );
}



function ObjectNavGroup({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const objectTabs: [Tab, string][] = [["objekte", "Objekte"], ["kunden", "Kunden"], ["kontakte", "Kontakte"], ["auswertung", "Auswertung"]];
  const open = objectTabs.some(([id]) => id === tab);

  return (
    <div className="border-t border-white/10 pt-4">
      <button
        type="button"
        onClick={() => setTab("objekte")}
        className={open ? "mb-1 flex w-full items-center justify-between rounded-xl bg-white/15 px-4 py-3 text-left font-bold text-white" : "mb-1 flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-white/90 hover:bg-white/10"}
      >
        <span className="flex items-center gap-3"><span>🏢</span>Objekte</span>
        <span>⌃</span>
      </button>

      {open && (
        <div className="mb-2 ml-10 space-y-1 text-sm">
          {objectTabs.slice(1).map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={tab === id ? "block w-full rounded-lg bg-white/10 px-3 py-2 text-left font-bold text-white" : "block w-full rounded-lg px-3 py-2 text-left text-white/80 hover:bg-white/10"}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function Header({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-600">{icon}</div>
        <div>
          <p className="text-xs font-medium text-slate-400">CleanTrack Admin</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 capitalize">{title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}



function Button({ children, onClick, primary, className = "" }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? `rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-sm transition hover:bg-blue-700 ${className}`
          : `rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 ${className}`
      }
    >
      {children}
    </button>
  );
}



function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}



function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="border-b border-slate-200 px-4 py-3 text-left font-bold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}


function EmptyState({ text = "Noch keine Daten hinterlegt" }: { text?: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-slate-500">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-xl text-blue-600">×</div>
      <p className="text-lg font-medium text-slate-900">{text}</p>
      <p className="mt-2 text-sm">Erstellen Sie Daten, damit diese hier angezeigt werden.</p>
    </div>
  );
}


function FilterButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close() { setOpen(false); }
    function outside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("cleantrack-close-dropdowns", close);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("cleantrack-close-dropdowns", close);
      document.removeEventListener("mousedown", outside);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-500 shadow-sm transition hover:bg-slate-50">
        {label}⌄
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
          <p className="font-bold text-slate-800">{label}</p>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-blue-50">Alle anzeigen</button>
          <button type="button" onClick={() => setOpen(false)} className="mt-1 w-full rounded-lg bg-slate-50 px-3 py-2 text-left hover:bg-blue-50">Aktive auswählen</button>
          <p className="mt-3 text-xs text-slate-400">Die Auswahl schließt automatisch nach Klick außerhalb.</p>
        </div>
      )}
    </div>
  );
}


function Toolbar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className="field h-12 w-80 max-w-full" placeholder="🔍 Suchen" />
        <FilterButton label="Mitarbeitergruppen" />
        <FilterButton label="Objekte" />
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-400 shadow-sm transition hover:bg-slate-50">+ Filter hinzufügen</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}


function weekMinutesFor(employeeName: string, tasks: Row[], week: Date[]) {
  const days = new Set(week.map(iso));
  return tasks
    .filter((t: Row) => t.employee_name === employeeName && days.has(t.task_date))
    .reduce((sum: number, t: Row) => sum + Number(t.planned_minutes || t.max_minutes || 0), 0);
}

function employeeLimitMinutes(e: Row) {
  return Number(e.weekly_limit_minutes || e.weekly_minutes || e.weekly_hours * 60 || e.max_weekly_minutes || 0);
}


function EmployeeBars({ employee, planned }: { employee: Row; planned: number }) {
  const limit = employeeLimitMinutes(employee);
  const available = limit ? limit - planned : -planned;
  const plannedPct = limit ? Math.min(100, Math.round((planned / limit) * 100)) : Math.min(100, planned > 0 ? 100 : 0);
  const availablePct = limit ? Math.max(0, 100 - plannedPct) : 0;

  return (
    <div className="group relative mt-3 w-44">
      <div className="flex gap-1">
        <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.max(12, plannedPct * 1.2)}px` }} />
        <div className="h-1.5 rounded-full bg-red-400" style={{ width: `${Math.max(12, availablePct * 1.2)}px` }} />
      </div>
      <div className="pointer-events-none absolute left-0 top-4 z-30 hidden w-60 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl group-hover:block">
        <p className="font-bold text-slate-900">Stunden für diese Woche</p>
        <div className="mt-2 grid grid-cols-2 gap-1 text-slate-600">
          <span>Eingeplant</span><b className="text-right text-slate-900">{hours(planned)}h</b>
          <span>Limit</span><b className="text-right text-slate-900">{limit ? `${hours(limit)}h` : "00:00h"}</b>
          <span>Noch verfügbar</span><b className={available < 0 ? "text-right text-red-600" : "text-right text-slate-900"}>{available < 0 ? `-${hours(Math.abs(available))}h` : `${hours(available)}h`}</b>
        </div>
      </div>
    </div>
  );
}

function minutesOfDay(value?: string | null) {
  if (!value) return 0;
  const [h, m] = String(value).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function normalizedRange(task: Row) {
  const start = minutesOfDay(task.start_time);
  let end = minutesOfDay(task.end_time);
  if (end <= start) end += 1440;
  return { start, end };
}

function hasTaskOverlap(task: Row, dayTasks: Row[]) {
  const a = normalizedRange(task);
  return dayTasks.some((other) => {
    if (other.id === task.id) return false;
    const b = normalizedRange(other);
    return a.start < b.end && b.start < a.end;
  });
}



function Planner(p: any) {
  const weekTitle = `${p.week[0].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} → ${p.week[6].toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  return (
    <div>
      <Header icon="▦" title="Einsatzplaner">
        <Button onClick={p.setPrev} className="h-12 w-12 px-0">‹</Button>
        <Button onClick={p.setToday}>Heute</Button>
        <Button onClick={p.setNext} className="h-12 w-12 px-0">›</Button>
        <Button primary onClick={() => p.openTask()}>⊕ Einsatz erstellen</Button>
      </Header>

      <Toolbar>
        <Button className="min-w-40">📅 {weekTitle}</Button>
        <Button>Woche⌄</Button>
      </Toolbar>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid min-w-[1500px] grid-cols-[260px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50">
            <div className="flex items-center border-r border-slate-200 px-5 py-4 font-bold text-slate-600">Mitarbeiter</div>
            {p.week.map((d: Date) => (
              <button key={d.toISOString()} onClick={() => p.setSelectedDate(d)} className="border-r border-slate-200 px-4 py-3 text-center font-bold text-slate-600 transition last:border-r-0 hover:bg-blue-50">
                <p>{d.toLocaleDateString("de-DE", { weekday: "short" })}</p>
                <p className="text-sm">{d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</p>
              </button>
            ))}
          </div>

          {p.employees.map((e: Row) => {
            const planned = weekMinutesFor(e.name, p.tasks, p.week);
            return (
              <div key={e.id} className="grid min-w-[1500px] grid-cols-[260px_repeat(7,1fr)] border-b border-slate-200 last:border-b-0">
                <div className="flex min-h-36 items-center gap-3 border-r border-slate-200 bg-white p-5">
                  {e.avatar_url ? <img src={e.avatar_url} alt={e.name} className="h-12 w-12 rounded-full object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{initials(e.name)}</div>}
                  <div>
                    <p className="font-bold text-slate-950">{e.name}</p>
                    <EmployeeBars employee={e} planned={planned} />
                  </div>
                </div>

                {p.week.map((d: Date) => {
                  const date = iso(d);
                  const dayTasks = p.tasks
                    .filter((t: Row) => t.employee_name === e.name && t.task_date === date)
                    .sort((a: Row, b: Row) => minutesOfDay(a.start_time) - minutesOfDay(b.start_time));
                  return (
                    <div key={date} className="min-h-36 border-r border-slate-200 bg-white p-2 last:border-r-0 hover:bg-slate-50">
                      {dayTasks.map((t: Row) => {
                        const conflict = hasTaskOverlap(t, dayTasks);
                        return (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => p.editTask(t)}
                            className={`mb-2 w-full rounded-lg border bg-white p-3 text-left text-xs shadow-sm transition hover:shadow-md ${conflict ? "border-l-4 border-l-red-500" : "border-l-4 border-l-green-500"}`}
                          >
                            <div className="flex justify-between gap-2 text-slate-500">
                              <span>{t.start_time} → {t.end_time}</span>
                              <span className="flex gap-2 text-slate-400"><span>👤</span><span>↻</span></span>
                            </div>
                            <p className="mt-1 truncate font-bold text-slate-950">{t.site}</p>
                            <span className="mt-2 inline-block rounded bg-orange-100 px-2 py-1 text-[11px] font-medium text-orange-700">● {t.title}</span>
                            <p className="mt-1 text-[11px] text-slate-400">Planzeit: {hours(Number(t.planned_minutes || t.max_minutes || 0))} Std.</p>
                            {conflict && <p className="mt-1 text-[11px] font-bold text-red-600">Zeitüberschneidung</p>}
                          </button>
                        );
                      })}
                      <button onClick={() => p.openTask(d, e)} className="min-h-24 w-full rounded-lg border border-dashed border-blue-100 text-sm text-blue-200 transition hover:border-blue-300 hover:text-blue-500">+ Einsatz</button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}



function TaskModal(p: any) {
  const weekdays = [
    [1, "M"], [2, "D"], [3, "M"], [4, "D"], [5, "F"], [6, "S"], [7, "S"],
  ] as [number, string][];
  const toggleDay = (day: number) => {
    const days = p.taskRepeatDays || [];
    p.setTaskRepeatDays(days.includes(day) ? days.filter((x: number) => x !== day) : [...days, day].sort());
  };
  const duration = Math.max(0, Number(p.taskDuration || 0));
  const selectedSite = p.sites.find((s: Row) => s.id === p.taskSite);

  const form = (
    <>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => p.setMode("single")} className={p.mode === "single" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 font-bold text-blue-600" : "rounded-lg border bg-white px-4 py-2"}>Einmalig</button>
        <button type="button" onClick={() => p.setMode("repeat")} className={p.mode === "repeat" ? "rounded-lg border border-blue-400 bg-white px-4 py-2 font-bold text-blue-600" : "rounded-lg border bg-white px-4 py-2"}>Wiederholend</button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div><label className="mb-1 block text-sm font-bold text-slate-500">{p.mode === "repeat" ? "Startdatum*" : "Termin*"}</label><input type="date" value={p.taskDate} onChange={(e) => p.setTaskDate(e.target.value)} className="field" /></div>
        <div><label className="mb-1 block text-sm font-bold text-slate-500">Von*</label><input type="time" value={p.taskFrom} onChange={(e) => p.setTaskFrom(e.target.value)} className="field" /></div>
        <div><label className="mb-1 block text-sm font-bold text-slate-500">Bis*</label><input type="time" value={p.taskTo} onChange={(e) => p.setTaskTo(e.target.value)} className="field" /></div>
        <div><label className="mb-1 block text-sm font-bold text-slate-500">Dauer in Min.</label><input type="number" min="1" value={p.taskDuration} onChange={(e) => p.setTaskDuration(e.target.value)} className="field" placeholder="120" /></div>
      </div>

      <p className="mt-2 text-xs text-slate-400">Von/Bis ist der Einsatz-Zeitrahmen. Dauer ist die maximale geplante Arbeitszeit innerhalb dieses Rahmens.</p>

      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm text-slate-500">⊕ Fahrzeit hinzufügen</button>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm text-slate-500">⊕ Pausenzeit hinzufügen</button>
      </div>

      {p.mode === "repeat" && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-[140px_1fr]"><label className="text-sm font-bold text-slate-500">Wiederholen alle</label><div className="grid grid-cols-[80px_1fr] gap-3"><input type="number" min="1" value={p.taskRepeatEvery} onChange={(e) => p.setTaskRepeatEvery(e.target.value)} className="field" /><div className="field">Woche</div></div></div>
          <div><label className="mb-2 block text-sm font-bold text-slate-500">Wiederholen am</label><div className="flex flex-wrap gap-2">{weekdays.map(([day, label]) => <button type="button" key={`${day}-${label}`} onClick={() => toggleDay(day)} className={(p.taskRepeatDays || []).includes(day) ? "h-10 w-10 rounded-full border border-blue-500 bg-blue-100 font-bold text-blue-700" : "h-10 w-10 rounded-full border bg-white text-slate-500"}>{label}</button>)}</div></div>
          <div><label className="mb-1 block text-sm font-bold text-slate-500">Enddatum</label><input type="date" value={p.taskRepeatEnd} onChange={(e) => p.setTaskRepeatEnd(e.target.value)} className="field" /></div>
        </div>
      )}
      <div className="mt-5 border-t pt-4 text-right text-lg font-bold">Lohnzeit {hours(duration)} Std.</div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className={p.taskId ? "h-full w-full max-w-6xl overflow-y-auto bg-white shadow-xl" : "h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl"}>
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            {p.taskTitle && <p className="text-xs font-bold text-orange-500">{p.taskTitle}</p>}
            <h2 className="text-xl font-bold text-slate-950">{p.taskId ? selectedSite?.name || "Einsatz bearbeiten" : "Einsatz erstellen"}</h2>
          </div>
          <div className="flex items-center gap-3">
            {p.taskId && <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-700">Geplant</span>}
            <button onClick={p.close} className="text-2xl text-slate-400">×</button>
          </div>
        </div>

        {p.taskId ? (
          <div className="grid min-h-[calc(100vh-73px)] lg:grid-cols-[1.15fr_0.9fr]">
            <div className="border-r p-6">
              <div className="mb-5 flex gap-6 border-b">
                <button className="border-b-4 border-blue-600 pb-3 font-bold text-blue-600">Informationen</button>
                <button className="pb-3 font-medium text-slate-500">Dokumentation</button>
              </div>

              <label className="block text-sm font-bold text-slate-500">Objekt*</label>
              <select value={p.taskSite} onChange={(e) => p.setTaskSite(e.target.value)} className="field mb-4"><option value="">Objekt auswählen</option>{p.sites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <label className="block text-sm font-bold text-slate-500">Auftrag*</label>
              <input value={p.taskTitle} onChange={(e) => p.setTaskTitle(e.target.value)} className="field mb-4" placeholder="Auftrag" />

              <div className="rounded-2xl bg-slate-50 p-5">{form}</div>

              <label className="mt-4 block text-sm font-bold text-slate-500">Mitarbeiter</label>
              <select value={p.taskEmployee} onChange={(e) => p.setTaskEmployee(e.target.value)} className="field"><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select>
              <div className="mt-4"><label className="mb-1 block text-sm font-bold text-slate-500">Kommentar</label><textarea value={p.taskNotes} onChange={(e) => p.setTaskNotes(e.target.value)} className="field min-h-24" placeholder="Kommentar" /></div>
            </div>

            <div className="bg-slate-50 p-6">
              <div className="mb-5 flex gap-4 border-b">
                <button className="border-b-4 border-blue-600 pb-3 font-bold text-blue-600">Aktivitäten</button>
                <button className="pb-3 font-medium text-slate-500">Dateien</button>
                <button className="pb-3 font-medium text-slate-500">Angeheftet</button>
              </div>
              <div className="flex min-h-[52vh] items-end">
                <div className="w-full rounded-2xl border bg-white p-4 shadow-sm">
                  <p className="mb-4 text-sm text-slate-600"><b>System</b> hat erstellt: Einsatz</p>
                  <div className="mb-3 flex gap-4 border-b pb-3 text-sm">
                    <button className="font-bold text-blue-600">✉ Nachricht</button>
                    <button className="text-slate-500">🗒 Notiz</button>
                  </div>
                  <textarea className="w-full resize-none outline-none" placeholder="Versende eine Nachricht..." />
                  <div className="mt-3 flex justify-end gap-2"><Button onClick={p.close}>Abbrechen</Button><Button primary onClick={p.save}>Speichern</Button></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-500">Objekt*</label>
              <select value={p.taskSite} onChange={(e) => p.setTaskSite(e.target.value)} className="field"><option value="">Objekt auswählen</option>{p.sites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <label className="block text-sm font-bold text-slate-500">Auftrag*</label>
              <input value={p.taskTitle} onChange={(e) => p.setTaskTitle(e.target.value)} className="field" placeholder="Auftrag" />
              <div className="rounded-2xl bg-slate-50 p-5">{form}</div>
              <label className="block text-sm font-bold text-slate-500">Mitarbeiter</label>
              <select value={p.taskEmployee} onChange={(e) => p.setTaskEmployee(e.target.value)} className="field"><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select>
              <div><label className="mb-1 block text-sm font-bold text-slate-500">Kommentar</label><textarea value={p.taskNotes} onChange={(e) => p.setTaskNotes(e.target.value)} className="field min-h-24" placeholder="Kommentar" /></div>
            </div>
            <div className="sticky bottom-0 mt-8 flex justify-end gap-2 border-t bg-white py-4"><Button onClick={p.close}>Abbrechen</Button><Button primary onClick={p.save}>Erstellen</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}



function TimeApproval(p: any) {
  return (
    <div>
      <Header icon="⏱" title="Zeitenfreigabe"><Button>Exportieren</Button><Button>⚙</Button></Header>
      <Toolbar><Button>Spalten⌄</Button></Toolbar>
      <Table headers={["Datum", "Name", "Einsatz", "Fehler", "Soll-Zeit", "Abweichung", "Akzeptieren", "Ablehnen"]}>
        {p.entries.map((e: Row) => (
          <tr key={e.id}>
            <td className="px-4 py-3">{new Date(e.created_at).toLocaleDateString("de-DE")}</td>
            <td className="px-4 py-3 font-bold">{e.employee_name}</td>
            <td className="px-4 py-3">{e.work_site_name || "-"}</td>
            <td className="px-4 py-3"><span className="rounded bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">{e.status || "Prüfen"}</span></td>
            <td className="px-4 py-3">{hours(Number(e.planned_minutes || 0))} Std.</td>
            <td className="px-4 py-3">{Number(e.overtime_minutes || 0)} Min.</td>
            <td className="px-4 py-3"><button onClick={() => p.approve(e)} className="rounded-lg bg-green-100 px-3 py-2 font-bold text-green-700">Bestätigen</button></td>
            <td className="px-4 py-3"><button onClick={() => p.reject(e)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Ablehnen</button></td>
          </tr>
        ))}
      </Table>
      {p.entries.length === 0 && <Card className="mt-4"><EmptyState /></Card>}
    </div>
  );
}



function Absences(p: any) {
  return (
    <div>
      <Header icon="✈" title="Abwesenheiten"><Button primary onClick={p.createAbsence}>⊕ Abwesenheit erstellen</Button><Button>⚙</Button></Header>
      <Toolbar />
      <Card className="mb-6 p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <select value={p.absenceEmployee} onChange={(e) => p.setAbsenceEmployee(e.target.value)} className="field"><option value="">Mitarbeiter</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select>
          <select value={p.absenceType} onChange={(e) => p.setAbsenceType(e.target.value)} className="field"><option>Urlaub</option><option>Krankheit</option><option>Sonstiges</option></select>
          <input type="date" value={p.absenceStart} onChange={(e) => p.setAbsenceStart(e.target.value)} className="field" />
          <input type="date" value={p.absenceEnd} onChange={(e) => p.setAbsenceEnd(e.target.value)} className="field" />
          <input value={p.absenceReason} onChange={(e) => p.setAbsenceReason(e.target.value)} className="field" placeholder="Grund" />
        </div>
      </Card>
      <Table headers={["Mitarbeiter", "Art", "Von", "Bis", "Status", "Aktion"]}>
        {p.absences.map((a: Row) => <tr key={a.id}><td className="px-4 py-3 font-bold">{a.employee_name}</td><td className="px-4 py-3">{a.absence_type}</td><td className="px-4 py-3">{a.start_date}</td><td className="px-4 py-3">{a.end_date}</td><td className="px-4 py-3"><span className="rounded bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{a.status || "open"}</span></td><td className="px-4 py-3"><button onClick={() => p.decideAbsence(a, "approved")} className="mr-2 rounded-lg bg-green-100 px-3 py-2 text-green-700">Genehmigen</button><button onClick={() => p.decideAbsence(a, "rejected")} className="rounded-lg bg-red-100 px-3 py-2 text-red-700">Ablehnen</button></td></tr>)}
      </Table>
      {p.absences.length === 0 && <Card className="mt-4"><EmptyState /></Card>}
    </div>
  );
}


function Payroll(p: any) { return <div><Header icon="💰" title="Lohnabrechnung"><Button>Exportieren</Button></Header><Table headers={["Mitarbeiter", "Stunden", "Stundenlohn", "AG-Faktor", "Kosten"]}>{p.employees.map((e: Row) => { const min = p.entries.filter((x: Row) => x.employee_name === e.name).reduce((s: number, x: Row) => s + Number(x.worked_minutes || x.planned_minutes || 0), 0); const cost = (min / 60) * Number(e.hourly_rate || 0) * Number(e.employer_cost_factor || 1); return <tr key={e.id} className="border-b"><td className="p-3 font-bold">{e.name}</td><td className="p-3">{hours(min)} Std.</td><td className="p-3">{e.hourly_rate || 0} €</td><td className="p-3">{e.employer_cost_factor || 1}</td><td className="p-3 font-bold">{cost.toFixed(2)} €</td></tr>; })}</Table></div>; }

function minutesFromEntryRows(rows: Row[]) {
  const sorted = [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let total = 0;
  let lastStart: Date | null = null;
  for (const entry of sorted) {
    const action = String(entry.action || "");
    const time = new Date(entry.created_at);
    if (action === "start" || action === "break_end") lastStart = time;
    if ((action === "break_start" || action === "end") && lastStart) {
      total += Math.max(0, (time.getTime() - lastStart.getTime()) / 1000 / 60);
      lastStart = null;
    }
  }
  return Math.floor(total);
}

function currentMonthRange(base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start: iso(start), end: iso(end) };
}

function dateBetween(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  return value >= start && value <= end;
}

function employeeStats(employee: Row, entries: Row[], tasks: Row[], absences: Row[]) {
  const { start, end } = currentMonthRange();
  const employeeEntries = entries.filter((x: Row) => x.employee_name === employee.name && dateBetween(String(x.created_at || "").slice(0, 10), start, end));
  const worked = employeeEntries.some((x: Row) => x.worked_minutes) ? employeeEntries.reduce((sum: number, x: Row) => sum + Number(x.worked_minutes || 0), 0) : minutesFromEntryRows(employeeEntries);
  const planned = tasks.filter((x: Row) => x.employee_name === employee.name && dateBetween(x.task_date, start, end)).reduce((sum: number, x: Row) => sum + Number(x.planned_minutes || x.max_minutes || 0), 0);
  const overtime = Math.max(0, worked - planned);
  const vacation = absences.filter((x: Row) => x.employee_name === employee.name && String(x.absence_type || "").toLowerCase().includes("urlaub") && x.status === "approved").length;
  const sick = absences.filter((x: Row) => x.employee_name === employee.name && String(x.absence_type || "").toLowerCase().includes("krank") && x.status === "approved").length;
  const last = entries.filter((x: Row) => x.employee_name === employee.name).sort((a: Row, b: Row) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  return { worked, planned, overtime, vacation, sick, lastActive: last?.created_at || employee.last_active || null };
}

function minutesWorkedForEmployee(employeeName: string, entries: Row[]) {
  return entries
    .filter((entry: Row) => entry.employee_name === employeeName)
    .reduce((sum: number, entry: Row) => sum + Number(entry.worked_minutes || entry.planned_minutes || 0), 0);
}

function vacationDaysForEmployee(employeeName: string, absences: Row[]) {
  return absences
    .filter((a: Row) => a.employee_name === employeeName && a.absence_type === "Urlaub" && a.status === "approved")
    .reduce((sum: number, a: Row) => {
      const start = new Date(a.start_date);
      const end = new Date(a.end_date || a.start_date);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      return sum + days;
    }, 0);
}

function Employees(p: any) {
  return (
    <div>
      <Header icon="👥" title="Mitarbeiter"><Button>Exportieren</Button><Button primary>⊕ Mitarbeiter erstellen</Button></Header>
      <Toolbar><Button>Spalten⌄</Button></Toolbar>
      <Table headers={["Name", "Nummer", "Adresse", "Arbeitszeit", "Urlaub", "Kosten", "Zuletzt aktiv", "Status"]}>
        {p.employees.map((e: Row, i: number) => {
          const minutes = minutesWorkedForEmployee(e.name, p.entries || []);
          const hourly = Number(e.hourly_rate || 0);
          const factor = Number(e.employer_cost_factor || 1);
          const cost = (minutes / 60) * hourly * factor;
          const vacationUsed = vacationDaysForEmployee(e.name, p.absences || []);
          const vacationTotal = Number(e.vacation_days || e.annual_vacation_days || 0);

          return (
            <tr key={e.id}>
              <td className="px-4 py-3"><div className="flex items-center gap-3">{e.avatar_url ? <img src={e.avatar_url} alt={e.name} className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-bold text-white">{initials(e.name)}</span>}<b>{e.name}</b></div></td>
              <td className="px-4 py-3">{e.employee_number || i + 1}</td>
              <td className="px-4 py-3 whitespace-pre-line">{e.address || e.street || "-"}</td>
              <td className="px-4 py-3"><b>{hours(minutes)} Std.</b><p className="text-xs text-slate-400">Monat/geladen</p></td>
              <td className="px-4 py-3">{vacationUsed} / {vacationTotal || "-"} Tage</td>
              <td className="px-4 py-3 font-bold">{cost.toFixed(2)} €</td>
              <td className="px-4 py-3">{e.last_active ? String(e.last_active) : "-"}</td>
              <td className="px-4 py-3"><span className={e.active === false ? "rounded bg-slate-300 px-2 py-1 text-xs font-bold text-slate-700" : "rounded bg-green-500 px-2 py-1 text-xs font-bold text-white"}>{e.active === false ? "Passiv" : "Aktiv"}</span></td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}


function Objects(p: any) {
  const sorted = [...p.sites].sort((a: Row, b: Row) => String(a.name || "").localeCompare(String(b.name || "")));
  return (
    <div>
      <Header icon="🏢" title="Objekte"><Button>Exportieren</Button><Button primary onClick={p.saveSite}>⊕ Objekt erstellen</Button></Header>
      <div className="mb-4 flex gap-8 border-b border-slate-200 pl-3 text-sm">
        <button className="border-b-4 border-blue-600 pb-3 font-bold text-blue-600">Aktiv</button>
        <button className="pb-3 text-slate-500">Alle</button>
        <button className="pb-3 text-slate-500">Passiv</button>
      </div>
      <Toolbar><Button>Spalten⌄</Button></Toolbar>
      <Card className="mb-6 p-5">
        <p className="mb-4 text-slate-500">Objekt anlegen oder bearbeiten. Adresse eingeben, GPS automatisch berechnen, Notizen speichern.</p>
        <div className="grid gap-3 md:grid-cols-6">
          <input value={p.siteName} onChange={(e) => p.setSiteName(e.target.value)} className="field" placeholder="Objektname" />
          <input value={p.siteAddress} onChange={(e) => p.setSiteAddress(e.target.value)} className="field md:col-span-2" placeholder="Adresse" />
          <input value={p.siteRadius} onChange={(e) => p.setSiteRadius(e.target.value)} className="field" placeholder="Radius" />
          <input value={p.siteLat} onChange={(e) => p.setSiteLat(e.target.value)} className="field" placeholder="Breite" />
          <input value={p.siteLng} onChange={(e) => p.setSiteLng(e.target.value)} className="field" placeholder="Länge" />
          <textarea value={p.siteNotes} onChange={(e) => p.setSiteNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" />
          <button type="button" onClick={p.geo} disabled={p.geoLoading} className="rounded-xl bg-purple-100 px-4 py-3 font-bold text-purple-700 disabled:opacity-50">{p.geoLoading ? "Wird gesucht..." : "GPS ermitteln"}</button>
          <button type="button" onClick={p.saveSite} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">{p.siteId ? "Änderung speichern" : "Speichern"}</button>
        </div>
      </Card>
      <Table headers={["Name", "Nummer", "Rating", "Objektleiter", "Kunde", "Tags", "Status", "Aktion"]}>
        {sorted.map((s: Row, index: number) => (
          <tr key={s.id}>
            <td className="px-4 py-3"><p className="text-xs text-slate-400">{s.address || "Keine Adresse"}</p><b>{s.name}</b></td>
            <td className="px-4 py-3">{s.object_number || index + 1}</td>
            <td className="px-4 py-3">{s.rating || "-"}</td>
            <td className="px-4 py-3">{s.manager_name || "Stano, Matteo"}</td>
            <td className="px-4 py-3"><p className="text-xs text-slate-400">{s.customer_number || ""}</p>{s.customer_name || s.name}</td>
            <td className="px-4 py-3">{s.tags || "-"}</td>
            <td className="px-4 py-3"><span className={s.active === false ? "rounded bg-slate-300 px-2 py-1 text-xs font-bold text-slate-700" : "rounded bg-green-500 px-2 py-1 text-xs font-bold text-white"}>{s.active === false ? "Passiv" : "Aktiv"}</span></td>
            <td className="px-4 py-3"><button onClick={() => p.editSite(s)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => p.deactivate(s.id)} className="text-red-600">Deaktivieren</button></td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function Customers(p: any) {
  const rows = Object.values(
    p.sites.reduce((acc: Record<string, Row>, site: Row) => {
      const name = site.customer_name || site.name || "Ohne Kunde";
      if (!acc[name]) acc[name] = { name, count: 0, addresses: [] };
      acc[name].count += 1;
      if (site.address) acc[name].addresses.push(site.address);
      return acc;
    }, {})
  ) as Row[];

  return (
    <div>
      <Header icon="🏢" title="Kunden"><Button>Exportieren</Button><Button primary>⊕ Kunde erstellen</Button></Header>
      <Toolbar><Button>Spalten⌄</Button></Toolbar>
      <Table headers={["Kunde", "Nummer", "Objekte", "Adresse", "Status"]}>
        {rows.map((r: Row, index: number) => <tr key={r.name}><td className="px-4 py-3 font-bold">{r.name}</td><td className="px-4 py-3">{1000 + index}</td><td className="px-4 py-3">{r.count}</td><td className="px-4 py-3">{r.addresses[0] || "-"}</td><td className="px-4 py-3"><span className="rounded bg-green-500 px-2 py-1 text-xs font-bold text-white">Aktiv</span></td></tr>)}
      </Table>
    </div>
  );
}

function Contacts(p: any) {
  const rows = [
    ...p.employees.map((e: Row) => ({ name: e.name, type: "Mitarbeiter", phone: e.phone || "-", email: e.email || "-", company: "Intern" })),
    ...p.sites.map((s: Row) => ({ name: s.customer_name || s.name, type: "Kunde", phone: s.phone || "-", email: s.email || "-", company: s.name }))
  ];

  return (
    <div>
      <Header icon="☎" title="Kontakte"><Button>Exportieren</Button><Button primary>⊕ Kontakt erstellen</Button></Header>
      <Toolbar><Button>Spalten⌄</Button></Toolbar>
      <Table headers={["Name", "Typ", "Firma/Objekt", "Telefon", "E-Mail", "Status"]}>
        {rows.map((r: Row, index: number) => <tr key={`${r.type}-${r.name}-${index}`}><td className="px-4 py-3 font-bold">{r.name}</td><td className="px-4 py-3">{r.type}</td><td className="px-4 py-3">{r.company}</td><td className="px-4 py-3">{r.phone}</td><td className="px-4 py-3">{r.email}</td><td className="px-4 py-3"><span className="rounded bg-green-500 px-2 py-1 text-xs font-bold text-white">Aktiv</span></td></tr>)}
      </Table>
    </div>
  );
}

function ObjectAnalysis(p: any) {
  const monthStart = new Date(p.selectedDate.getFullYear(), p.selectedDate.getMonth(), 1);
  const monthEnd = new Date(p.selectedDate.getFullYear(), p.selectedDate.getMonth() + 1, 0);
  const startIso = iso(monthStart);
  const endIso = iso(monthEnd);
  const rows = p.sites.map((site: Row) => {
    const siteTasks = p.tasks.filter((t: Row) => (t.work_site_id === site.id || t.site === site.name) && t.task_date >= startIso && t.task_date <= endIso);
    const planned = siteTasks.reduce((sum: number, t: Row) => sum + Number(t.planned_minutes || t.max_minutes || 0), 0);
    const worked = p.entries.filter((e: Row) => e.work_site_name === site.name && String(e.created_at || "").slice(0, 10) >= startIso && String(e.created_at || "").slice(0, 10) <= endIso).reduce((sum: number, e: Row) => sum + Number(e.worked_minutes || 0), 0);
    return { site, planned, worked };
  });

  return (
    <div>
      <Header icon="◔" title="Auswertung"><Button>Exportieren</Button><Button>⚙</Button></Header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="field h-12 w-80 max-w-full" placeholder="🔍 Suchen" />
        <Button onClick={() => p.setSelectedDate(new Date(p.selectedDate.getFullYear(), p.selectedDate.getMonth() - 1, 1))}>‹</Button>
        <Button>📅 {monthStart.toLocaleDateString("de-DE")} → {monthEnd.toLocaleDateString("de-DE")}</Button>
        <Button onClick={() => p.setSelectedDate(new Date(p.selectedDate.getFullYear(), p.selectedDate.getMonth() + 1, 1))}>›</Button>
        <FilterButton label="Auftragsart" />
        <FilterButton label="Objekt Tags" />
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-400 shadow-sm">+ Filter hinzufügen</button>
      </div>
      <Table headers={["Name", "Soll-Zeit", "Lohnzeit", "Abweichung"]}>
        {rows.map((r: Row) => <tr key={r.site.id}><td className="px-4 py-3 font-bold">{r.site.name}</td><td className="px-4 py-3">{hours(r.planned)} Std.</td><td className="px-4 py-3">{hours(r.worked)} Std.</td><td className={r.worked > r.planned ? "px-4 py-3 font-bold text-red-600" : "px-4 py-3"}>{hours(Math.abs(r.worked - r.planned))} Std.</td></tr>)}
      </Table>
    </div>
  );
}

function Tasks(p: any) { return <div><Header icon="🧾" title="Aufgaben" /><Table headers={["Datum", "Zeitfenster", "Planzeit", "Objekt", "Mitarbeiter", "Auftrag", "Status", "Aktion"]}>{p.tasks.map((t: Row) => <tr key={t.id} className="border-b"><td className="p-3">{t.task_date}</td><td className="p-3">{t.start_time} - {t.end_time}</td><td className="p-3">{hours(Number(t.planned_minutes || t.max_minutes || 0))} Std.</td><td className="p-3">{t.site}</td><td className="p-3">{t.employee_name}</td><td className="p-3">{t.title}</td><td className="p-3">{t.done ? "Erledigt" : "Offen"}</td><td className="p-3"><button onClick={() => p.editTask(t)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => p.deleteTask(t)} className="text-red-600">Löschen</button></td></tr>)}</Table></div>; }
function Material(p: any) { return <div><Header icon="📦" title="Materialwesen"><Button primary onClick={p.save}>⊕ Produkt speichern</Button></Header><Card className="mb-6 p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.materialName} onChange={(e) => p.setMaterialName(e.target.value)} className="field" placeholder="Produktname" /><input value={p.materialCategory} onChange={(e) => p.setMaterialCategory(e.target.value)} className="field" placeholder="Kategorie" /><input value={p.materialUnit} onChange={(e) => p.setMaterialUnit(e.target.value)} className="field" placeholder="Einheit" /><input type="number" value={p.materialStock} onChange={(e) => p.setMaterialStock(e.target.value)} className="field" placeholder="Bestand" /><input type="number" value={p.materialMinStock} onChange={(e) => p.setMaterialMinStock(e.target.value)} className="field" placeholder="Mindestbestand" /><input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => p.upload(e.target.files?.[0] || null)} className="field" /><textarea value={p.materialNotes} onChange={(e) => p.setMaterialNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div>{p.materialImage && <img src={p.materialImage} alt="Material" className="mt-4 h-24 w-24 rounded-xl object-cover" />}</Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{p.materials.map((m: Row) => <Card key={m.id} className="p-4"><div className="mb-3 h-40 overflow-hidden rounded-xl bg-slate-100">{m.image_url ? <img src={m.image_url} alt={m.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">📦</div>}</div><p className="font-bold">{m.name}</p><p className="text-sm text-slate-500">{m.category || "Ohne Kategorie"}</p><p className="mt-2 text-sm">Bestand: <b>{m.current_stock || 0}</b> {m.unit || "Stück"}</p><div className="mt-4 flex gap-2"><button onClick={() => p.edit(m)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button><button onClick={() => p.remove(m)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Löschen</button></div></Card>)}</div></div>; }
function Devices(p: any) { return <div><Header icon="🔧" title="Geräte"><Button primary onClick={p.save}>⊕ Gerät speichern</Button></Header><Card className="mb-6 p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.deviceName} onChange={(e) => p.setDeviceName(e.target.value)} className="field" placeholder="Gerätename" /><input value={p.deviceCategory} onChange={(e) => p.setDeviceCategory(e.target.value)} className="field" placeholder="Kategorie" /><input value={p.deviceSerial} onChange={(e) => p.setDeviceSerial(e.target.value)} className="field" placeholder="Seriennummer" /><select value={p.deviceEmployee} onChange={(e) => p.setDeviceEmployee(e.target.value)} className="field"><option value="">Zugewiesen an</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><select value={p.deviceStatus} onChange={(e) => p.setDeviceStatus(e.target.value)} className="field"><option>Aktiv</option><option>Wartung</option><option>Defekt</option><option>Archiv</option></select><input type="file" accept="image/*" onChange={(e: ChangeEvent<HTMLInputElement>) => p.upload(e.target.files?.[0] || null)} className="field" /><textarea value={p.deviceNotes} onChange={(e) => p.setDeviceNotes(e.target.value)} className="field min-h-20 md:col-span-4" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div>{p.deviceImage && <img src={p.deviceImage} alt="Gerät" className="mt-4 h-24 w-24 rounded-xl object-cover" />}</Card><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{p.equipment.map((d: Row) => <Card key={d.id} className="p-4"><div className="mb-3 h-36 overflow-hidden rounded-xl bg-slate-100">{d.image_url ? <img src={d.image_url} alt={d.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">🔧</div>}</div><p className="font-bold">{d.name}</p><p className="text-sm text-slate-500">{d.category || "Ohne Kategorie"}</p><p className="text-sm">Seriennr.: {d.serial_number || "-"}</p><p className="text-sm">Zuweisung: {d.assigned_to || "-"}</p><div className="mt-4 flex gap-2"><button onClick={() => p.edit(d)} className="rounded-lg bg-blue-100 px-3 py-2 font-bold text-blue-700">Bearbeiten</button><button onClick={() => p.remove(d)} className="rounded-lg bg-red-100 px-3 py-2 font-bold text-red-700">Löschen</button></div></Card>)}</div></div>; }
function Keys(p: any) { return <div><Header icon="🔑" title="Schlüssel"><Button onClick={() => p.pdf()}>PDF Übergabe</Button><Button primary onClick={p.save}>⊕ Schlüssel speichern</Button></Header><Card className="mb-6 p-5"><div className="grid gap-3 md:grid-cols-6"><input value={p.keyName} onChange={(e) => p.setKeyName(e.target.value)} className="field" placeholder="Schlüsselbezeichnung" /><input value={p.keyNumber} onChange={(e) => p.setKeyNumber(e.target.value)} className="field" placeholder="Schlüsselnummer" /><input value={p.keyCustomer} onChange={(e) => p.setKeyCustomer(e.target.value)} className="field" placeholder="Kunde" /><select value={p.keyObject} onChange={(e) => p.setKeyObject(e.target.value)} className="field"><option value="">Objekt</option>{p.sites.map((s: Row) => <option key={s.id} value={s.name}>{s.name}</option>)}</select><select value={p.keyEmployee} onChange={(e) => p.setKeyEmployee(e.target.value)} className="field"><option value="">Ausgegeben an</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</select><select value={p.keyStatus} onChange={(e) => p.setKeyStatus(e.target.value)} className="field"><option>Ausgegeben</option><option>Zurückgegeben</option><option>Verloren</option><option>Archiv</option></select><input type="date" value={p.keyHandover} onChange={(e) => p.setKeyHandover(e.target.value)} className="field" /><input type="date" value={p.keyReturn} onChange={(e) => p.setKeyReturn(e.target.value)} className="field" /><textarea value={p.keyNotes} onChange={(e) => p.setKeyNotes(e.target.value)} className="field min-h-20 md:col-span-2" placeholder="Notizen" /><button onClick={p.save} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Speichern</button></div></Card><Table headers={["Schlüssel", "Nummer", "Kunde", "Objekt", "Ausgegeben an", "Status", "PDF", "Aktion"]}>{p.keysList.map((k: Row) => <tr key={k.id} className="border-b"><td className="p-3 font-bold">{k.key_name}</td><td className="p-3">{k.key_number || "-"}</td><td className="p-3">{k.customer_name || "-"}</td><td className="p-3">{k.object_name || "-"}</td><td className="p-3">{k.employee_name || "-"}</td><td className="p-3">{k.status}</td><td className="p-3"><button onClick={() => p.pdf(k)} className="rounded-lg bg-purple-100 px-3 py-2 font-bold text-purple-700">PDF</button></td><td className="p-3"><button onClick={() => p.edit(k)} className="mr-2 text-blue-600">Bearbeiten</button><button onClick={() => p.remove(k)} className="text-red-600">Löschen</button></td></tr>)}</Table></div>; }
function Chat(p: any) { return <div><Header icon="💬" title="Chat" /><div className="grid gap-5 lg:grid-cols-[280px_1fr]"><Card className="bg-slate-100 p-4"><h2 className="mb-3 font-bold">Mitarbeiter</h2>{p.employees.map((e: Row) => <button key={e.id} onClick={() => p.setEmployee(e.name)} className={p.employee === e.name ? "mb-2 w-full rounded-xl bg-blue-600 p-3 text-left font-bold text-white" : "mb-2 w-full rounded-xl bg-white p-3 text-left"}>{e.name}</button>)}</Card><Card className="p-5"><h2 className="mb-4 font-bold">{p.employee ? `Chat mit ${p.employee}` : "Bitte Mitarbeiter auswählen"}</h2><div className="mb-4 h-[55vh] overflow-y-auto rounded-xl bg-slate-50 p-4">{p.messages.length === 0 && <p className="text-center text-slate-400">Noch keine Nachrichten vorhanden.</p>}{p.messages.map((m: Row) => <div key={m.id} className={m.sender_role === "admin" ? "mb-3 ml-16 rounded-xl bg-blue-100 p-3" : "mb-3 mr-16 rounded-xl bg-white p-3"}><p className="text-sm font-bold">{m.sender_role === "admin" ? "Ich" : m.sender_name || m.employee_name}</p><p>{m.message}</p></div>)}</div><div className="flex gap-2"><input value={p.text} onChange={(e) => p.setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") p.send(); }} className="field" placeholder="Nachricht schreiben..." /><button onClick={p.send} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Senden</button></div></Card></div></div>; }
function Placeholder({ title }: { title: string }) { return <Card className="p-10 text-center"><h1 className="text-2xl font-bold capitalize">{title}</h1><p className="mt-2 text-slate-500">Dieser Bereich ist vorbereitet.</p></Card>; }
