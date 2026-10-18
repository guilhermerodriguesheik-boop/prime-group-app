/**
 * Resolve a poll-vote sender using only the Evolution Go authenticated
 * private-chat envelope. LIDs aren't phone numbers. A user whose only
 * identifier is a LID must not be mapped to any bank owner by guessing.
 * The resulting phone is checked against an enabled WhatsApp pairing in SQL.
 */
const phoneJid=(value:string)=>/^[0-9]{10,15}@s\.whatsapp\.net$/.test(value);
export function getEvolutionGoPollIdentity(params:{
 senderJid:string;chatJid:string;senderAlt?:string;chatAlt?:string;legacyJid?:string;
 isPoll:boolean;
}):{phone:string;voterJid:string}|null {
 const {senderJid,chatJid,chatAlt="",senderAlt="",legacyJid="",isPoll}=params;
 if(/@(g\.us|broadcast|newsletter)$/.test(chatJid))return null;
 if(!isPoll){
  if(!phoneJid(senderJid)||!phoneJid(chatJid))return null;
  return {phone:senderJid.split("@")[0],voterJid:senderJid};
 }
 const selected=[chatJid,senderJid,chatAlt,senderAlt,legacyJid].find(phoneJid);
 if(!selected)return null;
 const validVoteJid=/^[A-Za-z0-9:._-]{2,50}@(s\.whatsapp\.net|lid)$/;
 const voterJid=validVoteJid.test(senderJid)?senderJid:selected;
 return {phone:selected.split("@")[0],voterJid};
}
