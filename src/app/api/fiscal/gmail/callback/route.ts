import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export async function GET(req:Request){
  const url=new URL(req.url),state=url.searchParams.get("state")||"";
  const jar=await cookies(),stored=jar.get("prime_fiscal_gmail_oauth")?.value||"";
  jar.delete("prime_fiscal_gmail_oauth");
  if(!state||!stored||state.length!==stored.length||!timingSafeEqual(Buffer.from(state),Buffer.from(stored))){
    return NextResponse.redirect(new URL("/fiscal?gmail=invalid_state",url.origin));
  }
  const code=url.searchParams.get("code");
  if(!code||url.searchParams.has("error"))return NextResponse.redirect(new URL("/fiscal?gmail=not_authorized",url.origin));
  try{
    await exchangeAuthorizationCode(code);
    return NextResponse.redirect(new URL("/fiscal?gmail=connected",url.origin));
  }catch{
    return NextResponse.redirect(new URL("/fiscal?gmail=connection_failed",url.origin));
  }
}
