import Link from "next/link";
import { getPublicSiteData } from "@/lib/repositories/publicSiteLive";
import { buildPublicWhatsAppUrl, buildTikTokUrl } from "@/lib/publicSite";
import PublicShop from "@/components/public/PublicShop";

export const dynamic="force-dynamic";

export default async function Home(){
  const {info,catalog,demo,orderingOpen}=await getPublicSiteData();
  const menuCatalog:any[]=Array.isArray(catalog)?catalog:[];
  const categories:string[]=Array.from(new Set<string>(menuCatalog.map((p:any)=>String(p.category_name||"Bakery Menu"))));
  const generalWhatsApp=buildPublicWhatsAppUrl(info.whatsapp_phone,"Hello "+info.business_name+", I would like to make an enquiry.");
  const cakeWhatsApp=buildPublicWhatsAppUrl(info.whatsapp_phone,"Hello "+info.business_name+", I would like to ask about a custom cake.");
  const tiktokUrl=buildTikTokUrl(info.tiktok_handle);

  return <main style={{minHeight:"100vh",background:"linear-gradient(180deg,#fffaf0 0%,#f8f2e8 55%,#fff 100%)"}}>
    <header style={{maxWidth:1180,margin:"0 auto",padding:"18px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      <Link href="/" style={{display:"flex",alignItems:"center",gap:10,textDecoration:"none"}}>
        <img src="/ds-bakery-logo.png" alt={info.business_name} style={{width:54,height:54,borderRadius:"50%",background:"#111"}}/>
        <div><b style={{display:"block",fontFamily:"Georgia,serif",fontSize:22,color:"var(--brown)"}}>{info.business_name}</b><small style={{color:"var(--muted)"}}>{info.tagline}</small></div>
      </Link>
      <nav style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><a className="btn secondary" href="#menu">Menu</a>{info.custom_cake_enabled&&<a className="btn secondary" href="#custom-cakes">Custom Cakes</a>}<a className="btn secondary" href="#contact">Contact</a><Link className="btn primary" href="/login">Staff Login</Link></nav>
    </header>

    <section style={{maxWidth:1180,margin:"0 auto",padding:"52px 22px 38px"}}>
      <div style={{maxWidth:760}}>
        {demo?<span className="badge gold">Preview Data</span>:orderingOpen?<span className="badge green">Online Ordering Live</span>:<span className="badge gold">Online Ordering Opens Soon</span>}
        <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(42px,7vw,76px)",lineHeight:1.02,color:"var(--brown)",margin:"14px 0 16px"}}>{info.business_name}</h1>
        <p style={{fontSize:20,lineHeight:1.65,color:"var(--muted)"}}>{info.hero_message||info.tagline}</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:24}}><a className="btn primary" href="#menu">View Bakery Menu</a>{generalWhatsApp&&<a className="btn secondary" href={generalWhatsApp} target="_blank" rel="noreferrer">Ask on WhatsApp</a>}</div>
        {!orderingOpen&&!demo&&<p style={{marginTop:18,color:"var(--muted)"}}>Prices and products can be viewed now. Online checkout will open after the final launch checks are approved.</p>}
      </div>
    </section>

    <section id="menu" style={{maxWidth:1180,margin:"0 auto",padding:"34px 22px 60px"}}>
      <div style={{maxWidth:760}}><span className={orderingOpen?"badge green":"badge gold"}>{orderingOpen?"Live Menu":"Current Menu"}</span><h2 style={{fontFamily:"Georgia,serif",fontSize:38,color:"var(--brown)",margin:"12px 0 8px"}}>Bakery Menu</h2><p style={{color:"var(--muted)",lineHeight:1.6}}>Only active customer-facing products are shown. Internal stock, recipes, ingredient costs and profit information remain private.</p></div>
      <PublicShop catalog={menuCatalog} categories={categories} businessName={info.business_name} whatsappPhone={info.whatsapp_phone} deliveryEnabled={Boolean(info.delivery_enabled)} orderingOpen={orderingOpen}/>
    </section>

    {info.custom_cake_enabled&&<section id="custom-cakes" style={{background:"#3b2015",color:"#fff"}}><div style={{maxWidth:1180,margin:"0 auto",padding:"56px 22px"}}><span className="badge gold">Celebrations</span><h2 style={{fontFamily:"Georgia,serif",fontSize:40,margin:"12px 0"}}>Custom Cakes</h2><p style={{lineHeight:1.7,color:"#eadfce",fontSize:17,maxWidth:760}}>Tell us the size, flavour, theme, colours, inscription and event date you have in mind. Our team can prepare a quote and confirm production with you.</p>{cakeWhatsApp&&<a className="btn primary" style={{marginTop:10}} href={cakeWhatsApp} target="_blank" rel="noreferrer">Ask About a Custom Cake</a>}</div></section>}

    <section id="contact" style={{maxWidth:1180,margin:"0 auto",padding:"58px 22px"}}>
      <h2 style={{fontFamily:"Georgia,serif",fontSize:38,color:"var(--brown)",margin:"0 0 8px"}}>Contact {info.business_name}</h2>
      <p style={{color:"var(--muted)",margin:"0 0 22px"}}>Located at <b style={{color:"var(--brown)"}}>{info.address_text||"Kiwafu Lugonjo"}</b>.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
        {info.phone&&<a className="card" href={"tel:"+info.phone} style={{textDecoration:"none",color:"inherit"}}><div className="label">Telephone</div><div style={{fontSize:18,fontWeight:800,color:"var(--brown)",marginTop:8}}>{info.phone}</div></a>}
        {info.secondary_phone&&<a className="card" href={"tel:"+info.secondary_phone} style={{textDecoration:"none",color:"inherit"}}><div className="label">Telephone 2</div><div style={{fontSize:18,fontWeight:800,color:"var(--brown)",marginTop:8}}>{info.secondary_phone}</div></a>}
        {generalWhatsApp&&<a className="card" href={generalWhatsApp} target="_blank" rel="noreferrer" style={{textDecoration:"none",color:"inherit"}}><div className="label">WhatsApp</div><div style={{fontSize:18,fontWeight:800,color:"var(--brown)",marginTop:8}}>{info.whatsapp_phone}</div></a>}
        {info.email&&<a className="card" href={"mailto:"+info.email} style={{textDecoration:"none",color:"inherit"}}><div className="label">Email</div><div style={{fontSize:18,fontWeight:800,color:"var(--brown)",marginTop:8,wordBreak:"break-word"}}>{info.email}</div></a>}
        {tiktokUrl&&<a className="card" href={tiktokUrl} target="_blank" rel="noreferrer" style={{textDecoration:"none",color:"inherit"}}><div className="label">TikTok</div><div style={{fontSize:18,fontWeight:800,color:"var(--brown)",marginTop:8}}>{info.tiktok_handle}</div></a>}
      </div>
    </section>

    <footer style={{borderTop:"1px solid #eadfce",background:"#fff",padding:"24px 22px"}}><div style={{maxWidth:1180,margin:"0 auto",display:"flex",justifyContent:"space-between",gap:16,flexWrap:"wrap",color:"var(--muted)",fontSize:13}}><span>© {new Date().getFullYear()} {info.business_name}</span><span>Menu prices come from the DS Bakery Master System.</span></div></footer>
  </main>;
}
