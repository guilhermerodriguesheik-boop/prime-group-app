import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function validMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const received = Buffer.from(signatureHeader.slice(7), "hex");
  const expected = Buffer.from(
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex"),
    "hex",
  );

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    token &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET;
  const ingressSecret = process.env.WHATSAPP_INGRESS_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!appSecret || !ingressSecret || !supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: "WhatsApp integration is awaiting Meta credentials." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();

  if (!validMetaSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { display_phone_number?: string };
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            image?: { id?: string; caption?: string };
            document?: { id?: string; caption?: string; filename?: string };
            audio?: { id?: string };
          }>;
        };
      }>;
    }>;
  };

  const writes: Promise<Response>[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const message of value?.messages ?? []) {
        if (!message.id) continue;

        const mediaId = message.image?.id || message.document?.id || message.audio?.id || null;
        const body =
          message.text?.body ||
          message.image?.caption ||
          message.document?.caption ||
          message.document?.filename ||
          null;

        writes.push(
          fetch(`${supabaseUrl}/rest/v1/rpc/ingest_whatsapp_event`, {
            method: "POST",
            headers: {
              apikey: publishableKey,
              Authorization: `Bearer ${publishableKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_ingress_secret: ingressSecret,
              p_provider_message_id: message.id,
              p_from_number: message.from ?? null,
              p_to_number: value?.metadata?.display_phone_number ?? process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? null,
              p_message_type: message.type ?? null,
              p_body: body,
              p_media_id: mediaId,
              p_payload: payload,
            }),
          }),
        );
      }
    }
  }

  const results = await Promise.all(writes);
  const failed = results.find((result) => !result.ok);

  if (failed) {
    console.error("WhatsApp Supabase ingest failed", failed.status, await failed.text());
    return NextResponse.json({ error: "Event persistence failed." }, { status: 502 });
  }

  return NextResponse.json({ received: true, messages: results.length });
}
