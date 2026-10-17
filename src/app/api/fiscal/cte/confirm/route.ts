import {NextResponse} from "next/server";
/** Descontinuado: CT-e é emitido exclusivamente no sistema externo Cargozilla. */
export async function POST(){
 return NextResponse.json({error:"Emissão CT-e desativada. Use a Cargozilla; no Prime Finance somente importamos documentos."},{status:410});
}
