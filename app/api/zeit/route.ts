import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Die Uhrzeit des Servers.
 *
 * Die Kamera in der App schreibt die Aufnahmezeit ins Foto. Nähme sie dafür
 * die Uhr des Handys, ließe sich die Zeit mit zwei Fingertipps in den
 * Einstellungen verstellen — und das Foto bewiese nichts mehr. Deshalb fragt
 * die Kamera beim Öffnen hier nach und rechnet die Abweichung heraus.
 *
 * Ohne Anmeldung, weil die Uhrzeit kein Geheimnis ist.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, jetzt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
