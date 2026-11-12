// Pocket Japanese: the optional "Ask AI" tab.
//
// Trust design (the model is small and CAN be wrong, so the app polices it):
//   1. Lookup first: the question is run through the normal phrasebook search
//      and the model only gets those hand-written cards + dictionary entries.
//   2. The model answers with three line types only: CARD n / SAY jp = en / NOTE text.
//      CARD shows the real card (recorded audio). Nothing else it prints is shown.
//   3. A SAY sentence is split into words (kuromoji) and every word must exist
//      in the dictionary or the hand-written phrases, otherwise it is not shown.
//   4. Romaji is generated from the dictionary reading, never taken from the model.
(function(){
"use strict";
const IOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
const MODELS={
  small:{id:"Qwen3.5-2B-q4f16_1-MLC",lib:"ai/Qwen3.5-2B-q4f16_1_cs1k-webgpu.wasm",size:"1.1 GB"},
  big:{id:"Qwen3.5-4B-q4f16_1-MLC",lib:"ai/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm",size:"2.4 GB"}};
const SYSTEM=`You are the helper inside "Pocket Japanese", an offline phrasebook for an English-speaking traveller in Japan who cannot read Japanese.
Each message gives you PHRASEBOOK ENTRIES (checked by humans, always correct) and a QUESTION.

Reply using ONLY these three kinds of lines:
CARD <number>
SAY <Japanese sentence> = <English meaning>
NOTE <one or two short English sentences>

How to choose:
- If an entry already says what the user wants, reply with CARD and its number. This is always the best answer. Use at most 3 CARD lines, best first.
- Check who is speaking: some entries are what YOU say, others are replies to someone else (read the English and the note). Pick the one that fits the user's situation.
- Entries marked "dictionary word" are single words, not phrases.
- NOTE lines must be in English.
- Write a SAY line only when no entry says it. Make one short, natural, polite sentence (desu/masu style) the way a Japanese person would really say it. Use the words from the entries when they fit. Write it in normal Japanese script only.
- Add a NOTE line when a tip helps (when to use it, politeness, a warning).

Strict rules:
- Never write romaji or pronunciation. The app adds that itself.
- Never invent or guess a Japanese word. If you are not sure of a word or of the sentence, do not write SAY. Write: NOTE I'm not sure how to say that.
- Do not copy an entry into a SAY line. Use CARD for entries.
- If the question is not about Japanese or travelling in Japan, write: NOTE I can only help with Japanese.
- Keep it short: at most 4 lines in total. Never repeat a line.
- No greetings, no extra text, nothing outside the three line types.`;

// The on-device model is too small to write Japanese safely (in testing it produced
// fluent-looking nonsense that passes a word check), so offline it may only point
// at hand-written cards and add a short English tip.
const SYSTEM_LOCAL=`You are the helper inside "Pocket Japanese", an offline phrasebook for an English-speaking traveller in Japan.
Each message gives you numbered PHRASEBOOK ENTRIES and a QUESTION.

Reply with at most 3 lines, using ONLY these two kinds of lines:
CARD <number>
NOTE <one short English sentence>

Rules:
- Choose the entry that says what the USER wants to say. Put the best one first. Use 1 or 2 CARD lines.
- Check who is speaking: some entries are what you say, others are replies to someone else.
- Never write Japanese yourself. Never write romaji.
- If no entry fits, write only: NOTE None of my cards say that exactly.
- Nothing else. No explanations outside NOTE.`;

// ---------- page furniture ----------
const css=document.createElement("style");
css.textContent=`#tabs{display:flex;gap:6px;margin:0 0 8px}
#tabs button{flex:1;font:inherit;font-size:14px;padding:7px 0;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--mute)}
#tabs button.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
#ask{padding-bottom:calc(96px + env(safe-area-inset-bottom))}
#askbar{position:fixed;left:0;right:0;bottom:0;background:var(--bg);border-top:1px solid var(--line);padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:8px;justify-content:center}
#askq{flex:1;max-width:660px;padding:12px 14px;font-size:17px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);outline:none}
#askq:focus{border-color:var(--accent)}
#gkey{flex:1;min-width:0;padding:10px 12px;font-size:16px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink)}
#gmodel{font:inherit;font-size:14px;padding:4px 6px;max-width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px}
#asksend,.aibtn{font:inherit;font-weight:600;border:0;border-radius:12px;background:var(--accent);color:#fff;padding:0 16px;min-height:44px}
.aibtn.plain{background:var(--chip);color:var(--ink);font-weight:400}
.you{margin:16px 0 4px;font-weight:600}.you::before{content:"You: ";color:var(--mute);font-weight:400}
.ainote{background:var(--chip);border-radius:12px;padding:10px 14px;margin:8px 0;font-size:15px}
.ainote small,.aimeta{display:block;color:var(--mute);font-size:12px}
.aimeta{margin:6px 2px}
.bar{height:10px;border-radius:99px;background:var(--chip);overflow:hidden;margin:12px 0 6px}.bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .3s}
.dots::after{content:"…";animation:dots 1s steps(3) infinite}@keyframes dots{0%{opacity:.2}100%{opacity:1}}`;
document.head.appendChild(css);
const header=document.querySelector("header"),h1=header.querySelector("h1");
const tabs=document.createElement("div");tabs.id="tabs";
tabs.innerHTML=`<button data-t="search" class="on">Search</button><button data-t="ask">Ask AI</button>`;
h1.after(tabs);
const askEl=document.createElement("main");askEl.id="ask";askEl.className="hidden";
askEl.innerHTML=`<div id="askpanel"></div><div id="asklog"></div>
<form id="askbar" class="hidden"><input id="askq" type="text" enterkeyhint="send" placeholder="Ask how to say something…" autocomplete="off"><button id="asksend">Ask</button></form>`;
document.getElementById("results").after(askEl);
const panel=askEl.querySelector("#askpanel"),log=askEl.querySelector("#asklog"),bar=askEl.querySelector("#askbar"),aq=askEl.querySelector("#askq");
const searchBits=[document.querySelector(".qwrap"),document.getElementById("count"),document.getElementById("nav"),document.getElementById("browse"),document.getElementById("results"),document.querySelector("footer"),document.getElementById("offline"),document.getElementById("install")].filter(Boolean);
let prevHidden=null,tab="search";
function show(t){
  if(t===tab)return;tab=t;
  tabs.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===t));
  if(t==="ask"){prevHidden=searchBits.map(el=>el.classList.contains("hidden"));searchBits.forEach(el=>el.classList.add("hidden"));askEl.classList.remove("hidden");openAsk()}
  else{searchBits.forEach((el,i)=>el.classList.toggle("hidden",prevHidden[i]));askEl.classList.add("hidden");document.getElementById("q").focus()}
  window.scrollTo(0,0);
}
tabs.addEventListener("click",ev=>{const b=ev.target.closest("button");if(b)show(b.dataset.t)});
const oldReset=window.resetSearch;window.resetSearch=()=>{show("search");oldReset&&oldReset()};

