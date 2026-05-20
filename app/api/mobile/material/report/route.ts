import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrOne(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const materialProductId = text(body.materialProductId || body.material_product_id) || null;
    const workSiteId = text(body.workSiteId || body.work_site_id) || null;
    const workSiteName = text(body.workSiteName || body.work_site_name || body.object_name || body.site) || null;
    const quantity = numberOrOne(body.quantity || body.quantity_requested);
    const notes = text(body.notes || body.comment || body.message) || null;

    let materialName = text(body.materialName || body.material_name || body.product_name);
    let product: any = null;

    if (materialProductId) {
      const productResult = await auth.supabase.from("material_products").select("*").eq("id", materialProductId).maybeSingle();
      if (!productResult.error && productResult.data) product = productResult.data;
      materialName = materialName || product?.name || product?.product_name || "Material";
    }

    if (!materialName) {
      return NextResponse.json({ ok: false, error: "Bitte Material auswählen oder eintragen." }, { status: 400 });
    }

    const objectName = workSiteName || product?.object_name || product?.site || "Ohne Objekt";
    const adminMessage = `${auth.profile.name} meldet Materialbedarf: ${quantity} x ${materialName} bei ${objectName}.`;

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
      title: "Materialmeldung",
      message: adminMessage,
      notification_type: "material_report",
      status: "open",
      work_site_id: workSiteId || product?.work_site_id || null,
      object_name: objectName,
      material_product_id: materialProductId,
      material_name: materialName
    });

    return NextResponse.json({ ok: true, report: insert.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Materialmeldung konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
