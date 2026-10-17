import {NextResponse} from "next/server";
export const runtime="nodejs";
export async function POST(request:Request){
 const authorization=request.headers.get("authorization")??"";
 if(!authorization.startsWith("Bearer "))return NextResponse.json({error:"Sign in first."},{status:401});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return NextResponse.json({error:"Staging authentication unavailable."},{status:503});
 const body=await request.json().catch(()=>null);
 const oldPw=typeof body?.current_password==="string"?body.current_password:"";
 const newPw=typeof body?.new_password==="string"?body.new_password:"";
 if(!oldPw||newPw.length<12||newPw.length>128||oldPw===newPw)
  return NextResponse.json({error:"Provide current and new distinct passwords (12–128 characters)."}, {status:400});
 try{
  const res=await fetch(url+"/functions/v1/complete-staff-first-login",{
   method:"POST",headers:{"content-type":"application/json","authorization":authorization,"apikey":key},
   body:JSON.stringify({current_password:oldPw,new_password:newPw}),cache:"no-store"
  });
  const data=await res.json().catch(()=>({error:"Password service returned an invalid response."}));
  return NextResponse.json(data,{status:res.status,headers:{"cache-control":"no-store"}});
 }catch{return NextResponse.json({error:"Password service could not be reached."},{status:503});}
}