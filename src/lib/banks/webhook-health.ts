/** Verify both webhook delivery status and the shared header used by Prime. */
export type PluggyWebhookMetadata={
 id:string;url:string;event:string;disabledAt?:string|null;
 headers?:Record<string,string>|null;
};
export function webhookReady(
 hook:PluggyWebhookMetadata,target:string,event:string,secret:string,
){
 const header=Object.entries(hook.headers||{})
  .find(([name])=>name.toLowerCase()==="x-prime-webhook-key")?.[1];
 return hook.url===target&&hook.event===event&&!hook.disabledAt&&header===secret;
}
export function webhookNeedsRepair(
 hook:PluggyWebhookMetadata,target:string,event:string,secret:string,
){
 return hook.url===target&&hook.event===event&&!webhookReady(hook,target,event,secret);
}
