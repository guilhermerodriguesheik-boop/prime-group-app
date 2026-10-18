import {recoverOwnerPollVote} from "./evolution-go-poll-recovery";

type Poll={pollId:string;phone:string};
type Rpc=<T>(name:string,args:Record<string,unknown>)=>Promise<T>;
export async function reconcileBankPolls(rpc:Rpc){
 if(process.env.WHATSAPP_PROVIDER!=="evolution_go")return {checked:0,recovered:0};
 const token=process.env.EVOLUTION_GO_TOKEN||"";
 const raw=process.env.EVOLUTION_GO_API_URL||"";
 let host:string;
 try {
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||!token)return {checked:0,recovered:0};
  host=url.origin+url.pathname.replace(/\/+$/,"");
 }catch{return {checked:0,recovered:0};}
 const pending=await rpc<Poll[]>("prime_get_unresolved_bank_polls",{p_limit:2});
 let recovered=0;
 for(const poll of pending){
  if(!/^[A-Za-z0-9_-]{8,150}$/.test(poll.pollId))continue;
  try{
   const res=await fetch(host+"/polls/"+encodeURIComponent(poll.pollId)+"/results",{
    cache:"no-store",signal:AbortSignal.timeout(4500),
    headers:{apikey:token,Accept:"application/json"}
   });
   if(!res.ok)continue;
   const vote=recoverOwnerPollVote(await res.json(),poll.pollId,poll.phone);
   if(!vote)continue;
   const committed=await rpc<boolean>("prime_apply_bank_poll_vote",{
    p_poll_id:poll.pollId,p_phone:poll.phone,p_destination:vote.destination,
    p_vote_message_id:vote.voteId
   });
   if(committed)recovered++;
  }catch{/* Unsupported polling endpoint must not affect banking operations. */}
 }
 return {checked:pending.length,recovered};
}
