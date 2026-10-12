import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processWhatsAppQueue } from "@/lib/whatsapp/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer /,"") || "";
  if (!expected || expected.length < 24 || actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual),Buffer.from(expected))) {
    return NextResponse.json({error:"Unauthorized"},{status:401});
  }
  try {
    return NextResponse.json(await processWhatsAppQueue(1),{
      headers:{"Cache-Control":"no-store"},
    });
  } catch(error) {
    console.error("WhatsApp fallback queue failure",error instanceof Error?error.message:"unknown");
    return NextResponse.json({error:"WhatsApp worker unavailable"},{status:503});
  }
}
