import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

type AnyRow = Record<string, any>;
const QUALITY_BUCKET = "quality-photos";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullableUuid(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function normalizeList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => clean(item)).filter(Boolean).slice(0, 100);
  const text = clean(value);
  if (!text) return [] as string[];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => clean(item)).filter(Boolean).slice(0, 100);
  } catch {
    // normal text fallback below
  }
  return text.split("|").map((item) => clean(item)).filter(Boolean).slice(0, 100);
}

async function ensureQualityBucket(supabase: AnyRow) {
  try {
    const { error } = await supabase.storage.createBucket(QUALITY_BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("quality bucket create warning:", error.message);
    }
  } catch (error) {
    console.warn("quality bucket create failed:", error);
  }
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : "jpg";
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${String(extension || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg"}`;
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      taskId: form.get("taskId"),
      workSiteId: form.get("workSiteId"),
      workSiteName: form.get("workSiteName") || form.get("siteName") || form.get("objectName"),
      checkedItems: normalizeList(form.get("checkedItems")),
      notes: form.get("notes"),
      rating: form.get("rating") as unknown,
      files: form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0).slice(0, 6)
    };
  }

  const body = (await request.json()) as AnyRow;
  return {
    taskId: body.taskId,
    workSiteId: body.workSiteId,
    workSiteName: body.workSiteName || body.siteName || body.objectName,
    checkedItems: normalizeList(body.checkedItems),
    notes: body.notes,
    rating: body.rating as unknown,
    files: [] as File[]
  };
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await parseBody(request);
    const taskId = nullableUuid(body.taskId);
    const workSiteId = nullableUuid(body.workSiteId);
    const checkedItems = normalizeList(body.checkedItems);
    const notes = clean(body.notes);
    const rating = Math.min(5, Math.max(0, Math.round(Number(body.rating) || 0)));
    const workSiteName = clean(body.workSiteName);

    if (!taskId && !workSiteId) {
      return NextResponse.json({ ok: false, error: "Bitte Einsatz oder Objekt auswählen." }, { status: 400 });
    }

    let task: AnyRow | null = null;
    if (taskId) {
      const { data, error } = await auth.supabase
        .from("tasks")
        .select("id, title, site, employee_name, work_site_id, status, done")
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      task = data;
      if (!task) return NextResponse.json({ ok: false, error: "Einsatz wurde nicht gefunden." }, { status: 404 });
      if (!auth.isAdmin && task.employee_name !== auth.profile.name) {
        return NextResponse.json({ ok: false, error: "Dieser Einsatz gehört nicht zu deinem Profil." }, { status: 403 });
      }
    }

    const siteLabel = workSiteName || clean(task?.site) || "Ohne Objekt";
    const uploadedPhotos: string[] = [];

    if (body.files.length) {
      await ensureQualityBucket(auth.supabase);
      for (const file of body.files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: `Foto ${file.name} ist größer als 8 MB.` }, { status: 400 });
        }
        const path = [
          auth.profile.id,
          new Date().toISOString().slice(0, 10),
          taskId || "ohne-einsatz",
          safeFileName(file.name)
        ].join("/");
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await auth.supabase.storage
          .from(QUALITY_BUCKET)
          .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicData } = auth.supabase.storage.from(QUALITY_BUCKET).getPublicUrl(path);
        if (publicData?.publicUrl) uploadedPhotos.push(publicData.publicUrl);
      }
    }

    const reportPayload = {
      task_id: taskId,
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      work_site_id: workSiteId || nullableUuid(task?.work_site_id),
      work_site_name: siteLabel,
      checked_items: checkedItems,
      notes: notes || null,
      status: "submitted",
      photo_urls: uploadedPhotos,
      photo_count: uploadedPhotos.length,
      // Sternebewertung. Die Spalte gibt es evtl. noch nicht, safeInsert laesst sie dann weg.
      rating: rating || null,
      created_at: new Date().toISOString()
    };

    let qualityReport: AnyRow | null = null;
    try {
      const saved = await safeInsert(auth.supabase, "quality_reports", reportPayload);
      qualityReport = saved.data;
    } catch {
      qualityReport = null;
    }

    const messageLines = [
      `${auth.profile.name} hat einen Qualitätsnachweis abgegeben${task?.title ? `: ${task.title}` : ""}.`,
      `Objekt: ${siteLabel}`,
      checkedItems.length ? `Erledigte Punkte: ${checkedItems.join(", ")}` : "Erledigte Punkte: keine Auswahl",
      uploadedPhotos.length ? `Fotos: ${uploadedPhotos.length}` : "Fotos: keine",
      notes ? `Notiz: ${notes}` : ""
    ].filter(Boolean);

    await auth.supabase.from("admin_notifications").insert({
      title: uploadedPhotos.length ? "Qualitätsnachweis mit Foto eingereicht" : "Qualitätsnachweis eingereicht",
      message: messageLines.join("\n"),
      employee_name: auth.profile.name,
      work_site_name: siteLabel,
      object_name: siteLabel,
      site: siteLabel,
      read: false,
      status: "open",
      notification_type: "quality_report",
      task_id: taskId,
      work_site_id: workSiteId || nullableUuid(task?.work_site_id),
      created_at: new Date().toISOString()
    });

    if (taskId) {
      await auth.supabase
        .from("tasks")
        .update({ done: true, status: "done" })
        .eq("id", taskId);
    }

    return NextResponse.json({ ok: true, report: qualityReport, photoUrls: uploadedPhotos, usedFallback: !qualityReport });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Qualitätsnachweis konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
