import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = String(searchParams.get("address") || "").trim();

    if (!address) {
      return NextResponse.json(
        { error: "Adresse fehlt." },
        { status: 400 }
      );
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(
      address
    )}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "CleanTrack/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Geocoding fehlgeschlagen. Status: ${response.status}` },
        { status: 500 }
      );
    }

    const data = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    const first = data[0];

    if (!first?.lat || !first?.lon) {
      return NextResponse.json(
        { error: "Adresse wurde nicht gefunden." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
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
            : "Adresse konnte nicht geprüft werden.",
      },
      { status: 500 }
    );
  }
}
