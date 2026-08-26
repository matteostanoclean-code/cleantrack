import { NextResponse } from "next/server";
import { getAuthenticatedMobileProfile } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const BUCKET = "material-photos";

/**
 * Bild für einen Artikel hochladen.
 *
 * Das Bild landet im öffentlichen Ablagefach für Materialfotos, zurück kommt
 * die Adresse. Die wird beim Artikel gespeichert und im Bestellblatt gezeigt.
 *
 * Vorher gab es beim Artikel nur ein Feld für eine Adresse. Wer am Handy ein
 * Foto vom Regal machen will, kommt damit nicht weit.
 */
async function ablageSicherstellen(supabase: any) {
  try {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      console.warn("Ablagefach anlegen:", error.message);
    }
  } catch (fehler) {
    console.warn("Ablagefach anlegen fehlgeschlagen:", fehler);
  }
}

function dateiname(name: string) {
  const endung = (name.includes(".") ? name.split(".").pop() : "jpg") || "jpg";
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${endung.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "jpg"}`;
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedMobileProfile(request);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    if (!auth.isAdmin) return NextResponse.json({ ok: false, error: "Nur das Büro darf Artikelbilder ändern." }, { status: 403 });

    const form = await request.formData();
    const datei = form.get("bild");
    if (!(datei instanceof File) || !datei.size) {
      return NextResponse.json({ ok: false, error: "Kein Bild empfangen." }, { status: 400 });
    }
    if (!datei.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "Das ist kein Bild." }, { status: 400 });
    }
    if (datei.size > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Das Bild ist größer als 8 MB." }, { status: 400 });
    }

    await ablageSicherstellen(auth.supabase);

    const pfad = `artikel/${dateiname(datei.name)}`;
    const puffer = Buffer.from(await datei.arrayBuffer());
    const { error } = await auth.supabase.storage
      .from(BUCKET)
      .upload(pfad, puffer, { contentType: datei.type || "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);

    const { data } = auth.supabase.storage.from(BUCKET).getPublicUrl(pfad);
    if (!data?.publicUrl) throw new Error("Adresse zum Bild konnte nicht gebildet werden.");

    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Bild konnte nicht hochgeladen werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
