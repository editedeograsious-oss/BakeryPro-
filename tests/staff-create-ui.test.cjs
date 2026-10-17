const assert=require("node:assert/strict");
const {harness,find,button,text}=require("./ui-harness.cjs");

async function main(){
  let posts=[];
  let respond=async()=>({ok:true,status:201,json:async()=>({ok:true,user_id:"test-staff"})});
  globalThis.fetch=async(path,init)=>{
    posts.push({path,body:JSON.parse(init.body),headers:init.headers});
    return respond(path,init);
  };
  const client={auth:{getSession:async()=>({data:{session:{access_token:"test-bearer"}},error:null})},from:(table)=>{assert.equal(table,"profiles");return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:"test-staff",role:"cashier",active:true,require_password_reset:true},error:null})})})};}};
  const ui=harness("staging-StaffAdminManager.tsx",{staff:[],live:true},client);
  function inputs(){return find(ui.render(),n=>n.type==="input");}
  function enter(fields){
    for(const [predicate,value] of fields){
      const input=inputs().find(predicate);
      assert(input,"Expected input control");
      input.props.onChange({target:{value}});
    }
  }
  const pw=()=>inputs().filter(i=>i.props.type==="password");
  enter([[i=>i.props.type===undefined,"Test Manager"],[i=>i.props.type==="email","manager-test@example.test"]]);
  assert.equal(pw().length,2,"Initial and confirm password fields exist");
  pw()[0].props.onChange({target:{value:"LongDemoPass!2026"}});
  pw()[1].props.onChange({target:{value:"NotMatchingPass!2026"}});
  await button(ui.render(),"Create Staff Account").props.onClick();
  assert.equal(posts.length,0,"Mismatched passwords must not call account service");
  assert(text(ui.render()).includes("do not match"),"Validation message shown");

  pw()[1].props.onChange({target:{value:"LongDemoPass!2026"}});
  await button(ui.render(),"Create Staff Account").props.onClick();
  assert.equal(posts.length,1,"Exactly one provisioning call");
  assert.equal(posts[0].path,"/api/staff/create");
  assert.equal(posts[0].body.role,"cashier","Role is limited to selected role");
  assert.equal(posts[0].body.full_name,"Test Manager");
  assert.equal(posts[0].body.initial_password,"LongDemoPass!2026");
  assert(posts[0].headers.authorization.startsWith("Bearer "),"Logged-in authorization attached");
  assert(!text(ui.render()).includes("LongDemoPass!2026"),"Password does not appear in page");
  assert(pw().every(i=>i.props.value===""),"Passwords cleared after success");
  assert(text(ui.render()).includes("STAGING staff account verified"),"Do not report success before verified profile exists");

  enter([[i=>i.props.type===undefined,"Test Cashier"],[i=>i.props.type==="email","cashier-test@example.test"]]);
  pw()[0].props.onChange({target:{value:"AnotherLongPass!2026"}});
  pw()[1].props.onChange({target:{value:"AnotherLongPass!2026"}});
  respond=async()=>({ok:false,status:404,json:async()=>({error:"Not Found"})});
  await button(ui.render(),"Create Staff Account").props.onClick();
  assert.equal(posts.length,2);
  assert(text(ui.render()).includes("not yet been installed"),"Unavailable backend is explained");
  console.log("PASS: CEO one-by-one account creation, distinct roles, password confirmation, password clearing, and missing-backend error.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
