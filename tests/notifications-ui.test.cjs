const assert=require("node:assert/strict");
const {harness,find,button,text}=require("./ui-harness.cjs");

async function main(){
  const uid="a0000000-0000-4000-8000-000000000001";
  let onInsert=null,queryCount=0,marks=[],channels=0;
  const oldWindow=globalThis.window,oldDocument=globalThis.document;
  globalThis.window={setInterval:()=>1,clearInterval:()=>{}};
  globalThis.document={visibilityState:"visible",addEventListener:()=>{},removeEventListener:()=>{}};
  const client={
    auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},
    from:table=>{
      assert.equal(table,"staff_notifications");
      const q={
        select(){return q;},eq(){return q;},order(){return q;},
        limit:async()=>({data:[],error:null}),
        is:async()=>({count:0,error:null})
      };
      queryCount++;return q;
    },
    channel(){
      channels++;
      return {
        on(event,filter,cb){
          assert.equal(event,"postgres_changes");
          assert.equal(filter.filter,"recipient_id=eq."+uid);
          onInsert=cb;return this;
        },
        subscribe(cb){cb("SUBSCRIBED");return this;}
      };
    },
    removeChannel:async()=>{},
    rpc:async(name,args)=>{marks.push({name,args});return {data:true,error:null};}
  };
  try{
    const ui=harness("NotificationCenter.tsx",{view:"bell"},client,{
      "next/link": {__esModule:true,default:()=>null}
    });
    assert(text(ui.render()).includes("Notifications"));
    await ui.effects();
    assert(channels>=1,"Realtime subscription started");
    assert(queryCount>=2,"Initial alert list and unread count loaded");
    const notice={id:"b0000000-0000-4000-8000-000000000001",recipient_id:uid,
      event_key:"order:new:123",event_type:"new_order",title:"New bakery order",
      body:"Order ORD-123 is awaiting confirmation.",target_path:"/customer-orders",
      created_at:new Date().toISOString(),read_at:null};
    onInsert({new:notice});
    onInsert({new:notice});
    assert(text(ui.render()).includes("1"),"Duplicate realtime delivery must not double unread count");
    assert(text(ui.render()).includes("New bakery order"),"Toast appears on new order");
    const close=button(ui.render(),"×");
    assert(close,"Toast dismiss action exists");
    close.props.onClick();
    assert(!text(ui.render()).includes("Order ORD-123 is awaiting confirmation."),"Toast dismissed");
    button(ui.render(),"🔔 Notifications 1").props.onClick();
    assert(text(ui.render()).includes("Order ORD-123 is awaiting confirmation."),"Bell displays stored alerts");
    const read=button(ui.render(),"Mark read");
    assert(read,"Unread row can be marked read");
    read.props.onClick();
    await new Promise(setImmediate);
    assert(marks.some(m=>m.name==="mark_staff_notification_read"&&m.args.p_id===notice.id),"Mark as read uses authenticated RPC");
    assert(text(ui.render()).includes("0"),"Unread count decreases");
    console.log("PASS: staff notifications subscribe, deduplicate, pop up, history, dismiss, and mark read.");
  }finally{
    globalThis.window=oldWindow;globalThis.document=oldDocument;
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
