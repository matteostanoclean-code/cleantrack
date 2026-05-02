import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const address = String(body.address || "").trim();

    if (!address) {
      return NextResponse.json({ error: "Adresse fehlt." }, { status: 400 });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", address);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CleanTrack/1.0 (admin@cleantrack.local)",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Geocoding fehlgeschlagen. Status: ${response.status}` },
        { status: 500 }
      );
    }

    const results = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    const first = results[0];

    if (!first?.lat || !first?.lon) {
      return NextResponse.json(
        { error: "Adresse wurde nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      latitude: Number(first.lat),
      longitude: Number(first.lon),
      displayName: first.display_name || address,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Serverfehler beim Ermitteln der GPS-Daten.",
      },
      { status: 500 }
    );
  }
}
