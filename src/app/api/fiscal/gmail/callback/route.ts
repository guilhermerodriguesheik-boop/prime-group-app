import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, GmailOAuthError } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
/** Retorna apenas códigos de diagnóstico, nunca code/token/email ao navegador. */
export async function GET(req:Request){
  const url=new URL(req.url),state=url.searchParams.get("state")||"";
  const jar=await cookies(),stored=jar.get("prime_fiscal_gmail_oauth")?.value||"";
  jar.set("prime_fiscal_gmail_oauth","",{maxAge:0,path:"/api/fiscal/gmail"});
  const destination=new URL("/fiscal",url.origin);
  destination.searchParams.set("gmail","connection_failed");
  if(!state||!stored||state.length!==stored.length||!timingSafeEqual(Buffer.from(state),Buffer.from(stored))){
    destination.searchParams.set("reason","invalid_state");
    return NextResponse.redirect(destination);
  }
  const code=url.searchParams.get("code");
  if(!code||url.searchParams.has("error")){
    destination.searchParams.set("reason","not_authorized");
    return NextResponse.redirect(destination);
  }
  try{
    await exchangeAuthorizationCode(code);
    destination.searchParams.set("gmail","connected");
    destination.searchParams.delete("reason");
    return NextResponse.redirect(destination);
  }catch(error){
    const reason=error instanceof GmailOAuthError?error.code:"unexpected";
    console.warn("Prime Fiscal Gmail OAuth failed:",reason);
    destination.searchParams.set("reason",reason);
    return NextResponse.redirect(destination);
  }
}
