const assert=require("node:assert/strict");
const {harness,find,button,text}=require("./ui-harness.cjs");
async function main(){
 const sent=[];const client={
  rpc:async(name,args)=>{sent.push({name,args});return {data:"SALE-TEST-001",error:null};},
  from:()=>{const o={select:()=>o,order:()=>o,limit:async()=>({data:[{id:"1",sale_no:"SALE-TEST-001",status:"completed",total:5000,created_at:new Date().toISOString(),held:false,cashier_id:"1"}],error:null})};return o;},
  channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:async()=>{}
 };
 const product={id:"product-001",name:"Audit Bread",selling_price:5000,category_name:"Bakery"};
 const pos=harness("PosTerminal.tsx",{products:[product],openShift:{id:"shift1"},customers:[],live:true,canPost:true},client,{
  "@/lib/pos":{
   subtotal:(cart)=>cart.reduce((s,c)=>s+c.quantity*c.unitPrice,0),
   discountAmount:(s,t,v)=>t==="percent"?s*v/100:Math.min(s,v),
   grandTotal:(s,d)=>s-d,
   changeDue:(r,t)=>Math.max(0,r-t)
  },
  "@/components/Sidebar":{default:()=>null}
 });
 function amountInput(){
  const n=find(pos.render(),x=>typeof x.type==="function" && x.type.name==="MoneyInput" && x.props.label==="Cash received")[0];
  assert(n,"POS cash amount field exists");return find(n.type(n.props),x=>x.type==="input")[0];
 }
 assert.equal(amountInput().props.value,"","Cash input begins empty, not 0");
 amountInput().props.onChange({target:{value:"020000"}});
 assert.equal(amountInput().props.value,"20000","Leading zero removed");
 amountInput().props.onChange({target:{value:""}});
 assert.equal(amountInput().props.value,"","Backspace fully clears amount");
 amountInput().props.onChange({target:{value:"20000"}});
 const add=find(pos.render(),x=>x.type==="button"&&text(x).includes("Audit Bread"))[0];
 assert(add,"Product button exists");add.props.onClick();
 assert(!button(pos.render(),"Complete and Save Sale").props.disabled,"Sale button enabled with shift open");
 await button(pos.render(),"Complete and Save Sale").props.onClick();
 assert(sent.some(x=>x.name==="complete_sale_with_customer"),"Sale is posted to central RPC");
 assert(text(pos.render()).includes("SAVED"),"Confirmation states cloud save");
 const locked=harness("PosTerminal.tsx",{products:[product],openShift:{id:"s"},customers:[],live:true,canPost:false},client,{
  "@/lib/pos":{subtotal:()=>0,discountAmount:()=>0,grandTotal:()=>0,changeDue:()=>0},
  "@/components/Sidebar":{default:()=>null}
 });
 assert(text(locked.render()).includes("Live sales are locked"),"Cutover lock explained");
 assert(button(locked.render(),"Complete and Save Sale").props.disabled,"Locked POS disallows posting");
 console.log("PASS: POS amount clearing, no leading zeros, shared cloud RPC, save feedback and cutover lock.");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
