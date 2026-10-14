import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processWhatsAppQueue } from "@/lib/whatsapp/worker";
import { runScheduledReminders } from "@/lib/whatsapp/scheduled-reminders";
import { runPrimeDailyJobs } from "@/lib/whatsapp/prime-automations";

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
    // Runs daily in Brazil; fresh bank events also trigger notifications via verified Pluggy webhook.
    let automations:unknown;
    try{automations=await runPrimeDailyJobs();}
    catch(error){console.error("Prime automation batch unavailable",error instanceof Error?error.message:"unknown");automations={error:"automation_unavailable"};}
    let reminders:unknown;
    try{reminders=await runScheduledReminders();}
    catch(error){
      console.error("Scheduled reminders unavailable",error instanceof Error?error.message:"unknown");
      reminders={sent:0,error:"delivery_unavailable"};
    }
    const queue=await processWhatsAppQueue(2);
    return NextResponse.json({automations,reminders,queue},{
      headers:{"Cache-Control":"no-store"},
    });
  } catch(error) {
    console.error("WhatsApp fallback queue failure",error instanceof Error?error.message:"unknown");
    return NextResponse.json({error:"WhatsApp worker unavailable"},{status:503});
  }
}
