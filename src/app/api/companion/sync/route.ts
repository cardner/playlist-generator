import { NextResponse } from "next/server";

const COMPANION_SYNC_URL = "http://127.0.0.1:8731/sync";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "application/json";
    const payload = await request.text();
    if (!payload) {
      return NextResponse.json(
        { error: "companion_payload_empty" },
        { status: 400 }
      );
    }
    const response = await fetch(COMPANION_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: payload,
    });
    const responseContentType = response.headers.get("content-type") || "";
    const body = responseContentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "companion_sync_failed",
          status: response.status,
          body,
        },
        { status: response.status }
      );
    }

    if (responseContentType.includes("application/json")) {
      return NextResponse.json(body);
    }

    return new NextResponse(typeof body === "string" ? body : String(body), {
      status: response.status,
      headers: { "Content-Type": responseContentType || "text/plain" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "companion_unreachable",
        message: error instanceof Error ? error.message : "Failed to reach companion app",
      },
      { status: 503 }
    );
  }
}