// ---------- engines ----------
// Online: Google Gemini with the user's own API key (best Japanese).
// Offline: a small model that runs on this device (backup when there is no
// internet, or when Gemini refuses / runs out of free quota).
let WL=null,engine=null,busy=false,model=null,tok=null,tokP=null,history=[];
let localState="unknown",localPct=0,localTxt="",localFresh=false,localErr="",showSettings=false,gList=null;
const absURL=u=>new URL(u,location.href).href;
const LS={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},
  set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}};
const gKey=()=>LS.get("pj-gemini-key")||"",gModel=()=>LS.get("pj-gemini-model")||"";
const GAPI="https://generativelanguage.googleapis.com/v1beta/";
async function gFetch(path,body,ms,key){
  const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),ms||20000);
  try{
    // the key travels in a header, never in the address
    const r=await fetch(GAPI+path,{method:body?"POST":"GET",signal:ctl.signal,
      headers:Object.assign({"x-goog-api-key":key||gKey()},body?{"Content-Type":"application/json"}:{}),
      body:body?JSON.stringify(body):undefined});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error((j.error&&j.error.message)||("HTTP "+r.status));e.status=r.status;throw e}
    return j;
  }finally{clearTimeout(t)}
}
async function gModels(key){
  const j=await gFetch("models?pageSize=200",null,15000,key);
  return(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")&&/gemini/.test(m.name)
    &&!/(image|tts|audio|embedding|live|vision|computer|robotics|learnlm|aqa)/i.test(m.name)).map(m=>m.name.replace("models/",""));
}
// default = the newest ordinary Flash model (fast and inside the free allowance)
function bestModel(list){
  const ver=n=>parseFloat((/gemini-(\d+(\.\d+)?)/.exec(n)||[0,0])[1])||0;
  const score=n=>(/flash/.test(n)?1000:0)-(/lite/.test(n)?300:0)-(/preview|exp/.test(n)?200:0)-(/latest/.test(n)?50:0)+ver(n)*10;
  return[...list].sort((a,b)=>score(b)-score(a))[0]||"";
}
async function gAsk(msgs){
  const contents=msgs.slice(1).map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]}));
  const j=await gFetch("models/"+gModel()+":generateContent",{systemInstruction:{parts:[{text:msgs[0].content}]},contents,
    generationConfig:{temperature:0.2,maxOutputTokens:1024}},20000);
  const c=j.candidates&&j.candidates[0];
  const text=c&&c.content&&c.content.parts?c.content.parts.filter(p=>!p.thought).map(p=>p.text||"").join("").trim():"";
  if(!text)throw new Error("Gemini sent an empty reply");
  return text;
}
const gWhy=e=>!e?"":e.name==="AbortError"?"it took too long":e.status===429?"its free limit was reached":e.status===400||e.status===401||e.status===403?"the key was refused":e.status?"it reported a problem":"no internet";
async function localAsk(msgs){
  const r=await engine.chat.completions.create(Object.assign({messages:[{role:"system",content:SYSTEM_LOCAL},...msgs.slice(1)],temperature:0.2,top_p:0.8,presence_penalty:1.5,max_tokens:90,extra_body:{enable_thinking:false}},window.__askParams||{}));
  return(r.choices[0].message.content||"").replace(/<think>[\s\S]*?(<\/think>|$)/g,"").trim();
}
async function pickModel(){
  const saved=LS.get("pj-ai-model");if(saved&&MODELS[saved])return MODELS[saved];
  let k="small";
  try{const est=await navigator.storage.estimate();
    if(!IOS&&(navigator.deviceMemory||4)>=8&&est.quota-est.usage>5e9)k="big"}catch(e){}
  return MODELS[k];
}
const cfg=()=>{const rec=WL.prebuiltAppConfig.model_list.find(m=>m.model_id===model.id);return{model_list:[{...rec,model_lib:absURL(model.lib)}]}};
// Called when the Ask tab opens. If the offline model is already on the device it
// warms up in the background, so it is ready the moment the internet drops.
async function localInit(){
  if(localState!=="unknown")return;
  if(!navigator.gpu){localState="none";return drawPanel()}
  localState="checking";
  try{
    WL=await import(absURL("ai/web-llm.js"));
    model=await pickModel();
    if(await WL.hasModelInCache(model.id,cfg()))return localLoad(false);
    localState="absent";
  }catch(e){localState="error";localErr=String(e&&e.message||e)}
  drawPanel();
}
function updProg(){
  const pct=Math.round(localPct*100)+"%";
  panel.querySelectorAll(".aipct").forEach(el=>el.textContent=(localFresh?localTxt:"")+pct);
  const f=panel.querySelector(".bar i");if(f)f.style.width=pct;
}
async function localLoad(fresh){
  if(localState==="loading")return;
  localState="loading";localPct=0;localTxt="";localFresh=fresh;drawPanel();
  try{
    try{navigator.storage&&navigator.storage.persist&&await navigator.storage.persist()}catch(e){}
    LS.set("pj-ai-model",Object.keys(MODELS).find(k=>MODELS[k]===model));
    engine=await WL.CreateMLCEngine(model.id,{appConfig:cfg(),initProgressCallback:p=>{
      localPct=p.progress||0;const m=/(\d+)MB fetched/.exec(p.text||"");localTxt=m?m[1]+" MB · ":"";updProg()}});
    localState="ready";
  }catch(e){engine=null;localState="error";localErr=String(e&&e.message||e)}
  drawPanel();
}
async function localDelete(){
  if(!confirm("Delete the offline AI model from this device? You can download it again later."))return;
  try{engine&&await engine.unload()}catch(e){}
  try{await WL.deleteModelAllInfoInCache(model.id,cfg())}catch(e){}
  try{for(const k of await caches.keys())if(k.startsWith("webllm"))await caches.delete(k)}catch(e){}
  engine=null;LS.set("pj-ai-model",null);localState="absent";drawPanel();
}
function loadTokenizer(){
  return new Promise((ok,no)=>{
    const s=document.createElement("script");s.src="ai/kuromoji.js";
    s.onload=()=>window.kuromoji.builder({dicPath:"ai/dict/"}).build((err,t)=>err?no(err):ok(t));
    s.onerror=()=>no(new Error("word checker failed to load"));
    document.head.appendChild(s)});
}
const ensureTok=()=>tokP=tokP||loadTokenizer().then(t=>{tok=t}).catch(()=>{tokP=null});
const usable=()=>!!gKey()||localState==="ready";
function drawPanel(){
  const key=gKey();
  const on=key?"Online AI ✓":"Online AI: not set up";
  const off={ready:"Offline AI ✓",loading:`Offline AI ${localFresh?"downloading":"starting"} <span class="aipct"></span>`,absent:"Offline AI: not downloaded",
    none:"Offline AI: not supported here",error:"Offline AI: problem",unknown:"Offline AI: checking",checking:"Offline AI: checking"}[localState];
  let h=`<div class="aimeta">${on} · ${off} · <a href="#" id="aiset">${showSettings||!usable()?"":"settings"}</a></div>`;
  if(showSettings||!usable()){
    h+=`<div class="card"><div class="en">Online AI (best answers)</div>
<div class="note">Uses Google's Gemini over the internet. It is far better at Japanese than the offline one.<br>
It needs your own API key, free from <b>aistudio.google.com/apikey</b>. The key is saved on this device only. Your questions are sent to Google.</div>`;
    if(key){
      const list=gList||[gModel()];
      h+=`<div class="note">Key saved. Model: <select id="gmodel">${list.map(m=>`<option${m===gModel()?" selected":""}>${esc(m)}</option>`).join("")}</select></div>
<div style="margin-top:10px"><button class="aibtn plain" id="gdel">Remove key</button></div>`;
    }else h+=`<div style="margin-top:10px;display:flex;gap:8px"><input id="gkey" type="password" placeholder="Paste your Gemini API key" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="aibtn" id="gsave">Save</button></div>`;
    h+=`<div class="note" id="gmsg"></div></div>
<div class="card"><div class="en">Offline AI (backup)</div>
<div class="note">Runs on this device with no internet. Used automatically when you are offline or Gemini is unavailable. It is a small AI, so it only picks from the hand-written cards and never writes Japanese of its own.</div>`;
    if(localState==="absent")h+=`<div class="note"><b>${model.size}</b> download, so use Wi-Fi. Removing the app deletes it too.</div><div style="margin-top:10px"><button class="aibtn${key?" plain":""}" id="aidl">Download</button></div>`;
    else if(localState==="loading")h+=`<div class="bar"><i></i></div><div class="note">${localFresh?"Downloading":"Starting"} · <span class="aipct"></span>${localFresh?"<br>Keep the app open. If it stops, come back and it continues.":""}</div>`;
    else if(localState==="ready")h+=`<div class="note">Ready (${model.size} on this device).</div><div style="margin-top:10px"><button class="aibtn plain" id="aidel">Delete from device</button></div>`;
    else if(localState==="none")h+=`<div class="note">This browser can't run it (on iPhone it needs iOS 26 or later).</div>`;
    else if(localState==="error")h+=`<div class="note">${esc(localErr).slice(0,240)}<br>This usually means the device ran out of memory or the download was interrupted. What was downloaded is kept.</div><div style="margin-top:10px"><button class="aibtn plain" id="aidl">Try again</button></div>`;
    h+=`</div>`;
  }
  panel.innerHTML=h;updProg();
  const $=id=>panel.querySelector("#"+id),click=(id,f)=>{const el=$(id);if(el)el.onclick=ev=>{ev.preventDefault();f()}};
  click("aiset",()=>{showSettings=!showSettings;drawPanel()});
  click("aidl",()=>localLoad(true));
  click("aidel",localDelete);
  click("gdel",()=>{LS.set("pj-gemini-key",null);LS.set("pj-gemini-model",null);gList=null;drawPanel()});
  click("gsave",async()=>{
    const k=$("gkey").value.trim(),msg=$("gmsg");if(!k)return;
    msg.textContent="Checking the key…";
    try{const list=await gModels(k);if(!list.length)throw new Error("this key can't use any Gemini text model");
      gList=list;LS.set("pj-gemini-key",k);LS.set("pj-gemini-model",bestModel(list));showSettings=false;drawPanel();
    }catch(e){msg.textContent="That didn't work: "+(e.status?e.message:"couldn't reach Google. Check the internet and try again.")}
  });
  const sel=$("gmodel");
  if(sel){sel.onchange=()=>LS.set("pj-gemini-model",sel.value);
    if(!gList&&navigator.onLine!==false)gModels().then(l=>{if(l.length){gList=l;if(showSettings)drawPanel()}}).catch(()=>{})}
  bar.classList.toggle("hidden",!usable());
  if(usable()){ensureTok();
    if(!log.innerHTML)log.innerHTML=`<div class="ainote">Ask me things like:<br>• how do I ask for a bigger size?<br>• what do I say when I bump into someone?<br>• is there a casual way to say thank you?</div>`}
}
function openAsk(){drawPanel();localInit();if(usable())aq.focus()}

