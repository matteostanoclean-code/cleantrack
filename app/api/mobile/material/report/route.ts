import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const MATERIAL_BUCKET = "material-photos";

type AnyRow = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrOne(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function nullableUuid(value: unknown) {
  const current = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(current) ? current : null;
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? name.split(".").pop() : "jpg";
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${String(extension || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg"}`;
}

async function ensureMaterialBucket(supabase: AnyRow) {
  try {
    const { error } = await supabase.storage.createBucket(MATERIAL_BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("material bucket create warning:", error.message);
    }
  } catch (error) {
    console.warn("material bucket create failed:", error);
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      materialProductId: form.get("materialProductId") || form.get("material_product_id"),
      workSiteId: form.get("workSiteId") || form.get("work_site_id"),
      workSiteName: form.get("workSiteName") || form.get("work_site_name") || form.get("object_name") || form.get("site"),
      materialName: form.get("materialName") || form.get("material_name") || form.get("product_name"),
      quantity: form.get("quantity") || form.get("quantity_requested"),
      notes: form.get("notes") || form.get("comment") || form.get("message"),
      files: form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0).slice(0, 6)
    };
  }

  const body = (await request.json()) as AnyRow;
  return {
    materialProductId: body.materialProductId || body.material_product_id,
    workSiteId: body.workSiteId || body.work_site_id,
    workSiteName: body.workSiteName || body.work_site_name || body.object_name || body.site,
    materialName: body.materialName || body.material_name || body.product_name,
    quantity: body.quantity || body.quantity_requested,
    notes: body.notes || body.comment || body.message,
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
    const materialProductId = nullableUuid(body.materialProductId);
    const workSiteId = nullableUuid(body.workSiteId);
    const workSiteName = text(body.workSiteName) || null;
    const quantity = numberOrOne(body.quantity);
    const notes = text(body.notes) || null;

    let materialName = text(body.materialName);
    let product: AnyRow | null = null;

    if (materialProductId) {
      const productResult = await auth.supabase.from("material_products").select("*").eq("id", materialProductId).maybeSingle();
      if (!productResult.error && productResult.data) product = productResult.data;
      materialName = materialName || product?.name || product?.product_name || "Material";
    }

    if (!materialName) {
      return NextResponse.json({ ok: false, error: "Bitte Material auswählen oder eintragen." }, { status: 400 });
    }

    const objectName = workSiteName || product?.object_name || product?.site || "Ohne Objekt";
    const photoUrls: string[] = [];

    if (body.files.length) {
      await ensureMaterialBucket(auth.supabase);
      for (const file of body.files) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) {
          return NextResponse.json({ ok: false, error: `Foto ${file.name} ist größer als 8 MB.` }, { status: 400 });
        }
        const path = [
          auth.profile.id,
          new Date().toISOString().slice(0, 10),
          materialProductId || "freies-material",
          safeFileName(file.name)
        ].join("/");
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await auth.supabase.storage
          .from(MATERIAL_BUCKET)
          .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        const { data: publicData } = auth.supabase.storage.from(MATERIAL_BUCKET).getPublicUrl(path);
        if (publicData?.publicUrl) photoUrls.push(publicData.publicUrl);
      }
    }

    const adminMessage = [
      `${auth.profile.name} meldet Materialbedarf: ${quantity} x ${materialName} bei ${objectName}.`,
      notes ? `Notiz: ${notes}` : "",
      photoUrls.length ? `Fotos: ${photoUrls.length}` : ""
    ].filter(Boolean).join("\n");

    const fullPayload = {
      employee_name: auth.profile.name,
      employee_profile_id: auth.profile.id,
      material_id: materialProductId,
      material_product_id: materialProductId,
      material_name: materialName,
      product_name: materialName,
      work_site_id: workSiteId || product?.work_site_id || null,
      object_name: objectName,
      site: objectName,
      quantity,
      quantity_requested: quantity,
      message: adminMessage,
      comment: notes,
      notes,
      status: "open",
      photo_urls: photoUrls,
      photo_count: photoUrls.length,
      created_at: new Date().toISOString()
    };

    let insert = await auth.supabase.from("material_reports").insert(fullPayload).select("*").maybeSingle();

    if (insert.error) {
      const fallbackPayload = {
        employee_name: auth.profile.name,
        material_id: materialProductId,
        material_name: materialName,
        product_name: materialName,
        work_site_id: workSiteId || product?.work_site_id || null,
        object_name: objectName,
        site: objectName,
        quantity,
        message: adminMessage,
        comment: notes,
        status: "open",
        created_at: new Date().toISOString()
      };
      insert = await auth.supabase.from("material_reports").insert(fallbackPayload).select("*").maybeSingle();
    }

    if (insert.error) throw new Error(insert.error.message);

    await auth.supabase.from("admin_notifications").insert({
      employee_name: auth.profile.name,
      title: photoUrls.length ? "Materialmeldung mit Foto" : "Materialmeldung",
      message: adminMessage,
      notification_type: "material_report",
      status: "open",
      work_site_id: workSiteId || product?.work_site_id || null,
      object_name: objectName,
      material_product_id: materialProductId,
      material_name: materialName,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, report: insert.data, photoUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Materialmeldung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
