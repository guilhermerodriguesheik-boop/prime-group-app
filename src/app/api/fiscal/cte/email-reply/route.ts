import {NextResponse} from "next/server";
/** Descontinuado: o aplicativo não envia CT-e por Gmail. */
export async function GET(){
 return NextResponse.json({error:"Envio de CT-e desativado. Consulte o Gmail da Prime Group."},{status:410});
}
export async function POST(){
 return NextResponse.json({error:"Envio de CT-e desativado. Envie diretamente pela Cargozilla/Gmail."},{status:410});
}
