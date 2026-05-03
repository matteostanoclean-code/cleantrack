"use client";

import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type Tab =
  | "dashboard"
  | "planung"
  | "mitarbeiter"
  | "kunden"
  | "kontakte"
  | "objekte"
  | "aufgaben"
  | "material"
  | "geraete"
  | "schluessel"
  | "zeiten"
  | "abwesenheiten"
  | "chat";

type Row = Record<string, any>;
type ModalType = "employeeInvite" | "employeeEdit" | "customer" | "contact" | "site" | "task" | "material" | "device" | "key" | "absence" | null;

const today = new Date().toISOString().slice(0, 10);

const emptyEmployeeInvite = { name: "", email: "", phone: "" };
const emptyEmployeeEdit = { id: "", name: "", email: "", phone: "", employee_number: "", address: "", hourly_rate: "0", vacation_days: "0", active: true };
const emptyCustomer = { id: "", name: "", customer_number: "", address: "", phone: "", email: "", notes: "" };
const emptyContact = { id: "", name: "", company: "", phone: "", email: "", role: "", notes: "" };
const emptySite = { id: "", name: "", address: "", allowed_radius_m: "50", latitude: "", longitude: "", notes: "", active: true };
const emptyTask = { id: "", title: "Unterhaltsreinigung", task_date: today, start_time: "08:00", end_time: "10:00", planned_minutes: "120", site: "", work_site_id: "", employee_name: "", priority: "Normal", notes: "", done: false };
const emptyMaterial = { id: "", name: "", category: "", unit: "Stück", current_stock: "0", min_stock: "0", supplier: "", image_url: "", notes: "" };
const emptyDevice = { id: "", name: "", category: "", serial_number: "", assigned_to: "", status: "Aktiv", image_url: "", notes: "" };
const emptyKey = { id: "", key_name: "", key_number: "", customer_name: "", object_name: "", employee_name: "", status: "Ausgegeben", handover_date: today, return_date: "", notes: "" };
const emptyAbsence = { id: "", employee_name: "", absence_type: "Urlaub", start_date: today, end_date: today, reason: "", status: "open" };

function euro(value: unknown) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CT";
}

function minutes(start?: string, end?: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let a = (sh || 0) * 60 + (sm || 0);
  let b = (eh || 0) * 60 + (em || 0);
  if (b < a) b += 1440;
  return Math.max(0, b - a);
}