// ---------- lookup (the "RAG" part) ----------
// Every hand-written sentence (main phrase, "also", examples, replies) is its own
// searchable item, scored by how rare the matching words are ("bump" counts far
// more than "say"), so an answer hiding in an example sentence is still found.
let SENT=null;
const QSTOP=new Set([...STOP,"when","someone","something","there","way","get","should","tell","ask","some","say","saying","said"]);
function sentIndex(){
  if(SENT)return SENT;
  SENT=[];const df=new Map();
  for(const x of ENTRIES){const e=x.e;
    const wordCard=e.tags.includes("dict");   // its examples are copies of sentences from real cards
    [e,...e.also,...e.examples,e.reply].forEach((b,i)=>{if(!b||(wordCard&&i>0))return;
      const ws=new Set(words(b.en+(i===0?" "+e.find:"")).map(stem).filter(w=>!QSTOP.has(w)));
      SENT.push({x,b,ws,main:i===0});ws.forEach(w=>df.set(w,(df.get(w)||0)+1))})}
  SENT.df=df;return SENT;
}
function sentHits(raw){
  const S=sentIndex(),N=S.length,SY=window.SYN||{};
  const qs=[...new Set(words(raw).filter(w=>!QSTOP.has(w)).map(stem))];
  if(!qs.length)return[];
  const alt=new Map(qs.map(t=>[t,(SY[t]||[]).map(stem)]));
  const idf=t=>Math.log(N/(1+(S.df.get(t)||0)));
  return S.map(s=>{let sc=0;
      for(const t of qs){if(s.ws.has(t))sc+=idf(t);else if(alt.get(t).some(y=>s.ws.has(y)))sc+=idf(t)*.6}
      return[sc/(1+.04*s.ws.size)+(s.main?.3:0),s]})
    .filter(a=>a[0]>1.5).sort((a,b)=>b[0]-a[0]).slice(0,8);
}
function retrieve(q){
  const items=[],seen=new Set();
  const add=(kind,o)=>{const k=(kind==="dict"?o[0]:kind==="sent"?o.b.jp:o.e.jp).replace(/[。、？?！!\s]/g,"");   // one line per Japanese sentence
    if(seen.has(k)||items.length>=12)return;seen.add(k);items.push({kind,o})};
  const raw=q.toLowerCase().normalize("NFKC").replace(/[?!.,"“”]/g," ").trim();
  rank(raw).filter(a=>a[0]>=18).slice(0,3).forEach(a=>add("card",a[1]));
  sentHits(raw).forEach(([,s])=>s.main?add("card",s.x):add("sent",s));
  rank(raw).filter(a=>a[0]>=3).slice(0,3).forEach(a=>add("card",a[1]));
  const ws=[...new Set(words(raw).filter(w=>!QSTOP.has(w)&&w.length>=3))].slice(0,6);
  for(const w of ws)dictLookup(w).slice(0,1).forEach(d=>add("dict",d));
  return items;
}
const short=(s,n)=>s.length>n?s.slice(0,n).replace(/\s\S*$/,"")+"…":s;
const itemCard=it=>it.kind==="card"?it.o:it.kind==="sent"?it.o.x:null;
const itemText=(it,i)=>it.kind==="card"
  ?`[${i+1}] ${it.o.e.jp} = ${it.o.e.en}${it.o.e.note?" ("+short(it.o.e.note,110)+")":""}`
  :it.kind==="sent"?`[${i+1}] ${it.o.b.jp} = ${it.o.b.en}`
  :`[${i+1}] ${it.o[0]} = ${short(it.o[4],80)} (dictionary word, not a phrase)`;

// ---------- checking an AI-made sentence ----------
let VOCAB=null,CORPUS="";
function vocab(){
  if(VOCAB)return VOCAB;
  VOCAB=new Set();
  (window.DICT||[]).forEach(d=>{VOCAB.add(d[0]);VOCAB.add(d[1])});
  const parts=[];
  for(const x of ENTRIES){const e=x.e;VOCAB.add(e.jp);VOCAB.add(e.kana);
    [e,...e.also,...e.examples,e.reply].forEach(b=>b&&parts.push(b.jp,b.kana||""))}
  CORPUS=parts.join("\n");
  return VOCAB;
}
const hira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));
const R={あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",ぁ:"a",ぃ:"i",ぅ:"u",ぇ:"e",ぉ:"o",ゔ:"vu"};
const Y={ゃ:"a",ゅ:"u",ょ:"o",ぇ:"e"};
function romaji(k){
  k=hira(k);let o="",dbl=false;
  for(let i=0;i<k.length;i++){
    const c=k[i],n=k[i+1];let r;
    if(c==="っ"){dbl=true;continue}
    if(c==="ー"){r=o.slice(-1);o+=/[aiueo]/.test(r)?r:"";continue}
    if(n&&Y[n]&&R[c]&&/i$/.test(R[c])&&c!=="い"){
      const b=R[c];r=(/^(sh|ch|j)/.test(b)?b.slice(0,-1):b.slice(0,-1)+"y")+Y[n];i++;
    }else if(n&&"ぁぃぅぇぉ".includes(n)&&(c==="ふ"||c==="て"||c==="で"||c==="う"||c==="ゔ")){
      r=({ふ:"f",て:"t",で:"d",う:"w",ゔ:"v"})[c]+R[n];i++;
    }else r=R[c];
    if(r==null)return null;
    if(c==="ん"&&n&&/^[aiueoy]/.test(R[n]||""))r="n'";
    if(dbl){r=(r.startsWith("ch")?"t":r[0])+r;dbl=false}
    o+=r;
  }
  return o;
}
// 何 + counter: these readings are regular and safe (rendaku checked by hand)
const NAN={"分":"ぷん","時":"じ","時間":"じかん","人":"にん","個":"こ","本":"ぼん","枚":"まい","回":"かい","歳":"さい","円":"えん","日":"にち","階":"がい","番":"ばん","名":"めい","泊":"ぱく","駅":"えき","月":"がつ","杯":"ばい","匹":"びき","冊":"さつ","台":"だい","件":"けん","週間":"しゅうかん","年":"ねん","度":"ど","番線":"ばんせん","号車":"ごうしゃ"};
const FREE=new Set(["助詞","助動詞","記号","接頭詞"]);
function check(jp){
  if(!tok)return{bad:"the word checker has not loaded (it needs internet the first time)"};
  const V=vocab();
  jp=jp.replace(/\s+/g,"").replace(/[.]$/,"。");
  if(!jp||/[A-Za-z]/.test(jp))return{bad:"it mixed in non-Japanese letters"};
  if(!/[ぁ-ヿ一-鿿]/.test(jp))return{bad:"it wasn't Japanese"};
  const ts=tok.tokenize(jp),grp=[],warn=[];   // grp: kana for each spoken word; romaji made at the end
  for(let i=0;i<ts.length;i++){
    const t=ts[i],s=t.surface_form,base=t.basic_form&&t.basic_form!=="*"?t.basic_form:s;
    const kata=/^[ァ-ヶー]+$/.test(s);
    if(t.pos==="記号"){continue}
    if(s.length>1&&s[0]==="何"&&NAN[s.slice(1)]){grp.push("なん"+NAN[s.slice(1)]);continue}   // 何分 as one token
    // numbers + counters change sound irregularly (ippon, sanbon, hitori): only 何 + a known counter is allowed
    const nx=ts[i+1];
    if(nx&&nx.pos_detail_2==="助数詞"&&(t.pos_detail_1==="数"||s==="何")){
      const k=s==="何"&&NAN[nx.surface_form+(ts[i+2]&&ts[i+2].surface_form==="間"?"間":"")];
      if(!k)return{bad:`numbers with counters (“${s}${nx.surface_form}”) are read irregularly, so I can't confirm the reading`};
      grp.push("なん"+k);i+=k.endsWith("かん")&&!nx.surface_form.endsWith("間")?2:1;continue;
    }
    if(t.pos_detail_1==="数")return{bad:`I can't confirm how the number “${s}” is read`};
    const free=FREE.has(t.pos)||t.pos_detail_1==="非自立"||t.pos_detail_1==="接尾";
    if(!free){
      const known=V.has(base)||V.has(s)||(t.reading&&V.has(hira(t.reading))&&base===s)||(s.length>=2&&CORPUS.includes(s));
      if(!known){
        if(kata&&t.pos==="名詞")warn.push(s);
        else return{bad:`I couldn't confirm the word “${s}”`};
      }
    }
    let rd=t.reading||(/^[ぁ-ヿー]+$/.test(s)?s:null);
    if(!rd)return{bad:`I couldn't confirm how “${s}” is read`};
    rd=hira(rd);
    if(s==="何")rd=nx&&/^[だでなの]/.test(nx.surface_form)?"なん":"なに";   // nan desu ka / nani ga
    if(t.pos==="助詞"){if(s==="は")rd="わ";else if(s==="へ")rd="え";else if(s==="を")rd="お"}
    const glue=grp.length&&((t.pos==="助動詞"&&!/^(で|だ)/.test(s))||t.pos_detail_1==="接尾"||(t.pos==="助詞"&&t.pos_detail_1==="接続助詞"&&/^[てで]$/.test(s))||ts[i-1].pos==="接頭詞"||/っ$/.test(grp[grp.length-1]));
    if(glue)grp[grp.length-1]+=rd;else grp.push(rd);
  }
  if(!grp.length)return{bad:"it was empty"};
  const rom=[];
  for(const g of grp){const r=romaji(g);if(r==null)return{bad:"I couldn't confirm the reading"};rom.push(r)}
  return{jp:jp.replace(/。$/,""),romaji:rom.join(" "),warn};
}

// ---------- chat ----------
function render(text,items,allowSay){
  let html="",shown=0,cards=0,notes=0,says=0,bads=0;const usedJP=new Set(),seenLine=new Set();
  for(let line of text.split(/\n+/)){
    line=line.trim().replace(/^[-*•]\s*/,"");
    if(seenLine.has(line))continue;seenLine.add(line);   // small models loop: ignore repeats
    let m;
    if((m=/^CARD\s*\[?#?(\d+)\]?[:.]?\s*(.*)$/i.exec(line))){
      const it=items[+m[1]-1];
      if(it&&cards<2){
        const card=itemCard(it),k=card?card.e.jp:it.o[0];
        if(!usedJP.has(k)){usedJP.add(k);cards++;shown++;
          if(it.kind==="sent")html+=`<div class="aimeta">Found on this card: <b lang="ja">${esc(it.o.b.jp)}</b> = ${esc(it.o.b.en)}</div>`;
          html+=card?cardHTML(card.e,card.where):dictCard(it.o,null)}
      }
      line=m[2];if(!line)continue;   // models often put "Japanese = English" on the same line
    }
    if((m=/^NOTE\s*[:：]?\s*(.+)$/i.exec(line))){
      if(/[぀-ヿ㐀-鿿가-힯]/.test(m[1]))continue;   // not plain English (or drifted into Chinese)
      if(notes>=1||(shown&&/not sure/i.test(m[1])))continue;notes++;
      html+=`<div class="ainote">${esc(m[1])}<small>AI explanation</small></div>`;shown++;
      continue;
    }
    // any "Japanese = English" line is treated as a sentence the AI wants to offer
    const parts=line.replace(/^SAY\s*[:：]?\s*/i,"").split(/[=＝]/).map(s=>s.trim());
    if(parts.length<2)continue;
    const ji=parts.findIndex(p=>/[ぁ-ヿ一-鿿]/.test(p)&&!/[A-Za-z]{2,}/.test(p));
    if(ji<0||ji===parts.length-1)continue;
    const jp=parts[ji].replace(/^[「"“『]|[」"”』]$/g,""),en=parts[parts.length-1];
    if(/[ぁ-ヿ一-鿿]/.test(en)||jp.includes("〜")||jp.includes("~"))continue;
    // the AI repeated a hand-written sentence: show the real card instead
    const norm=s=>s.replace(/[。、？?！!\s]/g,"");
    const same=sentIndex().find(s=>norm(s.b.jp)===norm(jp));
    if(same){if(!usedJP.has(same.x.e.jp)&&cards<3){usedJP.add(same.x.e.jp);cards++;html+=cardHTML(same.x.e,same.x.where);shown++}continue}
    if(!allowSay||says>=2||usedJP.has(norm(jp)))continue;says++;   // only the online AI may offer its own sentencesusedJP.add(norm(jp));
    const c=check(jp);
    if(c.bad){if(!bads++){html+=`<div class="ainote">The AI wrote a sentence, but ${esc(c.bad)}, so I'm not showing it. Try asking in simpler words, or use Search.</div>`;shown++}continue}
    html+=`<div class="card dict"><div class="where">AI-made sentence · every word was checked against the dictionary, but no person has checked the sentence</div>${ttsBlock(c.jp,c.romaji,"")}<div class="en">${esc(en)}</div>${c.warn.length?`<div class="note">Not in the dictionary (probably a name or borrowed word): ${esc(c.warn.join(", "))}</div>`:""}<div class="tags"><span class="careful">AI-made</span></div></div>`;
    shown++;
  }
  if(!shown)html=`<div class="ainote">I'm not sure how to help with that one. Try the Search tab, or ask in different words.</div>`;
  return html;
}
async function send(q){
  if(busy||!q.trim()||!usable())return;
  busy=true;aq.value="";
  const you=document.createElement("div");you.className="you";you.textContent=q;log.appendChild(you);
  const out=document.createElement("div");out.innerHTML=`<div class="ainote dots">Looking it up</div>`;log.appendChild(out);
  you.scrollIntoView({block:"start",behavior:"smooth"});
  try{
    const items=retrieve(q);
    const ctx=items.length?items.map(itemText).join("\n"):"(no matching entries)";
    const msgs=[{role:"system",content:SYSTEM}];
    history.slice(-2).forEach(h=>msgs.push({role:"user",content:"QUESTION: "+h.q},{role:"assistant",content:h.a}));
    msgs.push({role:"user",content:`PHRASEBOOK ENTRIES:\n${ctx}\n\nQUESTION: ${q}`});
    await Promise.race([ensureTok(),new Promise(r=>setTimeout(r,8000))]);
    // online first; the on-device model takes over if Gemini can't answer
    let text=null,by="",gErr=null;
    if(gKey()){
      if(navigator.onLine===false)gErr=new Error("offline");
      else try{text=await gAsk(msgs);by="Gemini ("+gModel()+")"}catch(e){gErr=e}
    }
    if(text==null){
      if(localState==="ready"){text=await localAsk(msgs);by="the offline AI"+(gErr?" · Gemini wasn't used because "+gWhy(gErr):"")}
      else{
        // no AI available right now: fall back to the closest hand-written cards
        const cards=items.filter(it=>it.kind!=="dict").slice(0,2);
        out.innerHTML=`<div class="ainote">Gemini couldn't answer because ${esc(gWhy(gErr))}${gErr&&gErr.status&&gErr.status!==429?" ("+esc(gErr.message).slice(0,140)+")":""}. ${
          cards.length?"Here are the closest hand-written cards instead.":"I found no matching cards either; try the Search tab."}${
          localState==="loading"?" The offline AI is still getting ready.":""}</div>`+
          cards.map(it=>{const c=itemCard(it);return cardHTML(c.e,c.where)}).join("");
        busy=false;return;
      }
    }
    window.__lastAI={q,ctx,text,by};
    history.push({q,a:text});history=history.slice(-2);
    out.innerHTML=render(text,items,by.startsWith("Gemini"))+`<div class="aimeta">Answered by ${esc(by)}</div>`;
  }catch(e){
    out.innerHTML=`<div class="ainote">The AI stopped unexpectedly (${esc(String(e&&e.message||e)).slice(0,120)}). Try again.</div>`;
  }
  busy=false;
}
bar.addEventListener("submit",ev=>{ev.preventDefault();send(aq.value)});
window.__ask={retrieve,check:s=>check(s),render,romaji,send,show,drawPanel,bestModel,
  setLocal:s=>{localState=s},setEngine:(e,t)=>{engine=e;localState=e?"ready":localState;if(t)tok=t},state:()=>({localState,localPct,key:!!gKey(),model:gModel(),tok:!!tok}),clear:()=>{history=[]}};
})();
