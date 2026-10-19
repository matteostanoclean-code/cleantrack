import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { kundeZumToken } from "@/lib/portal";

export const dynamic = "force-dynamic";

const BUCKET = "material-photos";
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Bild zu einer Reklamation hochladen.
 *
 * Erlaubt ist das nur mit gültigem Portal-Link, und nur für Bilder. Ohne
 * diese beiden Grenzen wäre das ein offener Briefkasten, in den jeder alles
 * legen kann.
 *
 * Der Name der Datei wird nicht übernommen, sondern neu vergeben: ein
 * Dateiname aus fremder Hand hat im Speicherpfad nichts zu suchen.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const kunde = await kundeZumToken(token);
    if (!kunde) return NextResponse.json({ ok: false, error: "Dieser Zugang ist nicht gültig." }, { status: 404 });

    const daten = await request.formData();
    const datei = daten.get("bild");
    if (!(datei instanceof File)) return NextResponse.json({ ok: false, error: "Es kam kein Bild an." }, { status: 400 });

    const typ = String(datei.type || "");
    if (!typ.startsWith("image/")) return NextResponse.json({ ok: false, error: "Nur Bilder, bitte." }, { status: 400 });
    if (datei.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Das Bild ist zu groß. Bitte ein kleineres wählen." }, { status: 413 });
    }

    const supabase = getSupabaseAdmin();
    const endung = typ === "image/png" ? "png" : typ === "image/webp" ? "webp" : "jpg";
    const pfad = `reklamationen/${kunde.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${endung}`;

    const puffer = Buffer.from(await datei.arrayBuffer());
    const hochgeladen = await supabase.storage.from(BUCKET).upload(pfad, puffer, {
      contentType: typ || "image/jpeg",
      upsert: false
    });
    if (hochgeladen.error) throw new Error(hochgeladen.error.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(pfad);
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : "Das Bild konnte nicht gespeichert werden.";
    return NextResponse.json({ ok: false, error: text }, { status: 500 });
  }
}