function prettyHours(value: unknown) {
  const total = Number(value || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function dateText(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("de-DE");
}

function numberOrFallback(value: unknown, fallback: number) {
  const text = String(value ?? "").trim().replace(",", ".");
  if (!text) return fallback;
  const num = Number(text);
  return Number.isFinite(num) ? num : fallback;
}


function downloadCsv(filename: string, rows: Row[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [modal, setModal] = useState<ModalType>(null);
  const [search, setSearch] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [whatsappLink, setWhatsappLink] = useState("");

  const [employees, setEmployees] = useState<Row[]>([]);
  const [sites, setSites] = useState<Row[]>([]);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [entries, setEntries] = useState<Row[]>([]);
  const [absences, setAbsences] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [devices, setDevices] = useState<Row[]>([]);
  const [keys, setKeys] = useState<Row[]>([]);
  const [contacts, setContacts] = useState<Row[]>([]);
  const [chatMessages, setChatMessages] = useState<Row[]>([]);

  const [employeeInvite, setEmployeeInvite] = useState(emptyEmployeeInvite);
  const [employeeEdit, setEmployeeEdit] = useState(emptyEmployeeEdit);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [siteForm, setSiteForm] = useState(emptySite);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [keyForm, setKeyForm] = useState(emptyKey);
  const [absenceForm, setAbsenceForm] = useState(emptyAbsence);
  const [chatEmployee, setChatEmployee] = useState("");
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (allowed) loadAll();
  }, [allowed]);

  useEffect(() => {
    if (taskForm.start_time && taskForm.end_time && !taskForm.id) {
      setTaskForm((old) => ({ ...old, planned_minutes: String(minutes(old.start_time, old.end_time) || old.planned_minutes) }));
    }
  }, [taskForm.start_time, taskForm.end_time, taskForm.id]);

  async function adminCall(body: Row) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Admin-Aktion fehlgeschlagen.");
    return json;
  }

  async function checkAdmin() {
    setLoading(true);
    try {
      await adminCall({ action: "ping" });
      setAllowed(true);
    } catch (error) {
      setAllowed(false);
      setMessage(error instanceof Error ? error.message : "Kein Zugriff.");
    } finally {
      setLoading(false);
    }
  }

  async function selectTable(table: string, orderBy = "created_at", ascending = false, limit?: number) {
    try {
      const json = await adminCall({ action: "select", table, orderBy, ascending, limit });
      return json.data || [];
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Daten konnten nicht geladen werden: ${table}`);
      return [];
    }
  }

  async function loadAll() {
    const [employeeRows, siteRows, taskRows, entryRows, absenceRows, materialRows, deviceRows, keyRows, contactRows] = await Promise.all([
      selectTable("employee_profiles", "name", true),
      selectTable("work_sites", "name", true),
      selectTable("tasks", "task_date", false),
      selectTable("time_entries", "created_at", false, 800),
      selectTable("absence_requests", "start_date", false),
      selectTable("material_products", "name", true),
      selectTable("equipment_items", "name", true),
      selectTable("key_items", "key_name", true),
      selectTable("customer_contacts", "name", true),
    ]);
    setEmployees(employeeRows);
    setSites(siteRows);
    setTasks(taskRows);
    setEntries(entryRows);
    setAbsences(absenceRows);
    setMaterials(materialRows);
    setDevices(deviceRows);
    setKeys(keyRows);
    setContacts(contactRows);
  }

  const activeEmployees = employees.filter((item) => item.role !== "admin" && item.active !== false);
  const customers = useMemo(() => customerRowsFromSites(sites), [sites]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return {
      employees: filterRows(employees, q),
      sites: filterRows(sites, q),
      customers: filterRows(customers, q),
      contacts: filterRows(contacts, q),
      tasks: filterRows(tasks, q),
      materials: filterRows(materials, q),
      devices: filterRows(devices, q),
      keys: filterRows(keys, q),
      entries: filterRows(entries, q),
      absences: filterRows(absences, q),
    };
  }, [search, employees, sites, customers, contacts, tasks, materials, devices, keys, entries, absences]);

  async function insertOrUpdate(table: string, id: string, payload: Row) {
    setSaving(true);
    setMessage("");
    try {
      if (id) {
        await adminCall({ action: "update", table, id, payload });
      } else {
        await adminCall({ action: "insert", table, payload: [payload] });
      }
      setModal(null);
      setMessage("Gespeichert.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(table: string, id: string, label: string) {
    if (!window.confirm(`${label} wirklich löschen?`)) return;
    setSaving(true);
    setMessage("");
    try {
      await adminCall({ action: "delete", table, id });
      setMessage("Gelöscht.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  async function createEmployeeInvite() {
    if (!employeeInvite.name.trim() || !employeeInvite.email.trim()) {
      setMessage("Bitte Name und E-Mail eintragen.");
      return;
    }

    setSaving(true);
    setMessage("");
    setInviteLink("");
    setWhatsappLink("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

      const response = await fetch("/api/admin/create-employee-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(employeeInvite),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Einladung konnte nicht erstellt werden.");
      setInviteLink(json.inviteLink || "");
      setWhatsappLink(json.whatsappLink || "");
      setMessage("Einladung erstellt. Der Mitarbeiter steht jetzt als Passiv in der Liste und kann den Link aktivieren.");
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Einladung fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  function openEmployee(row?: Row) {
    setInviteLink("");
    setWhatsappLink("");
    if (!row) {
      setEmployeeInvite(emptyEmployeeInvite);
      setModal("employeeInvite");
      return;
    }
    setEmployeeEdit({
      id: String(row.id || ""),
      name: String(row.name || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      employee_number: String(row.employee_number || ""),
      address: String(row.address || row.street || ""),
      hourly_rate: String(row.hourly_rate ?? "0"),
      vacation_days: String(row.vacation_days ?? row.annual_vacation_days ?? "0"),
      active: row.active !== false,
    });
    setModal("employeeEdit");
  }

  async function saveEmployee() {
    await updateEmployeeProfile({
      id: employeeEdit.id,
      name: employeeEdit.name,
      email: employeeEdit.email || null,
      phone: employeeEdit.phone || null,
      employee_number: employeeEdit.employee_number || null,
      address: employeeEdit.address || null,
      hourly_rate: Number(employeeEdit.hourly_rate || 0),
      vacation_days: Number(employeeEdit.vacation_days || 0),
      active: employeeEdit.active,
    }, "Mitarbeiter gespeichert.");
  }

  async function updateEmployeeProfile(payload: Row, successText = "Mitarbeiter aktualisiert.") {
    setSaving(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Bitte neu einloggen. Die Sitzung fehlt.");

      const response = await fetch("/api/admin/update-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Mitarbeiter konnte nicht gespeichert werden.");

      if (json.employee?.id) {
        setEmployees((old) => old.map((item) => item.id === json.employee.id ? { ...item, ...json.employee } : item));
      }
      setModal(null);
      setMessage(successText);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mitarbeiter konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function setEmployeeActive(row: Row, active: boolean) {
    await updateEmployeeProfile({ id: row.id, name: row.name, active }, active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
  }

  function openCustomer(row?: Row) {
    setCustomerForm(row ? {
      id: String(row.id || ""),
      name: String(row.customer_name || row.name || ""),
      customer_number: String(row.customer_number || ""),
      address: String(row.customer_address || row.address || ""),
      phone: String(row.customer_phone || row.phone || ""),
      email: String(row.customer_email || row.email || ""),
      notes: String(row.customer_notes || row.notes || ""),
    } : emptyCustomer);
    setModal("customer");
  }

  async function saveCustomer() {
    await insertOrUpdate("work_sites", customerForm.id, {
      name: customerForm.name,
      customer_name: customerForm.name,
      customer_number: customerForm.customer_number || null,
      address: customerForm.address || null,
      customer_address: customerForm.address || null,
      customer_phone: customerForm.phone || null,
      customer_email: customerForm.email || null,
      customer_notes: customerForm.notes || null,
      allowed_radius_m: 50,
      latitude: 0,
      longitude: 0,
      active: true,
    });
  }

  function openContact(row?: Row) {
    setContactForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      company: String(row.company || ""),
      phone: String(row.phone || ""),
      email: String(row.email || ""),
      role: String(row.role || row.contact_role || ""),
      notes: String(row.notes || ""),
    } : emptyContact);
    setModal("contact");
  }

  async function saveContact() {
    await insertOrUpdate("customer_contacts", contactForm.id, {
      name: contactForm.name,
      company: contactForm.company || null,
      phone: contactForm.phone || null,
      email: contactForm.email || null,
      role: contactForm.role || null,
      contact_role: contactForm.role || null,
      notes: contactForm.notes || null,
      active: true,
    });
  }

  function openSite(row?: Row) {
    setSiteForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      address: String(row.address || ""),
      allowed_radius_m: String(row.allowed_radius_m ?? "50"),
      latitude: String(row.latitude ?? ""),
      longitude: String(row.longitude ?? ""),
      notes: String(row.notes || ""),
      active: row.active !== false,
    } : emptySite);
    setModal("site");
  }

  async function saveSite() {
    await insertOrUpdate("work_sites", siteForm.id, {
      name: siteForm.name,
      address: siteForm.address,
      allowed_radius_m: numberOrFallback(siteForm.allowed_radius_m, 50),
      latitude: numberOrFallback(siteForm.latitude, 0),
      longitude: numberOrFallback(siteForm.longitude, 0),
      notes: siteForm.notes || null,
      active: siteForm.active,
    });
  }

  function openTask(row?: Row) {
    setTaskForm(row ? {
      id: String(row.id || ""),
      title: String(row.title || "Unterhaltsreinigung"),
      task_date: String(row.task_date || today),
      start_time: String(row.start_time || "08:00"),
      end_time: String(row.end_time || "10:00"),
      planned_minutes: String(row.planned_minutes || row.max_minutes || minutes(row.start_time, row.end_time) || "120"),
      site: String(row.site || ""),
      work_site_id: String(row.work_site_id || ""),
      employee_name: String(row.employee_name || ""),
      priority: String(row.priority || "Normal"),
      notes: String(row.notes || ""),
      done: Boolean(row.done),
    } : emptyTask);
    setModal("task");
  }

  async function saveTask() {
    const site = sites.find((item) => item.id === taskForm.work_site_id);
    await insertOrUpdate("tasks", taskForm.id, {
      title: taskForm.title,
      task_date: taskForm.task_date,
      start_time: taskForm.start_time,
      end_time: taskForm.end_time,
      planned_minutes: Number(taskForm.planned_minutes || 0),
      max_minutes: Number(taskForm.planned_minutes || 0),
      employee_name: taskForm.employee_name,
      site: site?.name || taskForm.site,
      work_site_id: taskForm.work_site_id || null,
      priority: taskForm.priority,
      notes: taskForm.notes || null,
      done: taskForm.done,
    });
  }

  function openMaterial(row?: Row) {
    setMaterialForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      category: String(row.category || ""),
      unit: String(row.unit || "Stück"),
      current_stock: String(row.current_stock ?? "0"),
      min_stock: String(row.min_stock ?? "0"),
      supplier: String(row.supplier || ""),
      image_url: String(row.image_url || ""),
      notes: String(row.notes || ""),
    } : emptyMaterial);
    setModal("material");
  }

  async function saveMaterial() {
    await insertOrUpdate("material_products", materialForm.id, {
      name: materialForm.name,
      category: materialForm.category || null,
      unit: materialForm.unit || "Stück",
      current_stock: Number(materialForm.current_stock || 0),
      min_stock: Number(materialForm.min_stock || 0),
      supplier: materialForm.supplier || null,
      image_url: materialForm.image_url || null,
      notes: materialForm.notes || null,
    });
  }

  function openDevice(row?: Row) {
    setDeviceForm(row ? {
      id: String(row.id || ""),
      name: String(row.name || ""),
      category: String(row.category || ""),
      serial_number: String(row.serial_number || ""),
      assigned_to: String(row.assigned_to || ""),
      status: String(row.status || "Aktiv"),
      image_url: String(row.image_url || ""),
      notes: String(row.notes || ""),
    } : emptyDevice);
    setModal("device");
  }

  async function saveDevice() {
    await insertOrUpdate("equipment_items", deviceForm.id, {
      name: deviceForm.name,
      category: deviceForm.category || null,
      serial_number: deviceForm.serial_number || null,
      assigned_to: deviceForm.assigned_to || null,
      status: deviceForm.status,
      image_url: deviceForm.image_url || null,
      notes: deviceForm.notes || null,
    });
  }

  function openKey(row?: Row) {
    setKeyForm(row ? {
      id: String(row.id || ""),
      key_name: String(row.key_name || ""),
      key_number: String(row.key_number || ""),
      customer_name: String(row.customer_name || ""),
      object_name: String(row.object_name || ""),
      employee_name: String(row.employee_name || ""),
      status: String(row.status || "Ausgegeben"),
      handover_date: String(row.handover_date || today),
      return_date: String(row.return_date || ""),
      notes: String(row.notes || ""),
    } : emptyKey);
    setModal("key");
  }

  async function saveKey() {
    await insertOrUpdate("key_items", keyForm.id, {
      key_name: keyForm.key_name,
      key_number: keyForm.key_number || null,
      customer_name: keyForm.customer_name || null,
      object_name: keyForm.object_name || null,
      employee_name: keyForm.employee_name || null,
      status: keyForm.status,
      handover_date: keyForm.handover_date || null,
      return_date: keyForm.return_date || null,
      notes: keyForm.notes || null,
    });
  }

  function createKeyPdf(row: Row) {
    downloadPdf("CleanTrack - Schlüsselübergabe", [
      `Schlüssel: ${row.key_name || "-"}`,
      `Schlüsselnummer: ${row.key_number || "-"}`,
      `Kunde: ${row.customer_name || "-"}`,
      `Objekt: ${row.object_name || "-"}`,
      `Ausgegeben an: ${row.employee_name || "-"}`,
      `Status: ${row.status || "-"}`,
      `Ausgabe: ${row.handover_date || "-"}`,
      `Rückgabe: ${row.return_date || "-"}`,
      "",
      "Unterschrift Mitarbeiter: ___________________________",
      "Unterschrift Kunde: ________________________________",
    ], `schluessel-${row.key_name || "uebergabe"}.pdf`);
  }

  function openAbsence(row?: Row) {
    setAbsenceForm(row ? {
      id: String(row.id || ""),
      employee_name: String(row.employee_name || ""),
      absence_type: String(row.absence_type || "Urlaub"),
      start_date: String(row.start_date || today),
      end_date: String(row.end_date || today),
      reason: String(row.reason || ""),
      status: String(row.status || "open"),
    } : emptyAbsence);
    setModal("absence");
  }

  async function saveAbsence() {
    await insertOrUpdate("absence_requests", absenceForm.id, {
      employee_name: absenceForm.employee_name,
      absence_type: absenceForm.absence_type,
      start_date: absenceForm.start_date,
      end_date: absenceForm.end_date,
      reason: absenceForm.reason || null,
      status: absenceForm.status,
    });
  }

  async function approveEntry(row: Row, approved: boolean) {
    await insertOrUpdate("time_entries", row.id, { approved, status: approved ? "approved" : "rejected" });
  }

  async function sendChat() {
    if (!chatEmployee || !chatText.trim()) {
      setMessage("Bitte Mitarbeiter und Nachricht auswählen.");
      return;
    }
    await insertOrUpdate("chat_messages", "", {
      employee_name: chatEmployee,
      sender_role: "admin",
      sender_name: "Admin",
      message: chatText.trim(),
      read_by_admin: true,
      read_by_employee: false,
    });
    setChatText("");
    await loadChat(chatEmployee);
  }

  async function loadChat(employeeName: string) {
    setChatEmployee(employeeName);
    try {
      const json = await adminCall({ action: "select", table: "chat_messages", orderBy: "created_at", ascending: true, filters: { employee_name: employeeName } });
      setChatMessages(json.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Chat konnte nicht geladen werden.");
    }
  }

  const workedMinutes = entries.reduce((sum, item) => sum + Number(item.worked_minutes || item.planned_minutes || 0), 0);
  const openTasks = tasks.filter((item) => !item.done).length;
  const openAbsences = absences.filter((item) => !item.status || item.status === "open").length;
  const lowStock = materials.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0)).length;
  const currentNav = navItems.find((item) => item.id === tab) || navItems[0];
  const createButtonLabel = getCreateButtonLabel(tab);

  function runPrimaryAction() {
    if (tab === "mitarbeiter") return openEmployee();
    if (tab === "kunden") return openCustomer();
    if (tab === "kontakte") return openContact();
    if (tab === "objekte") return openSite();
    if (tab === "planung" || tab === "aufgaben") return openTask();
    if (tab === "material") return openMaterial();
    if (tab === "geraete") return openDevice();
    if (tab === "schluessel") return openKey();
    if (tab === "abwesenheiten") return openAbsence();
    if (tab === "chat") {
      setMessage("Wähle links im Chat zuerst einen Mitarbeiter aus und schreibe dann deine Nachricht.");
      return;
    }
    return openTask();
  }

  if (loading) return <main className="min-h-screen bg-slate-50 p-8 font-bold text-slate-700">Lade Adminbereich...</main>;
  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black text-slate-950">Kein Zugriff</h1>
          <p className="mt-2 text-slate-500">Dieser Bereich ist nur für Administratoren sichtbar.</p>
          {message && <p className="mt-4 rounded-2xl bg-red-50 p-4 font-bold text-red-700">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-72 flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-sm lg:flex">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src="/logo.png" alt="CleanTrack" className="h-12 w-12 rounded-2xl object-contain ring-1 ring-slate-200" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">CleanTrack</p>
            <h1 className="truncate text-lg font-black text-slate-950">Verwaltung</h1>
            <p className="truncate text-xs font-semibold text-slate-400">Matteo Stano Clean</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                tab === item.id
                  ? "flex w-full items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-left text-sm font-black text-white shadow-sm"
                  : "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }
            >
              <span className={tab === item.id ? "flex h-8 w-8 items-center justify-center rounded-xl bg-white/20" : "flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100"}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-5 rounded-3xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-bold text-slate-300">Heute</p>
          <p className="mt-1 text-2xl font-black">{openTasks}</p>
          <p className="text-xs font-semibold text-slate-300">offene Aufgaben</p>
          <button type="button" onClick={() => setTab("aufgaben")} className="mt-4 w-full rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-950 hover:bg-blue-50">
            Aufgaben öffnen
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="CleanTrack" className="h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200" />
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">Admin</p>
                <h1 className="font-black text-slate-950">{currentNav.label}</h1>
              </div>
            </div>
            <button type="button" onClick={runPrimaryAction} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-blue-700">
              {createButtonLabel}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} className={tab === item.id ? "shrink-0 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-black text-white" : "shrink-0 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600"}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        <header className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white/95 px-8 py-5 shadow-sm backdrop-blur lg:block">
          <div className="flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-sm font-black text-blue-600">
                <span>{currentNav.icon}</span>
                <span>Adminbereich</span>
              </div>
              <h2 className="truncate text-3xl font-black tracking-tight text-slate-950">{currentNav.label}</h2>
            </div>
            <div className="flex items-center gap-3">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-80 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500" placeholder="Suchen..." />
              <button type="button" onClick={loadAll} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">
                Aktualisieren
              </button>
              <button type="button" onClick={runPrimaryAction} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700">
                {createButtonLabel}
              </button>
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
          {message && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 font-bold text-blue-800">{message}</div>}

          {tab === "dashboard" && <Dashboard employees={activeEmployees} sites={sites} tasks={tasks} entries={entries} lowStock={lowStock} openAbsences={openAbsences} workedMinutes={workedMinutes} setTab={setTab} />}
          {tab === "planung" && <Planning tasks={filtered.tasks} employees={activeEmployees} sites={sites} openTask={openTask} editTask={openTask} deleteTask={(row: Row) => removeRow("tasks", row.id, "Aufgabe")} />}
          {tab === "mitarbeiter" && <Employees rows={filtered.employees} entries={entries} absences={absences} tasks={tasks} openCreate={() => openEmployee()} openEdit={openEmployee} activate={(row: Row) => setEmployeeActive(row, true)} deactivate={(row: Row) => setEmployeeActive(row, false)} exportRows={() => downloadCsv("mitarbeiter.csv", employees)} />}
          {tab === "kunden" && <Customers rows={filtered.customers} openCreate={() => openCustomer()} openEdit={openCustomer} deleteRow={(row: Row) => removeRow("work_sites", row.id, "Kunde")} exportRows={() => downloadCsv("kunden.csv", customers)} />}
          {tab === "kontakte" && <Contacts rows={filtered.contacts} openCreate={() => openContact()} openEdit={openContact} deleteRow={(row: Row) => removeRow("customer_contacts", row.id, "Kontakt")} exportRows={() => downloadCsv("kontakte.csv", contacts)} />}
          {tab === "objekte" && <Sites rows={filtered.sites} openCreate={() => openSite()} openEdit={openSite} deleteRow={(row: Row) => removeRow("work_sites", row.id, "Objekt")} exportRows={() => downloadCsv("objekte.csv", sites)} />}
          {tab === "aufgaben" && <Tasks rows={filtered.tasks} openCreate={() => openTask()} openEdit={openTask} deleteRow={(row: Row) => removeRow("tasks", row.id, "Aufgabe")} exportRows={() => downloadCsv("aufgaben.csv", tasks)} />}
          {tab === "material" && <Materials rows={filtered.materials} openCreate={() => openMaterial()} openEdit={openMaterial} deleteRow={(row: Row) => removeRow("material_products", row.id, "Material")} exportRows={() => downloadCsv("material.csv", materials)} />}
          {tab === "geraete" && <Devices rows={filtered.devices} openCreate={() => openDevice()} openEdit={openDevice} deleteRow={(row: Row) => removeRow("equipment_items", row.id, "Gerät")} exportRows={() => downloadCsv("geraete.csv", devices)} />}
          {tab === "schluessel" && <Keys rows={filtered.keys} openCreate={() => openKey()} openEdit={openKey} deleteRow={(row: Row) => removeRow("key_items", row.id, "Schlüssel")} pdf={createKeyPdf} exportRows={() => downloadCsv("schluessel.csv", keys)} />}
          {tab === "zeiten" && <Times rows={filtered.entries} approve={approveEntry} exportRows={() => downloadCsv("zeiten.csv", entries)} />}
          {tab === "abwesenheiten" && <Absences rows={filtered.absences} openCreate={() => openAbsence()} openEdit={openAbsence} deleteRow={(row: Row) => removeRow("absence_requests", row.id, "Abwesenheit")} decide={(row: Row, status: string) => insertOrUpdate("absence_requests", row.id, { status })} />}
          {tab === "chat" && <Chat employees={activeEmployees} employee={chatEmployee} setEmployee={loadChat} messages={chatMessages} text={chatText} setText={setChatText} send={sendChat} />}
        </section>
      </div>

      {modal === "employeeInvite" && <EmployeeInviteModal close={() => setModal(null)} form={employeeInvite} setForm={setEmployeeInvite} save={createEmployeeInvite} saving={saving} inviteLink={inviteLink} whatsappLink={whatsappLink} />}
      {modal === "employeeEdit" && <EmployeeEditModal close={() => setModal(null)} form={employeeEdit} setForm={setEmployeeEdit} save={saveEmployee} saving={saving} />}
      {modal === "customer" && <CustomerModal close={() => setModal(null)} form={customerForm} setForm={setCustomerForm} save={saveCustomer} saving={saving} />}
      {modal === "contact" && <ContactModal close={() => setModal(null)} form={contactForm} setForm={setContactForm} save={saveContact} saving={saving} />}
      {modal === "site" && <SiteModal close={() => setModal(null)} form={siteForm} setForm={setSiteForm} save={saveSite} saving={saving} />}
      {modal === "task" && <TaskModal close={() => setModal(null)} form={taskForm} setForm={setTaskForm} save={saveTask} saving={saving} employees={activeEmployees} sites={sites} />}
      {modal === "material" && <MaterialModal close={() => setModal(null)} form={materialForm} setForm={setMaterialForm} save={saveMaterial} saving={saving} />}
      {modal === "device" && <DeviceModal close={() => setModal(null)} form={deviceForm} setForm={setDeviceForm} save={saveDevice} saving={saving} employees={activeEmployees} />}
      {modal === "key" && <KeyModal close={() => setModal(null)} form={keyForm} setForm={setKeyForm} save={saveKey} saving={saving} employees={activeEmployees} sites={sites} customers={customers} />}
      {modal === "absence" && <AbsenceModal close={() => setModal(null)} form={absenceForm} setForm={setAbsenceForm} save={saveAbsence} saving={saving} employees={activeEmployees} />}
    </main>
  );
}

const navItems: { id: Tab; icon: string; label: string }[] = [
  { id: "dashboard", icon: "●", label: "Übersicht" },
  { id: "planung", icon: "▦", label: "Einsatzplan" },
  { id: "mitarbeiter", icon: "👥", label: "Mitarbeiter" },
  { id: "kunden", icon: "🏷", label: "Kunden" },
  { id: "kontakte", icon: "☎", label: "Kontakte" },
  { id: "objekte", icon: "🏢", label: "Objekte" },
  { id: "aufgaben", icon: "✓", label: "Aufgaben" },
  { id: "material", icon: "📦", label: "Material" },
  { id: "geraete", icon: "🔧", label: "Geräte" },
  { id: "schluessel", icon: "🔑", label: "Schlüssel" },
  { id: "zeiten", icon: "⏱", label: "Zeiten" },
  { id: "abwesenheiten", icon: "✈", label: "Abwesenheiten" },
  { id: "chat", icon: "💬", label: "Chat" },
];

function getCreateButtonLabel(tab: Tab) {
  if (tab === "dashboard") return "+ Aufgabe";
  if (tab === "planung" || tab === "aufgaben") return "+ Aufgabe";
  if (tab === "mitarbeiter") return "+ Mitarbeiter";
  if (tab === "kunden") return "+ Kunde";
  if (tab === "kontakte") return "+ Kontakt";
  if (tab === "objekte") return "+ Objekt";
  if (tab === "material") return "+ Material";
  if (tab === "geraete") return "+ Gerät";
  if (tab === "schluessel") return "+ Schlüssel";
  if (tab === "abwesenheiten") return "+ Abwesenheit";
  if (tab === "chat") return "Nachricht";
  return "+ Neu";
}

function filterRows(rows: Row[], query: string) {
  if (!query) return rows;
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
}

function customerRowsFromSites(sites: Row[]) {
  const map = new Map<string, Row>();
  for (const site of sites) {
    const name = site.customer_name || site.name;
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        ...site,
        customer_name: name,
        object_count: 0,
      });
    }
    map.get(name)!.object_count += 1;
  }
  return [...map.values()];
}

function PageHeader({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-black text-blue-700">{icon}</div>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
          {sub && <p className="text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Button({ children, onClick, primary = false, danger = false, type = "button", disabled = false }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; danger?: boolean; type?: "button" | "submit"; disabled?: boolean }) {
  const cls = danger
    ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
    : primary
      ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return <button type={type} onClick={onClick} disabled={disabled} className={`rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}>{children}</button>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Table({ headers, children, min = "900px" }: { headers: string[]; children: React.ReactNode; min?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead className="bg-slate-50 text-slate-500">
          <tr>{headers.map((h) => <th key={h} className="border-b border-slate-200 px-4 py-3 text-left font-black">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ text = "Noch keine Daten hinterlegt" }: { text?: string }) {
  return <div className="flex min-h-[300px] flex-col items-center justify-center text-center text-slate-400"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">×</div><p className="font-bold text-slate-700">{text}</p><p className="text-sm">Klicke oben auf „Neu“, um zu starten.</p></div>;
}

function Status({ children, color = "green" }: { children: React.ReactNode; color?: "green" | "blue" | "yellow" | "red" | "gray" }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700",
    blue: "bg-blue-100 text-blue-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    gray: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-black ${colors[color]}`}>{children}</span>;
}

function Dashboard(p: any) {
  return (
    <div>
      <PageHeader icon="●" title="Übersicht" sub="Heute startklar machen" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Aktive Mitarbeiter" value={p.employees.length} hint="mit Login verbunden" />
        <Metric title="Offene Aufgaben" value={p.openTasks ?? p.tasks.filter((x: Row) => !x.done).length} hint="noch zu erledigen" />
        <Metric title="Arbeitszeit" value={`${prettyHours(p.workedMinutes)} Std.`} hint="erfasster Zeitraum" />
        <Metric title="Material prüfen" value={p.lowStock} hint="unter Mindestbestand" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="p-5">
          <h3 className="mb-4 font-black">Schnellstart</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Quick title="Mitarbeiter anlegen" text="Einladung erstellen und Link versenden." onClick={() => p.setTab("mitarbeiter")} />
            <Quick title="Aufgabe planen" text="Einsatz für Objekt und Mitarbeiter erstellen." onClick={() => p.setTab("aufgaben")} />
            <Quick title="Material buchen" text="Bestände und Artikel verwalten." onClick={() => p.setTab("material")} />
            <Quick title="Schlüssel prüfen" text="Ausgabe und Rückgabe dokumentieren." onClick={() => p.setTab("schluessel")} />
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-black">Offene Hinweise</h3>
          <InfoLine label="Abwesenheiten" value={p.openAbsences} />
          <InfoLine label="Aufgaben" value={p.tasks.filter((x: Row) => !x.done).length} />
          <InfoLine label="Objekte" value={p.sites.length} />
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value, hint }: { title: string; value: React.ReactNode; hint: string }) {
  return <Card className="p-5"><p className="text-sm font-bold text-slate-500">{title}</p><p className="mt-2 text-3xl font-black text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></Card>;
}

function Quick({ title, text, onClick }: { title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-blue-300 hover:bg-blue-50"><p className="font-black text-slate-950">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></button>;
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-slate-100 py-3 last:border-b-0"><span className="text-slate-500">{label}</span><span className="font-black text-slate-950">{value}</span></div>;
}

function Planning(p: any) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div>
      <PageHeader icon="▦" title="Einsatzplan" sub="Kalenderansicht für die nächsten Tage"><Button primary onClick={() => p.openTask()}>+ Auftrag planen</Button></PageHeader>
      <div className="grid gap-4 xl:grid-cols-7">
        {days.map((day) => (
          <Card key={day} className="min-h-[420px] p-3">
            <p className="mb-3 text-sm font-black text-slate-700">{dateText(day)}</p>
            <div className="space-y-2">
              {p.tasks.filter((task: Row) => task.task_date === day).map((task: Row) => (
                <button key={task.id} type="button" onClick={() => p.editTask(task)} className="w-full rounded-xl border-l-4 border-blue-500 bg-blue-50 p-3 text-left text-sm hover:bg-blue-100">
                  <p className="font-black">{task.start_time} · {task.title}</p>
                  <p className="text-slate-500">{task.employee_name || "Ohne Mitarbeiter"}</p>
                  <p className="text-slate-500">{task.site || "Ohne Objekt"}</p>
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Employees(p: any) {
  return (
    <div>
      <PageHeader icon="👥" title="Mitarbeiter" sub={`${p.rows.length} Datensätze`}><Button onClick={p.exportRows}>Exportieren</Button><Button primary onClick={p.openCreate}>+ Mitarbeiter anlegen</Button></PageHeader>
      <div className="mb-5 grid gap-4 md:grid-cols-3"><Metric title="Aktive Mitarbeiter" value={p.rows.filter((x: Row) => x.active !== false).length} hint="im System" /><Metric title="Mit Login verbunden" value={p.rows.filter((x: Row) => x.auth_user_id).length} hint="Supabase Auth" /><Metric title="Abwesenheiten" value={p.absences.length} hint="gesamt" /></div>
      <Table headers={["Name", "Nummer", "Kontakt", "Arbeitszeit", "Urlaub", "Kosten", "Status", "Aktion"]}>{p.rows.length === 0 ? <tr><td colSpan={8}><Empty /></td></tr> : p.rows.map((e: Row) => {
        const entryMinutes = p.entries.filter((x: Row) => x.employee_name === e.name).reduce((s: number, x: Row) => s + Number(x.worked_minutes || x.planned_minutes || 0), 0);
        const cost = (entryMinutes / 60) * Number(e.hourly_rate || 0);
        return <tr key={e.id}><td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-black text-white">{initials(e.name)}</div><div><p className="font-black">{e.name}</p><p className="text-xs text-slate-500">{e.email || "Keine E-Mail"}</p></div></div></td><td className="px-4 py-3">{e.employee_number || "-"}</td><td className="px-4 py-3">{e.phone || "-"}</td><td className="px-4 py-3 font-bold">{prettyHours(entryMinutes)} Std.</td><td className="px-4 py-3">{e.vacation_days || e.annual_vacation_days || 0} Tage</td><td className="px-4 py-3 font-bold">{euro(cost)}</td><td className="px-4 py-3"><Status color={e.active === false ? "gray" : "green"}>{e.active === false ? "Passiv" : "Aktiv"}</Status></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button onClick={() => p.openEdit(e)}>Bearbeiten</Button>{e.active === false ? <Button primary onClick={() => p.activate(e)}>Aktivieren</Button> : <Button danger onClick={() => p.deactivate(e)}>Deaktivieren</Button>}</div></td></tr>;
      })}</Table>
    </div>
  );
}

function Customers(p: any) {
  return <ListPage icon="🏷" title="Kunden" sub="Kundeninformationen, Objekte und Kontakte" rows={p.rows} headers={["Kunde", "Nummer", "Adresse", "Telefon", "E-Mail", "Objekte", "Aktion"]} createLabel="+ Kunde erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.customer_name || r.name}</td><td className="px-4 py-3">{r.customer_number || "-"}</td><td className="px-4 py-3">{r.customer_address || r.address || "-"}</td><td className="px-4 py-3">{r.customer_phone || r.phone || "-"}</td><td className="px-4 py-3">{r.customer_email || r.email || "-"}</td><td className="px-4 py-3">{r.object_count || 1}</td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Contacts(p: any) {
  return <ListPage icon="☎" title="Kontakte" sub="Ansprechpartner für Kunden und Objekte" rows={p.rows} headers={["Name", "Firma", "Rolle", "Telefon", "E-Mail", "Aktion"]} createLabel="+ Kontakt erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.company || "-"}</td><td className="px-4 py-3">{r.role || r.contact_role || "-"}</td><td className="px-4 py-3">{r.phone || "-"}</td><td className="px-4 py-3">{r.email || "-"}</td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Sites(p: any) {
  return <ListPage icon="🏢" title="Objekte" sub="Objektliste mit GPS-Radius" rows={p.rows} headers={["Objekt", "Adresse", "GPS", "Radius", "Status", "Aktion"]} createLabel="+ Objekt erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.address || "-"}</td><td className="px-4 py-3">{r.latitude && r.longitude ? `${r.latitude}, ${r.longitude}` : "-"}</td><td className="px-4 py-3">{r.allowed_radius_m || 50} m</td><td className="px-4 py-3"><Status color={r.active === false ? "gray" : "green"}>{r.active === false ? "Passiv" : "Aktiv"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Tasks(p: any) {
  return <ListPage icon="✓" title="Aufgaben" sub="Aufgaben und Einsätze für Mitarbeiter" rows={p.rows} headers={["Datum", "Zeit", "Auftrag", "Objekt", "Mitarbeiter", "Priorität", "Status", "Aktion"]} createLabel="+ Aufgabe erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3">{dateText(r.task_date)}</td><td className="px-4 py-3">{r.start_time} - {r.end_time}</td><td className="px-4 py-3 font-black">{r.title}</td><td className="px-4 py-3">{r.site || "-"}</td><td className="px-4 py-3">{r.employee_name || "-"}</td><td className="px-4 py-3"><Status color={r.priority === "Dringend" ? "red" : r.priority === "Hoch" ? "yellow" : "blue"}>{r.priority || "Normal"}</Status></td><td className="px-4 py-3"><Status color={r.done ? "green" : "gray"}>{r.done ? "Erledigt" : "Offen"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Materials(p: any) {
  return <ListPage icon="📦" title="Materialwesen" sub="Artikel, Bestand und Mindestbestand" rows={p.rows} headers={["Artikel", "Kategorie", "Bestand", "Mindestbestand", "Lieferant", "Status", "Aktion"]} createLabel="+ Artikel erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => { const low = Number(r.current_stock || 0) <= Number(r.min_stock || 0); return <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.category || "-"}</td><td className="px-4 py-3">{r.current_stock || 0} {r.unit || "Stück"}</td><td className="px-4 py-3">{r.min_stock || 0}</td><td className="px-4 py-3">{r.supplier || "-"}</td><td className="px-4 py-3"><Status color={low ? "red" : "green"}>{low ? "Nachbestellen" : "OK"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>; })}</ListPage>;
}

function Devices(p: any) {
  return <ListPage icon="🔧" title="Geräte" sub="Maschinen und Betriebsmittel" rows={p.rows} headers={["Gerät", "Kategorie", "Seriennummer", "Zugewiesen", "Status", "Aktion"]} createLabel="+ Gerät erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.name}</td><td className="px-4 py-3">{r.category || "-"}</td><td className="px-4 py-3">{r.serial_number || "-"}</td><td className="px-4 py-3">{r.assigned_to || "-"}</td><td className="px-4 py-3"><Status color={r.status === "Defekt" ? "red" : r.status === "Wartung" ? "yellow" : "green"}>{r.status || "Aktiv"}</Status></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Keys(p: any) {
  return <ListPage icon="🔑" title="Schlüssel" sub="Schlüsselverwaltung mit Übergabe-PDF" rows={p.rows} headers={["Schlüssel", "Nummer", "Kunde", "Objekt", "Mitarbeiter", "Status", "PDF", "Aktion"]} createLabel="+ Schlüssel erstellen" onCreate={p.openCreate} onExport={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.key_name}</td><td className="px-4 py-3">{r.key_number || "-"}</td><td className="px-4 py-3">{r.customer_name || "-"}</td><td className="px-4 py-3">{r.object_name || "-"}</td><td className="px-4 py-3">{r.employee_name || "-"}</td><td className="px-4 py-3"><Status color={r.status === "Verloren" ? "red" : r.status === "Zurückgegeben" ? "green" : "blue"}>{r.status || "Ausgegeben"}</Status></td><td className="px-4 py-3"><Button onClick={() => p.pdf(r)}>PDF</Button></td><td className="px-4 py-3"><Actions edit={() => p.openEdit(r)} del={() => p.deleteRow(r)} /></td></tr>)}</ListPage>;
}

function Times(p: any) {
  return <ListPage icon="⏱" title="Zeitenfreigabe" sub="Arbeitszeiten prüfen und freigeben" rows={p.rows} headers={["Datum", "Mitarbeiter", "Objekt", "Arbeitszeit", "Status", "Aktion"]} createLabel="Export" onCreate={p.exportRows}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3">{dateText(r.created_at || r.work_date)}</td><td className="px-4 py-3 font-black">{r.employee_name}</td><td className="px-4 py-3">{r.site || r.work_site || "-"}</td><td className="px-4 py-3">{prettyHours(r.worked_minutes || r.planned_minutes || 0)} Std.</td><td className="px-4 py-3"><Status color={r.status === "approved" || r.approved ? "green" : r.status === "rejected" ? "red" : "yellow"}>{r.status || (r.approved ? "approved" : "offen")}</Status></td><td className="px-4 py-3"><div className="flex gap-2"><Button primary onClick={() => p.approve(r, true)}>Freigeben</Button><Button danger onClick={() => p.approve(r, false)}>Ablehnen</Button></div></td></tr>)}</ListPage>;
}

function Absences(p: any) {
  return <ListPage icon="✈" title="Abwesenheiten" sub="Urlaub, Krankheit und Freistellung" rows={p.rows} headers={["Mitarbeiter", "Art", "Von", "Bis", "Status", "Aktion"]} createLabel="+ Abwesenheit" onCreate={p.openCreate}>{p.rows.map((r: Row) => <tr key={r.id}><td className="px-4 py-3 font-black">{r.employee_name}</td><td className="px-4 py-3">{r.absence_type}</td><td className="px-4 py-3">{dateText(r.start_date)}</td><td className="px-4 py-3">{dateText(r.end_date)}</td><td className="px-4 py-3"><Status color={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "yellow"}>{r.status || "open"}</Status></td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button primary onClick={() => p.decide(r, "approved")}>OK</Button><Button danger onClick={() => p.decide(r, "rejected")}>Nein</Button><Button onClick={() => p.openEdit(r)}>Bearbeiten</Button><Button danger onClick={() => p.deleteRow(r)}>Löschen</Button></div></td></tr>)}</ListPage>;
}

function Chat(p: any) {
  return (
    <div>
      <PageHeader icon="💬" title="Chat" sub="Nachrichten an Mitarbeiter" />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="p-4"><h3 className="mb-3 font-black">Mitarbeiter</h3>{p.employees.map((e: Row) => <button key={e.id} type="button" onClick={() => p.setEmployee(e.name)} className={p.employee === e.name ? "mb-2 w-full rounded-xl bg-blue-600 p-3 text-left font-bold text-white" : "mb-2 w-full rounded-xl bg-slate-50 p-3 text-left font-bold text-slate-700 hover:bg-blue-50"}>{e.name}</button>)}</Card>
        <Card className="p-4"><h3 className="mb-4 font-black">{p.employee ? `Chat mit ${p.employee}` : "Mitarbeiter auswählen"}</h3><div className="mb-4 h-[55vh] overflow-y-auto rounded-2xl bg-slate-50 p-4">{p.messages.length === 0 && <Empty text="Noch keine Nachrichten" />}{p.messages.map((m: Row) => <div key={m.id} className={m.sender_role === "admin" ? "mb-3 ml-auto max-w-[80%] rounded-2xl bg-blue-600 p-3 text-white" : "mb-3 max-w-[80%] rounded-2xl bg-white p-3 shadow-sm"}><p className="text-xs font-black opacity-70">{m.sender_role === "admin" ? "Ich" : m.sender_name || m.employee_name}</p><p>{m.message}</p></div>)}</div><div className="flex gap-2"><input value={p.text} onChange={(event) => p.setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") p.send(); }} className="field" placeholder="Nachricht schreiben..." /><Button primary onClick={p.send}>Senden</Button></div></Card>
      </div>
    </div>
  );
}

function ListPage(p: any) {
  return (
    <div>
      <PageHeader icon={p.icon} title={p.title} sub={p.sub}><Button onClick={p.onExport || p.onCreate}>Exportieren</Button><Button primary onClick={p.onCreate}>{p.createLabel}</Button></PageHeader>
      <div className="mb-4 flex flex-wrap gap-2"><Pill>Informationen</Pill><Pill>Objekte</Pill><Pill>Aufgaben</Pill><Pill>Auswertung</Pill><Pill>Dokumente</Pill></div>
      <Table headers={p.headers}>{p.rows.length === 0 ? <tr><td colSpan={p.headers.length}><Empty /></td></tr> : p.children}</Table>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-sm ring-1 ring-slate-200">{children}</span>;
}

function Actions({ edit, del }: { edit: () => void; del: () => void }) {
  return <div className="flex flex-wrap gap-2"><Button onClick={edit}>Bearbeiten</Button><Button danger onClick={del}>Löschen</Button></div>;
}

function ModalShell({ title, close, children, onSubmit, saving, wide = false }: { title: string; close: () => void; children: React.ReactNode; onSubmit: () => void; saving: boolean; wide?: boolean }) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className={`my-8 rounded-3xl bg-white shadow-2xl ${wide ? "w-full max-w-5xl" : "w-full max-w-2xl"}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><h2 className="text-xl font-black text-slate-950">{title}</h2><button type="button" onClick={close} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">✕</button></div>
        <div className="grid gap-4 p-6 md:grid-cols-2">{children}</div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><button type="button" onClick={close} className="text-sm font-bold text-slate-500">Abbrechen</button><Button primary type="submit" disabled={saving}>{saving ? "Speichern..." : "Speichern"}</Button></div>
      </form>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "md:col-span-2" : ""}><span className="mb-1 block text-xs font-black text-slate-500">{label}</span>{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`field ${props.className || ""}`} />; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`field ${props.className || ""}`}>{props.children}</select>; }
function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`field min-h-28 ${props.className || ""}`} />; }

function EmployeeInviteModal(p: any) {
  return <ModalShell title="Mitarbeiter anlegen" close={p.close} onSubmit={p.save} saving={p.saving}><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="E-Mail"><Input required type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field>{p.inviteLink && <div className="md:col-span-2 rounded-2xl bg-blue-50 p-4"><p className="mb-2 font-black text-blue-900">Aktivierungslink</p><input readOnly className="field" value={p.inviteLink} /><div className="mt-3 flex gap-2"><Button onClick={() => navigator.clipboard.writeText(p.inviteLink)}>Link kopieren</Button>{p.whatsappLink && <a href={p.whatsappLink} target="_blank" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">WhatsApp öffnen</a>}</div></div>}</ModalShell>;
}

function EmployeeEditModal(p: any) {
  return <ModalShell title="Mitarbeiter bearbeiten" close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="Personalnummer"><Input value={p.form.employee_number} onChange={(e) => p.setForm({ ...p.form, employee_number: e.target.value })} /></Field><Field label="Adresse" wide><Input value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field><Field label="Stundenlohn"><Input type="number" step="0.01" value={p.form.hourly_rate} onChange={(e) => p.setForm({ ...p.form, hourly_rate: e.target.value })} /></Field><Field label="Urlaubstage"><Input type="number" step="0.5" value={p.form.vacation_days} onChange={(e) => p.setForm({ ...p.form, vacation_days: e.target.value })} /></Field><Field label="Status"><Select value={p.form.active ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, active: e.target.value === "true" })}><option value="true">Aktiv</option><option value="false">Passiv</option></Select></Field></ModalShell>;
}

function CustomerModal(p: any) { return <ModalShell title={p.form.id ? "Kunde bearbeiten" : "Kunde erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Kunde"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Kundennummer"><Input value={p.form.customer_number} onChange={(e) => p.setForm({ ...p.form, customer_number: e.target.value })} /></Field><Field label="Adresse" wide><Input value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function ContactModal(p: any) { return <ModalShell title={p.form.id ? "Kontakt bearbeiten" : "Kontakt erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Name"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Firma"><Input value={p.form.company} onChange={(e) => p.setForm({ ...p.form, company: e.target.value })} /></Field><Field label="Rolle"><Input value={p.form.role} onChange={(e) => p.setForm({ ...p.form, role: e.target.value })} /></Field><Field label="Telefon"><Input value={p.form.phone} onChange={(e) => p.setForm({ ...p.form, phone: e.target.value })} /></Field><Field label="E-Mail"><Input type="email" value={p.form.email} onChange={(e) => p.setForm({ ...p.form, email: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function SiteModal(p: any) { return <ModalShell title={p.form.id ? "Objekt bearbeiten" : "Objekt erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Objektname"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Adresse"><Input required value={p.form.address} onChange={(e) => p.setForm({ ...p.form, address: e.target.value })} /></Field><Field label="GPS-Radius Meter"><Input type="number" value={p.form.allowed_radius_m} onChange={(e) => p.setForm({ ...p.form, allowed_radius_m: e.target.value })} /></Field><Field label="Latitude"><Input value={p.form.latitude} onChange={(e) => p.setForm({ ...p.form, latitude: e.target.value })} /></Field><Field label="Longitude"><Input value={p.form.longitude} onChange={(e) => p.setForm({ ...p.form, longitude: e.target.value })} /></Field><Field label="Status"><Select value={p.form.active ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, active: e.target.value === "true" })}><option value="true">Aktiv</option><option value="false">Passiv</option></Select></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function TaskModal(p: any) { return <ModalShell title={p.form.id ? "Aufgabe bearbeiten" : "Neue Aufgabe erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Titel"><Input required value={p.form.title} onChange={(e) => p.setForm({ ...p.form, title: e.target.value })} /></Field><Field label="Priorität"><Select value={p.form.priority} onChange={(e) => p.setForm({ ...p.form, priority: e.target.value })}><option>Normal</option><option>Hoch</option><option>Dringend</option></Select></Field><Field label="Datum"><Input type="date" value={p.form.task_date} onChange={(e) => p.setForm({ ...p.form, task_date: e.target.value })} /></Field><Field label="Mitarbeiter"><Select value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Objekt"><Select value={p.form.work_site_id} onChange={(e) => p.setForm({ ...p.form, work_site_id: e.target.value })}><option value="">Objekt auswählen</option>{p.sites.map((s: Row) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Erledigt"><Select value={p.form.done ? "true" : "false"} onChange={(e) => p.setForm({ ...p.form, done: e.target.value === "true" })}><option value="false">Offen</option><option value="true">Erledigt</option></Select></Field><Field label="Von"><Input type="time" value={p.form.start_time} onChange={(e) => p.setForm({ ...p.form, start_time: e.target.value })} /></Field><Field label="Bis"><Input type="time" value={p.form.end_time} onChange={(e) => p.setForm({ ...p.form, end_time: e.target.value })} /></Field><Field label="Planzeit Minuten"><Input type="number" value={p.form.planned_minutes} onChange={(e) => p.setForm({ ...p.form, planned_minutes: e.target.value })} /></Field><Field label="Beschreibung" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function MaterialModal(p: any) { return <ModalShell title={p.form.id ? "Artikel bearbeiten" : "Neuen Artikel erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Artikel"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Kategorie"><Input value={p.form.category} onChange={(e) => p.setForm({ ...p.form, category: e.target.value })} /></Field><Field label="Einheit"><Input value={p.form.unit} onChange={(e) => p.setForm({ ...p.form, unit: e.target.value })} /></Field><Field label="Bestand"><Input type="number" value={p.form.current_stock} onChange={(e) => p.setForm({ ...p.form, current_stock: e.target.value })} /></Field><Field label="Mindestbestand"><Input type="number" value={p.form.min_stock} onChange={(e) => p.setForm({ ...p.form, min_stock: e.target.value })} /></Field><Field label="Lieferant"><Input value={p.form.supplier} onChange={(e) => p.setForm({ ...p.form, supplier: e.target.value })} /></Field><Field label="Bild-URL" wide><Input value={p.form.image_url} onChange={(e) => p.setForm({ ...p.form, image_url: e.target.value })} /></Field><Field label="Notizen" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function DeviceModal(p: any) { return <ModalShell title={p.form.id ? "Gerät bearbeiten" : "Neues Gerät anlegen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Gerätename"><Input required value={p.form.name} onChange={(e) => p.setForm({ ...p.form, name: e.target.value })} /></Field><Field label="Kategorie"><Input value={p.form.category} onChange={(e) => p.setForm({ ...p.form, category: e.target.value })} /></Field><Field label="Seriennummer"><Input value={p.form.serial_number} onChange={(e) => p.setForm({ ...p.form, serial_number: e.target.value })} /></Field><Field label="Zugewiesen an"><Select value={p.form.assigned_to} onChange={(e) => p.setForm({ ...p.form, assigned_to: e.target.value })}><option value="">Nicht zugewiesen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option>Aktiv</option><option>Wartung</option><option>Defekt</option><option>Archiv</option></Select></Field><Field label="Bild-URL"><Input value={p.form.image_url} onChange={(e) => p.setForm({ ...p.form, image_url: e.target.value })} /></Field><Field label="Kommentar" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function KeyModal(p: any) { return <ModalShell title={p.form.id ? "Schlüssel bearbeiten" : "Neuen Schlüssel anlegen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Schlüssel"><Input required value={p.form.key_name} onChange={(e) => p.setForm({ ...p.form, key_name: e.target.value })} /></Field><Field label="Schlüsselnummer"><Input value={p.form.key_number} onChange={(e) => p.setForm({ ...p.form, key_number: e.target.value })} /></Field><Field label="Kunde"><Select value={p.form.customer_name} onChange={(e) => p.setForm({ ...p.form, customer_name: e.target.value })}><option value="">Kunde auswählen</option>{p.customers.map((c: Row) => <option key={c.id} value={c.customer_name || c.name}>{c.customer_name || c.name}</option>)}</Select></Field><Field label="Objekt"><Select value={p.form.object_name} onChange={(e) => p.setForm({ ...p.form, object_name: e.target.value })}><option value="">Objekt auswählen</option>{p.sites.map((s: Row) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select></Field><Field label="Mitarbeiter"><Select value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option>Ausgegeben</option><option>Zurückgegeben</option><option>Verloren</option><option>Archiv</option></Select></Field><Field label="Ausgabe"><Input type="date" value={p.form.handover_date} onChange={(e) => p.setForm({ ...p.form, handover_date: e.target.value })} /></Field><Field label="Rückgabe"><Input type="date" value={p.form.return_date} onChange={(e) => p.setForm({ ...p.form, return_date: e.target.value })} /></Field><Field label="Kommentar" wide><Textarea value={p.form.notes} onChange={(e) => p.setForm({ ...p.form, notes: e.target.value })} /></Field></ModalShell>; }
function AbsenceModal(p: any) { return <ModalShell title={p.form.id ? "Abwesenheit bearbeiten" : "Abwesenheit erstellen"} close={p.close} onSubmit={p.save} saving={p.saving} wide><Field label="Mitarbeiter"><Select required value={p.form.employee_name} onChange={(e) => p.setForm({ ...p.form, employee_name: e.target.value })}><option value="">Mitarbeiter auswählen</option>{p.employees.map((e: Row) => <option key={e.id} value={e.name}>{e.name}</option>)}</Select></Field><Field label="Art"><Select value={p.form.absence_type} onChange={(e) => p.setForm({ ...p.form, absence_type: e.target.value })}><option>Urlaub</option><option>Krank</option><option>Frei</option><option>Sonstiges</option></Select></Field><Field label="Von"><Input type="date" value={p.form.start_date} onChange={(e) => p.setForm({ ...p.form, start_date: e.target.value })} /></Field><Field label="Bis"><Input type="date" value={p.form.end_date} onChange={(e) => p.setForm({ ...p.form, end_date: e.target.value })} /></Field><Field label="Status"><Select value={p.form.status} onChange={(e) => p.setForm({ ...p.form, status: e.target.value })}><option value="open">Offen</option><option value="approved">Genehmigt</option><option value="rejected">Abgelehnt</option></Select></Field><Field label="Grund" wide><Textarea value={p.form.reason} onChange={(e) => p.setForm({ ...p.form, reason: e.target.value })} /></Field></ModalShell>; }
