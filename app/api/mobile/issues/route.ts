import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const ISSUE_BUCKET = "issue-photos";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableUuid(value: unknown) {
  const current = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(current) ? current : null;
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : "jpg";
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${String(extension || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg"}`;
}

async function ensureIssueBucket(supabase: AnyRow) {
  try {
    const { error } = await supabase.storage.createBucket(ISSUE_BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("issue bucket create warning:", error.message);
    }
  } catch (error) {
    console.warn("issue bucket create failed:", error);
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      taskId: form.get("taskId") || form.get("task_id"),
      workSiteId: form.get("workSiteId") || form.get("work_site_id"),
      workSiteName: form.get("workSiteName") || form.get("work_site_name") || form.get("object_name") || form.get("site"),
      category: form.get("category") || form.get("issue_type"),
      priority: form.get("priority"),
      description: form.get("description") || form.get("message") || form.get("notes"),
      files: form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0).slice(0, 6)
    };
  }

  const body = (await request.json()) as AnyRow;
  return {
    taskId: body.taskId || body.task_id,
    workSiteId: body.workSiteId || body.work_site_id,
    workSiteName: body.workSiteName || body.work_site_name || body.object_name || body.site,
    category: body.category || body.issue_type,
    priority: body.priority,
    description: body.description || body.message || body.notes,
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
    const workSiteName = text(body.workSiteName) || "Ohne Objekt";
    const category = text(body.category) || "Objektmeldung";
    const priority = text(body.priority) || "normal";
    const description = text(body.description);

    if (!description) {
      return NextResponse.json({ ok: false, error: "Bitte Beschreibung eintragen." }, { status: 400 });
    }

    const photoUrls: string[] = [];
    if (body.files.length) {
      await ensureIssueBucket(auth.supabase);
      for (const file of body.files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: `Foto ${file.name} ist größer als 8 MB.` }, { status: 400 });
        }
        const path = [
          auth.profile.id,
          new Date().toISOString().slice(0, 10),
          workSiteId || "ohne-objekt",
          safeFileName(file.name)
        ].join("/");
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await auth.supabase.storage
          .from(ISSUE_BUCKET)
          .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicData } = auth.supabase.storage.from(ISSUE_BUCKET).getPublicUrl(path);
        if (publicData?.publicUrl) photoUrls.push(publicData.publicUrl);
      }
    }

    const title = priority === "critical" ? "Dringende Objektmeldung" : priority === "urgent" ? "Wichtige Objektmeldung" : "Objektmeldung";
    const message = [
      `${auth.profile.name} meldet: ${category}`,
      `Objekt: ${workSiteName}`,
      `Dringlichkeit: ${priority}`,
      `Beschreibung: ${description}`,
      photoUrls.length ? `Fotos:\n${photoUrls.join("\n")}` : ""
    ].filter(Boolean).join("\n");

    const payload = {
      employee_name: auth.profile.name,
      title,
      message,
      notification_type: "object_issue",
      status: "open",
      read: false,
      task_id: taskId,
      work_site_id: workSiteId,
      work_site_name: workSiteName,
      object_name: workSiteName,
      site: workSiteName,
      created_at: new Date().toISOString()
    };

    const insert = await auth.supabase.from("admin_notifications").insert(payload).select("*").maybeSingle();
    if (insert.error) throw new Error(insert.error.message);

    return NextResponse.json({ ok: true, notification: insert.data, photoUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Objektmeldung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
