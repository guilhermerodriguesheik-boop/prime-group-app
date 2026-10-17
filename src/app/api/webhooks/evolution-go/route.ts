import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { processWhatsAppQueue } from "@/lib/whatsapp/worker";
import {parseEvolutionBankButtonClick,readEvolutionGoBankReply} from "@/lib/banks/interactive-bank-buttons";

export const runtime = "nodejs";
export const maxDuration = 60;

// Evolution GO emits instanceToken in its event envelope (not an HMAC header).
// Check that token before accepting the event, and separately verify account
// ownership with the existing one-time WhatsApp pairing mechanism.
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject : {};
}
function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
function equals(a: string, b: string) {
  if (a.length < 32 || b.length !== a.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function POST(request: Request) {
  const token = process.env.EVOLUTION_GO_TOKEN || "";
  const instance = process.env.EVOLUTION_GO_INSTANCE_NAME || "";
  const ingress = process.env.WHATSAPP_INGRESS_SECRET || "";
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (process.env.WHATSAPP_PROVIDER !== "evolution_go" || token.length < 32 ||
      !instance || ingress.length < 24 || !baseUrl || !key) {
    return NextResponse.json({ error:"Integração Evolution Go não configurada." }, {status:503});
  }
  if (Number(request.headers.get("content-length")||"0") > 1_000_000) {
    return NextResponse.json({error:"Evento muito grande."},{status:413});
  }
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({error:"Evento muito grande."},{status:413});
  let input: JsonObject;
  try { input = object(JSON.parse(raw)); }
  catch { return NextResponse.json({error:"JSON inválido."},{status:400}); }
  if (!equals(string(input.instanceToken), token)) {
    return NextResponse.json({error:"Evento não autorizado."},{status:401});
  }
  if (string(input.instanceName || input.instance) !== instance) {
    return NextResponse.json({error:"Instância não autorizada."},{status:403});
  }
  const event = string(input.event).toLowerCase().replace(/[_\s.-]/g,"");
  if(event==="buttonclick"){
    const click=parseEvolutionBankButtonClick(input.data);
    if(!click)return NextResponse.json({received:true,messages:0});
    const payload={
      entry:[{changes:[{value:{metadata:{phone_number_id:"evolution_go:"+instance}}}]}],
      __evolutionGoButton:{buttonId:click.buttonId}
    };
    const response=await fetch(baseUrl.replace(/\/$/,"")+"/rest/v1/rpc/ingest_whatsapp_event",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(15000),
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({
        p_ingress_secret:ingress,
        p_provider_message_id:"evolution-go:"+instance+":button:"+click.messageId+":"+click.buttonId,
        p_from_number:click.sender,
        p_to_number:process.env.EVOLUTION_GO_PHONE_NUMBER||null,
        p_message_type:"interactive",
        p_body:click.buttonId,p_media_id:null,p_payload:payload,
      })
    });
    if(!response.ok){
      console.error("Evolution Go bank button queue failed",response.status);
      return NextResponse.json({error:"Falha na fila do botão."},{status:502});
    }
    after(async()=>{try{await processWhatsAppQueue(2);}
      catch(error){console.error("Bank button processing unavailable",
        error instanceof Error?error.message:"unknown");}});
    return NextResponse.json({received:true,buttons:1});
  }
  if (event !== "message" && event !== "messagesupsert") {
    return NextResponse.json({received:true,messages:0});
  }

  const data = object(input.data);
  const info = object(data.Info || data.info);
  const legacyKey = object(data.key);
  const isFromMe = info.IsFromMe === true || legacyKey.fromMe === true;
  const isGroup = info.IsGroup === true;
  const senderJid = string(info.Sender || legacyKey.remoteJid);
  const chatJid = string(info.Chat || legacyKey.remoteJid);
  if (isFromMe || isGroup || /@(g\.us|broadcast|newsletter)$/.test(chatJid)) {
    return NextResponse.json({received:true,messages:0});
  }
  // Reject @lid identities rather than attributing events to a guessed owner.
  if (!/@s\.whatsapp\.net$/.test(senderJid) || !/@s\.whatsapp\.net$/.test(chatJid)) {
    return NextResponse.json({received:true,messages:0});
  }
  const sender = senderJid.split("@")[0].replace(/\D/g,"");
  const messageId = string(info.ID || legacyKey.id);
  if (!/^[0-9]{10,15}$/.test(sender) || !/^[a-zA-Z0-9_-]{8,150}$/.test(messageId)) {
    return NextResponse.json({received:true,messages:0});
  }
  const message = object(data.Message || data.message);
  const extended = object(message.extendedTextMessage);
  const image = object(message.imageMessage);
  const document = object(message.documentMessage);
  const withCaption = object(object(message.documentWithCaptionMessage).message);
  const captionDoc = object(withCaption.documentMessage);
  const audio = object(message.audioMessage);
  // Real Go v1 carousel taps arrive as Message.templateButtonReplyMessage,
  // not as ButtonClick. Mark those verified quick replies as interactive.
  const bankReplyId = readEvolutionGoBankReply(message);
  const type = bankReplyId ? "interactive" : Object.keys(audio).length ? "audio" : Object.keys(image).length ? "image" :
    (Object.keys(document).length || Object.keys(captionDoc).length) ? "document" : "text";
  const body = bankReplyId || string(message.conversation || extended.text || image.caption ||
    document.caption || captionDoc.caption || document.fileName || captionDoc.fileName) || null;

  // This payload is only visible to the server-side worker and private event queue.
  // No token is stored with event JSON.
  const payload = {
    entry:[{changes:[{value:{metadata:{phone_number_id:"evolution_go:"+instance}}}]}],
    __evolutionGo:{ message, instance },
    ...(bankReplyId ? {__evolutionGoButton:{buttonId:bankReplyId}} : {}),
  };

  let response: Response;
  try {
    response = await fetch(baseUrl.replace(/\/$/,"")+"/rest/v1/rpc/ingest_whatsapp_event",{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(15000),
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify({
        p_ingress_secret:ingress,
        p_provider_message_id:"evolution-go:"+instance+":"+messageId,
        p_from_number:sender,
        p_to_number:process.env.EVOLUTION_GO_PHONE_NUMBER || null,
        p_message_type:type,
        p_body:body?.slice(0,8000) ?? null,
        p_media_id:type==="audio"||type==="image"||type==="document" ? messageId : null,
        p_payload:payload,
      }),
    });
  } catch {
    return NextResponse.json({error:"Fila indisponível."},{status:502});
  }
  if (!response.ok) {
    console.error("Evolution Go queue failed",response.status);
    return NextResponse.json({error:"Falha na fila."},{status:502});
  }
  {
    after(async () => {
      // Drain one older retry plus the newly received message without waiting for cron.
      try { await processWhatsAppQueue(2); }
      catch (e) { console.error("Evolution Go queue error",e instanceof Error?e.message:"unknown"); }
    });
  }
  return NextResponse.json({received:true,messages:1});
}
