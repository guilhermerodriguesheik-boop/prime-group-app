/** Pluggy item/updated always carries the item's ID after a completed sync.
 * Transaction-level events carry transactionIds instead; never treat these as
 * item IDs or acknowledge them as ingested.
 */
export const PLUGGY_BANK_EVENTS=["item/updated"] as const;
export type PluggyItemUpdated = {event:"item/updated";eventId:string;itemId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parsePluggyItemUpdated(payload:unknown):PluggyItemUpdated|null{
 if(!payload||typeof payload!=="object")return null;
 const record=payload as Record<string,unknown>;
 if(record.event!=="item/updated"||
    typeof record.eventId!=="string"||!uuid.test(record.eventId)||
    typeof record.itemId!=="string"||!uuid.test(record.itemId))return null;
 return {event:"item/updated",eventId:record.eventId,itemId:record.itemId};
}
