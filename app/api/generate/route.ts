import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const generatorUrl = process.env.GENERATOR_API_URL;
  if (!generatorUrl) {
    return NextResponse.json(
      { error: "El servicio local de generación todavía no está conectado." },
      { status: 503 },
    );
  }

  const response = await fetch(`${generatorUrl.replace(/\/$/, "")}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
