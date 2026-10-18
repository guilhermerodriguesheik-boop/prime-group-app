/** Durable plain-text version of each bank movement when Evolution Go's
 * interactive carousel is accepted but not rendered by the WhatsApp client.
 * The owner-scoped reference can be classified by the existing WhatsApp
 * 'classificar XXXXXXXX empresa' command.
 */
export function bankTextFallbackMessage(message:string,outboxId:string):string{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(outboxId))
  throw Error("Invalid bank outbox reference");
 const ref=outboxId.slice(0,8).toUpperCase();
 return message.trim().slice(0,480)+
  "\nClassificar: envie 'classificar "+ref+" empresa' ou "+
  "'classificar "+ref+" pessoal'.";
}
