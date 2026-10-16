import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleAuthorizationUrl, ownerWorkspace } from "@/lib/fiscal/gmail";
export const runtime="nodejs";
export async function GET(req:Request){
  // OAuth state cookie and callback must share the exact same host.
  const canonical=process.env.APP_BASE_URL;
  if(canonical){
    const current=new URL(req.url);
    const expected=new URL(canonical);
    if(current.origin!==expected.origin){
      const destination=new URL("/api/fiscal/gmail/connect",expected.origin);
      return NextResponse.redirect(destination,{status:307});
    }
  }
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
