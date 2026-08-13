import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";
import { safeInsert } from "@/lib/safeWrite";

export const dynamic = "force-dynamic";

const ABSENCE_BUCKET = "absence-documents";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function validDate(value: unknown) {
  const date = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : "jpg";
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${String(extension || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg"}`;
}

/** Ablage für Krankmeldungen. Nicht öffentlich, Zugriff nur über den Dienst. */
async function ensureBucket(supabase: AnyRow) {
  try {
    const { error } = await supabase.storage.createBucket(ABSENCE_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("absence bucket warning:", error.message);
    }
  } catch (error) {
    console.warn("absence bucket failed:", error);
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      absenceType: form.get("absenceType"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
      reason: form.get("reason"),
      files: form.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0).slice(0, 3)
    };
  }
  const body = (await request.json()) as AnyRow;
  return {
    absenceType: body.absenceType || body.absence_type || body.request_type,
    startDate: body.startDate || body.start_date,
    endDate: body.endDate || body.end_date,
    reason: body.reason,
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
    const absenceType = text(body.absenceType) || "Urlaub";
    const startDate = validDate(body.startDate);
    const endDate = validDate(body.endDate);
    const reason = text(body.reason) || null;

    if (!startDate || !endDate) {
      return NextResponse.json({ ok: false, error: "Bitte Start- und Enddatum eintragen." }, { status: 400 });
    }

    if (new Date(`${endDate}T12:00:00`) < new Date(`${startDate}T12:00:00`)) {
      return NextResponse.json({ ok: false, error: "Das Enddatum darf nicht vor dem Startdatum liegen." }, { status: 400 });
    }

    // Krankmeldung oder Nachweis mit hochladen. Liegt geschützt, das Büro
    // bekommt beim Öffnen einen zeitlich begrenzten Link.
    const documentPaths: string[] = [];
    if (body.files.length) {
      await ensureBucket(auth.supabase);
      for (const file of body.files) {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: `${file.name} ist größer als 10 MB.` }, { status: 400 });
        }
        const path = [auth.profile.id, startDate, safeFileName(file.name)].join("/");
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await auth.supabase.storage
          .from(ABSENCE_BUCKET)
          .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        documentPaths.push(path);
      }
    }

    const payload = {
      employee_profile_id: auth.profile.id,
      employee_name: auth.profile.name,
      request_type: absenceType,
      absence_type: absenceType,
      start_date: startDate,
      end_date: endDate,
      reason,
      status: "open",
      document_paths: documentPaths.length ? documentPaths : null,
      document_count: documentPaths.length
    };

    const saved = await safeInsert(auth.supabase, "absence_requests", payload);

    const adminMessage = [
      `${auth.profile.name} hat ${absenceType} vom ${startDate} bis ${endDate} eingereicht.`,
      reason ? `Grund: ${reason}` : "",
      documentPaths.length ? `${documentPaths.length} Nachweis hochgeladen.` : ""
    ].filter(Boolean).join("\n");

    await auth.supabase.from("admin_notifications").insert({
      employee_name: auth.profile.name,
      title: "Abwesenheitsantrag",
      message: adminMessage,
      notification_type: "absence_request",
      status: "open",
      absence_request_id: saved.data?.id || null
    });

    return NextResponse.json({ ok: true, absence: saved.data, documents: documentPaths.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Abwesenheit konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
