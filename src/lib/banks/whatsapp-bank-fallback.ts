/** Durable plain-text version of each bank movement when Evolution Go's
 * interactive carousel is accepted but not rendered by the WhatsApp client.
 * The owner-scoped reference can be classified by the existing WhatsApp
 * 'classificar XXXXXXXX empresa' command.
 */
export function bankTextFallbackMessage(message:string,outboxId:string,actionLink?:string|null):string{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outboxId))
  throw Error("Invalid bank outbox reference");
 const ref=outboxId.slice(0,8).toUpperCase();
 if(actionLink&&actionLink.startsWith("https://"))
  return message.trim().slice(0,350)+"\\nClassificar com botões: "+actionLink;
 return message.trim().slice(0,480)+
  "\nClassificar: envie 'classificar "+ref+" empresa' ou "+
  "'classificar "+ref+" pessoal'.";
}
