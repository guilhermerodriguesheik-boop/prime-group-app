import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processWhatsAppQueue } from "@/lib/whatsapp/worker";
import { runScheduledReminders } from "@/lib/whatsapp/scheduled-reminders";

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
    // Existing daily cron: 10:00 UTC (07:00 in Rio de Janeiro).
    let reminders:unknown;
    try{reminders=await runScheduledReminders();}
    catch(error){
      console.error("Scheduled reminders unavailable",error instanceof Error?error.message:"unknown");
      reminders={sent:0,error:"delivery_unavailable"};
    }
    const queue=await processWhatsAppQueue(2);
    return NextResponse.json({reminders,queue},{
      headers:{"Cache-Control":"no-store"},
    });
  } catch(error) {
    console.error("WhatsApp fallback queue failure",error instanceof Error?error.message:"unknown");
    return NextResponse.json({error:"WhatsApp worker unavailable"},{status:503});
  }
}
