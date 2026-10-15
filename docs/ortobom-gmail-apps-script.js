/**
 * Prime Finance - sincronizacao de e-mails da Ortobom.
 * Instale este script em https://script.google.com/ com a conta de e-mail
 * que recebe os XMLs. Adicione ORTOBOM_EMAIL_SECRET em Script Properties.
 */
const PRIME_URL="https://prime-finance-ochre.vercel.app/api/integrations/ortobom-email";
const PRIME_QUERY='subject:"Arquivos da carga" has:attachment newer_than:60d -in:trash -in:spam';
function syncPrimeOrtobom(){
 const props=PropertiesService.getScriptProperties();
 const secret=props.getProperty("ORTOBOM_EMAIL_SECRET");
 if(!secret)throw new Error("Configure ORTOBOM_EMAIL_SECRET nas propriedades do script.");
 const threads=GmailApp.search(PRIME_QUERY,0,50);
 let imported=0,ignored=0;
 for(const thread of threads){
  for(const msg of thread.getMessages()){
   const id=msg.getId();
   if(props.getProperty("processed_"+id)){ignored++;continue;}
   const files=msg.getAttachments({includeInlineImages:false})
    .filter(a=>a.getName().toLowerCase().endsWith(".xml")&&a.getSize()<1048576)
    .slice(0,30).map(a=>({filename:a.getName(),content:a.getDataAsString("UTF-8")}));
   if(!files.length)continue;
   const payload={messageId:id,subject:msg.getSubject(),body:msg.getPlainBody().slice(0,12000),xmls:files};
   const response=UrlFetchApp.fetch(PRIME_URL,{
     method:"post",contentType:"application/json",
     headers:{"x-prime-email-key":secret},
     payload:JSON.stringify(payload),muteHttpExceptions:true,
     followRedirects:false,
   });
   if(response.getResponseCode()!==200)
     throw new Error("Falha na importacao da mensagem "+id+": HTTP "+response.getResponseCode());
   props.setProperty("processed_"+id,new Date().toISOString());
   imported++;
  }
 }
 Logger.log("Importadas: "+imported+" | ja processadas: "+ignored);
}
function activatePrimeOrtobomHourly(){
 const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==="syncPrimeOrtobom");
 if(!exists)ScriptApp.newTrigger("syncPrimeOrtobom").timeBased().everyHours(1).create();
 syncPrimeOrtobom();
}
