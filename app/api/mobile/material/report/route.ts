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

type OrderItem = { productId: string | null; name: string; quantity: number };

/** Nimmt sowohl eine einzelne Meldung als auch eine Bestellung mit mehreren Artikeln entgegen. */
function parseItems(raw: unknown): OrderItem[] {
  let list: AnyRow[] = [];
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  } else if (Array.isArray(raw)) {
    list = raw as AnyRow[];
  }

  return list
    .map((item) => ({
      productId: nullableUuid(item.productId || item.material_product_id || item.id),
      name: text(item.name || item.material_name || item.product_name),
      quantity: numberOrOne(item.quantity)
    }))
    .filter((item) => item.productId || item.name);
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
      items: parseItems(form.get("items")),
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
    items: parseItems(body.items),
    files: [] as File[]
  };
}

/**
 * Eigene Bestellung abschließen.
 *
 * Der Mitarbeiter darf nur seine eigenen Meldungen schließen, Admins alle.
 * Eine Bestellung besteht aus mehreren Zeilen (eine je Artikel), deshalb
 * kommen mehrere IDs auf einmal.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = (await request.json()) as AnyRow;
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((value: unknown) => text(value)).filter(Boolean);
    if (!ids.length) return NextResponse.json({ ok: false, error: "Keine Bestellung angegeben." }, { status: 400 });

    const status = text(body.status).toLowerCase() === "open" ? "open" : "done";

    const existing = await auth.supabase.from("material_reports").select("id, employee_name").in("id", ids);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data?.length) return NextResponse.json({ ok: false, error: "Bestellung wurde nicht gefunden." }, { status: 404 });

    if (!auth.isAdmin) {
      const foreign = existing.data.some((row: AnyRow) => text(row.employee_name).toLowerCase() !== text(auth.profile.name).toLowerCase());
      if (foreign) return NextResponse.json({ ok: false, error: "Das ist nicht deine Bestellung." }, { status: 403 });
    }

    const update = await auth.supabase.from("material_reports").update({ status }).in("id", ids).select("id");
    if (update.error) throw new Error(update.error.message);

    return NextResponse.json({ ok: true, updated: update.data?.length || 0, status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bestellung konnte nicht geändert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await parseBody(request);
    const workSiteId = nullableUuid(body.workSiteId);
    const workSiteName = text(body.workSiteName) || null;
    const notes = text(body.notes) || null;

    const requestedItems: OrderItem[] = body.items.length
      ? body.items
      : [{ productId: nullableUuid(body.materialProductId), name: text(body.materialName), quantity: numberOrOne(body.quantity) }];

    const usableItems = requestedItems.filter((item) => item.productId || item.name);
    if (!usableItems.length) {
      return NextResponse.json({ ok: false, error: "Bitte mindestens einen Artikel auswählen oder eintragen." }, { status: 400 });
    }

    const productIds = usableItems.map((item) => item.productId).filter(Boolean) as string[];
    const productsById = new Map<string, AnyRow>();
    if (productIds.length) {
      const productResult = await auth.supabase.from("material_products").select("*").in("id", productIds);
      if (!productResult.error) {
        for (const product of productResult.data || []) productsById.set(product.id, product);
      }
    }

    const lines = usableItems.map((item) => {
      const product = item.productId ? productsById.get(item.productId) || null : null;
      return {
        productId: item.productId,
        quantity: item.quantity,
        product,
        name: item.name || product?.name || product?.product_name || "Material"
      };
    });

    const firstProduct = lines.find((line) => line.product)?.product || null;
    const objectName = workSiteName || firstProduct?.object_name || firstProduct?.site || "Ohne Objekt";
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
          lines[0].productId || "freies-material",
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

    const summary = lines.map((line) => `${line.quantity} x ${line.name}`).join(", ");
    const adminMessage = [
      `${auth.profile.name} meldet Materialbedarf bei ${objectName}: ${summary}.`,
      notes ? `Notiz: ${notes}` : "",
      photoUrls.length ? `Fotos: ${photoUrls.length}` : ""
    ].filter(Boolean).join("\n");

    const createdAt = new Date().toISOString();
    const reports: AnyRow[] = [];

    for (const line of lines) {
      const fullPayload = {
        employee_name: auth.profile.name,
        employee_profile_id: auth.profile.id,
        material_id: line.productId,
        material_product_id: line.productId,
        material_name: line.name,
        product_name: line.name,
        work_site_id: workSiteId || line.product?.work_site_id || null,
        object_name: objectName,
        site: objectName,
        quantity: line.quantity,
        quantity_requested: line.quantity,
        message: adminMessage,
        comment: notes,
        notes,
        status: "open",
        photo_urls: photoUrls,
        photo_count: photoUrls.length,
        created_at: createdAt
      };

      let insert = await auth.supabase.from("material_reports").insert(fullPayload).select("*").maybeSingle();

      if (insert.error) {
        const fallbackPayload = {
          employee_name: auth.profile.name,
          material_id: line.productId,
          material_name: line.name,
          product_name: line.name,
          work_site_id: workSiteId || line.product?.work_site_id || null,
          object_name: objectName,
          site: objectName,
          quantity: line.quantity,
          message: adminMessage,
          comment: notes,
          status: "open",
          created_at: createdAt
        };
        insert = await auth.supabase.from("material_reports").insert(fallbackPayload).select("*").maybeSingle();
      }

      if (insert.error) throw new Error(insert.error.message);
      reports.push(insert.data);
    }

    await auth.supabase.from("admin_notifications").insert({
      employee_name: auth.profile.name,
      title: photoUrls.length ? "Materialbestellung mit Foto" : "Materialbestellung",
      message: adminMessage,
      notification_type: "material_report",
      status: "open",
      work_site_id: workSiteId || firstProduct?.work_site_id || null,
      object_name: objectName,
      material_product_id: lines[0].productId,
      material_name: lines.length > 1 ? summary : lines[0].name,
      created_at: createdAt
    });

    return NextResponse.json({ ok: true, report: reports[0], reports, photoUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Materialmeldung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
