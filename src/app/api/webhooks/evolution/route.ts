import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { processWhatsAppQueue } from "@/lib/whatsapp/worker";

// Alternative inbound channel: Evolution API v2 / Baileys (QR pairing).
// An independently configured secret MUST be sent as a custom webhook header.
// Never accept anonymous webhooks, and never trust the sender's claimed identity
// until the existing temporary-code pairing RPC has authenticated that number.
export const runtime = "nodejs";
export const maxDuration = 60;

type JsonObject = Record<string, unknown>;
type EvolutionMessage = {
  key?: { id?: string; remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
    documentMessage?: { caption?: string; fileName?: string };
    audioMessage?: JsonObject;
    documentWithCaptionMessage?: { message?: { documentMessage?: { caption?: string; fileName?: string } } };
    ephemeralMessage?: { message?: EvolutionMessage["message"] };
  };
  messageType?: string;
};
type EvolutionWebhook = {
  event?: string; instance?: string; data?: EvolutionMessage;
};

function authorized(header: string | null, expected: string) {
  const supplied = (header || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return expected.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}

function normalizeMessageType(message: NonNullable<EvolutionMessage["message"]>) {
  if (message.audioMessage) return "audio";
  if (message.imageMessage) return "image";
  if (message.documentMessage || message.documentWithCaptionMessage) return "document";
  if (message.videoMessage) return "video";
  return "text";
}

export async function POST(request: Request) {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET || "";
  const ingress = process.env.WHATSAPP_INGRESS_SECRET || "";
  const instance = process.env.EVOLUTION_INSTANCE || "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (process.env.WHATSAPP_PROVIDER !== "evolution" || !instance || ingress.length < 24 ||
      !supabaseUrl || !apiKey || expected.length < 32) {
    return NextResponse.json({ error:"Canal Evolution não configurado." }, {status:503});
  }
  if (!authorized(request.headers.get("x-prime-webhook-secret") ||
                  request.headers.get("authorization"), expected)) {
    return NextResponse.json({error:"Não autorizado."},{status:401});
  }
  if (Number(request.headers.get("content-length") || 0) > 1_000_000) {
    return NextResponse.json({error:"Mensagem muito grande."},{status:413});
  }
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({error:"Mensagem muito grande."},{status:413});
  let payload: EvolutionWebhook;
  try {
    payload = JSON.parse(raw) as EvolutionWebhook;
  } catch {
    return NextResponse.json({error:"JSON inválido."},{status:400});
  }
  if (!payload || typeof payload !== "object" ||
      typeof payload.event !== "string" || typeof payload.instance !== "string") {
    return NextResponse.json({error:"Evento inválido."},{status:400});
  }
  if (payload.instance !== instance) {
    return NextResponse.json({error:"Instância divergente."},{status:403});
  }
  if (payload.event.toLowerCase().replace(/_/g,".") !== "messages.upsert") {
    return NextResponse.json({received:true,messages:0});
  }
  const data = payload.data;
  const key = data?.key;
  if (!key || key.fromMe || !key.id || !data?.message) {
    return NextResponse.json({received:true,messages:0});
  }
  // Never pair groups, status broadcasts or anonymous LID-only JIDs.
  const remote = [key.remoteJid, key.remoteJidAlt].find(jid=>
    typeof jid === "string" && /@s\.whatsapp\.net$/.test(jid)) || "";
  const sender = remote.split("@")[0].replace(/\D/g,"");
  if (!/^[0-9]{10,15}$/.test(sender)) return NextResponse.json({received:true,messages:0});
  const message = data.message.ephemeralMessage?.message || data.message;
  const type = normalizeMessageType(message);
  const doc = message.documentMessage || message.documentWithCaptionMessage?.message?.documentMessage;
  const body = (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    doc?.caption ||
    doc?.fileName ||
    null
  );
  // The worker can reuse the existing owner-scoped Supabase queue and code pairing.
  // The raw Evolution message is stored only inside the restricted event queue
  // for authenticated, on-demand media retrieval (not in browser state).
  const storedPayload = {
    entry:[{changes:[{value:{metadata:{phone_number_id:"evolution:"+instance}}}]}],
    __evolution:{instance,data},
  };
  let response: Response;
  try {
    response = await fetch(supabaseUrl.replace(/\/$/,"")+"/rest/v1/rpc/ingest_whatsapp_event",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(15000),
      headers:{apikey:apiKey,Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        p_ingress_secret:ingress,
        p_provider_message_id:"evolution:"+instance+":"+key.id,
        p_from_number:sender,
        p_to_number:process.env.EVOLUTION_PHONE_NUMBER || process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || null,
        p_message_type:type,
        p_body:typeof body === "string" ? body.slice(0,8000) : null,
        p_media_id:type !== "text" ? key.id : null,
        p_payload:storedPayload,
      }),
    });
  } catch {
    return NextResponse.json({error:"Fila temporariamente indisponível."},{status:502});
  }
  if (!response.ok) {
    console.error("Evolution ingest HTTP",response.status);
    return NextResponse.json({error:"Falha ao salvar mensagem."},{status:502});
  }
  if (process.env.OPENAI_API_KEY && process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY) {
    after(async()=>{
      try { await processWhatsAppQueue(1); }
      catch(err) { console.error("Evolution worker error",err instanceof Error?err.message:"unknown"); }
    });
  }
  return NextResponse.json({received:true,messages:1});
}
