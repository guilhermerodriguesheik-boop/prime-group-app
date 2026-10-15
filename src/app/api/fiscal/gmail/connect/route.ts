import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthorizationUrl, ownerWorkspace } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export async function GET(req:Request){
  try{
    await ownerWorkspace();
    const state=randomBytes(24).toString("hex");
    const redirect=NextResponse.redirect(googleAuthorizationUrl(state));
    redirect.cookies.set("prime_fiscal_gmail_oauth",state,{
      httpOnly:true,secure:true,sameSite:"lax",maxAge:600,path:"/api/fiscal/gmail"
    });
    // O cookie deve sair na MESMA resposta 302 de redirecionamento ao Google.
    return redirect;
  }catch{
    return NextResponse.redirect(new URL("/fiscal?gmail=setup_required",req.url));
  }
}
