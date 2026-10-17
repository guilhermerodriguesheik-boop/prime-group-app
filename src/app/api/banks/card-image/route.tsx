import {ImageResponse} from "next/og";
export const runtime="edge";
export const revalidate=86400;
/** Public generic visual required by Evolution Go carousel (contains no bank details). */
export async function GET(){
 return new ImageResponse(
  <div style={{display:"flex",width:"100%",height:"100%",background:"#163246",
   justifyContent:"center",alignItems:"center",flexDirection:"column",
   color:"#f0f7f9",fontFamily:"sans-serif"}}>
   <div style={{fontSize:58,fontWeight:800}}>PRIME FINANCE</div>
   <div style={{fontSize:23,marginTop:15,color:"#b9dce6"}}>Classificação bancária</div>
  </div>,
  {width:600,height:360,headers:{"Cache-Control":"public, max-age=86400, s-maxage=604800"}}
 );
}
