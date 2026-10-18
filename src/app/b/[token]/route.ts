import {NextResponse} from "next/server";
import {compactBankActionTarget} from "@/lib/banks/whatsapp-action-link";

export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Query-free short bank URL used only by a linked WhatsApp owner.
 * GET redirects to the same previously tested signed UI; POST there requires
 * an explicit user click and changes only classification, never payments.
 */
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const key=process.env.WHATSAPP_INGRESS_SECRET||"";
 const canonical=process.env.PRIME_FINANCE_PUBLIC_URL||
  (process.env.APP_BASE_URL?.startsWith("https://")?process.env.APP_BASE_URL:
   "https://prime-finance-ochre.vercel.app");
 const target=compactBankActionTarget(token,canonical,key);
 if(!target)return new Response("Link inválido ou expirado.",{
  status:404,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}
 });
 return NextResponse.redirect(target,{
  status:307,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}
 });
}
