/** A successful /send/carousel response only confirms API acceptance.
 * /message/status is optional and requires message persistence on Evolution Go.
 */
export function parseEvolutionGoDeliveryStatus(raw:unknown):
 "sent"|"delivered"|"read"|"unavailable"{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return "unavailable";
 const outer=raw as Record<string,unknown>;
 const data=outer.data;
 if(!data||typeof data!=="object"||Array.isArray(data))return "unavailable";
 const result=(data as Record<string,unknown>).result;
 if(!result||typeof result!=="object"||Array.isArray(result))return "unavailable";
 const value=(result as Record<string,unknown>).status;
 const status=typeof value==="string"?value.toUpperCase():"";
 return status==="READ"?"read":status==="DELIVERED"?"delivered":
  status==="SENT"?"sent":"unavailable";
}
