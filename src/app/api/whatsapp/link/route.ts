import { createHash, randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

async function authenticate() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authenticate();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { data, error } = await supabase.from("whatsapp_pairings")
    .select("phone_number,connected_at,pending_until,enabled")
    .eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível consultar o vínculo." }, { status: 500 });
  return NextResponse.json({
    linked: Boolean(data?.phone_number && data.enabled),
    maskedPhone: data?.phone_number ? "••••" + data.phone_number.slice(-4) : null,
    connectedAt: data?.connected_at ?? null,
    pendingUntil: data?.pending_until ?? null,
    provider: process.env.WHATSAPP_PROVIDER === "evolution_go" ? "evolution_go" :
      process.env.WHATSAPP_PROVIDER === "evolution" ? "evolution" : "meta",
    providerConfigured: process.env.WHATSAPP_PROVIDER === "evolution_go" ?
      Boolean(process.env.EVOLUTION_GO_API_URL && (process.env.EVOLUTION_GO_TOKEN||"").length>=32 &&
        process.env.EVOLUTION_GO_INSTANCE_NAME) :
      process.env.WHATSAPP_PROVIDER === "evolution" ?
      Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY &&
        process.env.EVOLUTION_INSTANCE && (process.env.EVOLUTION_WEBHOOK_SECRET||"").length>=32) :
      Boolean(process.env.META_WHATSAPP_APP_SECRET &&
        process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID),
  }, { headers: noStore });
}

export async function POST() {
  const { supabase, user } = await authenticate();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const ingress = process.env.WHATSAPP_INGRESS_SECRET;
  if (!ingress || ingress.length < 24) {
    return NextResponse.json({ error: "Integração WhatsApp ainda não foi configurada." }, { status: 503 });
  }
  const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
  const hash = createHash("sha256").update(code + ":" + ingress).digest("hex");
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from("whatsapp_pairings").upsert({
    user_id: user.id,
    pending_code_hash: hash,
    pending_until: expires,
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Não foi possível gerar um código de vínculo." }, { status: 500 });
  return NextResponse.json({
    code,
    expiresAt: expires,
    instruction: "Envie VINCULAR " + code +
      (process.env.WHATSAPP_PROVIDER==="evolution_go" ?
        " de outro número WhatsApp para o número conectado no What's Evolution Go." :
        process.env.WHATSAPP_PROVIDER==="evolution" ?
        " pelo seu WhatsApp para o número conectado via QR Code." :
        " pelo seu WhatsApp para o número comercial cadastrado na Meta.") +
      " Esse código dura 15 minutos.",
  }, { headers: noStore });
}

export async function DELETE() {
  const { supabase, user } = await authenticate();
  if (!user) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  const { error } = await supabase.from("whatsapp_pairings").update({
    phone_number: null, connected_at: null, pending_code_hash: null,
    pending_until: null, enabled: false, updated_at: new Date().toISOString(),
  }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Não foi possível desvincular." }, { status: 500 });
  return NextResponse.json({ unlinked: true }, { headers: noStore });
}
