const assert=require("node:assert/strict");
const {harness,find,button,text}=require("./ui-harness.cjs");
async function main(){
  const product={id:"a0000000-0000-4000-8000-000000000001",name:"Audit Bread",status:"active",selling_price:7500,image_url:null,online_available:false};
  const uploads=[],calls=[];
  const client={
    storage:{from(bucket){return {upload:async(path,file,options)=>{uploads.push({bucket,path,file,options});return {data:{path},error:null};}};}},
    rpc:async(name,args)=>{calls.push({name,args});return {data:{order_no:"STAGE-ORDER-123",total:15000},error:null};}
  };
  const owner=harness("OwnerCommerce.tsx",{products:[product],reviews:[]},client);
  assert(button(owner.render(),"Publish").props.disabled,"Publishing is disabled until photo exists");
  const photo=find(owner.render(),x=>x.type==="input"&&x.props.type==="file")[0];
  const fakeFile={type:"image/jpeg",size:1024,name:"bread-test.jpg"};
  photo.props.onChange({target:{files:[fakeFile]}});
  await button(owner.render(),"Upload Photo").props.onClick();
  assert.equal(uploads.length,1,"Photo uploaded exactly once");
  assert.equal(uploads[0].bucket,"bakery-product-images");
  assert.match(uploads[0].path,/^a0000000-0000-4000-8000-000000000001\/[0-9a-f-]+\.jpg$/);
  assert(calls.some(x=>x.name==="owner_set_product_image"),"Photo linked via guarded RPC");
  assert(owner.refreshes>=1,"Owner page refresh triggered");

  owner.render({products:[{...product,image_url:"https://example.test/photo.jpg"}],reviews:[]});
  assert.equal(button(owner.render(),"Publish").props.disabled,false);
  await button(owner.render(),"Publish").props.onClick();
  assert(calls.some(x=>x.name==="owner_set_product_online"&&x.args.p_available===true),"CEO publish RPC executed");

  const review={id:"r1",product_id:product.id,display_name:"Guest",rating:5,review_text:"Well made",status:"pending",created_at:"2026-10-17"};
  owner.render({products:[{...product,image_url:"https://example.test/photo.jpg"}],reviews:[review]});
  await button(owner.render(),"Approve").props.onClick();
  assert(calls.some(x=>x.name==="owner_moderate_product_review"&&x.args.p_approve===true),"CEO review approval RPC executed");

  const shopProduct={id:product.id,name:product.name,description:"Bakery bread",selling_price:7500,image_url:"https://example.test/photo.jpg",category_name:"Bread"};
  const shop=harness("BakeryShop.tsx",{products:[shopProduct],site:{business_name:"DS Bakery",delivery_enabled:true},orderingAllowed:true},client);
  const findInput=id=>find(shop.render(),x=>(x.type==="input"||x.type==="textarea"||x.type==="select")&&x.props.id===id)[0];
  const add=find(shop.render(),x=>x.type==="button"&&x.props["aria-label"]==="Add one Audit Bread")[0];
  add.props.onClick();
  find(shop.render(),x=>x.type==="button"&&x.props["aria-label"]==="Add one Audit Bread")[0].props.onClick();
  findInput("shop-name").props.onChange({target:{value:"Test Customer"}});
  findInput("shop-phone").props.onChange({target:{value:"07000000123"}});
  const nextDay=new Date(Date.now()+86400000).toISOString().slice(0,16);
  findInput("shop-time").props.onChange({target:{value:nextDay}});
  await button(shop.render(),"Submit order request").props.onClick();
  const order=calls.filter(x=>x.name==="submit_public_order");
  assert.equal(order.length,1,"Single checkout request");
  assert.equal(order[0].args.p_items[0].quantity,2,"Two selected units");
  assert(order[0].args.p_client_request_id,"Idempotent request id passed");
  assert(text(shop.render()).includes("STAGE-ORDER-123"),"Order number displayed");

  const closed=harness("BakeryShop.tsx",{products:[shopProduct],site:{},orderingAllowed:false},client);
  assert(text(closed.render()).includes("Online checkout is not open yet"));
  assert(button(closed.render(),"Submit order request").props.disabled,"Checkout disabled when operations locked");
  console.log("PASS: product photo upload/link, publish gate, review approval, customer cart, checkout and closed-shop safeguards.");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
