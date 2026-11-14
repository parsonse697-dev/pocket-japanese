// Pocket Japanese: the "Ask" tab.
//
// No AI is needed. A question is answered in this order:
//   1. Lookup: the closest hand-written cards and sentences.
//   2. Patterns: common question shapes -> a hand-written pattern + one word.
//   3. Grammar rules (compose.js, spliced in below): simple sentences built from
//      card/dictionary words with the regular polite endings.
//   4. Otherwise: each word on its own.
// Optional extra: Google Gemini with the user's own key. Its sentences are word-checked
// and labelled AI-made. Small on-device models were removed: they could only pick
// cards (which step 1 already does) and they crashed phones.
(function(){
"use strict";
// ---------- pattern + word ("FILL") ----------
// Hand-picked patterns from the phrasebook whose gap takes a plain thing or place.
// The AI names a pattern letter and an ENGLISH word; the app finds the Japanese
// word in the cards/dictionary and joins them. The AI writes no Japanese here.
const PATTERNS=[
  ["〜はありますか","Do you have ___? / Is there ___?"],
  ["〜はどこですか","Where is ___?"],
  ["〜を探しています","I'm looking for ___"],
  ["〜をお願いします","___, please"],
  ["〜がほしいです","I want ___"],
  ["〜抜きでお願いします","Without ___, please"],
  ["〜が食べられません","I can't eat ___"],
  ["〜は入っていますか","Does this contain ___?"],
  ["〜アレルギーがあります","I'm allergic to ___"],
  ["〜に効く薬はありますか","Do you have medicine for ___?"],
  ["近くに〜はありますか","Is there a ___ nearby?"],
  ["〜に行きたいんですが","I'd like to go to ___ (how do I get there?)"],
  ["〜までどうやって行けばいいですか","How do I get to ___?"],
  ["〜までお願いします","To ___, please (taxi)"],
  ["〜までいくらですか","How much is it to ___?"],
  ["このバスは〜に行きますか","Does this bus go to ___?"],
  ["この電車は〜に止まりますか","Does this train stop at ___?"],
  ["〜って何ですか","What is ___?"]];
const PLIST=PATTERNS.map((p,i)=>String.fromCharCode(65+i)+") "+p[1]).join("\n");
const FILL_RULES=`SENTENCE PATTERNS (hand-written, always correct):
${PLIST}

FILL <letter> <English word> -> use when the user wants exactly one of these patterns with a specific thing or place in the gap. Write the word in ENGLISH; the app finds the Japanese. Examples: "do you have a blanket" -> FILL A blanket. "does this bus go to Kyoto station" -> FILL P Kyoto station. Only for things and places, never for actions.`;
// word types come from tables made when the app is built (CARDPOS for cards, DICT[6] for the dictionary)
const dflag=(jp,f)=>{wix();const d=JPX&&JPX.get(jp);return!!d&&(d[6]||"").split(",").includes(f)};
const isNounJP=jp=>!/[〜~\/\s]/.test(jp)&&(CARDPOS[jp]?!!CARDPOS[jp][0]:dflag(jp,"N"));
let PLACEJP=null;
const isPlace=jp=>{if(CARDPOS[jp])return !!CARDPOS[jp][3];if(dflag(jp,"pl"))return true;if(!PLACEJP&&window.PLACES)PLACEJP=new Set(Object.values(window.PLACES).map(r=>r[0]));return !!(PLACEJP&&PLACEJP.has(jp))};
const NOUNC=new Map();
const MATERIAL={iron:"iron",gold:"gold",golden:"gold",silver:"silver",copper:"copper",wood:"wood",wooden:"wood",stone:"stone",glass:"glass",paper:"paper",plastic:"plastic",leather:"leather",cotton:"cotton",wool:"wool",steel:"steel",diamond:"diamond",metal:"metal",rubber:"rubber",sand:"sand",dirt:"dirt",mud:"mud",snow:"snow",ice:"ice",bamboo:"bamboo",silk:"silk",brick:"brick",coal:"coal"};
// order: the everyday word list, then hand-written cards, then the dictionary; plural forms too
function findNoun(w){
  if(NOUNC.has(w))return NOUNC.get(w);
  const n=findNoun0(w);if(window.DICT){if(NOUNC.size>400)NOUNC.clear();NOUNC.set(w,n)}return n;
}
function findNoun0(w){
  const base=w.toLowerCase().normalize("NFKC").replace(/[.?!"“”]/g,"").trim().replace(/^(a|an|the|some|any|my|your|this|that) /,"");
  if(!base||base.startsWith("to ")||NOTNOUN.has(base))return null;   // "to go", "to eat": actions don't fit these patterns
  const forms=[...new Set([base,base.replace(/ies$/,"y"),base.replace(/(es|s)$/,""),base.replace(/s$/,"")])].filter(Boolean);
  // the checked everyday-word list (data/everyday_words.txt) comes first
  const PK=window.PICK||{},D=window.DICT||[];
  for(const f of forms){const i=PK[f];if(i!=null&&D[i]){const d=D[i];return{jp:d[0],kana:d[1],pos:d[6]||"",en:d[4].split(";")[0].trim(),kind:"everyday"}}}
  for(const f of forms){const P=PREF.n[f];if(P){const n=byJP(P,"n");if(n)return n}}
  for(const f of forms){const n=findNoun1(f,"card");if(n)return n}
  for(const f of forms){const n=findNoun1(f,"dict");if(n)return n}
  // a place name typed in romaji ("shinjuku", "ueno"): JMnedict, by the spelling
  {const P=window.PLACES,k=String(w||"").toLowerCase().replace(/[^a-z]/g,"");if(P&&P[k])return{jp:P[k][0],kana:P[k][1],rom:P[k][2],say:P[k][3],pos:"N,pl",en:k.charAt(0).toUpperCase()+k.slice(1)+" (place)",kind:"dictionary"}}
  return null;
}
function findNoun1(w,only){
  const r=only==="dict"?null:rank(w).find(a=>a[0]>=18&&a[1].f.single&&isNounJP(a[1].e.jp));
  if(r)return{jp:r[1].e.jp,kana:r[1].e.kana,en:r[1].e.en,kind:"card"};
  if(only==="card")return null;
  const d=dictWord(w,"n");
  if(d&&!/[〜~\/\s]/.test(d.jp)&&(d.pos||"").split(",").includes("N"))return d;
  // any common dictionary noun whose meaning is exactly this word (JMdict marks it as a noun)
  const dl=dictLookup(w).find(d=>d[5]&&!/(^|,)x(,|$)/.test(d[6]||"")&&!/[〜~\/\s]/.test(d[0]));
  if(dl)return{jp:dl[0],kana:dl[1],pos:dl[6]||"",en:dl[4].split(";")[0].trim(),kind:"dictionary"};
  const ps=w.split(" ");
  // "iron nugget", "wooden sword": a material + a thing is joined with の (tetsu no nagetto)
  if(ps.length===2&&MATERIAL[ps[0]]){const a=findNoun(MATERIAL[ps[0]]),b=findNoun(ps[1]);
    if(a&&b){const ra=romaji(a.kana),rb=romaji(b.kana),sa=sayWord(a.kana),sb=sayWord(b.kana);
      if(ra&&rb)return{jp:a.jp+"の"+b.jp,kana:a.kana+"の"+b.kana,rom:ra+" no "+rb,say:sa&&sb?sa+" noh "+sb:"",en:w+" ("+ps[1]+" of "+MATERIAL[ps[0]]+")",kind:"dictionary"}}}
  // two words like "kyoto station": try the pieces as one Japanese compound (京都 + 駅)
  // only when the result is a known word, or a place name + 駅 (station)
  if(ps.length===2){const a=findNoun(ps[0]),b=findNoun(ps[1]);
    if(a&&b){const j=a.jp+b.jp;vocab();
      // a place name + a landmark word is one name: 東京タワー, 大阪城, 京都駅, 成田空港
      if(VOCAB.has(j)||CORPUS.includes(j)||(/^(駅|タワー|城|空港|公園|大学|神社|港|動物園|水族館|美術館|博物館|温泉|山|川|湖|島)$/.test(b.jp)&&isPlace(a.jp)))return{jp:j,kana:a.kana+b.kana,en:w,kind:"dictionary"};
      const P=window.PICK||{};
      if(!isPlace(a.jp)&&!isPlace(b.jp)&&P[ps[0]]!=null&&P[ps[1].replace(/s$/,"")]!=null||P[ps[1]]!=null&&P[ps[0]]!=null){
        if(!(window.PICKA&&window.PICKA[ps[0]]!=null)&&!PREF.adj[ps[0]]&&romaji(a.kana)&&romaji(b.kana))
          return{jp:a.jp+"の"+b.jp,kana:a.kana+"の"+b.kana,parts:[[a.jp,a.kana],["の","の"],[b.jp,b.kana]],en:w+" (the "+ps[0]+"'s "+ps[1]+")",kind:"dictionary"}}}}
  return null;
}
// the card's guide leaves the gap out ("wah ah-ree-mahss kah"): put the word's guide back where the ~ is in the romaji
function patSay(e,ws){
  if(!ws||!e.say)return"";
  const rw=e.romaji.split(" "),sw=e.say.split(" "),k=rw.indexOf("~");
  if(k<0||sw.length!==rw.length-1)return"";
  return[...sw.slice(0,k),ws,...sw.slice(k)].join(" ");
}
function fillHTML(letter,word){
  const p=PATTERNS[letter.toUpperCase().charCodeAt(0)-65];if(!p)return null;
  word=word.replace(/\s*[=＝(（].*$/,"").trim();if(!window.DICT||!word||/[ぁ-ヿ一-鿿]/.test(word))return null;   // dictionary not loaded yet: no sentence
  const n=findNoun(word)||npNoun(word),label=`<div class="where">Built by the app: a hand-written pattern + ${n&&n.kind==="everyday"?"an everyday":"a "+(n?n.kind:"")} word · the whole sentence was not checked by a person</div>`;
  const en=esc(p[1].split("___").join(word));
  const base=ENTRIES.find(x=>x.e.jp===p[0]);if(!base)return null;
  if(n){
    // reading comes from the card/dictionary and the hand-written pattern: nothing is guessed
    const wr=n.rom||romaji(n.kana);if(wr==null)return null;
    fillHTML.last=p[0].replace("〜",n.jp);fillHTML.used=[n.jp];
    return`<div class="card dict">${label}${ttsBlock(p[0].replace("〜",n.jp),base.e.romaji.replace("~",wr),patSay(base.e,n.say||sayWord(n.kana)))}<div class="en">${en}</div><div class="note">Word used: <span lang="ja">${esc(n.jp)}</span> (${esc(wr)}) = ${esc(n.en)}</div><div class="tags"><span>pattern + word</span></div></div>`;
  }
  // not in the cards or dictionary: names and brands are said as they are
  // only for real names ("Nutella", "Tokyo Dome"): capitalised, and unknown to both the cards and the dictionary
  if(!isName(word))return null;
  fillHTML.last=p[0].replace("〜",word);fillHTML.used=[word];
  return`<div class="card dict"><div class="where">Built by the app: a hand-written pattern + your word as it is</div>${ttsBlock(p[0].replace("〜",word),base.e.romaji.replace("~",word),patSay(base.e,word))}<div class="en">${en}</div><div class="note">“${esc(word)}” is not in the dictionary. Names, brands and borrowed words are usually said as they are, with a Japanese accent.</div><div class="tags"><span>pattern + word</span></div></div>`;
}

// ---------- sentence builder without any AI ----------
// Common question shapes are recognised from the English itself and mapped to a
// hand-written pattern. First matching rule wins, so specific shapes come first.
const RULES=[
  ["K",/\bis there (?:an? |any )?(.+?) (?:near(?:by)?|around|close)(?! (?:the|my|our|this|that) )\b/i],["K",/\b(?:nearest|closest) (.+)/i],
  ["I",/\ballerg(?:ic|y) to (.+)/i],["I",/\b([a-z]+) allergy\b/i],
  ["J",/\b(?:medicine|pills?|tablets?|(?:have|need|got|give me|recommend|take|is there|are there) (?:something|anything)) for (?:an? |my |the )?(?!(?:mom|dad|mother|father|sister|brother|wife|husband|friend|son|daughter|kids?|boyfriend|girlfriend|family|parents|grandma|grandpa|boss|teacher|her|him|them|you|me|dinner|lunch|breakfast|the trip|my trip|christmas|birthday)\b)(.+)/i],
  ["F",/\bwithout (?:the |any )?(.+)/i],["F",/\b(?:hold|skip|leave out|remove) the (.+)/i],
  ["G",/^(?:i|we) (?:can'?t|cannot|don'?t|do not) eat (.+)/i],
  ["H",/\bdoes (?:this|it|that) (?:contain|have|include) (?:any )?(.+)/i],["H",/\b(?:is|are) there (?:any )?(.+?) in (?:this|it|that|here)\b/i],
  ["P",/\b(?:does|is|will) (?:this|the|that) bus (?:go|going|stop|stopping) (?:to|at) (.+)/i],
  ["Q",/\b(?:does|is|will) (?:this|the|that) train (?:stop|stopping|go|going) (?:at|to|in) (.+)/i],
  ["O",/\bhow much (?:is it |does it cost |is the fare |is a ticket )?to (?:get to |go to )?(.+)/i],
  ["M",/\bhow (?:do|can|should) (?:i|we) get to (.+)/i],["M",/\b(?:how to get|directions|the way) to (.+)/i],
  ["N",/\b(?:take|drive) (?:me|us) to (.+)/i],
  ["L",/\b(?:i|we) (?:want|wanna|need|would like|'d like) to go to (.+)/i],
  ["C",/\blooking for (?:an? |the |some |my )?(.+)/i],
  ["B",/\b(?:do you know|can you tell me|could you tell me|tell me|i don'?t know) where (?:the |an? |my )?(.+?) (?:is|are)$/i],
  ["B",/\bwhich way (?:is|to) (?:the |an? )?(.+)/i],
  ["B",/\bwhere(?:'s| is| are| can i find| do i find| would i find) (?:the |an? |my )?(.+)/i],
  ["A",/\b(?:do|does|did) (?:you|they|this (?:store|shop|place)|the (?:store|shop|hotel)) (?:have|sell|carry) (?:an? |any |some |the )?(.+)/i],
  ["A",/\bis there (?:an? |any )?(.+)/i],
  ["D",/\b(?:can|could|may) (?:i|we) (?:have|get) (?:an? |some |the |another )?(.+)/i],
  ["D",/\b(?:i|we)(?:'d| would) like (?:an? |some |the |another )?(.+)/i],
  ["E",/\b(?:i|we) want (?:an? |some |the |another )?(.+)/i]];
function ruleFill(q){
  const s=cleanQ(q);
  for(const[L,re]of RULES){
    const m=re.exec(s);if(!m)continue;
    // more said before the question ("my phone is dying do you have a charger"): left to the sentence builder, so nothing is lost
    {const pre=s.slice(0,m.index).replace(/[,.!?]/g," ").trim();if(pre&&!pre.split(/\s+/).every(w=>/^(excuse|me|sorry|hi|hello|hey|um|uh|so|ok|okay|please|and|also|then|oh|well|yes|no|thanks|thank|you|i|i'm|im|we|we're|am|are|is|do|does|can|could|would|will|may|how|much|just|really|still|but|actually|kindly|sir|maam|ma'am)$/i.test(w)))return null}
    const w=m[1].replace(/[,.]? please$/i,"").replace(/\s+(?:here|around here|near here|nearby|for me|today|now|right now)$/i,"").replace(/["”']$/,"")
      .replace(/\s+(?:at|to|located|from|in|on)$/i,"").trim();   // "where is the vending machine at"
    if(!w||/^to /i.test(w)||w.split(" ").length>3||/^(bed|sleep|the bed)$/i.test(w)||/^(this|that|these|those) /i.test(w))return null;
    if(w.split(" ").some((x,i,a)=>TIME[x.toLowerCase()]!==undefined||TIME[a.slice(i).join(" ").toLowerCase()]!==undefined))return null;   // "Osaka tomorrow": left to the sentence builder
    return fillHTML(L,w);
  }
  return null;
}

// ---------- sentence builder 2: grammar rules + words by type ----------
// Builds simple sentences ("this wall is scary", "I want to buy a ticket") from
// fixed grammar rules. Every Japanese word and its reading comes from a card or
// the dictionary; the rules only add the regular polite endings. Anything the
// rules do not clearly cover is NOT built (the cards and a word list are shown).
let WIX=null,JPX=null;
function wix(){
  if(WIX)return WIX;
  if(!window.DICT)return new Map();
  WIX=new Map();JPX=new Map();
  window.DICT.forEach(d=>{
    if(!JPX.has(d[0]))JPX.set(d[0],d);
    d[4].split(";").forEach((sn,si)=>sn.split("/").forEach((g,gi)=>{const k=gkey(g);if(!k)return;let a=WIX.get(k);if(!a)WIX.set(k,a=[]);a.push([si*3+gi,d])}))});
  return WIX;
}
const isAdj=d=>/adj-(i|na|no)/.test(d[6]||""),isVerb=d=>/(^|,)(v1|v5|vk|vs)/.test(d[6]||"")&&!/vs-s|v1-s/.test(d[6]);
const okType=(d,t)=>t==="any"?true:t==="adj"?isAdj(d):t==="v"?isVerb(d):!!d[5];
const gloss=d=>d[4].split(";")[0].trim();
// a Japanese word we name ourselves: it must exist in the dictionary or on a card,
// and its reading and word type are taken from there
function byJP(alts,type){
  wix();if(!JPX)return null;
  for(const alt of alts.split("|")){
    const[jp,kk]=alt.split(":");   // "開く:あく": this reading, not ひらく
    const d=kk?window.DICT.find(x=>x[0]===jp&&x[1]===kk):JPX.get(jp);
    if(d&&okType(d,type))return{jp:d[0],kana:d[1],pos:d[6]||"",en:gloss(d),kind:"dictionary"};
    const x=ENTRIES.find(x=>x.e.jp===jp&&x.f.single);
    if(x){const w=fromCard(x,type);if(w)return w}
  }
  return null;
}
function fromCard(x,type){
  const jp=x.e.jp,kana=x.e.kana;wix();if(!JPX)return null;
  let d=JPX.get(jp);
  const cp=CARDPOS[jp];
  if(!d&&type==="v"&&cp&&cp[1]==="v")d=JPX.get(cp[2]);   // cards give verbs in the polite form: 行きます -> 行く
  if(d)return okType(d,type)?{jp:d[0],kana:d[1],pos:d[6]||"",en:x.e.en,kind:"card"}:null;
  if(!kana||!cp)return null;
  if(type==="adj"){
    if(cp[1]==="i"&&jp.endsWith("い"))return{jp,kana,pos:"adj-i",en:x.e.en,kind:"card"};
    if(cp[1]==="na")return{jp,kana,pos:"adj-na",en:x.e.en,kind:"card"};
  }
  return null;
}
// The usual word for very common meanings (so "big" is always 大きい, not a rarer
// synonym). Each one is looked up, never trusted blindly: see byJP.
const PREF={n:{report:"レポート",traffic:"渋滞",staff:"スタッフ",doorbell:"チャイム",fan:"扇風機",earth:"地球",feet:"足",type:"タイプ",power:"電気",wall:"壁",door:"ドア",window:"窓",room:"部屋",house:"家",home:"家",bag:"かばん|鞄",soup:"スープ",chair:"椅子|いす",table:"テーブル",desk:"机",bed:"ベッド",key:"鍵",money:"お金",
  car:"車",bike:"自転車",bicycle:"自転車",train:"電車",bus:"バス",taxi:"タクシー",plane:"飛行機",airplane:"飛行機",boat:"船",ship:"船",station:"駅",airport:"空港",hotel:"ホテル",shop:"店",store:"店",
  restaurant:"レストラン",hospital:"病院",pharmacy:"薬局",school:"学校",bank:"銀行","post office":"郵便局",park:"公園",temple:"お寺|寺",shrine:"神社",castle:"城",museum:"博物館",library:"図書館",
  toilet:"トイレ",bathroom:"トイレ",restroom:"トイレ",water:"水",tea:"お茶",coffee:"コーヒー",beer:"ビール",food:"食べ物",rice:"ご飯",bread:"パン",meat:"肉",fish:"魚",egg:"卵",vegetable:"野菜",fruit:"果物",
  book:"本",phone:"スマホ",smartphone:"スマホ",photo:"写真",picture:"写真",map:"地図",wallet:"財布",passport:"パスポート",umbrella:"傘",hat:"帽子",shoe:"靴",shoes:"靴",clothes:"服",shirt:"シャツ",towel:"タオル",
  medicine:"薬",doctor:"医者",friend:"友達",family:"家族",child:"子供",kid:"子供",man:"男の人",woman:"女の人",person:"人",people:"人",teacher:"先生",student:"学生",dog:"犬",cat:"猫",bird:"鳥",
  tree:"木",flower:"花",mountain:"山",river:"川",sea:"海",ocean:"海",beach:"ビーチ",sky:"空",rain:"雨",snow:"雪",wind:"風",weather:"天気",fire:"火",road:"道",street:"通り",bridge:"橋",building:"建物",
  town:"町",city:"街",country:"国",world:"世界",movie:"映画",film:"映画",music:"音楽",song:"歌",game:"ゲーム",plate:"皿",dish:"皿",knife:"ナイフ",spoon:"スプーン",fork:"フォーク",chopsticks:"箸",
  trash:"ゴミ",garbage:"ゴミ",floor:"床",stairs:"階段",elevator:"エレベーター",exit:"出口",entrance:"入口|入り口",price:"値段",size:"サイズ",color:"色",colour:"色",sound:"音",noise:"音",smell:"匂い",taste:"味",
  name:"名前",time:"時間",night:"夜",morning:"朝",work:"仕事",job:"仕事",question:"質問",problem:"問題",place:"場所",word:"言葉",language:"言語",japanese:"日本語",english:"英語",japan:"日本",
  bath:"お風呂|風呂",shower:"シャワー",luggage:"荷物",baggage:"荷物",suitcase:"スーツケース",receipt:"レシート",menu:"メニュー",seat:"席","air conditioner":"エアコン",tv:"テレビ",television:"テレビ",
  computer:"パソコン",charger:"充電器",battery:"電池",head:"頭",stomach:"お腹",tooth:"歯",teeth:"歯",hand:"手",foot:"足",leg:"足",eye:"目",ear:"耳",throat:"喉",back:"背中",hair:"髪",face:"顔",
  ramen:"ラーメン",sushi:"寿司",sake:"日本酒",alcohol:"お酒",juice:"ジュース",milk:"牛乳",sugar:"砂糖",salt:"塩",ice:"氷",glass:"グラス",bottle:"瓶",box:"箱",paper:"紙",pen:"ペン",card:"カード",
  ticket:"チケット",blanket:"毛布",pillow:"枕",soap:"石鹸|せっけん",garden:"庭",sun:"太陽",moon:"月",star:"星",animal:"動物",temperature:"温度",fever:"熱",cold:"風邪",pain:"痛み"},
 adj:{big:"大きい",large:"大きい",small:"小さい",little:"小さい",tiny:"小さい",spicy:"辛い",expensive:"高い",pricey:"高い",cheap:"安い",tall:"高い",high:"高い",low:"低い",
  gay:false,lesbian:false,free:c=>c&&c.thing?"無料":null,crazy:c=>c&&c.thing?"ヤバい|やばい|すごい":null,insane:c=>c&&c.thing?"ヤバい|やばい|すごい":null,good:"いい",nice:c=>c&&c.an&&!c.thing?"親切":"いい",great:"すごい",amazing:"すごい",awesome:"すごい",bad:"悪い",new:c=>c&&c.an?false:"新しい",old:c=>c&&c.an?false:"古い",favorite:"好き",favourite:"好き",rich:c=>c&&(c.thing===null||c.an)?false:"濃厚",free:c=>c&&(c.thing===null||c.an)?"暇":false,fast:"速い|早い",quick:"速い|早い",early:"早い",slow:"遅い",late:"遅い",near:"近い",close:"近い",far:"遠い",
  delicious:"おいしい|美味しい",tasty:"おいしい|美味しい",yummy:"おいしい|美味しい",cute:"かわいい|可愛い",pretty:"きれい|綺麗|奇麗",beautiful:"きれい|綺麗|奇麗",clean:"きれい|綺麗|奇麗",dirty:"汚い",
  quiet:"静か",noisy:"うるさい",loud:"うるさい",busy:"忙しい",fun:"楽しい",enjoyable:"楽しい",interesting:"面白い",funny:"面白い",boring:"つまらない",difficult:"難しい",hard:c=>c&&c.an?false:c&&c.ph?"硬い":"難しい",easy:"簡単",simple:"簡単",
  heavy:"重い",light:"軽い",long:"長い",short:"短い",wide:"広い",spacious:"広い",narrow:"狭い",cramped:"狭い",strong:"強い",weak:"弱い",sweet:"甘い",salty:"しょっぱい|塩辛い",bitter:"苦い",sour:"酸っぱい|すっぱい",
  safe:"安全",dangerous:"危ない",scary:"怖い",frightening:"怖い",cool:"かっこいい",strange:"変",weird:"変",odd:"変",famous:"有名",convenient:"便利",handy:"便利",kind:"優しい",gentle:"優しい",
  sleepy:"眠い",painful:"痛い",sore:"痛い",happy:"嬉しい",glad:"嬉しい",sad:"悲しい",lonely:"寂しい",warm:"暖かい",bright:"明るい",dark:"暗い",soft:"柔らかい",thick:"厚い",thin:"薄い",young:"若い",
  important:"大切",popular:"人気",rare:"珍しい",unusual:"珍しい",wonderful:"素敵",lovely:"素敵",terrible:"ひどい|酷い",awful:"ひどい|酷い",perfect:"完璧",correct:"正しい",
  hot:c=>c&&c.thing&&!c.place?"熱い":"暑い",cold:c=>c&&c.thing&&!c.place?"冷たい":"寒い",fine:"大丈夫",okay:"大丈夫",ok:"大丈夫",smelly:"臭い",stinky:"臭い",embarrassing:"恥ずかしい",embarrassed:"恥ずかしい",
  necessary:"必要",impossible:"無理",complicated:"複雑",polite:"丁寧",rude:"失礼",special:"特別",fresh:"新鮮",comfortable:"快適",cheerful:"明るい"},
 v:{go:"行く",come:"来る",eat:"食べる",drink:"飲む",see:"見る",watch:"見る","look at":"見る",buy:"買う",use:"使う",read:"読む",write:"書く",speak:"話す",talk:"話す","listen to":"聞く",listen:"聞く",hear:"聞く",
  sleep:"寝る",wait:"待つ","wait for":"待つ",walk:"歩く",run:"走る",sit:"座る","sit down":"座る",stand:"立つ","stand up":"立つ",open:"開ける",close:"閉める",shut:"閉める",pay:"払う",try:"試す",
  wear:"着る","put on":"着る",meet:"会う","go home":"帰る","go back":"帰る","come back":"戻る",return:"帰る",study:"勉強",work:"働く",play:"遊ぶ",swim:"泳ぐ",sing:"歌う",rest:"休む",
  send:"送る",show:"見せる",teach:"教える",tell:"教える",enter:"入る","go in":"入る","go into":"入る","go out":"出かける",ride:"乗る","get on":"乗る","get off":"降りる",wash:"洗う",cut:"切る",borrow:"借りる",rent:"借りる",lend:"貸す",
  find:"見つける",lose:"なくす|無くす",forget:"忘れる",remember:"覚える",learn:"習う",change:"変える",choose:"選ぶ",pick:"選ぶ",help:"手伝う",carry:"持つ",hold:"持つ",climb:"登る|上る",start:"始める",begin:"始める",
  stay:"泊まる",touch:"触る","try on":"試着",order:"注文",reserve:"予約",book:"予約",cancel:"キャンセル",check:"確認",confirm:"確認",charge:"充電",exchange:"交換",call:"電話",phone:"電話",
  "wake up":"起きる","get up":"起きる",sell:"売る",cook:"料理",drive:"運転",travel:"旅行",shop:"買い物","go shopping":"買い物",smoke:"吸う",throw:"投げる","throw away":"捨てる",
  push:"押す",press:"押す",pull:"引く",stop:"止まる",hurry:"急ぐ",ask:"聞く",answer:"答える",practice:"練習",explain:"説明",translate:"翻訳",repeat:"繰り返す",bring:"持ってくる|持って来る",
  "pick up":"拾う",kick:"蹴る",sting:"刺す",punch:"殴る",hit:"叩く",fight:"戦う",steal:"盗む",bite:"噛む",catch:"捕まえる",chase:"追いかける",break:"壊す",hug:"抱きしめる",kiss:"キス",kill:"殺す",scare:"驚かす",
  search:"探す","look for":"探す","search for":"探す",die:"死ぬ",laugh:"笑う",cry:"泣く",dance:"踊る",fly:"飛ぶ",win:"勝つ",lose2:"負ける",join:"参加",clean:"掃除",fix:"直す",repair:"直す",
  "take a photo":"撮る","take a picture":"撮る","take photos":"撮る","take pictures":"撮る","take a shower":"浴びる","take a bath":"入る","take a break":"休む","take a rest":"休む"}};
const FIXOBJ={"take a photo":"写真","take a picture":"写真","take photos":"写真","take pictures":"写真","take a shower":"シャワー","take a bath":"お風呂|風呂"};
// English verbs whose Japanese depends too much on the situation to build safely
const VBLOCK=new Set("be have get do make take put set let keep feel become seem think know say want like need mean turn give leave miss mind care would could should will can may might must am is are was were love hate hope wish look".split(" "));
const NIOBJ=new Set(["似る","慣れる","頼る","反対","謝る","気づく","気付く","驚く","憧れる","似合う","向かう","通う","近づく","触れる","従う","協力","感謝","挑戦","合格","投票","出席","寄付","吠える","噛みつく","話しかける","相談","就職","答える","着く","到着","失敗","乗り遅れる","会う","乗る","入る","触る","登る","座る","着く","行く","来る","帰る","戻る","泊まる","住む","電話","参加","勝つ","負ける"]);
const GAOBJ=new Set(["わかる","分かる","できる","出来る","見える","聞こえる"]);
const NOPOT=new Set(["わかる","分かる","できる","出来る","ある","いる","見える","聞こえる"]);
// states that English says with "is ..." but Japanese says with a verb: left to the hand-written cards
const PBLOCK=new Set("tired hungry thirsty lost broken crowded open closed full ready married sick ill drunk here there late gone done finished over sure sorry right wrong left welcome back home out in on off up down single alone available dead busy2 healthy shy uncomfortable worried excited interested surprised confused angry mad nervous annoyed".split(" "));
// Dictionary choice: the word must list this meaning among its first ones, and of
// those the most commonly used word wins (壁 before 塀 for "wall"). Meaning match
// only: a look-alike romaji spelling never counts.
function dictWord(en,type){
  const rows=(wix().get(gkey(en))||[]).filter(r=>r[0]<=2&&okType(r[1],type)&&!/(^|,)x$/.test(r[1][6]||""));
  if(!rows.length)return null;
  const sc=r=>r[0]*25+Math.min(r[1][7]==null?999:r[1][7],600);
  rows.sort((a,b)=>sc(a)-sc(b));
  if((rows[0][1][7]==null?999:rows[0][1][7])>560)return null;   // too rare to trust without a person checking
  const d=rows[0][1];if(type==="adj"&&/^[ァ-ヶー・]+$/.test(d[0]))return null;   // デッド for "dead": not what people say
  return{jp:d[0],kana:d[1],pos:d[6]||"",en:gloss(d),kind:"dictionary"};
}
const NOTNOUN=new Set("lot lots you me him her them us it i we they he she what who whom which whose one ones thing things something anything everything nothing someone anyone everyone somebody anybody everybody nobody here there now then that this these those all both each many much more most some any no not yes ok okay very too so up down out off away around".split(" "));
function npNoun(word){
  const np=NP(word);if(!np||np.pron||np.chunks.length<2||np.chunks.some(c=>c[1]==null))return null;
  return{jp:np.chunks.map(c=>c[0]).join(""),kana:np.chunks.map(c=>c[1]).join(""),say:sayAll(np.chunks.map(c=>c[1])),rom:np.chunks.map(c=>romaji(c[1])).join(" "),en:np.used.map(u=>short(u.en,30)).join(" + "),kind:"dictionary"};
}
function cardWord(en,type){
  for(const a of rank(en)){if(a[0]<18)break;if(!a[1].f.single)continue;const w=fromCard(a[1],type);if(w)return w}
  return null;
}
const NOTWORD=new Set("in on at up down out off over under to of for by with from as like near into onto about than then and or but if so a an the is are was were be am do does did not no yes".split(" "));
function word(en,type,ctx){
  en=en.trim().toLowerCase();if(!en||NOTWORD.has(en)||NOTNOUN.has(en))return null;wix();if(!JPX)return null;
  const P0=PREF[type][en],P=typeof P0==="function"?P0(ctx):P0;
  if(P===false)return null;   // the usual word does not fit here ("old" for a person): not built
  if(P){const w=byJP(P,type);if(w)return w}
  // the checked everyday lists (data/everyday_verbs.txt, everyday_adjectives.txt)
  const PK=type==="v"?window.PICKV:type==="adj"?window.PICKA:null,pi=PK&&PK[en],pd=pi!=null&&window.DICT[pi];
  if(pd&&okType(pd,type))return{jp:pd[0],kana:pd[1],pos:pd[6]||"",en:gloss(pd),kind:"everyday"};
  return cardWord(en,type)||dictWord(en,type);
}
// ----- nouns and noun phrases -----
const C=(jp,kana)=>[jp,kana===undefined?jp:kana];
const DET={this:[C("この")],these:[C("この")],that:[C("あの")],those:[C("あの")],my:[C("私","わたし"),C("の")],our:[C("私たち","わたしたち"),C("の")],his:[C("彼","かれ"),C("の")],her:[C("彼女","かのじょ"),C("の")]};
const PRON={this:C("これ"),that:C("それ"),it:C("それ"),these:C("これ"),those:C("それ"),"this one":C("これ"),"that one":C("それ"),here:C("ここ"),there:C("そこ"),"over there":C("あそこ"),
  he:C("彼","かれ"),she:C("彼女","かのじょ"),we:C("私たち","わたしたち"),i:C("私","わたし"),"this place":C("ここ"),"that place":C("そこ")};
// A word with no dictionary meaning at all and no card ("Nutella", "nutella", "Tokyo Dome")
// is treated as a name or brand and said as it is. Capital letters are not required.
function isName(w){
  if(IRR[(w||"").toLowerCase()])return false;
  if(!/^[A-Za-z0-9][A-Za-z0-9'&.-]*( [A-Za-z0-9][A-Za-z0-9'&.-]*){0,2}$/.test(w))return false;
  const l=w.toLowerCase(),X=wix();
  if(NOTNOUN.has(l)||NOTWORD.has(l)||TIME[l]!==undefined||PBLOCK.has(l)||l.split(" ").some(p=>NOTWORD.has(p)||NOTNOUN.has(p)||STOP.has(p)))return false;
  for(const f of[l,l.replace(/s$/,""),l.replace(/es$/,""),l.replace(/ing$/,""),l.replace(/ed$/,""),l.replace(/ly$/,""),...(/^[a-z]/.test(w)?[l.replace(/ier$/,"y"),l.replace(/er$/,""),l.replace(/er$/,"e"),l.replace(/(.)\1er$/,"$1"),l.replace(/iest$/,"y"),l.replace(/(.)\1est$/,"$1"),l.replace(/est$/,""),l.replace(/est$/,"e")]:[])])if(X.get(gkey(f))||window.SYN&&window.SYN[f])return false;
  if(/ /.test(w)&&!w.split(" ").every(p=>/^[A-Z0-9]/.test(p)))return false;
  return!dictLookup(l).length&&!rank(l).some(a=>a[0]>=18);
}
const isThing=s=>{const np=NP(s);return!!np&&!np.pron&&np.chunks.every(c=>c[1]!=null)};
// words that can take な or の, but people say の before a thing: 普通の日, 最高の日 (not 最高な日)
const NOATTR=new Set("最高 最悪 最新 普通 秘密 空っぽ 空腹 満腹 ふわふわ でこぼこ ぴかぴか 本物 偽物 無料 最初 最後".split(" "));
const attrOf=a=>/adj-i/.test(a.pos)?[C(a.jp,a.kana)]:[C(a.jp,a.kana),C(/adj-na/.test(a.pos)&&!NOATTR.has(a.jp)?"な":"の")];
// "-est" words: "the coolest" -> 一番かっこいい. best / worst / latest are their own words (最高の, 最悪の, 最新の)
const SUPX={best:"最高",worst:"最悪",latest:"最新",newest:"最新"};
const supAdj=(x,ctx)=>{if(!(window.PICKA&&window.PICKA[x]!=null||PREF.adj[x]))return null;   // only the checked everyday describing words
  const a=word(x,"adj",ctx);return a&&/adj-(i|na|no)/.test(a.pos)&&!/^(好き|嫌い|欲しい|必要)/.test(a.jp)?a:null};
function supl(w,ctx){   // "coolest" / "most beautiful" -> the describing word, or null
  w=w.toLowerCase();let m;
  if((m=/^most ([a-z-]+)$/.exec(w)))return supAdj(m[1],ctx);
  if(!/est$/.test(w)||w.length<6)return null;
  const b=w.slice(0,-3),c=[];
  if(/i$/.test(b))c.push(b.slice(0,-1)+"y");          // prettiest -> pretty
  if(/([^aeiou])\1$/.test(b))c.push(b.slice(0,-1));   // biggest -> big
  c.push(b,b+"e");                                    // coolest -> cool, cutest -> cute
  for(const x of c){const a=supAdj(x,ctx);if(a)return a}
  return null;
}
// numbers: "two cats" -> 猫が二匹, "90 years old" -> 90歳
const NUMW={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,hundred:100};
const numOf=w=>/^\d{1,3}$/.test(w)&&+w>0?+w:NUMW[(w||"").toLowerCase()]||null;
const KD=["","いち","に","さん","よん","ご","ろく","なな","はち","きゅう"];
function numKana(n){if(!(n>=1&&n<=999))return null;let s="";const h=Math.floor(n/100),t=Math.floor(n%100/10),o=n%10;
  if(h)s+=h===1?"ひゃく":h===3?"さんびゃく":h===6?"ろっぴゃく":h===8?"はっぴゃく":KD[h]+"ひゃく";
  if(t)s+=(t===1?"":KD[t])+"じゅう";if(o)s+=KD[o];return s}
function ageKana(n){if(n===20)return"はたち";let k=numKana(n);if(!k)return null;const o=n%10;
  if(o===1)k=k.slice(0,-2)+"いっ";else if(o===8)k=k.slice(0,-2)+"はっ";else if(o===0&&n%100>=10)k=k.slice(0,-3)+"じゅっ";return k+"さい"}
const KJ=["","一","二","三","四","五","六","七","八","九","十"];
const CNT={nin:["ひとり","ふたり","さんにん","よにん","ごにん","ろくにん","ななにん","はちにん","きゅうにん","じゅうにん"],
  hiki:["いっぴき","にひき","さんびき","よんひき","ごひき","ろっぴき","ななひき","はっぴき","きゅうひき","じゅっぴき"],
  tsu:["ひとつ","ふたつ","みっつ","よっつ","いつつ","むっつ","ななつ","やっつ","ここのつ","とお"]};
function counted(n,np){   // -> [chunk] "二匹" / "三人" / "二つ", 1-10 only
  if(!(n>=1&&n<=10))return null;const u=np.used[np.used.length-1]||{},an=/(^|,)an(,|$)/.test(u.pos||"");
  const ani=/(^|,)ani(,|$)/.test(u.pos||"")||an&&!/(人|者|さん|ちゃん|くん|友達|兄|姉|弟|妹|子|供|親|夫|妻|娘|息子|彼|師|員|家)$/.test(u.jp||"");
  if(/^(映画|ペン|傘|瓶|ボトル|鉛筆|木|バナナ|ネクタイ|ビール|ワイン)$/.test(u.jp||""))return[C(KJ[n]+"本",["いっぽん","にほん","さんぼん","よんほん","ごほん","ろっぽん","ななほん","はっぽん","きゅうほん","じゅっぽん"][n-1])];
  if(/^(切符|チケット|紙|写真|シャツ|Tシャツ|皿|お皿|切手|はがき|葉書|ピザ|クッキー|タオル|毛布|入場券)$/.test(u.jp||""))return[C(KJ[n]+"枚",["いちまい","にまい","さんまい","よんまい","ごまい","ろくまい","ななまい","はちまい","きゅうまい","じゅうまい"][n-1])];
  const k=ani?"hiki":an?"nin":"tsu",jp=k==="tsu"?(n===10?"十":KJ[n]+"つ"):KJ[n]+(k==="nin"?"人":"匹");
  return[C(jp,CNT[k][n-1])]}
// "bigger", "more expensive", "better" -> the describing word
function cmpAdj(w,ctx){w=w.toLowerCase();let m;if(w==="better")return byJP("いい","adj");if(w==="worse")return byJP("悪い","adj");
  if((m=/^more ([a-z-]+)$/.exec(w)))return supAdj(m[1],ctx);
  if(!/er$/.test(w)||w.length<5)return null;const b=w.slice(0,-2),c=[];
  if(/i$/.test(b))c.push(b.slice(0,-1)+"y");if(/([^aeiou])\1$/.test(b))c.push(b.slice(0,-1));c.push(b,b+"e");
  for(const x of c){const a=supAdj(x,ctx);if(a)return a}return null}
// Japanese place names people type in romaji
const PLACES={shinjuku:["新宿","しんじゅく"],harajuku:["原宿","はらじゅく"],akihabara:["秋葉原","あきはばら"],asakusa:["浅草","あさくさ"],hakone:["箱根","はこね"],roppongi:["六本木","ろっぽんぎ"],
  ikebukuro:["池袋","いけぶくろ"],ueno:["上野","うえの"],odaiba:["お台場","おだいば"],shimokitazawa:["下北沢","しもきたざわ"],nikko:["日光","にっこう"],kanazawa:["金沢","かなざわ"],sendai:["仙台","せんだい"],
  kobe:["神戸","こうべ"],nagoya:["名古屋","なごや"],fukuoka:["福岡","ふくおか"],sapporo:["札幌","さっぽろ"],hiroshima:["広島","ひろしま"],nagasaki:["長崎","ながさき"],kyushu:["九州","きゅうしゅう"],
  shikoku:["四国","しこく"],gion:["祇園","ぎおん"],arashiyama:["嵐山","あらしやま"],dotonbori:["道頓堀","どうとんぼり"],namba:["難波","なんば"],umeda:["梅田","うめだ"],shinagawa:["品川","しながわ"],
  narita:["成田","なりた"],haneda:["羽田","はねだ"],kansai:["関西","かんさい"],kanto:["関東","かんとう"],shibuya:["渋谷","しぶや"],ginza:["銀座","ぎんざ"],nara:["奈良","なら"],kyoto:["京都","きょうと"],osaka:["大阪","おおさか"],tokyo:["東京","とうきょう"]};
// polite ending -> plain ending, for "… と思います", "… たら", "… から"
const IROW={"い":"う","き":"く","ぎ":"ぐ","し":"す","ち":"つ","に":"ぬ","び":"ぶ","み":"む","り":"る"};
function verbOfStem(sj,sk){
  const c=[sj+"る"];const u=IROW[sj.slice(-1)];if(u)c.push(sj.slice(0,-1)+u);
  if(/し$/.test(sj))c.push(sj.slice(0,-1)+"する",sj.slice(0,-1));if(sj==="来"||sj==="き")c.push("来る");
  for(const x of c){const w=x&&byJP(x,"v");if(w){const st=vstems(w);if(st&&st.i&&st.i[0]===sj)return w}}
  if(/[えけげせぜてでねべぺめれへ]$/.test(sk||""))return{jp:sj+"る",kana:sk+"る",pos:"v1",en:"",kind:"form"};
  if(/(すぎ|過ぎ|でき|出来)$/.test(sj)&&/(すぎ|でき)$/.test(sk||""))return{jp:sj+"る",kana:sk+"る",pos:"v1",en:"",kind:"form"};
  if(sj==="き"&&sk==="き")return{jp:"くる",kana:"くる",pos:"vk",en:"",kind:"form"};   // 降ってきます   // られ / され / える: these all end like 食べる
  return null}
function toPlain(ch,past){
  ch=ch.filter(c=>c[0]!=="か");if(!ch.length)return null;
  {const n=ch.length,L=ch[n-1],P=ch[n-2];if(P&&/^(ます|ました|ません)$/.test(L[0])&&P[1]!=null&&!/^(は|が|を|に|で|と|も)$/.test(P[0]))ch=[...ch.slice(0,-2),C(P[0]+L[0],P[1]+L[0])]}
  {const L=ch[ch.length-1];const tm=L&&L[1]!=null&&/^(.+[てで]い)(ます|ました|ませんでした|ません)$/.exec(L[0]),tk=tm&&/^(.+[てで]い)(ます|ました|ませんでした|ません)$/.exec(L[1]);
   if(tm&&tk){const e={"ます":past?"た":"る","ました":"た","ません":past?"なかった":"ない","ませんでした":"なかった"}[tm[2]];return[...ch.slice(0,-1),C(tm[1]+e,tk[1]+e)]}}
  const n=ch.length,L=ch[n-1],P=ch[n-2],FIX={"います":["いる","いた"],"いました":["いた","いた"],"いません":["いない","いなかった"],"あります":["ある","あった"],"ありました":["あった","あった"],"ありません":["ない","なかった"]};
  if(L[0]==="です"){
    if(P&&/(かった|なかった)$/.test(P[0]))return ch.slice(0,-1);
    if(P&&/いい$/.test(P[0])&&P[1]!=null&&past)return[...ch.slice(0,-2),C(P[0].replace(/いい$/,"よかった"),P[1].replace(/いい$/,"よかった"))];
    if(P&&/い$/.test(P[0])&&P[1]!=null&&!/(きれい|綺麗|嫌い|大嫌い|丁寧|失礼|ていねい|きらい)$/.test(P[0]))return past?[...ch.slice(0,-2),C(P[0].slice(0,-1)+"かった",P[1].slice(0,-1)+"かった")]:ch.slice(0,-1);
    return[...ch.slice(0,-1),C(past?"だった":"だ")]}
  if(L[0]==="でした"){
    if(P&&/ません$/.test(P[0])){const w=verbOfStem(P[0].slice(0,-3),(P[1]||"").slice(0,-3)),st=w&&vstems(w);return st&&st.a?[...ch.slice(0,-2),C(st.a[0]+"なかった",st.a[1]+"なかった")]:null}
    return[...ch.slice(0,-1),C("だった")]}
  if(FIX[L[0]])return[...ch.slice(0,-1),C(FIX[L[0]][past||/ました$/.test(L[0])?1:0])];
  const m=/^(.*)(ます|ました|ません)$/.exec(L[0]),mk=L[1]&&/^(.*)(ます|ました|ません)$/.exec(L[1]);
  if(!m||!mk)return null;
  const w=L.v&&vstems(L.v)&&vstems(L.v).i&&vstems(L.v).i[0]===m[1]?L.v:verbOfStem(m[1],mk[1]);if(!w)return null;const st=vstems(w);if(!st)return null;
  const T2=st.te?[st.te[0].replace(/て$/,"た").replace(/で$/,"だ"),st.te[1].replace(/て$/,"た").replace(/で$/,"だ")]:null;
  let e=null;
  if(m[2]==="ません")e=st.a?[C(st.a[0]+(past?"なかった":"ない"),st.a[1]+(past?"なかった":"ない"))]:null;
  else if(m[2]==="ました"||past)e=T2?[C(T2[0],T2[1])]:null;
  else e=w.kind==="form"?[C(w.jp,w.kana)]:vplain(w,"dict");
  return e?[...ch.slice(0,-1),...e]:null}
// polite ending -> て form, to join two sentences: "店に行って、パンを買いました"
function toTe(ch){
  {const n=ch.length,L=ch[n-1],P=ch[n-2];if(P&&/^(ます|ました)$/.test(L[0])&&P[1]!=null&&!/^(は|が|を|に|で|と|も)$/.test(P[0]))ch=[...ch.slice(0,-2),C(P[0]+L[0],P[1]+L[0])]}
  const n=ch.length,L=ch[n-1],P=ch[n-2];if(!L)return null;
  if(/てい(ます|ました)$/.test(L[0])&&L[1]!=null)return[...ch.slice(0,-1),C(L[0].replace(/(ます|ました)$/,"て"),L[1].replace(/(ます|ました)$/,"て"))];
  if(/ません$/.test(L[0])||L[0]==="でした"&&P&&/ません$/.test(P[0])){const p=toPlain(ch),E=p&&p[p.length-1];if(E&&/(ない|なかった)$/.test(E[0])&&E[1]!=null)return[...p.slice(0,-1),C(E[0].replace(/(ない|なかった)$/,"なくて"),E[1].replace(/(ない|なかった)$/,"なくて"))];return null}
  if(/^(です|でした)$/.test(L[0])&&P&&/かった$/.test(P[0])&&P[1]!=null&&!/なかった$/.test(P[0]))return[...ch.slice(0,-2),C(P[0].replace(/かった$/,"くて"),P[1].replace(/かった$/,"くて"))];
  if(L[0]==="です"&&P&&P[0]==="いい")return[...ch.slice(0,-2),C("よくて")];
  if(L[0]==="でした"&&P&&P[1]!==undefined&&!/(ませ|かった)$/.test(P[0])&&!/^(は|が|を|に|で|と|も)$/.test(P[0]))return[...ch.slice(0,-1),C("で")];
  if(L[0]==="です"&&P&&/い$/.test(P[0])&&P[1]!=null&&!/ない$/.test(P[0])&&!/(きれい|綺麗|嫌い|大嫌い|丁寧|失礼|ていねい|きらい)$/.test(P[0]))return[...ch.slice(0,-2),C(P[0].slice(0,-1)+"くて",P[1].slice(0,-1)+"くて")];
  if(L[0]==="です"&&P&&(!/い$/.test(P[0])||/(きれい|綺麗|嫌い|大嫌い|丁寧|失礼|ていねい|きらい)$/.test(P[0])))return[...ch.slice(0,-1),C("で")];
  if(L[0]==="います"||L[0]==="いました")return[...ch.slice(0,-1),C("いて")];
  const m=/^(.*)(ます|ました)$/.exec(L[0]),mk=L[1]&&/^(.*)(ます|ました)$/.exec(L[1]);if(!m||!mk)return null;
  const w=L.v&&vstems(L.v)&&vstems(L.v).i&&vstems(L.v).i[0]===m[1]?L.v:verbOfStem(m[1],mk[1]),st=w&&vstems(w);if(!st||!st.te)return null;
  return[...ch.slice(0,-1),C(st.te[0],st.te[1])]}
// "for an hour" -> 一時間
const DUR={minute:["分",["いっぷん","にふん","さんぷん","よんぷん","ごふん","ろっぷん","ななふん","はっぷん","きゅうふん","じゅっぷん"]],
  hour:["時間",["いちじかん","にじかん","さんじかん","よじかん","ごじかん","ろくじかん","ななじかん","はちじかん","くじかん","じゅうじかん"]],
  day:["日",["いちにち","ふつか","みっか","よっか","いつか","むいか","なのか","ようか","ここのか","とおか"]],
  week:["週間",["いっしゅうかん","にしゅうかん","さんしゅうかん","よんしゅうかん","ごしゅうかん","ろくしゅうかん","ななしゅうかん","はっしゅうかん","きゅうしゅうかん","じゅっしゅうかん"]],
  month:["か月",["いっかげつ","にかげつ","さんかげつ","よんかげつ","ごかげつ","ろっかげつ","ななかげつ","はっかげつ","きゅうかげつ","じゅっかげつ"]],
  year:["年",["いちねん","にねん","さんねん","よねん","ごねん","ろくねん","ななねん","はちねん","きゅうねん","じゅうねん"]]};
function duration(nw,unit){const n=/^an?$/i.test(nw)?1:numOf(nw)||enNum(nw),u=DUR[unit.toLowerCase().replace(/s$/,"")];if(!u||!(n>=1&&n<=99))return null;
  if(n>10){const o=n%10,t=jaNum(n-o),J=jaNum(n);if(!t||!J)return null;if(u[0]==="日"&&n===20)return C("二十日","はつか");const k=o===0?t[1].replace(/じゅう$/,"")+u[1][9]:t[1]+u[1][o-1];return C(J[0]+u[0],k)}
  return C((n===1&&unit.startsWith("day")?"一":KJ[n])+u[0],u[1][n-1])}
const TIMES=["いっかい","にかい","さんかい","よんかい","ごかい","ろっかい","ななかい","はっかい","きゅうかい","じゅっかい"];
const timesCh=w=>{const n=/^once$/i.test(w)?1:/^twice$/i.test(w)?2:numOf((/^(\w+) times$/i.exec(w)||[])[1]);return n>=1&&n<=10?C(KJ[n]+"回",TIMES[n-1]):null};
const isBody=np=>!!np&&/(^|,)bd(,|$)/.test((np.used[np.used.length-1]||{}).pos||"");
// "try to eat" -> 食べよう (the "let's / I'll" form), for "trying to …"
function volit(w){const s=vstems(w);if(!s)return null;const p=w.pos||"",jp=w.jp,k=w.kana;
  if(s.suru)return[jp+"しよう",k+"しよう"];if(/vs-i/.test(p))return[jp.slice(0,-2)+"しよう",k.slice(0,-2)+"しよう"];
  if(/(^|,)vk/.test(p))return[jp.slice(0,-2)+(jp.endsWith("来る")?"来よう":"こよう"),k.slice(0,-2)+"こよう"];
  if(/(^|,)v1/.test(p))return[s.i[0]+"よう",s.i[1]+"よう"];
  const L=jp.slice(-1);if(!ROW[L]||k.slice(-1)!==L)return null;return[jp.slice(0,-1)+ROW[L][4]+"う",k.slice(0,-1)+ROW[L][4]+"う"]}
const NAT={japanese:["日本人","にほんじん"],american:["アメリカ人","アメリカじん"],chinese:["中国人","ちゅうごくじん"],korean:["韓国人","かんこくじん"],british:["イギリス人","イギリスじん"],
  english:["イギリス人","イギリスじん"],canadian:["カナダ人","カナダじん"],australian:["オーストラリア人","オーストラリアじん"],french:["フランス人","フランスじん"],german:["ドイツ人","ドイツじん"],
  italian:["イタリア人","イタリアじん"],spanish:["スペイン人","スペインじん"],mexican:["メキシコ人","メキシコじん"],brazilian:["ブラジル人","ブラジルじん"],indian:["インド人","インドじん"],
  filipino:["フィリピン人","フィリピンじん"],vietnamese:["ベトナム人","ベトナムじん"],thai:["タイ人","タイじん"],russian:["ロシア人","ロシアじん"],irish:["アイルランド人","アイルランドじん"],
  dutch:["オランダ人","オランダじん"],swedish:["スウェーデン人","スウェーデンじん"],taiwanese:["台湾人","たいわんじん"],indonesian:["インドネシア人","インドネシアじん"],"new zealander":["ニュージーランド人","ニュージーランドじん"]};
const isSup=w=>!!SUPX[w.toLowerCase()]||/^most /i.test(w)||!!supl(w,{thing:true});
const dropMy=ch=>{const o=[];for(let i=0;i<ch.length;i++){if((ch[i][0]==="私"||ch[i][0]==="私たち")&&ch[i+1]&&ch[i+1][0]==="の"){i++;continue}o.push(ch[i])}return o};
// ---- numbers, prices and dates said in Japanese ----
const ENUM={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,a:1,an:1};
const EORD={first:1,second:2,third:3,fourth:4,fifth:5,sixth:6,seventh:7,eighth:8,ninth:9,tenth:10,eleventh:11,twelfth:12,thirteenth:13,fourteenth:14,fifteenth:15,sixteenth:16,seventeenth:17,eighteenth:18,nineteenth:19,twentieth:20,thirtieth:30};
// "three thousand five hundred" / "3,500" / "twenty-one" -> 3500
function enNum(t){t=t.toLowerCase().replace(/,/g,"").replace(/-/g," ").replace(/ and /g," ").trim();if(/^\d+$/.test(t))return+t;let tot=0,cur=0,any=false;
  for(const w of t.split(/\s+/)){if(ENUM[w]!=null){cur+=ENUM[w];any=true}else if(w==="hundred"){cur=(cur||1)*100;any=true}else if(w==="thousand"){tot+=(cur||1)*1000;cur=0;any=true}else if(/^\d+$/.test(w)){cur+=+w;any=true}else return null}return any?tot+cur:null}
function enOrd(t){t=t.toLowerCase().replace(/-/g," ").trim();let m=/^(\d+)(?:st|nd|rd|th)?$/.exec(t);if(m)return+m[1];if(EORD[t])return EORD[t];m=/^(twenty|thirty) (\w+)$/.exec(t);if(m&&EORD[m[2]]&&EORD[m[2]]<10)return ENUM[m[1]]+EORD[m[2]];return null}
// 3500 -> ["三千五百","さんぜんごひゃく"], up to 99,999,999
function jaNum(n){if(!(n>=0&&n<1e8&&n===Math.floor(n)))return null;if(n===0)return["零","ゼロ"];const D=["","一","二","三","四","五","六","七","八","九"],R=["","いち","に","さん","よん","ご","ろく","なな","はち","きゅう"];
  const four=(x,big)=>{let k="",r="";const th=Math.floor(x/1000),h=Math.floor(x%1000/100),te=Math.floor(x%100/10),o=x%10;
    if(th){k+=(th>1||big?D[th]:"")+"千";r+=th===1?(big?"いっせん":"せん"):th===3?"さんぜん":th===8?"はっせん":R[th]+"せん"}
    if(h){k+=(h>1?D[h]:"")+"百";r+=h===1?"ひゃく":h===3?"さんびゃく":h===6?"ろっぴゃく":h===8?"はっぴゃく":R[h]+"ひゃく"}
    if(te){k+=(te>1?D[te]:"")+"十";r+=(te>1?R[te]:"")+"じゅう"}if(o){k+=D[o];r+=R[o]}return[k,r]};
  const man=Math.floor(n/10000),rest=n%10000;let k="",r="";if(man){const a=four(man,true);k+=a[0]+"万";r+=a[1]+"まん"}if(rest){const b=four(rest,false);k+=b[0];r+=b[1]}return[k,r]}
const MONTH={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const MKANA=["","いちがつ","にがつ","さんがつ","しがつ","ごがつ","ろくがつ","しちがつ","はちがつ","くがつ","じゅうがつ","じゅういちがつ","じゅうにがつ"];
const DKANA={1:"ついたち",2:"ふつか",3:"みっか",4:"よっか",5:"いつか",6:"むいか",7:"なのか",8:"ようか",9:"ここのか",10:"とおか",14:"じゅうよっか",20:"はつか",24:"にじゅうよっか"};
// "May fifth" -> 五月五日
function dateCh(mo,d){const m=MONTH[mo.toLowerCase()];if(!m)return null;const mj=["","一","二","三","四","五","六","七","八","九","十","十一","十二"][m]+"月";if(d==null)return[C(mj,MKANA[m])];if(!(d>=1&&d<=31))return null;
  const dk=DKANA[d]||(jaNum(d)[1].replace(/よん$/,"よ").replace(/なな$/,"しち").replace(/きゅう$/,"く")+"にち");return[C(mj,MKANA[m]),C(jaNum(d)[0]+"日",dk)]}
// "three thousand yen" -> 三千円
function yenCh(t){const n=enNum(t);const j=n!=null&&jaNum(n);return j?C(j[0]+"円",j[1]+"えん"):null}
// make someone do it: 掃除させられる (made to) / 帰らせて (allowed to)
function causStem(w){const s=vstems(w);if(!s)return null;const p=w.pos||"";if(s.suru)return[w.jp+"させ",w.kana+"させ"];if(/vs-i/.test(p))return[w.jp.slice(0,-2)+"させ",w.kana.slice(0,-2)+"させ"];
  if(/(^|,)vk/.test(p))return[w.jp.slice(0,-2)+(w.jp.endsWith("来る")?"来させ":"こさせ"),w.kana.slice(0,-2)+"こさせ"];if(/(^|,)v1/.test(p))return[s.i[0]+"させ",s.i[1]+"させ"];return s.a?[s.a[0]+"せ",s.a[1]+"せ"]:null}
function NP(s){
  s=s.trim();const l=s.toLowerCase();
  {const iv=/^(?:a |an )?(really|very|super|pretty|quite) ([a-z]+ [a-z]+)$/i.exec(s);if(iv){const n=NP(iv[2]);if(n&&!n.pron&&n.used.length>=2)return{chunks:[C("とても"),...n.chunks],used:n.used,en:s}}}
  {const bs=/^(?:a |the )?(.+?) (?:by|near|next to) the (sea|ocean|beach|river|lake|station|mountains?)$/i.exec(s);if(bs){const n=NP(bs[1]);const W={sea:["海","うみ"],ocean:["海","うみ"],beach:["海","うみ"],river:["川","かわ"],lake:["湖","みずうみ"],station:["駅","えき"],mountain:["山","やま"],mountains:["山","やま"]}[bs[2].toLowerCase()];if(n&&!n.pron)return{chunks:[C(W[0],W[1]),C("の"),C("近く","ちかく"),C("の"),...n.chunks],used:n.used,en:s}}}
  {const tt=/^(?:the |a |this |that |next |last )?(train|bus|flight|ferry|boat|shinkansen|bullet train|plane) (?:to|for|going to|bound for) (.+)$/i.exec(s);if(tt){const P=NP(tt[2]);const V={train:["電車","でんしゃ"],bus:["バス"],flight:["便","びん"],ferry:["フェリー"],boat:["船","ふね"],shinkansen:["新幹線","しんかんせん"],"bullet train":["新幹線","しんかんせん"],plane:["飛行機","ひこうき"]}[tt[1].toLowerCase()];
    if(P&&!P.pron){const nx=/^next /i.test(s)?[C("次","つぎ"),C("の")]:/^last /i.test(s)?[C("最終","さいしゅう"),C("の")]:[];return{chunks:[...P.chunks,C("行き","いき"),C("の"),...nx,C(V[0],V[1]||V[0])],used:P.used,en:s}}}}
  {const fc=/^(?:my |a |our )?(friends?|coworker|classmate|teacher) from (college|university|high school|school|work|the gym|home|japan|america)$/i.exec(s);if(fc){const W={college:["大学","だいがく"],university:["大学","だいがく"],"high school":["高校","こうこう"],school:["学校","がっこう"],work:["職場","しょくば"],"the gym":["ジム"],home:["地元","じもと"],japan:["日本","にほん"],america:["アメリカ"]}[fc[2].toLowerCase()];const n=NP(fc[1]);if(n)return{chunks:[C(W[0],W[1]||W[0]),C("の"),...n.chunks],used:n.used,en:s}}}
  {const sn=/^the (guy|man|woman|lady|girl|boy|kid|person|people) (?:who was |who were )?sitting (next to|behind|in front of) (?:me|us)(?: on the (plane|train|bus|flight))?$/i.exec(s);if(sn){const R={"next to":["隣","となり"],behind:["後ろ","うしろ"],"in front of":["前","まえ"]}[sn[2].toLowerCase()];const V=sn[3]?{plane:["飛行機","ひこうき"],flight:["飛行機","ひこうき"],train:["電車","でんしゃ"],bus:["バス"]}[sn[3].toLowerCase()]:null;
    return{chunks:[...(V?[C(V[0],V[1]||V[0]),C("で")]:[]),C(R[0],R[1]),C("に"),C("座っていた","すわっていた"),C(/^(kid|boy|girl)$/i.test(sn[1])?"子":"人",/^(kid|boy|girl)$/i.test(sn[1])?"こ":"ひと")],used:[],en:s}}}
  {const lp=/^(in front of|outside|outside of|inside|inside of|behind|next to|near|across from|in back of) (?:the |my |our |your |a )?([a-z]+(?: [a-z]+)?)$/i.exec(s);if(lp){const P=NP(lp[2]);const R={"in front of":["前","まえ"],outside:["外","そと"],"outside of":["外","そと"],inside:["中","なか"],"inside of":["中","なか"],behind:["後ろ","うしろ"],"in back of":["後ろ","うしろ"],"next to":["隣","となり"],near:["近く","ちかく"],"across from":["向かい","むかい"]}[lp[1].toLowerCase()];if(P&&!P.pron&&R)return{chunks:[...P.chunks,C("の"),C(R[0],R[1])],used:P.used,en:s,place:true};return null}}
  {const rc=/^(?:the|a|an|that|this) ([a-z]+(?: [a-z]+)?) (?:who|that|which) (?!i\b|you\b|we\b|he\b|she\b|they\b|is\b|are\b|was\b|were\b|it\b)([a-z]+.*)$/i.exec(s);
   if(rc){const head=NP(rc[1]);let cl=rc[2];const me=/\b(me|us)\b/i.test(cl);cl=cl.replace(/\b(me|us)\b ?/i,"").trim();let vp=null;try{vp=VP(cl.replace(/^(helped|gave|told|showed|taught|sent|called|saved)$/i,"$1"))}catch(e){}
     if(head&&!head.pron&&vp&&!vp.ing){const pre=vp.pre.filter((c,i,a)=>!(c[0]==="私"&&/^(を|に)$/.test((a[i+1]||[])[0]||""))&&!(c[0]==="を"&&(a[i-1]||[])[0]==="私")&&!(c[0]==="に"&&(a[i-1]||[])[0]==="私"));
       let V=null;if(me){const st=vstems(vp.v);if(st&&st.te)V=[C(st.te[0],st.te[1]),C(vp.past?"くれた":"くれる")]}else V=vplain(vp.v,vp.past?"ta":"dict");
       if(V)return{chunks:[...pre,...V,...head.chunks],used:[...head.used,...vp.used],en:s}}}}
  {const pw=/^the (place|restaurant|cafe|hotel|park|town|city|school|house|shop|store) where (i|we|you|they) (.+)$/i.exec(s);if(pw){const head=NP(pw[1]);let vp=null;try{vp=VP(pw[3])}catch(e){}if(head&&vp&&!vp.ing){const V=vplain(vp.v,vp.past?"ta":"dict");const sub=/^we$/i.test(pw[2])?[C("私たち","わたしたち"),C("が")]:/^they$/i.test(pw[2])?[C("彼ら","かれら"),C("が")]:[];if(V)return{chunks:[...sub,...dropMy(vp.pre),...V,...head.chunks],used:[...head.used,...vp.used],en:s}}}}
  {const ip=/^(.+?) in ([A-Z]?[a-z]+(?: [a-z]+)?)$/i.exec(s);if(ip&&!/^(the|my|our|a|an|your|this|that|front|time|line|town|bed|love|trouble|person|general|english|japanese)\b/i.test(ip[2])){const pl=NP(ip[2]);const L=pl&&pl.used[pl.used.length-1];if(pl&&!pl.pron&&L&&isPlace(L.jp)){const a=NP(ip[1]);if(a&&!a.pron)return{chunks:[...pl.chunks,C("の"),...a.chunks],used:[...pl.used,...a.used],en:s}}}}
  {const rm=/^(?:the |my )?([a-z]+(?: [a-z]+)?) in (?:my|our|the) (room|bathroom|kitchen|car|apartment|hotel room)$/i.exec(s);if(rm){const a=NP(rm[1]);const R={room:["部屋","へや"],bathroom:["お風呂場","おふろば"],kitchen:["台所","だいどころ"],car:["車","くるま"],apartment:["アパート"],"hotel room":["部屋","へや"]}[rm[2].toLowerCase()];if(a&&!a.pron)return{chunks:[C(R[0],R[1]||R[0]),C("の"),...a.chunks],used:a.used,en:s}}}
  {const rl=/^(?:a |an |the |some )?([a-z]+(?: [a-z]+)?) (?:that's|that is|that are|which is|which are|that isn't|that aren't) (not too |not very |not |really |very |pretty |a little )?(open late|open now|open 24 hours|open on sundays|expensive|cheap|spicy|sweet|big|small|far|close|heavy|light|quiet|crowded|popular|famous|good|delicious|new|old|easy|hard|open|cute|warm|cold|hot|fresh|healthy|simple)$/i.exec(s);
   if(rl){const a=NP(rl[1]);if(a&&!a.pron){const A={"open late":["遅くまで開いている","おそくまであいている"],"open now":["今開いている","いまあいている"],"open 24 hours":["24時間営業の","にじゅうよじかんえいぎょうの"],"open on sundays":["日曜日に開いている","にちようびにあいている"],expensive:["高い","たかい"],cheap:["安い","やすい"],spicy:["辛い","からい"],sweet:["甘い","あまい"],big:["大きい","おおきい"],small:["小さい","ちいさい"],far:["遠い","とおい"],close:["近い","ちかい"],heavy:["重い","おもい"],light:["軽い","かるい"],quiet:["静かな","しずかな"],crowded:["混んでいる","こんでいる"],popular:["人気の","にんきの"],famous:["有名な","ゆうめいな"],good:["いい","いい"],delicious:["おいしい","おいしい"],new:["新しい","あたらしい"],old:["古い","ふるい"],easy:["簡単な","かんたんな"],hard:["難しい","むずかしい"],open:["開いている","あいている"],cute:["かわいい","かわいい"],warm:["暖かい","あたたかい"],cold:["冷たい","つめたい"],hot:["熱い","あつい"],fresh:["新鮮な","しんせんな"],healthy:["体にいい","からだにいい"],simple:["シンプルな","しんぷるな"]}[rl[3].toLowerCase()];
     const neg=/not|isn't|aren't/i.test(rl[0]);let J=A;if(neg){if(/い$/.test(A[0])&&A[0]!=="いい")J=[A[0].slice(0,-1)+"くない",A[1].slice(0,-1)+"くない"];else if(A[0]==="いい")J=["よくない","よくない"];else if(/な$/.test(A[0]))J=[A[0].slice(0,-1)+"じゃない",A[1].slice(0,-1)+"じゃない"];else return null}
     const adv=/not too|not very/i.test(rl[0])?[C("あまり")]:/really|very/i.test(rl[0]||"")&&!neg?[C("とても")]:/a little/i.test(rl[0])?[C("ちょっと")]:[];return{chunks:[...adv,C(J[0],J[1]),...a.chunks],used:a.used,en:s}}}}
  if(/^(?:a |the )?(big|large|major) (company|corporation|firm)$/i.test(s))return{chunks:[C("大企業","だいきぎょう")],used:[],en:s};
  if(/^another country$/i.test(s))return{chunks:[C("外国","がいこく")],used:[],en:s};
  if(/^another (city|town)$/i.test(s))return{chunks:[C("別の街","べつのまち")],used:[],en:s};
  {const fp=/^(?:a |the |that |this )?(?:good |nice |new )?(ramen|sushi|pizza|burger|hamburger|noodle|udon|soba|curry|yakiniku|tempura|okonomiyaki|takoyaki|bbq|barbecue|coffee|cake|bread|tonkatsu|gyoza) (place|shop|restaurant|joint|spot|stand)(?: (?:that )?everyone (?:is|'s) talking about)?$/i.exec(s);if(fp){const W={ramen:["ラーメン屋","らーめんや"],sushi:["寿司屋","すしや"],pizza:["ピザ屋","ぴざや"],burger:["ハンバーガー屋","はんばーがーや"],hamburger:["ハンバーガー屋","はんばーがーや"],noodle:["麺屋","めんや"],udon:["うどん屋","うどんや"],soba:["そば屋","そばや"],curry:["カレー屋","かれーや"],yakiniku:["焼肉屋","やきにくや"],tempura:["天ぷら屋","てんぷらや"],okonomiyaki:["お好み焼き屋","おこのみやきや"],takoyaki:["たこ焼き屋","たこやきや"],bbq:["焼肉屋","やきにくや"],barbecue:["焼肉屋","やきにくや"],coffee:["喫茶店","きっさてん"],cake:["ケーキ屋","けーきや"],bread:["パン屋","ぱんや"],tonkatsu:["とんかつ屋","とんかつや"],gyoza:["餃子屋","ぎょうざや"]}[fp[1].toLowerCase()];
    const pre=/everyone/i.test(s)?[C("みんな"),C("が"),C("話題","わだい"),C("に"),C("して"),C("いる")]:[];const d=/^that /i.test(s)?[C("あの")]:/^this /i.test(s)?[C("この")]:[];const g=/\b(good|nice)\b/i.test(s)?[C("いい")]:/\bnew\b/i.test(s)?[C("新しい","あたらしい")]:[];return{chunks:[...pre,...d,...g,C(W[0],W[1])],used:[],en:s}}}
  if(/^heights$/i.test(s))return{chunks:[C("高い","たかい"),C("所","ところ")],used:[],en:s};
  {const fh=/^(?:the )?(food|dishes|meals?) (here|there)$/i.exec(s);if(fh)return{chunks:[C(/here/i.test(fh[2])?"ここ":"そこ"),C("の"),C("料理","りょうり")],used:[],en:s}}
  {const pl=/^(?:a |some |the )?(?:good |nice |cheap )?place to (stay|eat|sleep|park|live|sit|study|work)$/i.exec(s);if(pl){const V={stay:["泊まる","とまる"],eat:["食べる","たべる"],sleep:["寝る","ねる"],park:["車を止める","くるまをとめる"],live:["住む","すむ"],sit:["座る","すわる"],study:["勉強する","べんきょうする"],work:["働く","はたらく"]}[pl[1].toLowerCase()];const g=/good|nice/i.test(s)?[C("いい")]:/cheap/i.test(s)?[C("安い","やすい")]:[];return{chunks:[...g,C(V[0],V[1]),C("所","ところ")],used:[],en:s}}}
  {const mx=/^(?:some |the )?matching ([a-z]+(?: [a-z]+)?)$/i.exec(s);if(mx){const n=NP(mx[1]);if(n&&!n.pron)return{chunks:[C("おそろい"),C("の"),...n.chunks],used:n.used,en:s}}}
  {if(/^(?:a |the )?special (occasion|day)$/i.test(s))return{chunks:[C("特別","とくべつ"),C("な"),C("日","ひ")],used:[],en:s}}
  {const at=/^(?:the )?([a-z]+(?: [a-z]+)?) (?:at|in|from) (that|this|the|my|our|your) (restaurant|hotel|cafe|café|shop|store|place|school|office|party|station|airport|bakery|bar|izakaya|supermarket|market|hospital|gym|library)$/i.exec(s);if(at){const n=NP(at[1]),y=NP(at[3]);const d={that:[C("あの")],this:[C("この")],the:[],my:[],our:[],your:[]}[at[2].toLowerCase()];if(n&&y&&!n.pron&&!y.pron)return{chunks:[...d,...y.chunks,C("の"),...n.chunks.map(c=>c[0]==="食べ物"?C("料理","りょうり"):c)],used:[...y.used,...n.used],en:s}}}
  {const fv=/^(my|your|his|her|our|their) (?:very )?(favorite|favourite) ([a-z]+(?: [a-z]+)?)$/i.exec(s);if(fv&&!/^(is|was|thing|one|ones|part)$/i.test(fv[3])){const n=NP(fv[3]);const P={my:[C("私","わたし"),C("の")],your:[],his:[C("彼","かれ"),C("の")],her:[C("彼女","かのじょ"),C("の")],our:[C("私たち","わたしたち"),C("の")],their:[C("彼ら","かれら"),C("の")]}[fv[1].toLowerCase()];if(n&&!n.pron)return{chunks:[...P,C("好き","すき"),C("な"),...n.chunks],used:n.used,en:s}}}
  {const wr=/^(?:the |a )?wrong ([a-z]+(?: [a-z]+)?)$/i.exec(s);if(wr){const n=NP(wr[1]);if(n&&!n.pron)return{chunks:[C("違う","ちがう"),...n.chunks],used:n.used,en:s}}}
  {const gp=/^(?:a |some )?(?:good |nice )?(place|spot|restaurant|area)s? (?:for|to go) (sightseeing|shopping|lunch|dinner|breakfast|drinks|a date|hiking|walking|photos|kids|families)$/i.exec(s);if(gp&&/good|nice/i.test(s)){const K={sightseeing:["観光","かんこう"],shopping:["買い物","かいもの"],lunch:["お昼","おひる"],dinner:["晩ご飯","ばんごはん"],breakfast:["朝ご飯","あさごはん"],drinks:["飲み","のみ"],"a date":["デート"],hiking:["ハイキング"],walking:["散歩","さんぽ"],photos:["写真","しゃしん"],kids:["子供","こども"],families:["家族","かぞく"]}[gp[2].toLowerCase()];const P={place:["場所","ばしょ"],spot:["場所","ばしょ"],restaurant:["レストラン"],area:["所","ところ"]}[gp[1].toLowerCase()];
    return{chunks:[C(K[0],K[1]||K[0]),C("に"),C("いい"),C(P[0],P[1]||P[0])],used:[],en:s}}}
  {const mt=/^(.+?) in the (mountains|countryside|country|city|suburbs|woods|forest)$/i.exec(s);if(mt){const n=NP(mt[1]);const W={mountains:["山の中","やまのなか"],countryside:["田舎","いなか"],country:["田舎","いなか"],city:["都会","とかい"],suburbs:["郊外","こうがい"],woods:["森の中","もりのなか"],forest:["森の中","もりのなか"]}[mt[2].toLowerCase()];if(n&&!n.pron)return{chunks:[C(W[0],W[1]),C("の"),...dropMy(n.chunks)],used:n.used,en:s}}}
  {const af=/^(?:(?:some|the|really|very|such) )*(amazing|great|awesome|incredible|wonderful|delicious|tasty|fantastic|excellent) (food|meal|meals|dinner|lunch|breakfast)$/i.exec(s);if(af){const M={food:["料理","りょうり"],meal:["料理","りょうり"],meals:["料理","りょうり"],dinner:["晩ご飯","ばんごはん"],lunch:["お昼","おひる"],breakfast:["朝ご飯","あさごはん"]}[af[2].toLowerCase()];return{chunks:[C("とても"),C("おいしい"),C(M[0],M[1])],used:[{jp:"おいしい",kana:"おいしい",pos:"adj-i",en:"delicious",kind:"everyday"}],en:s}}}
  if(PRON[l])return{chunks:[PRON[l]],used:[],pron:l};
  {const pm=/^(.+?)'s (.+)$/.exec(s);if(pm){const a=NP(pm[1]),b=NP(pm[2]);if(a&&b&&!a.pron&&!b.pron)return{chunks:[...dropMy(a.chunks),C("の"),...b.chunks],used:[...a.used,...b.used],en:s};return null}}
  {const nr=/^(.+?) (near|next to|in front of|behind|across from) (?:the |my |our )?(.+)$/i.exec(s);if(nr&&!/^(i|we|you|he|she|they)$/i.test(nr[1])){const a=NP(nr[1]),b=NP(nr[3]);
     const pw={near:["近く","ちかく"],by:["そば"],"next to":["隣","となり"],"in front of":["前","まえ"],behind:["後ろ","うしろ"],"across from":["向かい","むかい"]}[nr[2].toLowerCase()];
     if(a&&b&&!a.pron&&!b.pron)return{chunks:[...dropMy(b.chunks),C("の"),C(pw[0],pw[1]||pw[0]),C("の"),...a.chunks],used:[...b.used,...a.used],en:s}}}
  if(/^something$/i.test(s))return{chunks:[C("何か","なにか")],used:[],en:s};
  if(/^(everyone|everybody)$/i.test(s))return{chunks:[C("みんな")],used:[],en:s};
  if(/^(things|stuff|everything)$/i.test(s))return{chunks:[/^everything$/i.test(s)?C("全部","ぜんぶ"):C("物","もの")],used:[],en:s};
  {const sw=/^(?:something|anything|a dish|food|one) (?:without|with no) (.+)$/i.exec(s);if(sw){const np=NP(sw[1]);if(np&&!np.pron)return{chunks:[...np.chunks,C("が"),C("入って","はいって"),C("いない"),C("もの")],used:np.used,en:s}}}
  {const on=/^(?:my |the |a |this |that |your )?(old|new|other|red|blue|black|white|green|small|big|cheap|expensive|first|second|last) one$/i.exec(s);if(on){const A={old:["古い","ふるい"],new:["新しい","あたらしい"],other:["別の","べつの"],red:["赤い","あかい"],blue:["青い","あおい"],black:["黒い","くろい"],white:["白い","しろい"],green:["緑の","みどりの"],small:["小さい","ちいさい"],big:["大きい","おおきい"],cheap:["安い","やすい"],expensive:["高い","たかい"],first:["最初の","さいしょの"],second:["二番目の","にばんめの"],last:["最後の","さいごの"]}[on[1].toLowerCase()];
    return{chunks:[C(A[0],A[1]),...(/の$/.test(A[0])?[C("もの")]:[C("の")])],used:[],en:s}}}
  {const sw=/^somewhere(?: (else|quiet|nice|warm|cold|fun|cheap|new|different|close|nearby|safe|peaceful|beautiful|romantic|famous|interesting))?$/i.exec(s);if(sw){const k=(sw[1]||"").toLowerCase();
    const A={else:["別の","べつの"],quiet:["静かな","しずかな"],nice:["いい"],warm:["暖かい","あたたかい"],cold:["寒い","さむい"],fun:["楽しい","たのしい"],cheap:["安い","やすい"],new:["新しい","あたらしい"],different:["違う","ちがう"],close:["近い","ちかい"],nearby:["近い","ちかい"],safe:["安全な","あんぜんな"],peaceful:["静かな","しずかな"],beautiful:["きれいな"],romantic:["ロマンチックな"],famous:["有名な","ゆうめいな"],interesting:["面白い","おもしろい"]}[k];
    return{chunks:[C("どこか"),...(A?[C(A[0],A[1]||A[0])]:[]),...(A?[C("所","ところ")]:[])],used:[],en:s}}}
  {const mm=/^more (time|money|friends|space|room|food|water|people|information|practice|sleep|help|details)$/i.exec(s);if(mm){const np=NP(mm[1]);if(np&&!np.pron)return{chunks:[C("もっと"),...np.chunks],used:np.used,en:s}}}
  {const tm=/^(?:a |the |my |our |one )?(trip|ticket|tickets|train ticket|bus ticket|flight|train|bus|road|way) to (.+)$/i.exec(s);if(tm){const b=NP(tm[2]);if(b&&!b.pron){const t=tm[1].toLowerCase();
     if(t==="trip")return{chunks:[...dropMy(b.chunks),C("への"),C("旅行","りょこう")],used:b.used,en:s};const a=t==="way"||t==="road"?{chunks:[C("道","みち")],used:[]}:NP(tm[1]);if(a&&!a.pron)return{chunks:[...dropMy(b.chunks),C(/^(train|bus|flight)$/.test(t)?"行きの":"までの",/^(train|bus|flight)$/.test(t)?"ゆきの":"までの"),...a.chunks],used:[...b.used,...a.used],en:s}}}}
  {const nm=/^(?:the )?(nearest|closest) (.+)$/i.exec(s);if(nm){const np=NP(nm[2]);if(np&&!np.pron)return{chunks:[C("一番","いちばん"),C("近い","ちかい"),...np.chunks],used:np.used,en:s}}}
  {const om=/^(?:a |the )?(cheaper|bigger|smaller|better|newer|lighter|larger|nicer|cuter) one$/i.exec(s);if(om){const a={cheaper:["安い","やすい"],bigger:["大きい","おおきい"],larger:["大きい","おおきい"],smaller:["小さい","ちいさい"],better:["いい"],newer:["新しい","あたらしい"],lighter:["軽い","かるい"],nicer:["いい"],cuter:["かわいい"]}[om[1].toLowerCase()];
    return{chunks:[C("もっと"),C(a[0],a[1]||a[0]),C("の")],used:[],en:s}}}
  if(/^(?:the )?same one$/i.test(s))return{chunks:[C("同じ","おなじ"),C("もの")],used:[],en:s};
  {const rm=/^(the|a|that|this|my) ([a-z]+(?: [a-z]+)?) (?:that |which |who |where )?(i|I|we|you|he|she|they|my [a-z]+|[A-Z][a-z]+) ([a-z].*)$/.exec(s);
   if(rm&&!/^(is|are|was|were|am|will|can|do|does|did|has|have)$/i.test(rm[4].split(" ")[0])&&rm[4].split(" ").length<=7){
     const head=NP(rm[1]+" "+rm[2]);if(head&&!head.pron&&head.used.every(u=>u.kind!=="dictionary"||u.kana!=null)){
       const cl=rm[4].replace(/ (to|at|in|from|with|about|for|on)(?=( yesterday| today| last \w+| this \w+| tomorrow| next \w+)?$)/i,"");
       const forMe=/\b(me|us)\b/i.test(cl)&&!/^(i|I|we)$/.test(rm[3])||rm[3]==="you"&&/^(recommended|recommend|made|cooked|baked|wrote|bought|sent|lent|showed|taught|brought|picked|chose|drew|found|gave)\b/i.test(cl);
       let r=null;if(!forMe)try{r=compose1(rm[3]+" "+cl)}catch(e){r=null}
       let p=r&&toPlain(r.chunks);
       if(!p){   // "the cake I made", "the gift you gave me": build "made the cake", then take the thing out
         const ws=cl.split(" "),objw=(rm[1]==="my"?"my ":"")+rm[2],ins=/^(me|us|him|her|them)$/i.test(ws[1]||"")?[ws[0],ws[1],objw,...ws.slice(2)]:[ws[0],objw,...ws.slice(1)];
         let vp=null;try{vp=VP(ins.join(" "))}catch(e){vp=null}
         if(vp&&!vp.ing){const hl=dropMy(head.chunks).map(c=>c[0]),pre=vp.pre;let k=-1;for(let x=0;x+hl.length<=pre.length;x++)if(hl.every((h,y)=>pre[x+y][0]===h)&&/^(を|に|が)$/.test((pre[x+hl.length]||[])[0]||"")){k=x;break}
           if(k>=0){let pr=[...pre.slice(0,k),...pre.slice(k+hl.length+1)];let v=vp.v;const me=forMe||vp.me;
             if(me)pr=pr.filter((c,x)=>!(/^(私|私たち)$/.test(c[0])&&/^(に|を)$/.test((pr[x+1]||[])[0]||""))&&!(/^(に|を)$/.test(c[0])&&/^(私|私たち)$/.test((pr[x-1]||[])[0]||"")));
             const who3=/^(i|I|we|you)$/.test(rm[3])?null:/^(he|she|they)$/i.test(rm[3])?{chunks:[PJ[rm[3].toLowerCase()]],used:[]}:NP(rm[3]);
             if(who3||/^(i|I|we|you)$/.test(rm[3])){let e=null;if(me&&!/^(i|I|we)$/.test(rm[3])&&v.jp!=="くれる"){const st=vstems(v);e=st&&st.te?[C(st.te[0],st.te[1]),C(vp.past?"くれた":"くれる")]:null}else e=vplain(v,vp.past?"ta":"dict");
               if(e){p=[...(who3?[...dropMy(who3.chunks),C("が")]:[]),...pr,...e];r={chunks:p,used:[...(who3?who3.used:[]),...vp.used]}}}}}}if(p&&p.length){let q2=p;const k=q2.findIndex(c=>c[0]==="は");if(k>=0&&k<3)q2=[...q2.slice(0,k),C("が"),...q2.slice(k+1)];
         if(/^(i|we|you)$/i.test(rm[3]))q2=q2.filter((c,i)=>!(i<2&&/^(私|私たち|あなた|が)$/.test(c[0])));
         if(rm[3]==="you")q2=[C("あなた"),C("が"),...q2];
         return{chunks:[...q2,...dropMy(head.chunks).filter(c=>!/^(この|その|あの)$/.test(c[0])||rm[1]!=="the")],used:[...r.used,...head.used],en:s}}}}}
  if(/^(?:the )?food on the plane$/i.test(s))return{chunks:[C("機内食","きないしょく")],used:[{jp:"機内食",kana:"きないしょく",pos:"N,fd",en:"in-flight meal",kind:"everyday"}],en:s};
  if(/^(?:the )?(?:cold weather|winter cold)$/i.test(s))return{chunks:[C("寒さ","さむさ")],used:[{jp:"寒さ",kana:"さむさ",pos:"N",en:"the cold",kind:"everyday"}],en:s};
  if(/^(?:the )?(?:heat|hot weather|summer heat)$/i.test(s))return{chunks:[C("暑さ","あつさ")],used:[{jp:"暑さ",kana:"あつさ",pos:"N",en:"the heat",kind:"everyday"}],en:s};
  if(/^the cold$/i.test(s))return{chunks:[C("寒さ","さむさ")],used:[{jp:"寒さ",kana:"さむさ",pos:"N",en:"the cold",kind:"everyday"}],en:s};
  if(/^the heat$/i.test(s))return{chunks:[C("暑さ","あつさ")],used:[{jp:"暑さ",kana:"あつさ",pos:"N",en:"the heat",kind:"everyday"}],en:s};
  {const sm=/^(.+) season$/i.exec(s);if(sm&&!/^(the|a|this|that|my|your|rainy|favou?rite|best|worst|next|last|busy|holiday|my favou?rite|your favou?rite)$/i.test(sm[1])){const a=NP(sm[1]);if(a&&!a.pron)return{chunks:[...a.chunks,C("の"),C("季節","きせつ")],used:a.used,en:s}}}
  {const vm=/^(?:an? |the |some )?(vegetarian|vegan|halal|gluten-free|gluten free) (.+)$/i.exec(s);if(vm){const b=NP(vm[2]);if(!b||b.pron)return null;const k={vegetarian:["ベジタリアン向け","ベジタリアンむけ"],vegan:["ビーガン向け","ビーガンむけ"],halal:["ハラール"],"gluten-free":["グルテンフリー"],"gluten free":["グルテンフリー"]}[vm[1].toLowerCase()];
    return{chunks:[C(k[0],k[1]||k[0]),C("の"),...b.chunks],used:b.used,en:s}}}
  {const nm=/^([a-z]+) (people|person|guys|men|women|guy|man|woman)$/i.exec(s);if(nm&&NAT[nm[1].toLowerCase()]){const k=NAT[nm[1].toLowerCase()];return{chunks:[C(k[0],k[1])],used:[{jp:k[0],kana:k[1],pos:"N,an",en:s,kind:"everyday"}],en:s}}}
  {const ap=/^((?:my |our |your )?(?:best friend|friend|brother|sister|boss|teacher|coworker|colleague|roommate|neighbou?r|cousin|son|daughter|wife|husband|boyfriend|girlfriend|dog|cat)) ([A-Z][a-z]+)$/.exec(s);
   if(ap){const a=NP(ap[1]);if(a&&!a.pron)return{chunks:[...dropMy(a.chunks),C("の"),[ap[2],null]],used:[...a.used,{jp:ap[2],kana:null,en:"a name, said as it is"}],en:s}}}
  let det=null,rest=s,m=/^(this|that|these|those|my|our|his|her|the|an?|some|any|your) (.+)$/i.exec(s);
  if(m){det=m[1].toLowerCase();rest=m[2]}
  let far=false;if(/ over there$/i.test(rest)){far=true;rest=rest.replace(/ over there$/i,"")}
  {const am=/^(.+?),? and (.+)$/i.exec(s);   // "milk and eggs" -> 牛乳と卵
   {const fw=(am?am[2]:"").split(" ")[0].toLowerCase(),vb=w=>PREF.v[w]||IRR[w]||window.PICKV&&window.PICKV[w]!=null,vo=w=>{try{return !!word(w,"v")&&!word(w,"n")&&!PREF.n[w]}catch(e){return false}};
    if(am&&!am[2].includes(" ")&&vb(fw)&&!PREF.n[fw]&&!(()=>{try{return findNoun(fw)}catch(e){return null}})())return null;
    if(am&&/^[a-z]+s$/.test(fw)&&!am[2].includes(" ")){let v=null,n=null;try{v=VP(fw);n=findNoun(fw)||findNoun(fw.replace(/e?s$/,""))}catch(e){}if(v&&!n&&v.pre.length===0)return null}
    if(am&&(am[2].includes(" ")&&(vb(fw)||vb(fw.replace(/e?s$/,""))||vb(fw.replace(/s$/,""))||vb(fw.replace(/e?d$/,""))||vb(fw.replace(/d$/,"")))||/(s|ed)$/.test(fw)&&(vo(fw.replace(/s$/,""))||vo(fw.replace(/es$/,""))||vo(fw.replace(/d$/,""))||vo(fw.replace(/ed$/,"")))||IRR[fw]))return null}
   if(am&&/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2}(:\d\d)?)$/i.test(am[1].trim()))return null;
   if(am&&!/ and /i.test(am[2])){const a=NP(am[1]),b=NP(am[2]);if(a&&b&&!a.pron&&!b.pron&&a.chunks.every(c=>c[1]!=null)&&b.chunks.every(c=>c[1]!=null))return{chunks:[...a.chunks,C("と"),...b.chunks],used:[...a.used,...b.used],en:s,many:true};return null}}
  {const om=/^(.+?) of (?:the |an? |my |your |his |her |our |their )?(.+)$/i.exec(rest);   // "the powerhouse of the cell" -> 細胞の発電所
   if(om&&!/^(cup|glass|bottle|piece|lot|lots|bit|kind|type|sort|couple|pair|bunch|bowl|slice|plate|some|all|one|most|many|none|each|both|part|half|front|back|top|bottom|side|end|middle|rest|out|because|instead|full)$/i.test(om[1])){
     const a=NP(om[1]),b=NP(om[2]);if(a&&b&&!a.pron&&!b.pron&&a.chunks.every(c=>c[1]!=null)&&b.chunks.every(c=>c[1]!=null))return{chunks:[...b.chunks,C("の"),...a.chunks],used:[...b.used,...a.used],en:rest,desc:true};return null}}
  if(det==="the"){const sp=/^(most [a-z-]+|[a-z-]+est|worst) ([a-z][a-z' -]*?)( ever| in the world| of all time| in history)?$/i.exec(rest);
    if(sp&&isSup(sp[1])){
      if(/^ones?$/i.test(sp[2]))return null;   // "the cheapest one": said without "one" (これが一番安いです)
      const nn=findNoun(sp[2]);if(!nn)return null;
      const ctx={thing:true,an:/(^|,)an(,|$)/.test(nn.pos||""),ph:/(^|,)ph(,|$)/.test(nn.pos||"")},x=SUPX[sp[1].toLowerCase()],ch=[],us=[],notes=[];
      if(x){const w=byJP(x,"any");if(!w)return null;ch.push(C(w.jp,w.kana),C("の"));us.push(w)}
      else{const a=supl(sp[1],ctx);if(!a)return null;
        ch.push(sp[3]?C("世界一","せかいいち"):C("一番","いちばん"),...attrOf(a));us.push(a);
        notes.push(sp[3]?"世界一 (sekaiichi) = “the …-est in the world”. Japanese uses it for “…-est ever” too.":"一番 (ichiban) = “the most …”.")}
      if(nn.parts)ch.push(...nn.parts);else ch.push(C(nn.jp,nn.kana));us.push(nn);
      return{chunks:ch,used:us,en:rest,desc:true,notes};
    }
  }
  {const im=/^(.+?) (?:in|at|from) ([A-Z][\w'-]*(?: [A-Z][\w'-]*)?)$/.exec(rest);   // "the deer in Nara" -> 奈良の鹿
   if(im&&(!det||/^(the|an?)$/.test(det))){const a=NP(im[2]),b=NP(im[1]);if(a&&b&&!a.pron&&!b.pron&&isPlaceNP(a))return{chunks:[...a.chunks,C("の"),...b.chunks],used:[...a.used,...b.used],en:rest};return null}}
  const ws=rest.split(" ");if(ws.length>4||/\b(and|or|of|who|which|that)\b/i.test(rest))return null;
  if(/^(whole|entire|own|other|only|total|half)$/i.test(ws[0]))return null;
  const chunks=[],used=[];let desc=false;
  if(NOTNOUN.has(rest.toLowerCase())||TIME[rest.toLowerCase()]!==undefined)return null;
  {const pl=PLACES[rest.toLowerCase()];if(pl&&!det){chunks.push(C(pl[0],pl[1]));used.push({jp:pl[0],kana:pl[1],pos:"N,pl",en:rest.charAt(0).toUpperCase()+rest.slice(1)+" (place name)",kind:"place"});return{chunks,used,en:rest}}}
  if(/^[A-Z][a-z'-]+$/.test(rest)){const lw=rest.toLowerCase(),b=lw.replace(/s$/,""),n0=findNoun(rest);
    if(n0&&!(n0.kind==="everyday"||PREF.n[lw]||PREF.n[b]||/(^|,)pl(,|$)/.test(n0.pos||"")||new RegExp("(^|[^a-z])"+b).test((n0.en||"").toLowerCase()))){
      chunks.push([rest,null]);used.push({jp:rest,kana:null,en:"a name, said as it is"});return{chunks,used,en:rest}}}
  let n=findNoun(rest);
  if(!n&&ws.length>=2&&TIME[ws.slice(1).join(" ").toLowerCase()]===undefined){   // describing word + noun: "big bag"
    const a=word(ws[0],"adj",{thing:true}),n2=a&&findNoun(ws.slice(1).join(" "));
    if(n2){chunks.push(...attrOf(a));used.push(a);n=n2;desc=true}
    else if(!a){const ca=cmpAdj(ws[0],{thing:true}),n3=ca&&findNoun(ws.slice(1).join(" "));   // "a smaller size" -> もっと小さいサイズ
      if(n3){chunks.push(C("もっと"),...attrOf(ca));used.push(ca);n=n3;desc=true}}
  }
  if(n){if(n.parts)chunks.push(...n.parts);else chunks.push(C(n.jp,n.kana));used.push(n)}
  else{   // a real name ("Kyoto Tower", "Nutella") is said as it is
    if(!isName(rest))return null;
    chunks.push([rest,null]);used.push({jp:rest,kana:null,en:"not in the dictionary: names and brands are said as they are, with a Japanese accent"});
  }
  const FAMILY=/^(おばあちゃん|おじいちゃん|お母さん|お父さん|お兄さん|お姉さん|弟|妹|両親|家族|息子|娘|夫|妻)$/;
  if(det==="my"&&n&&FAMILY.test(n.jp)){det=null;   // "my mom" -> 母: your own family is said plainly, without "my"
    const H={おばあちゃん:["祖母","そぼ"],おじいちゃん:["祖父","そふ"],お母さん:["母","はは"],お父さん:["父","ちち"],お兄さん:["兄","あに"],お姉さん:["姉","あね"]}[n.jp];
    if(H&&chunks.length&&chunks[chunks.length-1][0]===n.jp){chunks[chunks.length-1]=C(H[0],H[1]);used[used.length-1]={...n,jp:H[0],kana:H[1],kind:"form"}}}
  if(det==="my"&&n&&/(^|,)ani(,|$)/.test(n.pos||"")){chunks.unshift(C("うちの"));det=null}   // "my dog" -> うちの犬
  if(det&&DET[det])chunks.unshift(...(far&&det==="that"?[C("あの")]:DET[det]));
  return{chunks,used,en:rest,desc};
}
// ----- describing words -----
function adjPred(a,neg,past,mode){   // -> chunks for "... is (not) scary", polite
  const I=/adj-i/.test(a.pos);let jp=a.jp,k=a.kana,sj,sk;
  if(I){
    if(!jp.endsWith("い")||!k.endsWith("い"))return null;
    sj=jp.slice(0,-1);sk=k.slice(0,-1);
    if(/adj-ix/.test(a.pos)){if(!jp.endsWith("いい")||!k.endsWith("いい"))return null;sj=jp.slice(0,-2)+"よ";sk=k.slice(0,-2)+"よ"}
  }
  const des=past?C("でした"):C("です");
  if(mode==="too"){const b=I?[sj,sk]:[jp,k];return[C(b[0]+"すぎ"+(past?"ました":"ます"),b[1]+"すぎ"+(past?"ました":"ます"))]}
  if(mode==="looks"){if(neg||past)return null;const x=I?(/adj-ix/.test(a.pos)?"さそう":"そう"):"そう",b=I?[sj,sk]:[jp,k];return[C(b[0]+x,b[1]+x),C("です")]}
  if(I){const e=neg?(past?"くなかった":"くない"):past?"かった":null;return e?[C(sj+e,sk+e),C("です")]:[C(jp,k),C("です")]}
  return neg?[C(jp,k),C(past?"じゃなかった":"じゃない"),C("です")]:[C(jp,k),des];
}
// ----- action words -----
const ROW={"う":"わいうえお","く":"かきくけこ","ぐ":"がぎぐげご","す":"さしすせそ","つ":"たちつてと","ぬ":"なにぬねの","ぶ":"ばびぶべぼ","む":"まみむめも","る":"らりるれろ"};
const TE={"う":"って","つ":"って","る":"って","む":"んで","ぶ":"んで","ぬ":"んで","く":"いて","ぐ":"いで","す":"して"};
function vstems(w){
  const p=w.pos,jp=w.jp,k=w.kana,L=jp.slice(-1);
  const cut=(n,add)=>[jp.slice(0,jp.length-n)+add,k.slice(0,k.length-n)+add];
  if(/vs-s|v1-s/.test(p))return null;
  if(/vs-i/.test(p))return jp.endsWith("する")&&k.endsWith("する")?{i:cut(2,"し"),te:cut(2,"して"),a:cut(2,"し"),pot:cut(2,"でき")}:null;
  if(/(^|,)vk/.test(p)){
    const kan=jp.endsWith("来る");if(!(kan||jp.endsWith("くる"))||!k.endsWith("くる"))return null;
    const b=jp.slice(0,-2),kb=k.slice(0,-2);
    return{i:[b+(kan?"来":"き"),kb+"き"],te:[b+(kan?"来て":"きて"),kb+"きて"],a:[b+(kan?"来":"こ"),kb+"こ"],pot:[b+(kan?"来られ":"こられ"),kb+"こられ"]};
  }
  if(/(^|,)v1/.test(p))return L==="る"&&k.endsWith("る")?{i:cut(1,""),te:cut(1,"て"),a:cut(1,""),pot:cut(1,"られ")}:null;
  const m=/(^|,)v5([bgkmnrstu])(-s|-i)?/.exec(p);
  if(m){
    if(!ROW[L]||k.slice(-1)!==L)return null;const r=ROW[L];
    return{i:cut(1,r[1]),te:cut(1,m[3]==="-s"?"って":TE[L]),a:m[3]==="-i"?null:cut(1,r[0]),pot:m[3]==="-i"?null:cut(1,r[3])};
  }
  if(/(^|,)vs/.test(p))return{i:[jp+"し",k+"し"],te:[jp+"して",k+"して"],a:[jp+"し",k+"し"],pot:[jp+"でき",k+"でき"],suru:true};   // 勉強 -> 勉強します
  return null;
}
// polite endings; each entry is the list of spoken words that follow the stem
// passive ("got bitten"): regular for every verb class
function passive(w){
  const s=vstems(w);if(!s)return null;const p=w.pos;
  if(/vs-i/.test(p))return[w.jp.slice(0,-2)+"され",w.kana.slice(0,-2)+"され"];
  if(/(^|,)vk/.test(p))return[s.a[0]+"られ",s.a[1]+"られ"];
  if(/(^|,)v1/.test(p))return[s.i[0]+"られ",s.i[1]+"られ"];
  if(s.suru)return[w.jp+"され",w.kana+"され"];
  return s.a?[s.a[0]+"れ",s.a[1]+"れ"]:null;
}
// おならをしました -> おなら / を / しました, so the romaji has spaces
const splitWo=(a,w)=>a&&(!w||!/(^|,)wo(,|$)/.test(w.pos||"")?a:a.flatMap(c=>{const m=/^(.+?)([をが])(.+)$/.exec(c[0]),n=c[1]&&/^(.+?)([をが])(.+)$/.exec(c[1]);return m&&n&&m[2]===n[2]?[[m[1],n[1]],m[2]==="を"?C("を","お"):C("が"),[m[3],n[3]]]:[c]}));
function vend(w,f){const r=splitWo(vend0(w,f),w);if(r&&!/(^|,)wo(,|$)/.test(w.pos||"")){const k=r.find(c=>c&&/(ます|ました|ません|ましょう)$/.test(c[0]));if(k)k.v=w}return r}
// an order: "help me" on its own is 助けて (rescue me), not 手伝って (help me with a task)
function order(vp){
  if(vp.me&&vp.v.jp==="手伝う"&&!vp.pre.length){const w=byJP("助ける","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}
  return vend(vp.v,"tekudasai");
}
// plain (dictionary-style) forms, used before ん です か ("why did ...?")
function vte(w){const st=vstems(w);return st&&st.te?C(st.te[0],st.te[1]):null}
function vplain(w,f){
  const s=vstems(w);if(!s||!s.te)return null;
  const ta=[s.te[0].replace(/て$/,"た").replace(/で$/,"だ"),s.te[1].replace(/て$/,"た").replace(/で$/,"だ")];
  if(f==="ta")return splitWo([C(ta[0],ta[1])],w);
  if(f==="teiru")return splitWo([C(s.te[0],s.te[1]),C("いる")],w);
  if(f==="dict")return splitWo([C(w.jp+(s.suru?"する":""),w.kana+(s.suru?"する":""))],w);
  return null;
}
function vend0(w,f){
  if(f==="ukemi"||f==="ukemiteiru"){const P=passive(w);if(!P)return null;return f==="ukemi"?[C(P[0]+"ました",P[1]+"ました")]:[C(P[0]+"て",P[1]+"て"),C("います")]}
  const s=vstems(w);if(!s)return null;
  const J=(a,x)=>a?C(a[0]+x,a[1]+x):null,ok=a=>a.every(Boolean)?a:null;
  const pot=NOPOT.has(w.jp)?s.i:s.pot;
  switch(f){
    case"masu":return ok([J(s.i,"ます")]);case"masen":return ok([J(s.i,"ません")]);case"mashita":return ok([J(s.i,"ました")]);
    case"masendeshita":return ok([J(s.i,"ません"),C("でした")]);
    case"masuka":return ok([J(s.i,"ます"),C("か")]);case"mashitaka":return ok([J(s.i,"ました"),C("か")]);
    case"mashou":return ok([J(s.i,"ましょう")]);case"masenka":return ok([J(s.i,"ません"),C("か")]);case"mashouka":return ok([J(s.i,"ましょう"),C("か")]);
    case"tai":return ok([J(s.i,"たい"),C("です")]);case"takunai":return ok([J(s.i,"たくない"),C("です")]);
    case"tekudasai":return ok([s.te&&C(s.te[0],s.te[1]),C("ください")]);
    case"temorau":return ok([s.te&&C(s.te[0],s.te[1]),C("もらえます"),C("か")]);
    case"temoii":return ok([s.te&&C(s.te[0],s.te[1]),C("も"),C("いい"),C("です"),C("か")]);
    case"teiru":return ok([s.te&&C(s.te[0],s.te[1]),C("います")]);
    case"teinai":return ok([s.te&&C(s.te[0],s.te[1]),C("いません")]);case"teita":return ok([s.te&&C(s.te[0],s.te[1]),C("いました")]);
    case"naide":return ok([J(s.a,"ないで"),C("ください")]);
    case"must":return ok([J(s.a,"ない"),C("と"),C("いけません")]);
    case"mustpast":return ok([J(s.a,"なければ"),C("なりません"),C("でした")]);
    case"potnegpast":return ok([J(pot,"ません"),C("でした")]);case"taikatta":return ok([J(s.i,"たかった"),C("です")]);
    case"nakutemoii":return ok([J(s.a,"なくても"),C("いい"),C("です")]);case"naihougaii":return ok([J(s.a,"ない"),C("ほう"),C("が"),C("いい"),C("です"),C("よ")]);
    case"hougaii0":{const t=s.te&&[s.te[0].replace(/て$/,"た").replace(/で$/,"だ"),s.te[1].replace(/て$/,"た").replace(/で$/,"だ")];return t?ok([C(t[0],t[1]),C("ほう"),C("が"),C("いい"),C("です")]):null}
    case"hougaii":{const t=s.te&&[s.te[0].replace(/て$/,"た").replace(/で$/,"だ"),s.te[1].replace(/て$/,"た").replace(/で$/,"だ")];return t?ok([C(t[0],t[1]),C("ほう"),C("が"),C("いい"),C("です"),C("よ")]):null}
    case"pot":return ok([J(pot,"ます")]);case"potneg":return ok([J(pot,"ません")]);case"potka":return ok([J(pot,"ます"),C("か")]);
    case"suki":return ok([C(w.jp+(s.suru?"する":""),w.kana+(s.suru?"する":"")),C("の"),C("が"),C("好き","すき"),C("です")]);
  }
  return null;
}
const IRR={ate:"eat",went:"go",came:"come",saw:"see",bought:"buy",drank:"drink",slept:"sleep",met:"meet",paid:"pay",ran:"run",sat:"sit",stood:"stand",lost:"lose",forgot:"forget",found:"find",sent:"send",wore:"wear",swam:"swim",sang:"sing",taught:"teach",heard:"hear",brought:"bring",chose:"choose",drove:"drive",flew:"fly",held:"hold",rode:"ride",sold:"sell",woke:"wake",won:"win",began:"begin",spoke:"speak",wrote:"write",told:"tell",threw:"throw",cut:"cut",read:"read",broke:"break",caught:"catch",stole:"steal",stung:"sting",bit:"bite",fought:"fight",hit:"hit",kicked:"kick",chased:"chase",hugged:"hug",
  fell:"fall",fed:"feed",knew:"know",grew:"grow",drew:"draw",shot:"shoot",spent:"spend",built:"build",bent:"bend",blew:"blow",dug:"dig",hid:"hide",hung:"hang",led:"lead",
  made:"make",meant:"mean",rang:"ring",rose:"rise",said:"say",sank:"sink",shook:"shake",slid:"slide",spun:"spin",spat:"spit",stuck:"stick",struck:"strike",swept:"sweep",
  swung:"swing",took:"take",thought:"think",tore:"tear",understood:"understand",wept:"weep",gave:"give",got:"get",had:"have",did:"do",became:"become",forgave:"forgive",
  froze:"freeze",left:"leave",kept:"keep",felt:"feel",burnt:"burn",learnt:"learn",dreamt:"dream",fled:"flee",bled:"bleed",crept:"creep",dealt:"deal",lent:"lend",
  mistook:"mistake",overslept:"oversleep",shrank:"shrink",sought:"seek",sprang:"spring",stank:"stink",swore:"swear",withdrew:"withdraw",arose:"arise",awoke:"awake",
  forgot:"forget",slept:"sleep",bit:"bite",ate:"eat",drank:"drink",ran:"run",threw:"throw",yeeted:"yeet",
  eaten:"eat",seen:"see",done:"do",gone:"go",taken:"take",given:"give",written:"write",spoken:"speak",driven:"drive",ridden:"ride",swum:"swim",sung:"sing",
  broken:"break",stolen:"steal",forgotten:"forget",chosen:"choose",woken:"wake",worn:"wear",flown:"fly",fallen:"fall",known:"know",grown:"grow",drawn:"draw",
  thrown:"throw",shown:"show",hidden:"hide",bitten:"bite",beaten:"beat",frozen:"freeze",begun:"begin",been:"go"};
function enVerb(w){
  if(IRR[w]&&w!=="cut"&&w!=="read")return{c:[IRR[w]],past:true};
  if(/^(bring|sing|ring|string|swing|spring|sting|cling|fling|wring|bling)$/.test(w))return{c:[w]};
  if(/ing$/.test(w)&&w.length>4){const b=w.slice(0,-3);return{c:[b,b+"e",b.replace(/(.)\1$/,"$1")],ing:true}}
  if(/ed$/.test(w)&&w.length>3&&!/^(feed|need|bleed|speed|seed|breed|weed|proceed|succeed|exceed)$/.test(w)){const b=w.slice(0,-2);return{c:[b,w.slice(0,-1),b.replace(/(.)\1$/,"$1"),b.replace(/i$/,"y")],past:true}}
  if(/s$/.test(w)&&w.length>2&&!/(ss|us|is)$/.test(w)){
    const S3={has:"have",does:"do",goes:"go"};if(S3[w])return{c:[S3[w]],s3:true};
    return{c:[...(/ies$/.test(w)?[w.slice(0,-3)+"y"]:[]),...(/(ch|sh|x|z|o)es$/.test(w)?[w.slice(0,-2)]:[]),w.slice(0,-1),w],s3:true};
  }
  return{c:[w]};
}
const TIME={today:"今日",tomorrow:"明日",yesterday:"昨日",now:"今",later:"後で",tonight:"今夜","every day":"毎日",again:"もう一度",slowly:"ゆっくり",together:"一緒に",soon:"もうすぐ","this morning":"今朝","next week":"来週","last week":"先週","tomorrow morning":"明日の朝",
  "right now":"今","next month":"来月","next year":"来年","last month":"先月","last year":"去年","last night":"昨日の夜|昨夜","this year":"今年","this week":"今週","this weekend":"今週末","all day":"一日中","every morning":"毎朝","every night":"毎晩","every week":"毎週",
  "at night":"夜","all night":"一晩中","all week":"一週間ずっと","all month":"一か月ずっと","this summer":"今年の夏","next summer":"来年の夏","last summer":"去年の夏","this winter":"今年の冬","next winter":"来年の冬","last winter":"去年の冬","at midnight":"真夜中","at noon":"正午","after work":"仕事の後で","after school":"放課後","after dinner":"晩ご飯の後で","after lunch":"昼ご飯の後で","before dinner":"晩ご飯の前に","before bed":"寝る前に","before breakfast":"朝ご飯の前に",someday:"いつか","some day":"いつか","at the end":"最後","in the end":"最後","on monday":"月曜日","on tuesday":"火曜日","on wednesday":"水曜日","on thursday":"木曜日","on friday":"金曜日","on saturday":"土曜日","on sunday":"日曜日","on the weekend":"週末","on weekends":"週末"};
const JIK=["いちじ","にじ","さんじ","よじ","ごじ","ろくじ","しちじ","はちじ","くじ","じゅうじ","じゅういちじ","じゅうにじ"];
// "at seven" -> 七時に ; "at 3:30 pm" -> 午後三時半に
function clock(h,mm,ap){const n=/^\d+$/.test(h)?+h:numOf(h)||({eleven:11,twelve:12})[h.toLowerCase()];if(!n||n<1||n>12)return null;if(mm&&mm!=="00"&&mm!=="30")return null;
  const half=mm==="30",kj=n<=10?KJ[n]:n===11?"十一":"十二",p=ap&&/^(p|in the afternoon|in the evening|at night)/i.test(ap.trim())?[C(/night/i.test(ap)&&n>=9?"夜":"午後",/night/i.test(ap)&&n>=9?"よる":"ごご")]:ap&&/^(a|in the morning)/i.test(ap.trim())?[C(n<=4||n===12?"夜中の":"朝の",n<=4||n===12?"よなかの":"あさの")]:[];
  return[...p,C(kj+"時"+(half?"半":""),JIK[n-1]+(half?"はん":"")),C("に")]}
Object.assign(TIME,{"every summer":"毎年夏","every winter":"毎年冬","every spring":"毎年春","every fall":"毎年秋","every autumn":"毎年秋","every month":"毎月","every weekend":"毎週末","every evening":"毎晩","every sunday":"毎週日曜日","every saturday":"毎週土曜日","every year":"毎年"});
const TFB={"tomorrow morning":{jp:"明日の朝",kana:"あしたのあさ",pos:"adv",en:"tomorrow morning",kind:"everyday"},"every summer":{jp:"毎年夏",kana:"まいとしなつ",pos:"adv",en:"every summer",kind:"everyday"},"every winter":{jp:"毎年冬",kana:"まいとしふゆ",pos:"adv",en:"every winter",kind:"everyday"},"every spring":{jp:"毎年春",kana:"まいとしはる",pos:"adv",en:"every spring",kind:"everyday"},"every fall":{jp:"毎年秋",kana:"まいとしあき",pos:"adv",en:"every fall",kind:"everyday"},"every autumn":{jp:"毎年秋",kana:"まいとしあき",pos:"adv",en:"every autumn",kind:"everyday"},"every weekend":{jp:"毎週末",kana:"まいしゅうまつ",pos:"adv",en:"every weekend",kind:"everyday"},"every sunday":{jp:"毎週日曜日",kana:"まいしゅうにちようび",pos:"adv",en:"every Sunday",kind:"everyday"},"every saturday":{jp:"毎週土曜日",kana:"まいしゅうどようび",pos:"adv",en:"every Saturday",kind:"everyday"},someday:{jp:"いつか",kana:"いつか",pos:"adv",en:"someday",kind:"everyday"},"some day":{jp:"いつか",kana:"いつか",pos:"adv",en:"someday",kind:"everyday"},later:{jp:"後で",kana:"あとで",pos:"adv",en:"later",kind:"everyday"},soon:{jp:"もうすぐ",kana:"もうすぐ",pos:"adv",en:"soon",kind:"everyday"}};
[["this summer","今年の夏","ことしのなつ"],["next summer","来年の夏","らいねんのなつ"],["last summer","去年の夏","きょねんのなつ"],["this winter","今年の冬","ことしのふゆ"],["next winter","来年の冬","らいねんのふゆ"],["last winter","去年の冬","きょねんのふゆ"],["all night","一晩中","ひとばんじゅう"],["all week","一週間ずっと","いっしゅうかんずっと"],["all month","一か月ずっと","いっかげつずっと"],
 ["after work","仕事の後で","しごとのあとで"],["after school","放課後","ほうかご"],["after dinner","晩ご飯の後で","ばんごはんのあとで"],["after lunch","昼ご飯の後で","ひるごはんのあとで"],
 ["before dinner","晩ご飯の前に","ばんごはんのまえに"],["before bed","寝る前に","ねるまえに"],["before breakfast","朝ご飯の前に","あさごはんのまえに"]].forEach(([en,jp,kana])=>{TFB[en]={jp,kana,pos:"adv",en,kind:"everyday"}});
// more time words, said first in Japanese
[["lately","最近","さいきん"],["recently","最近","さいきん"],["these days","最近","さいきん"],["nowadays","最近","さいきん"],["next weekend","来週末","らいしゅうまつ"],["last weekend","先週末","せんしゅうまつ"],["the other day","この間","このあいだ"],["next time","今度","こんど"],
 ["tomorrow night","明日の夜","あしたのよる"],["tomorrow evening","明日の夜","あしたのよる"],["tomorrow afternoon","明日の午後","あしたのごご"],["yesterday morning","昨日の朝","きのうのあさ"],["yesterday afternoon","昨日の午後","きのうのごご"],["yesterday evening","昨日の夕方","きのうのゆうがた"],
 ["this afternoon","今日の午後","きょうのごご"],["at the moment","今","いま"],["earlier today","今日","きょう"],["later today","今日","きょう"],["the day before yesterday","おととい","おととい"],["the day after tomorrow","あさって","あさって"],["next friday","来週の金曜日","らいしゅうのきんようび"],["last friday","先週の金曜日","せんしゅうのきんようび"],
 ["next monday","来週の月曜日","らいしゅうのげつようび"],["last monday","先週の月曜日","せんしゅうのげつようび"],["next saturday","来週の土曜日","らいしゅうのどようび"],["last saturday","先週の土曜日","せんしゅうのどようび"],["next sunday","来週の日曜日","らいしゅうのにちようび"],["last sunday","先週の日曜日","せんしゅうのにちようび"],
 ["sometime","今度","こんど"],["before work","仕事の前に","しごとのまえに"],["before school","学校の前に","がっこうのまえに"],["before class","授業の前に","じゅぎょうのまえに"],["for a second","ちょっと","ちょっと"],["for a minute","ちょっと","ちょっと"],["for a moment","ちょっと","ちょっと"],["next tuesday","来週の火曜日","らいしゅうのかようび"],["last tuesday","先週の火曜日","せんしゅうのかようび"],["next wednesday","来週の水曜日","らいしゅうのすいようび"],["last wednesday","先週の水曜日","せんしゅうのすいようび"],["next thursday","来週の木曜日","らいしゅうのもくようび"],["last thursday","先週の木曜日","せんしゅうのもくようび"],["when i was young","若い頃","わかいころ"],["for tonight","今夜","こんや"],["for tomorrow night","明日の夜","あしたのよる"],["until this evening","夕方まで","ゆうがたまで"],["until the evening","夕方まで","ゆうがたまで"],["until tonight","今夜まで","こんやまで"],["monday morning","月曜日の朝","げつようびのあさ"],["monday afternoon","月曜日の午後","げつようびのごご"],["monday evening","月曜日の夜","げつようびのよる"],["monday night","月曜日の夜","げつようびのよる"],["tuesday morning","火曜日の朝","かようびのあさ"],["tuesday afternoon","火曜日の午後","かようびのごご"],["tuesday evening","火曜日の夜","かようびのよる"],["tuesday night","火曜日の夜","かようびのよる"],["wednesday morning","水曜日の朝","すいようびのあさ"],["wednesday afternoon","水曜日の午後","すいようびのごご"],["wednesday evening","水曜日の夜","すいようびのよる"],["wednesday night","水曜日の夜","すいようびのよる"],["thursday morning","木曜日の朝","もくようびのあさ"],["thursday afternoon","木曜日の午後","もくようびのごご"],["thursday evening","木曜日の夜","もくようびのよる"],["thursday night","木曜日の夜","もくようびのよる"],["friday morning","金曜日の朝","きんようびのあさ"],["friday afternoon","金曜日の午後","きんようびのごご"],["friday evening","金曜日の夜","きんようびのよる"],["friday night","金曜日の夜","きんようびのよる"],["saturday morning","土曜日の朝","どようびのあさ"],["saturday afternoon","土曜日の午後","どようびのごご"],["saturday evening","土曜日の夜","どようびのよる"],["saturday night","土曜日の夜","どようびのよる"],["sunday morning","日曜日の朝","にちようびのあさ"],["sunday afternoon","日曜日の午後","にちようびのごご"],["sunday evening","日曜日の夜","にちようびのよる"],["sunday night","日曜日の夜","にちようびのよる"],["on monday morning","月曜日の朝","げつようびのあさ"],["on monday afternoon","月曜日の午後","げつようびのごご"],["on monday evening","月曜日の夜","げつようびのよる"],["on monday night","月曜日の夜","げつようびのよる"],["on tuesday morning","火曜日の朝","かようびのあさ"],["on tuesday afternoon","火曜日の午後","かようびのごご"],["on tuesday evening","火曜日の夜","かようびのよる"],["on tuesday night","火曜日の夜","かようびのよる"],["on wednesday morning","水曜日の朝","すいようびのあさ"],["on wednesday afternoon","水曜日の午後","すいようびのごご"],["on wednesday evening","水曜日の夜","すいようびのよる"],["on wednesday night","水曜日の夜","すいようびのよる"],["on thursday morning","木曜日の朝","もくようびのあさ"],["on thursday afternoon","木曜日の午後","もくようびのごご"],["on thursday evening","木曜日の夜","もくようびのよる"],["on thursday night","木曜日の夜","もくようびのよる"],["on friday morning","金曜日の朝","きんようびのあさ"],["on friday afternoon","金曜日の午後","きんようびのごご"],["on friday evening","金曜日の夜","きんようびのよる"],["on friday night","金曜日の夜","きんようびのよる"],["on saturday morning","土曜日の朝","どようびのあさ"],["on saturday afternoon","土曜日の午後","どようびのごご"],["on saturday evening","土曜日の夜","どようびのよる"],["on saturday night","土曜日の夜","どようびのよる"],["on sunday morning","日曜日の朝","にちようびのあさ"],["on sunday afternoon","日曜日の午後","にちようびのごご"],["on sunday evening","日曜日の夜","にちようびのよる"],["on sunday night","日曜日の夜","にちようびのよる"],["when i was younger","若い頃","わかいころ"],["when we were younger","若い頃","わかいころ"],["when i was in college","大学生の頃","だいがくせいのころ"],["when i was in high school","高校生の頃","こうこうせいのころ"],["when i was a student","学生の頃","がくせいのころ"],["when i was little","小さい頃","ちいさいころ"],["when i was a kid","子供の頃","こどものころ"],["when i was a child","子供の頃","こどものころ"],["until monday","月曜日まで","げつようびまで"],["until tuesday","火曜日まで","かようびまで"],["until wednesday","水曜日まで","すいようびまで"],["until thursday","木曜日まで","もくようびまで"],["until friday","金曜日まで","きんようびまで"],["until saturday","土曜日まで","どようびまで"],["until sunday","日曜日まで","にちようびまで"],["until tomorrow","明日まで","あしたまで"],["until next week","来週まで","らいしゅうまで"],["until tonight","今夜まで","こんやまで"],["until the weekend","週末まで","しゅうまつまで"],["until next month","来月まで","らいげつまで"],["until payday","給料日まで","きゅうりょうびまで"],["in the winter","冬に","ふゆに"],["in winter","冬に","ふゆに"],["in the summer","夏に","なつに"],["in summer","夏に","なつに"],["in the spring","春に","はるに"],["in spring","春に","はるに"],["in the fall","秋に","あきに"],["in the autumn","秋に","あきに"],["in fall","秋に","あきに"],["this spring","今年の春","ことしのはる"],["next spring","来年の春","らいねんのはる"],["last spring","去年の春","きょねんのはる"],["this fall","今年の秋","ことしのあき"],["next fall","来年の秋","らいねんのあき"],["last fall","去年の秋","きょねんのあき"],["this autumn","今年の秋","ことしのあき"],["next autumn","来年の秋","らいねんのあき"],["last autumn","去年の秋","きょねんのあき"],["sometime soon","近いうちに","ちかいうちに"],["this time","今回","こんかい"],["last time","前回","ぜんかい"],["in a while","しばらく","しばらく"],["for now","とりあえず","とりあえず"]].forEach(([en,jp,kana])=>{if(TIME[en]==null)TIME[en]=jp;if(!TFB[en])TFB[en]={jp,kana,pos:"adv",en,kind:"everyday"}});
// a time word said as one piece, with に after week days: 金曜日に
const timeCh=(t,w)=>/^(on (mon|tue|wed|thu|fri|sat|sun)|at the end|in the end|at midnight|at noon)/i.test(t)?[C(w.jp,w.kana),C("に")]:/^last night$/i.test(t)?[C("昨日","きのう"),C("の"),C("夜","よる")]:[C(w.jp,w.kana)];
const PREP={to:"に",at:"で","in":"で","with":"と",from:"から",by:"で"};
// "eat ramen", "go to Kyoto tomorrow", "buying a ticket"  ->  {v, chunks before the verb, used, past, ing}
const PJ={you:C("あなた","あなた"),him:C("彼","かれ"),her:C("彼女","かのじょ"),me:C("私","わたし"),them:C("彼ら","かれら"),us:C("私たち","わたしたち"),he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")};   // pronouns, for the action builder
const O0=()=>C("を","お");
// "eating sushi" -> the action of "eat sushi"
function vpIng(x){const m=/^([a-z]+?)ing\b(.*)$/i.exec(x.trim());if(!m)return null;const w=m[1].toLowerCase();
  for(const c of [w,w+"e",w.replace(/(.)\1$/,"$1"),w.replace(/y$/,"ie")]){let vp=null;try{vp=VP(c+m[2])}catch(e){vp=null}if(vp&&!vp.past&&!vp.ing)return vp}return null}
// "he forgot his passport": 彼は … 彼の is said once
function selfPoss(ch){for(const p of ["彼","彼女","彼ら"]){const i=ch.findIndex((c,k)=>c&&c[0]===p&&(ch[k+1]||[])[0]==="は");if(i<0)continue;const o=ch;ch=o.filter((c,k)=>!(k>i+1&&c&&c[0]===p&&(o[k+1]||[])[0]==="の")&&!(k>i+2&&c&&c[0]==="の"&&(o[k-1]||[])[0]===p))}return ch}
let TKEYS=null;
function VP(s){const r=VP_(s);if(!r||!r.pre)return r;const l=(s||"").trim().toLowerCase();TKEYS=TKEYS||Object.keys(TIME).sort((a,b)=>b.length-a.length);
  for(const t of TKEYS){if(!l.endsWith(" "+t))continue;const rest=l.slice(0,-t.length-1);if(/ (to|until|till|for|from|since)$/.test(rest))break;const w=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]);if(!w)break;const tc=timeCh(t,w);if(tc&&tc[0]&&!r.pre.some(c=>c&&c[0]===tc[0][0]))return{...r,pre:[...tc,...r.pre],used:[...(r.used||[]),Object.assign({},w,{en:t})]};break}
  return r}
function VP_(s){
  let l=s.trim().replace(/\s+/g," "),pre=[],used=[],note="";
  for(const t of Object.keys(TIME).sort((a,b)=>b.length-a.length)){
    const re=new RegExp("(^| )"+t+"$","i");
    if(re.test(l)&&/ (to|until|till)$/i.test(l.replace(re,"")))continue;
    if(re.test(l)){const w=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]);if(!w)return null;pre.push(...timeCh(t,w));used.push(Object.assign({},w,{en:t}));l=l.replace(re,"").trim();break}
  }
  l=l.replace(/^(make|makes|made|making) (?=(?:the |a |an |some |my |your |his |her |our |this |that )?(?:best |good |delicious |great |amazing |)?(?:favorite |favourite )?(?:dish|dishes|curry|dinner|lunch|breakfast|food|cake|bread|coffee|tea|sushi|pizza|soup|salad|cookies|rice|sandwich|sandwiches|ramen|pasta|bento|meal|meals|omelet|omelette)\b)/i,(x,a)=>({make:"cook",makes:"cooks",made:"cooked",making:"cooking"})[a.toLowerCase()]+" ");
  l=l.replace(/^(take|taking|took|takes) (?=(?:a |the |an |my )?(?:taxi|bus|train|cab|plane|subway|ferry|boat|shinkansen|bullet train|elevator)\b)/i,(x,a)=>({take:"ride",taking:"riding",took:"rode",takes:"rides"})[a.toLowerCase()]+" ");
  {const gm=/^(go|going|went|goes) (shopping|swimming|drinking|fishing|skiing|camping|hiking|running|dancing|jogging|snowboarding|surfing|sightseeing|eating|walking|bowling|cycling)\b(.*)$/i.exec(l);
   if(gm){const kind={shopping:["買い物","かいもの"],fishing:["釣り","つり"],skiing:["スキー"],camping:["キャンプ"],hiking:["ハイキング"],snowboarding:["スノーボード"],surfing:["サーフィン"],sightseeing:["観光","かんこう"],bowling:["ボウリング"],cycling:["サイクリング"],jogging:["ジョギング"],dancing:["踊り","おどり"],running:["ランニング"],walking:["散歩","さんぽ"],swimming:["泳ぎ","およぎ"],drinking:["飲み","のみ"],eating:["食べ","たべ"]}[gm[2].toLowerCase()];
     const go=byJP("行く","v");const r0=gm[3].trim();if(go&&!r0){return{v:go,pre:[C(kind[0],kind[1]||kind[0]),C("に")],used:[go],ing:/^going$/i.test(gm[1]),past:/^went$/i.test(gm[1]),me:false,you:false}}}}
  l=l.replace(/^(wake|woke|waking) (me|us) up\b/i,"$1 up $2");
  {const hp=/^(have|had|having|has) (?:a |an )?(picnic|party|barbecue|bbq|meeting|date|fight|chat|test|exam|class)(?: (by|in|at|on|near) (?:the |a |my |our )?(.+))?$/i.exec(l);if(hp){const N={picnic:["ピクニック"],party:["パーティー"],barbecue:["バーベキュー"],bbq:["バーベキュー"],meeting:["会議","かいぎ"],date:["デート"],fight:["喧嘩","けんか"],chat:["おしゃべり"],test:["テスト"],exam:["試験","しけん"],class:["授業","じゅぎょう"]}[hp[2].toLowerCase()];
     const pl=hp[4]?NP(hp[4]):null;if(!hp[4]||pl&&!pl.pron){const k=(hp[3]||"").toLowerCase();const plc=pl?[...dropMy(pl.chunks),...(k==="by"||k==="near"?[C("の"),C(k==="by"?"そば":"近く",k==="by"?"そば":"ちかく")]:[]),C("で")]:[];
       const test=/^(test|exam|class|meeting)$/i.test(hp[2]);const v=test?byJP("ある","v"):{jp:"する",kana:"する",pos:"vs-i",en:"do",kind:"form"};if(v)return{v,pre:[...plc,C(N[0],N[1]||N[0]),C(test?"が":"を",test?"が":"お")],used:[...(pl?pl.used:[]),v],past:/^had$/i.test(hp[1]),ing:/ing$/i.test(hp[1]),me:false,you:false}}}}
  {const gf=/^(grab|grabbed|grabbing|get|got) (?:some |a )?(food|lunch|dinner|breakfast|a bite|bite|something to eat|coffee|a coffee|drinks|a drink|a beer|beers)$/i.exec(l);const w=gf&&byJP("行く","v");if(gf&&w){const k=gf[2].toLowerCase(),dr=/coffee|drink|beer/.test(k);
     const pre=/lunch/.test(k)?[C("お昼","おひる"),O0(),C("食べ","たべ")]:/dinner/.test(k)?[C("晩ご飯","ばんごはん"),O0(),C("食べ","たべ")]:/breakfast/.test(k)?[C("朝ご飯","あさごはん"),O0(),C("食べ","たべ")]:/coffee/.test(k)?[C("コーヒー"),O0(),C("飲み","のみ")]:dr?[C("飲み","のみ")]:[C("何か","なにか"),C("食べ","たべ")];
     return{v:w,pre:[...pre,C("に")],used:[w],past:/^(grabbed|got)$/i.test(gf[1]),ing:/ing$/i.test(gf[1]),me:false,you:false}}}
  l=l.replace(/^(stare|stared|staring|stares) at\b/i,(x,a)=>({stare:"look",stared:"looked",staring:"looking",stares:"looks"})[a.toLowerCase()]+" at");
  {const mkV=(jp,kana,pos,en)=>{const w=byJP(jp,"v");return w&&w.kana===kana?w:{jp,kana,pos,en,kind:"form"}};const tns=w=>({past:/^(caught|got|paid|left|had|cracked|went|took|came|ran|made|gave|broke|told|said|found|lost|sold|bought|brought|thought|met|sat|wrote|drove|ate|drank|saw|fell|kept|slept|spent|sent|built|felt|held|won|wore|threw|grew|knew|flew|rode|hid|bit|shook|stole|swam|sang|began|forgot|chose|froze|woke|became|understood|stood)$/i.test(w)||/ed$/i.test(w)&&!/^(need|feed|speed|bleed|breed|seed|shed|wed|bed|red|shred|proceed|succeed|exceed)$/i.test(w),ing:/ing$/i.test(w)});let fm;
   if((fm=/^(catch|caught|catching|catches|get|got|getting|gets) (?:a |the )?(cold|flu) from (?:my |the |a |his |her |our )?(.+)$/i.exec(l))){const np=NP(fm[3]);const person=np&&(np.used.some(u=>/(^|,)an(,|$)/.test(u.pos||""))||/\b(friend|friends|mom|mother|dad|father|sister|brother|kids?|son|daughter|wife|husband|boyfriend|girlfriend|coworkers?|colleague|roommate|classmates?|boss|someone|somebody|family|baby|grandma|grandpa|teacher|students?)$/i.test(fm[3]));
     if(np&&!np.pron&&!person){const v=mkV("ひく","ひく","v5k,vt","catch (a cold)");return{v,pre:[...np.chunks,C("の"),C("せい"),C("で"),C(/flu/i.test(fm[2])?"インフルエンザ":"風邪",/flu/i.test(fm[2])?"インフルエンザ":"かぜ"),O0()],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
     const v=mkV("もらう","もらう","v5u,vt","get, receive");if(np&&!np.pron&&v)return{v,pre:[...np.chunks,C("から"),C(/flu/i.test(fm[2])?"インフルエンザ":"風邪",/flu/i.test(fm[2])?"インフルエンザ":"かぜ"),O0()],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(catch|caught|catching|catches|get|got|getting|gets) (?:a |the )?(cold|flu)$/i.exec(l))){const v=mkV("ひく","ひく","v5k,vt","catch (a cold)");return{v,pre:[C(/flu/i.test(fm[2])?"インフルエンザ":"風邪",/flu/i.test(fm[2])?"インフルエンザ":"かぜ"),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(pay|paid|paying|pays) (you|me|him|her|them|us) back(?: (tomorrow|later|soon|next week|today))?$/i.exec(l))&&!fm[3]){const v=mkV("返す","かえす","v5s,vt","give back");return{v,pre:[C("お金","おかね"),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(leave|left|leaving|leaves) ([A-Za-z]+(?: [A-Za-z]+)?)$/i.exec(l))&&!/^(the|my|our|his|her|your|a|an|it|this|that|me|him|them|us|you|early|now|soon|today|tomorrow|tonight|home|work|school)\b/i.test(fm[2])){const np=NP(fm[2]);const L=np&&np.used[np.used.length-1];if(np&&!np.pron&&L&&(isPlace(L.jp)||/^(japan|tokyo|osaka|kyoto|america|england|china|korea|france|canada|australia|the country|this country|this city|the city|town)$/i.test(fm[2]))){const v=mkV("離れる","はなれる","v1,vt","leave (a place)");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}}
   if((fm=/^(change|changed|changing|changes|move|moved|moving|moves|reschedule|rescheduled|rescheduling|reschedules) (?:my |the |our |your )?(reservation|booking|appointment|flight|meeting|room|ticket|plans?|date|time) to (.+)$/i.exec(l))){const k=fm[3].toLowerCase();const tw=TIME[k];let P=null;if(tw){const w=byJP(tw.split("|")[0],"any")||TFB[k];if(w)P=timeCh(k,w)}if(!P){const tm=/^(\d{1,2})(?::(\d\d))?(?: ?(am|pm))?$/i.exec(k)||/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?: (am|pm|o'clock))?$/i.exec(k);if(tm){const n=enNum(tm[1]);if(n>=1&&n<=12)P=[C(["","一","二","三","四","五","六","七","八","九","十","十一","十二"][n]+"時",["","いち","に","さん","よ","ご","ろく","しち","はち","く","じゅう","じゅういち","じゅうに"][n]+"じ")]}}if(!P){const np=NP(fm[3]);if(np&&!np.pron)P=np.chunks}if(!P)return null;
     const N={reservation:["予約","よやく"],booking:["予約","よやく"],appointment:["予約","よやく"],flight:["便","びん"],meeting:["会議","かいぎ"],room:["部屋","へや"],ticket:["チケット"],plan:["予定","よてい"],plans:["予定","よてい"],date:["日にち","ひにち"],time:["時間","じかん"]}[fm[2].toLowerCase()];const v=mkV("変更","へんこう","vs,vt","change");P=P.filter(c=>c[0]!=="に");return{v,pre:[C(N[0],N[1]||N[0]),O0(),...P,C("に")],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(exchange|exchanged|exchanging|swap|change) (this|it|these|them|my [a-z]+|the [a-z]+) for (?:a |an )?(different|another|bigger|smaller|larger|new) (size|color|colour|one|model)$/i.exec(l))){const o=/^(this|it|these|them)$/i.test(fm[2])?{chunks:[C("これ")],used:[]}:NP(fm[2].replace(/^(my|the) /i,""));if(!o)return null;const k=fm[3].toLowerCase();const A=k==="bigger"||k==="larger"?["大きい","おおきい"]:k==="smaller"?["小さい","ちいさい"]:k==="new"?["新しい","あたらしい"]:["別の","べつの"];const N={size:["サイズ"],color:["色","いろ"],colour:["色","いろ"],one:["もの"],model:["モデル"]}[fm[4].toLowerCase()];
     const v=mkV("交換","こうかん","vs,vt","exchange");return{v,pre:[...o.chunks,O0(),C(A[0],A[1]),C(N[0],N[1]||N[0]),C("に")],used:[...o.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets|have|had|having) (?:a |my )?hair ?cut$/i.exec(l))){const v=mkV("切る","きる","v5r,vt","cut");return{v,pre:[C("髪","かみ"),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(meet|met|meeting|meets)(?: up)?(?: (him|her|them|you|my [a-z]+|[A-Z][a-z]+))? ((?:in front of|outside|outside of|inside|behind|next to|near|across from|at) .+)$/i.exec(l))){let W=null;if(fm[2]){const w=/^(him|her|them|you)$/i.test(fm[2])?{chunks:[PJ[fm[2].toLowerCase()]],used:[]}:NP(fm[2]);if(!w)return null;W=[...dropMy(w.chunks),C("と")]}const pl=fm[3].replace(/^at (?:the )?/i,"");const P=/^(in front of|outside|inside|behind|next to|near|across from)/i.test(fm[3])?NP(fm[3]):NP(pl);if(!P||P.pron)return null;
     const v=mkV("会う","あう","v5u,vi","meet");return{v,pre:[...(W||[]),...P.chunks,C("で")],used:[...P.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(pass|passed|passing|missed|miss|went past|go past) (?:our|my|the) (stop|station|exit)$/i.exec(l))){const v=mkV("乗り過ごす","のりすごす","v5s,vt","miss one's stop");return{v,pre:[],used:[v],...tns(fm[1].split(" ")[0]),me:false,you:false}}
   if((fm=/^(travel|traveled|travelled|traveling|travelling|travels|backpack|backpacked|backpacking) (?:around|across|through|all over) (.+)$/i.exec(l))){const np=/^the world$/i.test(fm[2])?{chunks:[C("世界中","せかいじゅう")],used:[]}:NP(fm[2]);if(!np||np.pron)return null;const v=mkV("旅行","りょこう","vs,vi","travel");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(take|took|taking|takes) (her|him|them|you|my [a-z]+) (somewhere (?:fun|nice|special|cool|good|quiet|interesting)|out|to (.+))$/i.exec(l))){const w=/^(her|him|them|you)$/i.test(fm[2])?{chunks:[PJ[fm[2].toLowerCase()]],used:[]}:who(fm[2]);if(!w)return null;let P;const k=fm[3].toLowerCase();if(/^somewhere/.test(k)){const A={fun:"楽しい",nice:"いい",special:"特別な",cool:"かっこいい",good:"いい",quiet:"静かな",interesting:"面白い"}[k.split(" ")[1]];P=[C("どこか"),C(A),C("所","ところ"),C("に")]}else if(k==="out")P=[C("どこか"),C("に")];else{const np=NP(fm[4]);if(!np||np.pron)return null;P=[...np.chunks,C("に")]}
     const v=mkV("連れて行く","つれていく","v5k-s,vt","take (someone)");return{v,pre:[...dropMy(w.chunks),O0(),...P],used:[...w.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(snore|snored|snoring|snores)(?: (?:so |really )?(loud|loudly|a lot))?$/i.exec(l))){const v=mkV("かく","かく","v5k,vt","snore");return{v,pre:[C("いびき"),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) engaged to (her|him|my [a-z]+|his [a-z]+|her [a-z]+|[A-Z][a-z]+)(?: of (two|three|four|five|six|seven|eight|nine|ten|\d+) years)?$/i.exec(l))){const k=fm[2].toLowerCase();let w=null;if(/^(her|him)$/.test(k))w={chunks:[PJ[k]],used:[]};else if(/^(his|her) (girlfriend|boyfriend|partner)$/.test(k))w={chunks:[C(/girl/.test(k)?"彼女":/boy/.test(k)?"彼氏":"パートナー",/girl/.test(k)?"かのじょ":/boy/.test(k)?"かれし":"ぱーとなー")],used:[]};else w=who(fm[2]);if(!w)return null;
     const yrs=fm[3]?enNum(fm[3]):null;const v=mkV("婚約","こんやく","vs,vi","get engaged");return{v,pre:[...(yrs?[C((yrs<=10?KJ[yrs]:yrs)+"年","ねん"),C("付き合っている","つきあっている")]:[]),...dropMy(w.chunks),C("と")],used:[...w.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(fight|fighting|fights|fought)(?: with each other| with (?:his|her|my) (?:brother|sister))?$/i.exec(l))){const v=mkV("けんか","けんか","vs,vi","fight, quarrel");return{v,pre:[],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(propose|proposed|proposing|proposes) to (her|him|me|my [a-z]+|[A-Z][a-z]+)$/i.exec(l))){const w=/^(her|him|me)$/i.test(fm[2])?{chunks:[PJ[fm[2].toLowerCase()]],used:[]}:who(fm[2]);if(!w)return null;const v=mkV("プロポーズ","ぷろぽーず","vs,vi","propose");return{v,pre:[...dropMy(w.chunks),C("に")],used:[...w.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(dye|dyed|dyeing|dyes) (?:my|her|his|your|their) hair (pink|blue|red|black|brown|blonde|blond|green|purple|white|gray|grey|silver|orange|yellow)$/i.exec(l))){const K={pink:["ピンク"],blue:["青","あお"],red:["赤","あか"],black:["黒","くろ"],brown:["茶色","ちゃいろ"],blonde:["金髪","きんぱつ"],blond:["金髪","きんぱつ"],green:["緑","みどり"],purple:["紫","むらさき"],white:["白","しろ"],gray:["グレー"],grey:["グレー"],silver:["銀色","ぎんいろ"],orange:["オレンジ"],yellow:["黄色","きいろ"]}[fm[2].toLowerCase()];const v=mkV("染める","そめる","v1,vt","dye");return{v,pre:[C("髪","かみ"),O0(),C(K[0],K[1]||K[0]),C("に")],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(take|took|taking|takes|use|used|using) the (stairs|elevator|escalator)$/i.exec(l))){const N={stairs:["階段","かいだん"],elevator:["エレベーター"],escalator:["エスカレーター"]}[fm[2].toLowerCase()];const v=mkV("使う","つかう","v5u,vt","use");return{v,pre:[C(N[0],N[1]||N[0]),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(land|landed|landing|lands) (?:at|in) (.+)$/i.exec(l))){const np=NP(fm[2]);if(!np||np.pron)return null;const v=mkV("着く","つく","v5k,vi","arrive");return{v,pre:[...np.chunks,C("に")],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(sweat|sweated|sweating|sweats)(?: (a lot|so much|like crazy))?$/i.exec(l))){const v=mkV("かく","かく","v5k,vt","sweat");return{v,pre:[C("汗","あせ"),O0(),...(fm[2]?[C("たくさん")]:[])],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(raise|raised|raising|raises) (?:the |our |my |their |his |her )?(rent|price|prices|fee|fees|tax|taxes|salary|pay|cost)$/i.exec(l))){const N={rent:["家賃","やちん"],price:["値段","ねだん"],prices:["値段","ねだん"],fee:["料金","りょうきん"],fees:["料金","りょうきん"],tax:["税金","ぜいきん"],taxes:["税金","ぜいきん"],salary:["給料","きゅうりょう"],pay:["給料","きゅうりょう"],cost:["料金","りょうきん"]}[fm[2].toLowerCase()];const v=mkV("上げる","あげる","v1,vt","raise");return{v,pre:[C(N[0],N[1]),O0()],used:[v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(move|moved|moving|moves) (abroad|overseas|to another country|to (?:another|a different) city|to ([A-Z]?[a-z]+(?: [a-z]+)?))$/i.exec(l))&&!/^to (the|my|our|a|an|your|his|her|it|this|that|bed|work|school|front|back|side)\b/i.test(fm[2])){const P=/^(abroad|overseas)$/i.test(fm[2])?{chunks:[C("海外","かいがい")],used:[]}:/another country/i.test(fm[2])?{chunks:[C("外国","がいこく")],used:[]}:/city$/i.test(fm[2])?{chunks:[C("別の街","べつのまち")],used:[]}:NP(fm[3]);if(!P||P.pron)return null;const L=P.used[P.used.length-1];if(fm[3]&&!(L&&isPlace(L.jp)))return null;const v=mkV("引っ越す","ひっこす","v5s,vi","move house");return{v,pre:[...P.chunks,C("に")],used:[...P.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) back(?: home)?(?: from (?:the |my |our |work|school)?(.*))?$/i.exec(l))){let pl=null;const w=/ from work$/i.test(l)?"work":/ from school$/i.test(l)?"school":(fm[2]||"").trim();if(w){pl=w==="work"?{chunks:[C("仕事","しごと")],used:[]}:w==="school"?{chunks:[C("学校","がっこう")],used:[]}:NP(w);if(!pl||pl.pron)return null}const v=mkV("帰ってくる","かえってくる","vk,vi","come back");return{v,pre:pl?[...pl.chunks,C("から")]:[],used:[...(pl?pl.used:[]),v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(leave|left|leaving|leaves) (?:the |my |our |his |her )?(house|home|office|hotel|school|station|room|apartment|building|restaurant|store|shop)$/i.exec(l))){const np=NP(fm[2]),v=mkV("出る","でる","v1,vi","leave");if(np&&v)return{v,pre:[...np.chunks,O0()],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) into (?:the |my |our |his |her |your )?(.+)$/i.exec(l))&&!/^(trouble|a fight|an argument|college|university|school)$/i.test(fm[2])){const np=NP(fm[2]),v=mkV("入る","はいる","v5r,vi","enter");if(np&&!np.pron&&v)return{v,pre:[...np.chunks,C("に")],used:[...np.used,v],...tns(fm[1]),me:false,you:false}}
   if((fm=/^(give|gave|giving|gives) (me|us|him|her|them|you|my [a-z]+|[A-Z][a-z]+) (?!back\b|up\b|a (?:hand|call|ride|hug|break|try|chance)\b)(.+)$/i.exec(l))){const ob=NP(fm[3]);const r0=fm[2].toLowerCase(),me=/^(me|us)$/.test(r0);if(me&&/^give$/i.test(fm[1]))fm=null;else{const rc=me?null:/^(him|her|them|you)$/.test(r0)?{chunks:[PJ[r0]],used:[]}:NP(fm[2]);
     const v=mkV(me?"くれる":"あげる",me?"くれる":"あげる","v1,vt","give");if(ob&&!ob.pron&&(me||rc&&!rc.pron||rc&&/^(him|her|them|you)$/.test(r0)))return{v,pre:[...(rc?[...rc.chunks,C("に")]:[]),...ob.chunks,O0()],used:[...(rc?rc.used:[]),...ob.used,v],...tns(fm[1]),past:/^gave$/i.test(fm[1]),me,you:false}}}
   if((fm=/^(walk|walked|walking|walks|bike|biked|biking|bikes|cycle|cycled|cycling|drive|drove|driving|drives) (home|to (?:the |my |our )?(.+))$/i.exec(l))){const k=fm[1].toLowerCase(),home=/^home$/i.test(fm[2]);
     const how=/^(walk)/.test(k)?["歩いて","あるいて"]:/^(bik|cycl)/.test(k)?["自転車で","じてんしゃで"]:["車で","くるまで"];const pl=home?null:/^work$/i.test(fm[3])?{chunks:[C("仕事","しごと")],used:[]}:NP(fm[3]);
     const v=mkV(home?"帰る":"行く",home?"かえる":"いく",home?"v5r,vi":"v5k-s,vi",home?"go home":"go");if(home||pl&&!pl.pron)return{v,pre:[C(how[0],how[1]),...(pl?[...pl.chunks,C("に")]:[])],used:[...(pl?pl.used:[]),v],past:/^(walked|biked|cycled|drove)$/.test(k),ing:/ing$/.test(k),me:false,you:false}}
   if((fm=/^(invite|invited|inviting|invites) (me|us|him|her|them|you|my [a-z]+|[A-Z][a-z]+) to (?:his |her |their |my |our |the |a |your )?(.+)$/i.exec(l))){const r0=fm[2].toLowerCase(),me=/^(me|us)$/.test(r0),pl=NP(fm[3]),rc=me?null:/^(him|her|them|you)$/.test(r0)?{chunks:[PJ[r0]],used:[]}:NP(fm[2]);const v=mkV("招待","しょうたい","vs,vt","invite");
     if(pl&&!pl.pron&&(me||rc))return{v,pre:[...(rc?[...dropMy(rc.chunks),O0()]:[]),...pl.chunks,C("に")],used:[...pl.used,v],...tns(fm[1]),past:/ed$/i.test(fm[1]),me,you:false}}
   if((fm=/^(say|said|saying|says) (?:sorry|that (?:he|she|they|i) (?:was|were|am) sorry)$/i.exec(l))){const v=mkV("謝る","あやまる","v5r,vi","apologize");return{v,pre:[],used:[v],past:/said/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(finish|finished|finishing|finishes) (?:eating )?(?:my |our |your |the )?(dinner|lunch|breakfast|eating|meal|food)$/i.exec(l))){const v=mkV("食べ終わる","たべおわる","v5r,vi","finish eating");const M={dinner:["晩ご飯","ばんごはん"],lunch:["昼ご飯","ひるごはん"],breakfast:["朝ご飯","あさごはん"]}[fm[2].toLowerCase()];
     return{v,pre:M?[C(M[0],M[1]),O0()]:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(let|letting|lets) (you|him|her|them|everyone) know(?: (?:about|if) .+)?$/i.exec(l))&&!/ (about|if) /i.test(l)){const v=mkV("連絡","れんらく","vs,vi","contact, let know");const r0=fm[2].toLowerCase();return{v,pre:r0==="you"?[]:[...(r0==="everyone"?[C("みんな")]:[PJ[r0]]),C("に")],used:[v],past:false,ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|buy|bought) (my |our |his |her )?(mom|mother|dad|father|parents|sister|brother|wife|husband|boyfriend|girlfriend|friend|son|daughter|boss|teacher|grandma|grandpa|him|her|them|you)(?: (?!for )(.+?))?(?: for (?:his |her |their |my |your )?(birthday|christmas|anniversary|valentine's day|mother's day|father's day))?$/i.exec(l))){
     const buy=/^(buy|bought)$/i.test(fm[1]),r0=fm[3].toLowerCase(),rc=/^(him|her|them|you)$/.test(r0)?{chunks:[PJ[r0]],used:[]}:NP((fm[2]||"my ")+fm[3]),f4=fm[4]||"what",ob=/^(what|something|anything)$/i.test(f4)?null:NP(f4);if(rc&&(ob&&!ob.pron||/^(what|something|anything)$/i.test(f4))){
       const oc=fm[5]?{birthday:["誕生日","たんじょうび"],christmas:["クリスマス"],anniversary:["記念日","きねんび"],"valentine's day":["バレンタイン"],"mother's day":["母の日","ははのひ"],"father's day":["父の日","ちちのひ"]}[fm[5].toLowerCase()]:null;const v=buy?{jp:"買ってあげる",kana:"かってあげる",pos:"v1,vt",en:"buy (for someone)",kind:"form"}:mkV("あげる","あげる","v1,vt","give");
       return{v,pre:[...dropMy(rc.chunks),...(oc?[C("の"),C(oc[0],oc[1]||oc[0])]:[]),C("に"),...(ob?[...ob.chunks,O0()]:/something|anything/i.test(f4)?[C("何か","なにか")]:[])],used:[...rc.used,...(ob?ob.used:[]),v],past:/^(got|bought)$/i.test(fm[1]),ing:false,me:false,you:false}}}
   if((fm=/^(come|came|coming|comes) (?:back )?home(?: (?:for|on) (?:the )?(holidays?|christmas|new year's|new year|summer|summer vacation|vacation|the weekend|weekend|winter break|spring break))?$/i.exec(l))){const v=mkV("帰る","かえる","v5r,vi","go home");const H=fm[2]?{holiday:["休み","やすみ"],holidays:["休み","やすみ"],christmas:["クリスマス"],"new year's":["お正月","おしょうがつ"],"new year":["お正月","おしょうがつ"],summer:["夏休み","なつやすみ"],"summer vacation":["夏休み","なつやすみ"],vacation:["休み","やすみ"],"the weekend":["週末","しゅうまつ"],weekend:["週末","しゅうまつ"],"winter break":["冬休み","ふゆやすみ"],"spring break":["春休み","はるやすみ"]}[fm[2].toLowerCase()]:null;
     return{v,pre:H?[C(H[0],H[1]||H[0]),C("に")]:[],used:[v],past:/^came$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(do|does|did|doing) (?:my |his |her |your |our |their |the )?(homework|dishes|laundry|housework|chores|best|yoga|exercise|karate|judo|shopping|cleaning|cooking|job|work|assignment|report)$/i.exec(l))){const k=fm[2].toLowerCase();
     const N={homework:["宿題","しゅくだい"],dishes:["皿洗い","さらあらい"],laundry:["洗濯","せんたく"],housework:["家事","かじ"],chores:["家事","かじ"],yoga:["ヨガ"],exercise:["運動","うんどう"],karate:["空手","からて"],judo:["柔道","じゅうどう"],shopping:["買い物","かいもの"],cleaning:["掃除","そうじ"],cooking:["料理","りょうり"],job:["仕事","しごと"],work:["仕事","しごと"],assignment:["課題","かだい"],report:["レポート"]}[k];
     if(k==="best"){const v=mkV("頑張る","がんばる","v5r,vi","do one's best");return{v,pre:[],used:[v],past:/did/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
     const v={jp:"する",kana:"する",pos:"vs-i",en:"do",kind:"form"};return{v,pre:[C(N[0],N[1]||N[0]),O0()],used:[v],past:/^did$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(work|worked|working|works) from home$/i.exec(l))){const v=mkV("働く","はたらく","v5k,vi","work");return{v,pre:[C("家","いえ"),C("で")],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(apologize|apologized|apologizing|apologizes|apologise|apologised|said sorry|say sorry) to (me|us|him|her|them|you|my [a-z]+|[A-Z][a-z]+)$/i.exec(l))){const r0=fm[2].toLowerCase(),rc=PJ[r0]?{chunks:[PJ[r0]],used:[]}:NP(fm[2]);const v=mkV("謝る","あやまる","v5r,vi","apologize");
     if(rc&&rc.chunks[0])return{v,pre:[...rc.chunks,C("に")],used:[...rc.used,v],past:/(ed|said)\b/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(treat|treated|treating|treats) (you|him|her|them|us|everyone|my [a-z]+) to (?:a |some )?(.+)$/i.exec(l))){const np=NP(fm[3]);const v=mkV("おごる","おごる","v5r,vt","treat (pay for)");if(np&&!np.pron)return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(show|showed|showing|shows|turn|turned|turning|turns) up$/i.exec(l))){const v=mkV("来る","くる","vk,vi","come");return{v,pre:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(take|took|taking|takes) (a few days|a couple of days|a day|a week|a few weeks|some time|time|the day|(?:two|three|four|five|\d) days) off(?: work)?$/i.exec(l))){const k=fm[2].toLowerCase();const n=/^(two|three|four|five|\d)/.test(k)?numOf(k.split(" ")[0]):null;
     const H=n?[C(KJ[n]+"日","")]:/few|couple/.test(k)?[C("何日か","なんにちか")]:/a day|the day/.test(k)?[C("一日","いちにち")]:/a week/.test(k)?[C("一週間","いっしゅうかん")]:[];if(n){const dd=duration(String(n),"days");if(dd)H[0]=dd}
     const v=mkV("取る","とる","v5r,vt","take");return{v,pre:[...H,C("休み","やすみ"),O0()],used:[v],past:/took/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(rest|rested|resting|rests|relax|relaxed|relaxing|stay home|stay in bed) for a (few|couple of) (days|hours|weeks)$/i.exec(l))){const k=fm[3].toLowerCase();const H={days:["何日か","なんにちか"],hours:["何時間か","なんじかんか"],weeks:["何週間か","なんしゅうかんか"]}[k];const v=/bed/i.test(fm[1])?mkV("寝る","ねる","v1,vi","sleep"):mkV("休む","やすむ","v5m,vi","rest");return{v,pre:[C(H[0],H[1])],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(jump|jumped|jumping|jumps) (onto|on|into|in|off|over) (?:the |my |a |our )?(.+)$/i.exec(l))){const np=NP(fm[3]);const k=fm[2].toLowerCase();const V=/^on/.test(k)?["飛び乗る","とびのる"]:/^in/.test(k)?["飛び込む","とびこむ"]:k==="off"?["飛び降りる","とびおりる"]:["飛び越える","とびこえる"];
     const v={jp:V[0],kana:V[1],pos:/降りる|越える/.test(V[0])?"v1,vi":/込む/.test(V[0])?"v5m,vi":"v5r,vi",en:"jump",kind:"form"};if(np&&!np.pron)return{v,pre:[...dropMy(np.chunks),C(k==="off"?"から":k==="over"?"を":"に",k==="over"?"お":null)],used:[...np.used,v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(pass|passed|passing|hand|handed) (me|us|him|her) (?:the |that |this |some |my )?(.+)$/i.exec(l))&&!/^(exam|test|interview)/i.test(fm[3])){const np=NP(fm[3]);const v=mkV("取る","とる","v5r,vt","take, pass");if(np&&!np.pron)return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(pick|picked|picking|picks) (?:up (my |the |our |his |her )?(kids|children|son|daughter|kid|wife|husband|mom|dad|friend|friends|sister|brother|parents|grandma|grandpa)|(my |the |our |his |her )?(kids|children|son|daughter|kid|wife|husband|mom|dad|friend|friends|sister|brother|parents|grandma|grandpa) up)(?: (?:from|at) (?:the |my |our )?(.+))?$/i.exec(l))){
     const who0=NP((fm[2]||fm[4]||"my ")+(fm[3]||fm[5]));const pl=fm[6]?NP(fm[6]):null;if(fm[6]&&(!pl||pl.pron))return null;const v=mkV("行く","いく","v5k-s,vi","go");if(who0&&!who0.pron)return{v,pre:[...(pl?[...pl.chunks,C("に")]:[]),...dropMy(who0.chunks),O0(),C("迎え","むかえ"),C("に")],used:[...who0.used,...(pl?pl.used:[]),v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(try|tried|trying|tries) (?:the |some |a |this |that |their |your )?(.+)$/i.exec(l))&&!/^(to|it|on|again|hard|my best|your best|this one|that one)\b/i.test(fm[2])){const k=fm[2].toLowerCase();const hr=/^(.+) (here|there)$/i.exec(fm[2]);const np=hr&&/^(food|dishes|ramen|sushi|coffee|beer|curry|pizza|cake|desserts?)$/i.test(hr[1])?(()=>{const n=/^(food|dishes)$/i.test(hr[1])?{chunks:[C("料理","りょうり")],used:[],fd:true}:NP(hr[1]);return n?{...n,chunks:[C(/here/i.test(hr[2])?"ここ":"そこ"),C("の"),...n.chunks],fd:true}:null})():/^local (food|dishes|cuisine|specialties|specialty)$/.test(k)?{chunks:[C("地元","じもと"),C("の"),C("料理","りょうり")],used:[],fd:true}:NP(fm[2]);
     const fd=np&&!np.pron&&(np.fd||np.used.length&&np.used.every(u=>u&&/(^|,)fd(,|$)/.test(u.pos||""))||/(food|dish|dishes|cuisine)$/.test(k));if(fd){const dr=np.used.some(u=>/^(お酒|ビール|ワイン|日本酒|お茶|コーヒー|ジュース|酒|紅茶|緑茶|水|抹茶|牛乳|ミルク|ソーダ|コーラ|カクテル|焼酎|ラテ|ウイスキー|梅酒|甘酒|飲み物)$/.test(u.jp)||/\b(tea|coffee|drink|drinks|juice|beer|wine|sake|milk|soda|latte|cola|cocktail|matcha|whisk(?:e)?y|liquor)\b/i.test(u.en||""));const v=dr?mkV("飲んでみる","のんでみる","v1,vt","try drinking"):mkV("食べてみる","たべてみる","v1,vt","try eating");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}
   if((fm=/^(break|broke|breaking|breaks) (?:my|his|her|their|your|our) (arm|leg|wrist|ankle|finger|nose|toe|foot|rib|collarbone|hand)(?: (?:while )?(playing [a-z]+|skiing|snowboarding|skating|skateboarding|running|climbing|surfing))?$/i.exec(l))){const P={arm:["腕","うで"],leg:["足","あし"],wrist:["手首","てくび"],ankle:["足首","あしくび"],finger:["指","ゆび"],nose:["鼻","はな"],toe:["足の指","あしのゆび"],foot:["足","あし"],rib:["肋骨","ろっこつ"],collarbone:["鎖骨","さこつ"],hand:["手","て"]}[fm[2].toLowerCase()];
     let pre=[];if(fm[3]){const a=fm[3].toLowerCase();const S={skiing:["スキー"],snowboarding:["スノーボード"],skating:["スケート"],skateboarding:["スケボー"],running:["ランニング"],climbing:["登山","とざん"],surfing:["サーフィン"]};let g=S[a];if(!g){const np=NP(a.replace(/^playing /,""));if(!np||np.pron)return null;pre=[...np.chunks,O0(),C("して"),C("いて")]}else pre=[C(g[0],g[1]||g[0]),O0(),C("して"),C("いて")]}
     const v=mkV("骨折","こっせつ","vs,vi","break a bone");return{v,pre:[...pre,C(P[0],P[1]),O0()],used:[v],past:/^broke$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^([a-z]+) more ([a-z].*)$/i.exec(l))&&!/^(much|and|than|time|often|slowly|quickly|carefully|than)\b/i.test(fm[2])&&!/^(one|any|some|no|once|twice)$/i.test(fm[1])){const r=VP(fm[1]+" "+fm[2]);if(r&&r.pre.length)return{...r,pre:[C("もっと"),...r.pre]}}
   if((fm=/^(change|changed|changing|exchange|exchanged|exchanging|exchanges|changes) (?:some |my |the |a little |a bit of )?(money|cash|currency|dollars|euros|yen)(?: (?:to|into|for) (yen|dollars|euros|japanese yen))?$/i.exec(l))){const v=mkV("両替","りょうがえ","vs,vt","exchange money");const to=fm[3]?{yen:["円","えん"],"japanese yen":["円","えん"],dollars:["ドル"],euros:["ユーロ"]}[fm[3].toLowerCase()]:null;return{v,pre:to?[C(to[0],to[1]||to[0]),C("に")]:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(grab|get|grabbing|getting) something$/i.exec(l))){const v=mkV("行く","いく","v5k-s,vi","go");return{v,pre:[C("何か","なにか"),C("取り","とり"),C("に")],used:[v],past:false,ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(turn|turned|turning) (up|down) the (heat|heater|heating|ac|a\/c|air conditioning|air conditioner|aircon)$/i.exec(l))){const hot=/^hea/i.test(fm[3]);const v={jp:"する",kana:"する",pos:"vs-i",en:"do",kind:"form"};return{v,pre:[C(hot?"暖房":"冷房",hot?"だんぼう":"れいぼう"),O0(),C(/up/i.test(fm[2])?"強く":"弱く",/up/i.test(fm[2])?"つよく":"よわく")],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(go|went|going|goes|come|came|coming|comes) (see|watch|eat|buy|get|visit|meet|play|check out|grab) (.+)$/i.exec(l))){const r=VP(fm[2]+" "+fm[3]);const st=r&&!r.past&&!r.ing&&vstems(r.v);if(st&&st.i){const come=/^c/i.test(fm[1]);const v=come?mkV("来る","くる","vk,vi","come"):mkV("行く","いく","v5k-s,vi","go");return{v,pre:[...r.pre,C(st.i[0],st.i[1]),C("に")],used:[...r.used,v],past:/^(went|came)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}
   if((fm=/^(stop|stopped|stopping|stops) (here|there|at the (?:next )?(?:corner|light|station|entrance|gate|door))$/i.exec(l))){const k=fm[2].toLowerCase();const P=k==="here"?[C("ここ")]:k==="there"?[C("そこ")]:(NP(k.replace(/^at /,""))||{}).chunks;if(!P)return null;const v=mkV("止まる","とまる","v5r,vi","stop");return{v,pre:[...P,C("で")],used:[v],past:/ped$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(try|tried|trying|tries) ((?:that|this|the|a) (?:(?!at |in |from |of |on )[a-z]+ ){0,3}(?:place|shop|restaurant|joint|spot|stand|cafe|bar)(?: (?:that )?everyone (?:is|'s) talking about| (?:that )?(?:just )?opened(?: up)?(?: (?:near|by) (?:my|our|the) [a-z]+)?)?)$/i.exec(l))){const np=NP(fm[2]);if(np&&!np.pron){const st=vstems(mkV("行く","いく","v5k-s,vi","go"));const v=mkV("行ってみる","いってみる","v1,vi","try going");return{v,pre:[...np.chunks,C("に")],used:[...np.used,v],past:/ied$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}
   if((fm=/^(start|started|starting|starts|begin|began|beginning|begins) ([a-z]+ing)(?: (.+))?$/i.exec(l))){const r=vpIng(fm[2]+(fm[3]?" "+fm[3]:""));const st=r&&vstems(r.v);if(st&&st.i){const v=mkV(st.i[0]+"始める",st.i[1]+"はじめる","v1,vt","start doing");return{v,pre:r.pre,used:[...r.used,v],past:/^(started|began)$/i.test(fm[1]),ing:/ing$/i.test(fm[1])&&!/^(starting|beginning) [a-z]+ing/i.test(l)?true:false,me:false,you:false}}}
   if((fm=/^(finish|finished|finishing|finishes) (?:reading )?(?:the|this|that|my|a) (book|novel|manga|magazine)$/i.exec(l))){const np=NP(fm[2]);if(!np)return null;const v=mkV("読み終わる","よみおわる","v5r,vt","finish reading");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(take|took|taking|takes) (a lot of|lots of|so many|many|some|a few|a couple of|tons of) (pictures|photos)(?: (at|in|of) (?:the |a |my |our )?(.+))?$/i.exec(l))){const pl=fm[5]?NP(fm[5]):null;if(fm[5]&&(!pl||pl.pron))return null;const v=mkV("撮る","とる","v5r,vt","take (a photo)");const amt=/few|couple|some/i.test(fm[2])?"何枚か":"たくさん";return{v,pre:[...(pl?[...pl.chunks,C(/^of$/i.test(fm[4])?"の":"で")]:[]),C("写真","しゃしん"),O0(),C(amt,amt==="何枚か"?"なんまいか":"たくさん")],used:[v],past:/^took$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(wait|waited|waiting|waits) in (?:a |the )?(?:line|queue)(?: for (an?|one|two|three|four|five|six|ten|fifteen|twenty|thirty|forty|\d+) (minutes?|hours?))?(?: (?:to get in|to get inside|to enter|to buy (?:a |the )?tickets?))?$/i.exec(l))){const v=mkV("並ぶ","ならぶ","v5b,vi","line up");const du=fm[2]?duration(fm[2],fm[3]):null;if(fm[2]&&!du)return null;return{v,pre:[...(/get in|enter/i.test(l)?[C("入る","はいる"),C("ために")]:/tickets?/i.test(l)?[C("チケット"),O0(),C("買う","かう"),C("ために")]:[]),...(du?[du]:[])],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(drive|drove|driving|drives) around (?:the )?(.+)$/i.exec(l))){const np=NP(fm[2]);if(!np||np.pron)return null;const v=mkV("ドライブ","どらいぶ","vs,vi","drive around");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/^drove$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(carry|carried|carrying|carries) (?:my |the |our |your |his |her |these |those )?(.+?) (upstairs|downstairs|inside|to the car|home)$/i.exec(l))){const np=NP(fm[2]);if(!np||np.pron)return null;const D={upstairs:["上の階","うえのかい"],downstairs:["下の階","したのかい"],inside:["中","なか"],"to the car":["車","くるま"],home:["家","いえ"]}[fm[3].toLowerCase()];const v=mkV("運ぶ","はこぶ","v5b,vt","carry");return{v,pre:[...np.chunks,O0(),C(D[0],D[1]),C("まで")],used:[...np.used,v],past:/ied$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(cut|cutting|cuts) (?:back|down) on (.+)$/i.exec(l))){const np=NP(fm[2]);if(!np||np.pron)return null;const v=mkV("減らす","へらす","v5s,vt","reduce");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:false,ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(move|moved|moving|moves) (here|there)$/i.exec(l))){const v=/here/i.test(fm[2])?mkV("引っ越してくる","ひっこしてくる","vk,vi","move here"):mkV("引っ越す","ひっこす","v5s,vi","move house");return{v,pre:[C(/here/i.test(fm[2])?"ここ":"そこ"),C("に")],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(skip|skipped|skipping|skips) (breakfast|lunch|dinner|meals|class|school|work|the gym)$/i.exec(l))){const k=fm[2].toLowerCase();const meal=/breakfast|lunch|dinner|meals/.test(k);const W={breakfast:["朝ご飯","あさごはん"],lunch:["お昼","おひる"],dinner:["晩ご飯","ばんごはん"],meals:["食事","しょくじ"],class:["授業","じゅぎょう"],school:["学校","がっこう"],work:["仕事","しごと"],"the gym":["ジム"]}[k];
     const v=meal?mkV("抜く","ぬく","v5k,vt","skip"):mkV("サボる","さぼる","v5r,vt","skip");return{v,pre:[C(W[0],W[1]||W[0]),O0()],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(run|ran|running|runs) (?:a |the )?(marathon|half marathon|5k|10k|race)$/i.exec(l))){const W={marathon:["マラソン"],"half marathon":["ハーフマラソン"],"5k":["5キロ"],"10k":["10キロ"],race:["レース"]}[fm[2].toLowerCase()];const v=mkV("走る","はしる","v5r,vi","run");return{v,pre:[C(W[0]),O0()],used:[v],past:/^ran$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(run|ran|running|runs|own|owns|owned) (?:a |an |the |their |his |her |my |our )?((?:small |little |big |family |local )?(?:restaurant|shop|store|business|company|cafe|café|hotel|bar|bakery|farm|clinic|school))$/i.exec(l))){const np=NP(fm[2]);if(!np||np.pron)return null;const v=mkV("経営","けいえい","vs,vt","run (a business)");return{v,pre:[...np.chunks,O0()],used:[...np.used,v],past:/^(ran|owned)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(make|made|making|makes|tell|told|telling|tells) (?:a |some )?jokes?$/i.exec(l))){const v=mkV("言う","いう","v5u,vt","say");return{v,pre:[C("冗談","じょうだん"),O0()],used:[v],past:/^(made|told)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) (divorced|married|engaged)$/i.exec(l))){const v=/divorced/i.test(fm[2])?mkV("離婚","りこん","vs,vi","divorce"):/engaged/i.test(fm[2])?mkV("婚約","こんやく","vs,vi","get engaged"):mkV("結婚","けっこん","vs,vi","marry");return{v,pre:[],used:[v],past:/^got$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(go|went|going|goes) (camping|hiking|skiing|fishing|swimming|surfing|snowboarding|shopping) (?:in|at|on|to) (?:the )?(.+)$/i.exec(l))){const np=NP(fm[3]);if(!np||np.pron)return null;const K={camping:["キャンプ"],hiking:["ハイキング"],skiing:["スキー"],fishing:["釣り","つり"],swimming:["泳ぎ","およぎ"],surfing:["サーフィン"],snowboarding:["スノーボード"],shopping:["買い物","かいもの"]}[fm[2].toLowerCase()];const v=mkV("行く","いく","v5k-s,vi","go");return{v,pre:[...np.chunks,C("へ","え"),C(K[0],K[1]||K[0]),C("に")],used:[...np.used,v],past:/^went$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(stay|stayed|staying|stays) (inside|indoors|in)$/i.exec(l))){const v={jp:"いる",kana:"いる",pos:"v1,vi",en:"be, stay",kind:"form"};return{v,pre:[C("家","いえ"),C("に")],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(wake|woke|waking|wakes|get|got|getting|gets) up early$/i.exec(l))){const v=mkV("早起き","はやおき","vs,vi","get up early");return{v,pre:[],used:[v],past:/^(woke|got)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(stay|stayed|staying|stays) (?:a (?:little |bit )?)?longer$/i.exec(l))){const v={jp:"いる",kana:"いる",pos:"v1,vi",en:"be, stay",kind:"form"};return{v,pre:[C("もっと")],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(pay|paid|paying|pays) for (lunch|dinner|breakfast|drinks|the drinks|the meal|the food|the tickets?|everything|it|that|the taxi|coffee|the coffee|the hotel|the room|my ticket|our tickets)$/i.exec(l))){const k=fm[2].toLowerCase().replace(/^(the|my|our) /,"");
     const W={lunch:["お昼代","おひるだい"],dinner:["夕食代","ゆうしょくだい"],breakfast:["朝食代","ちょうしょくだい"],drinks:["飲み代","のみだい"],meal:["食事代","しょくじだい"],food:["食事代","しょくじだい"],ticket:["チケット代","ちけっとだい"],tickets:["チケット代","ちけっとだい"],taxi:["タクシー代","たくしーだい"],coffee:["コーヒー代","こーひーだい"],hotel:["ホテル代","ほてるだい"],room:["部屋代","へやだい"]}[k];
     const v=mkV("払う","はらう","v5u,vt","pay");const pre=W?[C(W[0],W[1]),O0()]:k==="everything"?[C("全部","ぜんぶ")]:[C("それ"),O0()];return{v,pre,used:[v],past:/^paid$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(tell|told|telling|tells) (me|us|him|her|them) about (.+)$/i.exec(l))){const k=fm[3].toLowerCase();const np=/^(it|this|that)$/.test(k)?{chunks:[C("それ")],used:[]}:/^(yourself)$/.test(k)?{chunks:[C("あなた"),C("の"),C("こと")],used:[]}:NP(fm[3]);if(!np||np.pron&&!/^(this|that|these|those)/.test(np.pron))return null;const me=/^(me|us)$/i.test(fm[2]);
     const v=me?mkV("教える","おしえる","v1,vt","tell"):mkV("話す","はなす","v5s,vt","tell");return{v,pre:[...(me?[]:[PJ[fm[2].toLowerCase()],C("に")]),...dropMy(np.chunks),C("について")],used:[...np.used,v],past:/^told$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:me,you:false}}
   if((fm=/^(buy|bought|buying|buys|get|got|getting|gets) (something|anything|a gift|a present|presents|gifts) for ((?:my |our |your |his |her )?.+)$/i.exec(l))&&!/^(me|myself|lunch|dinner|breakfast|the trip|the party|christmas|a headache|my headache|a cold|pain|my birthday|your birthday|the trip|my trip)$/i.test(fm[3])){const k=fm[3].toLowerCase();const np=/^(you|him|her|them|us)$/.test(k)?{chunks:[PJ[k]],used:[]}:NP(fm[3]);if(!np||np.pron&&!PJ[k])return null;
     const v=mkV("買う","かう","v5u,vt","buy");const g=/gift|present/i.test(fm[2]);return{v,pre:[...dropMy(np.chunks),C("に"),C(g?"プレゼント":"何か",g?"ぷれぜんと":"なにか"),...(g?[O0()]:[])],used:[...np.used,v],past:/^(bought|got)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(park|parked|parking|parks) (?:my |the |your |our |his |her )?(car|bike|bicycle|scooter|motorcycle)(?: (?:here|there))?$/i.exec(l))){const W={car:["車","くるま"],bike:["自転車","じてんしゃ"],bicycle:["自転車","じてんしゃ"],scooter:["スクーター"],motorcycle:["バイク"]}[fm[2].toLowerCase()];const v=mkV("止める","とめる","v1,vt","park, stop");return{v,pre:[...(/ here$/i.test(l)?[C("ここ"),C("に")]:/ there$/i.test(l)?[C("そこ"),C("に")]:[]),C(W[0],W[1]||W[0]),O0()],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(cover|covered|covering|covers) (?:(her|his|my|your|their|someone's|a coworker's|[a-z]+'s) )?shifts?$/i.exec(l))){const own=fm[2]&&!/^(my)$/i.test(fm[2]);const w0=own&&/^(her|his|their|your)$/i.test(fm[2])?PJ[fm[2].toLowerCase()==="her"?"her":fm[2].toLowerCase()==="his"?"him":fm[2].toLowerCase()==="their"?"them":"you"]:null;const v=mkV("代わる","かわる","v5r,vi","take over for");return{v,pre:[...(w0?[w0,C("の")]:[]),C("シフト"),O0()],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) better at (.+)$/i.exec(l))){const g=/^[a-z]+ing\b/i.test(fm[2]);let ch=null,used=[];if(g){const vp=vpIng(fm[2]);const d=vp&&vplain(vp.v,"dict");if(d){ch=[...dropMy(vp.pre),...d,C("の")];used=vp.used}}else{const np=NP(fm[2]);if(np&&!np.pron){ch=np.chunks;used=np.used}}if(!ch)return null;const v=mkV("なる","なる","v5r,vi","become");return{v,pre:[...ch,C("が"),C("上手","じょうず"),C("に")],used:[...used,v],past:/^got$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) (?:some )?(sleep|rest)$/i.exec(l))){const v=/sleep/i.test(fm[2])?mkV("寝る","ねる","v1,vi","sleep"):mkV("休む","やすむ","v5m,vi","rest");return{v,pre:[C("少し","すこし")],used:[v],past:/^got$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(give|gave|gives|giving) (?:us|me|them|him|her|the class|the students|everyone) (a lot of |lots of |so much |too much |some |more |extra )?homework$/i.exec(l))){const v=mkV("出す","だす","v5s,vt","give out");return{v,pre:[C("宿題","しゅくだい"),O0(),...(/lot|much/i.test(fm[2]||"")?[C("たくさん")]:/more|extra/i.test(fm[2]||"")?[C("もっと")]:[])],used:[v],past:/^gave$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(fall|fell|falling|falls) asleep(?: (on|in|at|during) (?:the |my |a |class$)?(.+))?$/i.exec(l))){const v=mkV("寝てしまう","ねてしまう","v5u,vi","fall asleep");let pl=[];if(fm[3]){const k=fm[3].toLowerCase();const np=k==="class"?{chunks:[C("授業","じゅぎょう")],used:[]}:NP(fm[3]);if(!np||np.pron)return null;pl=[...np.chunks,C(/during/i.test(fm[2])||k==="class"?"中に":"で")];if(k==="class")pl=[C("授業","じゅぎょう"),C("中に","ちゅうに")]}return{v,pre:pl,used:[v],past:/^fell$/i.test(fm[1]),ing:false,me:false,you:false}}
   if((fm=/^(move|moved|moving|moves) (?:house|away|out)$/i.exec(l))){const v=mkV("引っ越す","ひっこす","v5s,vi","move house");return{v,pre:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(depart|departed|departing|departs)$/i.exec(l))){const v=mkV("出発","しゅっぱつ","vs,vi","depart");return{v,pre:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^called (me|us)$/i.exec(l))){const v=mkV("くれる","くれる","v1,vt","give (to me)");return{v,pre:[C("電話","でんわ"),O0()],used:[v],past:true,ing:false,me:false,you:false}}
   if((fm=/^(come|came|coming|comes) over(?: for (dinner|lunch|breakfast|coffee|tea|a drink|drinks))?$/i.exec(l))){const v=mkV("来る","くる","vk,vi","come");const ml=fm[2]&&fm[2].toLowerCase();
     const M={dinner:[["晩ご飯","ばんごはん"],["食べ","たべ"]],lunch:[["お昼","おひる"],["食べ","たべ"]],breakfast:[["朝ご飯","あさごはん"],["食べ","たべ"]],coffee:[["コーヒー"],["飲み","のみ"]],tea:[["お茶","おちゃ"],["飲み","のみ"]],"a drink":[["お酒","おさけ"],["飲み","のみ"]],drinks:[["お酒","おさけ"],["飲み","のみ"]]}[ml];
     return{v,pre:[C("うち"),C("に"),...(M?[C(M[0][0],M[0][1]||M[0][0]),O0(),C(M[1][0],M[1][1]),C("に")]:[C("遊び","あそび"),C("に")])],used:[v],past:/^came$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(lock|locked|locking|locks|unlock|unlocked|unlocking|unlocks) (?:the |my |your |our )?(door|front door|car|room|window|gate|it)$/i.exec(l))){const un=/^un/i.test(fm[1]);const v=un?mkV("開ける","あける","v1,vt","open"):mkV("閉める","しめる","v1,vt","close");
     const W={door:["ドア"],"front door":["玄関","げんかん"],car:["車","くるま"],room:["部屋","へや"],window:["窓","まど"],gate:["門","もん"]}[fm[2].toLowerCase()];
     return{v,pre:[...(W?[C(W[0],W[1]||W[0]),C("の")]:[]),C("鍵","かぎ"),O0()],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(get|got|getting|gets) there$/i.exec(l))){const v=mkV("着く","つく","v5k,vi","arrive");return{v,pre:[],used:[v],past:/^got$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(come|came|coming|comes|go|went|going|goes) (?:in|inside)$/i.exec(l))){const v=mkV("入る","はいる","v5r,vi","enter");return{v,pre:[],used:[v],past:/^(came|went)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}
   if((fm=/^(crack|cracked|cracks|cracking|shatter|shattered|smash|smashed)$/i.exec(l))){const v=mkV("割れる","われる","v1,vi","crack, break");return{v,pre:[],used:[v],past:/ed$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}
  l=l.replace(/^be (here|back)\b/i,(x,a)=>/here/i.test(a)?"come":"come back").replace(/^be there\b/i,"go there");
  {const tx=/^(take|took|taking|takes|ride|rode|get|got) (?:a |the )?(taxi|cab|bus|train|subway|uber) (home|back|here|there|to (.+))$/i.exec(l);if(tx){const by=NP(tx[2]);const k=tx[3].toLowerCase();
     const v=byJP(k==="home"||k==="back"?"帰る":k==="here"?"来る":"行く","v"),pl=k==="home"?{chunks:[C("家","いえ")],used:[]}:k==="here"?{chunks:[C("ここ")],used:[]}:k==="there"?{chunks:[C("そこ")],used:[]}:k==="back"?{chunks:[],used:[]}:NP(tx[4]);
     if(by&&v&&pl&&!pl.pron)return{v,pre:[...by.chunks,C("で"),...dropMy(pl.chunks),...(pl.chunks.length?[C("に")]:[])],used:[...by.used,...pl.used,v],past:/^(took|rode|got)$/i.test(tx[1]),ing:/ing$/i.test(tx[1]),me:false,you:false}}}
  {const hd=/^(.+?) (?:really |very |so )?hard( for .+)?$/i.exec(l);if(hd&&/^(study|studied|studying|studies|work|worked|working|works|practice|practiced|practicing|train|trained|training|try|tried|trying)\b/i.test(hd[1])&&!/\b(on|at|in)$/i.test(hd[1])){const r=VP(hd[1]+(hd[2]||""));if(r)return{...r,pre:[...r.pre,...(/really|very|so/i.test(l)?[C("本当に","ほんとうに")]:[]),C("一生懸命","いっしょうけんめい")]}}}
  {const fe=/^(fail|failed|failing|fails)(?: (?:the |my |an? |his |her )?(test|exam|examination|entrance exam|driving test|interview))?$/i.exec(l);const w=fe&&byJP("落ちる","v");if(fe&&w){const np=fe[2]?NP(fe[2]):null;return{v:w,pre:np?[...np.chunks,C("に")]:[],used:[...(np?np.used:[]),w],past:/ed$/i.test(fe[1]),ing:/ing$/i.test(fe[1]),me:false,you:false}}}
  {const vs=/^(visit|visited|visiting|visits) (him|her|them|my [a-z]+|[A-Z][a-z]+)$/i.exec(l);const w=vs&&byJP("行く","v");if(vs&&w){const p=vs[2].toLowerCase(),np=/^(him|her|them)$/.test(p)?{chunks:[PJ[p]],used:[]}:NP(vs[2]);
     if(np&&np.chunks[0]&&(np.pron==null||/^(him|her|them)$/.test(p))&&(/^(him|her|them)$/.test(p)||np.used.some(u=>/(^|,)an(,|$)/.test(u.pos||""))||/^(my )/i.test(vs[2])&&/(mom|dad|mother|father|parents|grand\w*|brother|sister|friend|aunt|uncle|cousin|family|son|daughter|boyfriend|girlfriend)s?$/i.test(vs[2])||/^[A-Z]/.test(vs[2])&&isName(vs[2])))
       return{v:w,pre:[...dropMy(np.chunks),C("に"),C("会い","あい"),C("に")],used:[...np.used,w],past:/ed$/i.test(vs[1]),ing:/ing$/i.test(vs[1]),me:false,you:false}}}
  l=l.replace(/^(had|having) (?=(?:a |an |some |my |the |hot |iced |a cup of |a glass of )?(?:coffee|tea|beer|beers|drink|drinks|wine|water|juice|milk|sake|soda|cocktail|cocktails|latte)\b)/i,(x,a)=>({had:"drank",having:"drinking"})[a.toLowerCase()]+" ")
   .replace(/^(had|having) (?=(?:a |an |some |my |the )?(?:breakfast|lunch|dinner|meal|ramen|sushi|pizza|curry|snack|snacks|dessert|cake|sandwich|noodles|rice|steak|burger|burgers|salad|soup|bento)\b)/i,(x,a)=>({had:"ate",having:"eating"})[a.toLowerCase()]+" ")
   .replace(/^(have|has) (?=(?:breakfast|lunch|dinner)\b)/i,(x,a)=>({have:"eat",has:"eats"})[a.toLowerCase()]+" ");
  {const hm=/^(help|helped|helping|helps) (me|us|you|him|her|them|my [a-z]+) with (.+)$/i.exec(l);const w=hm&&byJP("手伝う","v");if(hm&&w){const np=NP(hm[3]);if(np&&!np.pron){const p=hm[2].toLowerCase();
     const npc=dropMy(np.chunks),poss=(npc[1]||[])[0]==="の";
     return{v:w,pre:[...(poss||/^(me|us|you)$/.test(p)?[]:/^my /.test(p)?[...dropMy((NP(hm[2])||{chunks:[]}).chunks),C("の")]:[PJ[p],C("の")]),...npc,C("を","お")],used:[...np.used,w],past:/ed$/i.test(hm[1]),ing:/ing$/i.test(hm[1]),me:false,you:false}}}}
  {const mf=/^(meet|meeting|met|meets) (my [a-z]+|him|her|them|you|friends|[A-Z][a-z]+) for (lunch|dinner|breakfast|coffee|drinks|a drink|tea)$/i.exec(l);const w=mf&&byJP("行く","v");if(mf&&w){const p=mf[2].toLowerCase(),who2=/^(him|her|them|you)$/.test(p)?{chunks:[PJ[p]],used:[]}:NP(mf[2]);
     if(who2&&who2.chunks[0]){const k=mf[3].toLowerCase(),act=/lunch/.test(k)?[C("お昼","おひる"),C("を","お"),C("食べ","たべ")]:/dinner/.test(k)?[C("晩ご飯","ばんごはん"),C("を","お"),C("食べ","たべ")]:/breakfast/.test(k)?[C("朝ご飯","あさごはん"),C("を","お"),C("食べ","たべ")]:/coffee|tea/.test(k)?[C("お茶","おちゃ"),C("し")]:[C("飲み","のみ")];
       return{v:w,pre:[...dropMy(who2.chunks),C("と"),...act,C("に")],used:[...who2.used,w],past:/^met$/i.test(mf[1]),ing:/ing$/i.test(mf[1]),me:false,you:false}}}}
  l=l.replace(/^(go|went|going|goes) somewhere\b/i,"$1 to somewhere");
  {const am=/^(set|setting|sets) (?:my |an |the |the |a )?alarm(?: for (.+))?$/i.exec(l);const w=am&&byJP("かける","v");if(am&&w&&!am[2])return{v:w,pre:[C("アラーム"),C("を","お")],used:[w],past:false,ing:/ing$/i.test(am[1]),me:false,you:false}}
  {const sm=/^(start|started|starting|starts) (school|kindergarten|elementary school|high school|college|university|work|a new job)$/i.exec(l);if(sm){const k=sm[2].toLowerCase(),pl={school:["学校","がっこう"],kindergarten:["幼稚園","ようちえん"],"elementary school":["小学校","しょうがっこう"],"high school":["高校","こうこう"],college:["大学","だいがく"],university:["大学","だいがく"],work:["仕事","しごと"],"a new job":["新しい仕事","あたらしいしごと"]}[k];
     const v={jp:/work|job/.test(k)?"始める":"通い始める",kana:/work|job/.test(k)?"はじめる":"かよいはじめる",pos:"v1,vt",en:"start",kind:"form"};return{v,pre:[C(pl[0],pl[1]),C(/work|job/.test(k)?"を":"に",/work|job/.test(k)?"お":"に")],used:[],past:/ed$/i.test(sm[1]),ing:/ing$/i.test(sm[1]),me:false,you:false}}}
  {const gh=/^(get|got|getting|gets) here\b(.*)$/i.exec(l);if(gh){const r=VP(({get:"arrive",got:"arrived",getting:"arriving",gets:"arrives"})[gh[1].toLowerCase()]+gh[2]);if(r)return{...r,pre:[C("ここ"),C("に"),...r.pre]}}}
  {const fm=/^(fall|fell|falling|falls|fallen) (?:in|into|off|out of|from|down) (?:the |a |my |his |her )?(.+)$/i.exec(l);const w=fm&&byJP("落ちる","v");
   if(fm&&w){const np=NP(fm[2]);if(np&&!np.pron){const off=/ (off|out of|from) /i.test(fm[0]);return{v:w,pre:[...dropMy(np.chunks),C(off?"から":"に")],used:[...np.used,w],past:/^(fell|fallen)$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}}
  {const sa=/^(study|studying|studied|studies) abroad(?: in (.+))?$/i.exec(l);const w=sa&&byJP("留学","v");
   if(sa&&w){const np=sa[2]?NP(sa[2]):null;if(!sa[2]||np&&!np.pron)return{v:w,pre:np?[...np.chunks,C("に")]:[],used:[...(np?np.used:[]),w],past:/ied$/i.test(sa[1]),ing:/ing$/i.test(sa[1]),me:false,you:false}}}
  {const fa=/^(.+) far (?:away )?from (here|home|(?:the |my )?[a-z]+)$|^(.+) far away$/i.exec(l);if(fa){const r=VP(fa[1]||fa[3]);const fr=fa[2]?(/^here$/i.test(fa[2])?{chunks:[C("ここ")],used:[]}:NP(fa[2])):null;
   if(r&&(!fa[2]||fr&&!fr.pron))return{...r,pre:[...r.pre,...(fr?[...dropMy(fr.chunks),C("から")]:[]),C("遠く","とおく"),C(/^(住む|いる|働く)$/.test(r.v.jp)?"に":"まで")],used:[...(fr?fr.used:[]),...r.used]}}}
  {const bm=/^(become|became|becoming|becomes|be) (?:an? |the )(.+)$/i.exec(l)||/^(become|became|becoming|becomes) (.+)$/i.exec(l);const nar=bm&&byJP("なる","v");
   if(bm&&nar){const np=NP(bm[2]);if(np&&!np.pron)return{v:nar,pre:[...dropMy(np.chunks),C("に")],used:[...np.used,nar],past:/^became$/i.test(bm[1]),ing:/ing$/i.test(bm[1]),me:false,you:false}}}
  {const gm=/^(grow|grows|grew|growing) up$/i.exec(l);const nar=gm&&byJP("なる","v");if(gm&&nar)return{v:nar,pre:[C("大人","おとな"),C("に")],used:[nar],past:/^grew$/i.test(gm[1]),ing:/ing$/i.test(gm[1]),me:false,you:false}}
  {const tm=/^(text|texted|texting|texts|message|messaged|dm|dmed) (me|you|him|her|them|us|my [a-z]+)$/i.exec(l);const w=tm&&byJP("連絡","v");
   if(tm&&w){const p=tm[2].toLowerCase();const pre=/^(me|you|us)$/.test(p)?[]:/^my /.test(p)?[...dropMy((NP(tm[2])||{chunks:[]}).chunks),C("に")]:[PJ[p],C("に")];if(pre.length===1)return null;return{v:w,pre,used:[w],past:/ed$/i.test(tm[1]),ing:/ing$/i.test(tm[1]),me:false,you:false}}}
  {const lm=/^(learn|learned|learnt|learning|learns) to (.+)$/i.exec(l);const nar=lm&&byJP("なる","v");if(lm&&nar){const r=VP(lm[2]);const st=r&&!r.past&&!r.ing&&vstems(r.v);const pt=st&&(NOPOT.has(r.v.jp)?null:st.pot);
    if(pt){let pre=dropMy(r.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];return{v:nar,pre:[...pre,C(pt[0]+"る",pt[1]+"る"),C("ように")],used:[...r.used,nar],past:/(ed|nt)$/i.test(lm[1]),ing:/ing$/i.test(lm[1]),me:false,you:false}}}}
  {const wh=/^([a-z]+) (?:a|one|the) whole (.+)$/i.exec(l);if(wh){const r=VP(wh[1]+" "+wh[2]),np=r&&NP(wh[2]);const oi=r?r.pre.map(c=>c[0]).lastIndexOf("を"):-1;
     if(r&&oi>=0){const cnt=/^the /i.test(wh[0].slice(wh[1].length+1))?null:counted(1,np);return{...r,pre:[...r.pre.slice(0,oi+1),C("丸ごと","まるごと"),...(cnt||[]),...r.pre.slice(oi+1)]}}}}
  {const sm=/^(.+) since (last year|last month|last week|yesterday|this morning|last night|last summer|last winter|last spring|last fall|this year)$/i.exec(l);   // "since last year" -> 去年から
   if(sm){const t=sm[2].toLowerCase(),w=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]),r=w&&VP(sm[1]);if(r)return{...r,pre:[C(w.jp,w.kana),C("から"),...r.pre],used:[w,...r.used]}}}
  {const wm=/^(lose|lost|losing|loses|gain|gained|gaining|gains|put on) (a lot of |some |so much |a little |a bit of |too much )?weight$/i.exec(l);   // "lose weight" -> 痩せる
   if(wm){const g=/^(gain|put)/i.test(wm[1]),w=byJP(g?"太る":"痩せる","v");if(w)return{v:w,pre:/a lot|so much|too much/i.test(wm[2]||"")?[C("たくさん")]:/a little|a bit/i.test(wm[2]||"")?[C("少し","すこし")]:[],used:[w],past:/^(lost|gained|put)$/i.test(wm[1]),ing:/ing$/i.test(wm[1]),me:false,you:false}}}
  {const fm=/^(forgot|forget|forgets|forgetting) to (.+)$/i.exec(l);   // "forgot to bring his passport" -> パスポートを持ってくるのを忘れました
   if(fm){const r=VP(fm[2]),d=r&&!r.past&&!r.ing&&vplain(r.v,"dict"),w=byJP("忘れる","v");if(d&&w)return{v:w,pre:[...dropMy(r.pre),...d,C("の"),C("を","お")],used:[...r.used,w],past:/^forgot$/i.test(fm[1]),ing:/ing$/i.test(fm[1]),me:false,you:false}}}
  {const um=/^(stay|stayed|staying|stays) up (?:late |all night )?([a-z]+ing\b.*)$/i.exec(l);   // "stayed up late playing games" -> 遅くまでゲームをしました
   if(um){const r=vpIng(um[2]);if(r)return{...r,pre:[C("遅くまで","おそくまで"),...r.pre],past:/ed$/i.test(um[1]),ing:/ing$/i.test(um[1])}}}
  l=l.replace(/^(stay|stayed|staying|stays) up late$/i,"$1 up");
  {const tm=/^(.+) with (chopsticks|a fork|a knife|a spoon|my hands|your hands|a pen|a pencil|a credit card|my card|cash|a card)$/i.exec(l);   // "eat with chopsticks" -> 箸で食べる
   if(tm){const np=/hands/i.test(tm[2])?{chunks:[C("手","て")],used:[]}:/^cash$/i.test(tm[2])?{chunks:[C("現金","げんきん")],used:[]}:NP(tm[2]),r=np&&!np.pron&&VP(tm[1]);if(r)return{...r,pre:[...np.chunks,C("で"),...r.pre],used:[...np.used,...r.used]}}}
  {const bm=/^(.+) (?:by (train|bus|car|taxi|bike|bicycle|plane|subway|boat|ship|ferry|shinkansen|bullet train)|(on foot|by foot))$/i.exec(l);
   if(bm){const r=VP(bm[1]);const by=bm[3]?{chunks:[C("歩いて","あるいて")],used:[]}:NP(bm[2]);if(r&&by&&!r.me){const pre=[...r.pre];const tk=pre.length&&/^(今日|明日|昨日|今朝|今夜|今晩|毎日|毎朝|毎晩|来週|先週|今週|週末|今週末|来月|先月|来年|去年|昨夜|後で|今)$/.test(pre[0][0])?1:0;pre.splice(tk,0,...by.chunks,...(bm[3]?[]:[C("で")]));return{...r,pre,used:[...by.used,...r.used]}}}}
  l=l.replace(/^(get|got|getting|gets) to (?=(?:the|my|your|his|her|our|a|an|this|that) |[A-Z]|(?:work|school|class|home)$)/,(x,a)=>({get:"arrive",got:"arrived",getting:"arriving",gets:"arrives"})[a.toLowerCase()]+" at ");
  {const wm=/^(.+) with (my (?:friends?|family|parents|mom|dad|mother|father|sister|brother|wife|husband|boyfriend|girlfriend|kids|children|son|daughter|coworkers?|classmates?|grandparents|grandma|grandpa|cousins?|boss|team|dog)|friends|him|her|them|you|[A-Z][a-z]+)$/.exec(l);
   if(wm&&!/\b(with)\b/i.test(wm[1])){const who=/^(him|her|them|you)$/i.test(wm[2])?{chunks:[PJ[wm[2].toLowerCase()]],used:[]}:NP(wm[2]);const r=who&&(who.chunks[0])&&VP(wm[1]);
     if(r&&!r.me){const pre=[...r.pre];const tk=pre.length&&/^(今日|明日|昨日|今朝|今夜|今晩|毎日|毎朝|毎晩|来週|先週|今週|週末|今週末|来月|先月|来年|去年|昨夜|後で|今)$/.test(pre[0][0])?1:0;pre.splice(tk,0,...(/^you$/i.test(wm[2])?[C("一緒に","いっしょに")]:[...dropMy(who.chunks),C("と")]));return{...r,pre,used:[...who.used,...r.used]}}}}
  l=l.replace(/^(knock|knocked|knocks|knocking) (.+?) off (?:of )?(.+)$/i,(x,a,b,c)=>({knock:"drop",knocked:"dropped",knocks:"drops",knocking:"dropping"})[a.toLowerCase()]+" "+b+" from "+c);
  {const pu=/^(?:(come|go|came|went|coming|going) (?:to )?)?(?:pick|picking) (you|me|him|her|them|us) up(?: (?:at|from) (?:the )?(.+))?$/i.exec(l);   // "I'll come pick you up" -> 迎えに行きます
   const pl=pu&&pu[3]?NP(pu[3]):null;if(pu&&pu[3]&&(!pl||pl.pron))return null;
   if(pu){const w=byJP(/^(me|us)$/i.test(pu[2])?"来る":"行く","v");if(w)return{v:w,pre:[...(pl?[...pl.chunks,C("に")]:[]),C("迎え","むかえ"),C("に")],used:[w],past:/^(came|went)$/i.test(pu[1]||""),ing:/ing$/i.test(pu[1]||""),me:false,you:false}}}
  {const sa=/^(show|showed|showing|shows) (me|you|him|her|them|us|my \w+) around(?: (.+))?$/i.exec(l);   // "show them around" -> 案内する
   if(sa){const w=byJP("案内","v");const pl=sa[3]?NP(sa[3]):null;if(w&&(!sa[3]||pl&&!pl.pron))return{v:w,pre:[...(/^(me|us|him|her|them|you)$/i.test(sa[2])?[]:[...dropMy((NP(sa[2])||{chunks:[]}).chunks),C("を","お")]),...(pl?[...pl.chunks,C("を","お")]:[])],used:[w,...(pl?pl.used:[])],past:/ed$/i.test(sa[1]),ing:/ing$/i.test(sa[1]),me:false,you:false}}}
  {const gp=/^(get|getting|got|gets) (?:a |an |another )?(dog|cat|puppy|kitten|pet|hamster|rabbit|bird|parrot|fish)$/i.exec(l);if(gp){const w=byJP("飼う","v"),n=NP(gp[2]);if(w&&n)return{v:w,pre:[...n.chunks,C("を","お")],used:[w,...n.used],past:/^got$/i.test(gp[1]),ing:/^getting$/i.test(gp[1]),me:false,you:false}}}
  {const hp=/^(hurt|hurting|hurts) (you|him|her|them|my feelings|your feelings|his feelings|her feelings)$/i.exec(l);if(hp){const w=byJP("傷つける","v");if(w){const o=/feelings/i.test(hp[2])?[]:[PJ[hp[2].toLowerCase()],C("を","お")];return{v:w,pre:o,used:[w],past:false,ing:/ing$/i.test(hp[1]),me:false,you:false}}}}
  l=l.replace(/^believe in /i,"believe ").replace(/^(go|going|goes|went) for (?:a )?walks?\b/i,"take a walk");
  l=l.replace(/^see (?:a |the )?doctor\b/i,"go to the hospital").replace(/^see (?:a |the )?dentist\b/i,"go to the dentist").replace(/^(save|saving|saved) up\b/i,"$1 money");
  l=l.replace(/^take (?=(?:this |that |these |my |the |your |a |an |some |his |her )?(?:medicine|medication|meds|pills?|tablets?|vitamins?|painkillers?)\b)/i,"drink ");
  let ws=l.split(" ");if(!ws[0])return null;
  // the verb: up to four words ("take a photo"), longest first
  let v=null,info=null,nv=0,key="";
  const head=enVerb(ws[0].toLowerCase());
  for(let n=Math.min(4,ws.length);n>=1&&!v;n--){
    for(const c of head.c){
      const k=[c,...ws.slice(1,n).map(x=>x.toLowerCase())].join(" ");
      if(n===1&&VBLOCK.has(c)&&c!=="leave"&&c!=="miss")continue;
      if(n>1&&!PREF.v[k]&&!(window.PICKV&&window.PICKV[k]!=null))continue;
      if(k==="miss"||k==="feed"){   // "miss the train" -> 乗り遅れる (only with a train / bus / plane); "feed the deer" -> 餌をあげる
        const w=byJP(k==="miss"?"乗り遅れる":"あげる","v");if(w){v=w;info=head;nv=n;key=k;break}continue}
      const w=word(k,"v");if(w){v=w;info=head;nv=n;key=k;break}
    }
  }
  if(!v||!vstems(v))return null;
  used.push(v);
  {const at=/^at (me|you|him|her|us|them)( .*)?$/i.exec(ws.slice(nv).join(" "));
   if(at&&NIOBJ.has(v.jp)){const W={me:["私","わたし"],you:["あなた","あなた"],him:["彼","かれ"],her:["彼女","かのじょ"],us:["私たち","わたしたち"],them:["彼ら","かれら"]}[at[1].toLowerCase()];pre.push(C(W[0],W[1]),C("に"));ws=[...ws.slice(0,nv),...(at[2]||"").trim().split(" ").filter(Boolean)]}}
  if(key==="stay"&&/^(?:at home|home|inside|in)\b/i.test(ws.slice(nv).join(" "))){const h=byJP("家","n"),i={jp:"いる",kana:"いる",pos:"v1,vi",en:"to be (somewhere) / to stay",kind:"everyday"};if(h&&i){pre.push(C(h.jp,h.kana),C("に"));used[used.indexOf(v)]=i;used.push(h);v=i;ws=[...ws.slice(0,nv),...ws.slice(nv).join(" ").replace(/^(?:at home|home|inside|in)\s*/i,"").split(" ").filter(Boolean)]}}
  let rest=ws.slice(nv).join(" ");const me=/^(me|us)( |$)/i.test(rest),you=/^you( |$)/i.test(rest);
  rest=rest.replace(/^(me|us|you)( |$)/i,"").trim();
  if(v.jp==="起きる"&&me){const w=byJP("起こす","v");if(w){used[used.indexOf(v)]=w;v=w}}   // "wake me up" -> 起こしてもらえますか
  // "see you" / "see him": meet (会う), not look at
  if(v.jp==="見る"&&(you||/^(him|her|them)( |$)/i.test(rest))){const w=byJP("会う","v");if(w){used[used.indexOf(v)]=w;v=w;const pm3=/^(him|her|them)( |$)/i.exec(rest);if(pm3){pre.push(PJ[pm3[1].toLowerCase()],C("に"));rest=rest.slice(pm3[0].length).trim()}}}
  if(me&&v.jp==="ついて行く"){const w=byJP("ついてくる|ついて来る|付いて来る","v");if(w){used[used.indexOf(v)]=w;v=w}}   // "follow me": come along behind me
  {const wl=/(?:^| )(?:very |really |so |that )?well$/i.exec(rest);if(wl&&/^(泳ぐ|話す|歌う|踊る|書く|読む|料理|運転|弾く|描く|作る|走る|できる)$/.test(v.jp)){pre.push(C("上手","じょうず"),C("に"));rest=rest.slice(0,wl.index).trim()}}
  let sugi=false;{const tm=/(?:^| )too much$/i.exec(rest);if(tm){sugi=true;rest=rest.slice(0,tm.index).trim()}}
  {const tm2=/^too much (.+)$/i.exec(rest);if(tm2){sugi=true;rest=tm2[1]}}   // "ate too much": 食べすぎる
  let ofw=null;if(FIXOBJ[key]&&/^of (me|us)$/i.test(rest)){ofw=/us/i.test(rest)?[C("私たち","わたしたち"),C("の")]:[C("私","わたし"),C("の")];rest=""}   // "a picture of us"
  let objN=null;
  const mv=/^(行く|来る|帰る|戻る)$/.test(v.jp);
  // "here" / "there": where it happens
  const pm=/(?:^| )(over there|here|there|outside|inside|upstairs|downstairs|at home|on the train|on the bus|on the plane|on the subway|on the street|on the road|on the sidewalk|on the beach|on the way home|on my way home|on the way here|on the map|next door)$/i.exec(rest);
  const PADV={"next door":[C("隣","となり")],"on the map":[C("地図","ちず")],"on the street":[C("道","みち")],"on the road":[C("道","みち")],"on the sidewalk":[C("歩道","ほどう")],"on the beach":[C("ビーチ")],"on the way home":[C("帰り道","かえりみち")],"on my way home":[C("帰り道","かえりみち")],"on the way here":[C("来る","くる"),C("途中","とちゅう")],outside:[C("外","そと")],inside:[C("中","なか")],upstairs:[C("上","うえ"),C("の"),C("階","かい")],downstairs:[C("下","した"),C("の"),C("階","かい")],"at home":[C("家","いえ")],"on the train":[C("電車","でんしゃ")],"on the bus":[C("バス")],"on the plane":[C("飛行機","ひこうき")],"on the subway":[C("地下鉄","ちかてつ")]};
  {const fb=/ for (?:my |your |his |her |our |their |the )?(birthday|christmas|anniversary|valentine's day|new year's)$/i.exec(" "+rest);if(fb){const B={birthday:["誕生日","たんじょうび"],christmas:["クリスマス"],anniversary:["記念日","きねんび"],"valentine's day":["バレンタイン"],"new year's":["お正月","おしょうがつ"]}[fb[1].toLowerCase()];pre.push(C(B[0],B[1]||B[0]),C("に"));rest=(" "+rest).slice(0,fb.index).trim()}}
  {const fh=/ for (?:our |my |a |the )?(honeymoon|vacation|holiday|holidays|a trip|trip|school trip|business trip|study|studying)$/i.exec(" "+rest);if(fh&&/^(行く|来る|帰る|旅行|引っ越す)$/.test(v.jp)){const H={honeymoon:["新婚旅行","しんこんりょこう"],vacation:["休暇","きゅうか"],holiday:["休暇","きゅうか"],holidays:["休暇","きゅうか"],"a trip":["旅行","りょこう"],trip:["旅行","りょこう"],"school trip":["修学旅行","しゅうがくりょこう"],"business trip":["出張","しゅっちょう"],study:["勉強","べんきょう"],studying:["勉強","べんきょう"]}[fh[1].toLowerCase()];pre.push(C(H[0],H[1]),C("で"));rest=(" "+rest).slice(0,fh.index).trim()}}
  {const fk=/ for the (weekend|week|day|night|summer|holidays)$/i.exec(" "+rest);if(fk&&/^(貸す|借りる|泊まる|預ける|使う|行く|来る|いる)$/.test(v.jp)){const K={weekend:["週末","しゅうまつ"],week:["一週間","いっしゅうかん"],day:["一日","いちにち"],night:["一晩","ひとばん"],summer:["夏の間","なつのあいだ"],holidays:["休みの間","やすみのあいだ"]}[fk[1].toLowerCase()];pre.push(C(K[0],K[1]));rest=(" "+rest).slice(0,fk.index).trim()}}
  {const fw=/ for (work|business)$/i.exec(" "+rest);if(fw&&!/^(探す|遅れる|準備|待つ|応募|出る|出発|出かける|間に合う)$/.test(v.jp)){pre.push(C("仕事","しごと"),C("で"));rest=(" "+rest).slice(0,fw.index).trim()}}
  {const asm=/ as (?:a |an )?([a-z]+(?: [a-z]+)?)$/i.exec(rest);if(asm&&!/^(well|soon|much|many|usual|always|fast|possible|long|if)$/i.test(asm[1])){const np=NP(asm[1]);if(np&&!np.pron){pre.push(...np.chunks,C("として"));used.push(...np.used);rest=rest.slice(0,asm.index).trim()}}}
  if(pm){pre.push(...(PADV[pm[1].toLowerCase()]||[PRON[pm[1].toLowerCase()]]),C(mv||/^(泊まる|住む|座る|入る|置く|止まる|植える)$/.test(v.jp)?"に":"で"));rest=rest.slice(0,pm.index).trim()}
  if(FIXOBJ[key]){const o=byJP(FIXOBJ[key],"n");if(!o)return null;pre.push(...(ofw||[]),C(o.jp,o.kana),key==="take a bath"?C("に"):C("を","お"));used.push(o)}
  if(rest){
    if(FIXOBJ[key])return null;
    const m=/^(.*?)(?:(?:^| )(in front of|on top of|next to|to|at|in|with|from|by|on|under|underneath|behind|near|inside|for|as|without) (.+))?$/i.exec(rest);if(!m)return null;
    let obj=m[1].trim(),pp=m[2]?[m[2].toLowerCase(),m[3]]:null;
    if(pp&&pp[0]==="to"&&/\b(trip|ticket|tickets|flight|train ticket|bus ticket|way)$/i.test(obj)&&NP(obj+" to "+pp[1])){obj=obj+" to "+pp[1];pp=null}
    if(pp&&pp[0]==="with"&&/^(you|me|us)$/i.test(pp[1])){
      if(/^(戦う|結婚|喧嘩|付き合う|別れる|話す|相談)$/.test(v.jp)){const w=pp[1].toLowerCase();pre.push(w==="you"?C("あなた","あなた"):w==="us"?C("私たち","わたしたち"):C("私","わたし"),C("と"))}
      else pre.push(C("一緒に","いっしょに"));pp=null}   // "with you": together
    // "sleeping on my bed" (ベッドで): only for actions that don't do something to a thing
    const ONNI=/^(うんち|おしっこ|吐く|こぼす|落ちる|落書き|吹く|かける|降る|塗る)$/;
    if(pp&&pp[0]==="on"&&!ONNI.test(v.jp)&&(obj||!/(^|,)vi/.test(v.pos)||/(^|,)vt/.test(v.pos)))return null;
    if(pp&&/\b(to|at|in|with|from|by|on|for|about|into)\b/i.test(pp[1])&&!NP(pp[1]))return null;   // two "to/at/with" parts: too complex
    if((/\b(on|for|about|into|because|but|if|when|so)\b/i.test(obj)||/\band\b/i.test(obj)&&!NP(obj))||/ly$/i.test(obj)&&!PREF.n[obj.toLowerCase()])return null;   // "quickly", "carefully": how-words are not things
    const SIDE={"on top of":["上","うえ"],under:["下","した"],underneath:["下","した"],behind:["後ろ","うしろ"],"next to":["隣","となり"],near:["近く","ちかく"],inside:["中","なか"],"in front of":["前","まえ"]};
    if(pp&&pp[0]==="as"){const np=NP(pp[1]);if(!np||np.pron)return null;pre.push(...np.chunks,C("として"));used.push(...np.used);pp=null}   // "works as a nurse" -> 看護師として
    if(pp&&pp[0]==="without"&&/^(something|anything)$/i.test(obj)){obj=obj+" without "+pp[1];pp=null}
    let forN=null;if(pp&&pp[0]==="for"&&/^(?:(?:a|an|the|some|my|your|new|nice|good|cheap|small|little|birthday|christmas) )*(gift|present|charger|case|cover|battery|ticket|tickets|card|letter|souvenir|souvenirs|toy|toys|food|medicine|bed|leash|collar|cake|flowers|book|bag|shoes|clothes|cable|screen protector|adapter|tires?|parts?|keys?)$/i.test(obj)){
      const pr=/^(me|you|him|her|us|them)$/i.test(pp[1]),fp=pr?{chunks:[PJ[pp[1].toLowerCase()]],used:[]}:NP(pp[1]);
      if(fp&&(pr||!fp.pron)){const person=pr||/\b(mom|mother|dad|father|parents|friend|friends|wife|husband|boyfriend|girlfriend|sister|brother|son|daughter|boss|teacher|grandma|grandmother|grandpa|grandfather|family|kids?|children|baby|coworkers?|aunt|uncle|cousin|neighbou?r|everyone)\b/i.test(pp[1]);
        forN={chunks:[...dropMy(fp.chunks),...(person&&/^(?:.* )?(gift|present|letter|card|souvenirs?|flowers|cake)$/i.test(obj)?[C("へ","え")]:[]),C("の")],used:fp.used};pp=null}}
    if(pp&&pp[0]==="without"){const np=NP(pp[1]);if(!np||np.pron)return null;pre.push(...np.chunks,C("なし"),C("で"));used.push(...np.used);pp=null}   // "without subtitles" -> 字幕なしで
    if(pp&&pp[0]==="for"&&/^(働く|勤める)$/.test(v.jp)){const np=NP(pp[1]);if(!np||np.pron)return null;pre.push(...np.chunks,C("で"));used.push(...np.used);pp=null}   // "work for a game company" -> ゲーム会社で働く
    if(pp&&pp[0]==="for"){   // "saving money for a trip" -> 旅行のために ; "cook for my family" -> 家族のために
      if(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+|a few|several) (minutes?|hours?|days?|weeks?|months?|years?)$/i.test(pp[1]))return null;
      const meal=/^(breakfast|lunch|dinner)$/i.test(pp[1]);
      if(!/^(貯金|買う|作る|料理|貯める|書く|歌う|準備|用意|探す|働く|頑張る|勉強|練習|焼く|描く|踊る|祈る)$/.test(v.jp)&&!(meal&&/^(食べる|作る|飲む|料理)$/.test(v.jp)))return null;
      const np=/^(me|you|him|her|us|them)$/i.test(pp[1])?{chunks:[PJ[pp[1].toLowerCase()]],used:[]}:NP(pp[1]);if(!np)return null;
      pre.push(...dropMy(np.chunks),...(meal?[C("に")]:[C("の"),C("ため"),C("に")]));used.push(...np.used);pp=null}
    if(pp&&SIDE[pp[0]]){   // "hiding under the bed" -> ベッドの下に隠れています
      const np=NP(pp[1]);if(!np||np.pron)return null;const sd=SIDE[pp[0]];
      pre.push(...np.chunks,C("の"),C(sd[0],sd[1]),C(/^(隠れる|いる|ある|住む|置く|座る|立つ|入る|隠す|落ちる)$/.test(v.jp)?"に":"で"));used.push(...np.used);pp=null}
    if(pp){
      const np=/^(me|you|him|her|us|them)$/i.test(pp[1])?{chunks:[PJ[pp[1].toLowerCase()]],used:[]}:NP(pp[1]);if(!np||np.pron==="i")return null;
      let part=pp[0]==="on"?(/^(座る|乗る|立つ)$/.test(v.jp)||ONNI.test(v.jp)?"に":"で"):PREP[pp[0]];
      if(pp[0]==="on"&&part==="で"&&/(^|,)ph(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")&&!isPlaceNP(np)&&!isBody(np)&&!/^(ベッド|布団|ソファ|ソファー|椅子|床|畳|ベンチ)$/.test((np.used[np.used.length-1]||{}).jp||""))np.chunks=[...np.chunks,C("の"),C("上","うえ")];
      // "pay with a card" -> カードで (a tool); "with my friend" -> 友達と (a person)
      if(pp[0]==="with"&&!np.pron&&np.used.every(u=>u.kana!=null)&&!/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||""))part="で";
      if((pp[0]==="at"||pp[0]==="in")&&/^(泊まる|住む|座る|入る|いる|ある|隠れる|隠す|置く|入れる|しまう|残る|着く|到着)$/.test(v.jp))part="に";
      if(pp[0]==="at"&&(NIOBJ.has(v.jp)&&v.jp!=="会う"||/^(吠える|怒る|怒鳴る|叫ぶ|微笑む|手を振る)$/.test(v.jp)))part="に";   // "barks at strangers" -> 他人に吠えます
      if(pp[0]==="by"&&(/(^|,)ph(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")||/^(川|海|湖|窓|浜|ビーチ|駅|プール|池|入口|ドア|木|暖炉|ベッド|門)$/.test((np.used[np.used.length-1]||{}).jp||""))&&!/^(車|電車|バス|タクシー|飛行機|自転車|船|地下鉄|新幹線|カード|現金|メール|電話)$/.test((np.used[np.used.length-1]||{}).jp||"")){np.chunks=[...np.chunks,C("の"),C("そば")];part=/^(座る|いる|住む|立つ|置く)$/.test(v.jp)?"に":"で"}
      if(pp[0]==="to"&&mv){const f0=pp[1].split(" ")[0].toLowerCase();if((PREF.v[f0]||window.PICKV&&window.PICKV[f0]!=null)&&!(window.PICK&&window.PICK[f0]!=null)&&!PREF.n[f0])return null}
      if(pp[0]==="in"&&/^(春|夏|秋|冬|朝|夜|午前|午後)$/.test((np.used[np.used.length-1]||{}).jp||""))part="に";   // "in the spring" -> 春に
      if(pp[0]==="from"&&/^(卒業)$/.test(v.jp))part="を";   // "graduate from university" -> 大学を卒業する
      if(pp[0]==="to"&&v.jp==="動く"&&isPlaceNP(np)){const w=byJP("引っ越す","v");if(w){used[used.indexOf(v)]=w;v=w}}
      if(pp[0]==="to"&&/^(引っ越す|旅行|移動|出張|留学|戻る)$/.test(v.jp))part="に";
      if(pp[0]==="to"&&/^(話す|喋る)$/.test(v.jp))part="と";   // "talk to my mom" -> 母と話します
      if(pp[0]==="to"&&!mv&&!/(送る|電話|教える|見せる|話す|喋る|渡す|書く|引っ越す|旅行|移動|出張|留学)$/.test(v.jp))return null;
      pre.push(...np.chunks,C(part));used.push(...np.used);
    }
    if(obj){
      if(mv){
        if(/^(home)$/i.test(obj)&&v.jp!=="帰る"){const h=byJP("家","n");if(!h)return null;pre.push(C(h.jp,h.kana),C("に"));used.push(h)}
        else if(/^(home)$/i.test(obj)){}
        else return null;
      }else{
        if(/(^|,)wo(,|$)/.test(v.pos||""))return null;   // 手を振る already has its thing: "wave at him" is not built
        let all=false;{const am=/^all (?:of )?(.+)$/i.exec(obj);if(am){all=true;obj=am[1]}}   // "all my money": お金を全部
        let cnt=null;{const nm=/^(one|two|three|four|five|six|seven|eight|nine|ten|\d) (.+)$/i.exec(obj);if(nm&&!/^(minutes?|hours?|days?|weeks?|months?|years?|times|kilometers?|km|miles?|meters?)$/i.test(nm[2])){const n=numOf(nm[1]),np2=NP(nm[2]);const c=n&&np2&&!np2.pron&&counted(n,np2);if(c){cnt=c;obj=nm[2]}}}
        let lots=false;{const lm=/^(?:a lot of|lots of|plenty of|so much|so many|tons of) (.+)$/i.exec(obj);if(lm){lots=true;obj=lm[1]}}   // "ate a lot of sushi" -> 寿司をたくさん食べました
        {const dm=/^(\w+) (kilometers?|kilometres?|km|miles?|meters?|metres?)$/i.exec(obj),n=dm&&numOf(dm[1]);   // "ran five kilometers" -> 5キロ走りました
         if(dm){const u=/^k/i.test(dm[2])?"キロ":/^mi/i.test(dm[2])?"マイル":"メートル",k=n&&numKana(n);if(!k)return null;pre.push(C(n+u,k+u));obj=""}}
        let little=false;{const lm=/^a (?:little|bit of|little bit of) (japanese|english|chinese|korean|french|spanish|german|italian)$/i.exec(obj);if(lm){little=true;obj=lm[1]}}   // "speak a little Japanese" -> 日本語が少し話せます
        if(obj){
        const np=/^(him|her|them)$/i.test(obj)?{chunks:[PJ[obj.toLowerCase()]],used:[],pron:obj.toLowerCase()}:NP(obj);if(!np||np.pron==="i"||np.pron==="we"||np.pron==="he"||np.pron==="she")return null;
        if(forN){np.chunks=[...forN.chunks,...dropMy(np.chunks)];np.used=[...forN.used,...np.used]}
        const on0=np.used[np.used.length-1]||{},swapN=jp=>{const t=byJP(jp,"n");if(t){np.chunks[np.chunks.length-1]=C(t.jp,t.kana);np.used[np.used.length-1]=t}};
        objN=on0;
        const swapV=w=>{if(!w)return false;used[used.indexOf(v)]=w;v=w;return true};
        if(v.jp==="着る"){const j=on0.jp||"";const w=/^(帽子|キャップ|ヘルメット|フード|かつら)$/.test(j)?"かぶる|被る":/^(靴|靴下|ズボン|スカート|ジーンズ|ブーツ|サンダル|スニーカー|パンツ|ストッキング|タイツ|下駄|スリッパ)$/.test(j)?"履く:はく":/^(眼鏡|メガネ|めがね|サングラス)$/.test(j)?"かける|掛ける":/^(指輪|腕時計|時計|ネックレス|イヤリング|ピアス|ブレスレット|マスク|ネクタイ|香水)$/.test(j)?"つける|付ける":null;
          if(w&&!swapV(byJP(w,"v")))return null}
        if(v.jp==="遊ぶ"&&/^(音楽|曲|歌)$/.test(on0.jp)){if(!swapV(byJP("かける|掛ける","v")))return null}
        else if(v.jp==="遊ぶ"){   // "play a game" -> ゲームをする, "play the piano" -> ピアノを弾く; anything else is not built
          const ins=/^(ピアノ|ギター|バイオリン|ウクレレ|三味線|琴)$/.test(on0.jp),gm=/(^|,)sp(,|$)/.test(on0.pos||"")||/^(ゲーム|テレビゲーム|トランプ|カード|将棋|チェス|囲碁|かくれんぼ|鬼ごっこ)$/.test(on0.jp);
          if(!swapV(ins?byJP("弾く:ひく","v"):gm?byJP("する","v"):null))return null}
        if(key==="lose"&&/^(試合|ゲーム|勝負|喧嘩|レース|戦い|戦争|選挙|裁判|賭け)$/.test(on0.jp)&&!swapV(byJP("負ける","v")))return null;   // lose a match: 試合に負ける
        if(v.jp==="食べる"&&/^(鶏|豚|牛)$/.test(on0.jp))swapN(on0.jp+"肉");
        if(v.jp==="止まる"&&!swapV(byJP("止める:とめる","v")))return null;
        if(/^(引っ越す|動く|動かす)$/.test(v.jp)&&/^(箱|荷物|段ボール|家具)$/.test(on0.jp)&&swapV(byJP("運ぶ","v"))){}
        else if(/^(引っ越す|動く)$/.test(v.jp)&&!swapV(byJP("動かす","v")))return null;
        if(v.jp==="鳴る"&&!swapV(byJP("鳴らす","v")))return null;   // "rings the doorbell" -> チャイムを鳴らす   // "move this table" -> 動かす   // "stop the car" -> 車を止める
        if(v.jp==="見る"&&/(^|,)an(,|$)/.test(on0.pos||"")&&!/(^|,)ani(,|$)/.test(on0.pos||"")&&(/^(my|your|his|her|our|their) /i.test(obj)||on0.kana==null)&&!swapV(byJP("会う","v")))return null;   // "see my friend" -> 友達に会う
        if(/^(取る|撮る|持つ|持っていく|とる)$/.test(v.jp)&&/^(薬|お薬)$/.test(on0.jp)&&!swapV(byJP("飲む","v")))return null;   // take medicine: 薬を飲む
        if(v.jp==="壊す"&&/^(コップ|カップ|グラス|皿|お皿|卵|窓|ガラス|茶碗|鏡|瓶|マグカップ)$/.test(on0.jp)&&!swapV(byJP("割る","v")))return null;   // break a cup: 割る
        if(/^(燃やす|焼く)$/.test(v.jp)&&isBody(np)&&!swapV(byJP("やけど|火傷","v")))return null;
        if(v.jp==="燃やす"&&/(^|,)fd(,|$)/.test(on0.pos||"")&&!swapV(byJP("焦がす","v")))return null;   // burn the toast: 焦がす
        if(v.jp==="壊す"&&isBody(np))return null;   // "broke my arm" is 骨折, built as its own phrase
        if(v.jp==="教える"&&/(^|,)an(,|$)/.test(on0.pos||"")&&!/(^|,)ani(,|$)/.test(on0.pos||"")&&!swapV(byJP("言う","v")))return null;   // "don't tell my mom" -> 母に言わないで   // burn your tongue: 舌をやけどする
        if(v.jp==="電話"&&/^(警察|救急車|タクシー|医者|救急)$/.test(on0.jp)&&!swapV(byJP("呼ぶ","v")))return null;   // "call the police": 警察を呼ぶ
        if(key==="leave"&&!swapV(byJP(/^(荷物|スーツケース|かばん|鞄|バッグ|リュック)$/.test(on0.jp)?"預ける":"置く","v")))return null;   // "leave my luggage": 荷物を預ける
        if(v.jp==="料理"&&/^(ご飯|米|お米)$/.test(on0.jp)&&!/meal|dinner|lunch|breakfast/i.test(obj)&&!swapV(byJP("炊く","v")))return null;   // "cook rice": ご飯を炊く
        if(v.jp==="料理"&&!swapV(byJP("作る","v")))return null;
        if(v.jp==="飲む"&&!/(^|,)fd(,|$)/.test(on0.pos||"")&&!/^(薬|お薬|錠剤|ビタミン|鎮痛剤|痛み止め|サプリ|サプリメント|風邪薬)$/.test(on0.jp))return null;   // "drink the menu": not built
        if(v.jp==="歌う"&&on0.jp==="カラオケ"&&!swapV(byJP("する","v")))return null;   // "sing karaoke": カラオケをする   // "cooking curry": カレーを作っています
        if(v.jp==="試す"&&/(^|,)fd(,|$)/.test(on0.pos||"")){   // "try sushi": 食べてみる / 飲んでみる
          const dr=/^(ビール|水|お水|お茶|コーヒー|紅茶|日本酒|ワイン|ジュース|お酒|酒|牛乳|ミルク|コーラ|緑茶|抹茶|味噌汁|ハイボール|カクテル)$/.test(on0.jp),t=byJP(dr?"飲む":"食べる","v"),ts=t&&vstems(t);
          if(!ts||!swapV({jp:ts.te[0]+"みる",kana:ts.te[1]+"みる",pos:"v1,vt",en:"try "+(dr?"drinking":"eating")+" (… てみる = try doing)",kind:t.kind}))return null}
        if(/^(訪ねる|訪れる|訪問)$/.test(v.jp)&&isPlaceNP(np)&&!swapV(byJP("行く","v")))return null;   // visit Kyoto: 京都に行く   // eat chicken: 鶏肉, not the live bird
        if((v.kana==="つける"||v.jp==="消す")&&on0.jp==="光")swapN("電気");   // turn off the light: 電気
        let part;
        if(key==="feed"){pre.push(...np.chunks,C("に"));used.push(...np.used);const e=byJP("餌","n");if(!e)return null;pre.push(C(e.jp,e.kana),C("を","お"));used.push(e);obj=""}
        else if(/^(戦う|結婚|喧嘩|付き合う)$/.test(v.jp))part=C("と");else if(/^(言う|伝える)$/.test(v.jp)&&/(^|,)an(,|$)/.test(objN&&objN.pos||""))part=C("に");else if(NIOBJ.has(v.jp))part=C("に");else if(GAOBJ.has(v.jp))part=C("が");else if(/^(渡る|通る|旅行|横断)$/.test(v.jp))part=C("を","お");
        else if(/(^|,)vt/.test(v.pos)||(/(^|,)vs/.test(v.pos)&&!/(^|,)vi/.test(v.pos))||/^(持ってくる|持って来る|持っていく|持って行く|連れてくる|連れて来る|連れていく|連れて行く)$/.test(v.jp)){part=C("を","お");
          if(/^持って(くる|来る|いく|行く)$/.test(v.jp)&&(/(^|,)(an|ani)(,|$)/.test(objN&&objN.pos||"")||/^(?:my |your |his |her |our |the )?(friends?|family|kids?|children|son|daughter|wife|husband|boyfriend|girlfriend|parents|mom|dad|brother|sister|dog|cat|people|guests?)$/i.test(obj))){const w=byJP(/くる|来る/.test(v.jp)?"連れてくる|連れて来る":"連れていく|連れて行く","v");if(w){used[used.indexOf(v)]=w;v=w}else return null}}
        else if(/^(爆発|破裂|回転|振動)$/.test(v.jp)&&/(^|,)vs(,|$)/.test(v.pos)&&!/(^|,)vt/.test(v.pos)){   // 爆発 (explode) + a thing -> 爆発させる (make it explode)
          const v2={jp:v.jp+"させる",kana:v.kana+"させる",pos:"v1,vt",en:"make it "+key+" (… させる = make it happen)",kind:v.kind};used[used.indexOf(v)]=v2;v=v2;part=C("を","お")}
        else if(key!=="feed")return null;   // this verb takes no direct object: not built
        if(part){if(all&&part[0]!=="を")return null;pre.push(...np.chunks,part,...(all?[C("全部","ぜんぶ")]:[]),...(lots?[C("たくさん")]:[]),...(cnt&&part[0]==="を"?cnt:[]),...(little?[C("少し","すこし")]:[]));used.push(...np.used)}
        }
      }
    }
  }
  if(/^(なくす|無くす)$/.test(v.jp)&&!objN&&!pre.some(c=>c[0]==="を")){const w=byJP("負ける","v");if(w){used[used.indexOf(v)]=w;v=w}}   // "our team lost": 負けました
  if(/^(預ける|置く)$/.test(v.jp))for(let i=1;i<pre.length;i++)if(pre[i][0]==="で"&&/^(ここ|そこ|あそこ)$/.test(pre[i-1][0]))pre[i]=C("に");
  if(v.jp==="振る"&&!pre.some(ch=>ch[0]==="を")){const w=byJP("震える","v");if(w){used[used.indexOf(v)]=w;v=w}}   // "I'm shaking": 震える
  if(v.jp==="信じる"&&pre.length>=2&&pre[pre.length-2][0]==="それ")pre=pre.slice(0,-2);   // "I can't believe it": 信じられません
  if(key==="miss"&&!(objN&&/^(電車|バス|飛行機|船|タクシー|新幹線|終電|終バス|フェリー|便|地下鉄|始発)$/.test(objN.jp)))return null;
  if(key==="feed"&&!objN)return null;
  if(sugi){const st=vstems(v);if(!st||!st.i)return null;const v2={jp:st.i[0]+"すぎる",kana:st.i[1]+"すぎる",pos:"v1,vi"+(/(^|,)wo(,|$)/.test(v.pos)?",wo":""),en:"too much: "+v.en,kind:v.kind};used[used.indexOf(v)]=v2;v=v2}
  return{v,pre,used,past:!!info.past,ing:!!info.ing,me,you};
}
// a thing that is a place you can be in or at (a name, a city, a shop, a station ...)
const isPlaceNP=np=>{const n=np&&np.used[np.used.length-1];return!!n&&(n.kana==null||/(^|,)(pl|pc)(,|$)/.test(n.pos||"")||/^(駅|空港|ホテル|店|お店|レストラン|病院|薬局|学校|銀行|郵便局|公園|お寺|寺|神社|城|博物館|図書館|トイレ|ビーチ|家|部屋|会社|海|山|川|町|街|国|日本|コンビニ|カフェ|映画館|美術館|動物園|水族館|温泉|旅館|大学|台所|庭|車|電車|バス|飛行機|船|タクシー)$/.test(n.jp))};
// "do it" Japanese verb -> "it happens" verb, for sentences where a thing does it by itself ("the shop opens")
const VIPAIR={"開ける":"開く:あく","閉める":"閉まる","始める":"始まる","壊す":"壊れる","消す":"消える","溶かす":"溶ける","焦がす":"焦げる","凍らせる":"凍る","乾かす":"乾く",
  "転がす":"転がる","回す":"回る","冷やす":"冷える","温める":"温まる","割る":"割れる","倒す":"倒れる","落とす":"落ちる","止める":"止まる","出す":"出る","入れる":"入る",
  "起こす":"起きる","動かす":"動く","揺らす":"揺れる","汚す":"汚れる","曲げる":"曲がる","燃やす":"燃える","沸かす":"沸く","終える":"終わる","治す":"治る","直す":"直る",
  "破る":"破れる","隠す":"隠れる","集める":"集まる","増やす":"増える","減らす":"減る","広げる":"広がる","変える":"変わる","続ける":"続く","見つける":"見つかる","縮める":"縮む"};
const FEEL=new Set(("怖い 嬉しい 悲しい 寂しい 楽しい つまらない 退屈 気持ち悪い 恥ずかしい 忙しい 暇 疲れた 眠い 眠たい 空腹 満腹 喉が渇いた 病気 元気 "+
  "ラッキー 幸運 不運 うらやましい 羨ましい 怒った わくわく 緊張した 心配 びっくりした 混乱した 誇らしい ありがたい 申し訳ない 痛い かゆい 快適 "+
  "居心地が悪い 居心地がいい 気まずい 懐かしい 不安 満足 暑い 暖かい 寒い 涼しい 蒸し暑い 大丈夫 無理 いっぱい 幸せ 苦しい 悔しい 残念 嫌 だるい 気持ちいい").split(" "));
function viSwap(vp){const t=VIPAIR[vp.v.jp];if(!t)return;const w=byJP(t,"v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}
// "is ..." states that Japanese says with an action word: [verb, 1 = things only / 2 = things only and already happened]
const STATE={clogged:["詰まる",1],blocked:["詰まる",1],late:["遅れる"],delayed:["遅れる"],open:["開く:あく",1],closed:["閉まる",1],shut:["閉まる",1],
  lost:["なくなる|無くなる",2],missing:["なくなる|無くなる",2],gone:["なくなる|無くなる",2],angry:["怒る:おこる"],mad:["怒る:おこる"],crowded:["混む",1],packed:["混む",1],
  married:["結婚"],drunk:["酔う"],tired:["疲れる"],exhausted:["疲れる"],wet:["濡れる"],messy:["散らかる",1],
  nervous:["緊張"],excited:["わくわく"],cracked:["割れる",1],wrong:["間違う",1],confused:["混乱"],irritated:["イライラ"],frustrated:["イライラ"],surprised:["びっくり",4],shocked:["びっくり",4],disappointed:["がっかり",4],
  done:["終わる",4],finished:["終わる",4],awake:["起きる",5],asleep:["寝る",5],alive:["生きる",5],pregnant:["妊娠",5],injured:["怪我",5],hurt:["怪我",5],
  fat:["太る",6],thin:["痩せる",6],skinny:["痩せる",6],old:["年を取る",6],frozen:["凍る",1],burnt:["焦げる",2],burned:["焦げる",2],rotten:["腐る",1],melted:["溶ける",2],dry:["乾く",1],
  hungry:["空く:すく",0,"お腹","おなか"],starving:["空く:すく",0,"お腹","おなか"],thirsty:["渇く",0,"喉","のど"]};
const SLANGP=new Set(["fire","bussin","goated"]);
// where something is: [pattern, place word, its reading, exists (… ni arimasu) rather than … desu]
const LOC=[[/^(?:near|close to) (.+)$/i,"近く","ちかく"],[/^next to (.+)$/i,"隣","となり"],[/^behind (.+)$/i,"後ろ","うしろ"],[/^in front of (.+)$/i,"前","まえ"],
  [/^(?:on top of|on) (.+)$/i,"上","うえ",1],[/^under(?:neath)? (.+)$/i,"下","した",1],[/^inside (.+)$/i,"中","なか",1],[/^(?:in|at) (.+)$/i,null,null,1]];
// ----- whole sentences -----
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
// 'Hello, how do I say "this wall is scary" in Japanese?' -> 'this wall is scary'
// Text inside quotation marks is the exact sentence the user wants: nothing outside it is used.
function quoted(q){
  const m=/["“”„‟«»＂「『]\s*([^"“”„‟«»＂」』]{2,}?)\s*(?:["“”„‟«»＂」』]|$)/.exec(q)||/(?:^|\s)['‘](.{2,}?)['’]\s*[?.!]*\s*(?:in japanese)?\s*[?.!]*$/i.exec(q);
  return m?m[1].trim():null;
}
function cleanQ0(q){
  const inq=quoted(q);
  if(inq)return inq.replace(/\s+/g," ").replace(/[?!.。]+$/,"").trim();
  return q.trim().replace(/\s+/g," ").replace(/[?!.]+$/,"")
    .replace(/^(?:hello|hi|hey|um|well|ok|okay|so|please tell me)[,!. ]+/i,"").replace(/^sorry[,!.]+\s*/i,"")
    .replace(/^(?:how (?:do|can|would|should) (?:i|you|we) (?:say|ask|write)|how to (?:say|ask)|what(?:'s| is) the japanese (?:word )?for|what(?:'s| is)|how do you say|translate|say)\s*(?=["“'‘])/i,"")
    .replace(/^(?:how (?:do|can|would|should) (?:i|you|we) (?:say|ask)|how to (?:say|ask)|what(?:'s| is) the japanese (?:word )?for|how do you say|translate|say)\s*(?:if|whether|for|that|:)?\s*/i,"")
    .replace(/\s+in japanese$/i,"").replace(/^["“'‘]+|["”'’]+$/g,"").replace(/\s+in japanese$/i,"").replace(/[?!.]+$/,"").replace(/^["“'‘]+|["”'’]+$/g,"").trim();
}
function expandEn(x){return x.replace(/’/g,"'").replace(/\bkinda\b/gi,"kind of").replace(/\bsorta\b/gi,"sort of").replace(/\bgonna\b/gi,"going to").replace(/\bwanna\b/gi,"want to").replace(/\bgotta\b/gi,"have to").replace(/\b(it|that|this|he|she|there|what|where|who)'s\b/gi,"$1 is").replace(/\bi'm\b/gi,"i am").replace(/\b(we|they|you)'re\b/gi,"$1 are")
    .replace(/\b(is|are|was|were|do|does|did|would|could|should|wo|ca|have|has)n't\b/gi,(m,a)=>({wo:"will",ca:"can"}[a.toLowerCase()]||a)+" not").replace(/\bcannot\b/gi,"can not").replace(/\b(i|we|you|he|she|they|it)'ll\b/gi,"$1 will").replace(/\bi'd like\b/gi,"i would like").replace(/\b(i|we|you|they)'ve\b/gi,"$1 have").replace(/\blet's\b/gi,"lets")}
function cleanQ(q){const r=cleanQ0(q);return/^(this|that|it|these|those|this one|that one)$/i.test(r)&&!quoted(q)&&r.length<q.trim().replace(/[?!.]+$/,"").length?q.trim().replace(/\s+/g," ").replace(/[?!.]+$/,""):r}
const PLACEEND={"somewhere around here":["この辺","このへん","で"],"around here":["この辺","このへん","で"],"somewhere near here":["この辺","このへん","で"],"on the train":["電車","でんしゃ","で"],"on the bus":["バス","ばす","で"],"on the plane":["飛行機","ひこうき","で"],"on the subway":["地下鉄","ちかてつ","で"],"on the way home":["帰り道","かえりみち","で"],"on my way home":["帰り道","かえりみち","で"],"on the way here":["来る途中","くるとちゅう","で"],"on my way here":["来る途中","くるとちゅう","で"],"on the way to work":["仕事に行く途中","しごとにいくとちゅう","で"],"on my way to work":["仕事に行く途中","しごとにいくとちゅう","で"],"at the station":["駅","えき","で"],"at the airport":["空港","くうこう","で"],"at work":["職場","しょくば","で"],"at school":["学校","がっこう","で"],"at the party":["パーティー","ぱーてぃー","で"],"at the restaurant":["レストラン","れすとらん","で"],"at the hotel":["ホテル","ほてる","で"],"in the car":["車の中","くるまのなか","で"],"on the street":["道","みち","で"]};
function compose1(q){let r=null;
  {const wa=/^(.+?),? when (?:i|he|she|we|they|you|my [a-z]+) (?:was|were) (?:only |just )?([a-z]+(?:-[a-z]+)?|\d+)(?: years old)?([?!.]*)$/i.exec((q||"").trim())||/^when (?:i|he|she|we|they|you|my [a-z]+) (?:was|were) (?:only |just )?([a-z]+(?:-[a-z]+)?|\d+)(?: years old)?,? (.+)$/i.exec((q||"").trim());
   if(wa){const lead=/^when /i.test(q.trim());const n=enNum(lead?wa[1]:wa[2]);if(n>=1&&n<=100){let r2=null;try{r2=compose1(lead?wa[2]:wa[1]+(wa[3]||""))}catch(e){}if(r2){const kj=n<=10?KJ[n]:n<20?"十"+KJ[n-10]:KJ[Math.floor(n/10)]+"十"+(n%10?KJ[n%10]:"");return{...r2,chunks:[C(kj+"歳","さい"),C("の"),C("時","とき"),CM,...r2.chunks]}}}}}
  {const ym=/^(.+?\b(?:haven't|hasn't|have not|has not|haven’t|not been|never)\b.+?) (?:in|for) (years|ages|forever|a long time|so long|such a long time|a while|months|weeks)([?!.]*)$/i.exec((q||"").trim());if(ym){let r2=null;try{r2=compose1_(ym[1]+ym[3])}catch(e){}
    if(r2&&/(ていません|ていない|ませんでした|ことがありません)/.test(r2.chunks.map(c=>c[0]).join(""))){const k=ym[2].toLowerCase(),A=k==="years"?["何年も","なんねんも"]:k==="months"?["何か月も","なんかげつも"]:k==="weeks"?["何週間も","なんしゅうかんも"]:k==="a while"?["しばらく","しばらく"]:["長い間","ながいあいだ"];const ch=r2.chunks.slice();const wi=ch.findIndex((c,i)=>i<4&&(c[0]==="は"||c[0]==="が"));ch.splice(wi>=0?wi+1:0,0,C(A[0],A[1]));const ki=ch.findIndex((c,i)=>c[0]==="行った"&&(ch[i+1]||[])[0]==="こと"&&(ch[i+3]||[])[0]==="ありません");if(ki>=0)ch.splice(ki,4,C("行っていません","いっていません"));return{...r2,chunks:ch}}}}
  {const rm=/\b(don't|doesn't|didn't|do not|does not|did not|isn't|aren't|wasn't|weren't|am not|'m not|not) really\b/i.exec(q||"");if(rm){let r2=null;try{r2=compose1_(q.replace(/ really\b/i,""))}catch(e){}
    if(r2&&/(ない|ません|ませんでした|なかった)/.test(r2.chunks.map(c=>c[0]).join(""))){const ch=r2.chunks.filter(c=>!/^(本当に|とても)$/.test(c[0]));let wi=-1;ch.forEach((c,i)=>{if(i<ch.length-1&&/^(は|が|を|に|で|も)$/.test(c[0]))wi=i});ch.splice(wi+1,0,C("あまり"));return{...r2,chunks:ch}}}}
  try{r=compose1_(q)}catch(e){r=null}if(r)return r;
  {const ag=/^(.+) again (this morning|today|yesterday|tonight|last night|this year|this week)([?!.]*)$/i.exec((q||"").trim());if(ag){let r2=null;try{r2=compose1_(ag[1]+" "+ag[2]+ag[3])}catch(e){}const tw=TIME[ag[2].toLowerCase()];if(r2&&tw){const J=tw.split("|");const ch=r2.chunks.slice();const i=ch.findIndex(c=>J.includes(c[0]));if(i>=0){if(/^(は)$/.test((ch[i+1]||[])[0]||""))ch[i+1]=C("も");else ch.splice(i+1,0,C("も"));return{...r2,chunks:ch}}}}}
  {const qq2=(q||"").trim().replace(/[?!.]+$/,"");const gp=/^(.+?) (in front of|outside|near|next to|behind|inside|across from|at|on) (?:the |my |our |your |a )([a-z]+(?: [a-z]+)?)$/i.exec(qq2);if(gp&&gp[1].split(" ").length>=2){const P=NP(gp[3]);if(P&&!P.pron){let r2=null;try{r2=compose1_(gp[1]+(/\?$/.test(q.trim())?"?":""))}catch(e){}
     if(r2&&/(ます|ました|ますか|ません|ましょう|ませんか|ください|ですか|です|でした|か)$/.test((r2.chunks[r2.chunks.length-1]||[""])[0])){const k=gp[2].toLowerCase(),R={"in front of":["前","まえ"],outside:["外","そと"],near:["近く","ちかく"],"next to":["隣","となり"],behind:["後ろ","うしろ"],inside:["中","なか"],"across from":["向かい","むかい"],at:null,on:null}[k];if(k==="on"&&!/^(beach|train|bus|plane|boat|ship|stage|roof|street|bridge|island|phone|internet|way)$/i.test(gp[3]))return null;
       const exist=/(います|いました|あります|ありました|いますか|ありますか)$/.test((r2.chunks[r2.chunks.length-1]||[""])[0]);const ch=r2.chunks.slice();const tw=/^(今日|明日|昨日|今朝|今夜|毎日|毎朝|今週末|来週|先週|今|後で)$/;let at=0;while(at<ch.length&&(tw.test(ch[at][0])||/時(半)?に$/.test(ch[at][0])||/時(半)?$/.test(ch[at][0])&&(ch[at+1]||[])[0]==="に"||ch[at][0]==="に"&&at>0&&/時(半)?$/.test(ch[at-1][0])||(ch[at][0]==="は"&&at>0&&tw.test(ch[at-1][0]))))at++;const wi=ch.findIndex((c,i)=>i<4&&(c[0]==="は"||c[0]==="が"));if(wi>=at)at=wi+1;
       if(ch.some(c=>c[0]===P.chunks[P.chunks.length-1][0]))return r2;ch.splice(at,0,...P.chunks,...(R?[C("の"),C(R[0],R[1])]:[]),C(exist?"に":"で"));return{...r2,chunks:ch}}}}}
  const qq=(q||"").trim().replace(/[?!.]+$/,"");const pm=/^(.+?) (on the train|on the bus|on the plane|on the subway|on (?:the|my) way home|on (?:the|my) way here|on (?:the|my) way to work|at the station|at the airport|at work|at school|at the party|at the restaurant|at the hotel|in the car|on the street|somewhere around here|somewhere near here|around here)$/i.exec(qq);
  if(pm&&pm[1].split(" ").length>=3&&!/^(i'm|i am|we're|we are|are you|is he|is she|he's|she's|they are|you're|you are)$/i.test(pm[1].split(" ").slice(0,2).join(" "))){let r2=null;try{r2=compose1_(pm[1]+(/\?$/.test(q.trim())?"?":""))}catch(e){}
    if(r2&&(!r2.fixed||/(ました|ます|ません|でした)$/.test((r2.chunks[r2.chunks.length-1]||[""])[0]))){const P=PLACEEND[pm[2].toLowerCase().replace(/^on my /,"on the ")]||PLACEEND[pm[2].toLowerCase()];if(!P)return null;const ch=r2.chunks.slice();if(ch.some(c=>c[0]===P[0]))return r2;const wi=ch.findIndex((c,i)=>i<4&&(c[0]==="は"||c[0]==="が"));
      const ex=/(あります|います|ありますか|いますか|ありました|いました)$/.test(ch.slice(-2).map(c=>c[0]).join(""));ch.splice(wi>=0?wi+1:/^(今日|明日|昨日|今朝|今夜|毎日|毎朝|毎晩|今週末|来週|先週|今|後で)$/.test((ch[0]||[])[0])?1:0,0,C(P[0],P[1]),C(ex&&P[2]==="で"?"に":P[2]));return{...r2,chunks:ch}}}
  return null}
function compose1_(q){
  wix();if(!JPX)return null;
  let s0=cleanQ(q);
  if(!s0||s0.split(" ").length>18)return null;
  const isQ=/\?\s*["”'’」]?\s*$/.test(quoted(q)!=null?(/["“„‟«＂「『'‘]\s*([^"“”„‟«»＂」』]*)/.exec(q)||["",""])[1].replace(/["”’'」』\s]+$/,""):q);
  let please=false;if(/[, ]+please$/i.test(s0)){please=true;s0=s0.replace(/[, ]+please$/i,"")}
  const en=cap(s0)+(isQ?"?":"");
  // "even", "actually", "just" add a feeling the rules can't express: left out, with a note
  const supEver=/\bthe (?:most [a-z-]+|[a-z-]+est|worst)\b[a-z' -]*? ever\b/i.test(s0)||/\b(?:have|did) (?:you|i|we) ever\b/i.test(s0);
  const FILL=supEver?/\b(even|actually|really even|just|basically|literally|honestly)\b\s*/i:/\b(even|actually|really even|just|basically|literally|honestly|ever)\b\s*/i,fm=FILL.exec(s0);
  let fillNote=null;
  if(fm&&!/^just (a|one|this|that)\b/i.test(s0.slice(fm.index))){fillNote=`“${fm[1].toLowerCase()}” adds a feeling this simple sentence can't carry, so it's left out.`;s0=s0.replace(FILL,"").replace(/\s+/g," ").trim()}
  {const ADVW={"for the first time":["初めて","はじめて"],honestly:["正直","しょうじき"],instead:["代わりに","かわりに"],really:["本当に","ほんとうに"],fluently:["ペラペラ","ぺらぺら"],early:["早く","はやく"],alone:["一人で","ひとりで"],"by myself":["一人で","ひとりで"],"by accident":["うっかり","うっかり"],"by mistake":["間違えて","まちがえて"],"on purpose":["わざと","わざと"],accidentally:["うっかり","うっかり"],suddenly:["急に","きゅうに"],finally:["やっと","やっと"],always:["いつも","いつも"],usually:["普段","ふだん"],sometimes:["時々","ときどき"],
     often:["よく","よく"],already:["もう","もう"],still:["まだ","まだ"],separately:["別々に","べつべつに"],online:["オンラインで","おんらいんで"],secretly:["こっそり","こっそり"],definitely:["絶対","ぜったい"],probably:["たぶん","たぶん"],maybe:["たぶん","たぶん"],seriously:["マジで","まじで"],late:["遅く","おそく"]};
   const am=/^(i|we) live (alone|by myself|by ourselves)$/i.test(s0)||/\b(me|us|him|her|them|it) alone\b/i.test(s0)?null:/\b(really(?= (?:want|wanted|like|love|loved|need|hope|miss|missed|hate|enjoy|enjoyed|appreciate|think))|for the first time|honestly|instead(?=$)|fluently|early|alone|by myself|by accident|by mistake|on purpose|accidentally|suddenly|finally|always|usually|sometimes|often|already|still|separately|online|secretly|definitely|probably|maybe|seriously|(?<=\b(?:work|worked|working|works|study|studied|studying|woke up|wake up|got up|get up|slept|sleep|came home|come home|got home|get home) )late)\b/i.exec(s0);
   if(am&&s0.split(" ").length>2&&!/^why .*\balways (?:so )?late$|\balways (?:takes|taking) (?:the )?credit\b/i.test(s0)&&!/\bhow (often|early)\b/i.test(s0)&&!/\b(wak\w*|woke|get|getting|got|gets) up early\b/i.test(s0)&&!/\b(have|has|'ve) always wanted\b/i.test(s0)&&!(am[1].toLowerCase()==="early"&&!/\bearly( today| tomorrow| yesterday| this morning| tonight)?$/i.test(s0))){const rest=s0.replace(am[0],"").replace(/\s+/g," ").replace(/^,\s*/,"").trim();let r=null;try{r=compose1(rest+(isQ?"?":""))}catch(e){}
     if(r&&/^(always|usually|often|sometimes|never)$/i.test(am[1])){const k=r.chunks.findIndex(c=>c[0]==="遅れそう");if(k>0){r.chunks.splice(k,1,C("遅れます","おくれます"));if((r.chunks[k+1]||[])[0]==="です")r.chunks.splice(k+1,1)}}
     if(r&&/^(always|usually|often|sometimes)$/i.test(am[1])){const k=r.chunks.findIndex(c=>c[0]==="遅れて");if(k>0&&(r.chunks[k+1]||[])[0]==="います"){r.chunks.splice(k,2,C("遅刻","ちこく"),C("します"));r.chunks=dropMy(r.chunks);const g=r.chunks.findIndex(c=>c[0]==="が");if(g>0&&g<k)r.chunks[g]=C("は","わ")}}
     if(r&&/^finally$/i.test(am[1])){const k=r.chunks.findIndex(c=>c[0]==="寝てしまいました");if(k>=0){r.chunks=r.chunks.slice();r.chunks[k]=C("寝ました","ねました")}}
     if(r&&r.chunks.some(c=>c[0]===(ADVW[am[1].toLowerCase()]||[])[0]))return{...r,en};
     if(r){const a=am[1].toLowerCase()==="late"&&/\b(work|study|stud|stay)/i.test(s0.replace(/ (from|after|at) work\b|\b(go|went|going|goes|get|got|getting|come|came|coming|walk|walked|drive|drove) to work\b/gi,""))?["遅くまで","おそくまで"]:ADVW[am[1].toLowerCase()],ch=r.chunks.slice(),wi=ch.findIndex((c,i)=>i<5&&(c[0]==="は"||c[0]==="が"));ch.splice(wi>=0?wi+1:/^(今日|明日|昨日|今朝|今夜|毎日|毎朝|毎晩|今週末|来週|先週|今|後で)$/.test((ch[0]||[])[0])?1:0,0,C(a[0],a[1]));return{...r,chunks:ch,en}}
     if(!/^still$/i.test(am[1]))return null}}
  const l0=expandEn(s0);
  const KA=C("か"),WA=C("は","わ"),GA=C("が"),O=C("を","お");
  // a time word at the end ("... today") goes first in Japanese
  let T=[],Tu=[],l=l0,s=s0;
  {const ING={coming:"come",going:"go",leaving:"leave",arriving:"arrive",getting:"get",moving:"move",flying:"fly",returning:"return",starting:"start",visiting:"come",meeting:"meet",staying:"stay",heading:"head",checking:"check"};
   const wm=/^(when|what time|what day) (are|is) (you|he|she|they|we|it|the [a-z]+|your [a-z]+|my [a-z]+) ([a-z]+ing)\b(.*)$/i.exec(l);if(wm&&ING[wm[4].toLowerCase()]&&!/\bnow$/i.test(wm[5])){const r2=wm[1]+" will "+wm[3]+" "+ING[wm[4].toLowerCase()]+wm[5];l=r2;s=r2}}
  if(!/^(i|we|you|they)\b/i.test(l)&&!/ for (an?|one|two|three|four|five|six|seven|eight|nine|ten|\w+) (minutes?|hours?|days?|weeks?|months?|years?)$/i.test(l)){l=l.replace(/ has been ([a-z]+ing)\b/i," is $1");s=s.replace(/ has been ([a-z]+ing)\b/i," is $1")}
  if(/\b(not|cannot|never|n't)\b/i.test(l)&&/ anywhere$/i.test(l)&&l.split(" ").length>3){l=l.replace(/ anywhere$/i,"");s=s.replace(/ anywhere$/i,"");T=[C("どこにも")]}
  if(/\b(not|cannot|never|n't)\b/i.test(l)&&/ (any ?more|any longer)$/i.test(l)&&l.split(" ").length>=3){l=l.replace(/ (any ?more|any longer)$/i,"");s=s.replace(/ (any ?more|any longer)$/i,"");T=[...T,C("もう")]}
  {const im=/ in (an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|\d+) (minutes?|hours?|days?|weeks?)$/i.exec(l);if(im&&!/\b(i will be|i'll be|be there|be back|be ready)\b/i.test(l)){const n=/^fifteen$/i.test(im[1])?15:/^twenty$/i.test(im[1])?20:/^thirty$/i.test(im[1])?30:null;
     const d=n?C(n+(/hour/i.test(im[2])?"時間":/day/i.test(im[2])?"日":/week/i.test(im[2])?"週間":"分"),null):duration(im[1],im[2]);if(d&&d[1]!==undefined){const pst=/\b(finished|did|made|read|wrote|ran|got|took|built|learned|was|were|had|lost|walked|drove|swam|became|went|came|[a-z]{3,}ed)\b/i.test(l.slice(0,im.index));T=[...(pst?[]:[C("あと")]),n?C({15:"十五",20:"二十",30:"三十"}[n]+(/hour/i.test(im[2])?"時間":"分"),{15:"じゅうご",20:"にじゅっ",30:"さんじゅっ"}[n]+(/hour/i.test(im[2])?"じかん":"ぷん")):d,C("で")];l=l.slice(0,im.index);s=s.slice(0,s.length-im[0].length)}}}
  {const sm=/ since (monday|tuesday|wednesday|thursday|friday|saturday|sunday|this morning|last night|last week|last month|last year|yesterday|morning|noon)$/i.exec(l);if(sm&&!T.length){const D={monday:["月曜日","げつようび"],tuesday:["火曜日","かようび"],wednesday:["水曜日","すいようび"],thursday:["木曜日","もくようび"],friday:["金曜日","きんようび"],saturday:["土曜日","どようび"],sunday:["日曜日","にちようび"],"this morning":["今朝","けさ"],"last night":["昨日の夜","きのうのよる"],"last week":["先週","せんしゅう"],"last month":["先月","せんげつ"],"last year":["去年","きょねん"],yesterday:["昨日","きのう"],morning:["朝","あさ"],noon:["お昼","おひる"]}[sm[1].toLowerCase()];
    T=[C(D[0],D[1]),C("から")];l=l.slice(0,sm.index);s=s.slice(0,s.length-sm[0].length);if(!/been feeling/i.test(l)&&/ (has|have) been (?!to\b)/i.test(l)&&!/ been [a-z]+ing\b/i.test(l)){const fx2=x=>x.replace(/^(i) have been /i,"$1 am ").replace(/^(we|you|they) have been /i,"$1 are ").replace(/ has been /i," is ");l=fx2(l);s=fx2(s)}}}
  {const am2=/ (?:at around|at about|around|about) (midnight|noon)$/i.exec(l);if(am2&&!T.length){T=[C(/mid/i.test(am2[1])?"夜中の十二時":"お昼",/mid/i.test(am2[1])?"よなかのじゅうにじ":"おひる"),C("ごろ")];l=l.slice(0,am2.index);s=s.slice(0,s.length-am2[0].length)}}
  {const um=/ (?:until|till) (midnight|noon|late|tomorrow|morning)$/i.exec(l);if(um){const k={midnight:["夜中の十二時","よなかのじゅうにじ"],noon:["お昼","おひる"],late:["遅く","おそく"],tomorrow:["明日","あした"],morning:["朝","あさ"]}[um[1].toLowerCase()];T=[...T,C(k[0],k[1]),C("まで")];l=l.slice(0,um.index);s=s.slice(0,s.length-um[0].length)}}
  {const dm3=/ (?:on )?(january|february|march|april|may|june|july|august|september|october|november|december) (\w+)$/i.exec(l)||/ in (january|february|march|april|june|july|august|september|october|november|december)$/i.exec(l);
   if(dm3&&!T.length){const d=dm3[2]?enOrd(dm3[2]):null;if(!dm3[2]||d){const dc=dateCh(dm3[1],d);if(dc){T=[...dc,C("に")];l=l.slice(0,dm3.index);s=s.slice(0,s.length-dm3[0].length)}}}}
  if(/^(?:can|could) you .+ for me$/i.test(l)){l=l.replace(/ for me$/i,"");s=s.replace(/ for me$/i,"")}
  {const wm=/ the whole (way|time|day|night|trip|flight|ride|weekend)$/i.exec(l);if(wm&&!T.length){const k=wm[1].toLowerCase();T=[k==="day"?C("一日中","いちにちじゅう"):k==="night"?C("一晩中","ひとばんじゅう"):k==="weekend"?C("週末ずっと","しゅうまつずっと"):C("ずっと")];l=l.slice(0,wm.index);s=s.slice(0,s.length-wm[0].length)}}
  let nanimo=false;if(/\b(not|cannot|never|n't)\b/i.test(l)&&/ anything$/i.test(l)&&l.split(" ").length>=3){l=l.replace(/ anything$/i,"");s=s.replace(/ anything$/i,"");nanimo=true}
  if(/\bnever\b/i.test(l)&&/ before$/i.test(l)){l=l.replace(/ before$/i,"");s=s.replace(/ before$/i,"")}
  for(const t of Object.keys(TIME).sort((a,b)=>b.length-a.length)){
    const re=new RegExp(" "+t+"$","i");
    if(re.test(l)&&/^(?:i'll |i will |let's )?talk to you$/i.test(l.replace(re,"")))break;
    if(re.test(l)&&/ (for|to|until|till|from|since)$/i.test(l.replace(re,"")))continue;
    if(re.test(l)){const w=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]);if(!w)return null;T=timeCh(t,w);Tu=[Object.assign({},w,{en:t})];l=l.replace(re,"");s=s.replace(re,"");if(/ since$/i.test(l)){T=[...T,C("から")];l=l.replace(/ since$/i,"");s=s.replace(/ since$/i,"");if(!/been feeling/i.test(l)&&/ (has|have) been (?!to\b)/i.test(l)&&!/ been [a-z]+ing\b/i.test(l)){const fx2=x=>x.replace(/^(i) have been /i,"$1 am ").replace(/^(we|you|they) have been /i,"$1 are ").replace(/ has been /i," is ");l=fx2(l);s=fx2(s)}}else if(/ (by|before)$/i.test(l)){if((T[T.length-1]||[])[0]==="に")T=T.slice(0,-1);T=[...T,C(/ by$/i.test(l)?"までに":"前に",/ by$/i.test(l)?"までに":"まえに")];l=l.replace(/ (by|before)$/i,"");s=s.replace(/ (by|before)$/i,"")}else if(/ until$/i.test(l)){if((T[T.length-1]||[])[0]==="に")T=T.slice(0,-1);T=[...T,C("まで")];l=l.replace(/ until$/i,"");s=s.replace(/ until$/i,"")}break}
  }
  {const fm=/ for (months|years|weeks|days|hours|ages|a long time|so long|a while)$/i.exec(l);if(fm&&!T.length&&/\b(been|waiting|waited|looking|looked|searching|lived|living|worked|working|studied|studying|known|wanted|tried|trying|practiced|practicing|saving|saved)\b/i.test(l)){const k={months:["何ヶ月も","なんかげつも"],years:["何年も","なんねんも"],weeks:["何週間も","なんしゅうかんも"],days:["何日も","なんにちも"],hours:["何時間も","なんじかんも"],ages:["ずっと","ずっと"],"a long time":["長い間","ながいあいだ"],"so long":["長い間","ながいあいだ"],"a while":["しばらく","しばらく"]}[fm[1].toLowerCase()];T=[C(k[0],k[1])];l=l.slice(0,fm.index);s=s.slice(0,s.length-fm[0].length)}}
  let durQ=null;{const qm=/ for (over|more than|about|around|almost|nearly|at least) (?=(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?|days?|weeks?|months?|years?)$)/i.exec(l);if(qm){durQ=qm[1].toLowerCase();l=l.replace(qm[0]," for ");s=s.replace(new RegExp(" for "+qm[1]+" ","i")," for ")}}
  {const dm=/ for (an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?|days?|weeks?|months?|years?)$/i.exec(l);
   let abt=false;{const am=/ (?:about|around|maybe) (?=(once|twice|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) times) (?:a|per|every) (day|week|month|year)$)/i.exec(l);if(am){abt=true;l=l.replace(am[0]," ");s=s.replace(/ (?:about|around|maybe) (?=(once|twice|\w+ times) )/i," ")}}
   {const fm=/ (once|twice|(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) times) (?:a|per|every) (day|week|month|year)$/i.exec(l);
    if(fm){const tc=timesCh(fm[1]);if(!tc)return null;const per={day:["一日","いちにち"],week:["週","しゅう"],month:["月","つき"],year:["年","ねん"]}[fm[2].toLowerCase()];
      T=[...T,C(per[0],per[1]),...(fm[2].toLowerCase()==="day"?[]:[C("に")]),tc,...(abt?[C("くらい")]:[])];l=l.slice(0,fm.index);s=s.slice(0,s.length-fm[0].length)}}
   {const cm=/ (at around|at about|around|about|at|by|until|till) (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})(?::(\d\d))?(?: ?(o'clock|am|pm|a\.m\.|p\.m\.| in the morning| in the afternoon| in the evening| at night))?$/i.exec(l);
    if(cm&&!dm){const ck=clock(cm[2],cm[3],cm[4]);if(!ck)return null;const by=cm[1].toLowerCase();const ck2=/around|about/.test(by)?[...ck.slice(0,-1),C("ごろ")]:by==="at"?ck:[...ck.slice(0,-1),C(by==="by"?"までに":"まで")];T=[...T,...ck2];l=l.slice(0,cm.index);s=s.slice(0,s.length-cm[0].length)}}
   {const dm2=/ (?:on|every) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)s$/i.exec(l);if(dm2&&!T.length){const d={monday:["月曜日","げつようび"],tuesday:["火曜日","かようび"],wednesday:["水曜日","すいようび"],thursday:["木曜日","もくようび"],friday:["金曜日","きんようび"],saturday:["土曜日","どようび"],sunday:["日曜日","にちようび"]}[dm2[1].toLowerCase()];
     T=[C("毎週","まいしゅう"),C(d[0],d[1])];l=l.slice(0,dm2.index);s=s.slice(0,s.length-dm2[0].length)}}
   {const bm=/ (before|after) (my|the|his|her|our|your) ([a-z]+)$/i.exec(l);if(bm&&!T.length){const np=NP(bm[3]);if(np&&!np.pron&&np.chunks.every(c=>c[1]!=null)){T=[...dropMy(np.chunks),C("の"),bm[1].toLowerCase()==="before"?C("前に","まえに"):C("後で","あとで")];Tu=np.used;l=l.slice(0,bm.index);s=s.slice(0,s.length-bm[0].length)}}}
   if(!T.length){for(const t of Object.keys(TIME).sort((a,b)=>b.length-a.length)){   // "after dinner, let's watch a movie" / "tomorrow I will …"
     const re=new RegExp("^"+t+",? (?=(i|we|you|he|she|they|it|my|the|lets|let's|please)\\b)","i");
     if(re.test(l)){const w=byJP(TIME[t],"any")||TFB[t];if(!w)break;T=timeCh(t,w);Tu=[Object.assign({},w,{en:t})];l=l.replace(re,"");s=s.replace(re,"");break}}}
   if(dm){let d=duration(dm[1],dm[2]);if(!d)return null;if(/^(day|week|month|year)/i.test(dm[2])&&!/間$/.test(d[0]))d=C(d[0]+"間",d[1]+"かん");T=[...T,d,...(durQ?[C({over:"以上","more than":"以上","at least":"以上",about:"くらい",around:"くらい",almost:"近く",nearly:"近く"}[durQ],{over:"いじょう","more than":"いじょう","at least":"いじょう",about:"くらい",around:"くらい",almost:"ちかく",nearly:"ちかく"}[durQ])]:[])];l=l.slice(0,dm.index);s=s.slice(0,s.length-(dm[0].length))}}
  const out0_=(...a)=>out0(...a);
  const out0=(chunks,used,notes,twa)=>{if(!chunks||!chunks.every(Boolean))return null;
    if(chunks.some((c,i)=>c[0]==="同じ"&&(chunks[i+1]||[])[0]==="な"))chunks=chunks.filter((c,i)=>!(c[0]==="な"&&(chunks[i-1]||[])[0]==="同じ"));
    if(chunks.some(c=>/^同じな/.test(c[0])))chunks=chunks.map(c=>/^同じな/.test(c[0])?[c[0].replace(/^同じな/,"同じ"),c[1]&&c[1].replace(/^おなじな/,"おなじ"),c[2]]:c);
    {const k=chunks.findIndex((c,i)=>c[0]==="この辺"&&(chunks[i+1]||[])[0]==="で");if(k>=0&&/(あります|います|ありますか|いますか)$/.test(chunks.slice(-2).map(c=>c[0]).join(""))){chunks=chunks.slice();chunks[k+1]=C("に")}}
    if(/\bbroke down\b/i.test(s0)){const k=chunks.findIndex(c=>c[0]==="壊れました");if(k>=0){chunks=chunks.slice();chunks[k]=C("故障しました","こしょうしました")}}
    if(/(ましょう|ないと)/.test(chunks.map(c=>c[0]).join(""))&&/\b(leave|go|get going|head out|head home|go home)\b/i.test(s0)){const k=chunks.findIndex(c=>c[0]==="もうすぐ");if(k>=0){chunks=chunks.slice();chunks[k]=C("そろそろ")}}
    {const k=chunks.findIndex((c,i)=>c[0]==="食べ物"&&(chunks[i+1]||[])[0]==="を"&&/^食べに/.test((chunks[i+2]||[""])[0]));if(k>=0)chunks=[...chunks.slice(0,k),C("何か","なにか"),...chunks.slice(k+2)]}
    if(T.some(c=>/頃$/.test(c[0]))){const k=chunks.findIndex(c=>c[0]==="昔");if(k>=0)chunks=[...chunks.slice(0,k),...chunks.slice((chunks[k+1]||[])[0]==="は"?k+2:k+1)]}
    {const k=chunks.findIndex((c,i)=>c[0]==="見つける"&&(chunks[i+1]||[])[0]==="の"&&(chunks[i+2]||[])[0]==="を"&&/^手伝/.test((chunks[i+3]||[""])[0]));if(k>=0){chunks=chunks.slice();chunks[k]=C("探す","さがす")}}
    if(chunks.length>=3&&/^(目|頭|喉|お腹|胃|背中|腰|足|手|肩|首|歯|耳|鼻|膝|腕|指|肌|体)$/.test(chunks[0][0])&&chunks[1][0]==="は"&&/^(かゆい|痛い|だるい|重い|かゆかった|痛かった|熱い|冷たい|疲れて)/.test(chunks[2][0])&&!/\b(but|and)\b/i.test(s0))chunks=[chunks[0],C("が"),...chunks.slice(2)];
    {const hi=chunks.findIndex((c,i)=>/^(彼|彼女)$/.test(c[0])&&/^(は|が)$/.test((chunks[i+1]||[])[0]||""));if(hi>=0){const j=chunks.findIndex((c,i)=>i>hi+1&&c[0]===chunks[hi][0]&&(chunks[i+1]||[])[0]==="の");if(j>0)chunks=[...chunks.slice(0,j),...chunks.slice(j+2)]}}
    {const hi=chunks.findIndex((c,i)=>c[0]==="私"&&(chunks[i+1]||[])[0]==="の"&&(chunks[i+2]||[])[0]==="家"&&/^(に|で|へ)$/.test((chunks[i+3]||[])[0]||""));if(hi>=0)chunks=[...chunks.slice(0,hi),C("うち"),...chunks.slice(hi+3)]}
    if(T.some(c=>/^(明日|来週|来月|来年|今夜|今週末|来週末|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|今度|明日の夜|明日の朝|明日の午後|あさって)$/.test(c[0]))&&chunks.length>=2&&chunks[chunks.length-1][0]==="います"&&chunks[chunks.length-2][0]==="して"&&!chunks.some(c=>/^探/.test(c[0]))&&/\b(am|are|is|'m|'re|'s) [a-z]+ing\b/i.test(s0))chunks=[...chunks.slice(0,-2),C("します")];
    if(/^(i|we|i'm|we're)\b/i.test(s0)&&!/\b(you|your|he|she|his|her|they|their)\b/i.test(s0)&&!chunks.some((c,i)=>c[0]==="の"&&/^(私|私たち)$/.test((chunks[i-1]||[])[0]||"")&&/^(勝ち|負け|番|せい|おごり|責任|もの|物)$/.test((chunks[i+1]||[])[0]||"")))chunks=dropMy(chunks);
    {const gi=chunks.findIndex((c,i)=>{if(!/^(いい|よかった)$/.test(c[0]))return false;const j=/^(とても|本当に|すごく|すごい|めっちゃ|かなり)$/.test((chunks[i-1]||[])[0]||"")?i-1:i;return /^(は|が)$/.test((chunks[j-1]||[])[0]||"")&&/^(です|でした)?$/.test((chunks[i+1]||[""])[0]||"")&&(used||[]).some(u=>u&&u.jp===(chunks[j-2]||[])[0]&&/(^|,)fd(,|$)/.test(u.pos||""))});
     if(gi>0&&!/\b(for you|for your|for the)\b/i.test(s0)){chunks=chunks.slice();chunks[gi]=chunks[gi][0]==="いい"?C("おいしい"):C("おいしかった")}}if(nanimo){const n=chunks.length,k=(chunks[n-1]||[])[0]==="でした"?n-2:n-1;if(!/(ません|ない)$/.test((chunks[k]||[""])[0]))return null;chunks=[...chunks.slice(0,k),C("何も","なにも"),...chunks.slice(k)]}
    const ti=chunks.findIndex((c,i)=>i<=2&&(c[0]==="は"||c[0]==="が"&&T.length&&(/(間|以上|くらい|近く)$/.test(T[T.length-1][0])||/^(彼|彼女|彼ら)$/.test((chunks[i-1]||[""])[0]))));
    if(ti>=1&&chunks[ti][0]==="が"&&T.length&&/^(彼|彼女|彼ら|私|僕)$/.test((chunks[ti-1]||[""])[0]))chunks=[...chunks.slice(0,ti),C("は","わ"),...chunks.slice(ti+1)];if(T.length&&ti>=1&&ti<=2&&!T.some(c=>/^(もう一度|また|どこにも)$/.test(c[0]))&&!chunks.slice(0,ti).some(c=>/^(今日|明日|昨日|今|今夜|今朝)$/.test(c[0]))){const T0=T;T=[];const r=out(chunks.slice(0,ti+1).concat(T0,chunks.slice(ti+1)),used,notes,false);T=T0;return r}
    return out(chunks,used,notes,twa)};
  const out=(chunks,used,notes,twa)=>{const r=out_(chunks,used,notes,twa);if(r&&r.chunks[0]&&/時(半)?$/.test(r.chunks[0][0])&&(r.chunks[1]||[])[0]==="に"&&r.chunks[2]&&/^(明日|今日|今夜|あさって|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|来週|今週末)$/.test(r.chunks[2][0])){const ch=r.chunks;r.chunks=[ch[2],ch[0],ch[1],...ch.slice(3)]}if(r&&r.chunks[0]&&/時(半)?に$|時(半)?$/.test(r.chunks[0][0])&&r.chunks[1]&&/^(明日|今日|今夜|あさって|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|来週|今週末)$/.test(r.chunks[1][0])){const a=r.chunks[0],b=r.chunks[1];const tail=(r.chunks[2]||[])[0]==="は"?2:1;r.chunks=[b,...(tail===2?[r.chunks[2]]:[]),a,...r.chunks.slice(tail+1)]}if(r&&r.chunks[0]&&r.chunks[0][0]==="また"&&r.chunks[1]&&r.chunks[1][1]!=null&&/^(は|が)$/.test((r.chunks[2]||[])[0]||"")&&!/^(また)$/.test(r.chunks[1][0]))r.chunks=[r.chunks[1],r.chunks[2],r.chunks[0],...r.chunks.slice(3)];return r};
  const out_=(chunks,used,notes,twa)=>chunks&&chunks.every(Boolean)?{chunks:[...(T.length===1&&T[0][0]==="もう一度"&&!chunks.some(c=>/ください|ましょう|ませんか|もらえ|ても/.test(c[0]))?[C("また")]:T),...(twa&&T.length&&!/(に|で|間|か月|ずっと|中)$/.test((T[T.length-1]||[])[0]||"")&&T[0][0]!=="もう一度"?[WA]:[]),...selfPoss(chunks[0]&&chunks[0][0]==="私"&&(chunks[1]||[])[0]==="の"&&(/^(は|が)$/.test((chunks[3]||[])[0]||"")&&chunks.length>4||/^(友達|家族|両親|母|父|兄|姉|弟|妹|夫|妻|彼氏|彼女|息子|娘|子供|上司|同僚|先生|祖母|祖父|いとこ|親友)$/.test((chunks[2]||[])[0]||""))?chunks.slice(2):chunks)],used:[...Tu,...used].filter(u=>u&&u.jp),notes:[...(notes||[]),...(fillNote?[fillNote]:[])],en}:null;
  const subj=str=>{   // -> {chunks (with は), used, thing} ; I / you / it are left out, as Japanese does
    const t=str.trim().toLowerCase();
    if(/^(i|we|you|it)$/.test(t))return{chunks:[],used:[],thing:t==="it"?false:null,omit:t};
    {const gm=/^[a-z]+ing\b/i.exec(str.trim());const np1=gm&&NP(str.trim());
     if(gm&&(!np1||np1.used.some(u=>u.kind==="dictionary"))){const vp=VP(str.trim()),d=vp&&!vp.past&&!vp.me&&vplain(vp.v,"dict");if(d)return{chunks:[...vp.pre,...d,C("の"),WA],used:vp.used,thing:true}}}
    if(TIME[t]){const w=byJP(TIME[t],"any");return w?{chunks:[C(w.jp,w.kana),WA],used:[Object.assign({},w,{en:t})],thing:true}:null}   // "today was fun"
    const hm=/^(.+) (here|there)$/i.exec(str.trim());   // "the food here" -> ここの料理
    const np0=NP(hm?hm[1]:str.trim());if(!np0)return null;
    if(np0.chunks.some(c=>c[1]==null)&&!/^[A-Z0-9]/.test(str.trim().replace(/^(the|a|an|my|your|his|her|our|their) /i,"")))return null;   // "bro is cooking": not a name
    const np=hm&&!np0.pron?{...np0,chunks:[hm[2].toLowerCase()==="here"?C("ここ"):C("そこ"),C("の"),...np0.chunks]}:np0;
    const ln=np.used[np.used.length-1],fl=ln&&ln.pos||"";
    return{chunks:[...dropMy(np.chunks),T.length?GA:WA],used:np.used,thing:!np.pron||/^(this|that|these|those)/.test(np.pron),pron:np.pron,
      an:/(^|,)an(,|$)/.test(fl)||/^(he|she)$/.test(np.pron||"")||!!ln&&ln.kana==null,ph:/(^|,)ph(,|$)/.test(fl)};
  };
  const pred=(str,S,neg,past,mode)=>{   // what comes after is/are
    let t=str.trim(),adv=null,m;if(/^(?:so |very |really |truly |deeply )?(sorry|thankful|grateful|glad|sad|happy|sorry|ready|responsible|famous|late|perfect|bad|good|enough|great) for\b/i.test(t))return null;
    if((m=/^(very|really|so|extremely|super|too|a little|a bit|a little bit|slightly|kind of|pretty|quite|that) (.+)$/i.exec(t))){adv=m[1].toLowerCase();t=m[2]}
    let tl=t.toLowerCase();
    // "so tired", "really hungry": とても + the state
    if(adv&&/^(very|really|so|extremely|super)$/.test(adv)&&!mode&&!neg&&STATE[tl]){const r=pred(t,S,neg,past,mode);if(r)return{...r,chunks:[C("とても"),...r.chunks]}}
    if(!adv&&!mode){
      if(/^on fire$/.test(tl)){if(S.an||S.omit)return null;const v=byJP("燃える","v"),e=v&&vend(v,past?"teita":"teiru");return e?{chunks:e,used:[v],ga:true}:null}   // "the pizza is on fire" -> 燃えています
      // "angry at me" -> 私に怒っています
      {const am=/^(angry|mad|upset) (?:at|with) (me|you|us|him|her)$/i.exec(t);
       if(am){const v=byJP("怒る:おこる","v"),e0=v&&vend(v,neg?"teinai":past?"teita":"teiru"),e=e0&&neg&&past?[...e0.slice(0,-1),C("いませんでした")]:e0,who={me:["私","わたし"],you:["あなた","あなた"],us:["私たち","わたしたち"],him:["彼","かれ"],her:["彼女","かのじょ"]}[am[2].toLowerCase()];
         return e?{chunks:[C(who[0],who[1]),C("に"),...e],used:[v]}:null}}
      // "scared of spiders" -> 蜘蛛が怖いです
      {const sm=/^(?:scared|afraid|terrified|frightened) of (.+)$/i.exec(t);
       if(sm&&(S.an||S.omit&&S.omit!=="it")){const np=NP(sm[1]),a=byJP("怖い","adj");if(!np||np.pron||!a)return null;
         return{chunks:[...np.chunks,GA,past?C("怖かった","こわかった"):C(a.jp,a.kana),C("です")],used:[...np.used,a],
           notes:["“Scared of …” is said as “… is scary (to me)”: … が怖い."]}}}
      // "in college" -> 大学生です
      {const cm=/^in (college|university|high school|middle school|junior high|elementary school|grade school)$/i.exec(t);
       if(cm&&(S.an||S.omit&&S.omit!=="it"||/^(弟|妹|兄|姉|息子|娘|子供|孫|甥|姪|いとこ|お兄さん|お姉さん|友達|彼氏|彼女)$/.test(((S.used||[])[(S.used||[]).length-1]||{}).jp||""))){const k=/college|university/i.test(cm[1])?["大学生","だいがくせい"]:/high/i.test(cm[1])?["高校生","こうこうせい"]:/middle|junior/i.test(cm[1])?["中学生","ちゅうがくせい"]:["小学生","しょうがくせい"];
         return{chunks:[C(k[0],k[1]),past?C("でした"):C("です")],used:[]}}}
      // "90 years old" -> 90歳です
      {const ym=/^(\w+) years? old$/i.exec(t),n=ym&&numOf(ym[1]),k=n&&ageKana(n);if(ym){if(!k||neg)return null;return{chunks:[C(n+"歳",k),past?C("でした"):C("です")],used:[]}}}
      // "he's the goat" -> 最強です
      // "my wife is Japanese" -> 日本人です (a person's nationality, not the language)
      // the special cases below only know the "is" form: with "not" they are not built rather than said the wrong way round
      if(neg&&(/^(on (?:my |our |a |his |her |their )?(honeymoon|vacation|holiday|holidays|trip|business|business trip|diet|break|duty|leave|lunch break)|freezing|lost|far (?:away )?from .+|on the .+ floor|in (?:high school|middle school|junior high|junior high school|elementary school|primary school|college|university|grad school)|on time|stale|extinct|okay|ok|alright|all right|so-so|(?:very |so |really )?nice|(?:so |very |really )?lazy|the goat)$/i.test(t)||/^[A-Z][a-z]*(?: [A-Z][a-z]*)+$/.test(t)))return null;
      if(/^[A-Z][a-z]*(?: [A-Z][a-z]*)+$/.test(t)&&!PLACES[tl])return{chunks:[[t,null],past?C("でした"):C("です")],used:[{jp:t,kana:null,en:"a name, said as it is"}]};   // "my favorite anime is One Piece"
      {const fm=/^on the (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|top|\d+)(?:st|nd|rd|th)? floor$/i.exec(t);   // "my room is on the fifth floor" -> 五階です
       if(fm){const n=fm[1].toLowerCase()==="top"?0:/^\d+$/.test(fm[1])?+fm[1]:["first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth"].indexOf(fm[1].toLowerCase())+1;
         if(!n)return fm[1].toLowerCase()==="top"?{chunks:[C("最上階","さいじょうかい"),past?C("でした"):C("です")],used:[]}:null;if(n>10)return null;
         const KAI=["いっかい","にかい","さんがい","よんかい","ごかい","ろっかい","ななかい","はっかい","きゅうかい","じゅっかい"];return{chunks:[C(KJ[n]+"階",KAI[n-1]),past?C("でした"):C("です")],used:[]}}}
      {const sm=/^in (high school|middle school|junior high|junior high school|elementary school|primary school|college|university|grad school)$/i.exec(t);
       if(sm&&(S.an||S.omit)){const k=/high/i.test(sm[1])&&!/junior/i.test(sm[1])?["高校生","こうこうせい"]:/middle|junior/i.test(sm[1])?["中学生","ちゅうがくせい"]:/elementary|primary/i.test(sm[1])?["小学生","しょうがくせい"]:/grad/i.test(sm[1])?["大学院生","だいがくいんせい"]:["大学生","だいがくせい"];
         return{chunks:[C(k[0],k[1]),past?C("でした"):C("です")],used:[]}}}
      if(tl==="stale")return{chunks:[C("古く","ふるく"),C("なって"),C(past?"いました":"います")],used:[]};
      if(tl==="extinct")return{chunks:[C("絶滅","ぜつめつ"),C("しました")],used:[]};
      if(/^(okay|ok|alright|all right|so-so|so so)$/.test(tl)&&!S.omit&&!S.an)return{chunks:[C("まあまあ"),past?C("でした"):C("です")],used:[]};
      if(/^(?:very |so |really )?nice$/.test(tl)&&(S.an||S.used&&S.used.some(u=>/(^|,)an(,|$)/.test(u.pos||"")))&&!/(^|,)ani(,|$)/.test(((S.used||[])[(S.used||[]).length-1]||{}).pos||""))return{chunks:[...(/^(very|so|really) /.test(tl)?[C("とても")]:[]),...(past?[C("優しかった","やさしかった"),C("です")]:[C("優しい","やさしい"),C("です")])],used:[]};
      if(/^on time$/i.test(t))return{chunks:[C("時間通り","じかんどおり"),past?C("でした"):C("です")],used:[]};
      if(/^(趣味|夢|仕事|目標|特技)$/.test(((S.used||[])[(S.used||[]).length-1]||{}).jp||"")&&/^[a-z]+ing\b/i.test(t)&&!neg){
        const DR={drawing:["絵を描くこと","えをかくこと"],reading:["読書","どくしょ"],cooking:["料理","りょうり"],singing:["歌うこと","うたうこと"],dancing:["ダンス"],swimming:["水泳","すいえい"],traveling:["旅行","りょこう"],travelling:["旅行","りょこう"],shopping:["買い物","かいもの"],fishing:["釣り","つり"],gaming:["ゲーム"],running:["ランニング"],hiking:["ハイキング"],camping:["キャンプ"],painting:["絵を描くこと","えをかくこと"],writing:["文章を書くこと","ぶんしょうをかくこと"],photography:["写真","しゃしん"]}[tl];
        if(DR)return{chunks:[C(DR[0],DR[1]||DR[0]),past?C("でした"):C("です")],used:[]};
        const vp=VP(t),d=vp&&!vp.past&&vplain(vp.v,"dict");if(d)return{chunks:[...vp.pre,...d,C("こと"),past?C("でした"):C("です")],used:vp.used}}
      if(/^(?:so |very |really )?lazy$/.test(tl)&&(S.an||S.omit&&S.omit!=="it"))return{chunks:[C("怠け者","なまけもの"),past?C("でした"):C("です")],used:[]};
      if(NAT[tl]){if(!(S.an||S.omit&&S.omit!=="it"))return null;return{chunks:[C(NAT[tl][0],NAT[tl][1]),neg?C("じゃない"):null,past?C("でした"):C("です")].filter(Boolean),used:[],np:true}}
      // "on vacation" -> 休暇中です
      {const om=/^on (?:my |our |a |his |her |their )?(honeymoon|vacation|holiday|holidays|trip|business|business trip|diet|break|duty|leave|lunch break)$/i.exec(t);
       if(om){const k={honeymoon:["新婚旅行中","しんこんりょこうちゅう"],vacation:["休暇中","きゅうかちゅう"],holiday:["休暇中","きゅうかちゅう"],holidays:["休暇中","きゅうかちゅう"],leave:["休暇中","きゅうかちゅう"],trip:["旅行中","りょこうちゅう"],
         business:["出張中","しゅっちょうちゅう"],"business trip":["出張中","しゅっちょうちゅう"],diet:["ダイエット中","ダイエットちゅう"],break:["休憩中","きゅうけいちゅう"],"lunch break":["休憩中","きゅうけいちゅう"],duty:["勤務中","きんむちゅう"]}[om[1].toLowerCase()];
         return{chunks:[C(k[0],k[1]),past?C("でした"):C("です")],used:[]}}}
      if(tl==="freezing"&&(S.an||S.omit)){return{chunks:[C("とても"),C(past?"寒かった":"寒い",past?"さむかった":"さむい"),C("です")],used:[]}}   // "I'm freezing" -> とても寒いです
      if(tl==="lost"&&S.an&&!S.omit)return{chunks:[C("迷子","まいご"),past?C("でした"):C("です")],used:[]};   // "my kid is lost" -> 迷子です
      {const fm=/^far (?:away )?from (.+)$/i.exec(t);if(fm){const np=/^here$/i.test(fm[1])?{chunks:[C("ここ")],used:[]}:NP(fm[1]);if(!np||np.pron&&!np.chunks.length)return null;
        return{chunks:[...np.chunks,C("から"),C(past?"遠かった":"遠い",past?"とおかった":"とおい"),C("です")],used:np.used}}}
      if(/^the goat$/.test(tl)){if(neg||past)return null;return{chunks:[C("最強","さいきょう"),C("です")],used:[],notes:["“The GOAT” (greatest of all time) is said as 最強 (the strongest, the best there is)."]}}
      if(/^(tall|short)$/.test(tl)&&(S.an||S.omit&&S.omit!=="it")){
        const g=byJP("背","n"),w=byJP(tl==="tall"?"高い":"低い","adj"),p=w&&adjPred(w,neg,past);return g&&p?{chunks:[C(g.jp,g.kana),GA,...p],used:[g,w],desc:true}:null}
      if(/^(sick|ill|unwell|not well)$/.test(tl)&&(S.an||S.omit&&S.omit!=="it")&&!neg){   // feeling sick: 具合が悪い
        const g=byJP("具合","n"),w=byJP("悪い","adj");return g&&w?{chunks:[C(g.jp,g.kana),GA,...(past?[C("悪かった","わるかった")]:[C(w.jp,w.kana)]),C("です")],used:[g,w]}:null}
      // slang praise: "this ramen is fire" -> 最高 (the best)
      if(SLANGP.has(tl)){if(neg||past)return null;const a=byJP("最高","adj");return a?{chunks:[C(a.jp,a.kana),C("です")],used:[a],notes:[`“${tl}” is slang for “really good”. 最高 (the best) is how people say that in everyday Japanese.`]}:null}
      // a state said with an action word: "the train is late" -> 遅れています, "my luggage is lost" -> なくなりました
      const st=STATE[tl];
      const person=S.an||S.omit&&S.omit!=="it";
      if(st&&!(st[1]&&st[1]<4&&person)&&!(st[1]>=5&&!person)){
        const v=byJP(st[0],"v");if(!v)return null;
        const e=st[1]===2||st[1]===4?(neg?null:vend(v,past&&st[1]===4?"mashita":"mashita")):vend(v,neg?"teinai":past?"teita":"teiru"),pn=st[2]?[C(st[2],st[3]),GA]:[];
        return e?{chunks:[...pn,...e],used:[v],ga:!st[2]&&st[1]!==6}:null;
      }
      // where it is: "near the station" -> 駅の近くです, "on the table" -> テーブルの上にあります, "in Tokyo" -> 東京にいます
      for(const[re,pw,pk,exist]of LOC){
        const lm=re.exec(t);if(!lm)continue;
        const here=/^here$/i.test(lm[1]);if(here&&!pw)return null;
        const np=here?null:NP(lm[1]);
        if(!here&&(!np||/^(i|we|he|she)$/.test(np.pron||"")))return null;
        if((pw==="上"||pw==="下")&&!isPlaceNP(np)&&!/(^|,)ph(,|$)/.test((np.used[np.used.length-1]||{}).pos||""))return null;
        const box=!pw&&!isPlaceNP(np)&&/^in /i.test(t)&&/(^|,)ph(,|$)/.test((np.used[np.used.length-1]||{}).pos||"");
        if(!pw&&!isPlaceNP(np)&&!box)return null;   // "in love", "in a hurry": not a place, not built
        if(box){const live=S.an||S.omit&&S.omit!=="it",be=(live?"い":"あり")+(neg?"ません":past?"ました":"ます");return{chunks:[...np.chunks,C("の"),C("中","なか"),C("に"),C(be)],used:np.used}}
        const live=S.an||S.omit&&S.omit!=="it",be=(live?"い":"あり")+(neg?"ません":past?"ました":"ます");
        const head=here?[C("この"),C(pw,pk)]:pw==="上"&&isBody(np)?np.chunks:pw?[...np.chunks,C("の"),C(pw,pk)]:np.chunks;
        const tail=exist?[C("に"),C(be)]:neg?[C(past?"じゃなかった":"じゃない"),C("です")]:[past?C("でした"):C("です")];
        return{chunks:[...head,...tail],used:here?[]:np.used};
      }
      // "I'm from America" -> アメリカから来ました ; "she is from Japan" -> 日本出身です
      if((m=/^from (.+)$/i.exec(t))){
        if(neg||past)return null;const np=NP(m[1]);if(!np||np.pron)return null;
        if(S.omit==="i"||S.omit==="we")return{chunks:[...np.chunks,C("から"),C("来ました","きました")],used:np.used};
        const o=byJP("出身","n");return o?{chunks:[...np.chunks,C(o.jp,o.kana),C("です")],used:[...np.used,o]}:null;
      }
    }
    if(PBLOCK.has(tl)||/^(in|on|at|under|near|next|behind|with|from|for|to|of|by|inside|outside|above|below|between|across)\b/i.test(t))return null;
    {const sp=!adv&&!mode&&/^the (most [a-z-]+|[a-z-]+est|worst)(?: ones?)?( ever| in the world| of all time| in history)?$/i.exec(t);
     if(sp&&isSup(sp[1])){
       const x=SUPX[sp[1].toLowerCase()];
       if(x){if(neg)return null;const w=byJP(x,"any");return w?{chunks:[C(w.jp,w.kana),past?C("でした"):C("です")],used:[w],desc:true}:null}
       const a=supl(sp[1],{thing:S.thing,an:S.an,ph:S.ph}),p=a&&!neg&&adjPred(a,false,past);if(!p)return null;
       return{chunks:[sp[2]?C("世界一","せかいいち"):C("一番","いちばん"),...p],used:[a],desc:true,sup:true,
         notes:[sp[2]?"世界一 (sekaiichi) = “the …-est in the world”. Japanese uses it for “…-est ever” too.":"一番 (ichiban) = “the most …”."]};
     }}
    const ingw=/^([a-z]+ing)\b/i.exec(t),ingAdj=ingw&&(PREF.adj[ingw[1].toLowerCase()]||window.PICKA&&window.PICKA[ingw[1].toLowerCase()]!=null);
    let a=ingw&&!ingAdj?null:word(t,"adj",{thing:S.thing&&!(S.chunks||[]).some(c=>/(員|者|人|さん|師|運転手|選手|歌手|官|先生|友達|母|父|兄|姉|弟|妹|上司|同僚|隣人|彼氏|彼女|夫|妻|息子|娘|子供|赤ちゃん)$/.test(c[0])),an:S.an||(S.chunks||[]).some(c=>/(員|者|人|さん|師|運転手|選手|歌手|官|先生|友達|母|父|兄|姉|弟|妹|上司|同僚|隣人|彼氏|彼女|夫|妻|息子|娘)$/.test(c[0])),ph:S.ph,place:(S.chunks||[]).some(c=>/^(部屋|家|外|中|教室|オフィス|会社|店|車|電車|ここ|そこ|台所|寝室|リビング|お風呂|建物|ホテル|図書館|体育館|駅|空港|学校|町|街|国|ジム|バス|教会|事務所|会議室|地下鉄|機内|飛行機)$/.test(c[0]))});
    if(a&&a.jp==="低い"&&/^(電池|バッテリー|充電)$/.test((S.used[S.used.length-1]||{}).jp)){const b=byJP("少ない","adj");if(b)a=b}   // battery is low: 少ない
    if(a){
      if(/^好き|^嫌い|^欲しい|^必要/.test(a.jp))return null;
      if(S.omit&&S.omit!=="it"){
        // "I am scary" is not "I am scared": 怖いです would be heard as the feeling. Same for boring, embarrassing, fun, gross.
        if(FEEL.has(a.jp)&&/^(scary|creepy|frightening|terrifying|boring|embarrassing|fun|gross|disgusting|painful|impossible|awkward)$/.test(tl))return null;
        // said about a person these mean something else: "I'm high" (not 高い), "I'm new here", "I'm close" (almost there)
        if(/^(high|low|close|new|early|same|secret|clear|enough|lots|few|possible|empty|hard|flat|square|transparent)$/.test(tl))return null;
      }
      let ch=[];
      if(adv==="too")mode="too";
      else if(adv&&neg&&/^(very|really|so|that)$/.test(adv))ch.push(C("あまり"));
      else if(adv&&/^(very|really|so|extremely|super)$/.test(adv))ch.push(C("とても"));
      else if(adv&&/^(a little|a bit|a little bit|slightly|kind of)$/.test(adv))ch.push(C("ちょっと"));
      else if(adv&&/^(pretty|quite)$/.test(adv))ch.push(C("けっこう"));
      else if(adv)return null;
      // "the moon looks big" -> 大きく見えます (size and colour are seen, not guessed)
      if(mode==="looks"&&!neg&&!ch.length&&/^(大きい|小さい|長い|短い|若い|古い|新しい|遠い|近い|明るい|暗い|白い|黒い|赤い|青い|太い|細い|広い|狭い)$/.test(a.jp))
        return{chunks:[C(a.jp.slice(0,-1)+"く",a.kana.slice(0,-1)+"く"),C(past?"見えました":"見えます",past?"みえました":"みえます")],used:[a]};
      // "my favorite color is blue" -> 青です (a colour name)
      if(/色$/.test((S.used[S.used.length-1]||{}).jp||"")&&/^(青い|赤い|白い|黒い|黄色い|茶色い)$/.test(a.jp)&&!ch.length)return{chunks:[C(a.jp.slice(0,-1),a.kana.slice(0,-1)),past?C("でした"):C("です")],used:[a]};
      if(a.jp==="古い"&&(S.an||S.omit))return null;   // people get old (年を取る), they are not 古い
      const p=adjPred(a,neg,past,mode);if(!p)return null;
      if(/^(高い|低い)$/.test(a.jp)&&/\b(tall|short|taller|shorter)\b/i.test(t)&&(S.an||S.omit&&S.omit!=="it"||S.used&&S.used.length&&S.used[S.used.length-1].kana==null||/^(彼|彼女|彼ら)$/.test(((S.chunks||[])[0]||[])[0]||""))){const k=p.findIndex(c=>/^(高|低)/.test(c[0]));if(k>=0)p.splice(k,0,C("背","せ"),C("が"))}   // "he is tall" -> 背が高い
      return{chunks:[...ch,...p],used:[a],desc:!FEEL.has(a.jp)};
    }
    if(adv||mode)return null;
    if(/^[a-z]+ing\b/i.test(t)){const vp=VP(t);
      if(vp&&vp.ing&&!neg&&!past){
        if(vp.me&&vp.v.kana!=="ついてくる"){   // "the dinosaur is chasing me" -> 恐竜に追いかけられています
          if(!/(^|,)vt/.test(vp.v.pos)||/(^|,)vs(,|$)/.test(vp.v.pos)||vp.pre.some(ch=>ch[0]==="を")||!S.chunks.length||S.pron&&!/^(he|she)$/.test(S.pron))return null;
          const e=vend(vp.v,"ukemiteiru");return e?{chunks:[...vp.pre,...e],used:vp.used,agent:true,notes:["Japanese says this as “I am being … by …” rather than using a word for “me”."]}:null}
        const plan=/^(今夜|明日|来週|来月|来年|今週末|週末|後で|今度)/.test((T[0]||[])[0]||"");
        if(vp.v.jp==="歌う"&&/(^|,)ani(,|$)/.test((S.used&&S.used[S.used.length-1]||{}).pos||"")){const w=byJP("鳴く","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}
        const e=vend(vp.v,/^(行く|来る|帰る|戻る|降りる|乗る|出る|出発|乗り換える|出かける|結婚|引っ越す|卒業|会う)$/.test(vp.v.jp)||/^going to /i.test(t)||plan?"masu":"teiru");if(e)return{chunks:[...vp.pre,...e],used:vp.used,ga:true}}
      return null}
    const np=NP(t);if(!np||np.pron==="i")return null;
    if(np.chunks.some(c=>c[1]==null)&&!/[A-Z]/.test(t))return null;
    return{chunks:[...np.chunks,...(neg?[C(past?"じゃなかった":"じゃない"),C("です")]:[past?C("でした"):C("です")])],used:np.used,desc:!!np.desc,notes:np.notes,np:true};
  };
  let m;
  // --- everyday phrases with a fixed Japanese form, and shapes built around one thing ---
  const fx=(ch,used,notes)=>{const r=out0(ch,used||[],notes||[]);if(r)r.fixed=true;return r};
  const WHO={you:C("あなた","あなた"),him:C("彼","かれ"),her:C("彼女","かのじょ"),me:C("私","わたし"),them:C("彼ら","かれら"),us:C("私たち","わたしたち"),he:C("彼","かれ"),she:C("彼女","かのじょ")};
  const who=t=>{const k=t.toLowerCase();if(WHO[k])return{chunks:[WHO[k]],used:[]};const np=NP(t);return np&&!np.pron?{chunks:dropMy(np.chunks),used:np.used}:null};
  const DESU=C("です"),KUDASAI=C("ください");
  const PH=[
    [/^(?:i|we) (?:stayed|are staying|'re staying|will stay|'ll stay|am staying|'m staying) (?:in|at) (.+?) for (one|a|two|three|four|five|six|seven|\d+) nights?$/i,m=>{const P=NP(m[1]);if(!P||P.pron)return null;const n=/^(a|one)$/i.test(m[2])?1:enNum(m[2]);if(!(n>=1&&n<=10))return null;const past=/stayed/i.test(m[0]);
      const H=["","一泊","二泊","三泊","四泊","五泊","六泊","七泊","八泊","九泊","十泊"],HK=["","いっぱく","にはく","さんぱく","よんはく","ごはく","ろっぱく","ななはく","はっぱく","きゅうはく","じゅっぱく"];return fx([...P.chunks,C("に"),C(H[n],HK[n]),C(past?"しました":"します")],P.used)}],
    [/^(?:the |a |this |that |next |last )?(?:train|bus|flight|ferry|boat|shinkansen|bullet train|plane) (?:to|for|going to|bound for) (.+)$/i,m=>{const np=NP(m[0]);if(!np)return null;return fx(np.chunks,np.used)}],
    [/^(the (?:guy|man|woman|lady|girl|boy|kid|person|people) (?:who was |who were )?sitting (?:next to|behind|in front of) (?:me|us)(?: on the (?:plane|train|bus|flight))?) (.+)$/i,m=>{const np=NP(m[1]);if(!np)return null;const vp=VP(m[2]);if(!vp||vp.ing)return null;const st=vstems(vp.v);const whole=T.some(c=>/ずっと|中$/.test(c[0]));
      const e=whole&&st&&st.te?[C(st.te[0],st.te[1]),C("いました")]:vend(vp.v,vp.past||/ed\b/i.test(m[2])?"mashita":"masu");if(!e)return null;const tt=T;T=[];return fx([...np.chunks,GA,...tt,...vp.pre,...e],[...np.used,...vp.used])}],
    [/^(.+?),? after ([a-z]+ing\b.*)$/i,m=>{if(/^(i|we|he|she|they|you|my [a-z]+)$/i.test(m[1])||/\b(hurts?|hurting|sick|tired|full|feel|feels|sore|ache|aches)\b/i.test(m[1]))return null;const vp=vpIng(m[2]);if(!vp)return null;const t=vplain(vp.v,"ta");if(!t)return null;let r=null;try{r=compose(m[1])}catch(e){}if(!r)return null;
      return fx([...dropMy(vp.pre),...t,C("後","あと"),CM,...r.chunks],[...vp.used,...(r.used||[])])}],
    [/^(.+?),? before ([a-z]+ing\b.*)$/i,m=>{if(/^(i|we|he|she|they|you|my [a-z]+)$/i.test(m[1]))return null;const vp=vpIng(m[2]);if(!vp)return null;const d=vplain(vp.v,"dict");if(!d)return null;let r=null;try{r=compose(m[1])}catch(e){}if(!r)return null;
      return fx([...dropMy(vp.pre),...d,C("前に","まえに"),CM,...r.chunks],[...vp.used,...(r.used||[])])}],
    [/^(?:i|we) (?:don't|do not) know where(?: to go)?$/i,m=>fx([C("どこ"),GA,C("いい"),C("か"),C("分かりません","わかりません")])],
    [/^(?:i|we) (?:didn't|did not|don't|do not) (?:really )?like (it|that|this|them|him|her) (at all|very much|much|that much)$/i,m=>{const past=/didn't|did not/i.test(m[0]);const all=/at all/i.test(m[2]);return fx([C(all?"全然":"あまり",all?"ぜんぜん":"あまり"),C("好きじゃ","すきじゃ"),C(past?"なかったです":"ないです")])}],
    [/^it (rained|snowed|was raining|was snowing)(?: all (day|weekend|week|night|morning))?$/i,m=>{const sn=/snow/i.test(m[1]);const k=(m[2]||"").toLowerCase();const tt=k?[C(k==="day"?"一日中":k==="weekend"?"週末ずっと":k==="week"?"一週間ずっと":k==="night"?"一晩中":"朝からずっと",k==="day"?"いちにちじゅう":k==="weekend"?"しゅうまつずっと":k==="week"?"いっしゅうかんずっと":k==="night"?"ひとばんじゅう":"あさからずっと")]:T.some(c=>/ずっと|中$/.test(c[0]))?T:[];if(!tt.length)return null;T=[];
      return fx([...tt,C(sn?"雪":"雨",sn?"ゆき":"あめ"),C("でした")])}],
    [/^(?:i|we) asked (?:the )?(waiter|waitress|staff|him|her|them|bartender|server) for no (ice|sugar|onions?|salt|sauce|mayo|mayonnaise|wasabi|cheese|meat|spice)$/i,m=>{const W=/^(him|her|them)$/i.test(m[1])?[PJ[m[1].toLowerCase()]]:[C("店員さん","てんいんさん")];const np=NP(m[2]);if(!np)return null;return fx([...W,C("に"),...np.chunks,C("なし"),C("で"),C("と"),C("お願いしました","おねがいしました")],np.used)}],
    [/^(?:but )?(he|she|they) brought (?:it|them|mine) with (ice|sugar|onions?|sauce|cheese|wasabi) anyway$/i,m=>{const np=NP(m[2]);if(!np)return null;return fx([C("結局","けっきょく"),...np.chunks,C("入り","いり"),C("で"),C("持ってきました","もってきました")],np.used)}],
    [/^(?:i|we) keep getting lost(?: in (.+))?$/i,m=>{let P=null;if(m[1]){P=NP(m[1]);if(!P||P.pron)return null}return fx([...(P?[...P.chunks,C("で")]:[]),C("何度も","なんども"),C("道","みち"),C("に"),C("迷います","まよいます")],P?P.used:[])}],
    [/^(?:it's|it is|this is|that's|that is|it was|this was) (?:so |really |very |super |a little |kind of )?(confusing|complicated)$/i,m=>{const past=/was/i.test(m[0]);const adv=/so|really|very|super/i.test(m[0])?[C("とても")]:/a little|kind of/i.test(m[0])?[C("ちょっと")]:[];return fx([...adv,C(/complicated/i.test(m[1])?(past?"複雑でした":"複雑です"):(past?"分かりにくかったです":"分かりにくいです"),/complicated/i.test(m[1])?(past?"ふくざつでした":"ふくざつです"):(past?"わかりにくかったです":"わかりにくいです"))])}],
    [/^(?:i've been|i have been|i'm|i am|i was) (?:really |so )?craving (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const drink=/(^|,)(drink|bev)/.test((np.used[np.used.length-1]||{}).pos||"")||/(coffee|tea|beer|wine|soda|coke|juice|water|milk|sake)$/i.test(m[1]);
      return fx([...np.chunks,GA,C(drink?"飲みたくて":"食べたくて",drink?"のみたくて":"たべたくて"),C("たまりません")],np.used)}],
    [/^(?:it's|it is|this is|that's|he's|she's|they're|you're) (?:really |totally |seriously )?driving me (?:crazy|nuts|insane|mad)$/i,()=>fx([C("本当に","ほんとうに"),C("イライラ"),C("します")])],
    [/^(?:i'm|i am|i feel like i'm) (?:literally |slowly )?(?:losing my mind|going crazy|going insane)$/i,()=>fx([C("頭","あたま"),GA,C("おかしく"),C("なり"),C("そう"),DESU])],
    [/^(.+?) (had|has) (?:an? |some |a lot of |lots of |a really nice |a nice |a great |a big |a beautiful )?(onsen|hot spring|pool|gym|garden|view|balcony|bath|bathtub|spa|sauna|kitchen|parking lot|restaurant|bar|lounge|shop|rooftop)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const L=np.used[np.used.length-1]||{};if(!/(hotel|room|house|apartment|place|inn|ryokan|station|building|airport|restaurant|park|school)/i.test(m[1]))return null;const o=NP(m[3]);if(!o)return null;const past=/had/i.test(m[2]);
      return fx([...dropMy(np.chunks),C("に"),C("は"),...o.chunks,GA,C(past?"ありました":"あります")],[...np.used,...o.used])}],
    [/^(.+?) before (?:it|they|my visa|my passport|the ticket) (?:expires?|runs? out)$/i,m=>{let r=null;try{r=compose(m[1])}catch(e){}if(!r)return null;return fx([C("期限","きげん"),GA,C("切れる","きれる"),C("前に","まえに"),CM,...r.chunks],r.used||[])}],
    [/^(?:we're|we are|i'm|i am) (?:going to have|having|expecting) a baby$/i,()=>fx([C("赤ちゃん","あかちゃん"),GA,C("生まれる","うまれる"),C("予定","よてい"),DESU])],
    [/^(?:i|we) lost (?:my|our) voice(?: from (singing karaoke|singing|karaoke|yelling|screaming|cheering|shouting))?$/i,m=>{const k=(m[1]||"").toLowerCase();const pre=k?/karaoke/.test(k)?[C("カラオケ"),C("で"),C("歌いすぎて","うたいすぎて")]:/singing/.test(k)?[C("歌いすぎて","うたいすぎて")]:[C("叫びすぎて","さけびすぎて")]:[];return fx([...pre,C("声","こえ"),GA,C("かれました")])}],
    [/^(?:i|he|she|we) burned (?:my|his|her|our) (tongue|mouth|hand|finger|fingers)(?: on (?:the |my |some )?(.+))?$/i,m=>{let P=null;if(m[2]){P=NP(m[2]);if(!P||P.pron)return null}const N={tongue:["舌","した"],mouth:["口","くち"],hand:["手","て"],finger:["指","ゆび"],fingers:["指","ゆび"]}[m[1].toLowerCase()];
      return fx([...(P?[...P.chunks,C("で")]:[]),C(N[0],N[1]),O,C("やけど"),C("しました")],P?P.used:[])}],
    [/^(?:my|her|his) contacts? (?:lens )?(?:fell out|came out|popped out)$|^my contact lens (?:fell out|came out|popped out)$/i,()=>fx([C("コンタクト"),GA,C("外れました","はずれました")])],
    [/^(?:i|we|he|she|they) (?:got|were|was|are|is|'m|'re) (?:stuck|trapped) in (?:the |an |a )?(elevator|lift|room|bathroom|toilet|car)$/i,m=>{const N={elevator:["エレベーター"],lift:["エレベーター"],room:["部屋","へや"],bathroom:["トイレ"],toilet:["トイレ"],car:["車","くるま"]}[m[1].toLowerCase()];const now=/ (are|is|'m|'re) /i.test(m[0]);
      return fx([C(N[0],N[1]||N[0]),C("に"),C(now?"閉じ込められています":"閉じ込められました",now?"とじこめられています":"とじこめられました")])}],
    [/^they(?:'re| are) building (?:a )?(?:new )?(.+?)(?: (near|next to|in front of) (?:my|our|the) ([a-z]+))?$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;let P=null;if(m[3]){const q2=NP(m[3]);if(!q2)return null;P=[...q2.chunks,C("の"),C(/near/i.test(m[2])?"近く":/next/i.test(m[2])?"隣":"前",/near/i.test(m[2])?"ちかく":/next/i.test(m[2])?"となり":"まえ"),C("に")]}
      return fx([...(P||[]),...(/new/i.test(m[0])?[C("新しい","あたらしい")]:[]),...np.chunks,GA,C("建設中","けんせつちゅう"),DESU],np.used)}],
    [/^can we meet(?: up)? (.+)$/i,m=>{const vp=VP("meet "+m[1]);if(!vp||vp.past||vp.ing||vp.v.jp!=="会う")return null;return fx([...vp.pre,C("会えますか","あえますか")],vp.used)}],
    [/^(?:i'm|i am|we're|we are) (so|really|very|truly|terribly|deeply|super|extremely) sorry$/i,m=>fx([C(/truly|terribly|deeply|extremely/i.test(m[1])?"大変":"本当に",/truly|terribly|deeply|extremely/i.test(m[1])?"たいへん":"ほんとうに"),C(/truly|terribly|deeply|extremely/i.test(m[1])?"申し訳ありません":"すみません",/truly|terribly|deeply|extremely/i.test(m[1])?"もうしわけありません":"すみません")])],
    [/^where are you(?: now| right now)?$/i,()=>fx([...(T.length?[]:[]),C("どこ"),C("に"),C("いますか")])],
    [/^(?:i'm|i am) (?:going to (?:go to )?|gonna (?:go to )?|off to |heading to )(bed|sleep)(?: now)?$/i,()=>{const now=/\bnow\b/i.test(s0)||T.some(c=>/^今/.test(c[0]));T=T.filter(c=>!/^今/.test(c[0]));return fx([...(now?[C("もう")]:[]),C("寝ます","ねます")])}],
    [/^(?:i|we) (?:was|were) (?:at|in) (work|school|class|home|the office|the hospital|the library|meetings?)(?: all day)?$/i,m=>{const k=m[1].toLowerCase();const allday=T.some(c=>c[0]==="一日中")||/all day/i.test(m[0]);if(!allday)return null;T=[];
      if(/home/.test(k))return fx([C("一日中","いちにちじゅう"),C("家","いえ"),C("に"),C("いました")]);const W={work:["仕事","しごと"],"the office":["仕事","しごと"],school:["学校","がっこう"],class:["授業","じゅぎょう"],"the hospital":["病院","びょういん"],"the library":["図書館","としょかん"],meeting:["会議","かいぎ"],meetings:["会議","かいぎ"]}[k];
      return fx([C("一日中","いちにちじゅう"),C(W[0],W[1]),...(/hospital|library/.test(k)?[C("に"),C("いました")]:[C("でした")])])}],
    [/^(?:i'll|i will|i'm going to|we'll|we will) be (?:about |around |maybe |like )?(five|ten|fifteen|twenty|thirty|forty|forty-five|\d+) (minutes?|mins?|hours?) late$/i,m=>{const d=duration(m[1],/^h/i.test(m[2])?"hours":"minutes");if(!d)return null;const ab=/about|around|maybe|like/i.test(m[0]);return fx([d,...(ab?[C("くらい")]:[]),C("遅れます","おくれます")])}],
    [/^(?:it|my [a-z]+|the [a-z]+) (?:already )?(?:broke|stopped working)$/i,m=>{const already=/already/i.test(m[0])||T.some(c=>c[0]==="もう");T=T.filter(c=>c[0]!=="もう");const np=/^it /i.test(m[0])?null:NP(m[0].split(" ").slice(0,2).join(" ").replace(/^(my|the) /i,""));
      return fx([...(np&&!np.pron?[...np.chunks,GA]:[]),...(already?[C("もう")]:[]),C(/stopped|died/i.test(m[0])?"動かなくなりました":"壊れました",/stopped|died/i.test(m[0])?"うごかなくなりました":"こわれました")],np?np.used:[])}],
    [/^(?:i|we) (?:don't|do not) know which (?:one|place|temple|restaurant|hotel|shop|one to (?:choose|pick|go to))$/i,m=>{const pl=/place|temple|restaurant|hotel|shop|go to/i.test(m[0]);return fx([C(pl?"どこ":"どれ"),GA,C("いい"),C("か"),C("分かりません","わかりません")])}],
    [/^(?:sorry,? )?(?:i|we) (?:didn't|did not) (?:see|notice|read) your (message|text|email|call)$/i,m=>{const sorry=/^sorry/i.test(m[0]);const k=m[1].toLowerCase();const N=k==="call"?["電話","でんわ"]:k==="email"?["メール"]:["メッセージ"];return fx([C(N[0],N[1]||N[0]),C("に"),C(sorry?"気づかなくて":"気づきませんでした",sorry?"きづかなくて":"きづきませんでした"),...(sorry?[C("すみません")]:[])])}],
    [/^did you get (?:home|back|there|to the hotel) (?:safely|safe|ok|okay|alright|all right)$/i,m=>fx([C("無事","ぶじ"),C("に"),C(/home|back/i.test(m[0])?"帰れましたか":"着きましたか",/home|back/i.test(m[0])?"かえれましたか":"つきましたか")])],
    [/^(?:can|could) you (?:tell me|teach me) how to say (this|that|it|.+?) in japanese$/i,m=>{if(/^(this|that|it)$/i.test(m[1]))return fx([C("これ"),WA,C("日本語","にほんご"),C("で"),C("何と","なんと"),C("言いますか","いいますか")]);const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,WA,C("日本語","にほんご"),C("で"),C("何と","なんと"),C("言いますか","いいますか")],np.used)}],
    [/^(?:can|could) you send me (?:your|the) (location|address|pin|photos?|pictures?)$/i,m=>{const k=m[1].toLowerCase();const N=k==="location"||k==="pin"?["位置情報","いちじょうほう"]:k==="address"?["住所","じゅうしょ"]:["写真","しゃしん"];return fx([C(N[0],N[1]),O,C("送って","おくって"),C("もらえますか")])}],
    [/^(my [a-z]+|he|she|they|[A-Z][a-z]+) (?:is|are|will be|'s|'re) (?:coming|going to come) (?:to )?visit( me| us)?(?: in (.+))?$/i,m=>{const S=who(m[1]);if(!S)return null;let P=null;if(m[3]){P=NP(m[3]);if(!P||P.pron)return null}return fx([...dropMy(S.chunks),GA,...(P?[...P.chunks,C("に")]:[]),C(m[2]?"会いに":"遊びに",m[2]?"あいに":"あそびに"),C("来ます","きます")],[...S.used,...(P?P.used:[])])}],
    [/^(?:i|we) (?:want to|wanna|would love to|'d love to|would like to|'d like to) come back(?: here| again| here again| someday| sometime)?$/i,()=>fx([C("また"),C("来たい","きたい"),DESU])],
    [/^(?:the )?food (?:here )?(?:is|was) (?:so |really )?(amazing|incredible|awesome|the best)$/i,m=>{const here=/here/i.test(m[0]);const past=/was/i.test(m[0]);return fx([...(here?[C("ここ"),C("の")]:[]),C("料理","りょうり"),WA,C(/best|amazing|incredible|awesome/i.test(m[1])?"最高":"とてもおいしい",/best|amazing|incredible|awesome/i.test(m[1])?"さいこう":"とてもおいしい"),C(past?(/best|amazing|incredible|awesome/i.test(m[1])?"でした":"かったです"):"です")].map(c=>c[0]==="とてもおいしい"&&past?C("とてもおいし","とてもおいし"):c))}],
    [/^can we meet(?: up)?$/i,()=>{if(!T.length)return null;return fx([C("会えますか","あえますか")])}],
    [/^(?:i|we) (?:got|was|were|have been|'ve been|get) (scolded|yelled at|told off|bitten|stung|chased|attacked|praised|invited|asked|laughed at|robbed|followed|hit|pushed|stepped on|fired|dumped|ignored|cheated on|lied to|tricked|kicked|bullied|called|woken up|interrupted) by (.+)$/i,m=>{const k=m[1].toLowerCase();const W=/^(my [a-z]+|he|she|they|him|her|them|[A-Z][a-z]+|someone|a stranger|a dog|a cat|a bee|a mosquito|the [a-z]+|my [a-z]+ [a-z]+)$/i.test(m[2])?(/^(him|her|them|he|she|they)$/i.test(m[2])?{chunks:[PJ[m[2].toLowerCase().replace(/^he$/,"him").replace(/^she$/,"her").replace(/^they$/,"them")]],used:[]}:/^someone$/i.test(m[2])?{chunks:[C("誰か","だれか")],used:[]}:/^a stranger$/i.test(m[2])?{chunks:[C("知らない人","しらないひと")],used:[]}:who(m[2].replace(/^(a|the) /i,""))):null;if(!W)return null;
      const P={scolded:["怒られました","おこられました"],"yelled at":["怒鳴られました","どなられました"],"told off":["怒られました","おこられました"],bitten:["噛まれました","かまれました"],stung:["刺されました","さされました"],chased:["追いかけられました","おいかけられました"],attacked:["襲われました","おそわれました"],praised:["褒められました","ほめられました"],invited:["誘われました","さそわれました"],asked:["聞かれました","きかれました"],"laughed at":["笑われました","わらわれました"],robbed:["強盗に遭いました","ごうとうにあいました"],followed:["つけられました","つけられました"],hit:["殴られました","なぐられました"],pushed:["押されました","おされました"],"stepped on":["踏まれました","ふまれました"],fired:["クビにされました","くびにされました"],dumped:["振られました","ふられました"],ignored:["無視されました","むしされました"],"cheated on":["浮気されました","うわきされました"],"lied to":["嘘をつかれました","うそをつかれました"],tricked:["だまされました","だまされました"],kicked:["蹴られました","けられました"],bullied:["いじめられました","いじめられました"],called:["呼ばれました","よばれました"],"woken up":["起こされました","おこされました"],interrupted:["邪魔されました","じゃまされました"]}[k];
      if(k==="robbed")return null;return fx([...dropMy(W.chunks),C("に"),C(P[0],P[1])],W.used)}],
    [/^(?:i'd|i would|we'd|we would) rather (.+?) than (.+)$/i,m=>{const a=VP(m[1]),b=VP(m[2]);const sa=a&&!a.past&&!a.ing&&vstems(a.v),db=b&&!b.past&&!b.ing&&vplain(b.v,"dict");if(!sa||!sa.i||!db)return null;
      return fx([...dropMy(b.pre),...db,C("より"),CM,...dropMy(a.pre),C(sa.i[0]+"たい",sa.i[1]+"たい"),DESU],[...a.used,...b.used])}],
    [/^(?:even though|although|though) (.+)$/i,m=>{const w=m[1].replace(/,/g," ,").split(/\s+/);for(let i=2;i<w.length-1;i++){if(!/^(,|i|we|you|he|she|they|it|my|the|i'm|we're|it's)$/i.test(w[i]))continue;const A0=w.slice(0,i).join(" ").replace(/ ,$/,""),B0=w.slice(i).join(" ").replace(/^, ?/,"");let ra=null,rb=null;try{ra=compose(A0);rb=ra&&compose(B0)}catch(e){}const p=ra&&toPlain(ra.chunks);
      if(p&&rb){const L=p[p.length-1];const p2=L&&L[0]==="だ"?[...p.slice(0,-1),C("な")]:p;return fx([...p2,C("のに"),CM,...rb.chunks],[...(ra.used||[]),...(rb.used||[])])}}return null}],
    [/^unless (it|you|we|i|he|she|they) (rains?|snows?|hurry|hurries|leave now|study|studies|ask|asks|call|calls|tell me|come|comes)(?: (?:soon|now|tomorrow))?,? (.+)$/i,m=>{const k=m[2].toLowerCase().replace(/s$/,"").replace(/ie$/,"y");const N={rain:["雨が降らなければ","あめがふらなければ"],snow:["雪が降らなければ","ゆきがふらなければ"],hurry:["急がなければ","いそがなければ"],"leave now":["今出なければ","いまでなければ"],study:["勉強しなければ","べんきょうしなければ"],ask:["聞かなければ","きかなければ"],call:["電話しなければ","でんわしなければ"],"tell me":["言ってくれなければ","いってくれなければ"],come:["来なければ","こなければ"]}[k];if(!N)return null;
      let r=null;try{r=compose(m[3])}catch(e){}if(!r)return null;return fx([C(N[0],N[1]),CM,...r.chunks],r.used||[])}],
    [/^(.+?),? unless (it) (rains?|snows?)$/i,m=>{let r=null;try{r=compose(m[1])}catch(e){}if(!r)return null;const sn=/snow/i.test(m[3]);return fx([C(sn?"雪が降らなければ":"雨が降らなければ",sn?"ゆきがふらなければ":"あめがふらなければ"),CM,...r.chunks],r.used||[])}],
    [/^(?:the |that |this |my )?(.+?) (?:is|are) (?:gone|not there anymore|not here anymore|no longer there)(?: now)?$/i,m=>{if(/\b(cold|flu|fever|headache|pain|rash|cough|itch|hangover|stomachache|toothache|backache|sore throat|nausea|money|time|pain)$/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;const per=np.used.some(u=>/(^|,)an(,|$)/.test(u.pos||""));return fx([...dropMy(np.chunks),WA,C("もう"),C(per?"いません":"ありません")],np.used)}],
    [/^nothing is impossible$/i,()=>fx([C("不可能","ふかのう"),C("な"),C("こと"),WA,C("ありません")])],
    [/^whoever (finishes|gets there|arrives|answers|eats it|does it) first (wins|gets it|pays)$/i,m=>{const V={finishes:["終わった","おわった"],"gets there":["着いた","ついた"],arrives:["着いた","ついた"],answers:["答えた","こたえた"],"eats it":["食べた","たべた"],"does it":["やった","やった"]}[m[1].toLowerCase()];const E=/wins/i.test(m[2])?[C("の"),C("勝ち","かち"),DESU]:/pays/i.test(m[2])?[GA,C("払います","はらいます")]:[GA,C("もらえます")];
      return fx([C("最初","さいしょ"),C("に"),C(V[0],V[1]),C("人","ひと"),...E])}],
    [/^(?:i|we) (?:don't|do not) know (?:anyone|anybody) (here|in (?:this|the) (?:city|town|country|class|office|school)|in (.+))$/i,m=>{let P;if(/^here$/i.test(m[1]))P=[C("ここ")];else if(m[2]){const np=NP(m[2]);if(!np||np.pron)return null;P=np.chunks}else P=[C(/city|town/i.test(m[1])?"この街":/country/i.test(m[1])?"この国":/class/i.test(m[1])?"このクラス":/office/i.test(m[1])?"この会社":"この学校",/city|town/i.test(m[1])?"このまち":/country/i.test(m[1])?"このくに":/class/i.test(m[1])?"このくらす":/office/i.test(m[1])?"このかいしゃ":"このがっこう")];
      return fx([...P,C("に"),C("は"),C("知り合い","しりあい"),GA,C("いません")])}],
    [/^there(?:'s| is) nothing to (do|eat|see|buy|drink|watch)(?: (?:in|at) (?:this |the |my )?(.+)| here)?$/i,m=>{let P=null;if(m[2]){const np=NP(m[2]);if(!np||np.pron)return null;P=[...(/^(town|city|place|house|hotel|area|village)$/i.test(m[2])?[C("この")]:[]),...np.chunks]}else if(/ here$/i.test(m[0]))P=[C("ここ")];
      const V={do:["する","する"],eat:["食べる","たべる"],see:["見る","みる"],buy:["買う","かう"],drink:["飲む","のむ"],watch:["見る","みる"]}[m[1].toLowerCase()];const N=m[1].toLowerCase()==="do"?"こと":m[1].toLowerCase()==="see"?"所":"もの";
      return fx([...(P?[...P,C("に"),C("は")]:[]),C("何も","なにも"),C(V[0],V[1]),C(N,N==="所"?"ところ":N),GA,C("ありません")])}],
    [/^both of (them|us|you) (?:are|were) (?:(my|our|your) )?([a-z]+(?: [a-z]+)?)$/i,m=>{const np=NP(m[3]);if(np&&!np.pron&&!PREF.adj[m[3].toLowerCase()])return fx([C("二人","ふたり"),C("とも"),...(m[2]?[C(/your/i.test(m[2])?"あなた":"私","わたし"),C("の")]:[]),...np.chunks,C(/were/i.test(m[0])?"でした":"です")],np.used);return null}],
    [/^both of (them|us|you) (?:are|were) (.+)$/i,m=>{let r=null;try{r=compose("they are "+m[2])}catch(e){}if(!r)return null;const ch=r.chunks.filter((c,i,a)=>!(c[0]==="彼ら"&&/^(は|が)$/.test((a[i+1]||[])[0]||""))&&!(/^(は|が)$/.test(c[0])&&(a[i-1]||[])[0]==="彼ら"));
      return fx([C("二人","ふたり"),C("とも"),...dropMy(ch).map(c=>c[0]==="私の"?C("私","わたし"):c)],r.used||[])}],
    [/^neither of (us|them) (?:knows how to|know how to|can|could) (.+)$/i,m=>{const vp=VP(m[2]);let e=vp&&!vp.past&&vend(vp.v,"potneg");if(!e)return null;if(e.length===1&&/(^|,)vs(,|$)/.test(vp.v.pos||"")&&e[0][0]===vp.v.jp+"できません")e=[C(vp.v.jp,vp.v.kana),C("が"),C("できません")];let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];
      return fx([C("二人","ふたり"),C("とも"),...pre,...e],vp.used)}],
    [/^(everyone|everybody|they|he|she|my [a-z]+|the (?:people|staff|locals|waiter|waitress|driver)) (?:was|were|is|are|has been|have been) (?:really |so |very |super )?(nice|kind|friendly|helpful|good|sweet|mean|rude|cold) to (me|us)$/i,m=>{const k=m[1].toLowerCase();const S=/^every/.test(k)?{chunks:[C("みんな")],used:[]}:/^the /.test(k)?(()=>{const n=NP(k.slice(4));return n&&!n.pron?n:null})():who(m[1]);if(!S)return null;const adv=/really|so|very|super/i.test(m[0])?[C("とても")]:[];const past=/was|were|has been|have been/i.test(m[0]);const a=m[2].toLowerCase();
      if(/^(mean|rude|cold)$/.test(a))return fx([...dropMy(S.chunks),WA,C("私","わたし"),C("に"),...adv,C(a==="cold"?"冷たかった":"意地悪でした",a==="cold"?"つめたかった":"いじわるでした"),...(a==="cold"?[DESU]:[])].filter(Boolean),S.used);
      return fx([...dropMy(S.chunks),WA,...adv,C(/helpful/i.test(a)?"助けて":"親切に",/helpful/i.test(a)?"たすけて":"しんせつに"),C(/helpful/i.test(a)?"くれました":"してくれました")],S.used)}],
    [/^(?:the |my |this )?(book|books|library book|dvd|rental) (?:i borrowed (?:from the library )?)?(?:is|are) overdue$/i,()=>fx([C("返却期限","へんきゃくきげん"),GA,C("過ぎています","すぎています")])],
    [/^(?:i )?feel like (?:i'm|i am) (?:getting|coming down with) (?:sick|a cold|ill)$/i,()=>fx([C("風邪","かぜ"),O,C("ひき"),C("そう"),DESU])],
    [/^(?:we|we've|we have|we've been|we have been) (?:known each other|been friends) (?:since (?:we were )?(elementary school|middle school|junior high|high school|college|university|kids|children|we were kids|we were little|childhood)|for (two|three|four|five|six|seven|eight|nine|ten|twenty|\d+|many|a few) years)$/i,m=>{
      if(m[1]){const k=m[1].toLowerCase();const W={"elementary school":["小学校","しょうがっこう"],"middle school":["中学校","ちゅうがっこう"],"junior high":["中学校","ちゅうがっこう"],"high school":["高校","こうこう"],college:["大学","だいがく"],university:["大学","だいがく"],kids:["子供の頃","こどものころ"],children:["子供の頃","こどものころ"],"we were kids":["子供の頃","こどものころ"],"we were little":["子供の頃","こどものころ"],childhood:["子供の頃","こどものころ"]}[k];
        return fx([C("私たち","わたしたち"),WA,C(W[0],W[1]),C("から"),C("の"),C(/friends/i.test(m[0])?"友達":"知り合い",/friends/i.test(m[0])?"ともだち":"しりあい"),DESU])}
      const n=/^many$/i.test(m[2])?null:/^a few$/i.test(m[2])?null:enNum(m[2]);const Y=n?C((n<=10?KJ[n]:n)+"年","ねん"):C(/many/i.test(m[2])?"何年も":"数年",/many/i.test(m[2])?"なんねんも":"すうねん");
      return fx([C("知り合って","しりあって"),Y,...(n?[C("に"),C("なります")]:[C("になります")])])}],
    [/^(?:could|can) you (?:please )?(?:lower the price|give me a discount|make it cheaper|go a little lower|do a better price)(?: a little| a bit)?$/i,m=>fx([...(/little|bit/i.test(m[0])?[C("少し","すこし")]:[]),C("安く","やすく"),C("して"),C("もらえますか")])],
    [/^(?:the )?battery (?:on|of|in) (?:my |the )?(.+?) (?:dies|runs out|drains|goes dead) (?:really |so |too |very )?(?:fast|quickly|quick)$|^my (.+?)(?:'s)? battery (?:dies|runs out|drains) (?:really |so |too |very )?(?:fast|quickly|quick)$/i,m=>{const np=NP(m[1]||m[2]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),C("の"),C("電池","でんち"),GA,C("すぐ"),C("切れます","きれます")],np.used)}],
    [/^it(?:'s| has| is) been (?:a while|a long time|ages|so long|forever) since (?:i've|i have|i|we've|we have|we) (?:been|came|come) (here|to (.+))$/i,m=>{let P=null;if(m[2]){P=NP(m[2]);if(!P||P.pron)return null}return fx([...(P?P.chunks:[C("ここ")]),C("に"),C("来る","くる"),C("の"),WA,C("久しぶり","ひさしぶり"),DESU],P?P.used:[])}],
    [/^(?:can|could) you (?:please )?recommend (?:me )?(?:a |an |some |any |a good |some good |any good )?(.+?)$/i,m=>{if(/^(something|anything|one|it|that|this|someone|somebody)\b/i.test(m[1]))return null;if(/\b(to|for|where|place|places|that i|which)\b/i.test(m[1])&&!/\b(that's|that is|that are)\b/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;const good=/\bgood\b/i.test(m[0]);
      const plain=np.chunks.length===1;return fx([...(plain?[C(good?"おすすめの":"おすすめの")]:[]),...np.chunks,O,C("教えて","おしえて"),C("もらえますか")],np.used)}],
    [/^(?:what time|when) (?:do|should|must) (?:i|we) (?:have to |need to )?check (out|in)$/i,m=>fx([C(/out/i.test(m[1])?"チェックアウト":"チェックイン"),WA,C("何時","なんじ"),C("ですか")])],
    [/^(?:can|could|may) (?:i|we) (?:leave|keep|store) (?:my |our |the )?(bags?|luggage|suitcases?|backpacks?)(?: here)?$/i,m=>fx([C("荷物","にもつ"),O,C("預かって","あずかって"),C("もらえますか")])],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+|my [a-z]+ and i) (?:is|are) (?:very |really |severely )?allergic to (.+)$/i,m=>{const S=who(m[1]);if(!S)return null;const np=NP(m[2]);if(!np||np.pron)return null;return fx([...dropMy(S.chunks),WA,...np.chunks,C("アレルギー"),GA,C("あります")],[...S.used,...np.used])}],
    [/^(?:i )?(?:really )?hope (?:to see you|we (?:can )?(?:see each other|meet)|we meet|we can meet)(?: (again|soon|again soon))?$/i,m=>!m[1]&&!T.length?null:(T=[],fx([C("また"),C("会える","あえる"),C("と"),C("いいですね")]))],
    [/^is (breakfast|dinner|lunch|tax|service|wifi|parking|the tip) included(?: in (?:the )?(?:price|room|bill|rate|fee|plan))?$/i,m=>{const W={breakfast:["朝ご飯","あさごはん"],dinner:["晩ご飯","ばんごはん"],lunch:["お昼","おひる"],tax:["税金","ぜいきん"],service:["サービス料","さーびすりょう"],wifi:["ワイファイ"],parking:["駐車場","ちゅうしゃじょう"],"the tip":["チップ"]}[m[1].toLowerCase()];const pr=/ in /i.test(m[0]);
      if(/^tax$/i.test(m[1]))return fx([C("税込み","ぜいこみ"),C("ですか")]);if(/^(service|the tip)$/i.test(m[1]))return fx([C(W[0],W[1]||W[0]),WA,C("含まれていますか","ふくまれていますか")]);return fx([...(pr?[C("料金","りょうきん"),C("に"),C(W[0],W[1]||W[0]),WA,C("含まれていますか","ふくまれていますか")]:[C(W[0],W[1]||W[0]),WA,C("付いていますか","ついていますか")])])}],
    [/^(?:the |my |our |your |his |her )?([a-z]+(?: [a-z]+)?) (?:is|'s|will be|was)$/i,m=>{if(!T.length||/^(it|this|that|he|she|there|what|who|where|when)$/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;const tt=T.filter((c,i)=>!(i===T.length-1&&c[0]==="に"));T=[];const past=/ was$/i.test(m[0]);
      return fx([...dropMy(np.chunks),WA,...tt,C(past?"でした":"です")],np.used)}],
    [/^are you (free|busy|available|around|home|off|working)$/i,m=>{if(!T.length)return null;const tt=T.filter((c,i)=>!(i===T.length-1&&c[0]==="に"));T=[];const k=m[1].toLowerCase();
      const E={free:[C("暇","ひま"),C("ですか")],available:[C("空いて","あいて"),C("いますか")],busy:[C("忙しい","いそがしい"),C("ですか")],around:[C("いますか")],home:[C("家","いえ"),C("に"),C("いますか")],off:[C("休み","やすみ"),C("ですか")],working:[C("仕事","しごと"),C("ですか")]}[k];
      return fx([...tt,WA,...E])}],
    [/^do you think (?:that )?(.+)$/i,m=>{if(/^(so|i|you)$/i.test(m[1]))return null;let r=null;try{r=compose(m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([...p,C("と"),C("思いますか","おもいますか")],r.used||[])}],
    [/^how (?:was|is) (?:your|the) (trip|vacation|holiday|flight|stay|honeymoon)(?: (?:to|in) (.+))?$/i,m=>{let P=null;if(m[2]){P=NP(m[2]);if(!P||P.pron)return null}const k=m[1].toLowerCase();const W={trip:["旅行","りょこう"],vacation:["旅行","りょこう"],holiday:["休暇","きゅうか"],flight:["フライト"],stay:["滞在","たいざい"],honeymoon:["新婚旅行","しんこんりょこう"]}[k];
      return fx([...(P?[...P.chunks,...(k==="trip"||k==="vacation"?[]:[C("の")])]:[]),C(W[0],W[1]||W[0]),WA,C("どう"),C(/is/i.test(m[0].split(" ")[1])?"ですか":"でしたか")],P?P.used:[])}],
    [/^(?:i'm|i am|we're|we are) so hungry (?:that )?(?:i|we) could eat a horse$/i,()=>fx([C("お腹","おなか"),GA,C("ペコペコ"),DESU])],
    [/^(?:the |that |this )?([a-z]+(?: [a-z]+)?) (was|is) (?:a little |pretty |kind of |kinda )?so-so$/i,m=>{const np=/^(it|that|this)$/i.test(m[1])?{chunks:[],used:[]}:NP(m[1]);if(!np||np.pron)return null;return fx([...(np.chunks.length?[...np.chunks,WA]:[]),C("まあまあ"),C(/was/i.test(m[2])?"でした":"です")],np.used)}],
    [/^(?:i was|i'm|i am) (?:too|so|really|just) lazy$/i,m=>fx([C(/was/i.test(m[0])?"面倒くさかった":"面倒くさい",/was/i.test(m[0])?"めんどうくさかった":"めんどうくさい"),DESU])],
    [/^(?:that's|that is|this is|it's|that was) (?:so |really |super )?(cool|awesome|amazing|great|neat)$/i,m=>fx([C("すごい"),C(/was/i.test(m[0])?"でしたね":"ですね")])],
    [/^(?:we|i|you) (?:should|need to|have to|had better|better) (.+?),? or (?:else )?(.+)$/i,m=>{const vp=VP(m[1]);const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st||!st.a)return null;let r=null;try{r=compose(m[2])}catch(e){}if(!r)return null;
      let pre=dropMy(vp.pre).map(c=>c[0]==="もうすぐ"?C("そろそろ"):c);return fx([...pre,C(st.a[0]+"ないと",st.a[1]&&st.a[1]+"ないと"),CM,...r.chunks,C("よ")],[...vp.used,...(r.used||[])])}],
    [/^i think (?:i'm|i am|i'll|i will) (?:going to |gonna )?(.+)$/i,m=>{if(/^(be|get|fall|die|lose|throw up|need|have to|miss|cry|faint|pass out|sneeze)\b/i.test(m[1]))return null;const vp=VP(m[1]);if(!vp||vp.past||vp.ing||vp.me)return null;const vo=volit(vp.v);if(!vo)return null;
      return fx([...dropMy(vp.pre),C(vo[0],vo[1]),C("と"),C("思います","おもいます")],vp.used)}],
    [/^(?:i was wondering|i wonder) if you (?:could|can|would) (.+)$/i,m=>{let r=null;try{r=compose1("could you "+m[1])}catch(e){}if(!r)return null;const ch=r.chunks.slice();const L=ch[ch.length-1];if(L&&L[0]==="もらえますか")ch[ch.length-1]=C("もらえませんか");return fx(ch,r.used,r.notes)}],
    [/^is it (?:possible|ok|okay) (?:for me )?to (.+)$/i,m=>{const vp=VP(m[1]);const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st)return null;const vs=/(^|,)vs(,|$)/.test(vp.v.pos||"");if(!st.pot&&!vs)return null;const pj=st.pot?st.pot[0]:vp.v.jp+"できる",pk=st.pot?st.pot[1]:vp.v.kana+"できる";if(!/る$/.test(pj))return null;
      return fx([...dropMy(vp.pre),C(pj.slice(0,-1)+"ますか",pk&&pk.slice(0,-1)+"ますか")],vp.used)}],
    [/^(?:could|can) you (?:please )?(?:tell me|let me know) when (?:we|i) (?:get|arrive|are|reach) (?:to |at |in )?(.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,C("に"),C("着いたら","ついたら"),C("教えて","おしえて"),C("もらえますか")],np.used)}],
    [/^(?:i )?(?:really |truly )?appreciate (?:everything|all) (?:that )?you(?:'ve| have)? (?:done|did) for (?:me|us)$/i,m=>fx([C("色々","いろいろ"),C("して"),C("くれて"),C(/really|truly/i.test(m[0])?"本当に":"","ほんとうに"),C("ありがとうございます")].filter(c=>c[0]))],
    [/^(?:i )?(?:really |truly )?appreciate (?:it|that|this)$/i,m=>fx([...(/really|truly/i.test(m[0])?[C("本当に","ほんとうに")]:[]),C("感謝","かんしゃ"),C("しています")])],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+|i|we) (?:lives?|lived) in (.+?) with (his|her|my|our|their) (wife|husband|family|parents|kids|children|girlfriend|boyfriend|partner|dog|cat|grandparents|roommate)(?: and (two|three|four|a|one) (kids|children|dogs|cats|sons|daughters))?$/i,m=>{const k=m[1].toLowerCase(),me=/^(i|we)$/.test(k);const S=me?null:who(m[1]);if(!me&&!S)return null;const P=NP(m[2]);if(!P||P.pron)return null;
      const own=/^(my|our)$/i.test(m[3]);const W={wife:own?["妻","つま"]:["奥さん","おくさん"],husband:own?["夫","おっと"]:["旦那さん","だんなさん"],family:["家族","かぞく"],parents:["両親","りょうしん"],kids:own?["子供","こども"]:["子供","こども"],children:["子供","こども"],girlfriend:["彼女","かのじょ"],boyfriend:["彼氏","かれし"],partner:["パートナー"],dog:["犬","いぬ"],cat:["猫","ねこ"],grandparents:["祖父母","そふぼ"],roommate:["ルームメイト"]}[m[4].toLowerCase()];
      let X=[C(W[0],W[1]||W[0])];if(m[5]){const n=/^(a|one)$/i.test(m[5])?1:enNum(m[5]);const N2={kids:["子供","こども"],children:["子供","こども"],dogs:["犬","いぬ"],cats:["猫","ねこ"],sons:["息子","むすこ"],daughters:["娘","むすめ"]}[m[6].toLowerCase()];const cnt=/kids|children|sons|daughters/i.test(m[6])?(n===1?["一人","ひとり"]:n===2?["二人","ふたり"]:[KJ[n]+"人",null]):[KJ[n]+"匹",null];X=[...X,C("と"),C(N2[0],N2[1]),C(cnt[0],cnt[1])]}
      const past=/lived/i.test(m[0]);return fx([...(S?[...dropMy(S.chunks),WA]:[]),...X,C("と"),...P.chunks,C("に"),C(past?"住んでいました":"住んでいます",past?"すんでいました":"すんでいます")],[...(S?S.used:[]),...P.used])}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+) used to make (this|that|it|these|those)(?: for (?:me|us))?$/i,m=>{const S=who(m[1]);if(!S)return null;return fx([...dropMy(S.chunks),GA,C("よく"),C(/^th(is|ese)$/i.test(m[2])?"これ":"それ"),O,C("作って","つくって"),C("くれました")],S.used)}],
    [/^i hope (you|he|she|they|my [a-z]+|[A-Z][a-z]+|your [a-z]+) (?:feels?|gets?) better(?: soon)?$/i,m=>{T=[];const k=m[1].toLowerCase();let S=[];if(k!=="you"){const a=/^(he|she|they)$/.test(k)?{chunks:[PJ[k]],used:[]}:/^your /.test(k)?(()=>{const n=NP(k.slice(5));return n&&!n.pron?{chunks:n.chunks,used:n.used}:null})():who(m[1]);if(!a)return null;S=[...dropMy(a.chunks),C("が")]}
      return fx([...S,C("早く","はやく"),C("良くなる","よくなる"),C("と"),C("いいですね")])}],
    [/^(?:i think )?you gave me the wrong (change|order|bill|food|drink|key|room|ticket|size)$/i,m=>{const W={change:["おつり"],order:["注文","ちゅうもん"],bill:["お会計","おかいけい"],food:["料理","りょうり"],drink:["飲み物","のみもの"],key:["鍵","かぎ"],room:["部屋","へや"],ticket:["チケット"],size:["サイズ"]}[m[1].toLowerCase()];const th=/^i think/i.test(m[0]);
      return fx([C(W[0],W[1]||W[0]),GA,C(th?"間違っている":"間違っています",th?"まちがっている":"まちがっています"),...(th?[C("と"),C("思います","おもいます")]:[])])}],
    [/^my favorite (thing|part|place) (?:about|in|of) (.+?) (?:is|was) (?:the |my |our )?(.+)$/i,m=>{const a=NP(m[2]),b=NP(m[3]);if(!a||!b||a.pron||b.pron)return null;const past=/ was /i.test(m[0]);const place=/place/i.test(m[1]);
      return fx([...a.chunks,C("で"),C("一番","いちばん"),C("好きな","すきな"),C(place?"場所":"ところ",place?"ばしょ":"ところ"),WA,...b.chunks,C(past?"でした":"です")],[...a.used,...b.used])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (?:haven't|hasn't|have not|has not|have never|has never|'ve never|never) been to (?:the )?(.+)$/i,m=>{const k=m[1].toLowerCase(),me=/^(i|we)$/.test(k),S=me?null:who(m[1]);if(!me&&!S)return null;const np=NP(m[2]);if(!np||np.pron)return null;
      return fx([...(S?[...dropMy(S.chunks),WA]:[]),...np.chunks,C("に"),C("行った","いった"),C("こと"),GA,C("ありません")],[...(S?S.used:[]),...np.used])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (?:haven't|hasn't|have not|has not) (talked|spoken)(?: (?:to|with) (each other|him|her|them|my [a-z]+|[A-Z][a-z]+))?$/i,m=>{const k=m[1].toLowerCase(),me=/^(i|we)$/.test(k),S=me?null:who(m[1]);if(!me&&!S)return null;let W=null;if(m[3]){const w=/^each other$/i.test(m[3])?{chunks:[],used:[]}:/^(him|her|them)$/i.test(m[3])?{chunks:[PJ[m[3].toLowerCase()]],used:[]}:who(m[3]);if(!w)return null;W=w.chunks.length?[...dropMy(w.chunks),C("と")]:[]}
      return fx([...(S?[...dropMy(S.chunks),WA]:[]),...(W||[]),C("話していません","はなしていません")],S?S.used:[])}],
    [/^(she|he|they|my [a-z]+|[A-Z][a-z]+|nobody|no one) (?:doesn't|don't|does not|do not|didn't|did not) (?:even )?care(?: about (.+))?$/i,m=>{const k=m[1].toLowerCase();const S=/^(nobody|no one)$/.test(k)?{chunks:[C("誰も","だれも")],used:[]}:who(m[1]);if(!S)return null;let ab=null;if(m[2]){const a=/^(me|us|it|that|this)$/i.test(m[2])?{chunks:[C(/^(me|us)$/i.test(m[2])?"私":"それ",/^(me|us)$/i.test(m[2])?"わたし":"それ"),...(/^(me|us)$/i.test(m[2])?[C("の"),C("こと")]:[])],used:[]}:NP(m[2]);if(!a||a.pron&&!/^(me|us|it|that|this)$/i.test(m[2]))return null;ab=[...a.chunks,O]}
      const past=/didn't|did not/i.test(m[0]);return fx([...dropMy(S.chunks),...(/^(nobody|no one)$/.test(k)?[]:[WA]),...(ab||[]),C(past?"気にしていませんでした":"気にしていません",past?"きにしていませんでした":"きにしていません")],S.used)}],
    [/^(?:i|we) (?:have|'ve got|have got|got) (?:so much|a lot of|too much|tons of|lots of|loads of) (work|homework|stuff|things) (?:to do)?$/i,m=>{const w=m[1].toLowerCase();return fx([C(w==="homework"?"宿題":w==="work"?"仕事":"やること",w==="homework"?"しゅくだい":w==="work"?"しごと":"やること"),GA,C("たくさん"),C("あります")])}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+) (?:keeps|always|is always) (?:taking|takes) (?:the )?credit for (?:my|our) (ideas?|work)$/i,m=>{const S=who(m[1]);if(!S)return null;return fx([...dropMy(S.chunks),GA,C("いつも"),C("私","わたし"),C("の"),C(/idea/i.test(m[2])?"アイデア":"仕事",/idea/i.test(m[2])?"アイデア":"しごと"),O,C("自分","じぶん"),C("の"),C("手柄","てがら"),C("に"),C("します")],S.used)}],
    [/^(we|i|they|he|she|my [a-z]+(?: and i)?|[A-Z][a-z]+ and i) had (?:a |an )?(huge|big|bad|terrible|little|small|stupid|silly)? ?(fight|argument)(?: with (my [a-z]+|him|her|them|[A-Z][a-z]+))?(?: about (.+))?$/i,m=>{const k=m[1].toLowerCase();let S=null;if(/ and i$/i.test(k)){const a=who(m[1].replace(/ and i$/i,""));if(!a)return null;S=[...dropMy(a.chunks),C("と")]}else if(!/^(we|i)$/.test(k)){const a=who(m[1]);if(!a)return null;S=[...dropMy(a.chunks),WA]}
      let W=null;if(m[4]){const w=/^(him|her|them)$/i.test(m[4])?{chunks:[PJ[m[4].toLowerCase()]],used:[]}:who(m[4]);if(!w)return null;W=[...dropMy(w.chunks),C("と")]}let ab=null;if(m[5]){const a=NP(m[5]);if(!a||a.pron)return null;ab=[...a.chunks,C("の"),C("こと"),C("で")]}
      const big=/huge|big|bad|terrible/i.test(m[2]||""),sm=/little|small|stupid|silly/i.test(m[2]||"");
      return fx([...(S||[]),...(W||[]),...(ab||[]),...(sm?[C("ちょっと")]:[]),C(big?"大げんか":"けんか",big?"おおげんか":"けんか"),C("しました")])}],
    [/^(she|he|they|my [a-z]+|[A-Z][a-z]+) (?:never|doesn't ever|don't ever|rarely) (texts?|calls?|writes?|messages?|replies|answers) (?:me |us )?(?:back)?$/i,m=>{const S=who(m[1]);if(!S)return null;const call=/call/i.test(m[2]);
      return fx([...dropMy(S.chunks),WA,C(/rarely/i.test(m[0])?"なかなか":"全然","ぜんぜん"),C(call?"電話を返して":"返信して",call?"でんわをかえして":"へんしんして"),C("くれません")],S.used)}],
    [/^(my [a-z]+|he|she|they|[A-Z][a-z]+|nobody|no one) (?:don't|doesn't|do not|does not|never) (?:really )?understands? me$/i,m=>{const k=m[1].toLowerCase();if(/^(nobody|no one)$/.test(k))return fx([C("誰も","だれも"),C("私","わたし"),C("の"),C("こと"),O,C("分かってくれません","わかってくれません")]);const S=who(m[1]);if(!S)return null;
      return fx([...dropMy(S.chunks),WA,C("私","わたし"),C("の"),C("こと"),O,C("分かってくれません","わかってくれません")],S.used)}],
    [/^why (?:are you|is he|is she|are they|is (my [a-z]+|[A-Z][a-z]+)) always (?:so )?late$/i,m=>{const w=/are you/i.test(m[0])?[]:/is he/i.test(m[0])?[C("彼","かれ"),WA]:/is she/i.test(m[0])?[C("彼女","かのじょ"),WA]:/are they/i.test(m[0])?[C("彼ら","かれら"),WA]:(()=>{const a=who(m[1]);return a?[...dropMy(a.chunks),WA]:null})();if(!w)return null;
      return fx([...w,C("どうして"),C("いつも"),C("遅刻する","ちこくする"),C("んですか")])}],
    [/^(he|she|[A-Z][a-z]+|my [a-z]+|someone) asked me out(?: on a date)?$/i,m=>{const k=m[1].toLowerCase();const S=k==="someone"?{chunks:[C("誰か","だれか")],used:[]}:who(m[1]);if(!S)return null;return fx([...dropMy(S.chunks),C("に"),C("デート"),C("に"),C("誘われました","さそわれました")],S.used)}],
    [/^(?:i|we) (?:asked|want to ask|wanna ask|am going to ask|'m going to ask) (her|him|[A-Z][a-z]+) out(?: on a date)?$/i,m=>{const S=/^(her|him)$/i.test(m[1])?{chunks:[PJ[m[1].toLowerCase()]],used:[]}:who(m[1]);if(!S)return null;const past=/asked/i.test(m[0]),want=/want/i.test(m[0]);
      return fx([...dropMy(S.chunks),O,C("デート"),C("に"),C(past?"誘いました":want?"誘いたい":"誘うつもり",past?"さそいました":want?"さそいたい":"さそうつもり"),...(past?[]:[DESU])],S.used)}],
    [/^(?:i|we) (?:have )?just (?:got|gotten|came|come) (back|home)(?: from (?:the |my |our )?(.+))?$/i,m=>{let pl=null;if(m[2]){pl=/^work$/i.test(m[2])?{chunks:[C("仕事","しごと")],used:[]}:/^school$/i.test(m[2])?{chunks:[C("学校","がっこう")],used:[]}:NP(m[2]);if(!pl||pl.pron)return null}
      return fx([...(pl?[...pl.chunks,C("から")]:[]),C("帰ってきた","かえってきた"),C("ばかり"),DESU],pl?pl.used:[])}],
    [/^(?:the |this |that )?(.+?) (?:is|was|looks|seems) (?:just )?(perfect|great|ideal) for (?:a |an |the )?(.+)$/i,m=>{if(!/perfect|ideal/i.test(m[2])&&!/^(picnic|beach|hiking|walk|swimming|camping|kids|children|beginners|dinner|lunch|a date|date)$/i.test(m[3]))return null;const a=NP(m[1]),b=NP(m[3].replace(/^a /i,""));if(!a||!b||a.pron||b.pron)return null;const past=/was/i.test(m[0]);
      return fx([...dropMy(a.chunks),WA,...b.chunks,C("に"),C("ぴったり"),C(past?"でした":"です")],[...a.used,...b.used])}],
    [/^(?:i'm|i am|we're|we are) (?:going to|gonna) miss (.+?)(?: (so much|a lot|so so much))?$/i,m=>{const k=m[1].toLowerCase();if(/\b(train|bus|flight|plane|boat|ferry|ride|deadline|show|start|beginning|meeting|class|lesson|appointment|movie|concert|game|match|chance|opportunity|it|that|this|last one)$/i.test(k))return null;const so=m[2]?[C("とても")]:[];
      if(/^(you|you guys|everyone|you all|all of you)$/.test(k))return fx([C(k==="you"?"あなた":"みんな",k==="you"?"あなた":"みんな"),GA,C("いなくなる"),C("と"),...so,C("寂しく","さびしく"),C("なります")]);
      const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),GA,...so,C("恋しく","こいしく"),C("なります")],np.used)}],
    [/^(?:excuse me,? )?is this the (?:right|correct) (platform|train|bus|line|stop|exit|way) (?:for|to) (.+)$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;const k=m[1].toLowerCase();const W={platform:["このホーム","このほーむ"],train:["この電車","このでんしゃ"],bus:["このバス","このばす"],line:["この線","このせん"],stop:["このバス停","このばすてい"],exit:["この出口","このでぐち"],way:["この道","このみち"]}[k];
      const ex=/^excuse/i.test(m[0])?[C("すみません"),["。",null,"."]]:[];
      return fx([...ex,...np.chunks,C(k==="way"||k==="exit"?"へは":"行きは",k==="way"||k==="exit"?"へは":"ゆきは"),C(W[0],W[1]),C("で"),C("合っていますか","あっていますか")],np.used)}],
    [/^(?:i|we) (?:really )?(need|want|would like|'d like|could use) something (?:(cold|hot|warm|sweet|light|cheap|quick|spicy|healthy|small) )?(?:to (drink|eat))?$/i,m=>{if(!m[2]&&!m[3])return null;const A={cold:["冷たい","つめたい"],hot:["温かい","あたたかい"],warm:["温かい","あたたかい"],sweet:["甘い","あまい"],light:["軽い","かるい"],cheap:["安い","やすい"],quick:["すぐ食べられる","すぐたべられる"],spicy:["辛い","からい"],healthy:["体にいい","からだにいい"],small:["小さい","ちいさい"]}[(m[2]||"").toLowerCase()];
      const v=(m[3]||"").toLowerCase();const end=v==="drink"?[C("飲みたい","のみたい"),DESU]:v==="eat"?[C("食べたい","たべたい"),DESU]:/like/i.test(m[1])?[O,C("お願いします","おねがいします")]:[GA,C("ほしい"),DESU];
      return fx([C("何か","なにか"),...(A?[C(A[0],A[1])]:[]),C("もの"),...(v?[GA]:[]),...end])}],
    [/^(?:i think )?(?:i'm|i am|we're|we are) on the (wrong )?(train|bus|plane|subway)$/i,m=>{const W={train:["電車","でんしゃ"],bus:["バス"],plane:["飛行機","ひこうき"],subway:["地下鉄","ちかてつ"]}[m[2].toLowerCase()];const th=/^i think/i.test(m[0]);
      return fx([...(m[1]?[C("違う","ちがう")]:[]),C(W[0],W[1]||W[0]),C("に"),...(th?[C("乗っている","のっている"),C("と"),C("思います","おもいます")]:[C("乗っています","のっています")])])}],
    [/^(?:i'll|i will|i'd like|we'll|we will|can i|could i) (?:have|get) the same(?: thing)? as (her|him|them|you|my friend|my wife|my husband|he does|she does|before|last time)$/i,m=>{const k=m[1].toLowerCase();const W=/^(before|last time)$/.test(k)?[C("前","まえ")]:/^(her|she does)$/.test(k)?[C("彼女","かのじょ")]:/^(him|he does)$/.test(k)?[C("彼","かれ")]:k==="them"?[C("あの人たち","あのひとたち")]:k==="you"?[C("そちら")]:k==="my friend"?[C("友達","ともだち")]:k==="my wife"?[C("妻","つま")]:[C("夫","おっと")];
      return fx([...W,C("と"),C("同じ","おなじ"),C("もの"),O,C("お願いします","おねがいします")])}],
    [/^(?:it was|this is|that was|it's|it is|this was|that is) (?:probably |honestly |really )?the (best|worst|happiest|scariest|most fun) (day|trip|night|week|year|vacation|holiday|meal|time|experience|moment|concert|birthday) of my life$/i,m=>{const np=NP(m[2]);if(!np)return null;const k=m[1].toLowerCase(),A=k==="best"?"最高":k==="worst"?"最悪":k==="happiest"?"一番幸せな":k==="scariest"?"一番怖い":"一番楽しい";const past=/was/i.test(m[0]);
      return fx([C("人生","じんせい"),C("で"),C(A,{"最高":"さいこう","最悪":"さいあく","一番幸せな":"いちばんしあわせな","一番怖い":"いちばんこわい","一番楽しい":"いちばんたのしい"}[A]),...(/^最/.test(A)?[C("の")]:[]),...np.chunks,C(past?"でした":"です")],np.used)}],
    [/^(?:can|could) (?:we|i) (?:split|divide) the (?:bill|check|cost)$/i,()=>fx([C("割り勘","わりかん"),C("に"),C("しても"),C("いいですか")])],
    [/^(?:let's|lets|we should|we can) (?:split|divide) the (?:bill|check|cost)$/i,()=>fx([C("割り勘","わりかん"),C("に"),C("しましょう")])],
    [/^(?:i|we) (?:can't|cannot|can not) believe how (expensive|cheap|big|small|crowded|beautiful|hot|cold|busy|clean|quiet|fast|good|delicious|nice|tall|old) (?:everything|it|this place|this city|the food|things|everyone|the people|people) (?:is|are) (?:here|in japan|in tokyo)?$/i,m=>{const A0={expensive:["高い","たかい"],cheap:["安い","やすい"],big:["大きい","おおきい"],small:["小さい","ちいさい"],crowded:["混んでいます","こんでいます"],beautiful:["きれい"],hot:["暑い","あつい"],cold:["寒い","さむい"],busy:["忙しい","いそがしい"],clean:["きれい"],quiet:["静か","しずか"],fast:["速い","はやい"],good:["いい"],delicious:["おいしい"],nice:["親切","しんせつ"],tall:["高い","たかい"],old:["古い","ふるい"]}[m[1].toLowerCase()];
      const ev=/everything|things/i.test(m[0]);const fo=/food/i.test(m[0]);const pp=/people|everyone/i.test(m[0]);const here=/here/i.test(m[0])?[C("ここ"),WA]:/japan/i.test(m[0])?[C("日本","にほん"),WA]:/tokyo/i.test(m[0])?[C("東京","とうきょう"),WA]:[];
      return fx([...here,...(ev?[C("何でも","なんでも")]:fo?[C("料理","りょうり"),GA]:pp?[C("みんな"),C("本当に","ほんとうに")]:[]),...(pp?[]:[C("本当に","ほんとうに")]),C(A0[0],A0[1]||A0[0]),...(/います$/.test(A0[0])?[]:[DESU]),C("ね")])}],
    [/^(my mom|my mother|my dad|my father|my parents|my wife|my husband|my boss|she|he|they|everyone) (?:keeps|keep|always|is always|are always) (?:asking|asks) (?:me )?when (?:i'm|i am|i will be|i'll be) (coming home|coming back|getting married|going to get married|going to visit|graduating|leaving)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:k==="everyone"?{chunks:[C("みんな")],used:[]}:NP(m[1]);if(!W)return null;
      const V={"coming home":["帰ってくる","かえってくる"],"coming back":["戻ってくる","もどってくる"],"getting married":["結婚する","けっこんする"],"going to get married":["結婚する","けっこんする"],"going to visit":["遊びに来る","あそびにくる"],graduating:["卒業する","そつぎょうする"],leaving:["出発する","しゅっぱつする"]}[m[2].toLowerCase()];
      return fx([...dropMy(W.chunks),C("に"),C("いつ"),C(V[0],V[1]),C("の"),C("か"),C("と"),C("何度も","なんども"),C("聞かれます","きかれます")],W.used)}],
    [/^(?:can you |could you |please )?tell (the driver|him|her|them|the taxi driver|the staff|the waiter) (?:to )?(.+?)(?: please)?$/i,m=>{const k=m[1].toLowerCase();const W=/driver/.test(k)?[C("運転手","うんてんしゅ"),C("さん")]:/staff|waiter/.test(k)?[C("店員","てんいん"),C("さん")]:[PJ[k]];const vp=VP(m[2]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;
      return fx([...W,C("に"),...dropMy(vp.pre),...d,C("ように"),C("言って","いって"),...(/^(can|could) you/i.test(m[0])?[C("もらえます"),KA]:[KUDASAI])],vp.used)}],
    [/^(?:i|we) (?:really )?love (?:it|this|that)(?: here)?$/i,m=>fx([...(/here/i.test(m[0])?[C("ここ"),GA]:[]),C("大好き","だいすき"),DESU])],
    [/^(?:the )?line (?:for (?:the )?(.+?) )?(?:was|is) (?:really |very |so |super )?long$/i,m=>{const np=m[1]?(/^(ride|rides|attraction)$/i.test(m[1])?{chunks:[C("アトラクション")],used:[]}:NP(m[1])):null;if(m[1]&&(!np||np.pron))return null;const past=/was/i.test(m[0]);
      return fx([...(np?[...np.chunks,C("の")]:[]),C("列","れつ"),GA,...(/really|very|so|super/i.test(m[0])?[C("とても")]:[]),C(past?"長かった":"長い",past?"ながかった":"ながい"),DESU],np?np.used:[])}],
    [/^(?:my|our|the) (flight|train|bus) (?:got|was|has been|is) (?:delayed|late|cancelled|canceled)$/i,m=>{const W={flight:["飛行機","ひこうき"],train:["電車","でんしゃ"],bus:["バス"]}[m[1].toLowerCase()];const can=/cancel/i.test(m[0]),now=/ (is|has been) /i.test(m[0]),fl=/flight/i.test(m[1]);return fx([C(W[0],W[1]||W[0]),GA,...(can?[C(fl?"欠航":"運休",fl?"けっこう":"うんきゅう"),C("に"),C("なりました")]:[C(now?"遅れています":"遅れました",now?"おくれています":"おくれました")])])}],
    [/^(?:i'm|i am|we're|we are) (?:stuck|stranded) (?:at|in) (?:the )?(.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,C("で"),C("足止め","あしどめ"),C("されて"),C("います")],np.used)}],
    [/^(?:i|we) got lost (?:while )?(?:trying to find|looking for) (?:the |our |my )?(.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,O,C("探して","さがして"),C("いて"),C("道","みち"),C("に"),C("迷いました","まよいました")],np.used)}],
    [/^(?:can|could) you recommend (?:a |any |some )?(?:good |nice )?(?:place|spot|places|spots) (?:to|where i can|where we can) (.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("のに"),C("いい"),C("場所","ばしょ"),O,C("教えて","おしえて"),C("もらえます"),KA],vp.used)}],
    [/^(?:my )?(?:phone|battery) is (?:dying|almost dead|about to die|running out)$/i,()=>fx([C("スマホ"),C("の"),C("充電","じゅうでん"),GA,C("切れ","きれ"),C("そう"),DESU])],
    [/^it was (?:really |very |so )?(relaxing|peaceful)$/i,m=>fx([...(/really|very|so/i.test(m[0])?[C("とても")]:[]),C("のんびり"),C("できました")])],
    [/^(?:i|we) (?:can't|cannot|can not|don't|do not) remember the last time (?:i|we) (.+)$/i,m=>{let r=null;try{r=compose1("I "+m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([C("最後","さいご"),C("に"),...dropMy(p),C("の"),GA,C("いつ"),C("か"),C("思い出せません","おもいだせません")],r.used)}],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+|i) called (her|his|my) (mom|mother|dad|father|parents|boss|friend|wife|husband|sister|brother) to (?:say|tell (?:her|him|them)) (?:that )?(?:she|he|i) (?:would|'d|was going to) be late$/i,m=>{const k=m[1].toLowerCase(),W=k==="i"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="i"&&!W)return null;
      const F={mom:["お母さん","おかあさん"],mother:["お母さん","おかあさん"],dad:["お父さん","おとうさん"],father:["お父さん","おとうさん"],parents:["両親","りょうしん"],boss:["上司","じょうし"],friend:["友達","ともだち"],wife:["奥さん","おくさん"],husband:["旦那さん","だんなさん"],sister:["お姉さん","おねえさん"],brother:["お兄さん","おにいさん"]}[m[3].toLowerCase()];
      const me=k==="i";const FF=me?{mom:["母","はは"],mother:["母","はは"],dad:["父","ちち"],father:["父","ちち"],sister:["姉","あね"],brother:["兄","あに"],wife:["妻","つま"],husband:["夫","おっと"]}[m[3].toLowerCase()]||F:F;
      return fx([...(W?[...W.chunks,WA]:[]),C(FF[0],FF[1]),C("に"),C("電話","でんわ"),C("して"),CM,C("遅れる","おくれる"),C("と"),C("伝えました","つたえました")],W?W.used:[])}],
    [/^(?:i|we) got a (parking|speeding) ticket$/i,m=>fx([C(/parking/i.test(m[1])?"駐車違反":"スピード違反",/parking/i.test(m[1])?"ちゅうしゃいはん":"すぴーどいはん"),C("で"),C("切符","きっぷ"),O,C("切られました","きられました")])],
    [/^(?:the |that |this )?(restaurant|hotel|place|cafe|bar|flight|tour|class|show) (?:was|is) (?:fully |completely )?(?:booked|booked up|full)$/i,m=>{const np=NP(m[1]);if(!np)return null;const past=/was/i.test(m[0]);return fx([...np.chunks,WA,C("予約","よやく"),C("で"),C("いっぱい"),C(past?"でした":"です")],np.used)}],
    [/^(?:we|i) (?:couldn't|could not|can't|cannot) get a (?:table|seat|room)$/i,m=>{const room=/room/i.test(m[0]);const past=/could/i.test(m[0]);return fx([C(room?"部屋":"席",room?"へや":"せき"),GA,C(past?"取れませんでした":"取れません",past?"とれませんでした":"とれません")])}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+|they|someone) helped (?:me|us) (.+)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:k==="someone"?{chunks:[C("誰か","だれか")],used:[]}:who(m[1]);if(!W)return null;const vp=VP(m[2]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;
      return fx([...dropMy(W.chunks),GA,...dropMy(vp.pre),...d,C("の"),O,C("手伝って","てつだって"),C("くれました")],[...W.used,...vp.used])}],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+|i|we) (?:always |usually |often )?(?:brings?|brought) (.+?) to (?:the |work|school|class)(office|party|meeting|class|school|work)?$/i,m=>{const k=m[1].toLowerCase(),W=/^(i|we)$/.test(k)?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!/^(i|we)$/.test(k)&&!W)return null;const np=NP(m[2]);if(!np||np.pron)return null;
      const pl=(m[3]||(/to work/i.test(m[0])?"work":/to school/i.test(m[0])?"school":/to class/i.test(m[0])?"class":"")).toLowerCase();const P={office:["会社","かいしゃ"],party:["パーティー"],meeting:["会議","かいぎ"],class:["授業","じゅぎょう"],school:["学校","がっこう"],work:["会社","かいしゃ"]}[pl];if(!P)return null;
      const adv=/always/i.test(m[0])?[C("いつも")]:/usually/i.test(m[0])?[C("普段","ふだん")]:/often/i.test(m[0])?[C("よく")]:[];const past=/brought/i.test(m[0]);
      return fx([...(W?[...W.chunks,WA]:[]),...adv,C(P[0],P[1]||P[0]),C("に"),...np.chunks,O,C(past?"持ってきました":"持ってきます",past?"もってきました":"もってきます")],[...(W?W.used:[]),...np.used])}],
    [/^(?:it )?(?:doesn't|does not) matter to me$|^(?:i'm|i am) (?:fine|okay|ok|good) (?:either way|with either)$|^either (?:one )?is fine(?: with me)?$/i,()=>fx([C("私","わたし"),WA,C("どちら"),C("でも"),C("いい"),DESU])],
    [/^(?:honestly,? )?(?:i|we) (?:don't|do not) (?:really )?care$/i,m=>fx([...(/honestly/i.test(q)?[C("正直","しょうじき"),CM]:[]),C("どうでも"),C("いい"),DESU])],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+|you) (draws|sings|cooks|dances|swims|writes|plays the piano|plays the guitar|paints) (really |very |so |pretty )?well$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="you"&&!W)return null;
      const N={draws:["絵","え"],paints:["絵","え"],sings:["歌","うた"],cooks:["料理","りょうり"],dances:["ダンス"],swims:["泳ぎ","およぎ"],writes:["字","じ"],"plays the piano":["ピアノ"],"plays the guitar":["ギター"]}[m[2].toLowerCase()];return fx([...(W?[...W.chunks,WA]:[]),C(N[0],N[1]||N[0]),GA,...(m[3]?[C("とても")]:[]),C("上手","じょうず"),DESU],W?W.used:[])}],
    [/^(?:i've been|i have been|i'm|i am) (?:really |so )?(?:into|hooked on|obsessed with) (.+)$|^(he|she|my [a-z]+|[A-Z][a-z]+)(?:'s| is| has been) (?:really |so )?(?:into|obsessed with|crazy about) (.+)$/i,m=>{const w0=m[2];const x=m[1]||m[3];const k=w0?w0.toLowerCase():"";const W=w0?(PJ[k]?{chunks:[PJ[k]],used:[]}:who(w0)):null;if(w0&&!W)return null;
      const X={baking:["お菓子作り","おかしづくり"],cooking:["料理","りょうり"],gaming:["ゲーム"],running:["ランニング"],hiking:["ハイキング"],knitting:["編み物","あみもの"],camping:["キャンプ"],drawing:["絵","え"],photography:["写真","しゃしん"],yoga:["ヨガ"],anime:["アニメ"]}[x.toLowerCase()];let ch=null,used=[];
      if(X)ch=[C(X[0],X[1]||X[0])];else{const np=NP(x);if(np&&!np.pron&&!(/^[a-z]+ing$/i.test(x)&&np.used.some(u=>u.kind==="dictionary"))){ch=dropMy(np.chunks);used=np.used}else{const vp=vpIng(x);const d=vp&&vplain(vp.v,"dict");if(d){ch=[...dropMy(vp.pre),...d,C("こと")];used=vp.used}}}if(!ch)return null;
      const tt=T.length?T:/lately|recently/i.test(s0)?[C("最近","さいきん")]:[];T=[];return fx([...(W?[...W.chunks,WA]:[]),...tt,...ch,C("に"),...(w0?[C("夢中","むちゅう"),DESU]:[C("はまって"),C("います")])],[...(W?W.used:[]),...used])}],
    [/^(?:our|my|their|the|his|her) (team|side) (lost|won) by (one|two|three|four|five|a|\d+) (points?|goals?|runs?)$/i,m=>{const n=/^a$/i.test(m[3])?1:/^\d+$/.test(m[3])?+m[3]:numOf(m[3]);const U=/goal/i.test(m[4])?"点":/run/i.test(m[4])?"点":"点";const won=/won/i.test(m[2]);return fx([C(KJ[n]+U+"差","てんさ"),C("で"),C(won?"勝ちました":"負けました",won?"かちました":"まけました")])}],
    [/^(?:i|we) (?:prefer|like) (.+?) (?:over|to|more than|better than) (.+)$/i,m=>{const a=NP(m[1]),b=NP(m[2]);if(!a||!b||a.pron||b.pron)return null;return fx([...b.chunks,C("より"),...a.chunks,C("の"),C("方","ほう"),GA,C("好き","すき"),DESU],[...a.used,...b.used])}],
    [/^(?:i'm|i am) not sure (?:that |if |whether )?(?:that's|that is|it's|it is|this is) (true|right|correct|a good idea)$/i,m=>{const W={true:["本当","ほんとう"],right:["正しい","ただしい"],correct:["正しい","ただしい"],"a good idea":["いい考え","いいかんがえ"]}[m[1].toLowerCase()];return fx([C("それ"),GA,C(W[0],W[1]),C("か"),C("どうか"),C("分かりません","わかりません")])}],
    [/^(?:i'll have|i will have|can i get|could i get|can i have|could i have|i'd like) (?:a |an |one )?(small|medium|large|regular|tall|grande|big) (coffee|latte|tea|coke|cola|soda|beer|fries|popcorn|drink|iced coffee|orange juice|juice|water)(?: please)?$/i,m=>{const np=NP(m[2]);if(!np)return null;const S={small:"S",medium:"M",regular:"M",tall:"S",grande:"M",large:"L",big:"L"}[m[1].toLowerCase()];return fx([...np.chunks,C("の"),C(S+"サイズ",S+"さいず"),O,C("お願いします","おねがいします")],np.used)}],
    [/^(?:could|can) (?:i|we) (?:have|get|see) (?:the |a )?menu in english$|^do you have (?:an |a )?english menu$|^is there (?:an |a )?english menu$/i,()=>fx([C("英語","えいご"),C("の"),C("メニュー"),WA,C("あります"),KA])],
    [/^what(?:'s| is| are) (?:today's|the) specials?(?: today)?$/i,()=>fx([C("今日","きょう"),C("の"),C("おすすめ"),WA,C("何","なん"),DESU,KA])],
    [/^is (?:the )?(?:service|service charge) included$/i,m=>fx([C(/tax/i.test(m[0])?"税金":/tip/i.test(m[0])?"チップ":"サービス料",/tax/i.test(m[0])?"ぜいきん":/tip/i.test(m[0])?"ちっぷ":"さーびすりょう"),WA,C("含まれて","ふくまれて"),C("います"),KA])],
    [/^(?:i|he|she|we|they|my [a-z]+) (?:was|were) born in (.+)$/i,m=>{const k=m[1].toLowerCase();const w0=m[0].split(" was born")[0].split(" were born")[0];const W=/^(i|we)$/i.test(w0)?[]:PJ[w0.toLowerCase()]?[PJ[w0.toLowerCase()],WA]:(who(w0)?[...who(w0).chunks,WA]:null);if(!W)return null;
      let y=/^\d{4}$/.test(k)?+k:enNum(k);if(!(y>=1900&&y<=2030)){const ys=/^nineteen ([a-z -]+)$|^twenty ([a-z -]+)$/i.exec(k);if(ys){const r=enNum(ys[1]||ys[2]);if(r>=0&&r<100)y=(ys[1]?1900:2000)+r}}
      if(y>=1900&&y<=2030)return fx([...W,C(y+"年","ねん"),C("に"),C("生まれました","うまれました")]);const np=NP(m[1]);if(!np||np.pron)return null;return fx([...W,...np.chunks,C("で"),C("生まれました","うまれました")],np.used)}],
    [/^how far is it (?:from here )?to (?:the |a )?(.+?)(?: from here)?$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([C("ここ"),C("から"),...np.chunks,C("まで"),C("どのくらい"),DESU,KA],np.used)}],
    [/^(?:i'd like to|i would like to|i want to|can you take me to|please take me to|take me to) (?:go to )?(this place|this address|here|there|this hotel|this restaurant|this station)$/i,m=>{const k=m[1].toLowerCase();const W={"this place":[C("ここ")],"this address":[C("この"),C("住所","じゅうしょ")],here:[C("ここ")],there:[C("そこ")],"this hotel":[C("この"),C("ホテル")],"this restaurant":[C("この"),C("レストラン")],"this station":[C("この"),C("駅","えき")]}[k];
      return fx(/take me/i.test(m[0])?[...W,C("まで"),C("お願いします","おねがいします")]:[...W,C("に"),C("行きたい","いきたい"),DESU])}],
    [/^is (?:this area|this place|this town|this city|it|this) famous for (?:anything|something)$|^what is (?:this area|this place|this town|this city|it) famous for$/i,()=>fx([C("ここ"),WA,C("何","なに"),C("で"),C("有名","ゆうめい"),DESU,KA])],
    [/^is it (safe|dangerous|okay|ok) to (walk|go out|go|be|swim|drink the water|eat this) (?:here |around here |alone |outside )?(?:at night|alone|here|outside)?$/i,m=>{const V={walk:["歩いて","あるいて"],"go out":["出かけて","でかけて"],go:["行って","いって"],be:["いて"],swim:["泳いで","およいで"],"drink the water":["水を飲んで","みずをのんで"],"eat this":["これを食べて","これをたべて"]}[m[2].toLowerCase()];
      const night=/night/i.test(m[0]),here=/here/i.test(m[0]);const safe=/safe|okay|ok/i.test(m[1]);
      return fx([...(night?[C("夜","よる"),...(here?[C("に")]:[])]:[]),...(here?[C("この辺","このへん"),C("を")]:[]),C(V[0],V[1]),...(safe?[C("も"),C("大丈夫","だいじょうぶ"),DESU,KA]:[C("危ない","あぶない"),DESU,KA])].filter((c,i,a)=>!(c[0]==="を"&&!/歩いて/.test((a[i+1]||[])[0]||""))))}],
    [/^where do (?:the )?locals (?:usually |normally |like to )?(eat|go|shop|drink|hang out)$/i,m=>{const V={eat:["食べ","たべ"],go:["行き","いき"],shop:["買い物し","かいものし"],drink:["飲み","のみ"],"hang out":["遊び","あそび"]}[m[1].toLowerCase()];return fx([C("地元","じもと"),C("の"),C("人","ひと"),WA,C("どこ"),C(/eat|shop|drink|hang/i.test(m[1])?"で":"に"),C(V[0]+"ます",V[1]+"ます"),KA])}],
    [/^what(?:'s| is) the best (?:time|season|month) to (visit|go|come)(?: (?:here|there|japan))?$/i,()=>fx([C("いつ"),C("行く","いく"),C("の"),GA,C("一番","いちばん"),C("いい"),DESU,KA])],
    [/^do (?:i|we) (?:need|have) to take off (?:my|our) shoes(?: here)?$/i,()=>fx([C("靴","くつ"),O,C("脱いだ","ぬいだ"),C("ほう"),GA,C("いい"),DESU,KA])],
    [/^is there a (bus|train) that goes to (?:the )?(.+)$|^is there a (bus|train) to (?:the )?(.+)$/i,m=>{const v=m[1]||m[3],d=m[2]||m[4];const np=NP(d);if(!np||np.pron)return null;return fx([...np.chunks,C("行き","いき"),C("の"),C(/bus/i.test(v)?"バス":"電車",/bus/i.test(v)?"ばす":"でんしゃ"),WA,C("あります"),KA],np.used)}],
    [/^how many stops (?:is it |are there )?(?:to|until) (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,C("まで"),C("何駅","なんえき"),DESU,KA],np.used)}],
    [/^do (?:i|we) (?:need|have) to (?:transfer|change trains)(?: (?:to get to|for) (.+))?$/i,m=>{const np=m[1]?NP(m[1]):null;return fx([...(np?[...np.chunks,C("まで"),C("行く","いく"),C("には")]:[]),C("乗り換え","のりかえ"),GA,C("必要","ひつよう"),DESU,KA],np?np.used:[])}],
    [/^(?:i|we) (?:will|'ll) be (?:really |very |so )?busy (all week|all day|this week|tomorrow|all weekend|this weekend|next week|tonight)$/i,m=>{const W={"all week":["今週はずっと","こんしゅうはずっと"],"all day":["一日中","いちにちじゅう"],"this week":["今週は","こんしゅうは"],tomorrow:["明日は","あしたは"],"all weekend":["週末はずっと","しゅうまつはずっと"],"this weekend":["今週末は","こんしゅうまつは"],"next week":["来週は","らいしゅうは"],tonight:["今夜は","こんやは"]}[m[1].toLowerCase()];T=[];return fx([C(W[0],W[1]),C("忙しい","いそがしい"),DESU])}],
    [/^(?:i|we) (?:will|'ll) be (?:really |very |so )?busy$/i,m=>{const tt=T.length?[...T,WA]:[];T=[];if(/all week/i.test(s0))return fx([C("今週","こんしゅう"),WA,C("ずっと"),C("忙しい","いそがしい"),DESU]);return fx([...tt,C("忙しく","いそがしく"),C("なります")])}],
    [/^(?:we should|let's|we need to) (?:get together|hang out|meet up|catch up|meet)(?: again)?(?: sometime| soon| some time)?$/i,m=>{const tt=T.length?T:[C("今度","こんど")];T=[];return fx([...tt,C("また"),C("会いましょう","あいましょう")])}],
    [/^how did you (?:two |guys |both )?meet(?: each other)?$/i,()=>fx([C("お二人","おふたり"),WA,C("どうやって"),C("知り合った","しりあった"),C("ん"),DESU,KA])],
    [/^my (japanese|english) (?:isn't|is not) (?:very |that |so |really )?(good|great) (?:yet)?$/i,m=>fx([C(/^j/i.test(m[1])?"日本語":"英語",/^j/i.test(m[1])?"にほんご":"えいご"),WA,C("まだ"),C("あまり"),C("上手","じょうず"),C("じゃない"),DESU])],
    [/^does (?:that|this|it) make sense$/i,()=>fx([C("分かります","わかります"),KA])],
    [/^(?:that|this|it) (?:doesn't|does not) make (?:any )?sense$/i,()=>fx([C("意味","いみ"),GA,C("分かりません","わかりません")])],
    [/^what(?:'s| is) the difference between (?:these|those|the) (two|three)(?: things| ones)?$/i,m=>fx([C(/two/i.test(m[1])?"この二つ":"この三つ",/two/i.test(m[1])?"このふたつ":"このみっつ"),C("の"),C("違い","ちがい"),WA,C("何","なん"),DESU,KA])],
    [/^what(?:'s| is) the difference between (.+?) and (.+)$/i,m=>{const a=NP(m[1]),b=NP(m[2]);if(!a||!b||a.pron||b.pron)return null;return fx([...a.chunks,C("と"),...b.chunks,C("の"),C("違い","ちがい"),WA,C("何","なん"),DESU,KA],[...a.used,...b.used])}],
    [/^(?:my |the |this |our )?(laptop|computer|phone|tv|television|tablet|printer|pc|ipad|console|switch|camera|screen|monitor) (?:won't|will not|doesn't|does not|didn't|did not) (?:turn on|start|start up|boot up|boot|charge)$/i,m=>{const np=NP(m[1]);if(!np)return null;const ch=/charge/i.test(m[0]),past=/didn't|did not/i.test(m[0]);
      return fx([...dropMy(np.chunks),C(ch?"が":"の"),...(ch?[C("充電","じゅうでん"),C("できません")]:[C("電源","でんげん"),GA,C(past?"入りませんでした":"入りません",past?"はいりませんでした":"はいりません")])],np.used)}],
    [/^(?:i|we) (?:have had|'ve had|have) (?:a |an )?(cough|fever|headache|stomachache|stomach ache|cold|sore throat|runny nose|toothache|backache|rash)(?: for (two|three|four|five|six|seven|a few|several|\d+) (days|weeks))?$/i,m=>{if(!m[2]){const dm=/ for (two|three|four|five|six|seven|a few|several|\d+) (days|weeks)\b/i.exec(s0);if(!dm)return null;m=[m[0],m[1],dm[1],dm[2]]}const W={cough:["咳","せき"],fever:["熱","ねつ"],headache:["頭痛","ずつう"],stomachache:["腹痛","ふくつう"],"stomach ache":["腹痛","ふくつう"],cold:["風邪","かぜ"],"sore throat":["喉の痛み","のどのいたみ"],"runny nose":["鼻水","はなみず"],toothache:["歯の痛み","はのいたみ"],backache:["腰痛","ようつう"],rash:["発疹","ほっしん"]}[m[1].toLowerCase()];
      const n=/few|several/i.test(m[2])?null:/^\d+$/.test(m[2])?+m[2]:numOf(m[2]);const dw=/week/i.test(m[3]);const D=n?(dw?C(KJ[n]+"週間","しゅうかん"):C(KJ[n]+"日間","にちかん")):C(dw?"数週間":"数日間",dw?"すうしゅうかん":"すうじつかん");T=[];
      return fx([D,C(W[0],W[1]),GA,C("続いて","つづいて"),C("います")])}],
    [/^(?:i|we) (?:can't|cannot|can not) stop (sneezing|coughing|laughing|crying|shaking|yawning|hiccuping|hiccupping)$/i,m=>{const W={sneezing:["くしゃみ"],coughing:["咳","せき"],laughing:["笑い","わらい"],crying:["涙","なみだ"],shaking:["震え","ふるえ"],yawning:["あくび"],hiccuping:["しゃっくり"],hiccupping:["しゃっくり"]}[m[1].toLowerCase()];return fx([C(W[0],W[1]||W[0]),GA,C("止まりません","とまりません")])}],
    [/^(?:the |my |our )?(sink|faucet|tap|pipe|roof|toilet|ceiling|bottle|shower|air conditioner) is leaking$/i,m=>{const np=NP(m[1]);if(!np)return null;return fx([...dropMy(np.chunks),C("から"),C("水","みず"),GA,C("漏れて","もれて"),C("います")],np.used)}],
    [/^(?:i think )?(?:i|we) ate something (?:bad|weird|wrong|that was bad)$/i,m=>fx([C("何か","なにか"),C("悪い","わるい"),C("もの"),O,C("食べた","たべた"),C("と"),C("思います","おもいます")])],
    [/^(?:i|we) (?:need to|have to|want to|would like to|'d like to) (?:make|book) an appointment (?:with|at) (?:the |a |my )?(dentist|doctor|hairdresser|hair salon|clinic|hospital|eye doctor)$/i,m=>{const W={dentist:["歯医者","はいしゃ"],doctor:["病院","びょういん"],hairdresser:["美容院","びよういん"],"hair salon":["美容院","びよういん"],clinic:["クリニック"],hospital:["病院","びょういん"],"eye doctor":["眼科","がんか"]}[m[1].toLowerCase()];const want=/want|like/i.test(m[0]);
      return fx([C(W[0],W[1]||W[0]),C("の"),C("予約","よやく"),O,...(want?[C("取りたい","とりたい"),DESU]:[C("取らない","とらない"),C("と"),C("いけません")])])}],
    [/^(?:i|he|she) (cut|burned|burnt|hurt|injured|sprained|twisted) (?:my|his|her) (finger|hand|arm|leg|knee|back|ankle|wrist|foot|head|shoulder|neck)(?: (?:(?:while|when) )?(cooking|running|playing [a-z]+|working|cleaning|skiing|lifting (?:a |the |something )?[a-z]*|hiking))?$/i,m=>{const P={finger:["指","ゆび"],hand:["手","て"],arm:["腕","うで"],leg:["足","あし"],knee:["膝","ひざ"],back:["腰","こし"],ankle:["足首","あしくび"],wrist:["手首","てくび"],foot:["足","あし"],head:["頭","あたま"],shoulder:["肩","かた"],neck:["首","くび"]}[m[2].toLowerCase()];
      const V={cut:["切りました","きりました"],burned:["やけどしました","やけどしました"],burnt:["やけどしました","やけどしました"],hurt:["痛めました","いためました"],injured:["けがしました","けがしました"],sprained:["ひねりました","ひねりました"],twisted:["ひねりました","ひねりました"]}[m[1].toLowerCase()];
      let w=[];if(m[3]){const a=m[3].toLowerCase();const S={cooking:["料理中","りょうりちゅう"],running:["走って","はしって"],working:["仕事中","しごとちゅう"],cleaning:["掃除中","そうじちゅう"],skiing:["スキー中","すきーちゅう"],hiking:["ハイキング中","はいきんぐちゅう"]}[a];if(S)w=[C(S[0],S[1]),C(/中$/.test(S[0])?"に":"いて")];else if(/^lifting/.test(a))w=[C(/box/.test(a)?"箱":"重い物",/box/.test(a)?"はこ":"おもいもの"),O,C("持ち上げた","もちあげた"),C("時","とき"),C("に")];else{const np=NP(a.replace(/^playing /,""));if(!np)return null;w=[...np.chunks,O,C("して"),C("いて")]}}
      const S0=/^(he|she)$/i.test(m[0].split(" ")[0])?[PJ[m[0].split(" ")[0].toLowerCase()],WA]:[];return fx([...S0,...w,C(P[0],P[1]),O,C(V[0],V[1])])}],
    [/^(?:i(?:'m| am)|i feel) (?:feeling )?(a little |a bit |kind of |really |very |so )?(dizzy|nauseous|sick to my stomach|feverish|lightheaded)$/i,m=>{const W={dizzy:[["めまい"],["が"],["します"]],lightheaded:[["めまい"],["が"],["します"]],nauseous:[["吐き気","はきけ"],["が"],["します"]],"sick to my stomach":[["吐き気","はきけ"],["が"],["します"]],feverish:[["熱っぽい","ねつっぽい"],["です"]]}[m[2].toLowerCase()];
      return fx([...(/little|bit|kind/i.test(m[1]||"")?[C("少し","すこし")]:/really|very|so/i.test(m[1]||"")?[C("ひどい")]:[]),...W.map(x=>C(x[0],x[1]||x[0]))].filter((c,i,a)=>!(c[0]==="ひどい"&&a[i+1]&&a[i+1][0]==="熱っぽい")))}],
    [/^(?:i'm|i am) on (?:medication|medicine|antibiotics|pills)$/i,m=>fx([C(/antibiotics/i.test(m[0])?"抗生物質":"薬",/antibiotics/i.test(m[0])?"こうせいぶっしつ":"くすり"),O,C("飲んで","のんで"),C("います")])],
    [/^how (?:often|many times a day) should i take (?:this|the|these) (medicine|medication|pills?|tablets?)$/i,()=>fx([C("この"),C("薬","くすり"),WA,C("一日","いちにち"),C("何回","なんかい"),C("飲めば","のめば"),C("いい"),DESU,KA])],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+|you) (?:has|have) been (?:really |very |so )?(quiet|busy|weird|grumpy|happy|sad|tired|nice|moody)(?: (today|lately|recently|all day|this week))?$/i,m=>{if(!m[3]){const tm=/ (today|lately|recently|all day|this week)$/i.exec(s0);if(!tm)return null;m=[m[0],m[1],m[2],tm[1]]}const k=m[1].toLowerCase(),W=k==="you"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="you"&&!W)return null;
      const A0={quiet:["静か","しずか"],busy:["忙しそう","いそがしそう"],weird:["様子が変","ようすがへん"],grumpy:["機嫌が悪い","きげんがわるい"],happy:["嬉しそう","うれしそう"],sad:["悲しそう","かなしそう"],tired:["疲れて","つかれて"],nice:["優しい","やさしい"],moody:["機嫌が悪い","きげんがわるい"]}[m[2].toLowerCase()];
      const tw={today:["今日","きょう"],lately:["最近","さいきん"],recently:["最近","さいきん"],"all day":["一日中","いちにちじゅう"],"this week":["今週","こんしゅう"]}[m[3].toLowerCase()];T=[];const tired=/^tired$/i.test(m[2]);
      return fx([...(W?[...W.chunks,WA]:[]),C(tw[0],tw[1]),C("ずっと"),C(A0[0],A0[1]),...(tired?[C("いる"),C("みたい")]:[]),DESU],W?W.used:[])}],
    [/^(?:i'm|i am) in a (good|great|bad|terrible) mood(?: today| right now)?$/i,m=>{const g=/good|great/i.test(m[1]);const tt=T.length?[...T,WA]:/today/i.test(m[0])?[C("今日","きょう"),WA]:[];T=[];return fx([...tt,C("機嫌","きげん"),GA,C(g?"いい":"悪い",g?"いい":"わるい"),DESU])}],
    [/^it makes me (sad|angry|happy|nervous|uncomfortable|mad) when (?:people|someone|others) (?:are|is) (rude|mean|late|nice|kind|loud)$/i,m=>{const E={sad:["悲しく","かなしく"],angry:["腹が立ち","はらがたち"],mad:["腹が立ち","はらがたち"],happy:["嬉しく","うれしく"],nervous:["緊張し","きんちょうし"],uncomfortable:["嫌な気持ちに","いやなきもちに"]}[m[1].toLowerCase()];
      const P={rude:["失礼","しつれい","だ"],mean:["意地悪","いじわる","だ"],late:["遅れる","おくれる",""],nice:["親切","しんせつ","だ"],kind:["親切","しんせつ","だ"],loud:["うるさい","うるさい",""]}[m[2].toLowerCase()];
      return fx([C("人","ひと"),GA,C(P[0],P[1]),...(P[2]?[C(P[2])]:[]),C("と"),C(E[0],E[1]),C(/^(angry|mad)$/i.test(m[1])?"ます":"なります")])}],
    [/^(?:i|we) (?:can't|cannot|can not) believe (?:i|we) (?:did|said) (?:that|it|this)$/i,m=>fx([C("自分","じぶん"),GA,C("そんな"),C("こと"),O,C(/said/i.test(m[0])?"言った":"した",/said/i.test(m[0])?"いった":"した"),C("なんて"),C("信じられません","しんじられません")])],
    [/^(?:i'm|i am) (?:so |really |a little |kind of )?(jealous|envious) of (him|her|them|you|my [a-z]+|[A-Z][a-z]+)$/i,m=>{const k=m[2].toLowerCase(),W=k==="you"?{chunks:[C("あなた")],used:[]}:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[2]);if(!W)return null;return fx([...dropMy(W.chunks),GA,C("うらやましい"),DESU],W.used)}],
    [/^(?:i'm|i am|we're|we are) (?:still )?looking for (?:a |an |some |the )?((?:good |nice |cheap )?place to (?:stay|eat|sleep|park|live|sit|study|work))$/i,m=>{const np=NP(m[1]);if(!np)return null;return fx([...np.chunks,O,C("探して","さがして"),C("います")],np.used)}],
    [/^(?:i'm sorry,? |sorry,? )?(?:i|we) (?:didn't|did not) (?:catch|get|hear) your name$/i,m=>fx([...(/sorry/i.test(m[0])?[C("すみません"),CM]:[]),C("お名前","おなまえ"),O,C("聞き取れませんでした","ききとれませんでした")])],
    [/^(?:i think )?(?:i'm|i am|we're|we are) (?:a little |a bit |kind of )?lost$/i,m=>fx(/think/i.test(m[0])?[C("道","みち"),C("に"),C("迷った","まよった"),C("みたい"),DESU]:[C("道","みち"),C("に"),C("迷いました","まよいました")])],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+|you) speaks? (japanese|english|french|chinese|korean|spanish|german|italian) (really |very |so |pretty |quite )?(well|fluently|perfectly)$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="you"&&!W)return null;const L=NP(m[2]);if(!L)return null;
      return fx([...(W?[...W.chunks,WA]:[]),...L.chunks,GA,...(m[3]||/fluent|perfect/i.test(m[4])?[C("とても")]:[]),C("上手","じょうず"),DESU],[...(W?W.used:[]),...L.used])}],
    [/^have you seen (it|them|my [a-z]+(?: [a-z]+)?)$/i,m=>{const k=m[1].toLowerCase();const np=/^(it|them)$/.test(k)?null:NP(m[1]);if(!/^(it|them)$/.test(k)&&(!np||np.pron))return null;return fx([...(np?[...dropMy(np.chunks),O]:[]),C("見ませんでした","みませんでした"),KA],np?np.used:[])}],
    [/^how long does it take to (walk|drive|get|go) (?:there|to (?:the )?(.+?))( from here)?$/i,m=>{const np=m[2]?NP(m[2]):{chunks:[C("そこ")],used:[]};if(!np||np.pron)return null;const how=/walk/i.test(m[1])?[C("歩いて","あるいて")]:/drive/i.test(m[1])?[C("車","くるま"),C("で")]:[];
      return fx([...(m[3]?[C("ここ"),C("から")]:[]),...np.chunks,C("まで"),...how,C("どのくらい"),C("かかります"),KA],np.used)}],
    [/^(?:my )?favou?rite season is (spring|summer|fall|autumn|winter) because of (?:the )?(.+)$/i,m=>{const S={spring:["春","はる"],summer:["夏","なつ"],fall:["秋","あき"],autumn:["秋","あき"],winter:["冬","ふゆ"]}[m[1].toLowerCase()];const np=NP(m[2]);if(!np||np.pron)return null;return fx([...np.chunks,GA,C("ある"),C("から"),CM,C(S[0],S[1]),GA,C("一番","いちばん"),C("好き","すき"),DESU],np.used)}],
    [/^it(?:'s| is) (my|your|our|his|her) turn(?: to (.+))?$/i,m=>{const W={my:[C("私","わたし")],your:[C("あなた")],our:[C("私たち","わたしたち")],his:[C("彼","かれ")],her:[C("彼女","かのじょ")]}[m[1].toLowerCase()];if(!m[2]){const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,...W,C("の"),C("番","ばん"),DESU])}
      const vp=VP(m[2]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,...W,GA,...dropMy(vp.pre),...d,C("番","ばん"),DESU],vp.used)}],
    [/^(?:i'm|i am) not (?:a|really a|much of a) (morning|night|people|cat|dog) person$/i,m=>{const k=m[1].toLowerCase();const W={morning:["朝","あさ"],night:["夜","よる"],people:["人付き合い","ひとづきあい"],cat:["猫","ねこ"],dog:["犬","いぬ"]}[k];return fx([C(W[0],W[1]),GA,C("苦手","にがて"),DESU])}],
    [/^(?:i'm|i am) (?:a|really a|definitely a) (morning|night) person$/i,m=>fx([C(/morning/i.test(m[1])?"朝型":"夜型",/morning/i.test(m[1])?"あさがた":"よるがた"),DESU])],
    [/^what kind of (.+?) do you (like|want|listen to|play|watch|read|eat|usually eat|recommend)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const k=m[2].toLowerCase();
      const E={like:[GA,C("好き","すき"),DESU,KA],want:[GA,C("欲しい","ほしい"),DESU,KA],"listen to":[O,C("聞きます","ききます"),KA],play:[O,C("します"),KA],watch:[O,C("見ます","みます"),KA],read:[O,C("読みます","よみます"),KA],eat:[O,C("食べます","たべます"),KA],"usually eat":[O,C("普段","ふだん"),C("食べます","たべます"),KA],recommend:[GA,C("おすすめ"),DESU,KA]}[k];
      return fx([C("どんな"),...np.chunks,...E],np.used)}],
    [/^(?:we|i) got (?:caught in|stuck in) the (rain|snow|storm)$/i,m=>fx(/rain/i.test(m[1])?[C("雨","あめ"),C("に"),C("降られました","ふられました")]:/snow/i.test(m[1])?[C("雪","ゆき"),C("に"),C("降られました","ふられました")]:[C("嵐","あらし"),C("に"),C("遭いました","あいました")])],
    [/^(?:i|we) (?:have known|'ve known|have been friends with) (her|him|them|my [a-z]+|[A-Z][a-z]+) since (high school|middle school|elementary school|college|university|we were kids|we were children|childhood|kindergarten|(?:19|20)\d\d)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;const t=m[2].toLowerCase();
      const S={"high school":["高校","こうこう"],"middle school":["中学","ちゅうがく"],"elementary school":["小学校","しょうがっこう"],college:["大学","だいがく"],university:["大学","だいがく"],"we were kids":["子供","こども"],"we were children":["子供","こども"],childhood:["子供","こども"],kindergarten:["幼稚園","ようちえん"]}[t];
      return fx([...(S?[C(S[0],S[1]),C("の"),C("時","とき"),C("から")]:[C(t+"年","ねん"),C("から")]),...W.chunks,O,C("知って","しって"),C("います")],W.used)}],
    [/^(?:my )?(sister|brother) is (older|younger) than me$/i,m=>{const o=/older/i.test(m[2]);const W=/sister/i.test(m[1])?(o?["姉","あね"]:["妹","いもうと"]):(o?["兄","あに"]:["弟","おとうと"]);return fx([C(W[0],W[1]),WA,C("私","わたし"),C("より"),C(o?"年上":"年下",o?"としうえ":"としした"),DESU])}],
    [/^(good morning|morning|good evening|good night|good afternoon|hello|hi|hey)$/i,m=>{const k=m[1].toLowerCase();const W={"good morning":"おはようございます",morning:"おはようございます","good evening":"こんばんは","good night":"おやすみなさい","good afternoon":"こんにちは",hello:"こんにちは",hi:"こんにちは",hey:"こんにちは"}[k];return fx([C(W)])}],
    [/^no problem(?: at all)?$|^not a problem(?: at all)?$|^no worries at all$/i,m=>fx([...(/at all/i.test(m[0])?[C("全然","ぜんぜん")]:[]),C("大丈夫","だいじょうぶ"),DESU,C("よ")])],
    [/^(?:have )?(?:a )?safe (?:travels?|trip|flight|journey)$/i,()=>fx([C("気をつけて","きをつけて"),C("行って","いって"),C("らっしゃい")])],
    [/^(?:i|we) (?:totally|completely|really|absolutely|fully)? ?agree(?: with you)?$/i,m=>fx(/totally|completely|really|absolutely|fully/i.test(m[0])?[C("本当に","ほんとうに"),C("そう"),C("です"),C("ね")]:[C("賛成","さんせい"),C("します")])],
    [/^really$|^is that true$|^for real$/i,()=>fx([C("本当","ほんとう"),DESU,KA])],
    [/^did you sleep well(?: last night)?$/i,()=>fx([C("よく"),C("眠れました","ねむれました"),KA])],
    [/^how(?: is| are|'s|'re) (?:your|ur) (family|parents|mom|mother|dad|father|wife|husband|kids|children|son|daughter|grandma|grandmother|grandpa|grandfather|brother|sister|boyfriend|girlfriend|dog|cat)(?: doing)?$/i,m=>{const F={family:"ご家族",parents:"ご両親",mom:"お母さん",mother:"お母さん",dad:"お父さん",father:"お父さん",wife:"奥さん",husband:"ご主人",kids:"お子さん",children:"お子さん",son:"息子さん",daughter:"娘さん",grandma:"おばあさん",grandmother:"おばあさん",grandpa:"おじいさん",grandfather:"おじいさん",brother:"お兄さん",sister:"お姉さん",boyfriend:"彼氏",girlfriend:"彼女",dog:"ワンちゃん",cat:"猫ちゃん"};const K={family:"ごかぞく",parents:"ごりょうしん",mom:"おかあさん",mother:"おかあさん",dad:"おとうさん",father:"おとうさん",wife:"おくさん",husband:"ごしゅじん",kids:"おこさん",children:"おこさん",son:"むすこさん",daughter:"むすめさん",grandma:"おばあさん",grandmother:"おばあさん",grandpa:"おじいさん",grandfather:"おじいさん",brother:"おにいさん",sister:"おねえさん",boyfriend:"かれし",girlfriend:"かのじょ",dog:"わんちゃん",cat:"ねこちゃん"};const k=m[1].toLowerCase();
      return fx([C(F[k],K[k]),WA,C("お元気","おげんき"),DESU,KA])}],
    [/^what have you been (?:up to|doing)(?: lately| recently| these days)?$/i,()=>fx([C("最近","さいきん"),C("どう"),C("して"),C("いました"),KA])],
    [/^(?:i'm|i am|i've been|i have been|we've been|we're|we are) (?:really |so |very |super )?busy with (.+)$/i,m=>{const k=m[1].toLowerCase();const np=/^work$/.test(k)?{chunks:[C("仕事","しごと")],used:[]}:/^school$/.test(k)?{chunks:[C("学校","がっこう")],used:[]}:NP(m[1]);if(!np||np.pron)return null;const been=/been/i.test(m[0]);
      return fx([...(been?[C("最近","さいきん")]:[]),...dropMy(np.chunks),C("で"),...(/really|so|very|super/i.test(m[0])?[C("とても")]:[]),C("忙しい","いそがしい"),DESU],np.used)}],
    [/^(?:thanks|thank you) for (?:the )?(food|meal|dinner|lunch|treat)$/i,()=>fx([C("ごちそうさま"),C("でした")])],
    [/^it was (?:really |so |very )?(delicious|tasty|yummy)$/i,m=>fx([...(/really|so|very/i.test(m[0])?[C("とても")]:[]),C("おいしかった"),DESU])],
    [/^(?:ok |okay )?(?:bye|goodbye|see ya|see you),? take care$/i,()=>fx([C("じゃあ"),CM,C("気をつけて","きをつけて"),C("ね")])],
    [/^(?:it's |it is |what )?(?:a )?(?:really |so |very )?(nice|beautiful|lovely|great|good|perfect) (?:weather|day)(?: today)?$/i,m=>{const tt=T.length?[...T,WA]:/today/i.test(m[0])?[C("今日","きょう"),WA]:[];T=[];return fx([...tt,C("いい"),C("天気","てんき"),DESU,C("ね")])}],
    [/^(?:it was |it's been |it has been |it is |it's )?(?:really |so |very )?(great|good|lovely|wonderful|awesome|fun) (?:to meet|meeting|to see|seeing) you(?: again| today| all| guys| finally)?$/i,m=>{const see=/see/i.test(m[0]);return fx([C(see?"会えて":"お会いできて",see?"あえて":"おあいできて"),...(/really|so|very/i.test(m[0])?[C("本当に","ほんとうに")]:[]),C("よかった"),DESU])}],
    [/^(?:it was |it's been )?(?:really |so )?nice (?:meeting|to have met|seeing|to see) you(?: again| today| all)?$/i,m=>{const see=/see/i.test(m[0]);return fx([C(see?"会えて":"お会いできて",see?"あえて":"おあいできて"),...(/really|so/i.test(m[0])?[C("本当に","ほんとうに")]:[]),C("よかった"),DESU])}],
    [/^(?:i|we) (?:have |'ve )?(?:been )?(?:really )?(?:wanted|wanting|dying|waiting) to meet you$/i,()=>fx([C("ずっと"),C("お会い","おあい"),C("したかった"),DESU])],
    [/^(?:my|our) (phone|wallet|keys|key|ticket|passport|card|money|glasses) fell out of (?:my|our|his|her) (pocket|bag|backpack|purse|jacket)$/i,m=>{const a=NP("my "+m[1]),b=NP(m[2]);if(!a||!b)return null;return fx([...dropMy(a.chunks),GA,...b.chunks,C("から"),C("落ちました","おちました")],[...a.used,...b.used])}],
    [/^(?:the |my |our )?(.+?) (?:gave|give|gives) (?:us|me) (?:some |a )?free (dessert|drinks?|coffee|food|tickets?|samples?|refills?|ice cream|cake|snacks?)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:NP(m[1]);if(!W||W.pron&&!PJ[k])return null;const n=NP(m[2]);if(!n||n.pron)return null;
      return fx([...dropMy(W.chunks),GA,...n.chunks,O,C("サービス","さーびす"),C("して"),C("くれました")],[...W.used,...n.used])}],
    [/^(he|she|they|my [a-z]+|[A-Z][a-z]+) (?:has to|have to|needs to|need to|must|has got to) (.+)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;
      if(/^work(?: today| tomorrow| tonight)?$/i.test(m[2]))return fx([...W.chunks,WA,C("仕事","しごと"),GA,C("あります")],W.used);const vp=VP(m[2]);const e=vp&&!vp.past&&!vp.ing&&vend(vp.v,"must");if(!e)return null;return fx([...W.chunks,WA,...dropMy(vp.pre),...e],[...W.used,...vp.used])}],
    [/^it (was|is) (raining|snowing|pouring)(?: (hard|heavily|a lot|really hard|so hard))?$/i,m=>{const past=/was/i.test(m[1]);const sn=/snow/i.test(m[2]);return fx([C(sn?"雪":"雨",sn?"ゆき":"あめ"),GA,...(m[3]||/pour/i.test(m[2])?[C("すごく")]:[]),C("降って","ふって"),C(past?"いました":"います")])}],
    [/^(?:i|we) (?:do not|don't) know how to say (this|that|it)(?: in japanese)?$/i,m=>{const k=m[1].toLowerCase();const jp=/japanese/i.test(q);return fx([...(jp?[C(k==="that"?"それ":"これ"),WA,C("日本語","にほんご"),C("で")]:[]),C("何","なん"),C("と"),C(jp?"言う":"言えば",jp?"いう":"いえば"),...(jp?[]:[C("いい")]),C("か"),C("分かりません","わかりません")])}],
    [/^(?:i|we) (?:will|'ll) be (a little|a bit|a few minutes|five minutes|ten minutes|fifteen minutes|twenty minutes|thirty minutes|very|really|so|kind of)? ?late$/i,m=>{const k=(m[1]||"").toLowerCase();const n={"five minutes":"五分","ten minutes":"十分","fifteen minutes":"十五分","twenty minutes":"二十分","thirty minutes":"三十分"}[k];
      return fx([...(n?[C(n,{"五分":"ごふん","十分":"じゅっぷん","十五分":"じゅうごふん","二十分":"にじゅっぷん","三十分":"さんじゅっぷん"}[n]),C("くらい")]:/little|bit|few|kind/.test(k)?[C("ちょっと")]:/very|really|so/.test(k)?[C("かなり")]:[]),C("遅れます","おくれます")])}],
    [/^(?:i'm|i am|we're|we are) (?:so |really |very |super )?excited to (.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("の"),GA,C("とても"),C("楽しみ","たのしみ"),DESU],vp.used)}],
    [/^someone (found|returned|helped|picked up|brought back|gave back) (it|them|me|my [a-z]+|the [a-z]+)$/i,m=>{const k=m[2].toLowerCase();const np=/^(it|them)$/.test(k)?null:k==="me"?null:NP(m[2]);if(np&&np.pron)return null;
      const V={found:["見つけて","みつけて"],returned:["返して","かえして"],helped:["助けて","たすけて"],"picked up":["拾って","ひろって"],"brought back":["持って来て","もってきて"],"gave back":["返して","かえして"]}[m[1].toLowerCase()];return fx([C("誰か","だれか"),GA,...(np?[...dropMy(np.chunks),O]:[]),C(V[0],V[1]),C("くれました")],np?np.used:[])}],
    [/^(?:if )?(?:you|i|we) (?:have|got) (?:some |any )?(?:free )?time$/i,m=>fx([C("時間","じかん"),GA,C(/^if/i.test(m[0])?"あったら":"あります",/^if/i.test(m[0])?"あったら":"あります")])],
    [/^(?:i|we) spent (the whole day|all day|the whole weekend|all weekend|all morning|the whole morning|all night|the whole night|all afternoon|the afternoon|the morning|the day|(?:an?|one|two|three|four|five|six) hours?) ([a-z]+ing)(?: (.+))?$/i,m=>{const k=m[1].toLowerCase();const vp=vpIng(m[2]+(m[3]?" "+m[3]:""));const st=vp&&vstems(vp.v);if(!st||!st.te)return null;
      let tw=/day/.test(k)?[C("一日中","いちにちじゅう")]:/weekend/.test(k)?[C("週末","しゅうまつ"),C("ずっと")]:/morning/.test(k)?[C("午前中","ごぜんちゅう"),C("ずっと")]:/afternoon/.test(k)?[C("午後","ごご"),C("ずっと")]:/night/.test(k)?[C("一晩中","ひとばんじゅう")]:null;
      if(!tw){const n=/^(an?|one)\b/.test(k)?1:numOf(k.split(" ")[0]);if(!n)return null;tw=[C(KJ[n]+"時間","じかん"),C("ずっと")]}T=[];return fx([...tw,...dropMy(vp.pre),C(st.te[0],st.te[1]),C("いました")],vp.used)}],
    [/^(?:we|i) stayed up late ([a-z]+ing) (.+?)(?: and ([a-z]+ing) (.+))?$/i,m=>{const a=vpIng(m[1]+" "+m[2]);if(!a)return null;if(m[3]){const b=vpIng(m[3]+" "+m[4]);const ta=vplain(a.v,"ta"),tb=b&&vplain(b.v,"ta");if(!ta||!tb)return null;const L1=ta[ta.length-1],L2=tb[tb.length-1];
        return fx([C("遅く","おそく"),C("まで"),...dropMy(a.pre),...ta.slice(0,-1),C(L1[0]+"り",(L1[1]||L1[0])+"り"),...dropMy(b.pre),...tb.slice(0,-1),C(L2[0]+"り",(L2[1]||L2[0])+"り"),C("して"),C("いました")],[...a.used,...b.used])}
      const st=vstems(a.v);if(!st||!st.te)return null;return fx([C("遅く","おそく"),C("まで"),...dropMy(a.pre),C(st.te[0],st.te[1]),C("いました")],a.used)}],
    [/^(?:the |my |our )?(.+?) is (?:a |an |about a |about an |only a |just a )?(five|ten|fifteen|twenty|thirty|two|three|four|\d+)[- ]minutes?(?: (walk|drive|ride|train ride|bus ride))? (?:away )?from (?:the |my |our |here)?(.*)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const n=/^\d+$/.test(m[2])?+m[2]:numOf(m[2]);if(!n||n>60)return null;
      const fr=!m[4]||/^here$/i.test(m[4])?[C("ここ")]:(NP(m[4])||{}).chunks;if(!fr)return null;const how=/drive/i.test(m[3]||"")?[C("車","くるま"),C("で")]:/train/i.test(m[3]||"")?[C("電車","でんしゃ"),C("で")]:/bus/i.test(m[3]||"")?[C("バス"),C("で")]:[C("歩いて","あるいて")];
      const kj=n<=10?KJ[n]:n<20?"十"+KJ[n-10]:KJ[Math.floor(n/10)]+"十"+(n%10?KJ[n%10]:"");return fx([...dropMy(np.chunks),WA,...fr,C("から"),...how,C(kj+"分","ふん"),DESU],np.used)}],
    [/^(?:i|we) (?:have |'ve )?decided to (.+?) and (.+)$/i,m=>{const a=VP(m[1]),b=VP(m[2]);const sa=a&&!a.past&&!a.ing&&vstems(a.v),db=b&&!b.past&&!b.ing&&vplain(b.v,"dict");if(!sa||!sa.te||!db)return null;return fx([...dropMy(a.pre),C(sa.te[0],sa.te[1]),...dropMy(b.pre),...db,C("こと"),C("に"),C("しました")],[...a.used,...b.used])}],
    [/^(?:i|we) (?:do not|don't) know how to say (this|that|it|.+?) in japanese$/i,m=>{const k=m[1].toLowerCase();if(!/^(this|that|it)$/.test(k))return null;return fx([C(k==="that"?"それ":"これ"),WA,C("日本語","にほんご"),C("で"),C("何","なん"),C("と"),C("言う","いう"),C("か"),C("分かりません","わかりません")])}],
    [/^what(?:'s| is) the weather (?:going to be|gonna be|supposed to be|) ?like(?: (tomorrow|today|this weekend|tonight|next week|on the weekend|there|in tokyo|in kyoto))?$/i,m=>{const k=(m[1]||"").toLowerCase();const W={tomorrow:["明日","あした"],today:["今日","きょう"],"this weekend":["今週末","こんしゅうまつ"],tonight:["今夜","こんや"],"next week":["来週","らいしゅう"],"on the weekend":["週末","しゅうまつ"],there:["そこ"],"in tokyo":["東京","とうきょう"],"in kyoto":["京都","きょうと"]}[k];
      const tw=!W&&T.length===1?[T[0],C("の")]:[];if(tw.length)T=[];return fx([...(W?[C(W[0],W[1]||W[0]),C("の")]:tw),C("天気","てんき"),WA,C("どう"),DESU,KA])}],
    [/^how much (?:is it|is that|is this|are they|does it come to|will it be|do i owe you) (?:altogether|all together|in total|total)$|^how much (?:altogether|in total)$/i,()=>fx([C("全部で","ぜんぶで"),C("いくら"),DESU,KA])],
    [/^(?:i'm|i am) (?:so |really |very )?(happy|glad) for you$/i,()=>fx([C("本当に","ほんとうに"),C("よかった"),C("です"),C("ね")])],
    [/^(?:i|we) feel (?:so |really |very |kind of )?(bad|sorry) for (him|her|them|you|my [a-z]+|[A-Z][a-z]+)$/i,m=>{const k=m[2].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[2]);if(!W)return null;return fx([...W.chunks,GA,C("かわいそう"),DESU],W.used)}],
    [/^(?:i|we) got (an? |)(a|b|c|d|f|a\+|a-|b\+|100|a hundred|a perfect score|full marks|perfect) on (?:my |the |our )?(test|exam|quiz|math test|english test|final|finals|midterm)$/i,m=>{const g=m[2].toLowerCase();const G=/^(100|a hundred|a perfect score|full marks|perfect)$/.test(g)?[C("満点","まんてん")]:[C(g.toUpperCase())];const N=/quiz/i.test(m[3])?["小テスト","しょうテスト"]:["テスト"];
      return fx([C(N[0],N[1]||N[0]),C("で"),...G,O,C("取りました","とりました")])}],
    [/^(?:the |my |our )?(.+?) took (?:a lot |much |way )?longer than (?:expected|i expected|we expected|i thought|we thought|usual)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const us=/usual/i.test(m[0]);return fx([...dropMy(np.chunks),WA,C(us?"いつもより":"思ったより",us?"いつもより":"おもったより"),C("時間","じかん"),GA,C("かかりました")],np.used)}],
    [/^(?:i|we) (?:can not|cannot|can't) decide between (?:these|those|the) (two|three)(?: ones)?$/i,m=>fx([C(/two/i.test(m[1])?"この二つ":"この三つ",/two/i.test(m[1])?"このふたつ":"このみっつ"),C("で"),C("迷って","まよって"),C("います")])],
    [/^this one or that one$/i,()=>fx([C("これ"),DESU,KA,CM,C("それとも"),C("あれ"),DESU,KA])],
    [/^(?:i|we) (?:don't|do not) need (?:a |any )?(bag|receipt|straw|fork|chopsticks|spoon|napkin|napkins|plastic bag|bags|wrapping|a bag)(?:,? thanks| thank you)?$/i,m=>{const k=m[1].toLowerCase();const W={bag:["袋","ふくろ"],"plastic bag":["袋","ふくろ"],bags:["袋","ふくろ"],receipt:["レシート"],straw:["ストロー"],fork:["フォーク"],chopsticks:["お箸","おはし"],spoon:["スプーン"],napkin:["ナプキン"],napkins:["ナプキン"],wrapping:["包装","ほうそう"]}[k];
      return fx([C(W[0],W[1]||W[0]),WA,C("大丈夫","だいじょうぶ"),DESU])}],
    [/^(?:it|this|they|these|the [a-z]+) (?:doesn't|does not|don't|do not) fit(?: me)?$/i,()=>fx([C("サイズ"),GA,C("合いません","あいません")])],
    [/^(?:it|this|they|these) fits?(?: me)? (?:perfectly|well|great)$/i,()=>fx([C("ぴったり"),DESU])],
    [/^(?:i'm|i am|we're|we are) just (?:looking|browsing)(?: around)?$/i,()=>fx([C("見て","みて"),C("いる"),C("だけ"),DESU])],
    [/^(?:i|we) (do not |don't |really )?(like|love|enjoy|hate) ([a-z]+ing\b.*)$/i,m=>{const vp=vpIng(m[3]);const d=vp&&vplain(vp.v,"dict");if(!d)return null;const neg=!!m[1]&&!/really/i.test(m[1]);const k=m[2].toLowerCase();
      const A0=k==="hate"?["大嫌い","だいきらい"]:k==="love"||/really/i.test(m[1]||"")?["大好き","だいすき"]:["好き","すき"];return fx([...dropMy(vp.pre),...d,C("の"),GA,C(A0[0],A0[1]),C(neg?"じゃない":""),DESU].filter(c=>c[0]!==""),vp.used)}],
    [/^what (?:does|do) (he|she|they|you|your [a-z]+|my [a-z]+|[A-Z][a-z]+) (like|love|want|need)$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="you"&&!W)return null;
      const A0={like:["好き","すき"],love:["大好き","だいすき"],want:["欲しい","ほしい"],need:["必要","ひつよう"]}[m[2].toLowerCase()];return fx([...(W?[...dropMy(W.chunks),WA]:[]),C("何","なに"),GA,C(A0[0],A0[1]),DESU,KA],W?W.used:[])}],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+|they|someone|everyone) asked (me|us) (?:if|whether) (.+)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:k==="someone"?{chunks:[C("誰か","だれか")],used:[]}:k==="everyone"?{chunks:[C("みんな")],used:[]}:who(m[1]);if(!W)return null;
      let c=" "+m[3]+" ";c=c.replace(/ with (him|her|them)\b/gi," with you").replace(/ (i|we) wanted to /i," $1 want to ").replace(/ (i|we) was /i," $1 am ").replace(/ (i|we) were /i," we are ").replace(/ (i|we) could /i," $1 can ").replace(/ (i|we) had /i," $1 have ").replace(/ (i|we) liked /i," $1 like ").replace(/ (i|we) knew /i," $1 know ").trim();
      let r=null;try{r=compose1(c)}catch(e){}let p=r&&toPlain(r.chunks);if(!p)return null;if(p[p.length-1][0]==="だ")p=p.slice(0,-1);return fx([...W.chunks,C("に"),...dropMy(p),C("か"),C("と"),C("聞かれました","きかれました")],[...W.used,...r.used])}],
    [/^(?:my )?(brother|sister|mom|mother|dad|father|son|daughter|friend|wife|husband|cousin) and i look (?:really |very |so |kind of |a lot |pretty )?(similar|alike|the same)$|^we look (?:really |very |so |kind of |a lot |pretty )?(similar|alike|the same)$/i,m=>{const W=m[1]?NP("my "+m[1]):null;if(m[1]&&!W)return null;const ex=/same/i.test(m[2]||m[3]||"");
      return fx([...(W?[...W.chunks,C("と"),C("私","わたし")]:[C("私たち","わたしたち")]),WA,...(ex?[C("そっくり"),DESU]:[...(/really|very|so|a lot/i.test(m[0])?[C("とても")]:[]),C("似て","にて"),C("います")])],W?W.used:[])}],
    [/^(?:i|we) (?:have |'ve )?decided to (.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("こと"),C("に"),C("しました")],vp.used)}],
    [/^(he|she|you|they|my [a-z]+|[A-Z][a-z]+) (?:is|are|was|were|'s) the (?:one|person|guy|one person) who (.+)$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?{chunks:[C("あなた")],used:[]}:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;
      let r=null;try{r=compose1("someone "+m[2])}catch(e){}if(!r){try{r=compose1("he "+m[2])}catch(e){}}let p=r&&toPlain(r.chunks);if(!p)return null;if(/^(彼|誰か)$/.test(p[0][0])&&/^(は|が)$/.test((p[1]||[])[0]))p=p.slice(2);return fx([...p,C("の"),WA,...W.chunks,DESU],[...W.used,...r.used])}],
    [/^the more (?:i|you|we) (.+?),? (?:the more (?:i|you|we) (like|love|enjoy) it|the (better) (?:you|i|we) (?:get|become|will get|'ll get))$/i,m=>{const vp=VP(m[1]);const st=vp&&!vp.past&&vstems(vp.v);const d=vp&&vplain(vp.v,"dict");if(!st||!d||!st.i)return null;
      const ba=vp.v.jp.endsWith("する")||/(^|,)vs/.test(vp.v.pos||"")&&!/[るうくぐすつぬぶむ]$/.test(vp.v.jp)?null:null;const dl=d[d.length-1];const e=dl[0].slice(-1),ek=(dl[1]||"").slice(-1);const BA={"る":"れば","う":"えば","く":"けば","ぐ":"げば","す":"せば","つ":"てば","ぬ":"ねば","ぶ":"べば","む":"めば"};if(!BA[e]||!BA[ek])return null;
      const b=[...d.slice(0,-1),C(dl[0].slice(0,-1)+BA[e],(dl[1]||"").slice(0,-1)+BA[ek])];return fx([...dropMy(vp.pre),...b,...d.slice(-1).map(c=>c[0].slice(-2)==="する"?C("する","する"):C(c[0],c[1])),C("ほど"),...(m[3]?[C("上手","じょうず")]:[C(/love/i.test(m[2])?"大好き":"好き",/love/i.test(m[2])?"だいすき":"すき")]),C("に"),C("なります")],vp.used)}],
    [/^(?:can|could) you remind me (?:to )?(.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("ように"),C("言って","いって"),C("もらえます"),KA],vp.used)}],
    [/^(?:i|we) (?:have been|'ve been) meaning to (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.past||vp.ing)return null;const vo=volit(vp.v);if(!vo)return null;return fx([C("ずっと"),...dropMy(vp.pre),C(vo[0],vo[1]),C("と"),C("思って","おもって"),C("いました")],vp.used)}],
    [/^(?:i|we) (?:did not|didn't) (?:realize|realise|notice|know) (?:that )?it was (?:so|this|that) late$/i,()=>fx([C("もう"),C("こんな"),C("時間","じかん"),C("だ"),C("とは"),C("気づきませんでした","きづきませんでした")])],
    [/^(?:i|we) (?:did not|didn't) (?:realize|realise|notice) (?:that )?(.+)$/i,m=>{let r=null;try{r=compose1(m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([...p,C("とは"),C("気づきませんでした","きづきませんでした")],r.used)}],
    [/^it(?:'s| is| was) (hard|difficult|easy|fun|nice|important|expensive|impossible|dangerous|boring|scary) to (find|get|buy|make|learn|see|meet|rent|book) (.+)$/i,m=>{const vp=VP(m[2]+" "+m[3]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;
      const A0={hard:["難しい","むずかしい"],difficult:["難しい","むずかしい"],easy:["簡単","かんたん"],fun:["楽しい","たのしい"],nice:["いい"],important:["大切","たいせつ"],expensive:["高い","たかい"],impossible:["無理","むり"],dangerous:["危ない","あぶない"],boring:["つまらない"],scary:["怖い","こわい"]}[m[1].toLowerCase()];
      return fx([...dropMy(vp.pre),...d,C("の"),WA,C(A0[0],A0[1]||A0[0]),C(/was/i.test(m[0])?(/い$/.test(A0[0])?"":"でした"):"です")].filter(c=>c[0]!==""),vp.used)}],
    [/^(?:my )?(dad|father|mom|mother|brother|sister|grandpa|grandma|grandfather|grandmother|friend|teacher|uncle|aunt|he|she|[A-Z][a-z]+) taught me how to (.+)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:/^[A-Z]/.test(m[1])&&!/^(dad|mom)/i.test(m[1])?who(m[1]):NP("my "+m[1]);if(!W)return null;const vp=VP(m[2]);if(!vp||vp.past||vp.ing)return null;const st=vstems(vp.v);if(!st||!st.i)return null;
      let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("の"),...pre.slice(oi+1)];const ni=pre.map(c=>c[0]).lastIndexOf("に");if(ni>=0&&ni===pre.length-1)pre=[...pre.slice(0,ni),C("の"),...pre.slice(ni+1)];
      return fx([...dropMy(W.chunks),C("に"),...pre,C(st.i[0]+"方",st.i[1]+"かた"),O,C("教えて","おしえて"),C("もらいました")],[...W.used,...vp.used])}],
    [/^(she|he|you|my [a-z]+|[A-Z][a-z]+) (?:has|have) been my (best )?friend(?: for (two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|\d+) years)?$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?{chunks:[C("あなた")],used:[]}:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;const nm=m[3]||(/ for (\w+) years\b/i.exec(s0)||[])[1];if(!nm)return null;const n=numOf(nm);if(!n||n>99)return null;T=[];
      const kj=n<=10?KJ[n]:n<20?"十"+KJ[n-10]:KJ[Math.floor(n/10)]+"十"+(n%10?KJ[n%10]:"");return fx([...W.chunks,C("とは"),C(kj+"年来","ねんらい"),C("の"),C(m[2]?"親友":"友達",m[2]?"しんゆう":"ともだち"),DESU],W.used)}],
    [/^(?:we|i) (?:got there|got here|made it|arrived) (?:just )?in time$/i,()=>fx([C("ぎりぎり"),C("間に合いました","まにあいました")])],
    [/^(?:i|we) (?:can not|cannot|can't) believe (?:that )?(.+)$/i,m=>{if(/^(it|that|this|you|him|her|them|my eyes)$/i.test(m[1])||/^(how|what|who|where|when|why)\b/i.test(m[1]))return null;let r=null;try{r=compose1(m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([...p,C("なんて"),C("信じられません","しんじられません")],r.used)}],
    [/^(?:the store|the shop|they|it) (?:was|were|is|are) (?:sold )?out of (?:the )?(.+?)( (?:that )?(?:i|we) wanted)?$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const past=/\b(was|were)\b/i.test(m[0]);return fx([...(m[2]?[C("欲しかった","ほしかった")]:[]),...np.chunks,GA,C("売り切れ","うりきれ"),C(past?"でした":"です")],np.used)}],
    [/^there(?:'s| is) no need to (.+)$|^(?:you|we) (?:don't|do not) need to (hurry|rush|worry|apologize|thank me|pay|wait)$/i,m=>{const vp=VP(m[1]||m[2]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("必要","ひつよう"),WA,C("ありません")],vp.used)}],
    [/^(?:if you're|if you are) hungry,? there(?:'s| is) (?:some )?(leftover )?(.+?) in the (fridge|kitchen|refrigerator)$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;return fx([C("お腹","おなか"),GA,C("空いて","すいて"),C("いたら"),CM,C(/kitchen/i.test(m[3])?"台所":"冷蔵庫",/kitchen/i.test(m[3])?"だいどころ":"れいぞうこ"),C("に"),...(m[1]?[C("残り","のこり"),C("の")]:[]),...np.chunks,GA,C("あります"),C("よ")],np.used)}],
    [/^(?:i|we) (?:do not|really do not|just do not) know what to do$/i,()=>fx([C("どう"),C("したら"),C("いい"),C("か"),C("分かりません","わかりません")])],
    [/^(?:i'm|i am) (?:so |very |really |truly |deeply )?sorry (?:for|about) your loss$/i,()=>fx([C("ご愁傷様","ごしゅうしょうさま"),DESU])],
    [/^(?:i'm|i am) (?:so |very |really )?sorry (?:for|about) (the delay|the wait|keeping you waiting|making you wait|the late reply|my late reply|the inconvenience|the confusion|the mess|the noise|being so late|bothering you)$/i,m=>{const k=m[1].toLowerCase();
      const W={"the delay":[["遅く","おそく"],["なって"]],"the wait":[["お待たせ","おまたせ"],["して"]],"keeping you waiting":[["お待たせ","おまたせ"],["して"]],"making you wait":[["お待たせ","おまたせ"],["して"]],"the late reply":[["返事","へんじ"],["が"],["遅く","おそく"],["なって"]],"my late reply":[["返事","へんじ"],["が"],["遅く","おそく"],["なって"]],"the inconvenience":[["ご迷惑","ごめいわく"],["を"],["おかけして"]],"the confusion":[["混乱","こんらん"],["させて"]],"the mess":[["散らかって","ちらかって"],["いて"]],"the noise":[["うるさくて"]],"being so late":[["遅く","おそく"],["なって"]],"bothering you":[["お邪魔","おじゃま"],["して"]]}[k];
      return fx([...W.map(x=>C(x[0],x[1]||x[0])),C("すみません")])}],
    [/^(?:omg |oh no |oh |wow )?(?:i|we) (?:totally |completely |just )?forgot (?:all )?about (.+)$/i,m=>{const k=m[1].toLowerCase();const tot=/totally|completely/i.test(m[0]);if(/^(it|that|this)$/.test(k))return fx([...(tot?[C("すっかり")]:[]),C("忘れて","わすれて"),C("いました")]);const np=/^(you|him|her|them)$/.test(k)?{chunks:[PJ[k]],used:[]}:NP(m[1]);if(!np||np.pron)return null;
      return fx([...dropMy(np.chunks),C("の"),C("こと"),O,...(tot?[C("すっかり")]:[]),C("忘れて","わすれて"),C("いました")],np.used)}],
    [/^(?:i'm|i am) down for (?:whatever|anything)$|^(?:whatever|anything) is fine(?: with me)?$|^(?:i'm|i am) (?:fine|ok|okay|good) with (?:whatever|anything)$/i,()=>fx([C("何でも","なんでも"),C("いい"),C("です"),C("よ")])],
    [/^(?:i|we) have (?:a lot|so much|too much|lots) on (?:my|our) minds?$/i,()=>fx([C("考える","かんがえる"),C("こと"),GA,C("たくさん"),C("あります")])],
    [/^it(?:'s| is) (?:raining|pouring) (?:so |really |very |super )?(hard|heavily|a lot)$/i,()=>fx([C("雨","あめ"),GA,C("すごく"),C("降って","ふって"),C("います")])],
    [/^(?:i|we) miss (you|him|her|them|my family|my mom|my dad|home|japan) (?:so much|a lot|so so much|too)$/i,m=>{const k=m[1].toLowerCase();if(/^(home|japan)$/.test(k))return fx([C(k==="home"?"家":"日本",k==="home"?"いえ":"にほん"),GA,C("とても"),C("恋しい","こいしい"),DESU]);const W=PJ[k]?[PJ[k]]:k==="my family"?[C("家族","かぞく")]:k==="my mom"?[C("母","はは")]:[C("父","ちち")];
      return fx([...(k==="you"?[]:[...W,C("に")]),C("とても"),C("会いたい","あいたい"),DESU])}],
    [/^is there (?:any|some) in (this|it|that|here)$|^does (?:this|it|that) (?:have|contain) (?:any )?(?:in it)?$/i,()=>fx([C("これ"),C("に"),C("入って","はいって"),C("います"),KA])],
    [/^it was (?:really |so |very )?(nice|great|good|lovely) (?:to meet|meeting) you$/i,m=>fx([C("お会い","おあい"),C("できて"),...(/really|so|very/i.test(m[0])?[C("本当に","ほんとうに")]:[]),C("よかった"),DESU])],
    [/^(?:congrats|congratulations) on (?:your |the )?(.+)$/i,m=>{const k=m[1].toLowerCase().replace(/^(new )?(baby)$/,"baby");
      const SP={wedding:["ご結婚","ごけっこん"],marriage:["ご結婚","ごけっこん"],"getting married":["ご結婚","ごけっこん"],graduation:["ご卒業","ごそつぎょう"],"new job":["ご就職","ごしゅうしょく"],job:["ご就職","ごしゅうしょく"],graduating:["ご卒業","ごそつぎょう"],baby:["ご出産","ごしゅっさん"],promotion:["ご昇進","ごしょうしん"],engagement:["ご婚約","ごこんやく"],"getting engaged":["ご婚約","ごこんやく"],"passing the exam":["合格","ごうかく"],"passing your exam":["合格","ごうかく"]}[k];
      if(SP)return fx([C(SP[0],SP[1]),C("おめでとうございます")]);const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,CM,C("おめでとうございます")],np.used)}],
    [/^what does (this|that|the|it) ?(sign|note|letter|message|label|paper|board|menu|card)? ?say$/i,m=>{const d=/that/i.test(m[1])?"あの":"この";const N=m[2]?{sign:["看板","かんばん"],note:["メモ"],letter:["手紙","てがみ"],message:["メッセージ"],label:["ラベル"],paper:["紙","かみ"],board:["掲示板","けいじばん"],menu:["メニュー"],card:["カード"]}[m[2].toLowerCase()]:null;
      return fx([...(N?[C(d),C(N[0],N[1]||N[0])]:[C(/that/i.test(m[1])?"それ":"これ")]),C("には"),C("何","なん"),C("と"),C("書いて","かいて"),C("あります"),KA])}],
    [/^(?:i'll |i will )?be right back$/i,()=>fx([C("すぐ"),C("戻ります","もどります")])],
    [/^where did (i|you|we|he|she|they) (.+)$/i,m=>{const vp=VP(m[2]);if(!vp||vp.past||vp.ing)return null;const e=vend(vp.v,"mashitaka");if(!e)return null;const ni=/^(置く|忘れる|止める|行く|隠す|しまう|入れる|泊まる|住む|来る|帰る|座る)$/.test(vp.v.jp);
      const S=/^(he|she|they)$/i.test(m[1])?[PJ[m[1].toLowerCase()],WA]:[];return fx([...S,C("どこ"),C(ni?"に":"で"),...dropMy(vp.pre),...e],vp.used)}],
    [/^(?:he|she|they|my [a-z]+|[A-Z][a-z]+) (?:is|are) not here$/i,m=>{if(!/\bstill\b/i.test(q))return null;const w0=m[0].replace(/ (is|are) not here$/i,"");const k=w0.toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(w0);if(!W)return null;return fx([...W.chunks,WA,C("まだ"),C("来て","きて"),C("いません")],W.used)}],
    [/^(my [a-z]+|he|she|they|[A-Z][a-z]+) (always |often |keeps |never )?(tells|told|telling) me (?:to|that i should) (.+)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;const vp=VP(m[4]);if(!vp||vp.past||vp.ing)return null;const st=vstems(vp.v);if(!st||!st.te)return null;
      const adv=/always|keeps/i.test(m[2]||"")?[C("いつも")]:/often/i.test(m[2]||"")?[C("よく")]:[];const past=/told/i.test(m[3]);
      return fx([...W.chunks,WA,...adv,C("「",null),...dropMy(vp.pre),C(st.te[0],st.te[1]),C("」",null),C("と"),C(past?"言いました":"言います",past?"いいました":"いいます")],[...W.used,...vp.used])}],
    [/^(.+?) (?:wouldn't|would not|won't|will not|doesn't|does not|didn't|did not|can't|cannot|can not) stop ([a-z]+ing)(?: (.+))?$/i,m=>{let w0=m[1].trim(),pl=[];const pm=/ on the (plane|train|bus|flight|subway)$/i.exec(w0);if(pm){pl=[C({plane:"飛行機",flight:"飛行機",train:"電車",bus:"バス",subway:"地下鉄"}[pm[1].toLowerCase()],{plane:"ひこうき",flight:"ひこうき",train:"でんしゃ",bus:"ばす",subway:"ちかてつ"}[pm[1].toLowerCase()]),C("で")];w0=w0.slice(0,pm.index)}
      const nm=/^the (guy|man|woman|person|lady|girl|boy|kid|baby|people) (?:next to|beside|behind|in front of) (?:me|us)$/i.exec(w0);const k=w0.toLowerCase();if(/^(i|we)$/.test(k))return null;
      const W=nm?{chunks:[C(/next to|beside/i.test(w0)?"隣":/behind/i.test(w0)?"後ろ":"前",/next to|beside/i.test(w0)?"となり":/behind/i.test(w0)?"うしろ":"まえ"),C("の"),C(/kid|girl|boy/i.test(nm[1])?"子":/baby/i.test(nm[1])?"赤ちゃん":"人",/kid|girl|boy/i.test(nm[1])?"こ":/baby/i.test(nm[1])?"あかちゃん":"ひと")],used:[]}:PJ[k]?{chunks:[PJ[k]],used:[]}:/^(the |my |a )/i.test(w0)?NP(w0):who(w0);if(!W||W.pron)return null;
      const vp=vpIng(m[2]+(m[3]?" "+m[3]:""));const st=vp&&vstems(vp.v);if(!st||!st.te)return null;const past=/^(wouldn't|would not|didn't|did not)/i.test(m[0].slice(m[1].length+1));
      return fx([...pl,...dropMy(W.chunks),GA,C("ずっと"),...dropMy(vp.pre),C(st.te[0],st.te[1]),C(past?"いました":"います")],[...W.used,...vp.used])}],
    [/^(i|we|he|she|they) ended up ([a-z]+ing)(?: (.+))?$/i,m=>{let vp=vpIng(m[2]+(m[3]?" "+m[3]:""));if(vp&&vp.v.jp==="泊まる"&&T.some(c=>/^(一日中|ずっと)$/.test(c[0]))){const iru={jp:"いる",kana:"いる",pos:"v1,vi",en:"be",kind:"form"};if(iru)vp={...vp,v:iru,pre:vp.pre.map(c=>c[0]==="に"?C("に"):c)}}const e=vp&&vend(vp.v,"mashita");if(!e)return null;const tt=T;T=[];const S=/^(he|she|they)$/i.test(m[1])?[PJ[m[1].toLowerCase()],WA]:[];return fx([...S,C("結局","けっきょく"),...tt,...dropMy(vp.pre),...e],vp.used)}],
    [/^there(?:'s| is| are) (?:a |an |some |the )?(.+?) (?:right )?across the (street|road)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([C("道","みち"),C("の"),C("向かい","むかい"),C("に"),...np.chunks,GA,C("あります")],np.used)}],
    [/^(?:i|we) would (?:really )?love to (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.past||vp.ing)return null;const e=vend(vp.v,"tai");if(!e)return null;return fx([C("ぜひ"),...dropMy(vp.pre),...e],vp.used)}],
    [/^(?:is there )?anything (?:i|we) can do(?: to help)?$/i,m=>fx([C("何か","なにか"),C(/help/i.test(m[0])?"手伝える":"できる",/help/i.test(m[0])?"てつだえる":"できる"),C("こと"),WA,C("あります"),KA])],
    [/^(?:we|i) have (?:a lot|so much|lots) in common$/i,()=>fx([C("私たち","わたしたち"),WA,C("共通点","きょうつうてん"),GA,C("多い","おおい"),DESU])],
    [/^(?:we|i) (?:can|could) go (?:wherever|anywhere) you (?:want|like)(?: to)?$/i,()=>fx([C("行きたい","いきたい"),C("ところ"),C("なら"),C("どこ"),C("でも"),C("いい"),C("です"),C("よ")])],
    [/^(?:we can do |we can eat |i'll eat |i can eat )?(?:whatever|anything) you (?:want|like)(?: to)?$/i,()=>fx([C("何でも","なんでも"),C("いい"),C("です"),C("よ")])],
    [/^(?:i'm|i am) not in the mood (?:to (.+)|for (.+))$/i,m=>{if(m[1]){const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("気分","きぶん"),C("じゃない"),DESU],vp.used)}
      const np=NP(m[2]);if(!np||np.pron)return null;return fx([...np.chunks,C("の"),C("気分","きぶん"),C("じゃない"),DESU],np.used)}],
    [/^(?:please )?(call|text|tell|message|contact) me if (?:anything|something) (?:happens|comes up|changes|goes wrong)(?: please)?$/i,m=>{const V={call:["電話して","でんわして"],text:["連絡して","れんらくして"],message:["連絡して","れんらくして"],contact:["連絡して","れんらくして"],tell:["教えて","おしえて"]}[m[1].toLowerCase()];return fx([C("何か","なにか"),C("あったら"),CM,C(V[0],V[1]),KUDASAI])}],
    [/^nobody (?:told me|said) (?:that )?(.+)$/i,m=>{let r=null;try{r=compose1(m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([...p,C("って"),C("誰も","だれも"),C("教えて","おしえて"),C("くれませんでした")],r.used)}],
    [/^(he|she|they|my [a-z]+|[A-Z][a-z]+) (?:is|are|'s) still not here$|^(he|she|they|my [a-z]+|[A-Z][a-z]+) (?:isn't|is not|aren't|are not) here yet$|^(he|she|they|my [a-z]+|[A-Z][a-z]+) (?:hasn't|has not|haven't|have not) (?:come|arrived|shown up|gotten here) yet$/i,m=>{const w0=m[1]||m[2]||m[3];const k=w0.toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(w0);if(!W)return null;return fx([...W.chunks,WA,C("まだ"),C("来て","きて"),C("いません")],W.used)}],
    [/^(?:i|we) keep forgetting (?:to )?(.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("の"),O,C("つい"),C("忘れて","わすれて"),C("しまいます")],vp.used)}],
    [/^(?:i'm|i am|we're|we are) trying to get better at (.+)$/i,m=>{const vp=VP("get better at "+m[1]);const d=vp&&vplain(vp.v,"dict");if(!d)return null;return fx([...vp.pre,...d,C("ように"),C("頑張って","がんばって"),C("います")],vp.used)}],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+|you) looks? (a lot |just |exactly |so much |kind of |a little )?like (his|her|your|my|their) (mother|mom|father|dad|sister|brother|grandma|grandmother|grandpa|grandfather|parents|aunt|uncle)$/i,m=>{const k=m[1].toLowerCase(),W=k==="you"?{chunks:[C("あなた")],used:[]}:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;
      const F={mother:["お母さん","おかあさん"],mom:["お母さん","おかあさん"],father:["お父さん","おとうさん"],dad:["お父さん","おとうさん"],sister:["お姉さん","おねえさん"],brother:["お兄さん","おにいさん"],grandma:["おばあさん"],grandmother:["おばあさん"],grandpa:["おじいさん"],grandfather:["おじいさん"],parents:["ご両親","ごりょうしん"],aunt:["おばさん"],uncle:["おじさん"]}[m[4].toLowerCase()];
      const ex=/just|exactly/i.test(m[2]||"");return fx([...W.chunks,WA,C(F[0],F[1]),C("に"),...(ex?[C("そっくり"),DESU]:[C(/a little|kind of/i.test(m[2]||"")?"少し":"よく",/a little|kind of/i.test(m[2]||"")?"すこし":"よく"),C("似て","にて"),C("います")])],W.used)}],
    [/^how long (?:are you|will you be|are you going to be) (?:staying|stay|be) (?:in )?(.+)$/i,m=>{const k=m[1].toLowerCase();const np=/^here$/.test(k)?{chunks:[C("ここ")],used:[]}:NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,C("に"),C("どのくらい"),C("いる"),C("予定","よてい"),DESU,KA],np.used)}],
    [/^how long (?:are you|will you be) (?:staying|here)$/i,()=>fx([C("どのくらい"),C("いる"),C("予定","よてい"),DESU,KA])],
    [/^(?:it's|it is|this is) (?:the|my) first time (?:that )?(?:i've|i have|i ever|i) (?:ever )?([a-z]+) (.+)$/i,m=>{const PP={eaten:"ate",seen:"saw",done:"did",tried:"tried",gone:"went",had:"had",ridden:"rode",driven:"drove",taken:"took",written:"wrote",drunk:"drank",flown:"flew",sung:"sang",swum:"swam",worn:"wore",met:"met",played:"played",visited:"visited",heard:"heard",made:"made",cooked:"cooked",climbed:"climbed",read:"read",watched:"watched",used:"used",bought:"bought",worked:"worked",skied:"skied",traveled:"traveled",travelled:"traveled",stayed:"stayed",been:null}[m[1].toLowerCase()];if(!PP)return null;
      let r=null;try{r=compose1("I "+PP+" "+m[2])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;return fx([...dropMy(p),C("の"),WA,C("初めて","はじめて"),DESU],r.used)}],
    [/^(?:i|we|he|she|they) (?:have not|has not|haven't|hasn't) (?:even )?(seen|met|talked to|spoken to|heard from|called|visited|eaten|finished|done|started|read|watched|decided|booked|packed|paid|bought|told|gotten|received|cleaned|fed|answered|replied to|written|sent|tried|used) ?(.*?)(?: yet)?$/i,m=>{
      const B={seen:"see",met:"meet","talked to":"talk to","spoken to":"talk to","heard from":"hear from",called:"call",visited:"visit",eaten:"eat",finished:"finish",done:"do",started:"start",read:"read",watched:"watch",decided:"decide",booked:"book",packed:"pack",paid:"pay",bought:"buy",told:"tell",gotten:"get",received:"get",cleaned:"clean",fed:"feed",answered:"answer","replied to":"reply to",written:"write",sent:"send",tried:"try",used:"use"}[m[1].toLowerCase()];
      let v0=B,o=m[2];if(/^see$/.test(B)&&/^(him|her|them|you|my [a-z]+|[A-Z][a-z]+|each other)$/.test(o))v0="meet";if(/^hear from$/.test(B)){const k=o.toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(o);if(!W)return null;return fx([...W.chunks,C("から"),C("連絡","れんらく"),GA,C("ありません")],W.used)}
      const vp=VP((v0+" "+o).trim());if(!vp||vp.past||vp.ing)return null;const st=vstems(vp.v);if(!st||!st.te)return null;const yet=/\byet\b/i.test(m[0]);
      const S=/^(he|she|they)$/i.test(m[0].split(" ")[0])?[PJ[m[0].split(" ")[0].toLowerCase()],WA]:[];return fx([...S,...(yet?[C("まだ")]:[]),...dropMy(vp.pre),C(st.te[0],st.te[1]),C("いません")],vp.used)}],
    [/^(?:the |this |my |our )?(.+?) (?:is|are) (?:out of order|broken down|out of service)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),WA,C("故障中","こしょうちゅう"),DESU],np.used)}],
    [/^(?:i'm|i am|we're|we are) running (?:a little |a bit |kind of |really |very |so )?late(?: for (work|school|class|the meeting|my meeting|the train|my flight|the flight|dinner|the party|my appointment|the appointment))?$/i,m=>{const k=(m[1]||"").toLowerCase();
      const W={work:["仕事","しごと"],school:["学校","がっこう"],class:["授業","じゅぎょう"],"the meeting":["会議","かいぎ"],"my meeting":["会議","かいぎ"],"the train":["電車","でんしゃ"],"my flight":["飛行機","ひこうき"],"the flight":["飛行機","ひこうき"],dinner:["晩ご飯","ばんごはん"],"the party":["パーティー"],"my appointment":["予約","よやく"],"the appointment":["予約","よやく"]}[k];
      return fx(W?[C(W[0],W[1]||W[0]),C("に"),C("遅れ","おくれ"),C("そう"),DESU]:[C("ちょっと"),C("遅れて","おくれて"),C("います")])}],
    [/^i (?:really |just )?(?:like|love) your (.+)$/i,m=>{const k=m[1].toLowerCase();const np=NP(m[1]);if(!np||np.pron)return null;
      if(k==="hair")return fx([C("髪","かみ"),CM,C("きれい"),C("です"),C("ね")]);
      if(/^(shoes|dress|shirt|jacket|bag|hat|haircut|glasses|watch|earrings|necklace|outfit|sweater|coat|scarf|room|house|car|tattoo|nails|ring|t-shirt|skirt|pants|jeans|boots|sneakers|apartment|place)$/.test(k))return fx([C("その"),...np.chunks,CM,C("すてき"),C("です"),C("ね")],np.used);
      return fx([C("あなた"),C("の"),...np.chunks,GA,C(/love/i.test(m[0])?"大好き":"好き",/love/i.test(m[0])?"だいすき":"すき"),DESU],np.used)}],
    [/^(?:i don't think|i do not think) (?:that's|that is|it's|it is|this is) a (?:good|great) idea$/i,()=>fx([C("それは"),C("あまり"),C("いい"),C("考え","かんがえ"),C("じゃない"),C("と"),C("思います","おもいます")])],
    [/^do you have (?:any )?plans(?: for (tonight|tomorrow|the weekend|this weekend|saturday|sunday|friday|christmas|the holidays|summer|new year's|today|later))?$/i,m=>{const k=(m[1]||"").toLowerCase();
      const W={tonight:["今夜","こんや"],tomorrow:["明日","あした"],"the weekend":["週末","しゅうまつ"],"this weekend":["今週末","こんしゅうまつ"],saturday:["土曜日","どようび"],sunday:["日曜日","にちようび"],friday:["金曜日","きんようび"],christmas:["クリスマス"],"the holidays":["休み","やすみ"],summer:["夏休み","なつやすみ"],"new year's":["お正月","おしょうがつ"],today:["今日","きょう"],later:["この後","このあと"]}[k];
      return fx([...(W?[C(W[0],W[1]||W[0]),WA]:[]),C("何か","なにか"),C("予定","よてい"),GA,C("あります"),KA])}],
    [/^(?:i|we) (?:got|get|am|are|was|were|'m|'re) (?:stuck|caught) in (?:a lot of |heavy |bad |the )?traffic$/i,m=>{const now=/\b(am|are|'m|'re)\b/i.test(m[0]);return fx([C("渋滞","じゅうたい"),C(now?"に":"に"),C(now?"はまっています":"巻き込まれました",now?"はまっています":"まきこまれました")])}],
    [/^it(?:'s| is) (?:already |slowly |really )?getting (dark|cold|late|hot|warm|cool|light|windy|cloudy|chilly|colder|warmer|darker|hotter)(?: outside| out)?$/i,m=>{const k=m[1].toLowerCase().replace(/er$/,"").replace(/^dark$/,"dark").replace(/^hott$/,"hot").replace(/^dark$/,"dark");
      const W={dark:["暗く","くらく"],cold:["寒く","さむく"],col:["寒く","さむく"],late:["遅く","おそく"],hot:["暑く","あつく"],hott:["暑く","あつく"],warm:["暖かく","あたたかく"],cool:["涼しく","すずしく"],light:["明るく","あかるく"],chilly:["寒く","さむく"]}[k]||{"colder":["寒く","さむく"]}[m[1].toLowerCase()];
      const out=/\b(outside|out)$/i.test(m[0]);
      if(/^windy$/i.test(m[1]))return fx([C("風","かぜ"),GA,C("強く","つよく"),C("なって"),C("きました")]);
      if(/^cloudy$/i.test(m[1]))return fx([C("曇って","くもって"),C("きました")]);
      if(!W)return null;return fx([...(out?[C("外","そと"),GA]:/^late$/i.test(k)?[C("もう")]:[]),C(W[0],W[1]),C("なって"),C("きました")])}],
    [/^it (?:was|has been|'s been) (?:really |so |very )?(?:nice|great|good|lovely|fun) (?:talking|chatting|to talk|speaking) (?:to|with) you$/i,()=>fx([C("お話し","おはなし"),C("できて"),C("よかった"),DESU])],
    [/^(she|he|my [a-z]+|[A-Z][a-z]+) has (?:really |very |such )?(long|short)(?:,? (black|brown|blonde|blond|red|gray|grey|white|dark))? hair$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;const L=/long/i.test(m[2]);
      const H={black:["黒髪","くろかみ"],brown:["茶髪","ちゃぱつ"],blonde:["金髪","きんぱつ"],blond:["金髪","きんぱつ"],red:["赤毛","あかげ"],gray:["白髪","しらが"],grey:["白髪","しらが"],white:["白髪","しらが"],dark:["黒髪","くろかみ"]}[(m[3]||"").toLowerCase()];
      return fx([...W.chunks,WA,...(H?[C(L?"長い":"短い",L?"ながい":"みじかい"),C(H[0],H[1])]:[C("髪","かみ"),GA,C(L?"長い":"短い",L?"ながい":"みじかい")]),DESU],W.used)}],
    [/^(?:i'm|i am|we're|we are) (?:just )?about to (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.past||vp.ing)return null;const d=vplain(vp.v,"dict");if(!d)return null;return fx([C("今から","いまから"),...dropMy(vp.pre),...d,C("ところ"),DESU],vp.used)}],
    [/^(?:the |this |my |our )?(.+?) (?:is|are) (?:just )?about to (start|begin|close|end|finish|leave|arrive|open)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;
      const V={start:["始まります","はじまります"],begin:["始まります","はじまります"],close:["閉まります","しまります"],end:["終わります","おわります"],finish:["終わります","おわります"],leave:["出発します","しゅっぱつします"],arrive:["着きます","つきます"],open:["開きます","あきます"]}[m[2].toLowerCase()];
      return fx([C("もうすぐ"),...dropMy(np.chunks),GA,C(V[0],V[1])],np.used)}],
    [/^(?:they|you|the store|the shop|this store|this shop) (?:don't|do not|doesn't|does not) have (?:this |it |these |them |that )?(?:in )?(my size|a bigger size|a smaller size|bigger sizes|smaller sizes|a larger size|my color|other colors|other sizes)$/i,m=>{const k=m[1].toLowerCase();
      const W={"my size":[["私","わたし"],["の"],["サイズ"]],"a bigger size":[["大きい","おおきい"],["サイズ"]],"bigger sizes":[["大きい","おおきい"],["サイズ"]],"a larger size":[["大きい","おおきい"],["サイズ"]],"a smaller size":[["小さい","ちいさい"],["サイズ"]],"smaller sizes":[["小さい","ちいさい"],["サイズ"]],"my color":[["私","わたし"],["の"],["好き","すき"],["な"],["色","いろ"]],"other colors":[["他","ほか"],["の"],["色","いろ"]],"other sizes":[["他","ほか"],["の"],["サイズ"]]}[k];
      return fx([...W.map(x=>C(x[0],x[1]||x[0])),GA,C("ありません")])}],
    [/^(?:do you|do they) have (?:this |it |these |them |that )?in (my size|a bigger size|a smaller size|a larger size|other colors|another color|a different color|a different size|other sizes|black|white|red|blue|small|medium|large)$/i,m=>{const k=m[1].toLowerCase();
      const W={"my size":[["私","わたし"],["の"],["サイズ"]],"a bigger size":[["もっと"],["大きい","おおきい"],["サイズ"]],"a larger size":[["もっと"],["大きい","おおきい"],["サイズ"]],"a smaller size":[["もっと"],["小さい","ちいさい"],["サイズ"]],"other colors":[["他","ほか"],["の"],["色","いろ"]],"another color":[["他","ほか"],["の"],["色","いろ"]],"a different color":[["他","ほか"],["の"],["色","いろ"]],"a different size":[["他","ほか"],["の"],["サイズ"]],"other sizes":[["他","ほか"],["の"],["サイズ"]],black:[["黒","くろ"]],white:[["白","しろ"]],red:[["赤","あか"]],blue:[["青","あお"]],small:[["S"],["サイズ"]],medium:[["M"],["サイズ"]],large:[["L"],["サイズ"]]}[k];
      return fx([...W.map(x=>C(x[0],x[1]||x[0])),WA,C("あります"),KA])}],
    [/^(?:it's|it is|this is) (?:my|our) (?:very )?first time(?: being| coming)? here$/i,()=>fx([C("ここ"),WA,C("初めて","はじめて"),DESU])],
    [/^(?:i|we) (?:was|were) (?:just )?about to (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.past||vp.ing)return null;const d=vplain(vp.v,"dict");if(!d)return null;return fx([C("ちょうど"),...dropMy(vp.pre),...d,C("ところ"),C("でした")],vp.used)}],
    [/^i wish (?:i|we) had more (.+)$/i,m=>{const k=m[1].toLowerCase();const np=/^(free time|time|spare time)$/.test(k)?{chunks:[C("時間","じかん")],used:[]}:NP(m[1]);if(!np||np.pron)return null;return fx([C("もっと"),...np.chunks,GA,C("あれば"),C("いい"),C("のに")],np.used)}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+) snores (?:really |so |very )?(loudly|loud|a lot)$/i,m=>{const k=m[1].toLowerCase(),W=PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(!W)return null;const lo=/loud/i.test(m[2]);
      return fx([...W.chunks,WA,...(lo?[C("いびき"),GA,C("すごく"),C("うるさい"),DESU]:[C("よく"),C("いびき"),O,C("かきます")])],W.used)}],
    [/^(?:my )?(legs|arms|body|shoulders|whole body|thighs|calves) (?:are|is|feel|feels) (?:so |really |very |super )?sore(?: from (the gym|working out|running|exercising|exercise|hiking|yesterday|the workout|lifting|soccer|training))?$/i,m=>{const P={legs:["足","あし"],arms:["腕","うで"],body:["体","からだ"],"whole body":["全身","ぜんしん"],shoulders:["肩","かた"],muscles:["体","からだ"],thighs:["太もも","ふともも"],calves:["ふくらはぎ"]}[m[1].toLowerCase()];
      const R={"the gym":[["ジム"],["に"],["行って","いって"]],"working out":[["運動","うんどう"],["して"]],exercising:[["運動","うんどう"],["して"]],exercise:[["運動","うんどう"],["して"]],running:[["走って","はしって"]],hiking:[["ハイキング"],["して"]],yesterday:[["昨日","きのう"],["の"],["運動","うんどう"],["で"]],"the workout":[["トレーニング"],["で"]],lifting:[["筋トレ","きんとれ"],["で"]],soccer:[["サッカー"],["で"]],training:[["トレーニング"],["で"]]}[(m[2]||"").toLowerCase()];
      return fx([...(R?[...R.map(x=>C(x[0],x[1]||x[0])),CM]:[]),C(P[0],P[1]||P[0]),GA,C("筋肉痛","きんにくつう"),DESU])}],
    [/^(?:and )?(?:now )?(?:i'm|i am|we're|we are|i got|we got|i was|we were) (?:completely |totally |all |so )?(soaked|drenched|soaking wet|wet through|soaked through)$/i,m=>fx([C("びしょ濡れ","びしょぬれ"),C(/\b(got|was|were)\b/i.test(m[0])?"になりました":"です")])],
    [/^(?:i|we) stayed up(?: all night| the whole night)?(?: ([a-z]+ing)(?: (.+))?)?$/i,m=>{const an=/all night|whole night/i.test(m[0])||T.some(c=>c[0]==="一晩中");if(!an)return null;T=[];
      if(m[1]){const vp=vpIng(m[1]+(m[2]?" "+m[2]:""));const e=vp&&vend(vp.v,"teita");if(!e)return null;return fx([C("一晩中","ひとばんじゅう"),...dropMy(vp.pre),...e],vp.used)}
      return fx([C("徹夜","てつや"),C("しました")])}],
    [/^(?:i'm|i am|we're|we are) so (full|stuffed)(?: that)?,? (?:i|we) (?:can't|cannot|can not) eat (?:anything else|anything more|anymore|any more|another bite|one more bite)$/i,()=>fx([C("お腹","おなか"),GA,C("いっぱい"),C("で"),CM,C("もう"),C("何も","なにも"),C("食べられません","たべられません")])],
    [/^(?:i'm|i am) so tired(?: that)?,? i could sleep (?:for days|for a week|forever|all day|for a year|for hours)$/i,()=>fx([C("疲れすぎて","つかれすぎて"),CM,C("何日でも","なんにちでも"),C("寝られ","ねられ"),C("そう"),DESU])],
    [/^(?:can|could) you recommend (?:something|anything) (?:good )?(?:to (eat|drink)|for (dinner|lunch|breakfast))$/i,m=>{const k=(m[1]||m[2]).toLowerCase();const N={eat:["食べ物","たべもの"],drink:["飲み物","のみもの"],dinner:["晩ご飯","ばんごはん"],lunch:["お昼","おひる"],breakfast:["朝ご飯","あさごはん"]}[k];
      return fx([C("何か","なにか"),C("おすすめ"),C("の"),C(N[0],N[1]),WA,C("あります"),KA])}],
    [/^(?:i|we) (can not|cannot|could not|still can not|still cannot) find (.+)$/i,m=>{const k=m[2].toLowerCase();const np=/^(it|them)$/.test(k)?null:/^the place$/.test(k)?{chunks:[C("場所","ばしょ")],used:[]}:NP(m[2]);if(!/^(it|them)$/.test(k)&&(!np||np.pron))return null;const past=/could/i.test(m[1]);
      return fx([...(np?[...dropMy(np.chunks),GA]:[]),C(past?"見つかりませんでした":"見つかりません",past?"みつかりませんでした":"みつかりません")],np?np.used:[])}],
    [/^(?:i|we) (?:should|must|better|have to|need to|gotta) (?:get going|get moving|head out|head home|go now|be going)$/i,m=>fx(/home/i.test(m[0])?[C("そろそろ"),C("帰ります","かえります")]:/^we/i.test(m[0])?[C("そろそろ"),C("行きましょう","いきましょう")]:[C("そろそろ"),C("行かないと","いかないと")])],
    [/^it(?: has|'s| is| was) been (?:a |such a |a really |a very )?(long|busy|tiring|hard|tough|good|great|fun|crazy|weird|nice) (day|week|year|month|night|trip)$/i,m=>{const A0={long:["長い","ながい"],busy:["忙しい","いそがしい"],tiring:["疲れる","つかれる"],hard:["大変な","たいへんな"],tough:["大変な","たいへんな"],good:["いい"],great:["いい"],fun:["楽しい","たのしい"],crazy:["大変な","たいへんな"],weird:["変な","へんな"],nice:["いい"]}[m[1].toLowerCase()];
      const N={day:["一日","いちにち"],week:["一週間","いっしゅうかん"],year:["一年","いちねん"],month:["一ヶ月","いっかげつ"],night:["夜","よる"],trip:["旅行","りょこう"]}[m[2].toLowerCase()];return fx([C(A0[0],A0[1]||A0[0]),C(N[0],N[1]),C("でした")])}],
    [/^(he|she|they|you|my [a-z]+|[A-Z][a-z]+|i) (?:drives?|drove) (?:way |much |a little |a bit )?too (fast|slowly|slow)$/i,m=>{const k=m[1].toLowerCase(),W=k==="i"?null:PJ[k]?{chunks:[PJ[k]],used:[]}:who(m[1]);if(k!=="i"&&!W)return null;const fast=/fast/i.test(m[2]);
      return fx([...(W?[...W.chunks,WA]:[]),C("スピード"),O,C(fast?"出しすぎます":"落としすぎます",fast?"だしすぎます":"おとしすぎます")],W?W.used:[])}],
    [/^(?:we|i) (?:are|am) running out of (gas|petrol|fuel|money|battery|water|food|milk|space|ideas|patience)$/i,m=>{const N={gas:["ガソリン"],petrol:["ガソリン"],fuel:["ガソリン"],money:["お金","おかね"],battery:["電池","でんち"],water:["水","みず"],food:["食べ物","たべもの"],milk:["牛乳","ぎゅうにゅう"],space:["場所","ばしょ"],ideas:["アイデア"],patience:["我慢","がまん"]}[m[1].toLowerCase()];
      return fx([C(N[0],N[1]||N[0]),GA,C("なくなり"),C("そう"),DESU])}],
    [/^(?:i|we) (?:can not|cannot|can't) stop ([a-z]+ing)(?: (.+))?$/i,m=>{const vp=vpIng(m[1]+(m[2]?" "+m[2]:""));const d=vp&&vplain(vp.v,"dict");if(!d)return null;return fx([...dropMy(vp.pre),...d,C("の"),GA,C("止められません","やめられません")],vp.used)}],
    [/^(?:i(?: am|'m) )?(?:so |really )?(sick|tired) of (?:the |my |all the )?(.+)$/i,m=>{const k=m[2].toLowerCase();const np=/^(it|this|that|you|him|her|them|everything)$/.test(k)?{chunks:[{it:C("これ"),this:C("これ"),that:C("それ"),you:C("あなた"),him:PJ.him,her:PJ.her,them:PJ.them,everything:C("全部","ぜんぶ")}[k]],used:[]}:/ing\b/.test(k.split(" ")[0])?null:NP(m[2]);
      let ch=null,used=[];if(np&&!np.pron){ch=np.chunks;used=np.used}else if(!np&&!/^tired$/i.test(m[1])){const vp=vpIng(m[2]);const d=vp&&vplain(vp.v,"dict");if(d){ch=[...dropMy(vp.pre),...d,C("の")];used=vp.used}}if(!ch)return null;
      return fx([...ch,C("には"),C("もう"),C("うんざり"),DESU],used)}],
    [/^(?:i|we) heard (?:that )?(.+)$/i,m=>{if(/^(you|him|her|them|it|that|something|a noise|a sound)$/i.test(m[1]))return null;let r=null;try{r=compose1(m[1])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;const L=p[p.length-1];const q2=L&&L[0]==="だ"?p:p;
      return fx([...q2,C("そう"),DESU],r.used,["… そうです = I heard that …"])}],
    [/^is (it|this|that|the [a-z]+|entry|admission|parking|the wifi|wifi) free$/i,m=>{const k=m[1].toLowerCase();const np=/^(it|this|that)$/.test(k)?null:NP(k);if(!/^(it|this|that)$/.test(k)&&(!np||np.pron))return null;return fx([...(np?[...np.chunks,WA]:k==="this"?[C("これ"),WA]:[]),C("無料","むりょう"),DESU,KA],np?np.used:[])}],
    // "the museum is free (on Sundays)" -> 博物館は無料です
    [/^(?:the |this |it |entry |admission |the entry |entrance )?(.*?) ?(?:is|are|was) (?:totally |completely )?free(?: of charge)?$/i,m=>{const k=m[1].trim();if(/^(i|you|he|she|we|they|my [a-z]+|your [a-z]+)$/i.test(k)&&!/(wifi|ticket|parking|museum|entry|food|drink)/i.test(k))return null;if(k&&/\b(friend|mom|dad|brother|sister|boss|teacher|everyone|wife|husband)\b/i.test(k))return null;
      const np=k?NP(k):null;if(k&&(!np||np.pron))return null;const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,...(np?[...dropMy(np.chunks),tt.length?GA:WA]:[]),C("無料","むりょう"),C(/was/i.test(m[0])?"でした":"です")],np?np.used:[])}],
    // "I'm on the train (right now)" -> 今電車に乗っています
    [/^(?:i|we) (?:am|are) (?:on|in) (?:the |a )?(train|bus|plane|subway|taxi|boat|ship|ferry|shinkansen|bullet train)$/i,m=>{const np=NP(m[1]);if(!np)return null;const tt=T.length?T:[];T=[];return fx([...tt,...np.chunks,C("に"),C("乗って","のって"),C("います")],np.used)}],
    // "when is dinner?" -> 晩ご飯はいつですか
    [/^when (?:is|was|'s) (?:the |your |my |our )?(.+)$/i,m=>{if(/^(it|that|this)$/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),WA,C("いつ"),C(/was/i.test(m[0])?"でした":"です"),KA],np.used)}],
    // "I have two brothers and one sister" -> 兄弟が二人と姉妹が一人います
    [/^(?:i|we) have (one|two|three|four|five|a|an) (brothers?|sisters?|kids|children|sons?|daughters?|cats?|dogs?)(?: and (one|two|three|four|five|a|an) (brothers?|sisters?|kids|children|sons?|daughters?|cats?|dogs?))?$/i,m=>{if(/^an?$/i.test(m[1])&&(!m[3]||/^an?$/i.test(m[3]))||/^an?$/i.test(m[1])&&/cat|dog/i.test(m[2]))return null;const both=!!m[3]&&/brother|sister/i.test(m[2])&&/brother|sister/i.test(m[4]||"");const one=(n,k)=>{const N=/^an?$/i.test(n)?1:numOf(n);if(!N||N>5)return null;const an=/cat|dog/i.test(k);
        const W=/brother/i.test(k)?(both||N===1?["男の兄弟","おとこのきょうだい"]:["兄弟","きょうだい"]):/sister/i.test(k)?(both||N===1?["女の兄弟","おんなのきょうだい"]:["姉妹","しまい"]):/son/i.test(k)?["息子","むすこ"]:/daughter/i.test(k)?["娘","むすめ"]:/cat/i.test(k)?["猫","ねこ"]:/dog/i.test(k)?["犬","いぬ"]:["子供","こども"];
        const cnt=an?C(KJ[N]+"匹",["いっぴき","にひき","さんびき","よんひき","ごひき"][N-1]):C(["一人","二人","三人","四人","五人"][N-1],["ひとり","ふたり","さんにん","よにん","ごにん"][N-1]);return[C(W[0],W[1]),GA,cnt]};
      const a=one(m[1],m[2]),b=m[3]?one(m[3],m[4]):null;if(!a||m[3]&&!b)return null;return fx([...a,...(b?[C("と"),...b]:[]),C("います")])}],
    // "I just woke up" -> 今起きたところです
    [/^(?:i|we) (?:just |only just )?(woke up|got up|got home|got here|arrived|got back|finished|ate|had lunch|had dinner|got off work|left)$/i,m=>{const V={"woke up":["起きた","おきた"],"got up":["起きた","おきた"],"got home":["家に帰った","いえにかえった"],"got here":["着いた","ついた"],arrived:["着いた","ついた"],"got back":["戻った","もどった"],finished:["終わった","おわった"],ate:["食べた","たべた"],"had lunch":["お昼を食べた","おひるをたべた"],"had dinner":["晩ご飯を食べた","ばんごはんをたべた"],"got off work":["仕事が終わった","しごとがおわった"],left:["出た","でた"]}[m[1].toLowerCase()];
      if(!/\bjust\b/i.test(q))return null;fillNote=null;return fx([C("今","いま"),C(V[0],V[1]),C("ところ"),DESU])}],
    // "I want to dye my hair blue" -> 髪を青く染めたいです
    [/^(?:i|we) (want to|wanna|will|am going to|'m going to|) ?(?:dye|color|colour) my hair(?: (black|blue|red|brown|blonde|pink|green|purple|white|gray|grey|silver))?$/i,m=>{const Cc={black:["黒く","くろく"],blue:["青く","あおく"],red:["赤く","あかく"],brown:["茶色に","ちゃいろに"],blonde:["金髪に","きんぱつに"],pink:["ピンクに"],green:["緑に","みどりに"],purple:["紫に","むらさきに"],white:["白く","しろく"],gray:["グレーに"],grey:["グレーに"],silver:["銀色に","ぎんいろに"]}[(m[2]||"").toLowerCase()];
      const want=/want|wanna/i.test(m[1]||"");return fx([C("髪","かみ"),O,...(Cc?[C(Cc[0],Cc[1]||Cc[0])]:[]),C(want?"染めたいです":"染めます",want?"そめたいです":"そめます")])}],
    // "I think I'm getting sick" -> 風邪をひきそうです
    [/^(?:i think )?(?:i am|i'm) (?:getting|coming down with) (?:sick|a cold|ill|the flu)$/i,m=>fx(/flu/i.test(m[0])?[C("インフルエンザ"),C("かも"),C("しれません")]:[C("風邪","かぜ"),O,C("ひき"),C("そう"),DESU])],
    // "are you still at work?" -> まだ仕事中ですか
    [/^(?:are you|is he|is she) (?:still )?(at work|at school|at home|in the office|in class|in a meeting|on the train|awake|up|here|there)$/i,m=>{const S=/he$/i.test(m[0].split(" ")[1])?[C(/she/i.test(m[0])?"彼女":"彼",/she/i.test(m[0])?"かのじょ":"かれ"),WA]:[];const K={"at work":[C("仕事中","しごとちゅう"),DESU],"at school":[C("学校","がっこう"),C("に"),C("います")],"at home":[C("家","いえ"),C("に"),C("います")],"in the office":[C("会社","かいしゃ"),C("に"),C("います")],"_":0,"in class":[C("授業中","じゅぎょうちゅう"),DESU],"in a meeting":[C("会議中","かいぎちゅう"),DESU],"on the train":[C("電車","でんしゃ"),C("の"),C("中","なか"),DESU],awake:[C("起きて","おきて"),C("います")],up:[C("起きて","おきて"),C("います")],here:[C("ここ"),C("に"),C("います")],there:[C("そこ"),C("に"),C("います")]}[m[1].toLowerCase()];
      return fx([...S,...K,KA])}],
    // "the store was out of bread" -> パンが売り切れでした
    [/^(?:the )?(?:store|shop|supermarket|restaurant|cafe|bakery|they) (?:was|were|is|are) (?:all )?(?:out of|sold out of) (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...np.chunks,GA,C("売り切れ","うりきれ"),C(/was|were/i.test(m[0])?"でした":"です")],np.used)}],
    [/^(?:we|i) (?:are|am|have) (?:run |ran )?out of (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron||/time/i.test(m[1]))return null;return fx([...np.chunks,GA,C("なくなりました")],np.used)}],
    // "she got promoted (last week)" -> 彼女は先週昇進しました
    [/^(i|he|she|my [a-z]+|[A-Z][a-z]+) (?:got|was|has been|just got) (promoted|fired|hired|laid off|transferred)$/i,m=>{const me=/^i$/i.test(m[1]),W=me?null:/^(he|she)$/i.test(m[1])?{chunks:[PJ[m[1].toLowerCase()]],used:[]}:who(m[1]);if(!me&&!W)return null;const V={promoted:["昇進しました","しょうしんしました"],fired:["クビになりました","くびになりました"],hired:["採用されました","さいようされました"],"laid off":["解雇されました","かいこされました"],transferred:["転勤になりました","てんきんになりました"]}[m[2].toLowerCase()];
      const tt=T;T=[];return fx([...(W?[...W.chunks,WA]:[]),...tt,C(V[0],V[1])],W?W.used:[])}],
    // "how do you spell your name?" -> お名前のつづりを教えてもらえますか
    [/^how do you spell (?:your name|it|that|this)$/i,m=>fx([...(/name/i.test(m[0])?[C("お名前","おなまえ"),C("の")]:[]),C("つづり"),O,C("教えて","おしえて"),C("もらえます"),KA])],
    // "I can't find a parking spot" -> 駐車場が見つかりません
    [/^(?:i|we) (?:can not|cannot|could not) find (?:a )?(?:parking spot|parking space|place to park|parking)$/i,m=>fx([C("駐車場","ちゅうしゃじょう"),GA,C(/could/i.test(m[0])?"見つかりませんでした":"見つかりません",/could/i.test(m[0])?"みつかりませんでした":"みつかりません")])],
    // "I prefer to stay home on rainy days" -> 雨の日は家にいるほうが好きです
    [/^(?:i|we) prefer (?:to )?(.+?)(?: on (rainy|sunny|cold|hot|snowy) days| on weekends| at night)?$/i,m=>{if(/ to /i.test(m[1])||/^(tea|coffee)/i.test(m[1]))return null;const vp=/ing\b/.test(m[1].split(" ")[0])?vpIng(m[1]):VP(m[1].replace(/^stay home$/i,"stay at home"));const d=vp&&!vp.past&&vplain(vp.v,"dict");if(!d)return null;
      const D=m[2]?{rainy:["雨","あめ"],sunny:["晴れ","はれ"],cold:["寒い","さむい"],hot:["暑い","あつい"],snowy:["雪","ゆき"]}[m[2].toLowerCase()]:null;const W=D?[C(D[0],D[1]),...(/い$/.test(D[0])?[]:[C("の")]),C("日","ひ"),WA]:/weekends/i.test(m[0])?[C("週末","しゅうまつ"),WA]:/night/i.test(m[0])?[C("夜","よる"),WA]:[];
      return fx([...W,...dropMy(vp.pre),...d,C("ほう"),GA,C("好き","すき"),DESU],vp.used)}],
    // "it's raining cats and dogs" -> 土砂降りです
    [/^it(?: is|'s) (?:raining cats and dogs|pouring(?: rain)?|pouring down)$/i,()=>fx([C("土砂降り","どしゃぶり"),DESU],[],["“Raining cats and dogs” is said as 土砂降り (pouring rain)."])],
    // "do you have any recommendations (for dinner)?" -> 晩ご飯のおすすめはありますか
    [/^(?:do you have|are there) any (?:recommendations|suggestions|recommended (?:places|dishes|restaurants))(?: for (.+))?$/i,m=>{const np=m[1]?NP(m[1].replace(/^(?:the|my|our) /i,"")):null;if(m[1]&&(!np||np.pron))return null;return fx([...(np?[...np.chunks,C("の")]:[]),C("おすすめ"),WA,C("あります"),KA],np?np.used:[])}],
    // "my legs are tired from all the walking" -> たくさん歩いたので、足が疲れました
    [/^(?:my )?(legs?|feet|arms?|eyes?|back|body) (?:are|is|feel|feels) (?:so |really |very )?(?:tired|sore) from (?:all )?(?:the |that )?(walking|running|hiking|standing|work|typing|reading|studying|swimming|dancing|shopping)$/i,m=>{const BP={leg:["足","あし"],legs:["足","あし"],feet:["足","あし"],arm:["腕","うで"],arms:["腕","うで"],eye:["目","め"],eyes:["目","め"],back:["背中","せなか"],body:["体","からだ"]}[m[1].toLowerCase()];
      const A0={walking:["歩いた","あるいた"],running:["走った","はしった"],hiking:["山を歩いた","やまをあるいた"],standing:["立っていた","たっていた"],work:["働いた","はたらいた"],typing:["タイピングした","たいぴんぐした"],reading:["読んだ","よんだ"],studying:["勉強した","べんきょうした"],swimming:["泳いだ","およいだ"],dancing:["踊った","おどった"],shopping:["買い物した","かいものした"]}[m[2].toLowerCase()];
      return fx([C("たくさん"),C(A0[0],A0[1]),C("ので"),CM,C(BP[0],BP[1]),GA,C("疲れました","つかれました")])}],
    // stressed: ストレスがたまっています
    [/^(?:i|we) (?:am|are|feel|have been|have been feeling|am feeling|'m) (?:really |so |very |a bit |a little |super )?stressed(?: out)?(?: (?:at|about|with|because of) (?:my )?(work|school|my job|job|exams|the exam|studying))?$/i,m=>{const W=m[1]?(/school/i.test(m[1])?["学校","がっこう"]:/exam|study/i.test(m[1])?["試験","しけん"]:["仕事","しごと"]):null;
      const been=/been/i.test(m[0]);const tt=T.length?T:been?[C("最近","さいきん")]:[];T=[];return fx([...tt,...(W?[C(W[0],W[1]),C("で")]:[]),C("ストレス"),GA,C("たまって"),C("います")])}],
    // "could you (please) tell me how to use this machine?" -> この機械の使い方を教えてもらえますか
    [/^(?:can|could|would) you (?:please )?(?:tell|show|teach) me how to ([a-z]+)(?: (.+))?$/i,m=>{if(/^(get|go)$/i.test(m[1]))return null;const vp=VP(m[1]+(m[2]?" "+m[2]:""));const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st||!st.i)return null;
      const pre=vp.pre.filter(c=>!/^(を|が)$/.test(c[0]));const obj=pre.length?[...dropMy(pre),C("の")]:[];return fx([...obj,C(st.i[0]+"方",st.i[1]+"かた"),O,C("教えて","おしえて"),C("もらえます"),KA],vp.used)}],
    // "can you recommend a good place for sightseeing?" -> 観光にいい場所を教えてもらえますか
    [/^(?:can|could) you recommend ((?:a|some|any) (?:good|nice) (?:place|spot|area|restaurant)s? (?:for|to go) .+)$/i,m=>{const np=NP(m[1].replace(/^(any) /i,"some "));if(!np||np.pron)return null;return fx([...np.chunks,O,C("教えて","おしえて"),C("もらえます"),KA],np.used)}],
    // "it was so hot (yesterday) that I stayed inside all day" -> 昨日はとても暑かったので、一日中家にいました
    [/^it (?:was|is|'s) (?:so|too) (hot|cold|warm|rainy|windy|snowy|humid|nice|beautiful|late|early|noisy|dark|crowded|busy) (yesterday|today|last night|this morning|tonight|outside) (?:that )?(.+)$/i,m=>{const TW={yesterday:["昨日","きのう"],today:["今日","きょう"],"last night":["昨日の夜","きのうのよる"],"this morning":["今朝","けさ"],tonight:["今夜","こんや"],outside:["外","そと"]}[m[2].toLowerCase()];m=[m[0],m[1],m[3]];const T0=T;T=[C(TW[0],TW[1])];const a=word(m[1],"adj",{an:true})||{hot:{jp:"暑い",kana:"あつい",pos:"adj-i"},cold:{jp:"寒い",kana:"さむい",pos:"adj-i"}}[m[1].toLowerCase()];if(!a)return null;let r=null;try{r=compose1(m[2])}catch(e){}if(!r)return null;
      const past=/was/i.test(m[0]);const isI=/adj-i/.test(a.pos||"");const A0=a.jp==="寒い"&&false?a:a;const adj=isI?C(past?A0.jp.replace(/い$/,"かった"):A0.jp,past?A0.kana.replace(/い$/,"かった"):A0.kana):C(A0.jp+(past?"だった":"な"),A0.kana+(past?"だった":"な"));
      const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,C("とても"),adj,C("ので"),CM,...T0,...r.chunks],[a,...r.used])}],
    // "I'm trying to eat healthier" -> 健康的な食事を心がけています
    [/^(?:i|we)(?: am|'m|'re| are)? (?:trying to|want to|need to|should) eat (?:more )?(healthier|healthy|better|less|more vegetables)$/i,m=>{const k=m[1].toLowerCase();if(k==="less")return fx([C("食べる","たべる"),C("量","りょう"),O,C("減らそう","へらそう"),C("と"),C("して"),C("います")]);if(/vegetables/.test(k))return fx([C("野菜","やさい"),O,C("もっと"),C("食べよう","たべよう"),C("と"),C("して"),C("います")]);
      return fx([C("健康的","けんこうてき"),C("な"),C("食事","しょくじ"),O,C(/want/i.test(m[0])?"したいです":/need|should/i.test(m[0])?"しないといけません":"心がけています",/want/i.test(m[0])?"したいです":/need|should/i.test(m[0])?"しないといけません":"こころがけています")])}],
    // "I'm sorry for being (so) late" -> 遅くなってすみません
    [/^(?:i(?: am|'m) )?(?:so |really |very )?sorry (?:for being|i am|i'm|that i am|that i was|i was) (?:so |a little |a bit )?late$/i,()=>fx([C("遅く","おそく"),C("なって"),C("すみません")])],
    [/^(?:i(?: am|'m) )?(?:so |really |very )?sorry to (?:bother|trouble|disturb|interrupt) you$/i,()=>fx([C("お邪魔","おじゃま"),C("して"),C("すみません")])],
    // "I'm afraid I have to leave now" -> すみませんが、そろそろ失礼します
    [/^(?:i(?: am|'m) afraid |sorry,? |well,? )?i (?:have to|need to|must|should|gotta) (?:go|leave|head out|get going)(?: now)?$/i,m=>/afraid|sorry|well/i.test(m[0])?(T=[],fx([C("すみません"),C("が"),CM,C("そろそろ"),C("失礼します","しつれいします")])):null],
    // "thanks for having me" -> お招きいただきありがとうございます
    [/^(?:thank you|thanks)(?: so much| very much)? for (?:having|inviting) (?:me|us)(?: over)?(?: today| tonight)?$/i,()=>fx([C("お招き","おまねき"),C("いただき"),C("ありがとうございます")])],
    // "I wish I could speak Japanese better" -> もっと日本語が上手に話せたらいいのに
    [/^i wish (?:i|we) could (.+?)( better| more| well)?$/i,m=>{let x=m[1];let adv=[];if(/better/i.test(m[2]||"")){adv=[C("もっと")];if(/^(speak|talk|sing|dance|cook|swim|draw|write|play)/i.test(x))adv.push(C("上手","じょうず"),C("に"))}else if(/more/i.test(m[2]||""))adv=[C("もっと")];else if(/well/i.test(m[2]||""))adv=[C("上手","じょうず"),C("に")];
      const vp=VP(x);if(!vp||vp.past||vp.ing)return null;const st=vstems(vp.v);const pot=vp.v.jp==="いる"?[C("いられます","いられます")]:vend(vp.v,"pot");if(!pot)return null;const L=pot[pot.length-1];if(!/ます$/.test(L[0]))return null;let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];
      const tara=C(L[0].replace(/ます$/,"たら"),L[1]?L[1].replace(/ます$/,"たら"):null);return fx([...adv.slice(0,1),...pre,...adv.slice(1),...pot.slice(0,-1),tara,C("いい"),C("のに")],vp.used)}],
    // "I didn't know (that) you could speak Japanese" -> 日本語が話せるなんて知りませんでした
    [/^i (?:did not|didn't) know (?:that )?(you|he|she|they|it|my [a-z]+|[A-Z][a-z]+) (could|can|were|was|are|is|had|have|liked|like|spoke|speak|lived|live) (.+)$/i,m=>{const k=m[2].toLowerCase();const pres={could:"can",were:"are",was:"is",had:"has",liked:"likes",spoke:"speaks",lived:"lives"}[k]||k;const subj=m[1];
      let r=null;if(pres==="can"){const vp=VP(m[3]);const e=vp&&!vp.past&&!vp.ing&&vend(vp.v,"pot");if(e){let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];const W=/^you$/i.test(subj)?[]:/^(he|she|they)$/i.test(subj)?[PJ[subj.toLowerCase()],C("が")]:null;if(W)r={chunks:[...W,...pre,...e],used:vp.used}}}
      else try{r=compose1(subj+" "+(/^(you|they)$/i.test(subj)&&pres==="is"?"are":pres)+" "+m[3])}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;const p2=/^you$/i.test(subj)?p.filter((c,i)=>!(i<2&&/^(あなた|は)$/.test(c[0]))):p;
      return fx([...p2,C("なんて"),C("知りませんでした","しりませんでした")],r.used)}],
    // "my favorite thing to do on weekends is to sleep in" -> 週末に一番好きなことは朝寝坊することです
    [/^my favou?rite thing (?:to do )?(?:on (weekends|the weekend|sundays|holidays|vacation)|in (?:my )?(?:free|spare) time)? ?is (?:to )?(.+)$/i,m=>{const x=m[2].replace(/ing\b/,"");let d=null,used=[];if(/^sleep(ing)? in$/i.test(m[2]))d=[C("朝寝坊","あさねぼう"),C("する")];else{const vp=/ing\b/.test(m[2])?vpIng(m[2]):VP(m[2]);const e=vp&&!vp.past&&vplain(vp.v,"dict");if(e){d=[...dropMy(vp.pre),...e];used=vp.used}}
      if(!d)return null;const W=m[1]?(/weekend/i.test(m[1])?["週末","しゅうまつ"]:/sunday/i.test(m[1])?["日曜日","にちようび"]:["休み","やすみ"]):/free|spare/i.test(m[0])?["暇な時","ひまなとき"]:null;return fx([...(W?[C(W[0],W[1]),C("に")]:[]),C("一番","いちばん"),C("好き","すき"),C("な"),C("こと"),WA,...d,C("こと"),DESU],used)}],
    // "how many people are coming to the party?" -> パーティーに何人来ますか
    [/^how many people (?:are|will be) coming(?: to (?:the |your |our )?(.+))?$/i,m=>{const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;return fx([...(np?[...np.chunks,C("に")]:[]),C("何人","なんにん"),C("来ます","きます"),KA],np?np.used:[])}],
    // "my wife is pregnant (with our first child)"
    [/^(my wife|she|my sister|[A-Z][a-z]+|my girlfriend|my friend|i) (?:is|am|'m) pregnant(?: with (?:our|her|my|their) (first|second|third) (?:child|baby))?$/i,m=>{const me=/^i$/i.test(m[1]),W=me?null:/^she$/i.test(m[1])?{chunks:[PJ.she],used:[]}:who(m[1]);if(!me&&!W)return null;const n=m[2]?{first:["第一子","だいいっし"],second:["第二子","だいにし"],third:["第三子","だいさんし"]}[m[2].toLowerCase()]:null;
      return fx([...(W?[...W.chunks,WA]:[]),...(n?[C(n[0],n[1]),O]:[]),C("妊娠","にんしん"),C("して"),C("います")],W?W.used:[])}],
    // "the hotel staff were really kind and helpful" -> ホテルのスタッフはとても親切でした
    [/^(.+?) (?:was|were|is|are) (?:really |very |so )?(kind|nice|friendly) and (helpful|kind|nice|friendly)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),WA,C("とても"),C("親切","しんせつ"),C(/was|were/i.test(m[0])?"でした":"です")],np.used)}],
    // "the weather has been really nice lately" -> 最近はずっといい天気です
    [/^the weather (?:has been|'s been) (?:really |very |so )?(nice|good|great|bad|terrible|hot|cold|rainy|weird)(?: (?:lately|recently|these days))?$|^(?:lately|recently),? the weather (?:has been|is) (?:really |very |so )?(nice|good|great|bad|terrible|hot|cold|rainy|weird)$/i,m=>{const k=(m[1]||m[2]).toLowerCase();
      const R={nice:[C("いい"),C("天気","てんき")],good:[C("いい"),C("天気","てんき")],great:[C("いい"),C("天気","てんき")],bad:[C("天気","てんき"),GA,C("悪い","わるい")],terrible:[C("天気","てんき"),GA,C("悪い","わるい")],hot:[C("暑い","あつい")],cold:[C("寒い","さむい")],rainy:[C("雨","あめ"),GA,C("多い","おおい")],weird:[C("天気","てんき"),GA,C("変","へん")]}[k];
      T=[];return fx([C("最近","さいきん"),WA,C("ずっと"),...R,DESU])}],
    // "we were supposed to meet at six" -> 六時に会う予定でした
    [/^(?:i|we) (?:was|were) supposed to (.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;const tt=T;T=[];return fx([...tt,...dropMy(vp.pre),...d,C("予定","よてい"),C("でした")],vp.used)}],
    [/^what (?:is|was) (it|that|this)$/i,m=>{const k=m[1].toLowerCase();return fx([C(k==="this"?"これ":k==="that"?"あれ":"それ"),WA,C("何","なん"),C(/was/i.test(m[0])?"でした":"です"),KA])}],
    [/^what (?:should|do|can) (?:i|we) do(?: now)?$/i,m=>fx([...(/now/i.test(m[0])?[C("これから")]:[]),C("どう"),C("したら"),C("いい"),C("ですか")])],
    // "which platform does the train to Kyoto leave from?" -> 京都行きの電車は何番線から出ますか
    [/^(?:which|what) (?:platform|track) (?:does|will) the (?:train|bus|shinkansen|bullet train) (?:to|for) (.+?) (?:leave|depart|go) from$|^(?:which|what) platform is the (?:train|shinkansen) (?:to|for) (.+?)(?: on)?$/i,m=>{const np=NP(m[1]||m[2]);if(!np||np.pron)return null;return fx([...np.chunks,C("行き","ゆき"),C("の"),C("電車","でんしゃ"),WA,C("何番線","なんばんせん"),C("から"),C("出ます","でます"),KA],np.used)}],
    // "I have a reservation (for two) (at seven) (under Smith)"
    [/^(?:i|we) (?:have|made|booked) a reservation(?: for (one|two|three|four|five|six|seven|eight|\d)(?: people| persons)?)?(?: under (?:the name )?([A-Z][a-z]+))?$/i,m=>{const n=m[1]?numOf(m[1]):null;const ppl=n?C(["一人","二人","三人","四人","五人","六人","七人","八人"][n-1],["ひとり","ふたり","さんにん","よにん","ごにん","ろくにん","しちにん","はちにん"][n-1]):null;
      const tt=T.length?T:[];T=[];return fx([...(m[2]?[[m[2],null,m[2]],C("の"),C("名前","なまえ"),C("で")]:[]),...tt,...(ppl?[ppl,C("で")]:[]),C("予約","よやく"),C("して"),C("います")],[],m[2]?[]:[])}],
    // "we'd like a table by the window" -> 窓側の席をお願いします
    [/^(?:we|i)(?: would|'d) like (?:a |the )?(?:table|seat)s? (?:by|near|next to) the window$|^(?:can|could) (?:we|i) (?:have|get|sit at) a (?:table|seat) (?:by|near) the window$/i,()=>fx([C("窓側","まどがわ"),C("の"),C("席","せき"),O,C("お願いします","おねがいします")])],
    [/^(?:we|i)(?: would|'d) like a table for (one|two|three|four|five|six|\d)(?: people)?$|^(?:a )?table for (one|two|three|four|five|six|\d)(?: please)?$/i,m=>{const n=numOf(m[1]||m[2]);if(!n||n>6)return null;return fx([C(["一人","二人","三人","四人","五人","六人"][n-1],["ひとり","ふたり","さんにん","よにん","ごにん","ろくにん"][n-1]),C("で"),C("お願いします","おねがいします")])}],
    // "the meeting got moved to Thursday" -> 会議が木曜日に変更になりました
    [/^(.+?) (?:got|was|has been|is) (moved|changed|rescheduled|postponed|pushed back|put off) (?:to|until|till) (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const t=m[3].toLowerCase();const D={monday:"月曜日",tuesday:"火曜日",wednesday:"水曜日",thursday:"木曜日",friday:"金曜日",saturday:"土曜日",sunday:"日曜日",tomorrow:"明日","next week":"来週","next month":"来月","next year":"来年"};
      const K={月曜日:"げつようび",火曜日:"かようび",水曜日:"すいようび",木曜日:"もくようび",金曜日:"きんようび",土曜日:"どようび",日曜日:"にちようび",明日:"あした",来週:"らいしゅう",来月:"らいげつ",来年:"らいねん"};let j=D[t];
      if(!j){const tf=TFB[t]||(TIME[t]&&byJP(TIME[t],"any"));if(tf&&/^(next|this|last) /.test(t)){K[tf.jp]=tf.kana;j=tf.jp}}if(!j)return null;
      const post=/postponed|pushed back|put off/i.test(m[2]);return fx([...dropMy(np.chunks),GA,C(j,K[j]),C(post?"まで":"に"),C(post?"延期":"変更",post?"えんき":"へんこう"),C("に"),C("なりました")],np.used)}],
    // "can we reschedule?" -> 日程を変えてもらえますか
    [/^(?:can|could) we reschedule(?: (?:it|the meeting|our meeting|the appointment|our appointment))?$/i,()=>fx([C("日程","にってい"),O,C("変えて","かえて"),C("もらえます"),KA])],
    // "the shop closes early on Sundays" -> 毎週日曜日は店が早く閉まります
    [/^(?:the |our |my )?(.+?) (closes|opens|ends|finishes|starts) (early|late)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const k=m[2].toLowerCase(),V={closes:["閉まります","しまります"],opens:["開きます","あきます"],ends:["終わります","おわります"],finishes:["終わります","おわります"],starts:["始まります","はじまります"]}[k];
      const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,...dropMy(np.chunks),tt.length?GA:WA,C(/early/i.test(m[3])?"早く":"遅く",/early/i.test(m[3])?"はやく":"おそく"),C(V[0],V[1])],np.used)}],
    // "we've known each other for ten years" -> 知り合って十年になります
    [/^(?:we|they) have known each other$/i,m=>{const d=T.length?T[T.length-1]:null;if(!d||!/間$/.test(d[0]))return null;T=[];return fx([...(/^they/i.test(m[0])?[C("彼ら","かれら"),WA]:[]),C("知り合って","しりあって"),C(d[0].replace(/間$/,""),d[1].replace(/かん$/,"")),C("に"),C("なります")])}],
    // "she reminds me of my mother" -> 彼女を見ると母を思い出します
    [/^(.+?) reminds? me of (.+)$/i,m=>{const k=m[1].toLowerCase(),a=/^(he|she|they|you)$/.test(k)?{chunks:[PJ[k]],used:[]}:/^(it|this|that)$/.test(k)?{chunks:[C(k==="that"?"あれ":"これ")],used:[]}:NP(m[1]);const b=NP(m[2]);if(!a||!b||b.pron)return null;
      const hear=/\b(song|music|smell|sound|voice|melody)\b/i.test(m[1]);return fx([...dropMy(a.chunks),O,C(hear?"聞く":"見る",hear?"きく":"みる"),C("と"),...dropMy(b.chunks),O,C("思い出します","おもいだします")],[...a.used,...b.used])}],
    // "my dream is to visit Iceland" -> 夢はアイスランドに行くことです
    [/^my (dream|goal|plan|hope|job) is to (.+)$/i,m=>{const vp=VP(m[2].replace(/^visit (?=[A-Z])/,"go to "));const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;const N={dream:["夢","ゆめ"],goal:["目標","もくひょう"],plan:["予定","よてい"],hope:["願い","ねがい"],job:["仕事","しごと"]}[m[1].toLowerCase()];
      return fx([C(N[0],N[1]),WA,...dropMy(vp.pre),...d,C("こと"),DESU],vp.used)}],
    // "can you keep an eye on my bag?" -> かばんを見ていてもらえますか
    [/^(?:can|could|would) you (?:please )?(?:keep an eye on|watch|look after) (?:my |our |the )?(bag|bags|stuff|things|luggage|suitcase|seat|kids|children|dog|phone|laptop)(?: for (?:a (?:minute|second|moment|bit)|me))?$/i,m=>{const np=NP(m[1]);if(!np)return null;return fx([...np.chunks,O,C("見て","みて"),C("いて"),C("もらえます"),KA],np.used)}],
    // "it's on me" -> 私のおごりです
    [/^(?:it is|it's|this is|this one is|dinner is|lunch is|the drinks are|drinks are) on me$/i,()=>fx([C("私","わたし"),C("の"),C("おごり"),DESU])],
    // "I'm sure you'll do great" -> きっと大丈夫ですよ
    [/^i(?: am|'m) sure (?:you|you will|you'll) (?:do (?:great|well|fine|good)|be (?:fine|okay|ok|great|alright))$|^you(?:'ll| will) do (?:great|fine|well)$/i,()=>fx([C("きっと"),C("大丈夫","だいじょうぶ"),DESU,C("よ")])],
    // "my mom called me (this morning) to ask if I was coming home" -> 母から電話があって、帰ってくるか聞かれました
    [/^(.+?) (?:called|texted|messaged) me(?: (this morning|last night|yesterday|today|earlier|this afternoon))? (?:to ask|and asked)(?: me)? (?:if|whether) (.+)$/i,m=>{const tw=m[2]?{"this morning":["今朝","けさ"],"last night":["昨日の夜","きのうのよる"],yesterday:["昨日","きのう"],today:["今日","きょう"],earlier:["さっき","さっき"],"this afternoon":["今日の午後","きょうのごご"]}[m[2].toLowerCase()]:null;m=[m[0],m[1],m[3]];const w=/^(he|she|they)$/i.test(m[1])?{chunks:[PJ[m[1].toLowerCase()]],used:[]}:who(m[1]);if(!w)return null;
      const cl=m[2].replace(/^(i|we) (?:was|were) coming home\b/i,"$1 will come home").replace(/^(i|we) (?:was|were) (going|coming) /i,"$1 will $2 ").replace(/^(i|we) (?:was|were) /i,"$1 am ").replace(/^(i|we) could /i,"$1 can ").replace(/^(i|we) would /i,"$1 will ");let r=null;try{r=compose1(cl)}catch(e){}const p=r&&toPlain(r.chunks);if(!p)return null;
      const tx=/texted|messaged/i.test(m[0]);const tt=T.length?T:tw?[C(tw[0],tw[1])]:[];T=[];return fx([...tt,...dropMy(w.chunks),C("から"),C(tx?"メッセージ":"電話",tx?"メッセージ":"でんわ"),GA,C("あって"),CM,...p,C("か"),C("聞かれました","きかれました")],[...w.used,...r.used])}],
    // "thank you (so much) for your help" -> 助けてくれて本当にありがとうございます
    [/^(?:thank you|thanks) (so much |very much |a lot )?for (?:all )?(?:your|the|all the|all your) help$/i,m=>fx([C("助けて","たすけて"),C("くれて"),...(m[1]?[C("本当に","ほんとうに")]:[]),C("ありがとうございます")])],
    // "someone gave it to the police" -> 誰かが警察に届けてくれました
    [/^(?:someone|somebody) (?:gave|took|handed|brought|turned) (?:it|them|my [a-z]+)(?: in)? to (?:the )?(police|lost and found|front desk|station staff|staff)$/i,m=>{const P={police:["警察","けいさつ"],"lost and found":["遺失物係","いしつぶつがかり"],"front desk":["フロント"],"station staff":["駅員","えきいん"],staff:["スタッフ"]}[m[1].toLowerCase()];return fx([C("誰か","だれか"),GA,C(P[0],P[1]||P[0]),C("に"),C("届けて","とどけて"),C("くれました")])}],
    // "I can't believe how fast this year went by" -> 今年は本当にあっという間でした
    [/^(?:i (?:can not|cannot) believe )?how (?:fast|quickly) (this year|the year|this week|the week|this summer|the summer|today|the day|time|the time|the weekend|this month|my vacation|the vacation|the trip) (?:went by|has gone by|flew by|has flown by|passed|has passed|goes by|went)$/i,m=>{const k=m[1].toLowerCase().replace(/^the /,"this ");
      const N={"this year":["今年","ことし"],"this week":["今週","こんしゅう"],"this summer":["この夏","このなつ"],today:["今日","きょう"],"this day":["今日","きょう"],time:["時間","じかん"],"this time":["時間","じかん"],"this weekend":["週末","しゅうまつ"],"this month":["今月","こんげつ"],"my vacation":["休み","やすみ"],"this vacation":["休み","やすみ"],"this trip":["旅行","りょこう"]}[k];if(!N)return null;
      return fx([C(N[0],N[1]),WA,C("本当に","ほんとうに"),C("あっという間","あっというま"),C("でした")])}],
    // "it depends (on the weather)" -> 天気次第です
    [/^it (?:all )?depends(?: on (?:the |your |my )?(.+))?$/i,m=>{if(!m[1])return fx([C("場合","ばあい"),C("によります")]);const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("次第","しだい"),DESU],np.used):null}],
    // "I didn't expect it to be this hard" -> こんなに難しいとは思いませんでした
    [/^(?:i|we) (?:did not|never) (?:expect|think) (?:it|that|this|that it|it would be) ?(?:to be |would be |was )?(?:this|so|that) ([a-z]+)$/i,m=>{const a=/^(hard|difficult|tough)$/i.test(m[1])?{jp:"大変",kana:"たいへん",pos:"adj-na",en:"hard, tough",kind:"everyday"}:word(m[1],"adj",{an:true});if(!a)return null;const isI=/adj-i/.test(a.pos||"");return fx([C("こんなに"),C(a.jp,a.kana),...(isI?[]:[C("だ")]),C("とは"),C("思いませんでした","おもいませんでした")],[a])}],
    // "we should do this again sometime" -> またいつかやりましょう
    [/^(?:we should|let's) do (?:this|that|it) again(?: (sometime|soon|someday|next time))?$/i,m=>fx([C("また"),...(m[1]?[C(/soon/i.test(m[1])?"近いうちに":/next/i.test(m[1])?"今度":"いつか",/soon/i.test(m[1])?"ちかいうちに":/next/i.test(m[1])?"こんど":"いつか")]:[]),C("やりましょう")])],
    // "that's exactly what I was thinking" -> ちょうど私も同じことを考えていました
    [/^(?:that is|that's) (?:exactly |just )?what i (?:was thinking|thought|was going to say|wanted to say)$/i,m=>fx(/say/i.test(m[0])?[C("ちょうど"),C("私","わたし"),C("も"),C("同じ","おなじ"),C("こと"),O,C("言おう","いおう"),C("と"),C("思っていました","おもっていました")]:[C("ちょうど"),C("私","わたし"),C("も"),C("同じ","おなじ"),C("こと"),O,C("考えていました","かんがえていました")])],
    // "my parents met in college" -> 両親は大学で出会いました
    [/^(my parents|we|they|my [a-z]+ and i|[A-Z][a-z]+ and i) (?:first )?met (?:in|at) (?:the |a |our )?(.+)$/i,m=>{const k=m[1].toLowerCase(),W=/^(we|my [a-z]+ and i|[a-z]+ and i)$/i.test(k)?(/and i$/i.test(k)?who(m[1].replace(/ and i$/i,"")):null):k==="they"?{chunks:[PJ.they],used:[]}:who(m[1]);const pl=NP(m[2]);if(!pl||pl.pron)return null;
      return fx([...(W?[...W.chunks,...(/and i$/i.test(k)?[C("と")]:[WA])]:[]),...pl.chunks,C("で"),C("出会いました","であいました")],[...(W?W.used:[]),...pl.used])}],
    // "I'm not sure if I can make it (tonight)" -> 今夜行けるかどうか分かりません
    [/^(?:i(?: am|'m) not sure|i do not know) (?:if|whether) (?:i|we) can make it(?: (tonight|today|tomorrow|on time|this weekend))?$/i,m=>{const k=(m[1]||"").toLowerCase();const t=k==="on time"?null:{tonight:["今夜","こんや"],today:["今日","きょう"],tomorrow:["明日","あした"],"this weekend":["今週末","こんしゅうまつ"]}[k];
      return fx([...(t?[C(t[0],t[1])]:[]),C(k==="on time"?"間に合う":"行ける",k==="on time"?"まにあう":"いける"),C("か"),C("どう"),C("か"),C("分かりません","わかりません")])}],
    // "the view from the top was incredible" -> 上からの景色はすごかったです
    [/^the (view|views|sunset|sunrise|scenery) from (?:the |our |my )?(top|roof|window|balcony|mountain|tower|hotel|room|top of the mountain|summit|plane)(?: (?:was|is|were|are) (.+))$/i,m=>{const W={top:["上","うえ"],roof:["屋上","おくじょう"],window:["窓","まど"],balcony:["ベランダ"],mountain:["山","やま"],tower:["タワー"],hotel:["ホテル"],room:["部屋","へや"],"top of the mountain":["山頂","さんちょう"],summit:["山頂","さんちょう"],plane:["飛行機","ひこうき"]}[m[2].toLowerCase()];
      const N=/sunset/i.test(m[1])?["夕日","ゆうひ"]:/sunrise/i.test(m[1])?["朝日","あさひ"]:["景色","けしき"];const r=compose1("it "+(/was|were/i.test(m[0])?"was":"is")+" "+m[3]);if(!r)return null;const ch=r.chunks.filter((c,i)=>!(i<2&&/^(それ|は)$/.test(c[0])));
      return fx([C(W[0],W[1]||W[0]),C("から"),C("の"),C(N[0],N[1]),WA,...ch],r.used)}],
    // "my train was delayed by twenty minutes" -> 電車が二十分遅れました
    [/^(.+?) (?:was|is|has been|got) (?:delayed|late) by (an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?)$/i,m=>{const np=NP(m[1]);const d=duration(m[2],m[3]);if(!np||np.pron||!d)return null;return fx([...dropMy(np.chunks),GA,d,C("遅れました","おくれました")],np.used)}],
    // "how much does it cost to send this to America?" -> これをアメリカに送るのにいくらかかりますか
    [/^how much (?:does it|will it|would it) cost to (?!get to |go to )(.+)$/i,m=>{const vp=VP(m[1]);const d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");return d?fx([...vp.pre,...d,C("のに"),C("いくら"),C("かかります"),KA],vp.used):null}],
    // "I feel much better (today)" -> だいぶ良くなりました
    [/^(?:i|we) (?:feel|am feeling|'m feeling) (?:much |a lot |a little |a bit |so much )?better(?: now)?$/i,m=>{const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,C(/a little|a bit/i.test(m[0])?"少し":"だいぶ",/a little|a bit/i.test(m[0])?"すこし":"だいぶ"),C("良く","よく"),C("なりました")])}],
    // "there's a lot of traffic (today)" -> 今日は道が混んでいます
    [/^there (?:is|was) (?:a lot of|lots of|so much|heavy|bad|a ton of) traffic$/i,m=>{const tt=T.length?[...T,WA]:[];T=[];return fx([...tt,C("道","みち"),GA,C(/was/i.test(m[0])?"混んでいました":"混んでいます",/was/i.test(m[0])?"こんでいました":"こんでいます")])}],
    // "I can't hear you (very well)" -> よく聞こえません
    [/^(?:i|we) (?:can not|cannot) hear (?:you|anything|it|that)(?: (?:very )?well)?$/i,m=>fx([...(/anything/i.test(m[0])?[C("何も","なにも")]:/well/i.test(m[0])?[C("よく")]:[]),C("聞こえません","きこえません")])],
    [/^(?:i|we) (?:can not|cannot) see (?:anything|it|that)(?: (?:very )?well)?$/i,m=>fx([...(/anything/i.test(m[0])?[C("何も","なにも")]:/well/i.test(m[0])?[C("よく")]:[]),C("見えません","みえません")])],
    // "it was really nice to meet your family" -> ご家族に会えて本当によかったです
    [/^it (?:was|is|has been) (?:really |so |very )?(?:nice|great|good|lovely) (?:to meet|meeting|to see|seeing) (your (family|parents|mom|mother|dad|father|wife|husband|friends|kids|children|son|daughter|sister|brother)|everyone)(?: (?:again|today))?$/i,m=>{
      const F={family:["ご家族","ごかぞく"],parents:["ご両親","ごりょうしん"],mom:["お母さん","おかあさん"],mother:["お母さん","おかあさん"],dad:["お父さん","おとうさん"],father:["お父さん","おとうさん"],wife:["奥さん","おくさん"],husband:["ご主人","ごしゅじん"],friends:["お友達","おともだち"],kids:["お子さん","おこさん"],children:["お子さん","おこさん"],son:["息子さん","むすこさん"],daughter:["娘さん","むすめさん"],sister:["お姉さん","おねえさん"],brother:["お兄さん","おにいさん"]};
      const who0=m[2]?F[m[2].toLowerCase()]:["皆さん","みなさん"];const re=/really|so|very/i.test(m[0]);
      return fx([...(who0?[C(who0[0],who0[1]),C("に")]:[]),C("会えて","あえて"),...(re?[C("本当に","ほんとうに")]:[]),C(/^it is/i.test(m[0])?"嬉しいです":"よかったです",/^it is/i.test(m[0])?"うれしいです":"よかったです")])}],
    // "the shop is just around the corner" -> お店はすぐそこです
    [/^(?:the |a |my |our )?(.+?) is (?:just |right )?(?:around|round) the corner$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),WA,C("すぐ"),C("そこ"),DESU],np.used):null}],
    // "we're out of time" -> もう時間がありません
    [/^(?:we|i) (?:are|am|'re|'m) (?:running )?out of time$|^(?:we|i) (?:have|'ve) run out of time$|^time is up$/i,m=>fx(/running/i.test(m[0])?[C("時間","じかん"),GA,C("なくなって"),C("きました")]:[C("もう"),C("時間","じかん"),GA,C("ありません")])],
    // "the water is too cold to swim" -> 水が冷たすぎて泳げません
    [/^(?:the |this |that |my |it )?(.*?) ?(?:is|was|are|were|'s) (?:way )?too ([a-z]+) to ([a-z].*)$/i,m=>{if(!m[1]||/^(i|we|you|he|she|they|it|this|that)$/i.test(m[1]))return null;const subj=NP(m[1]);if(!subj||subj.pron)return null;
      let a=word(m[2],"adj",{an:true});const plc=subj.chunks.some(c=>/^(部屋|家|外|中|教室|オフィス|会社|店|車|電車|ここ|台所|寝室|ホテル|天気)$/.test(c[0]));if(a&&a.jp==="寒い"&&!plc)a=byJP("冷たい","adj")||a;if(a&&a.jp==="暑い"&&!plc)a=byJP("熱い","adj")||a;if(!a||!/adj-i/.test(a.pos||""))return null;const vp=VP(m[3]);const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st)return null;const past=/was|were/i.test(m[0]);
      const sugi=C(a.jp.replace(/い$/,"")+"すぎて",a.kana.replace(/い$/,"")+"すぎて");const pot=vend(vp.v,past?"potnegpast":"potneg");if(!pot)return null;let pre=vp.pre;const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),GA,...pre.slice(oi+1)];
      return fx([...(subj?[...dropMy(subj.chunks),GA]:[]),sugi,...pre,...pot],[...(subj?subj.used:[]),a,...vp.used])}],
    // "I want to try something new" -> 何か新しいことをやってみたいです
    [/^(?:i|we) (want to|would like to|'d like to|will|wanna) try something (new|different|fun|else|interesting)$/i,m=>{const A0={new:["新しい","あたらしい"],different:["違う","ちがう"],fun:["楽しい","たのしい"],else:["他の","ほかの"],interesting:["面白い","おもしろい"]}[m[2].toLowerCase()];
      return fx([C("何か","なにか"),C(A0[0],A0[1]),C("こと"),O,C("やって"),C(/will/i.test(m[1])?"みます":"みたいです")])}],
    // "it thunders" -> 雷が鳴ります ; "it's thundering" -> 雷が鳴っています
    [/^it (thunders|thundered|is thundering|was thundering|will thunder)$/i,m=>{const k=m[1].toLowerCase();return fx([C("雷","かみなり"),GA,C(/^is/.test(k)?"鳴って":/^was/.test(k)?"鳴って":/ed$/.test(k)?"鳴りました":"鳴ります",/^(is|was)/.test(k)?"なって":/ed$/.test(k)?"なりました":"なります"),...(/^is/.test(k)?[C("います")]:/^was/.test(k)?[C("いました")]:[])])}],
    // "he said he would call me but he never did" -> 彼は電話すると言ったのに、結局しませんでした
    [/^(he|she|they|my [a-z]+|[A-Z][a-z]+) (?:said|told me|promised) (?:that )?(?:he|she|they) would (.+?),? but (?:he|she|they) (?:never did|did not|didn't|never)$/i,m=>{const w=/^(he|she|they)$/i.test(m[1])?{chunks:[PJ[m[1].toLowerCase()]],used:[]}:who(m[1]);const vp=VP(m[2]);if(!w||!vp||vp.past||vp.ing)return null;
      let v=vp.v;const d=vplain(v,"dict");if(!d)return null;const pre=vp.pre.filter((c,x)=>!(/^(私)$/.test(c[0])&&/^(に|を)$/.test((vp.pre[x+1]||[])[0]||""))&&!(/^(に|を)$/.test(c[0])&&/^(私)$/.test((vp.pre[x-1]||[])[0]||"")));
      return fx([...dropMy(w.chunks),WA,...pre,...d,C("と"),C("言った","いった"),C("のに"),CM,C("結局","けっきょく"),C("しません"),C("でした")],[...w.used,...vp.used],["… のに = even though … (a complaint)"])}],
    // "can you give me a hand?" -> 手伝ってもらえますか ; "can you give me a discount?" -> 安くしてもらえますか ; "give me the menu" -> メニューをください
    [/^(?:can|could|would) you (?:please )?give me (.+?)(?: please)?$|^(?:please )?give me (.+?)(?: please)?$/i,m=>{const x=(m[1]||m[2]).toLowerCase(),ask=!!m[1];
      const SP={"a hand":[C("手伝って","てつだって")],"a discount":[C("安く","やすく"),C("して")],"a ride":[C("乗せて","のせて")],"a minute":[C("ちょっと"),C("待って","まって")],"a second":[C("ちょっと"),C("待って","まって")],"a moment":[C("ちょっと"),C("待って","まって")],"a call":[C("電話","でんわ"),C("して")],"a break":[C("勘弁","かんべん"),C("して")],"a chance":[C("チャンス"),O,C("ください")],"a hug":[C("ハグ"),C("して")]}[x];
      if(SP){if(SP[SP.length-1][0]==="ください")return ask?null:fx(SP);return fx([...SP,...(ask?[C("もらえます"),KA]:[KUDASAI])])}
      const np=NP(x.replace(/^(some|a little|a bit of) /,""));if(!np||np.pron)return null;return fx([...dropMy(np.chunks),O,...(ask?[C("もらえます"),KA]:[KUDASAI])],np.used)}],
    // "my legs hurt (from walking all day)" -> (一日中歩いたので、)足が痛いです
    [/^(?:my |our )?(legs?|feet|foot|back|head|stomach|tummy|arms?|eyes?|throat|shoulders?|neck|knees?|teeth|tooth|ears?|hands?|wrists?|ankles?|body|whole body|chest) (?:hurts?|is hurting|are hurting|aches?|is sore|are sore)(?: (?:so much|a lot|really bad|badly))?(?: (?:from|after|because of) (.+))?$/i,m=>{
      const BP={leg:["足","あし"],legs:["足","あし"],feet:["足","あし"],foot:["足","あし"],back:["背中","せなか"],head:["頭","あたま"],stomach:["お腹","おなか"],tummy:["お腹","おなか"],arm:["腕","うで"],arms:["腕","うで"],eye:["目","め"],eyes:["目","め"],throat:["喉","のど"],shoulder:["肩","かた"],shoulders:["肩","かた"],neck:["首","くび"],knee:["膝","ひざ"],knees:["膝","ひざ"],teeth:["歯","は"],tooth:["歯","は"],ear:["耳","みみ"],ears:["耳","みみ"],hand:["手","て"],hands:["手","て"],wrist:["手首","てくび"],wrists:["手首","てくび"],ankle:["足首","あしくび"],ankles:["足首","あしくび"],body:["体","からだ"],"whole body":["体中","からだじゅう"],muscles:["筋肉","きんにく"],chest:["胸","むね"]}[m[1].toLowerCase()];
      if(!BP)return null;const body=[C(BP[0],BP[1]),GA,C("痛い","いたい"),DESU];if(!m[2])return fx(body);
      let why=null;const g=/^([a-z]+ing)\b(.*)$/i.exec(m[2]);if(g){const vp=vpIng(m[2]);const e=vp&&vplain(vp.v,"ta");if(e)why={ch:[...dropMy(vp.pre),...e,C("ので")],used:vp.used}}
      else{const np=NP(m[2].replace(/^(the|my|all the) /i,""));if(np&&!np.pron)why={ch:[...dropMy(np.chunks),C("で")],used:np.used}}
      if(!why)return null;return fx([...why.ch,CM,...body],why.used)}],
    // "could you speak a little louder / more slowly?"
    [/^(?:can|could|would) you (?:please )?(speak|talk|say that|say it|repeat that) (?:a (?:little|bit|little bit) |little )?(louder|slower|more slowly|more quietly|quieter|softer|more clearly|clearer|again)(?: please)?$/i,m=>{const k=m[2].toLowerCase(),sp=/^(speak|talk)$/i.test(m[1]);
      const how=/louder/.test(k)?[C("もう少し","もうすこし"),C("大きい","おおきい"),C("声","こえ"),C("で")]:/slow/.test(k)?[C("もう少し","もうすこし"),C("ゆっくり")]:/quiet|soft/.test(k)?[C("もう少し","もうすこし"),C("小さい","ちいさい"),C("声","こえ"),C("で")]:/clear/.test(k)?[C("もう少し","もうすこし"),C("はっきり")]:[C("もう一度","もういちど")];
      return fx([...how,C(sp?"話して":"言って",sp?"はなして":"いって"),C("もらえます"),KA])}],
    // "do you mind if I open the window?" -> 窓を開けてもいいですか
    [/^(?:do|would) you mind if (?:i|we) (.+)$/i,m=>{const vp=VP(m[1]);const t=vp&&!vp.past&&!vp.ing&&vte(vp.v);return t?fx([...vp.pre,t,C("も"),C("いい"),C("です"),KA],vp.used):null}],
    [/^would you mind ([a-z]+ing\b.*)$/i,m=>{const vp=vpIng(m[1]);const t=vp&&vte(vp.v);return t?fx([...vp.pre,t,C("もらえます"),KA],vp.used):null}],
    // "there's something wrong with my phone" -> スマホの調子がおかしいです
    [/^there is something wrong with (?:my |the |this |your )?(.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),C("の"),C("調子","ちょうし"),GA,C("おかしい"),DESU],np.used)}],
    // "could you recommend something?" -> 何かおすすめはありますか
    [/^(?:can|could) you recommend (?:something|anything|a good one|one)$|^(?:what do you|what would you|do you have anything you) recommend$/i,()=>fx([C("何か","なにか"),C("おすすめ"),WA,C("あります"),KA])],
    // "we had so much fun at the party" -> パーティーはとても楽しかったです
    [/^(?:i|we) had (?:so much |a lot of |lots of |such |a great time|a good time|an amazing time)?(?:fun)?(?: (?:at|in|on) (?:the |my |your |our )?(.+))?$/i,m=>{if(!/fun|time/i.test(m[0].split(/ (?:at|in|on) /)[0]))return null;const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;
      const so=/so much|a lot|lots|such|great|amazing/i.test(m[0]);const tt=T.length?[...T,...(np?[C("の")]:[WA])]:[];T=[];return fx([...tt,...(np?[...dropMy(np.chunks),WA]:[]),...(so?[C("とても")]:[]),C("楽しかった","たのしかった"),DESU],np?np.used:[])}],
    // "she's been my best friend since elementary school"
    [/^(he|she|they|[A-Z][a-z]+) (?:has|have|is|are) been my (best friend|friend|friends|best friends) since (elementary school|primary school|middle school|junior high|high school|college|university|kindergarten|we were kids|childhood)$/i,m=>{const S={he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()];if(!S)return null;
      const K={"elementary school":["小学校","しょうがっこう"],"primary school":["小学校","しょうがっこう"],"middle school":["中学","ちゅうがく"],"junior high":["中学","ちゅうがく"],"high school":["高校","こうこう"],college:["大学","だいがく"],university:["大学","だいがく"],kindergarten:["幼稚園","ようちえん"],"we were kids":["子供","こども"],childhood:["子供","こども"]}[m[3].toLowerCase()];
      return fx([S,WA,C(K[0],K[1]),C("の"),C("時","とき"),C("から"),C("の"),C(/best/i.test(m[2])?"親友":"友達",/best/i.test(m[2])?"しんゆう":"ともだち"),DESU])}],
    // "my grandmother turned ninety (last week)" -> 祖母は先週九十歳になりました
    [/^(.+?) (?:turned|turns|will turn|is turning) ([a-z -]+|\d+)(?: years old)?$/i,m=>{const n=enNum(m[2]);if(!(n>=1&&n<=120))return null;const w=/^i$/i.test(m[1])?{chunks:[],used:[]}:who(m[1]);if(!w)return null;const J=jaNum(n);if(!J)return null;
      const age=n===20?C("二十歳","はたち"):C(J[0]+"歳",J[1].replace(/(いち|はち|じゅう)$/,x=>({いち:"いっ",はち:"はっ",じゅう:"じゅっ"})[x])+"さい");const past=/turned/i.test(m[0]);
      const tt=T.length?T:[];T=[];return fx([...w.chunks,...(w.chunks.length?[WA]:[]),...tt,age,C("に"),C(past?"なりました":"なります")],w.used)}],
    // "she speaks three languages" -> 彼女は三か国語を話します
    [/^(.+?) (speaks?|can speak) (two|three|four|five|six|seven|eight|\d) languages$/i,m=>{const n=numOf(m[3]);const w=/^i$/i.test(m[1])?{chunks:[],used:[]}:who(m[1]);if(!w||!n)return null;
      return fx([...w.chunks,...(w.chunks.length?[WA]:[]),C(KJ[n]+"か国語",["いち","に","さん","よん","ご","ろっ","なな","はち"][n-1]+"かこくご"),O,C(/can/i.test(m[2])?"話せます":"話します",/can/i.test(m[2])?"はなせます":"はなします")],w.used)}],
    // "I'm not feeling well" -> 体調が悪いです ; "I feel sick" -> 気分が悪いです
    [/^(?:i|we) (?:am|are) not feeling (?:very |so |too )?(?:well|good|great)$|^(?:i|we) do not feel (?:very |so |too )?(?:well|good|great)$/i,()=>fx([C("体調","たいちょう"),GA,C("悪い","わるい"),DESU])],
    [/^(?:i|we) (?:am|are) feeling (?:a (?:little|bit) )?(sick|ill|unwell)$|^(?:i|we) feel (?:a (?:little|bit) )?(sick|ill|unwell)$/i,()=>fx([C("気分","きぶん"),GA,C("悪い","わるい"),DESU])],
    // "the glass broke" -> ガラスが割れました ; "my car broke down" -> 車が故障しました
    [/^(.+?) (broke|broke down|cracked|shattered|stopped working)$/i,m=>{if(/\b(i|he|she|they|we|you|friend|brother|sister|mom|dad|mother|father|boss|son|daughter|wife|husband|boyfriend|girlfriend|teacher|guy|man|woman|kid|everyone|parents)\b/i.test(m[1]))return null;
      const np=NP(m[1]);if(!np||np.pron)return null;const k=m[2].toLowerCase(),glass=/(ガラス|画面|窓|コップ|グラス|皿|鏡|卵|カップ|茶碗|花瓶)$/.test((np.chunks[np.chunks.length-1]||[""])[0]);
      const v=k==="broke down"?["故障しました","こしょうしました"]:k==="stopped working"?["動かなくなりました","うごかなくなりました"]:glass||k!=="broke"?["割れました","われました"]:["壊れました","こわれました"];
      return fx([...dropMy(np.chunks),GA,C(v[0],v[1])],np.used)}],
    // "what do you usually do on weekends?" -> 普段、週末は何をしていますか
    [/^what do you (?:usually |normally |typically )?do(?: (for fun|in your free time|in your spare time))?$/i,m=>{const us=/usually|normally|typically/i.test(l);const fr=m[1]?[C("暇な時","ひまなとき"),WA]:[];
      if(m[1]&&T.length)return null;const tt=T.length?[...T,WA]:[];T=[];return fx([...(us?[C("普段","ふだん"),CM]:[]),...tt,...fr,C("何","なに"),O,C("して"),C("います"),KA])}],
    // "my sister is studying to become a nurse" -> 姉は看護師になるために勉強しています
    [/^(.+?) (?:is|are|am) (studying|working hard|saving (?:up|money)|training|practicing) to (?:become|be) (?:a |an )?(.+)$/i,m=>{const w=/^i$/i.test(m[1])?{chunks:[],used:[]}:who(m[1]);const np=NP(m[3]);if(!w||!np||np.pron)return null;
      const k=m[2].toLowerCase(),v=/^study/.test(k)?[C("勉強して","べんきょうして")]:/^working/.test(k)?[C("頑張って","がんばって")]:/^saving/.test(k)?[C("貯金して","ちょきんして")]:/^training/.test(k)?[C("訓練して","くんれんして")]:[C("練習して","れんしゅうして")];
      return fx([...w.chunks,...(w.chunks.length?[WA]:[]),...np.chunks,C("に"),C("なる"),C("ために"),...v,C("います")],[...w.used,...np.used])}],
    [/^(?:are there|do you have|is there) (?:any |a )?(vegetarian|vegan|halal|gluten-free|kids|children's|english) (?:options?|dishes|food|meals|menus?|choices)(?: on the menu)?$/i,m=>{const k={vegetarian:"ベジタリアン",vegan:"ビーガン",halal:"ハラール",["gluten-free"]:"グルテンフリー",kids:"子供",["children's"]:"子供",english:"英語"}[m[1].toLowerCase()];
      return fx([C(k,k==="子供"?"こども":k==="英語"?"えいご":k),C(k==="英語"?"の":"向けの",k==="英語"?"の":"むけの"),C("メニュー"),WA,C("あります"),KA])}],
    [/^(?:are|r) (?:you|u) (?:ok|okay|alright|all right)$/i,()=>fx([C("大丈夫","だいじょうぶ"),DESU,KA])],
    [/^(?:it is|that is|its|this is) (?:ok|okay|alright|all right|fine)$/i,()=>fx([C("大丈夫","だいじょうぶ"),DESU])],
    [/^i am (?:ok|okay|alright|all right|fine)$/i,()=>fx([C("大丈夫","だいじょうぶ"),DESU])],
    [/^what happened to (?:you|him|her)$/i,()=>fx([C("どうした"),C("ん"),DESU,KA])],
    [/^what happened$/i,()=>fx([C("何","なに"),GA,C("あった"),C("ん"),DESU,KA])],
    [/^what does (this|that|it) mean$/i,m=>fx([m[1].toLowerCase()==="this"?C("これ"):C("それ"),WA,C("どういう"),C("意味","いみ"),DESU,KA])],
    [/^what does (.+) mean$/i,m=>{const np=NP(m[1]);const ch=np&&!np.pron?np.chunks:[["「"+m[1]+"」",null,m[1]]];return fx([...ch,WA,C("どういう"),C("意味","いみ"),DESU,KA],np&&!np.pron?np.used:[])}],
    [/^how do (?:you|i) say (this|that|it)(?: in japanese)?$/i,m=>fx([m[1].toLowerCase()==="this"?C("これ"):C("それ"),WA,C("日本語","にほんご"),C("で"),C("何","なん"),C("と"),C("言います","いいます"),KA])],
    [/^go away$/i,()=>fx([C("あっち"),C("に"),C("行って","いって"),KUDASAI])],
    [/^leave me alone$/i,()=>fx([C("ほっといて"),KUDASAI])],
    [/^(?:please )?do not tell anyone$/i,()=>fx([C("誰","だれ"),C("にも"),C("言わないで","いわないで"),KUDASAI])],
    [/^which (?:one )?is better$/i,()=>fx([C("どっち"),GA,C("いい"),DESU,KA])],
    [/^how was (?:your |the )?(day|today)$/i,()=>fx([C("今日","きょう"),WA,C("どう"),C("でした"),KA])],
    [/^how was (it|that)$/i,()=>fx([C("どう"),C("でした"),KA])],
    [/^how was (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),WA,C("どう"),C("でした"),KA],np.used):null}],
    [/^when is (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),WA,C("いつ"),DESU,KA],np.used):null}],
    [/^whose (.+) is (this|that|it)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([m[2].toLowerCase()==="this"?C("これ"):C("それ"),WA,C("誰","だれ"),C("の"),...np.chunks,DESU,KA],np.used):null}],
    [/^i do not think so$/i,()=>fx([C("そう"),C("は"),C("思いません","おもいません")])],
    [/^thank you (?:so much |very much )?for everything$/i,()=>fx([C("色々","いろいろ"),C("ありがとう"),C("ございました")])],
    [/^thank you (?:so much |very much )?for (?:the |your |this |that )?(.+)$/i,m=>{if(/ing\b/i.test(m[1]))return null;const np=NP(m[1]);return np&&!np.pron&&np.chunks.every(c=>c[1]!=null)?fx([...np.chunks,O,C("ありがとう"),C("ございます")],np.used):null}],
    [/^(?:i am )?(?:so |very )?sorry for (?:the |all the )?(?:trouble|inconvenience)$/i,()=>fx([C("ご迷惑","ごめいわく"),O,C("おかけして"),C("すみません")])],
    [/^(?:i am )?(?:so |very )?sorry (?:i am|for being|i was|to be|for coming) late$/i,()=>fx([C("遅れて","おくれて"),C("すみません")])],
    [/^merry (?:christmas|xmas)$/i,()=>fx([C("メリークリスマス")])],
    [/^happy new year$/i,()=>fx([C("あけまして"),C("おめでとう"),C("ございます")])],
    [/^i am so done(?: with (?:this|it|that|everything|today|work|school))?$/i,()=>fx([C("もう"),C("無理","むり"),DESU],[],["“I'm so done” (fed up) is said as もう無理 (I can't take any more)."])],
    [/^i am dead$/i,()=>fx([C("笑い","わらい"),C("すぎて"),C("死にそう","しにそう"),DESU],[],["“I'm dead” (laughing so hard) is said as 笑いすぎて死にそう (laughing so much I could die)."])],
    [/^no cap$/i,()=>fx([C("マジ"),C("で")],[],["“No cap” (for real, no lie) is マジで in casual Japanese."])],
    [/^let (?:him|her|them) cook$/i,()=>fx([C("好き","すき"),C("に"),C("やらせて"),C("あげて")],[],["“Let him cook” (let him do his thing) is said as 好きにやらせてあげて."])],
    [/^(?:that|this|it) is (?:so |really )?cringe$/i,()=>fx([C("見てて","みてて"),C("恥ずかしい","はずかしい"),DESU],[],["“Cringe” is said as 見てて恥ずかしい (embarrassing to watch)."])],
    [/^i am (?:so |really )?proud of (you|him|her|myself|them)$/i,m=>fx([m[1].toLowerCase()==="myself"?C("自分","じぶん"):WHO[m[1].toLowerCase()],O,C("誇り","ほこり"),C("に"),C("思います","おもいます")])],
    [/^(you|he|she|[A-Z][a-z]+|my [a-z]+) (?:make|makes) me (happy|sad|laugh|smile)$/,m=>{const w=who(m[1]);if(!w)return null;
      if(m[2]==="laugh")return fx([...dropMy(w.chunks),WA,C("笑わせて","わらわせて"),C("くれます")],w.used);
      const t={happy:[C("幸せ","しあわせ"),DESU],sad:[C("悲しく","かなしく"),C("なります")],laugh:[C("笑って","わらって"),C("しまいます")],smile:[C("笑顔","えがお"),C("に"),C("なります")]}[m[2]];
      return fx([...w.chunks,C("と"),C("いる"),C("と"),...t],w.used,["Said as “when I'm with …, I …”."])}],
    [/^i am (?:so |really )?in love with (.+)$/i,m=>{const w=who(m[1]);return w?fx([...w.chunks,C("に"),C("恋","こい"),C("して"),C("います")],w.used):null}],
    [/^(?:do you want to|will you|would you|can you) be my (girlfriend|boyfriend|gf|bf)$/i,()=>fx([C("私","わたし"),C("と"),C("付き合って","つきあって"),KUDASAI],[],["Japanese asks “will you go out with me?” (付き合ってください) rather than “be my girlfriend/boyfriend”."])],
    [/^(?:i|we) (hate|need) (you|him|her|them)$/i,m=>fx([WHO[m[2].toLowerCase()],GA,m[1].toLowerCase()==="hate"?C("大嫌い","だいきらい"):C("必要","ひつよう"),DESU])],
    [/^i think i (?:have|got|caught) (?:a )?cold$/i,()=>fx([C("風邪","かぜ"),O,C("ひいた"),C("みたい"),DESU])],
    [/^i (?:have|have got) (?:a )?cold$/i,()=>fx([C("風邪","かぜ"),O,C("ひいて"),C("います")])],
    [/^i (?:got|caught) (?:a )?cold$/i,()=>fx([C("風邪","かぜ"),O,C("ひきました")])],
    [/^i (?:got|was) dumped$/i,()=>fx([C("振られました","ふられました")])],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+) (?:broke up with|dumped) me$/,m=>{const w=who(m[1]);return w?fx([...w.chunks,C("に"),C("振られました","ふられました")],w.used):null}],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+) cheated on me$/,m=>{const w=who(m[1]);return w?fx([...w.chunks,C("に"),C("浮気","うわき"),C("されました")],w.used):null}],
    [/^(.+) is not everything$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,GA,C("すべて"),C("じゃない"),DESU],np.used):null}],
    [/^(?:can|may|could) i try (?:this|it|these|that|them) on$/i,()=>fx([C("試着","しちゃく"),C("して"),C("も"),C("いい"),DESU,KA])],
    [/^which (train|bus) goes to (.+)$/i,m=>{const np=NP(m[2]);return np&&!np.pron?fx([...np.chunks,C("に"),C("行く","いく"),m[1].toLowerCase()==="bus"?C("バス"):C("電車","でんしゃ"),WA,C("どれ"),DESU,KA],np.used):null}],
    [/^wait (?:a|one) (?:minute|moment|second|sec)$/i,()=>fx([C("ちょっと"),C("待って","まって"),KUDASAI])],
    [/^i am (?:kidding|joking)$/i,()=>fx([C("冗談","じょうだん"),DESU])],
    [/^are you (?:serious|for real)$/i,()=>fx([C("本気","ほんき"),DESU,KA])],
    [/^check (in|out)$/i,m=>please?fx([C(m[1].toLowerCase()==="in"?"チェックイン":"チェックアウト"),O,C("お願いします","おねがいします")]):null],
    [/^(?:i|we) can not wait$/i,()=>fx([C("楽しみ","たのしみ"),DESU])],
    [/^(?:i|we) can not wait (?:for|until) (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),GA,C("楽しみ","たのしみ"),DESU],np.used):null}],
    // "someone stole my bag" -> かばんを盗まれました
    [/^(?:someone|somebody) (.+)$/i,m=>{if(/^(hit|crashed into|bumped into) my car$/i.test(m[1]))return null;const vp=VP(m[1]);if(!vp||!vp.past||vp.me||!/(^|,)vt/.test(vp.v.pos)||!vp.pre.some(c=>c[0]==="を"))return null;const e=vend(vp.v,"ukemi");return e?fx([...dropMy(vp.pre),...e],vp.used,["Japanese says this as “I had my … stolen” (… を盗まれました)."]):null}],
    // "I have two cats" -> 猫が二匹います
    [/^(?:i|we) have (\w+) (.+?) and (an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (.+)$/i,m=>{const n1=numOf(m[1]),n2=/^an?$/i.test(m[3])?1:numOf(m[3]),a=NP(m[2]),b=NP(m[4]);if(!n1||!n2||!a||!b||a.pron||b.pron)return null;
      const c1=counted(n1,a),c2=counted(n2,b);if(!c1||!c2)return null;const live=[a,b].some(x=>/(^|,)an(,|$)/.test((x.used[x.used.length-1]||{}).pos||""));
      return fx([...a.chunks,GA,...c1,C("と"),...b.chunks,GA,...c2,C(live?"います":"あります")],[...a.used,...b.used])}],
    [/^(?:i|we) have (\w+) (.+)$/i,m=>{const n=numOf(m[1]);if(!n||/ and /i.test(m[2]))return null;const np0=NP(m[2].replace(/^(brothers|sisters|siblings)$/i,x=>/^b/i.test(x)?"siblings":x));if(!np0||np0.pron||np0.chunks.some(c=>c[1]==null))return null;
      const sib=/^brothers?$/i.test(m[2])?["兄弟","きょうだい"]:/^sisters?$/i.test(m[2])?["姉妹","しまい"]:/^siblings?$/i.test(m[2])?["兄弟","きょうだい"]:null;
      const np=sib?{chunks:[C(sib[0],sib[1])],used:[{jp:sib[0],kana:sib[1],pos:"N,an",en:m[2],kind:"everyday"}]}:np0;const c=counted(n,np);if(!c)return null;
      const an=/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||"");return fx([...np.chunks,GA,...c,C(an?"います":"あります")],np.used)}],
    // "dogs are better than cats" -> 犬のほうが猫よりいいです
    [/^(.+?) (?:is|are|was|were) (much |way |a lot |far )?(better|worse|more [a-z-]+|[a-z-]+er) than (.+)$/i,m=>{
      const ONE={"this one":["こっち"],"that one":["あっち"],"this":["これ"],"that":["それ"],"these":["これ"],"those":["あれ"]};const one=x=>ONE[x.toLowerCase()]?{chunks:[C(ONE[x.toLowerCase()][0])],used:[]}:null;
      const A0=one(m[1])||who(m[1].replace(/^i$/i,"me").replace(/^we$/i,"us")),B=one(m[4])||who(m[4].replace(/^i$/i,"me"));if(!A0||!B)return null;
      const u=A0.used[A0.used.length-1]||{},a=cmpAdj(m[3],{thing:!/(^|,)an(,|$)/.test(u.pos||""),an:/(^|,)an(,|$)/.test(u.pos||"")});if(!a)return null;
      const past=/^(was|were)$/i.test((/ (is|are|was|were) /i.exec(l)||[])[1]||""),p=adjPred(a,false,past);if(!p)return null;
      return fx([...A0.chunks,C("の"),C("ほう"),GA,...B.chunks,C("より"),...(m[2]?[C("ずっと")]:[]),...(/^(taller|shorter)$/i.test(m[3])?[C("背","せ"),GA]:[]),...p],[...A0.used,...B.used,a],["… のほうが … より = … is more … than …"])}],
    // "there is a spider in my room" -> 部屋に蜘蛛がいます
    [/^(?:there (?:is|are|was|were)|(?:is|are) there) (no |an? |some |any |many |lots of |a lot of )?(.+?)(?: (in|on|at|under|behind|near|next to|inside|in front of) (.+))?$/i,m=>{
      const neg=/^no/i.test(m[1]||"")||/\bnot\b/i.test(l.split(" ").slice(0,3).join(" ")),past=/^there (was|were)/i.test(l);
      const X=NP(m[2]);if(!X||X.pron||X.chunks.some(c=>c[1]==null))return null;
      const live=/(^|,)an(,|$)/.test((X.used[X.used.length-1]||{}).pos||""),be=(live?"い":"あり")+(neg?(past?"ませんでした":"ません"):(past?"ました":"ます"));
      let P=[],Pu=[];
      if(m[3]){const pl=NP(m[4]);if(!pl||pl.pron&&pl.pron!=="here"&&pl.pron!=="there")return null;
        const w=m[3].toLowerCase(),box=w==="in"&&!isPlaceNP(pl)&&/(^|,)ph(,|$)/.test((pl.used[pl.used.length-1]||{}).pos||"");
        const tail={on:["上","うえ"],under:["下","した"],behind:["後ろ","うしろ"],near:["近く","ちかく"],"next to":["隣","となり"],inside:["中","なか"],"in front of":["前","まえ"]}[w]||(box?["中","なか"]:null);
        P=pl.pron==="here"&&tail?[C("この"),C(tail[0],tail[1]),C("に")]:[...dropMy(pl.chunks),...(tail&&!(w==="on"&&isBody(pl))?[C("の"),C(tail[0],tail[1])]:[]),C("に")];Pu=pl.used}
      const r=out0([...P,...X.chunks,neg?WA:GA,C(be),...(isQ||/^(is|are) there/i.test(l)?[KA]:[])],[...Pu,...X.used]);return r}],
    [/^(?:this is |it is |it was |that was )?(?:my |our )?first time (?:in|to|at|visiting|coming to) (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,WA,C("初めて","はじめて"),C(/ was /i.test(m[0])?"でした":"です")],np.used):null}],
    [/^(?:this is |it is )?(?:my |our )?first time$/i,()=>fx([C("初めて","はじめて"),DESU])],
    [/^(?:can you |could you |please )?(?:speak|talk)(?: a little| a bit)?(?: more)?(?: please)?$/i,m=>{if(!(T.length===1&&T[0][0]==="ゆっくり"))return null;T=[];Tu=[];return fx([C("もっと"),C("ゆっくり"),C("話して","はなして"),...(/^(can|could)/i.test(m[0])?[C("もらえます"),KA]:[KUDASAI])])}],
    [/^(?:can you |could you |please )?(?:speak|talk) (?:a (?:little |bit )?)?(?:slower|more slowly|slowly)(?: please)?$/i,m=>fx([C("もっと"),C("ゆっくり"),C("話して","はなして"),...(/^(can|could)/i.test(m[0])?[C("もらえます"),KA]:[KUDASAI])])],
    [/^i (?:left|forgot) (?:my )?(.+?) (?:in|on|at) (?:the |a |my |your )?(.+)$/i,m=>{const x=NP(m[1]),y=NP(m[2]);if(!x||!y||x.pron||y.pron)return null;return fx([...y.chunks,C("に"),...dropMy(x.chunks),O,C("忘れました","わすれました")],[...y.used,...x.used])}],
    [/^i (?:did not|could not|could not really|did not really) sleep (well|at all|much)$/i,m=>fx([/all/i.test(m[1])?C("全然","ぜんぜん"):C("よく"),C("眠れません","ねむれません"),C("でした")])],
    [/^good luck (?:on|with|for|in) (?:your |the |my )?(.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,CM,C("頑張って","がんばって"),KUDASAI],np.used):null}],
    [/^congratulations on (?:your |the )?(.+)$/i,m=>{const k={wedding:["ご結婚","ごけっこん"],marriage:["ご結婚","ごけっこん"],graduation:["ご卒業","ごそつぎょう"],promotion:["ご昇進","ごしょうしん"],baby:["ご出産","ごしゅっさん"],"new baby":["ご出産","ごしゅっさん"],birthday:["お誕生日","おたんじょうび"],engagement:["ご婚約","ごこんやく"],"new job":["ご就職","ごしゅうしょく"]}[m[1].toLowerCase()];
      return k?fx([C(k[0],k[1]),C("おめでとう"),C("ございます")]):null}],
    [/^i love you (?:so much|a lot|very much|so so much|more than anything)$/i,()=>fx([C("本当に","ほんとうに"),C("大好き","だいすき"),DESU])],
    [/^you look (?:so |really |very )?(beautiful|pretty|cute|handsome|cool|nice|great|good|lovely|tired|happy|sad|sick)$/i,m=>{const k={beautiful:["きれい"],pretty:["きれい"],lovely:["すてき"],cute:["かわいい"],handsome:["かっこいい"],cool:["かっこいい"],nice:["すてき"],great:["すてき"],good:["すてき"],
      tired:["疲れて","つかれて","いるみたい"],happy:["嬉しそう","うれしそう"],sad:["悲しそう","かなしそう"],sick:["具合が悪そう","ぐあいがわるそう"]}[m[1].toLowerCase()];
      return fx([...(T.length?[WA]:[]),C(k[0],k[1]||k[0]),...(k[2]?[C(k[2])]:[]),DESU,C("ね")])}],
    [/^(?:you did (?:a )?(?:great|good|nice|amazing) job|good job|great job|nice job|well done|nice work|good work)$/i,()=>fx([C("よく"),C("頑張りました","がんばりました"),C("ね")])],
    [/^take your time$/i,()=>fx([C("ゆっくり"),C("で"),C("いい"),DESU,C("よ")])],
    [/^are you kidding me$/i,()=>fx([C("冗談","じょうだん"),C("でしょう")])],
    [/^i knew it$/i,()=>fx([C("やっぱり")])],
    [/^(?:that|it|this) makes (?:sense|a lot of sense)$/i,()=>fx([C("なるほど")])],
    [/^(?:that|it|this) (?:does not|did not) make (?:any )?sense$/i,()=>fx([C("意味","いみ"),GA,C("分かりません","わかりません")])],
    [/^(i|we|you|he|she|my [a-z]+|[A-Z][a-z]+) (?:am|is|are) (?:really |so |very |pretty )?(good|great|bad|terrible|not good) at (.+)$/,m=>{const g=/^(good|great)$/i.test(m[2]);let x=NP(m[3]);
      if(!x||x.pron||x.used.some(u=>u.kind==="dictionary")){const vp=VP(m[3]),d=vp&&!vp.past&&vplain(vp.v,"dict");x=d?{chunks:[...vp.pre,...d,C("の")],used:vp.used}:null}
      if(!x)return null;const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[WA]:[]),...x.chunks,GA,me||x.chunks.some(c=>/^(数学|算数|科学|理科|歴史|物理|化学|生物|地理|国語|勉強|計算|スポーツ|運動|暗記)$/.test(c[0]))?C(g?"得意":"苦手",g?"とくい":"にがて"):C(g?"上手":"下手",g?"じょうず":"へた"),DESU],[...A0.used,...x.used])}],
    [/^(i|we|you|he|she|my [a-z]+|[A-Z][a-z]+) (?:am|is|are) (?:an? )?(?:really |very |pretty )?(good|great|amazing|bad|terrible) (cook|singer|dancer|driver|swimmer|artist)$/,m=>{const g=!/^(bad|terrible)$/i.test(m[2]),k={cook:["料理","りょうり"],singer:["歌","うた"],dancer:["ダンス"],driver:["運転","うんてん"],swimmer:["水泳","すいえい"],artist:["絵","え"]}[m[3].toLowerCase()];
      const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[WA]:[]),C(k[0],k[1]||k[0]),GA,me?C(g?"得意":"苦手",g?"とくい":"にがて"):C(g?"上手":"下手",g?"じょうず":"へた"),DESU],A0.used)}],
    [/^(?:my )?(.+?) passed away$/i,m=>{const A0=who(m[1]);return A0?fx([...dropMy(A0.chunks),GA,C("亡くなりました","なくなりました")],A0.used):null}],
    [/^i am an only child$/i,()=>fx([C("一人っ子","ひとりっこ"),DESU])],
    [/^(?:i|we) live (?:alone|by myself|by ourselves)$/i,()=>fx([C("一人暮らし","ひとりぐらし"),DESU])],
    [/^(i|we) forgot to (.+)$/i,m=>{const vp=VP(m[2]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");return d?fx([...dropMy(vp.pre),...d,C("の"),O,C("忘れました","わすれました")],vp.used):null}],
    [/^i am (?:so |really |very |a little |a bit )?(excited|nervous|worried|tired|sick|bored) (?:for|about|of|with) (.+)$/i,m=>{let x=NP(m[2]);
      if(!x||x.pron||x.used.some(u=>u.kind==="dictionary")){const vp=VP(m[2]),d=vp&&!vp.past&&vplain(vp.v,"dict"),sn=vp&&!vp.pre.length&&vstems(vp.v)&&vstems(vp.v).suru;x=sn?{chunks:[C(vp.v.jp,vp.v.kana)],used:vp.used}:d?{chunks:[...vp.pre,...d,C("の")],used:vp.used}:/^(you|him|her|them)$/i.test(m[2])?{chunks:[WHO[m[2].toLowerCase()]||C("あなた")],used:[]}:null}
      if(!x)return null;const k=m[1].toLowerCase();
      const e={excited:[GA,C("楽しみ","たのしみ"),DESU],nervous:[C("で"),C("緊張","きんちょう"),C("して"),C("います")],worried:[GA,C("心配","しんぱい"),DESU],tired:[C("に"),C("疲れました","つかれました")],sick:[C("に"),C("は"),C("もう"),C("うんざり"),DESU],bored:[C("に"),C("飽きました","あきました")]}[k];
      return fx([...dropMy(x.chunks),...e],x.used)}],
    [/^(less|more|extra|a little) (sugar|ice|salt|sauce|rice|milk|cream|spice|cheese|onions?|garlic)(?: please)?$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;return fx([...np.chunks,C(/^(less|a little)$/i.test(m[1])?"少なめ":"多め",/^(less|a little)$/i.test(m[1])?"すくなめ":"おおめ"),C("で"),C("お願いします","おねがいします")],np.used)}],
    [/^(?:one more|another one)(?: please)?$/i,()=>fx([C("もう"),C("一つ","ひとつ"),C("お願いします","おねがいします")])],
    [/^i will have what (he|she|they) (?:is|are) having$/i,m=>fx([WHO[m[1].toLowerCase()]||C("あの人","あのひと"),C("と"),C("同じ","おなじ"),C("もの"),O,C("お願いします","おねがいします")])],
    [/^i (?:got|was) fired$/i,()=>fx([C("クビ"),C("に"),C("なりました")])],
    [/^text me$/i,()=>fx([C("連絡","れんらく"),C("して"),KUDASAI])],
    [/^(?:my )?(phone|laptop|camera|battery) (?:is|has) (?:dead|died)$/i,m=>{const k={phone:["スマホ"],laptop:["パソコン"],camera:["カメラ"]}[m[1].toLowerCase()];return fx([...(k?[C(k[0]),C("の")]:[]),C("電池","でんち"),GA,C("切れました","きれました")])}],
    [/^i (?:beat|defeated|killed) the (?:final|last) boss$/i,()=>fx([C("ラスボス"),O,C("倒しました","たおしました")])],
    [/^(?:lets go|let us go|go) team$/i,()=>fx([C("頑張れ","がんばれ")])],
    [/^(he|she|i|we|they|my [a-z]+|[A-Z][a-z]+) scored (?:a|the|the winning|another) goal$/,m=>{const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;return fx([...A0.chunks,...(A0.chunks.length?[GA]:[]),C("ゴール"),O,C("決めました","きめました")],A0.used)}],
    [/^how do (?:you|i|we) (read|pronounce|write|say) (this|that|it)(?: (kanji|word|character|name|letter))?(?: in japanese)?$/i,m=>{const n={kanji:["漢字","かんじ"],word:["言葉","ことば"],character:["字","じ"],letter:["字","じ"],name:["名前","なまえ"]}[(m[3]||"").toLowerCase()];
      const v={read:["読みます","よみます"],pronounce:["発音","はつおん"],write:["書きます","かきます"],say:["言います","いいます"]}[m[1].toLowerCase()];const near=!/^that$/i.test(m[2]);
      return fx([...(n?[C(near?"この":"その"),C(n[0],n[1])]:[C(near?"これ":"それ")]),WA,C("どう"),C(v[0],v[1]),...(v[0]==="発音"?[C("します")]:[]),KA])}],
    [/^(?:can|could) you (?:say|repeat) (?:that|it)(?: again)?(?: please)?$/i,()=>(T=[],Tu=[],fx([C("もう一度","もういちど"),C("言って","いって"),C("もらえます"),KA]))],
    [/^(?:please )?(?:say|repeat) (?:that|it)(?: again| one more time)?(?: please)?$/i,()=>(T=[],Tu=[],fx([C("もう一度","もういちど"),C("言って","いって"),KUDASAI]))],
    [/^have you (?:eaten|had (breakfast|lunch|dinner|something to eat))(?: yet)?$/i,m=>{const k={breakfast:["朝ご飯","あさごはん"],lunch:["お昼ご飯","おひるごはん"],dinner:["晩ご飯","ばんごはん"]}[(m[1]||"").toLowerCase()];return fx([C("もう"),...(k?[C(k[0],k[1]),O]:[]),C("食べました","たべました"),KA])}],
    [/^did you sleep (?:well|ok|okay|good)$/i,()=>fx([C("よく"),C("眠れました","ねむれました"),KA])],
    [/^which (line|platform) (?:goes|is|is it) (?:to|for) (.+)$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;return fx([...np.chunks,C("行き","いき"),WA,C(/line/i.test(m[1])?"何線":"何番線",/line/i.test(m[1])?"なにせん":"なんばんせん"),DESU,KA],np.used)}],
    [/^is this the right (train|bus|way|road|platform|station|line|exit)$/i,m=>{const k={train:["電車","でんしゃ"],bus:["バス"],way:["道","みち"],road:["道","みち"],platform:["ホーム"],station:["駅","えき"],line:["路線","ろせん"],exit:["出口","でぐち"]}[m[1].toLowerCase()];
      return fx([C("この"),C(k[0],k[1]||k[0]),C("で"),C("合って","あって"),C("います"),KA])}],
    [/^i want to make (?:some )?(?:(japanese|new|more|local) )?friends$/i,m=>{const k={japanese:[C("日本人","にほんじん"),C("の")],new:[C("新しい","あたらしい")],more:[C("もっと")],local:[C("地元","じもと"),C("の")]}[(m[1]||"").toLowerCase()]||[];
      return fx([...k,C("友達","ともだち"),O,C("作りたい","つくりたい"),DESU])}],
    [/^my (japanese|english) is (?:still )?(not good|not very good|bad|terrible|not great|getting better|improving)$/i,m=>{const L=/^j/i.test(m[1])?C("日本語","にほんご"):C("英語","えいご");
      return fx(/better|improv/i.test(m[2])?[L,GA,C("上手","じょうず"),C("に"),C("なって"),C("きました")]:[L,GA,C("まだ"),C("下手","へた"),DESU])}],
    [/^your (japanese|english) is (?:very |so |really )?(good|great|amazing|perfect)$/i,m=>fx([/^j/i.test(m[1])?C("日本語","にほんご"):C("英語","えいご"),GA,C("とても"),C("上手","じょうず"),DESU,C("ね")])],
    [/^excuse me$/i,()=>fx([C("すみません")])],
    [/^(?:i am |i'm )?sorry$/i,()=>fx([C("すみません")])],
    [/^(?:i am|we are|i'm) (?:very |really |severely |a little )?allergic to (.+)$|^i have an? (.+?) allergy$/i,m=>{const np=NP((m[1]||m[2]).replace(/^the /i,""));return np&&!np.pron&&!np.chunks.some(c=>c[1]==null)?fx([...np.chunks,C("アレルギー"),GA,C("あります")],np.used):null}],
    [/^(?:does|do|did) (this|it|that|these|those|the [a-z]+) (?:have|contain) (?:any )?(.+?)(?: in (?:it|them))?$/i,m=>{const np=NP(m[2]),n=np&&np.used[np.used.length-1]||{};if(!np||np.pron||!/(^|,)fd(,|$)/.test(n.pos||"")&&!/ in (it|them)$/i.test(m[0]))return null;
      const sj=/^(this|these)$/i.test(m[1])?{chunks:[C("これ")],used:[]}:/^(it|that|those)$/i.test(m[1])?{chunks:[C("それ")],used:[]}:NP(m[1]);if(!sj||sj.pron&&!sj.chunks.length)return null;
      return fx([...dropMy(sj.chunks),C("に"),C("は","わ"),...np.chunks,GA,C("入って","はいって"),C("います"),KA],[...sj.used,...np.used])}],
    [/^my (?:phone(?:'s)?|cell phone|phone) battery (died|is dead|ran out|is dying|is low|is almost dead)$/i,m=>fx([C("スマホ"),C("の"),C("バッテリー"),GA,...(/died|dead|ran out/i.test(m[1])&&!/almost/i.test(m[1])?[C("切れました","きれました")]:[C("少ない","すくない"),DESU])])],
    [/^do you know (?:a|any) (?:good|nice) (?:place to eat|places to eat|restaurants?|place for (?:lunch|dinner))(?: (around here|nearby|near here|in this area))?$/i,m=>fx([...(m[1]?[C("この辺","このへん"),C("で")]:[]),C("いい"),C("レストラン"),O,C("知って","しって"),C("います"),KA])],
    [/^do you know (?:a |an |the |any )?(.+?)(?: (around here|nearby|near here))?$/i,m=>{if(/^(where|what|how|when|who|why|if|whether|that)\b/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;return fx([...(m[2]?[C("この辺","このへん"),C("で")]:[]),...np.chunks,O,C("知って","しって"),C("います"),KA],np.used)}],
    [/^it (took|takes|will take|is going to take|would take)(?: me| us)? (an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?|days?|weeks?|months?|years?) to (.+)$/i,m=>{const d=duration(m[2],m[3]);if(!d)return null;let pre=null;const g=m[4].toLowerCase();
      if(g==="get here")pre=[C("ここ"),C("に"),C("来る","くる")];else if(g==="get there")pre=[C("そこ"),C("に"),C("行く","いく")];else{const vp=VP(m[4]),dc=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(dc)pre=[...dropMy(vp.pre),...dc]}
      if(!pre)return null;return fx([...pre,C("のに"),d,C(/took/i.test(m[1])?"かかりました":"かかります")],[])}],
    [/^(?:it is|this is|it's) (?:my|our) first time ([a-z]+ing\b.*)$/i,m=>{const vp=vpIng(m[1]),d=vp&&vplain(vp.v,"dict");return d?fx([...dropMy(vp.pre),...d,C("の"),WA,C("初めて","はじめて"),DESU],vp.used):null}],
    [/^(?:i am|i'm|we are) (still )?not (?:used|accustomed) to (.+?)( yet)?$/i,m=>{let pre=null,used=[];if(/^(it|this|that|it here|this yet)$/i.test(m[2]))pre=[];else{const vp=vpIng(m[2]),d=vp&&vplain(vp.v,"dict");if(d){pre=[...dropMy(vp.pre),...d,C("の"),C("に")];used=vp.used}else{const np=NP(m[2]);if(np&&!np.pron){pre=[...dropMy(np.chunks),C("に")];used=np.used}}}
      return pre?fx([...pre,...(m[1]||m[3]?[C("まだ")]:[]),C("慣れて","なれて"),C("いません")],used):null}],
    [/^(.+?) (is|was|are|were) (more [a-z]+|[a-z]+er|better|worse) than (?:i|we) (?:thought|expected|imagined)$/i,m=>{const a=m[3].toLowerCase(),BASE={better:"good",worse:"bad",bigger:"big",hotter:"hot",easier:"easy",busier:"busy",earlier:"early",funnier:"funny",prettier:"pretty",scarier:"scary",heavier:"heavy",tastier:"tasty",spicier:"spicy",nicer:"nice",closer:"close",farther:"far",further:"far",larger:"large",safer:"safe",later:"late",thinner:"thin",fatter:"fat",wetter:"wet",lazier:"lazy",crazier:"crazy",dirtier:"dirty",healthier:"healthy",angrier:"angry",happier:"happy",uglier:"ugly",cuter:"cute",wider:"wide",simpler:"simple"};
      const b=a.startsWith("more ")?a.slice(5):BASE[a]||a.slice(0,-2);let r=null;try{r=compose1(m[1]+" "+m[2]+" "+b)}catch(e){}if(!r)return null;const ch=r.chunks.slice(),wi=ch.findIndex((c,i)=>i<6&&(c[0]==="は"||c[0]==="が"));ch.splice(wi+1,0,C("思った","おもった"),C("より"));return fx(ch,r.used)}],
    [/^(.+?) (?:is|are) (an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+) years? (older|younger) than (.+)$/i,m=>{const S=who(m[1]),n=/^an?$/i.test(m[2])?1:numOf(m[2]),k=n&&ageKana(n);
      const O2=/^me$/i.test(m[4])?{chunks:[C("私","わたし")],used:[]}:/^(him|her|you|them)$/i.test(m[4])?{chunks:[PJ[m[4].toLowerCase()]],used:[]}:who(m[4]);if(!S||!k||!O2)return null;
      const o=/older/i.test(m[3]);let SC=S.chunks;if(/^me$/i.test(m[4])&&/^my (sister|brother)$/i.test(m[1]))SC=/sister/i.test(m[1])?[C(o?"姉":"妹",o?"あね":"いもうと")]:[C(o?"兄":"弟",o?"あに":"おとうと")];return fx([...SC,WA,...O2.chunks,C("より"),C((n<=10?KJ[n]:n)+"歳",k),C(o?"年上":"年下",o?"としうえ":"としした"),DESU],[...S.used,...O2.used])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (want|wants|wanted) (me|us|you|him|her|them) to (.+)$/i,m=>{const me=/^(i|we)$/i.test(m[1]);if(me&&/^(me|us)$/i.test(m[3]))return null;const S=me?null:who(m[1]);if(!me&&!S)return null;
      const vp=VP(m[4]),st=vp&&!vp.past&&!vp.ing&&!vp.me&&vstems(vp.v);if(!st||!st.te)return null;const past=/wanted/i.test(m[2]);
      const ob=/^(me|us)$/i.test(m[3])?[C("私","わたし"),C("に")]:/^you$/i.test(m[3])?[]:[PJ[m[3].toLowerCase()],C("に")];
      const toMe=!me&&/^(me|us)$/i.test(m[3]);
      const end=me?(past?[C("ほしかった"),DESU]:[C("ほしい"),DESU]):toMe?[C("ほしい"),C("と"),C(past?"言われました":"言われています",past?"いわれました":"いわれています")]:past?[C("ほしがって"),C("いました")]:[C("ほしい"),C("と"),C("思って","おもって"),C("います")];
      if(toMe)return fx([...dropMy(S.chunks),C("に"),...dropMy(vp.pre),C(st.te[0],st.te[1]),...end],[...S.used,...vp.used],["… てほしいと言われています = I've been told they want me to …"]);
      return fx([...(S?[...S.chunks,WA]:[]),...ob,...dropMy(vp.pre),C(st.te[0],st.te[1]),...end],[...(S?S.used:[]),...vp.used],["… てほしい = want someone to …"])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (?:was|were) born$/i,m=>{if(!T.length)return null;const me=/^(i|we)$/i.test(m[1]),S=me?null:who(m[1]);if(!me&&!S)return null;return fx([...(S?[...S.chunks,WA]:[]),C("生まれました","うまれました")],S?S.used:[])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (?:was|were) (born|raised) in (.+)$|^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) (grew) up in (.+)$/i,m=>{const sj=m[1]||m[4],k=(m[2]||m[5]).toLowerCase(),me=/^(i|we)$/i.test(sj),S=me?null:who(sj),np=NP(m[3]||m[6]);if(!me&&!S||!np||np.pron)return null;
      return fx([...(S?[...S.chunks,WA]:[]),...np.chunks,C("で"),k==="born"?C("生まれました","うまれました"):C("育ちました","そだちました")],[...(S?S.used:[]),...np.used])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) used to (.+)$/i,m=>{const me=/^(i|we)$/i.test(m[1]),S=me?null:who(m[1]);if(!me&&!S)return null;const vp=VP(m[2]),st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st||!st.te)return null;
      return fx([...(S?[...S.chunks,WA]:[]),C("昔","むかし"),...(S?[]:[WA]),...dropMy(vp.pre),C(st.te[0],st.te[1]),C("いました")],[...(S?S.used:[]),...vp.used],["昔は…ていました = used to …"])}],
    [/^(?:i|we) (do not|really do not|feel like|really feel like) ?(?:feel like )?([a-z]+ing\b.*)$/i,m=>{const neg=/not/i.test(m[1]),vp=vpIng(m[2]),st=vp&&vstems(vp.v);if(!st||!st.i)return null;
      return fx([...dropMy(vp.pre),C(st.i[0]+"たい",st.i[1]+"たい"),C("気分","きぶん"),...(neg?[C("じゃない")]:[]),DESU],vp.used)}],
    [/^(?:i|we) (feel|felt) (?:a little |a bit |kind of |really |very |so )?(sick|ill|unwell|dizzy|nauseous|sick to my stomach|terrible|awful|bad|weird|strange|cold|hot|tired|sleepy|lonely|better|good|great|fine|okay|ok|happy|sad)$/i,m=>{const k=m[2].toLowerCase(),past=/felt/i.test(m[1]);
      const F={sick:[["気分","きぶん"],["が"],["悪い","わるい"]],ill:[["気分","きぶん"],["が"],["悪い","わるい"]],unwell:[["気分","きぶん"],["が"],["悪い","わるい"]],terrible:[["気分","きぶん"],["が"],["悪い","わるい"]],awful:[["気分","きぶん"],["が"],["悪い","わるい"]],bad:[["気分","きぶん"],["が"],["悪い","わるい"]],"sick to my stomach":[["気持ち","きもち"],["悪い","わるい"]],nauseous:[["吐き気","はきけ"],["が"],["します"]],dizzy:[["めまい"],["が"],["します"]],weird:[["変な","へんな"],["感じ","かんじ"],["が"],["します"]],strange:[["変な","へんな"],["感じ","かんじ"],["が"],["します"]],better:[["よく"],["なりました"]],good:[["気分","きぶん"],["が"],["いい"]],great:[["気分","きぶん"],["が"],["いい"]],fine:[["大丈夫","だいじょうぶ"]]}[k];
      if(F){const ch=F.map(x=>C(x[0],x[1]));const L=ch[ch.length-1][0];if(/します$/.test(L)){if(past)ch[ch.length-1]=C("しました");return fx(ch)}if(L==="なりました")return fx(ch);
        if(/い$/.test(L)){if(past)ch[ch.length-1]=C(L.slice(0,-1)+"かった",(ch[ch.length-1][1]||L).slice(0,-1)+"かった");return fx([...ch,DESU])}return fx([...ch,C(past?"でした":"です")])}
      let r=null;try{r=compose1("i "+(past?"was":"am")+" "+k)}catch(e){}return r?fx(r.chunks,r.used):null}],
    [/^(?:i|we)(?: have|'ve) been feeling (.+)$/i,m=>{if(/ since /i.test(m[1]))return null;let r=null;try{r=compose1("i feel "+m[1])}catch(e){}return r?fx([C("ずっと"),...r.chunks],r.used):null}],
    [/^(?:i|we)(?: have|'ve) been feeling (.+?) since (.+)$/i,m=>{const t=m[2].toLowerCase(),w=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]);let r=null;try{r=compose1("i feel "+m[1])}catch(e){}if(!w||!r)return null;return fx([C(w.jp,w.kana),C("から"),C("ずっと"),...r.chunks],[w,...r.used])}],
    [/^(.+?) (?:was|were|has been|have been|got|is|are) (canceled|cancelled|postponed|delayed)$/i,m=>{const np=NP(m[1]);if(!np||np.pron&&!/^(it|that|this)$/i.test(m[1]))return null;const k=m[2].toLowerCase(),pres=/ (is|are)$/i.test(m[0].slice(0,-m[2].length-1));
      const ch=np.pron?[]:[...dropMy(np.chunks),GA];return fx([...ch,...(k==="delayed"?(pres?[C("遅れて","おくれて"),C("います")]:[C("遅れました","おくれました")]):[C(k==="postponed"?"延期":"中止",k==="postponed"?"えんき":"ちゅうし"),C("に"),C(pres?"なりました":"なりました")])],np.used)}],
    [/^(?:i|we) also (like|love|want|need|have) (.+)$|^(?:i|we) (like|love|want|need|have) (.+?) too$/i,m=>{const v=(m[1]||m[3]).toLowerCase(),np=NP(m[2]||m[4]);if(!np||np.pron)return null;
      const E={like:[C("好き","すき"),DESU],love:[C("大好き","だいすき"),DESU],want:[C("欲しい","ほしい"),DESU],need:[C("必要","ひつよう"),DESU],have:[C("あります")]}[v];return fx([...dropMy(np.chunks),C("も"),...E],np.used)}],
    [/^(?:i|we) (did not|do not|could not|can not|cannot) understand what (he|she|you|they) (said|meant|says|means|was saying|is saying)$/i,m=>{const past=/(did|could)/i.test(m[1]),pot=/(could|can)/i.test(m[1]);
      return fx([...(/^you$/i.test(m[2])?[C("あなた")]:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[2].toLowerCase()]]),GA,C(/said|was saying/i.test(m[3])?"言った":"言っている",/said|was saying/i.test(m[3])?"いった":"いっている"),C("こと"),GA,C("分かりません","わかりません"),...(past?[C("でした")]:[])])}],
    [/^(?:i|we) (can not|cannot|could not|can't decide|could not decide) ?(?:decide )?(what|where|which one|which|when|who) to (.+)$/i,m=>{const ml=/^(.+) for (breakfast|lunch|dinner)$/i.exec(m[3]);const ML=ml?{breakfast:["朝ご飯","あさごはん"],lunch:["お昼","おひる"],dinner:["晩ご飯","ばんごはん"]}[ml[2].toLowerCase()]:null;const vp=VP(ml?ml[1]:m[3]),d0=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d0)return null;const d=d0;const w=m[2].toLowerCase();
      const q=w==="what"?[C("何","なに"),O]:w==="where"?[C("どこ"),C("に")]:/which/.test(w)?[C("どれ"),O]:w==="who"?[C("誰","だれ"),O]:[C("いつ")];
      const know=/know/i.test(m[1]),past=/(could|did)/i.test(m[1]);return fx([...(ML?[C(ML[0],ML[1]),C("に")]:[]),...q,...dropMy(vp.pre),...d,C("か"),...(know?[C("分かりません","わかりません")]:[C("決められません","きめられません")]),...(past?[C("でした")]:[])],vp.used)}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+) (?:just )?had (?:a|her|his|their) (?:first )?(?:baby |little )?(baby|son|daughter|boy|girl)$/i,m=>{const S=who(m[1]);if(!S)return null;const b={baby:["赤ちゃん","あかちゃん"],son:["男の子","おとこのこ"],boy:["男の子","おとこのこ"],daughter:["女の子","おんなのこ"],girl:["女の子","おんなのこ"]}[m[2].toLowerCase()];
      return fx([...S.chunks,C("に"),C(b[0],b[1]),GA,C("生まれました","うまれました")],S.used)}],
    [/^it(?: is|'s) (cheaper|faster|quicker|easier|better|safer|more convenient) to (.+)$/i,m=>{const vp=VP(m[2]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(!d)return null;const a={cheaper:["安い","やすい"],faster:["早い","はやい"],quicker:["早い","はやい"],easier:["簡単","かんたん"],better:["いい"],safer:["安全","あんぜん"],"more convenient":["便利","べんり"]}[m[1].toLowerCase()];
      return fx([...dropMy(vp.pre),...d,C("方","ほう"),GA,C(a[0],a[1]||a[0]),DESU],vp.used)}],
    [/^how much (?:does|will|would) it cost to (?:get|go) to (.+?)(?: by (train|bus|taxi|car|plane|shinkansen|bullet train|subway))?$/i,m=>{const np=NP(m[1]),by=m[2]&&NP(m[2]);if(!np||np.pron)return null;
      return fx([...np.chunks,C("まで"),...(by?[...by.chunks,C("で")]:[]),C("いくら"),C("かかります"),KA],[...np.used,...(by?by.used:[])])}],
    [/^do you have (?:this|that|these|the|it|one)? ?(.*?) ?in (?:a |an )?(bigger|smaller|larger|different|another|other) (size|color|colour)s?$/i,m=>{const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;const sz=/size/i.test(m[3]);
      const a={bigger:[C("もっと"),C("大きい","おおきい")],larger:[C("もっと"),C("大きい","おおきい")],smaller:[C("もっと"),C("小さい","ちいさい")],different:[C("違う","ちがう")],another:[C("違う","ちがう")],other:[C("違う","ちがう")]}[m[2].toLowerCase()];
      return fx([...(np?[C("この"),...np.chunks,C("の")]:[]),...a,C(sz?"サイズ":"色",sz?"サイズ":"いろ"),WA,C("あります"),KA],np?np.used:[])}],
    [/^it(?: is|'s| was) (raining|snowing) so (?:hard|much|heavily|badly) (?:that )?(.+)$/i,m=>{let r=null;try{r=compose1(m[2])}catch(e){}if(!r)return null;const rain=/rain/i.test(m[1]);return fx([C(rain?"雨":"雪",rain?"あめ":"ゆき"),GA,C("ひどくて"),CM,...r.chunks],r.used)}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+) snores so (?:loudly|loud|much|badly) (?:that )?(.+)$/i,m=>{const S=who(m[1]);let r=null;try{r=compose1(m[2])}catch(e){}if(!S||!r)return null;return fx([...S.chunks,C("の"),C("いびき"),GA,C("うるさくて"),CM,...r.chunks],[...S.used,...r.used])}],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+) is the (tallest|shortest|smartest|fastest|oldest|youngest|strongest|funniest|prettiest|nicest|kindest|quietest|loudest) (?:person |one |guy |girl |boy |student |kid |player )?in (?:my |our |the |his |her |their )?(class|family|school|team|company|group|world|office|city|town|country)$/i,m=>{const S=who(m[1]),X=/^class$/i.test(m[3])?{chunks:[C("クラス")],used:[]}:NP(m[3]);if(!S||!X||X.pron)return null;
      const A={tallest:[["背","せ"],["が"],["高い","たかい"]],shortest:[["背","せ"],["が"],["低い","ひくい"]],smartest:[["頭","あたま"],["が"],["いい"]],fastest:[["足","あし"],["が"],["速い","はやい"]],oldest:[["年上","としうえ"]],youngest:[["年下","としした"]],strongest:[["強い","つよい"]],funniest:[["面白い","おもしろい"]],prettiest:[["きれい"]],nicest:[["優しい","やさしい"]],kindest:[["優しい","やさしい"]],quietest:[["静か","しずか"]],loudest:[["うるさい"]]}[m[2].toLowerCase()];
      return fx([...S.chunks,WA,...X.chunks,C("で"),C("一番","いちばん"),...A.map(x=>C(x[0],x[1])),DESU],[...S.used,...X.used])}],
    [/^(?:i am|i'm|we are) (?:so |very |really )?(happy|glad|excited|sad|sorry|honored|lucky) to (see|meet|hear that|hear|be here|have you here|work with you)(?: (you|that))?(?: again)?$/i,m=>{const a=m[1].toLowerCase(),v=m[2].toLowerCase(),again=/ again$/i.test(m[0]);
      const te=/^(see|meet)$/.test(v)?[...(again?[C("また")]:[]),C("会えて","あえて")]:/^hear/.test(v)?[C("それを"),C("聞いて","きいて")]:v==="be here"?[C("ここ"),C("に"),C("来られて","こられて")]:v==="have you here"?[C("来て","きて"),C("くれて")]:[C("一緒に","いっしょに"),C("働けて","はたらけて")];
      const A2={happy:[["嬉しい","うれしい"]],glad:[["嬉しい","うれしい"]],excited:[["わくわくして"],["います"]],sad:[["悲しい","かなしい"]],sorry:[["残念","ざんねん"]],honored:[["光栄","こうえい"]],lucky:[["ラッキー"]]}[a];
      return fx([...te,...(/really|so|very/i.test(m[0])?[C("とても")]:[]),...A2.map(x=>C(x[0],x[1])),...(a==="excited"?[]:[DESU])])}],
    [/^(?:i|we) (?:do not|don't|did not|didn't) have enough (money|time|cash|space|room) (?:to|for) (.+)$/i,m=>{const np=NP(m[1]);let pre=null;const vp=VP(m[2]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(d)pre=[...dropMy(vp.pre),...d];else{const n2=NP(m[2]);if(n2&&!n2.pron)pre=[...dropMy(n2.chunks),C("の")]}
      if(!np||!pre)return null;return fx([...pre,...np.chunks,GA,C(/did/i.test(m[0])?"足りませんでした":"足りません",/did/i.test(m[0])?"たりませんでした":"たりません")],np.used)}],
    [/^(?:i|we) (?:do not|don't) have enough (money|time|cash)$/i,m=>{const np=NP(m[1]);return np?fx([...np.chunks,GA,C("足りません","たりません")],np.used):null}],
    [/^it(?: has|'s| is) been (?:a long time|ages|forever|a while|so long|too long)(?: since (?:i|we) (?:last )?(?:saw|met|talked to|spoke to|have seen) (?:you|each other))?$|^long time no see$/i,()=>fx([C("お久しぶり","おひさしぶり"),DESU,C("ね")])],
    [/^(i|we|he|she|my [a-z]+|[A-Z][a-z]+) (?:got|found) a (new )?job(?: (?:in|at) (.+))?$/i,m=>{const me=/^(i|we)$/i.test(m[1]),S=me?null:who(m[1]),pl=m[3]?NP(m[3]):null;if(!me&&!S||m[3]&&(!pl||pl.pron))return null;
      return fx([...(S?[...S.chunks,WA]:[]),...(pl?[...pl.chunks,C("で")]:[]),...(m[2]?[C("新しい","あたらしい")]:[]),C("仕事","しごと"),GA,C("決まりました","きまりました")],[...(S?S.used:[]),...(pl?pl.used:[])])}],
    [/^(i|we|he|she|my [a-z]+|[A-Z][a-z]+) (was|were|am|are|is|will be|'m|'re|'s) (?:a little |so |very |really )?late for (.+)$/i,m=>{const me=/^(i|we)$/i.test(m[1]),S=me?null:who(m[1]),X=/^(work)$/i.test(m[3])?{chunks:[C("仕事","しごと")],used:[]}:NP(m[3]);if(!me&&!S||!X||X.pron)return null;const past=/^(was|were)$/i.test(m[2]),fut=/will/i.test(m[2]);
      return fx([...(S?[...S.chunks,WA]:[]),...dropMy(X.chunks),C("に"),C(past?"遅れました":fut?"遅れます":"遅れそう",past?"おくれました":fut?"おくれます":"おくれそう"),...(past||fut?[]:[DESU])],[...(S?S.used:[]),...X.used])}],
    [/^(?:the )?(.+?) (?:is|are) (upstairs |downstairs |over there |down the hall |at the end of the hall )?on the (left|right)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const pl=m[2]?{"upstairs ":["二階","にかい"],"downstairs ":["一階","いっかい"],"over there ":["あそこ"],"down the hall ":["廊下","ろうか"],"at the end of the hall ":["廊下の奥","ろうかのおく"]}[m[2].toLowerCase()]:null;
      return fx([...np.chunks,WA,...(pl?[C(pl[0],pl[1]||pl[0]),C("の")]:[]),C(/left/i.test(m[3])?"左側":"右側",/left/i.test(m[3])?"ひだりがわ":"みぎがわ"),DESU],np.used)}],
    [/^(?:this|that|it) (?:is|was) the (best|worst|most delicious|tastiest|most beautiful|prettiest|funniest|scariest|biggest) (.+?) (?:that )?(?:i|we) (?:have |'ve )?ever (eaten|had|seen|tasted|tried|been to|visited|read|watched|heard|stayed at|played)$/i,m=>{const np=/^(thing|things|one)$/i.test(m[2])?{chunks:[],used:[]}:NP(m[2]);if(!np||np.pron)return null;const v=m[3].toLowerCase();
      const VT={eaten:["食べた","たべた"],had:["食べた","たべた"],tasted:["食べた","たべた"],tried:["食べた","たべた"],seen:["見た","みた"],watched:["見た","みた"],read:["読んだ","よんだ"],heard:["聞いた","きいた"],"been to":["行った","いった"],visited:["行った","いった"],"stayed at":["泊まった","とまった"],played:["遊んだ","あそんだ"]}[v];
      const food=/^(eaten|had|tasted|tried)$/.test(v);const a=m[1].toLowerCase();const AD={best:food?["おいしい"]:["いい"],worst:food?["まずい"]:["ひどい"],"most delicious":["おいしい"],tastiest:["おいしい"],"most beautiful":["きれいな"],prettiest:["きれいな"],funniest:["面白い","おもしろい"],scariest:["怖い","こわい"],biggest:["大きい","おおきい"]}[a];
      const past=/\bwas\b/i.test(m[0]),thing=/^(thing|things|one)$/i.test(m[2]);
      if(thing){const pa=AD[0]==="いい"?"よかった":AD[0].replace(/な$/,"").replace(/い$/,"かった");if(/な$/.test(AD[0]))return fx([C("今まで","いままで"),C(VT[0],VT[1]),C("中で","なかで"),C("一番","いちばん"),C(AD[0].replace(/な$/,""),(AD[1]||AD[0]).replace(/な$/,"")),C(past?"でした":"です")]);return fx([C("今まで","いままで"),C(VT[0],VT[1]),C("中で","なかで"),C("一番","いちばん"),C(past?pa:AD[0],past?null:AD[1]||AD[0]),DESU])}
      const SUP=!food&&a==="best"?["最高の","さいこうの"]:!food&&a==="worst"?["最悪の","さいあくの"]:null;
      return fx([C("今まで","いままで"),C(VT[0],VT[1]),C("中で","なかで"),...(SUP?[C(SUP[0],SUP[1])]:[C("一番","いちばん"),C(AD[0],AD[1]||AD[0])]),...np.chunks,C(past?"でした":"です")],np.used)}],
    [/^(he|she|they|my [a-z]+|the [a-z]+|our [a-z]+|[A-Z][a-z]+) told (me|us|him|her|them) (not )?to (.+)$/i,m=>{const S=who(m[1]);let vp=VP(m[4]);
      if(!vp&&/ and /.test(m[4])&&!m[3]){const [x,y]=m[4].split(/ and /);const a=VP(x),b=VP(y),sa=a&&!a.past&&!a.ing&&vstems(a.v);if(sa&&sa.te&&b&&!b.past&&!b.ing)vp={...b,pre:[...dropMy(a.pre),C(sa.te[0],sa.te[1]),CM,...b.pre],used:[...a.used,...b.used]}}if(!S||!vp||vp.past||vp.ing)return null;const st=vstems(vp.v);if(!st)return null;
      const e=m[3]?(st.a?[C(st.a[0]+"ないで",st.a[1]+"ないで")]:null):(st.te?[C(st.te[0],st.te[1])]:null);if(!e)return null;
      return fx([...S.chunks,WA,...(/^(me|us)$/i.test(m[2])?[]:[PJ[m[2].toLowerCase()],C("に")]),C("「",null),...dropMy(vp.pre),...e,C("」",null),C("と"),C("言いました","いいました")],[...S.used,...vp.used])}],
    [/^(he|she|they|you|my [a-z]+|[A-Z][a-z]+) (look|looks|looked|seem|seems|seemed) (?:very |really |so |a little |kind of |pretty )?(tired|sad|happy|sick|angry|mad|busy|bored|nervous|worried|sleepy|upset|excited|cold|hungry|lonely|fine|scared|confused|stressed)$/i,m=>{const you=/^you$/i.test(m[1]),S=you?null:who(m[1]);if(!you&&!S)return null;const past=/ed$/i.test(m[2]);
      const K={tired:[["疲れて","つかれて"],["いる"],["みたい"]],sad:[["悲しそう","かなしそう"]],happy:[["嬉しそう","うれしそう"]],sick:[["具合","ぐあい"],["が"],["悪そう","わるそう"]],angry:[["怒って","おこって"],["いる"],["みたい"]],mad:[["怒って","おこって"],["いる"],["みたい"]],busy:[["忙しそう","いそがしそう"]],bored:[["退屈そう","たいくつそう"]],nervous:[["緊張して","きんちょうして"],["いる"],["みたい"]],worried:[["心配そう","しんぱいそう"]],sleepy:[["眠そう","ねむそう"]],upset:[["怒って","おこって"],["いる"],["みたい"]],excited:[["楽しそう","たのしそう"]],cold:[["寒そう","さむそう"]],hungry:[["お腹","おなか"],["が"],["空いて","すいて"],["いる"],["みたい"]],lonely:[["寂しそう","さびしそう"]],fine:[["元気そう","げんきそう"]],scared:[["怖がって","こわがって"],["いる"],["みたい"]],confused:[["困って","こまって"],["いる"],["みたい"]],stressed:[["ストレスが"],["たまって"],["いる"],["みたい"]]}[m[3].toLowerCase()];
      return fx([...(S?[...S.chunks,WA]:[]),...K.map(x=>C(x[0],x[1])),C(past?"でした":"です")],S?S.used:[])}],
    [/^how long have you (?:been )?(living|lived|working|worked|studying|studied|waiting|waited|playing|played|learning|learned) (.+)$/i,m=>{const b={living:"live",lived:"live",working:"work",worked:"work",studying:"study",studied:"study",waiting:"wait",waited:"wait",playing:"play",played:"play",learning:"learn",learned:"learn"}[m[1].toLowerCase()];const vp=VP(b+" "+m[2]),st=vp&&vstems(vp.v);if(!st||!st.te)return null;
      return fx([...dropMy(vp.pre),C("どのくらい"),C(st.te[0],st.te[1]),C("います"),KA],vp.used)}],
    [/^how (?:do|can|should) (?:i|we) get to (.+?)(?: from here)?$/i,m=>{const np=/^here$/i.test(m[1])?{chunks:[C("ここ")],used:[]}:NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("まで"),C("どうやって"),C("行けば","いけば"),C("いい"),DESU,KA],np.used):null}],
    [/^do you have (?:any )?pets$/i,()=>fx([C("ペット"),O,C("飼って","かって"),C("います"),KA])],
    [/^(?:i|we) do not (really )?(like|enjoy) (.+?)(?: (very much|that much|so much|much))?$/i,m=>{if(!m[1]&&!m[4])return null;const it=/^(it|that|this|them)$/i.test(m[3]);const np=it?null:NP(m[3]);if(!it&&(!np||np.pron))return null;
      return fx([...(np?[...dropMy(np.chunks),WA]:[]),C("あまり"),C("好き","すき"),C("じゃない"),DESU],np?np.used:[])}],
    [/^(?:i am|i'm|we are|we're) (?:so |very |really )?(full|stuffed)$/i,()=>fx([C("お腹","おなか"),GA,C("いっぱい"),DESU])],
    [/^(?:i am|i'm|we are|we're|i think i'm|i think we're) (?:totally |completely |a little |kind of )?lost$/i,()=>fx([C("道","みち"),C("に"),C("迷いました","まよいました")])],
    [/^(?:i|we)(?: have|'ve) been (here|in [a-z]+(?: [a-z]+)?)$/i,m=>{const d=T[T.length-1];if(!d||!/間$/.test(d[0]))return null;const pl=/^here$/i.test(m[1])?{chunks:[C("ここ")],used:[]}:NP(m[1].replace(/^in /i,""));if(!pl||pl.pron&&!pl.chunks.length)return null;
      const dd=C(d[0].replace(/間$/,""),d[1]&&d[1].replace(/かん$/,""));T=[];Tu=[];return fx([...pl.chunks,C("に"),C("来て","きて"),dd,C("に"),C("なります")],pl.used)}],
    [/^(?:can|could) you (?:say|repeat) (?:that|it) (?:a little |a bit )?more$/i,()=>{if(!T.some(c=>c[0]==="ゆっくり"))return null;T=[];Tu=[];return fx([C("もう少し","もうすこし"),C("ゆっくり"),C("言って","いって"),C("もらえます"),KA])}],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+) (?:is|'s) on (?:his|her|their|the) (phone|computer|laptop|tablet|ipad)$/i,m=>{const S=who(m[1]);if(!S)return null;return fx([...S.chunks,WA,C(/phone/i.test(m[2])?"スマホ":/tablet|ipad/i.test(m[2])?"タブレット":"パソコン"),O,C("見て","みて"),C("います")],S.used)}],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+) (?:is|'s) always on (?:his|her|their|the) (phone|computer|laptop|tablet|ipad)$/i,m=>{const S=who(m[1]);if(!S)return null;return fx([...S.chunks,WA,C("いつも"),C(/phone/i.test(m[2])?"スマホ":/tablet|ipad/i.test(m[2])?"タブレット":"パソコン"),O,C("見て","みて"),C("います")],S.used)}],
    [/^(he|she|they|my [a-z]+|[A-Z][a-z]+) asked (me|us) to (.+)$/i,m=>{const S=who(m[1]),vp=VP(m[3]),st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!S||!st||!st.te)return null;
      return fx([...S.chunks,C("に"),C("「",null),...dropMy(vp.pre).filter((c,i,a)=>!(c[0]===S.chunks[0][0]&&(a[i+1]||[])[0]==="の")).filter((c,i,a)=>!(c[0]==="の"&&i===0)),C(st.te[0],st.te[1]),C("」",null),C("と"),C("頼まれました","たのまれました")],[...S.used,...vp.used])}],
    [/^(?:i )?(?:really |truly )?appreciate (?:your help|it|that|everything|all your help|all you have done|what you did)$/i,m=>fx([...(/help/i.test(m[0])?[C("助けて","たすけて"),C("くれて")]:[]),...(/really|truly/i.test(m[0])?[C("本当に","ほんとうに")]:[]),C("ありがとうございます")])],
    [/^(?:i )?hope you have (?:a )?(great|good|nice|fun|safe|wonderful|lovely|amazing) (trip|time|day|weekend|flight|holiday|vacation|evening|night|birthday)$/i,m=>{const a=m[1].toLowerCase(),k=m[2].toLowerCase();
      if(a==="safe"||k==="flight")return fx([C("気をつけて","きをつけて"),C("行って","いって"),C("らっしゃい")]);if(/time|evening|night/.test(k))return fx([C("楽しんで","たのしんで"),C("くださいね")]);
      const X={trip:["旅行","りょこう"],holiday:["休み","やすみ"],vacation:["休み","やすみ"],day:["一日","いちにち"],weekend:["週末","しゅうまつ"],birthday:["誕生日","たんじょうび"]}[k];return fx([C("いい"),C(X[0],X[1]),C("に"),C("なる"),C("と"),C("いい"),DESU,C("ね")])}],
    [/^(?:i have|i've|we have|we've) been (here|in [A-Z][a-z]+(?: [A-Z][a-z]+)?|in japan|in tokyo) for (an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (days?|weeks?|months?|years?)$/i,m=>{const d=duration(m[2],m[3]);const pl=/^here$/i.test(m[1])?{chunks:[C("ここ")],used:[]}:NP(m[1].replace(/^in /i,""));if(!d||!pl||pl.pron&&!pl.chunks.length)return null;
      return fx([...pl.chunks,C("に"),C("来て","きて"),d,C("に"),C("なります")],pl.used)}],
    [/^(?:it|this place|something|this|that) smells (?:really |so |very |pretty )?(good|nice|great|delicious|amazing|bad|weird|strange|terrible|awful|funny)(?: in here| here)?$/i,m=>{const k=m[1].toLowerCase(),here=/here$/i.test(m[0]);if(/bad|terrible|awful/.test(k))return fx([...(here?[C("ここ"),WA]:[]),C("臭い","くさい"),DESU]);
      return fx([...(here?[C("ここ"),WA]:[]),C(/weird|strange|funny/.test(k)?"変な":/delicious/.test(k)?"おいしそうな":"いい",/weird|strange|funny/.test(k)?"へんな":/delicious/.test(k)?"おいしそうな":"いい"),C("匂い","におい"),GA,C("します")])}],
    [/^(.+?) (?:speaks|speak|spoke) ([A-Z][a-z]+|english|japanese) better than (me|i|i do|you|him|her|us|them)$/i,m=>{const S=/^(i|we)$/i.test(m[1])?null:who(m[1]),L=NP(m[2]);if(!/^(i|we)$/i.test(m[1])&&!S||!L||L.pron)return null;const o=m[3].toLowerCase().replace(/ do$/,"");
      return fx([...(S?[...S.chunks,WA]:[]),...(/^(me|i)$/.test(o)?[C("私","わたし")]:o==="you"?[C("あなた")]:[PJ[o]]),C("より"),...L.chunks,GA,C("上手","じょうず"),DESU],[...(S?S.used:[]),...L.used])}],
    [/^(?:can|could) you (?:check|see) if (?:there are|there is|you have) (?:any )?(seats?|tickets?|rooms?|tables?) (?:left|available|still available)$/i,m=>{const k=m[1].toLowerCase().replace(/s$/,""),X={seat:["席","せき"],ticket:["チケット"],room:["部屋","へや"],table:["席","せき"]}[k];
      return fx([C("まだ"),C(X[0],X[1]||X[0]),GA,C("ある"),C("か"),C("確認して","かくにんして"),C("もらえます"),KA])}],
    [/^my phone is (almost|about to) (?:dead|die|run out)$|^my (?:phone|battery) is almost (?:dead|empty|out)$/i,()=>fx([C("スマホ"),C("の"),C("バッテリー"),GA,C("切れそう","きれそう"),DESU])],
    [/^(?:can|could) you show (?:me|us) (?:on|in) (?:the|this|a) map$/i,()=>fx([C("地図","ちず"),C("で"),C("教えて","おしえて"),C("もらえます"),KA])],
    [/^(?:can|could) you (?:say|repeat) (?:that|it) (?:a little |a bit )?(?:more )?slowly(?: please)?$/i,()=>fx([C("もう少し","もうすこし"),C("ゆっくり"),C("言って","いって"),C("もらえます"),KA])],
    [/^(?:it|this|that|the [a-z]+|this [a-z]+) (?:costs?|is|was|will be|comes to) (about |around |only |just |almost |over |more than )?([a-z0-9, -]+?) yen$/i,m=>{const y=yenCh(m[2]);if(!y)return null;const sj=/^(it|this|that)\b/i.test(m[0])&&!/^(this|the) [a-z]+ /i.test(m[0])?null:NP(m[0].split(/ (?:costs?|is|was|will be|comes to) /i)[0]);
      const q=(m[1]||"").trim().toLowerCase();return fx([...(sj&&!sj.pron?[...sj.chunks,WA]:[]),...(/only|just/.test(q)?[C("たった")]:[]),y,...(/about|around/.test(q)?[C("くらい")]:/almost/.test(q)?[C("近く","ちかく")]:/over|more/.test(q)?[C("以上","いじょう")]:[]),C(/was/i.test(m[0])?"でした":"です")],sj&&!sj.pron?sj.used:[])}],
    [/^how many (?:people are there )?(?:people )?(?:are )?(?:there )?in your family$/i,()=>fx([C("何人","なんにん"),C("家族","かぞく"),DESU,KA])],
    [/^(?:there are|we are|we're) (two|three|four|five|six|seven|eight|nine|ten|\d+)(?: people)? in (?:my|our) family$/i,m=>{const n=numOf(m[1]);const K=["","ひとり","ふたり","さんにん","よにん","ごにん","ろくにん","ななにん","はちにん","きゅうにん","じゅうにん"][n];if(!K)return null;
      return fx([C(["","一","二","三","四","五","六","七","八","九","十"][n]+"人",K),C("家族","かぞく"),DESU])}],
    [/^why (did not|do not|does not|didn't|don't|doesn't) (you|he|she|they) (.+)$/i,m=>{const vp=VP(m[3]);if(!vp||vp.ing)return null;const st=vstems(vp.v);if(!st)return null;const past=/did/i.test(m[1]);
      const e=vp.me?(st.te?[C(st.te[0],st.te[1]),C(past?"くれなかった":"くれない")]:null):st.a?[C(st.a[0]+(past?"なかった":"ない"),st.a[1]+(past?"なかった":"ない"))]:null;if(!e)return null;
      return fx([C("どうして"),...(/^you$/i.test(m[2])?[]:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[2].toLowerCase()],GA]),...dropMy(vp.pre),...e,C("ん"),C("ですか")],vp.used)}],
    [/^(.+?) made (me|us) (.+)$/i,m=>{const S=who(m[1]),vp=VP(m[3]);if(!S||!vp||vp.past||vp.ing)return null;const cs=causStem(vp.v);if(!cs)return null;
      return fx([...S.chunks,C("に"),...dropMy(vp.pre),C(cs[0]+"られました",cs[1]+"られました")],[...S.used,...vp.used],["… させられました = was made to …"])}],
    [/^(.+?) (?:let|allowed) (me|us) (.+)$/i,m=>{const S=who(m[1]),vp=VP(m[3]);if(!S||!vp||vp.past||vp.ing)return null;const cs=causStem(vp.v);if(!cs)return null;
      return fx([...S.chunks,GA,...dropMy(vp.pre),C(cs[0]+"て",cs[1]+"て"),C("くれました")],[...S.used,...vp.used],["… させてくれました = let me …"])}],
    [/^(?:i|we)(?: would|'d) rather (?:not )?(.+)$/i,m=>{const neg=/rather not/i.test(m[0]),vp=VP(m[1]),st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st)return null;const d=neg?(st.a?[C(st.a[0]+"ない",st.a[1]+"ない")]:null):vplain(vp.v,"dict");if(!d)return null;
      return fx([...dropMy(vp.pre),...d,C("方","ほう"),GA,C("いい"),DESU],vp.used)}],
    [/^if (?:i|we) had known,? (?:i|we) would have (.+?)$/i,m=>{const b=m[1].split(" "),w0=b[0].toLowerCase(),PP={come:"come",gone:"go",helped:"help",called:"call",told:"tell",brought:"bring",done:"do",been:"be",said:"say",bought:"buy",waited:"wait",stayed:"stay"};const vp=VP([PP[w0]||IRR[w0]||w0.replace(/ed$/,""),...b.slice(1)].join(" "));const t=vp&&vplain(vp.v,"ta");if(!t)return null;
      return fx([C("知って","しって"),C("いたら"),CM,...dropMy(vp.pre),...t,C("のに")],vp.used,["… たのに = would have … (but didn't)"])}],
    [/^(.+?) (gave|give|gives|will give) (me|us) (?:a |an |some |the |this )?(.+?)(?: for (?:my|our) (birthday|christmas|anniversary|graduation))?$/i,m=>{const S=who(m[1]),np=NP(m[4]);if(!S||!np||np.pron)return null;const oc={birthday:["誕生日","たんじょうび"],christmas:["クリスマス"],anniversary:["記念日","きねんび"],graduation:["卒業祝い","そつぎょういわい"]}[(m[5]||"").toLowerCase()];
      return fx([...S.chunks,GA,...(oc?[C(oc[0],oc[1]||oc[0]),C("に")]:[]),...dropMy(np.chunks),O,C(/gave/i.test(m[2])?"くれました":"くれます")],[...S.used,...np.used])}],
    [/^(?:i|we) (gave|give|will give) (him|her|them|my [a-z]+|[A-Z][a-z]+) (?:a |an |some |the |this )?(.+?)(?: for (?:his|her|their) (birthday|christmas|anniversary))?$/i,m=>{const p=m[2].toLowerCase(),R=/^(him|her|them)$/.test(p)?{chunks:[PJ[p]],used:[]}:who(m[2]),np=NP(m[3]);if(!R||!R.chunks[0]||!np||np.pron)return null;const oc={birthday:["誕生日","たんじょうび"],christmas:["クリスマス"],anniversary:["記念日","きねんび"]}[(m[4]||"").toLowerCase()];
      return fx([...R.chunks,C("に"),...(oc?[C(oc[0],oc[1]||oc[0]),C("に")]:[]),...dropMy(np.chunks),O,C(/gave/i.test(m[1])?"あげました":"あげます")],[...R.used,...np.used])}],
    [/^(?:i|we) (loved|liked|hated|enjoyed|really liked|really loved|really enjoyed) (?:the |my |our |this |that )?(.+)$/i,m=>{if(/^(it|that|this)$/i.test(m[2]))return null;const np=NP(m[2])||NP("the "+m[2]);if(!np||np.pron)return null;const k=m[1].toLowerCase();
      return fx([...dropMy(np.chunks),...(/hated/.test(k)?[GA,C("大嫌い","だいきらい"),C("でした")]:/enjoy/.test(k)?[O,C("楽しみました","たのしみました")]:[GA,...(/loved|really/.test(k)?[C("とても")]:[]),C("気に入りました","きにいりました")])],np.used)}],
    [/^(?:the |my |your |our )?(.+?) (is|was|are|were) (not |n't )?ready(?: yet)?$/i,m=>{if(/^(i|we|you|he|she|they|it|dinner|lunch|breakfast|food)$/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron)return null;const past=/was|were/i.test(m[2]),neg=!!m[3],yet=/yet$/i.test(m[0]);
      return fx([...dropMy(np.chunks),C("の"),C("準備","じゅんび"),GA,...(yet||neg?[C("まだ")]:[]),C(neg?(past?"できていませんでした":"できていません"):(past?"できていました":"できています"),neg?(past?"できていませんでした":"できていません"):(past?"できていました":"できています"))],np.used)}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+|the [a-z]+(?: [a-z]+)?|it) (?:still )?(?:has|have) not (come|arrived|eaten|finished|called|replied|answered|started|woken up|gotten up|come back|returned|left|paid|decided|seen it|done it)(?: (?:it|lunch|dinner))?(?: yet)?$/i,m=>{const me=/^(i|we)$/i.test(m[1]),S=me||/^it$/i.test(m[1])?null:who(m[1]);if(!me&&!/^it$/i.test(m[1])&&!S)return null;
      const V={come:["来て","きて"],arrived:["着いて","ついて"],eaten:["食べて","たべて"],finished:["終わって","おわって"],called:["電話して","でんわして"],replied:["返信して","へんしんして"],answered:["答えて","こたえて"],started:["始まって","はじまって"],"woken up":["起きて","おきて"],"gotten up":["起きて","おきて"],"come back":["帰って","かえって"],returned:["帰って","かえって"],left:["出発して","しゅっぱつして"],paid:["払って","はらって"],decided:["決めて","きめて"],"seen it":["見て","みて"],"done it":["やって"]}[m[2].toLowerCase()];
      return fx([...(S?[...S.chunks,WA]:[]),C("まだ"),C(V[0],V[1]),C("いません")],S?S.used:[])}],
    [/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+) tried to (.+)$/i,m=>{const vp=VP(m[2]);if(!vp||vp.ing||vp.past)return null;const vo=volit(vp.v);if(!vo)return null;const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[WA]:[]),...dropMy(vp.pre),C(vo[0],vo[1]),C("と"),C("しました")],[...A0.used,...vp.used],["… ようとしました = tried to …"])}],
    [/^(?:my|your|his|her|the) phone (is|was) (?:turned )?off$/i,m=>fx([C("スマホ"),C("の"),C("電源","でんげん"),GA,C("切れて","きれて"),C(/was/i.test(m[1])?"いました":"います")])],
    [/^(?:i|we) (?:went|came|go|will go) back to (get|pick up|grab) (it|them|my [a-z]+)$/i,m=>{const np=/^(it|them)$/i.test(m[2])?null:NP(m[2]);const past=/went|came/i.test(m[0]);return fx([...(np&&!np.pron?[...dropMy(np.chunks),O]:[]),C("取り","とり"),C("に"),C(past?"戻りました":"戻ります",past?"もどりました":"もどります")],np&&!np.pron?np.used:[])}],
    [/^happy (birthday|new year|anniversary|valentine's day|mother's day|father's day)(?: to you)?$|^merry christmas$/i,m=>{const k=(m[1]||"christmas").toLowerCase();const X={birthday:[["お誕生日","おたんじょうび"],["おめでとうございます"]],"new year":[["あけまして"],["おめでとうございます"]],anniversary:[["記念日","きねんび"],["おめでとうございます"]],christmas:[["メリークリスマス"]],"valentine's day":[["ハッピーバレンタイン"]],"mother's day":[["母の日","ははのひ"],["おめでとう"]],"father's day":[["父の日","ちちのひ"],["おめでとう"]]}[k];return fx(X.map(x=>C(x[0],x[1])))}],
    [/^(?:i'm|i am) down(?: to (.+?))?(?: for (?:it|that))?$/i,m=>{if(!m[1])return fx([C("いいですね"),CM,C("やりましょう")]);const vp=VP(m[1]),e=vp&&!vp.past&&!vp.ing&&vend(vp.v,"mashou");return e?fx([C("いいですね"),CM,...dropMy(vp.pre),...e],vp.used):null}],
    [/^(?:i'll |i will |let's )?talk to you (later|soon|tomorrow)$/i,m=>fx([C("また"),C(/tomorrow/i.test(m[1])?"明日":"後で",/tomorrow/i.test(m[1])?"あした":"あとで"),C("話しましょう","はなしましょう")])],
    [/^(?:i'm|i am) on my way(?: (?:there|home|to you))?$/i,m=>fx([...(/home/i.test(m[0])?[C("家","いえ"),C("に"),C("帰る","かえる"),C("ところ"),DESU]:[C("今","いま"),C("向かって","むかって"),C("います")])])],
    [/^thank you (?:so|very) much$|^thanks (?:so|very) much$|^thanks a lot$|^thank you so so much$/i,()=>fx([C("本当に","ほんとうに"),C("ありがとうございます")])],
    [/^(?:it's|it is|that's|that is|it was|that was|it's|no) (?:not |no )?(?:a |such a )?big deal$/i,m=>fx(/^(it was|that was)/i.test(m[0])&&!/not|no /i.test(m[0].replace(/^no /i,""))?[C("大変","たいへん"),C("でした")]:[C("大した","たいした"),C("こと"),C("ない"),DESU])],
    [/^(he|she|my [a-z]+|[A-Z][a-z]+|you) (?:never|doesn't|does not|don't|do not) (?:ever )?listens? to (me|us|anyone|anybody)$/i,m=>{const you=/^you$/i.test(m[1]),S=you?null:who(m[1]);if(!you&&!S)return null;return fx([...(S?[...S.chunks,WA]:[]),C("全然","ぜんぜん"),C("話","はなし"),O,C("聞いて","きいて"),C(/me|us/i.test(m[2])?"くれません":"いません")],S?S.used:[])}],
    [/^see you (tomorrow|later|soon|next week|on monday|on the weekend|tonight)(?: at (school|work|the office|the station|class))?$/i,m=>{const t={tomorrow:["明日","あした"],later:["後で","あとで"],soon:["近いうちに","ちかいうちに"],"next week":["来週","らいしゅう"],"on monday":["月曜日に","げつようびに"],"on the weekend":["週末に","しゅうまつに"],tonight:["今夜","こんや"]}[m[1].toLowerCase()];const pl=m[2]?{school:["学校","がっこう"],work:["仕事","しごと"],"the office":["会社","かいしゃ"],"the station":["駅","えき"],class:["授業","じゅぎょう"]}[m[2].toLowerCase()]:null;
      return fx([C("また"),C(t[0],t[1]),...(pl?[CM,C(pl[0],pl[1]),C("で")]:[])])}],
    [/^(?:can|could) you not (?:do that|do this|do it)$/i,()=>fx([C("やめて","やめて"),C("もらえます"),KA])],
    [/^(?:please )?stop being (?:so )?(annoying|mean|rude|loud|weird|lazy|dramatic|childish|noisy)$/i,m=>{const X={annoying:[["うるさく"],["しないで"]],noisy:[["うるさく"],["しないで"]],loud:[["静か","しずか"],["に"],["して"]],mean:[["意地悪","いじわる"],["しないで"]],rude:[["失礼な","しつれいな"],["こと"],["を","お"],["しないで"]],weird:[["変な","へんな"],["こと"],["を","お"],["しないで"]],lazy:[["怠けないで","なまけないで"]],dramatic:[["大げさに","おおげさに"],["しないで"]],childish:[["子供っぽい","こどもっぽい"],["こと"],["を","お"],["しないで"]]}[m[1].toLowerCase()];return fx([...X.map(x=>C(x[0],x[1])),KUDASAI])}],
    [/^(?:i'm|i am) (?:dead tired|exhausted|so exhausted|beat|wiped out|worn out)$/i,()=>fx([C("くたくた"),DESU])],
    [/^what are you up to$/i,()=>fx([C("何","なに"),O,C("して"),C("います"),KA])],
    [/^(?:i'm|i am|we are|we're) broke until (payday|next week|the end of the month|friday)$/i,m=>{const t={payday:["給料日","きゅうりょうび"],"next week":["来週","らいしゅう"],"the end of the month":["月末","げつまつ"],friday:["金曜日","きんようび"]}[m[1].toLowerCase()];return fx([C(t[0],t[1]),C("まで"),C("お金","おかね"),GA,C("ありません")])}],
    [/^(this|that|it|the) ?([a-z ]+?)? slaps$|^(this|that|it) (?:goes hard|hits different|is fire|is lit)$/i,m=>{const np=m[2]?NP(m[2]):null;if(m[2]&&(!np||np.pron))return null;return fx([...(np?[C(/^that$/i.test(m[1])?"あの":"この"),...np.chunks,CM]:[]),C("最高","さいこう"),DESU],np?np.used:[])}],
    [/^whatever(?:,? (?:it(?:'s| is) (?:fine|ok|okay)|it does not matter|i (?:do not|don't) care))?$/i,()=>fx([C("まあ"),CM,C("別に","べつに"),C("いい"),DESU])],
    [/^(?:my |the |this )?(phone|computer|laptop|pc|tablet|app|game|screen|internet|wifi|printer|tv|camera) keeps (freezing|crashing|shutting down|turning off|restarting|disconnecting|dying|lagging)$/i,m=>{const np=NP(m[1]);if(!np)return null;const k=m[2].toLowerCase();
      const V={freezing:["フリーズします"],crashing:["落ちます","おちます"],"shutting down":["切れます","きれます"],"turning off":["切れます","きれます"],restarting:["再起動します","さいきどうします"],disconnecting:["切れます","きれます"],dying:["電池が切れます","でんちがきれます"],lagging:["重くなります","おもくなります"]}[k];
      return fx([...dropMy(np.chunks),GA,C("よく"),C(V[0],V[1]||V[0])],np.used)}],
    [/^(my [a-z]+|he|she|[A-Z][a-z]+|it|this|that) keeps ([a-z]+ing\b.*)$/i,m=>{const S=/^(it|this|that)$/i.test(m[1])?null:who(m[1]),vp=vpIng(m[2]),st=vp&&vstems(vp.v);if(!st||!st.te)return null;if(!S&&!/^(it|this|that)$/i.test(m[1]))return null;
      return fx([...(S?[...S.chunks,WA]:[]),...dropMy(vp.pre),C(st.te[0],st.te[1]),C("ばかり"),C("います")],[...(S?S.used:[]),...vp.used])}],
    [/^(?:that is|that's|that was) not what (?:i|i've) (meant|said|wanted|ordered|asked for)$/i,m=>fx({meant:[C("そういう"),C("意味","いみ"),C("じゃない"),DESU],said:[C("そう"),C("は","わ"),C("言って","いって"),C("いません")],wanted:[C("欲しかった","ほしかった"),C("もの"),C("と"),C("違います","ちがいます")],ordered:[C("注文した","ちゅうもんした"),C("もの"),C("と"),C("違います","ちがいます")],"asked for":[C("頼んだ","たのんだ"),C("もの"),C("と"),C("違います","ちがいます")]}[m[1].toLowerCase()])],
    [/^(?:just )?(?:kidding|joking)$|^(?:i'm|i am) (?:just )?(?:kidding|joking)$|^jk$/i,()=>fx([C("冗談","じょうだん"),DESU])],
    [/^what (?:a|an) (beautiful|amazing|nice|great|pretty|lovely|cute|cool|big|small|delicious|tasty|strange|weird|terrible|funny|interesting) (.+)$/i,m=>{const A={beautiful:["きれいな"],amazing:["すごい"],nice:["いい"],great:["すごい"],pretty:["きれいな"],lovely:["素敵な","すてきな"],cute:["かわいい"],cool:["かっこいい"],big:["大きい","おおきい"],small:["小さい","ちいさい"],delicious:["おいしい"],tasty:["おいしい"],strange:["変な","へんな"],weird:["変な","へんな"],terrible:["ひどい"],funny:["面白い","おもしろい"],interesting:["面白い","おもしろい"]}[m[1].toLowerCase()];
      const np=/^view$/i.test(m[2])?{chunks:[C("景色","けしき")],used:[]}:NP(m[2]);return np&&!np.pron?fx([C(A[0],A[1]||A[0]),...np.chunks,DESU,C("ね")],np.used):null}],
    [/^(?:sorry|i'm sorry|i am sorry) (?:for|about) (?:the |my )?(late reply|late response|slow reply|late answer|being late|making you wait|keeping you waiting|the noise|the mess|bothering you|the trouble|the inconvenience)$/i,m=>{const k=m[1].toLowerCase();const X=/reply|response|answer/.test(k)?[C("返事","へんじ"),GA,C("遅く","おそく"),C("なって")]:/late/.test(k)?[C("遅れて","おくれて")]:/wait/.test(k)?[C("お待たせして","おまたせして")]:/noise/.test(k)?[C("うるさくて")]:/mess/.test(k)?[C("散らかって","ちらかって"),C("いて")]:[C("ご迷惑","ごめいわく"),O,C("おかけして")];return fx([...X,C("すみません")])}],
    [/^(?:i|we) had (?:a |such a )?(really |very |so |pretty )?(bad|terrible|horrible|awful|great|good|nice|long|busy|fun|rough|tough|wonderful|amazing) (day|week|night|year|weekend|trip)$/i,m=>{const a=m[2].toLowerCase(),n=m[3].toLowerCase();const A=/bad|terrible|horrible|awful|rough|tough/.test(a)?["ひどい"]:/long/.test(a)?["長い","ながい"]:/busy/.test(a)?["忙しい","いそがしい"]:/fun/.test(a)?["楽しい","たのしい"]:["いい"];
      const N={day:["一日","いちにち"],week:["一週間","いっしゅうかん"],night:["夜","よる"],time:["時間","じかん"],year:["一年","いちねん"],weekend:["週末","しゅうまつ"],trip:["旅行","りょこう"]}[n];return fx([...(m[1]?[C("本当に","ほんとうに")]:[]),C(A[0],A[1]||A[0]),C(N[0],N[1]),C("でした")])}],
    [/^what time (?:does|do|did|will) (it|this|that|he|she|you|they|we|the [a-z]+(?: [a-z]+)?) (.+)$/i,m=>{const sj=/^(it|this|that|you|we)$/i.test(m[1])?null:/^(he|she|they)$/i.test(m[1])?{chunks:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()]],used:[]}:NP(m[1]);if(sj&&sj.pron&&!sj.chunks.length)return null;
      const vp=VP(m[2]);if(!vp||vp.ing||vp.past)return null;if(!vp.pre.some(c=>c[0]==="を"))viSwap(vp);const e=vend(vp.v,/^did/i.test(m[0].split(" ")[2])?"mashitaka":"masuka");if(!e)return null;
      return fx([...(sj?[...dropMy(sj.chunks),WA]:[]),C("何時","なんじ"),C("に"),...dropMy(vp.pre),...e],[...(sj?sj.used:[]),...vp.used])}],
    [/^how often do (?:you|i|we) (.+)$/i,m=>{const vp=VP(m[1]),e=vp&&!vp.past&&!vp.ing&&vend(vp.v,"masu");return e?fx([C("どのくらい"),C("の"),C("頻度","ひんど"),C("で"),...dropMy(vp.pre),...e,KA],vp.used):null}],
    [/^(?:i am|i'm|we are|we're) (?:really |so )?looking forward to (.+)$/i,m=>{let pre=null,used=[];const vp=vpIng(m[1]);if(vp){const d=vplain(vp.v,"dict");if(d){pre=[...dropMy(vp.pre),...d,C("の")];used=vp.used}}if(!pre){const np=NP(m[1]);if(np&&!np.pron){pre=dropMy(np.chunks);used=np.used}else if(/^(it|that)$/i.test(m[1]))pre=[]}
      return pre?fx([...pre,...(pre.length?[O]:[]),C("楽しみ","たのしみ"),C("に"),C("して"),C("います")],used):null}],
    [/^(?:we are|we're|i am|i'm) running (?:a (?:little |bit )?)?late$/i,()=>fx([C("ちょっと"),C("遅れて","おくれて"),C("います")])],
    [/^(?:i am|i'm|we are|we're) almost (done|finished|ready|there|home)$/i,m=>{const k=m[1].toLowerCase();return fx(k==="ready"?[C("もうすぐ"),C("準備","じゅんび"),GA,C("できます")]:k==="there"?[C("もうすぐ"),C("着きます","つきます")]:k==="home"?[C("もうすぐ"),C("家","いえ"),C("に"),C("着きます","つきます")]:[C("もうすぐ"),C("終わります","おわります")])}],
    [/^(?:[Ii]|[Ww]e) (?:have|made) a reservation (?:under|for) (?:the name )?([A-Z][a-z]+(?: [A-Z][a-z]+)?)$/,m=>fx([[m[1],null,m[1]],C("の"),C("名前","なまえ"),C("で"),C("予約","よやく"),C("して"),C("います")],[{jp:m[1],kana:null,en:"a name, said as it is"}])],
    [/^what do (?:you|we) want to (do|eat|drink|buy|see|watch|play|read|make|cook|order|try|listen to)$/i,m=>{if(/^do$/i.test(m[1]))return fx([C("何","なに"),O,C("したい"),DESU,KA]);const vp=VP(m[1]),st=vp&&vstems(vp.v);return st&&st.i?fx([C("何","なに"),O,C(st.i[0]+"たい",st.i[1]+"たい"),DESU,KA],vp.used):null}],
    [/^(.+?) (?:is|are) (?:very |really |so |pretty )?(near|close|nearby|close by|near here|close to here)$/i,m=>{if(/^(i|you|we|he|she|they|it)$/i.test(m[1]))return null;const np=NP(m[1]),n=np&&np.used[np.used.length-1]||{};if(!np||np.pron||/(^|,)an(,|$)/.test(n.pos||""))return null;
      return fx([...dropMy(np.chunks),WA,...(/here/i.test(m[2])?[C("ここ"),C("から")]:[]),C("近い","ちかい"),DESU],np.used)}],
    [/^(?:the |my |our )?(?:cat|kitty|kitten)s? (?:is|are) purring$/i,()=>fx([C("猫","ねこ"),GA,C("ゴロゴロ"),C("言って","いって"),C("います")])],
    [/^(?:i want|i would like|i'd like) (?:my |the )?(steak|burger|hamburger|meat|beef) (well done|well-done|medium rare|medium-rare|medium|rare)(?: please)?$/i,m=>{const np=NP(m[1]);const k={"well done":"ウェルダン","well-done":"ウェルダン","medium rare":"ミディアムレア","medium-rare":"ミディアムレア",medium:"ミディアム",rare:"レア"}[m[2].toLowerCase()];
      return np&&!np.pron?fx([...np.chunks,WA,C(k),C("で"),C("お願いします","おねがいします")],np.used):null}],
    [/^(i|we) got lost(?: on (?:the|my|our) way(?: to (.+))?)?$/i,m=>{const np=m[2]&&NP(m[2]);if(m[2]&&(!np||np.pron))return null;
      return fx([...(np?[...dropMy(np.chunks),C("に"),C("行く","いく")]:[]),...(/ way/i.test(m[0])?[C("途中","とちゅう"),C("で")]:[]),C("道","みち"),C("に"),C("迷いました","まよいました")],np?np.used:[])}],
    [/^where (?:is|are) (?!(?:you|he|she|they|we|i|it|this|that)$)(.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),WA,C("どこ"),DESU,KA],np.used):null}],
    [/^(?:do you have )?any (?:ideas|suggestions|recommendations)\??$/i,()=>fx([C("何か","なにか"),C("いい"),C("アイデア"),C("は","わ"),C("あります"),KA])],
    [/^it (?:started|began|has started) (?:raining|to rain)$/i,()=>fx([C("雨","あめ"),GA,C("降って","ふって"),C("きました")])],
    [/^it (?:started|began|has started) (?:snowing|to snow)$/i,()=>fx([C("雪","ゆき"),GA,C("降って","ふって"),C("きました")])],
    [/^(?:please )?let me know$|^(?:please )?tell me$/i,()=>fx([C("教えて","おしえて"),KUDASAI])],
    [/^(?:can|could) you tell me how to get to (.+?)(?: from here)?$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...(/from here/i.test(m[0])?[C("ここ"),C("から")]:[]),...np.chunks,C("まで"),C("の"),C("行き方","いきかた"),O,C("教えて","おしえて"),C("もらえます"),KA],np.used):null}],
    [/^it (?:was|is) not as (\w+) as i (?:expected|thought|imagined)$/i,m=>{const r=compose1("it "+(/ was /i.test(m[0])?"was":"is")+" not "+m[1]);return r?fx([C("思った","おもった"),C("ほど"),...r.chunks],r.used):null}],
    [/^(i|we) (?:did not|didn't) know(?: that| about (?:it|that))?$/i,()=>fx([C("知りません","しりません"),C("でした")])],
    [/^(i|we) (?:already )?knew (?:it|that)$/i,()=>fx([C("知って","しって"),C("いました")])],
    [/^i know$|^i know (?:it|that)$/i,()=>fx([C("知って","しって"),C("います")])],
    [/^it was a close (game|match|race|fight)$/i,()=>fx([C("接戦","せっせん"),C("でした")])],
    [/^i am (?:a )?(?:big |huge |really big )?fan of (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("の"),C(/big|huge/i.test(m[0])?"大ファン":"ファン",/big|huge/i.test(m[0])?"だいファン":"ファン"),DESU],np.used):null}],
    [/^it is (my|your|his|her|our) turn$/i,m=>fx([{my:C("私","わたし"),your:C("あなた"),his:C("彼","かれ"),her:C("彼女","かのじょ"),our:C("私たち","わたしたち")}[m[1].toLowerCase()],C("の"),C("番","ばん"),DESU])],
    [/^(i|you|we) (win|won|lose|lost)$/i,m=>{if(/^(won|lost)$/i.test(m[2])&&/^(i|we)$/i.test(m[1]))return null;const w=/^w/i.test(m[2]);return fx([/^you$/i.test(m[1])?C("あなた"):/^we$/i.test(m[1])?C("私たち","わたしたち"):C("私","わたし"),C("の"),C(w?"勝ち":"負け",w?"かち":"まけ"),DESU])}],
    [/^(?:that|it|this) is (?:not fair|unfair|so unfair)$/i,()=>fx([C("ずるい"),DESU])],
    [/^i am better than you at (?:this|that|it)(?: game)?$/i,()=>fx([C("私","わたし"),C("の"),C("ほう"),GA,C("上手","じょうず"),DESU])],
    [/^i (?:did not|didn't) hear (?:my )?(phone|alarm)$/i,m=>fx([/phone/i.test(m[1])?C("スマホ"):C("アラーム"),C("に"),C("気づきません","きづきません"),C("でした")])],
    [/^i will call (?:you|him|her) back$/i,()=>fx([C("折り返し","おりかえし"),C("電話","でんわ"),C("します")])],
    [/^can you hear me$/i,()=>fx([C("聞こえます","きこえます"),KA])],
    [/^you are breaking up$/i,()=>fx([C("声","こえ"),GA,C("途切れて","とぎれて"),C("います")])],
    [/^the (?:connection|signal|reception) is (?:bad|weak|poor|terrible|not good)$/i,()=>fx([C("電波","でんぱ"),GA,C("悪い","わるい"),DESU])],
    [/^i will try my best$|^i will do my best$/i,()=>fx([C("頑張ります","がんばります")])],
    [/^(?:it is|it's) (?:totally |so |really )?(not )?worth it$/i,m=>fx([C("その"),C("価値","かち"),WA,C(m[1]?"ありません":"あります")])],
    [/^it (?:does not|doesn't) matter$/i,()=>fx([C("気にしなくて","きにしなくて"),C("いい"),DESU,C("よ")])],
    [/^it is up to you$|^you decide$|^you choose$/i,()=>fx([C("お任せ","おまかせ"),C("します")])],
    [/^both are (?:good|fine|great|okay)$/i,()=>fx([C("どっちも"),C("いい"),DESU])],
    [/^neither(?: of them)?$/i,()=>fx([C("どっちも"),C("違います","ちがいます")])],
    [/^i (?:do not|don't) care$/i,()=>fx([C("どうでもいい"),DESU],[],["This can sound cold in Japanese. どっちでもいいです (either is fine) is softer."])],
    [/^it is no big deal$|^no big deal$/i,()=>fx([C("大した","たいした"),C("こと"),C("ない"),DESU])],
    [/^what do you think$/i,()=>fx([C("どう"),C("思います","おもいます"),KA])],
    [/^what do you think (?:about|of) (.+)$/i,m=>{const k=m[1].toLowerCase();const np=/^(this|that|it)$/.test(k)?{chunks:[C(k==="that"?"それ":"これ")],used:[]}:/^(him|her|them)$/.test(k)?{chunks:[PJ[k]],used:[]}:NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),C("について"),C("どう"),C("思います","おもいます"),KA],np.used)}],
    [/^you are (?:so |totally |absolutely )?right$/i,()=>fx([C("その"),C("通り","とおり"),DESU])],
    [/^you are wrong$/i,()=>fx([C("それ"),WA,C("違います","ちがいます"),C("よ")])],
    [/^i was wrong$/i,()=>fx([C("私","わたし"),GA,C("間違って","まちがって"),C("いました")])],
    [/^i (?:did not|didn't) mean to (.+)$/i,m=>{const vp=VP(m[1]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");return d?fx([...dropMy(vp.pre),...d,C("つもり"),WA,C("ありません"),C("でした")],vp.used):null}],
    [/^(?:please )?(?:do not|don't) be (mad|angry|upset|sad|scared|afraid|shy|nervous|late|rude|silly)$/i,m=>{const k={mad:"怒らないで",angry:"怒らないで",upset:"怒らないで",sad:"悲しまないで",scared:"怖がらないで",afraid:"怖がらないで",shy:"恥ずかしがらないで",nervous:"緊張しないで",late:"遅れないで",rude:"失礼なことをしないで",silly:"ふざけないで"}[m[1].toLowerCase()];
      const kk={mad:"おこらないで",angry:"おこらないで",upset:"おこらないで",sad:"かなしまないで",scared:"こわがらないで",afraid:"こわがらないで",shy:"はずかしがらないで",nervous:"きんちょうしないで",late:"おくれないで",rude:"しつれいなことをしないで",silly:"ふざけないで"}[m[1].toLowerCase()];return fx([C(k,kk),KUDASAI])}],
    [/^(?:lets|let us) make up$/i,()=>fx([C("仲直り","なかなおり"),C("しましょう")])],
    [/^you (?:did not|didn't) have to (?:do that|do this|do it)$/i,()=>fx([C("そんな"),C("こと"),C("しなくても"),C("よかった"),C("のに")])],
    [/^it is nothing$|^it was nothing$/i,()=>fx([C("何でもない","なんでもない"),DESU])],
    [/^my pleasure$|^the pleasure is mine$/i,()=>fx([C("どういたしまして")])],
    [/^any ?time$/i,()=>fx([C("いつでも"),C("どうぞ")])],
    [/^i am (?:happy|glad) to help$/i,()=>fx([C("喜んで","よろこんで")])],
    [/^(?:let me know|tell me) if you need (?:anything|something|help)$/i,()=>fx([C("何か","なにか"),C("あったら"),C("言って","いって"),KUDASAI])],
    [/^i am (?:always )?here for you$/i,()=>fx([C("いつでも"),C("力","ちから"),C("に"),C("なります")])],
    [/^everything (?:will be|is going to be) (?:okay|ok|alright|all right|fine)$|^it is going to be (?:okay|ok|fine|alright)$|^you will be (?:okay|ok|fine|alright)$/i,()=>fx([C("きっと"),C("大丈夫","だいじょうぶ"),DESU,C("よ")])],
    [/^good luck$/i,()=>fx([...(T.length?[WA]:[]),C("頑張って","がんばって"),KUDASAI])],
    [/^break a leg$|^fighting$|^you got this$|^you have got this$/i,()=>fx([C("頑張って","がんばって")])],
    [/^i am rooting for you$|^i am cheering for you$/i,()=>fx([C("応援","おうえん"),C("して"),C("います")])],
    [/^i am craving (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const dr=/^(コーヒー|お茶|ビール|水|お酒|ジュース|紅茶|コーラ|ミルク|牛乳)$/.test((np.used[np.used.length-1]||{}).jp||"");return fx([...np.chunks,GA,C(dr?"飲みたい":"食べたい",dr?"のみたい":"たべたい"),DESU],np.used)}],
    [/^i could eat a whole (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,O,C("丸ごと","まるごと"),C("食べられ","たべられ"),C("そう"),DESU],np.used):null}],
    [/^(?:this |the |my )?(.+?) needs more (.+)$/i,m=>{const a=NP(m[1]),b=NP(m[2]);return a&&b&&!a.pron&&!b.pron?fx([...dropMy(a.chunks),WA,...b.chunks,GA,C("足りません","たりません")],[...a.used,...b.used]):null}],
    [/^(?:the |my |our )?(.+?) took (?:forever|so long|too long|ages)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const lj=(np.used[np.used.length-1]||{}).jp||"";
      return fx(/^(配達|料理|注文|ピザ|バス|電車|食べ物|荷物|タクシー)$/.test(lj)?[...np.chunks,GA,C("なかなか"),C("来ません","きません"),C("でした")]:[...np.chunks,C("に"),C("すごく"),C("時間","じかん"),GA,C("かかりました")],np.used)}],
    [/^is tipping (?:okay|ok|normal|rude|necessary)(?: in japan)?$/i,()=>fx([C("日本","にほん"),C("で"),C("チップ"),O,C("渡して","わたして"),C("も"),C("いい"),DESU,KA])],
    [/^you (?:do not|don't) (?:need|have) to tip(?: in japan)?$/i,()=>fx([C("日本","にほん"),C("で"),WA,C("チップ"),WA,C("いりません")])],
    [/^what is the best way to (?:get to|go to) (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("まで"),C("どうやって"),C("行く","いく"),C("の"),GA,C("一番","いちばん"),C("いい"),DESU,KA],np.used):null}],
    [/^is it (cheaper|faster|better|easier|quicker) to (?:take|go by|ride) (?:the |a )?(bus|train|taxi|subway|shinkansen|plane)$/i,m=>{const np=NP(m[2]);const a={cheaper:["安い","やすい"],faster:["速い","はやい"],quicker:["速い","はやい"],better:["いい"],easier:["楽","らく"]}[m[1].toLowerCase()];
      return np?fx([...np.chunks,C("の"),C("ほう"),GA,C(a[0],a[1]||a[0]),DESU,KA],np.used):null}],
    [/^(?:the )?(bus|train|taxi|subway) takes longer but (?:it is|it's) cheaper$/i,m=>{const np=NP(m[1]);return np?fx([...np.chunks,C("の"),C("ほう"),GA,C("時間","じかん"),GA,C("かかります"),C("けど"),CM,C("安い","やすい"),DESU],np.used):null}],
    [/^i prefer (.+?)(?: to (.+))?$/i,m=>{const a=NP(m[1]),b=m[2]?NP(m[2]):null;if(!a||a.pron||m[2]&&(!b||b.pron))return null;return fx([...a.chunks,C("の"),C("ほう"),GA,...(b?[...b.chunks,C("より")]:[]),C("好き","すき"),DESU],[...a.used,...(b?b.used:[])])}],
    [/^i get (?:motion |car |sea |travel )?sick on (?:the )?(buses|bus|trains|train|boats|boat|ships|planes|plane)$/i,m=>{const np=NP(m[1].replace(/s$/i,"").replace(/^buse$/i,"bus"));return np?fx([...np.chunks,C("に"),C("酔います","よいます")],np.used):null}],
    [/^i am (?:scared|afraid|terrified) of flying$/i,()=>fx([C("飛行機","ひこうき"),C("に"),C("乗る","のる"),C("の"),GA,C("怖い","こわい"),DESU])],
    [/^it is (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})(?::(\d\d))?(?: o'clock)?(?: (in the morning|in the afternoon|in the evening|at night|am|pm))? in ([A-Z].+)$/i,m=>{const ck=clock(m[1],m[2],/morning|am/i.test(m[3]||"")?"am":/afternoon|evening|night|pm/i.test(m[3]||"")?"pm":null),np=NP(m[4]);return ck&&np&&!np.pron?fx([...np.chunks,WA,...ck.slice(0,-1),DESU],np.used):null}],
    [/^what time is it in (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,WA,C("今","いま"),C("何時","なんじ"),DESU,KA],np.used):null}],
    [/^what happened to your (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,CM,C("どうした"),C("ん"),DESU,KA],np.used):null}],
    [/^what is your (hobby|job|dream|goal|plan|plan for today|favorite food|favourite food|blood type|major|specialty)$/i,m=>{const np=NP(m[1].replace(/ for today$/i,""));return np?fx([...np.chunks,WA,C("何","なん"),DESU,KA],np.used):null}],
    [/^what did you say$/i,()=>fx([C("何","なん"),C("て"),C("言いました","いいました"),KA])],
    [/^who (won|lost|ate|broke|did|called|made|took|stole|said|wrote|drew|cooked|sent) (.+)$/i,m=>{const vp=VP(m[1]+" "+m[2]);if(!vp||!vp.past)return null;const e=vend(vp.v,"mashita");return e?fx([C("誰","だれ"),GA,...vp.pre,...e,KA],vp.used):null}],
    [/^do you play any sports$/i,()=>fx([C("何か","なにか"),C("スポーツ"),O,C("します"),KA])],
    [/^(?:which|what) team do you (?:support|like|root for|cheer for)$/i,()=>fx([C("どの"),C("チーム"),O,C("応援","おうえん"),C("して"),C("います"),KA])],
    [/^you cheated$/i,()=>fx([C("ずるした"),C("でしょう")])],
    [/^i (?:did not|didn't|have not|haven't) (?:get|got|received|receive) your (message|email|text|letter|package|mail)$/i,m=>{const np=NP(m[1]);return np?fx([...np.chunks,GA,C("届いて","とどいて"),C("いません")],np.used):null}],
    [/^my phone is on (?:silent|mute|vibrate)$/i,()=>fx([C("スマホ"),O,C("マナーモード"),C("に"),C("して"),C("います")])],
    [/^(?:i appreciate it|i really appreciate it|i appreciate that)$/i,()=>fx([C("本当に","ほんとうに"),C("ありがとうございます")])],
    [/^(?:that is|that's|it is) (?:very |so |really )?(kind|nice|sweet|thoughtful|generous) of you$/i,()=>fx([C("ご親切","ごしんせつ"),C("に"),C("ありがとうございます")])],
    [/^i do not think i can make it$|^i can not make it$/i,m=>fx(/think/i.test(m[0])?[C("行けない","いけない"),C("と"),C("思います","おもいます")]:[C("行けません","いけません")])],
    [/^(?:that|it) was (?:so |really |too )?close$/i,()=>fx([C("危なかった","あぶなかった"),DESU])],
    [/^(?:one more|another) (round|drink|glass)(?: please)?$/i,()=>fx([C("もう"),C("一杯","いっぱい"),C("お願いします","おねがいします")])],
    [/^(?:the |my )?(wifi|wi-fi|internet|tv|television|key|card|key card|room key|light|lights|air conditioner|heater|shower|toilet|elevator|remote|phone|charger|atm) (?:does not|do not|is not|are not|will not) (?:work|working|turn on)$/i,m=>{const k=m[1].toLowerCase();
      const n={wifi:["ワイファイ"],"wi-fi":["ワイファイ"],internet:["インターネット"],tv:["テレビ"],television:["テレビ"],key:["鍵","かぎ"],card:["カード"],"key card":["カードキー"],"room key":["部屋","へや","の鍵","のかぎ"],light:["電気","でんき"],lights:["電気","でんき"],"air conditioner":["エアコン"],heater:["暖房","だんぼう"],shower:["シャワー"],toilet:["トイレ"],elevator:["エレベーター"],remote:["リモコン"],phone:["スマホ"],charger:["充電器","じゅうでんき"],atm:["ATM","エーティーエム"]}[k];
      const e=/^(wifi|wi-fi|internet)$/.test(k)?[C("つながりません")]:/^(key|card|key card|room key|atm|charger)$/.test(k)?[C("使えません","つかえません")]:/^(tv|television|light|lights|air conditioner|heater)$/.test(k)?[C("つきません")]:[C("壊れて","こわれて"),C("います")];
      return fx([C(n[0]+(n[2]||""),(n[1]||n[0])+(n[3]||"")),GA,...e])}],
    [/^i (?:can not|could not) connect to (?:the )?(wifi|wi-fi|internet)$/i,m=>fx([/internet/i.test(m[1])?C("インターネット"):C("ワイファイ"),C("に"),C("つながりません")])],
    [/^how much is (?:this|that|it) in (dollars|yen|euros|pounds)$/i,m=>fx([C({dollars:"ドル",yen:"円",euros:"ユーロ",pounds:"ポンド"}[m[1].toLowerCase()],{dollars:"ドル",yen:"えん",euros:"ユーロ",pounds:"ポンド"}[m[1].toLowerCase()]),C("で"),C("いくら"),DESU,KA])],
    [/^(?:it|this|that) is (?:a little |a bit |way )?too (\w+) for me$/i,m=>{const r=compose1("it is too "+m[1]);return r?fx([C("私","わたし"),C("に"),WA,...r.chunks],r.used):null}],
    [/^(?:the |my |this )?(.+?) went by (?:so |really |very )?(?:fast|quickly)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,GA,C("あっという間","あっというま"),C("に"),C("過ぎました","すぎました")],np.used):null}],
    [/^it is time (?:to|for) (bed|sleep|go|leave|eat|dinner|lunch|breakfast|work|school|class|go home|wake up|get up)$/i,m=>{const k=m[1].toLowerCase(),
      e={bed:["寝る","ねる"],sleep:["寝る","ねる"],go:["行く","いく"],leave:["出る","でる"],eat:["食べる","たべる"],"go home":["帰る","かえる"],"wake up":["起きる","おきる"],"get up":["起きる","おきる"]}[k],n={dinner:["晩ご飯","ばんごはん"],lunch:["お昼ご飯","おひるごはん"],breakfast:["朝ご飯","あさごはん"],work:["仕事","しごと"],school:["学校","がっこう"],class:["授業","じゅぎょう"]}[k];
      return fx([C("もう"),...(e?[C(e[0],e[1])]:[C(n[0],n[1]),C("の")]),C("時間","じかん"),DESU])}],
    [/^(?:can you |could you )?(?:go faster|drive faster|hurry up)(?: please)?$/i,m=>fx([C("急いで","いそいで"),...(/^(can|could)/i.test(m[0])?[C("もらえます"),KA]:[KUDASAI])])],
    [/^(?:please )?(?:slow down|drive slower|drive more slowly)(?: please)?$/i,()=>fx([C("スピード"),O,C("落として","おとして"),KUDASAI])],
    [/^i am (?:getting |feeling )?(carsick|car sick|seasick|sea sick|airsick)$/i,m=>{const k=/car/i.test(m[1])?["車酔い","くるまよい"]:/sea/i.test(m[1])?["船酔い","ふなよい"]:["飛行機酔い","ひこうきよい"];return fx([C(k[0],k[1]),C("しました")])}],
    [/^i missed my (?:connection|connecting flight|transfer)$/i,()=>fx([C("乗り継ぎ","のりつぎ"),C("の"),C("便","びん"),C("に"),C("乗り遅れました","のりおくれました")])],
    [/^where is (?:the )?baggage claim$/i,()=>fx([C("手荷物","てにもつ"),C("受取所","うけとりしょ"),WA,C("どこ"),DESU,KA])],
    [/^i have nothing to declare$/i,()=>fx([C("申告","しんこく"),C("する"),C("もの"),WA,C("ありません")])],
    [/^is (breakfast|dinner|lunch|wifi|wi-fi|parking|the service charge|service) included$/i,m=>{const np=NP(m[1].replace(/^the /i,""));return np?fx([...np.chunks,WA,C("付いて","ついて"),C("います"),KA],np.used):null}],
    [/^do you have anything (cheaper|smaller|bigger|larger|lighter|else|different|similar)$/i,m=>{const k=m[1].toLowerCase();if(k==="else")return fx([C("他","ほか"),C("に"),C("何か","なにか"),C("あります"),KA]);
      const a={cheaper:["安い","やすい"],smaller:["小さい","ちいさい"],bigger:["大きい","おおきい"],larger:["大きい","おおきい"],lighter:["軽い","かるい"],different:["違う","ちがう"],similar:["似た","にた"]}[k];
      return fx([...(/^(different|similar)$/.test(k)?[]:[C("もっと")]),C(a[0],a[1]),C("の"),WA,C("あります"),KA])}],
    [/^i will think about it and come back(?: later)?$/i,()=>fx([C("ちょっと"),C("考えて","かんがえて"),CM,C("また"),C("来ます","きます")])],
    [/^i am (?:just )?(?:browsing|looking around)$/i,()=>fx([C("見て","みて"),C("いる"),C("だけ"),DESU])],
    [/^i will take (one|two|three|four|five)(?: of (?:these|those|them|this|that))?$/i,m=>{const n=numOf(m[1]);return n?fx([C(n===10?"十":KJ[n]+"つ",CNT.tsu[n-1]),KUDASAI]):null}],
    [/^(?:can|could) you (?:gift wrap|gift-wrap|wrap) (?:it|this|that)(?: as a gift| for a gift)?$/i,m=>/gift/i.test(m[0])?fx([C("プレゼント"),C("用","よう"),C("に"),C("包んで","つつんで"),C("もらえます"),KA]):null],
    [/^what is (?:this|that|it) made (?:of|from)$/i,()=>fx([C("これ"),WA,C("何","なに"),C("で"),C("できて"),C("います"),KA])],
    [/^i want this(?: one)?$/i,()=>fx([C("これ"),GA,C("ほしい"),DESU])],
    [/^which (?:one )?do you (want|like|prefer)$/i,m=>fx([C("どれ"),GA,C("いい"),DESU,KA])],
    [/^(?:the )?leaves are (?:changing color|turning red|changing colour)$/i,()=>fx([C("紅葉","こうよう"),C("して"),C("きました")])],
    [/^(?:lets|let us) have (?:a |an )?(picnic|party|barbecue|bbq|break|drink|drinks)$/i,m=>{const k=m[1].toLowerCase();return fx(k==="break"?[C("休憩","きゅうけい"),C("しましょう")]:/drink/.test(k)?[C("飲み","のみ"),C("に"),C("行きましょう","いきましょう")]:[C({picnic:"ピクニック",party:"パーティー",barbecue:"バーベキュー",bbq:"バーベキュー"}[k]),O,C("しましょう")])}],
    [/^i got (?:a )?(sunburn|sunburned|sunburnt|tan|tanned)$/i,()=>fx([C("日焼け","ひやけ"),C("しました")])],
    [/^there (?:are|were) (?:so many|a lot of|lots of|too many|tons of) (.+?)(?: (here|there))?$/i,m=>{const np=/^people$/i.test(m[1])?{chunks:[C("人","ひと")],used:[]}:NP(m[1]);if(!np||np.pron)return null;const p=/were/i.test(m[0]);
      return fx([...(m[2]?[C(/here/i.test(m[2])?"ここ":"そこ"),WA]:[]),...np.chunks,GA,C("とても"),C(p?"多かった":"多い",p?"おおかった":"おおい"),DESU],np.used)}],
    [/^i could stay here forever$/i,()=>fx([C("ずっと"),C("ここ"),C("に"),C("いたい"),DESU])],
    [/^we made it$|^i made it$/i,()=>fx([C("間に合いました","まにあいました")])],
    [/^i am (?:so |really |very )?(?:glad|happy) (?:you are here|you came|you could come)$/i,()=>fx([C("来て","きて"),C("くれて"),C("本当に","ほんとうに"),C("嬉しい","うれしい"),DESU])],
    [/^i was (?:so |really |very )?worried about (you|him|her|them)$/i,m=>fx([WHO[m[1].toLowerCase()]||C("彼ら","かれら"),C("の"),C("こと"),O,C("心配","しんぱい"),C("して"),C("いました")])],
    [/^where have you been$/i,()=>fx([C("どこ"),C("に"),C("行って"),C("いた"),C("ん"),DESU,KA])],
    [/^i have been (?:so |really |very )?(busy|sick|tired|stressed|lonely|happy|bored)$/i,m=>{const r=compose1("i am "+m[1]);return r?fx([...(T.length?[]:[C("最近","さいきん"),C("ずっと")]),...r.chunks],r.used):null}],
    [/^i (?:did not|didn't) do anything$/i,()=>fx([...(T.length?[WA]:[]),C("何も","なにも"),C("しません"),C("でした")])],
    [/^how many (.+?) (do you have|are there|are coming|are you|did you buy|do you want|do you need)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const u=np.used[np.used.length-1]||{},ani=/(^|,)ani(,|$)/.test(u.pos||""),per=!ani&&/(^|,)an(,|$)/.test(u.pos||"");
      const q=ani?["何匹","なんびき"]:per?["何人","なんにん"]:["いくつ","いくつ"],k=m[2].toLowerCase();if(/^(人|人々)$/.test(u.jp||"")&&!/have/.test(k))return fx([C(q[0],q[1]),.../there/.test(k)?[C("います")]:/coming/.test(k)?[C("来ます","きます")]:[C("います")],KA],[]);
      if(/have/.test(k))return fx(ani?[...np.chunks,O,C(q[0],q[1]),C("飼って","かって"),C("います"),KA]:per?[...np.chunks,WA,C(q[0],q[1]),C("います"),KA]:[...np.chunks,O,C(q[0],q[1]),C("持って","もって"),C("います"),KA],np.used);
      const e=/there/.test(k)?[C(ani||per?"います":"あります")]:/coming/.test(k)?[C("来ます","きます")]:/are you/.test(k)?[DESU]:/buy/.test(k)?[C("買いました","かいました")]:/want/.test(k)?[C("ほしい"),DESU]:[C("いります")];
      return fx([...np.chunks,...(/(are you|coming|there)/.test(k)?[WA]:[O]),C(q[0],q[1]),...e,KA],np.used)}],
    [/^(?:can|could) you help me (?!with )(.+)$/i,m=>{const vp=VP(m[1]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");return d?fx([...dropMy(vp.pre),...d,C("の"),O,C("手伝って","てつだって"),C("もらえます"),KA],vp.used):null}],
    [/^(?:this |the |my )?(.+?) (smells|tastes|looks|sounds|feels) like (?:a |an |the )?(.+)$/i,m=>{if(/^(fun|a lot of fun|so much fun|(?:a )?(?:good|great|nice|fun|bad|terrible) (?:idea|plan|time|deal)|plan|idea|trouble|work|you|me|him|her)$/i.test(m[3]))return null;const x=/^(it|this|that)$/i.test(m[1])?{chunks:[],used:[]}:NP(m[1]),y=NP(m[3]);if(!x||!y||x.pron||y.pron||y.used.some(u=>u.kind==="dictionary"))return null;
      const k=m[2].toLowerCase(),e={smells:[C("みたいな"),C("におい"),GA,C("します")],tastes:[C("みたいな"),C("味","あじ"),GA,C("します")],looks:[C("みたい"),DESU],sounds:[C("みたい"),DESU,C("ね")],feels:[C("みたい"),DESU]}[k];
      return fx([...(x.chunks.length?[...dropMy(x.chunks),WA]:[]),...y.chunks,...e],[...x.used,...y.used])}],
    [/^(?:is it going to|will it) (rain|snow)$/i,m=>{const f=byJP("降る:ふる","v"),e=f&&vend(f,"masuka");return e?fx([/snow/i.test(m[1])?C("雪","ゆき"):C("雨","あめ"),GA,...e],[f]):null}],
    [/^i have a flat tire$|^my (?:car |bike )?tire is flat$|^i got a flat tire$/i,()=>fx([C("タイヤ"),GA,C("パンク"),C("しました")])],
    [/^the (?:power|electricity) (?:went out|is out|is off|went off)$|^(?:there is|there was) a (?:power outage|blackout)$/i,()=>fx([C("停電","ていでん"),C("しました")])],
    [/^(?:someone|somebody) (?:hit|crashed into|bumped into) my car$/i,()=>fx([C("車","くるま"),O,C("ぶつけられました")])],
    [/^i broke my (.+)$/i,m=>{const np=NP(m[1]);return np&&isBody(np)?fx([...np.chunks,O,C("骨折","こっせつ"),C("しました")],np.used):null}],
    [/^i (?:hurt|injured) my (.+)$/i,m=>{const np=/^back$/i.test(m[1])?{chunks:[C("腰","こし")],used:[]}:NP(m[1]);return np&&(isBody(np)||!np.used.length)?fx([...np.chunks,O,C("痛めました","いためました")],np.used):null}],
    [/^i (?:can not|could not) move my (.+)$/i,m=>{const np=NP(m[1]);return np&&isBody(np)?fx([...np.chunks,GA,C("動かせません","うごかせません"),...(/could/i.test(m[0])?[C("でした")]:[])],np.used):null}],
    [/^i feel like (?:throwing up|i am going to throw up|vomiting|puking)$/i,()=>fx([C("吐き","はき"),C("そう"),DESU])],
    [/^(?:my |the )?(.+?) (?:is|are) (?:driving me crazy|making me crazy|driving me nuts)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),C("の"),C("せい"),C("で"),C("頭","あたま"),GA,C("おかしく"),C("なり"),C("そう"),DESU],np.used):null}],
    [/^(?:my |the )?(plant|plants|flowers?|tree|garden) (?:is|are) dying$/i,m=>{const np=NP(m[1]);return np?fx([...np.chunks,GA,C("枯れ","かれ"),C("そう"),DESU],np.used):null}],
    [/^(?:my |the |this )?(.+?) hates me$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),C("に"),C("嫌われて","きらわれて"),C("います")],np.used):null}],
    [/^my car (?:will not|does not|won't|doesn't) start$/i,()=>fx([C("車","くるま"),C("の"),C("エンジン"),GA,C("かかりません")])],
    [/^i am locked out of my (car|room|house|apartment|hotel room)$/i,m=>/car/i.test(m[1])?fx([C("車","くるま"),C("に"),C("鍵","かぎ"),O,C("閉じ込めて","とじこめて"),C("しまいました")]):fx([C("鍵","かぎ"),O,C("中","なか"),C("に"),C("忘れて","わすれて"),CM,C("入れなく","はいれなく"),C("なりました")])],
    [/^(?:my )?(.+?) (?:was|were) stolen$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),O,C("盗まれました","ぬすまれました")],np.used):null}],
    [/^(?:my )?(cold|headache|fever|cough|pain|stomachache|toothache|hangover|rash) (?:is gone|went away|has gone away|is better)$/i,m=>{const np=NP(m[1]);return np?fx([...np.chunks,GA,C("治りました","なおりました")],np.used):null}],
    [/^(?:the )?(.+?) (?:ran out|has run out|is gone)$/i,m=>{const np=NP(m[1]);return np&&!np.pron&&!isBody(np)&&np.used.every(u=>!/(^|,)an(,|$)/.test(u.pos||""))?fx([...np.chunks,GA,C("切れました","きれました")],np.used):null}],
    [/^(?:we|i) ran out of (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,GA,C("なくなりました")],np.used):null}],
    [/^(?:i|we) walk (?:my|our|the) dog$/i,()=>fx([C("犬","いぬ"),C("の"),C("散歩","さんぽ"),O,C("します")])],
    [/^(.+?) can say (hello|hi|goodbye|bye|thank you|sorry|i love you|yes|no)$/i,m=>{const A0=who(m[1]);if(!A0)return null;const k={hello:"こんにちは",hi:"こんにちは",goodbye:"さようなら",bye:"バイバイ","thank you":"ありがとう",sorry:"ごめんなさい","i love you":"大好き",yes:"はい",no:"いいえ"}[m[2].toLowerCase()];
      return fx([...dropMy(A0.chunks),WA,C("「"+k+"」"),C("と"),C("言えます","いえます")],A0.used)}],
    [/^(?:can|could) you keep a secret$/i,()=>fx([C("秘密","ひみつ"),O,C("守れます","まもれます"),KA])],
    [/^(he|she|they) (?:does not|do not) know i exist$/i,m=>fx([{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()],WA,C("私","わたし"),C("の"),C("存在","そんざい"),O,C("知りません","しりません")])],
    [/^(?:are you|is he|is she) single$/i,m=>fx([...(/he$/i.test(m[0].split(" ")[1])?[C(/she/i.test(m[0])?"彼女":"彼",/she/i.test(m[0])?"かのじょ":"かれ"),WA]:[]),C("今","いま"),CM,C("付き合って","つきあって"),C("いる"),C("人","ひと"),WA,C("います"),KA])],
    [/^i am married with (\w+) (kids|children|sons|daughters)$/i,m=>{const n=numOf(m[1]);if(!n||n>10)return null;return fx([C("結婚","けっこん"),C("して"),C("いて"),CM,C(/son/i.test(m[2])?"息子":/daughter/i.test(m[2])?"娘":"子供",/son/i.test(m[2])?"むすこ":/daughter/i.test(m[2])?"むすめ":"こども"),GA,C(KJ[n]+"人",CNT.nin[n-1]),C("います")])}],
    [/^i am (?:so |really |very )?proud of (.+)$/i,m=>{const np=/^(you|him|her|them|us)$/i.test(m[1])?{chunks:[WHO[m[1].toLowerCase()]],used:[]}:/^myself$/i.test(m[1])?{chunks:[C("自分","じぶん")],used:[]}:NP(m[1]);
      return np&&!np.pron?fx([...dropMy(np.chunks),O,C("誇り","ほこり"),C("に"),C("思います","おもいます")],np.used):null}],
    [/^(?:we|i) did it$/i,()=>fx([C("やった")])],
    [/^i (passed|failed) (?:my |the )?(?:driving|driver's|drivers) test$/i,m=>fx([C("運転免許","うんてんめんきょ"),C("の"),C("試験","しけん"),...(/pass/i.test(m[1])?[C("に"),C("合格","ごうかく"),C("しました")]:[C("に"),C("落ちました","おちました")])])],
    [/^i got into (?:a |the )?(.+)$/i,m=>{const np=NP(m[1]);const n=np&&np.used[np.used.length-1];return n&&/^(大学|高校|学校|大学院|中学校)$/.test(n.jp)?fx([...dropMy(np.chunks),C("に"),C("合格","ごうかく"),C("しました")],np.used):null}],
    [/^(?:my )?first day (?:was|went) (okay|ok|fine|alright|good|great|bad|terrible|awful)$/i,m=>{const k=m[1].toLowerCase();return fx([C("初日","しょにち"),WA,...(/^(okay|ok|fine|alright)$/.test(k)?[C("まあまあ"),C("でした")]:/^(good|great)$/.test(k)?[C("よかった"),DESU]:[C("最悪","さいあく"),C("でした")])])}],
    [/^i have always wanted to (.+)$/i,m=>{const vp=VP(m[1].replace(/^visit /i,"go to "));const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);return st&&st.te?fx([C("ずっと"),...dropMy(vp.pre),C(st.te[0],st.te[1]),C("みたかった"),DESU],vp.used):null}],
    [/^i (?:can not|cannot) wait to (.+)$/i,m=>{const vp=VP(m[1]),st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(vp&&st&&/みる$/.test(vp.v.jp)){const d=vplain(vp.v,"dict");if(d)return fx([...dropMy(vp.pre),...d,C("の"),GA,C("楽しみ","たのしみ"),DESU],vp.used)}const pt=st&&(NOPOT.has(vp.v.jp)?null:st.pot);if(!pt)return null;let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),GA,...pre.slice(oi+1)];
      return fx([...pre,C(pt[0]+"る",pt[1]+"る"),C("の"),GA,C("楽しみ","たのしみ"),DESU],vp.used)}],
    [/^i will miss you$/i,()=>fx([C("寂しく","さびしく"),C("なります")])],
    [/^(?:lets|let us) keep in touch$|^keep in touch$/i,()=>fx([C("連絡","れんらく"),O,C("取り合いましょう","とりあいましょう")])],
    [/^it was (?:nice|great|good|a pleasure) (?:meeting|to meet|seeing|to see) you$/i,()=>fx([C("お会い","おあい"),C("できて"),C("よかった"),DESU])],
    [/^i had (?:so much|a lot of|lots of|a ton of|) ?fun$/i,m=>fx([...(/much|lot|ton/i.test(m[0])?[C("とても")]:[]),C("楽しかった","たのしかった"),DESU])],
    [/^(?:sorry|i am sorry) (?:for|about) (?:the|your|making you) wait(?:ing)?$|^sorry to keep you waiting$/i,()=>fx([C("お待たせ","おまたせ"),C("しました")])],
    [/^(?:one moment|just a moment|a moment|one second|just a second|one sec|just a sec)(?: please)?$/i,()=>fx([C("少々","しょうしょう"),C("お待ちください","おまちください")])],
    [/^let me check$/i,()=>fx([C("確認","かくにん"),C("させて"),KUDASAI])],
    [/^how much (?:does it cost|is it) to (?:get in|go in|enter)$/i,()=>fx([C("入場料","にゅうじょうりょう"),WA,C("いくら"),DESU,KA])],
    [/^(?:my |the )?(.+?) (?:is|are) partying$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),GA,C("騒いで","さわいで"),C("います")],np.used):null}],
    [/^(?:this|that) is (?:unacceptable|not acceptable|ridiculous)$/i,()=>fx([C("これ"),WA,C("納得","なっとく"),C("できません")])],
    [/^i am not angry,? (?:i am )?(?:just |only )?(disappointed|sad|tired)$/i,m=>fx([C("怒って","おこって"),C("いません"),["。",null,"."],C("ただ"),C({disappointed:"がっかりしている",sad:"悲しい",tired:"疲れている"}[m[1].toLowerCase()],{disappointed:"がっかりしている",sad:"かなしい",tired:"つかれている"}[m[1].toLowerCase()]),C("だけ"),DESU])],
    [/^i am used to it$|^i am used to that$|^i am getting used to it$/i,m=>fx([C("もう"),C("慣れて","なれて"),C(/getting/i.test(m[0])?"きました":"います")])],
    [/^whatever happens,? happens$/i,()=>fx([C("なるように"),C("なる")],[],["A Japanese saying with the same idea: “it will become what it becomes”."])],
    [/^it is what it is$/i,()=>fx([C("しょうがない"),DESU])],
    [/^life goes on$/i,()=>fx([C("それでも"),C("人生","じんせい"),WA,C("続きます","つづきます")])],
    [/^tomorrow is another day$/i,()=>fx([C("明日","あした"),WA,C("明日","あした"),C("の"),C("風","かぜ"),GA,C("吹く","ふく")],[],["A Japanese saying: “tomorrow, tomorrow's wind will blow” (things will be different tomorrow)."])],
    [/^nobody is perfect$|^no one is perfect$/i,()=>fx([C("完璧","かんぺき"),C("な"),C("人","ひと"),WA,C("いません")])],
    [/^everyone makes mistakes$|^everybody makes mistakes$/i,()=>fx([C("誰","だれ"),C("に"),C("でも"),C("間違い","まちがい"),WA,C("あります")])],
    [/^it is never too late$/i,()=>fx([C("遅すぎる","おそすぎる"),C("こと"),WA,C("ありません")])],
    [/^follow your (?:dreams?|heart)$/i,m=>fx([/heart/i.test(m[0])?C("心","こころ"):C("夢","ゆめ"),O,/heart/i.test(m[0])?C("信じて","しんじて"):C("追いかけて","おいかけて"),KUDASAI])],
    [/^you only live once$|^yolo$/i,()=>fx([C("人生","じんせい"),WA,C("一度","いちど"),C("きり"),DESU])],
    [/^(?:the )?road is closed$/i,()=>fx([C("通行止め","つうこうどめ"),DESU])],
    [/^(he|she|you|[A-Z][a-z]+) is (?:totally |so |just )?(not )?my type$/,m=>{const A0=/^(he|she|you)$/i.test(m[1])?{chunks:[WHO[m[1].toLowerCase()]],used:[]}:who(m[1]);return A0?fx([...A0.chunks,WA,C("私","わたし"),C("の"),C("タイプ"),...(m[2]?[C("じゃない")]:[]),DESU],A0.used):null}],
    [/^(we|they) are just friends$/i,()=>fx([C("ただ"),C("の"),C("友達","ともだち"),DESU])],
    [/^it is (one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})(?::(\d\d))?(?: o'clock)?(?: (in the morning|in the afternoon|in the evening|at night|am|pm))?$/i,m=>{const ck=clock(m[1],m[2],/morning|am/i.test(m[3]||"")?"am":/afternoon|evening|night|pm/i.test(m[3]||"")?"pm":null);return ck?fx([...ck.slice(0,-1),DESU]):null}],
    [/^(.+?)(?:'s)? name is ([A-Z][a-z]+)$/,m=>{const x=/^my$/i.test(m[1])?{chunks:[],used:[]}:NP(m[1]);return x&&!x.pron?fx([...dropMy(x.chunks),...(x.chunks.length?[C("の")]:[]),C("名前","なまえ"),WA,[m[2],null],DESU],[...x.used,{jp:m[2],kana:null,en:"a name, said as it is"}]):null}],
    [/^(?:the )?(.+?) (?:is|are) real$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const n=np.used[np.used.length-1]||{};return fx([...np.chunks,WA,...(/(^|,)an(,|$)/.test(n.pos||"")?[C("本当","ほんとう"),C("に"),C("います")]:[C("本物","ほんもの"),DESU])],np.used)}],
    [/^believe in yourself$/i,()=>fx([C("自分","じぶん"),O,C("信じて","しんじて"),KUDASAI])],
    [/^(my [a-z]+|[A-Z][a-z]+|he|she) can (run|swim|sing|dance|cook|eat|drive|jump|read|type|climb) (faster|better|more|longer|higher|farther) than (me|you|him|her|my [a-z]+|[A-Z][a-z]+)$/,m=>{
      const A0=/^(he|she)$/i.test(m[1])?{chunks:[WHO[m[1].toLowerCase()]],used:[]}:who(m[1]),B=/^(me|you|him|her)$/i.test(m[4])?{chunks:[WHO[m[4].toLowerCase()]],used:[]}:who(m[4]),vp=VP(m[2]),st=vp&&vstems(vp.v),pt=st&&!NOPOT.has(vp.v.jp)&&st.pot;if(!A0||!B||!pt)return null;
      const adv={faster:["速く","はやく"],better:["上手に","じょうずに"],more:["たくさん","たくさん"],longer:["長く","ながく"],higher:["高く","たかく"],farther:["遠く","とおく"]}[m[3].toLowerCase()];
      return fx([...dropMy(A0.chunks),WA,...dropMy(B.chunks),C("より"),C(adv[0],adv[1]),C(pt[0]+"ます",pt[1]+"ます")],[...A0.used,...B.used,...vp.used])}],
    [/^(.+?) wants to be (?:a |an )?(.+)$/i,m=>{if(/^(i|you|we)$/i.test(m[1]))return null;const A0=/^(he|she|they)$/i.test(m[1])?{chunks:[WHO[m[1].toLowerCase()]],used:[]}:who(m[1]),X=NP(m[2]);if(!A0||!X||X.pron)return null;
      return fx([...dropMy(A0.chunks),WA,...X.chunks,C("に"),C("なりたがって"),C("います")],[...A0.used,...X.used])}],
    [/^(.+?) wants to (.+)$/i,m=>{if(/^(i|you|we)$/i.test(m[1])||/^be /i.test(m[2]))return null;const A0=/^(he|she|they)$/i.test(m[1])?{chunks:[WHO[m[1].toLowerCase()]],used:[]}:who(m[1]),vp=VP(m[2]),st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!A0||!st||!st.i)return null;
      return fx([...dropMy(A0.chunks),WA,...dropMy(vp.pre),C(st.i[0]+"たがって",st.i[1]+"たがって"),C("います")],[...A0.used,...vp.used])}],
    // "I was too tired" -> 疲れすぎていました
    [/^(?:i|we) (am|are|was|were) (?:way |much |just )?too (tired|busy|sleepy|scared|nervous|drunk|full|cold|hot)$/i,m=>{const p=/^(was|were)$/i.test(m[1]),k=m[2].toLowerCase();
      const f={tired:p?["疲れすぎていました","つかれすぎていました"]:["疲れすぎています","つかれすぎています"],busy:p?["忙しすぎました","いそがしすぎました"]:["忙しすぎます","いそがしすぎます"],sleepy:p?["眠すぎました","ねむすぎました"]:["眠すぎます","ねむすぎます"],
        scared:p?["怖すぎました","こわすぎました"]:["怖すぎます","こわすぎます"],nervous:p?["緊張しすぎていました","きんちょうしすぎていました"]:["緊張しすぎています","きんちょうしすぎています"],drunk:p?["飲みすぎていました","のみすぎていました"]:["飲みすぎました","のみすぎました"],
        full:p?["お腹がいっぱいでした","おなかがいっぱいでした"]:["もうお腹いっぱいです","もうおなかいっぱいです"],cold:p?["寒すぎました","さむすぎました"]:["寒すぎます","さむすぎます"],hot:p?["暑すぎました","あつすぎました"]:["暑すぎます","あつすぎます"]}[k];
      const e=/^(.*)(ました|ます|でした|です)$/.exec(f[0]),ek=/^(.*)(ました|ます|でした|です)$/.exec(f[1]);
      return fx([C(e[1],ek[1]),C(e[2])])}],
    [/^(i|we) just (.+)$/i,m=>{const r=compose1(m[1]+" "+m[2]),L=r&&r.chunks[r.chunks.length-1];if(!L||!/ました$/.test(L[0]))return null;const p=toPlain(r.chunks);return p?fx([...p,C("ばかり"),C("です")],r.used,["… たばかりです = just did …"]):null}],
    [/^i do not want to talk about (?:it|that|this)$/i,()=>fx([C("その"),C("話","はなし"),WA,C("したくない"),DESU])],
    [/^i am (getting |slowly getting )?used to (.+)$/i,m=>{let x=null;const lv=/^living (here|in (.+))$/i.exec(m[2]);
      if(lv){const pl=lv[2]?NP(lv[2]):null;if(lv[2]&&(!pl||pl.pron))return null;x={chunks:[...(pl?pl.chunks:[C("ここ")]),C("での"),C("生活","せいかつ")],used:pl?pl.used:[]}}
      else{x=NP(m[2]);if(!x||x.pron||x.used.some(u=>u.kind==="dictionary")){const vp=VP(m[2].replace(/^([a-z]+)ing\b/i,(a,b)=>b)),d=vp&&!vp.past&&vplain(vp.v,"dict");x=d?{chunks:[...vp.pre,...d,C("の")],used:vp.used}:null}}
      if(!x)return null;return fx([...dropMy(x.chunks),C("に"),C("慣れて","なれて"),C(m[1]?"きました":"います")],x.used)}],
    [/^(?:thank you|thanks)(?: so much| very much| a lot)?$/i,()=>fx([C("ありがとう"),C("ございます")])],
    [/^(?:thank you|thanks) (?:so much |very much |a lot )?for ([a-z]+ing)(?: (me|us))?(?: (.+))?$/i,m=>{const w=m[1].toLowerCase(),b=w.slice(0,-3),cands=[b,b+"e",b.replace(/(.)\1$/,"$1")];let vp=null;for(const c of cands){vp=VP([c,m[3]||""].join(" ").trim());if(vp)break}
      const st=vp&&!vp.past&&vstems(vp.v);if(!st||!st.te)return null;return fx([...dropMy(vp.pre),C(st.te[0],st.te[1]),C("くれて"),C("ありがとう"),C("ございます")],vp.used)}],
    [/^(?:i will )?see you$/i,()=>{if(!T.length)return null;const t0=T;T=[];Tu=[];return fx([C("また"),...t0])}],
    [/^what time is (?:the )?(.+)$/i,m=>{if(/^it$/i.test(m[1]))return null;const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,WA,C("何時","なんじ"),DESU,KA],np.used):null}],
    [/^(?:i would like to|i want to|can i|could i) stay (?:one more|another|an extra|one extra) night$/i,m=>fx([C("もう"),C("一泊","いっぱく"),...(/^(can|could)/i.test(m[0])?[C("できます"),KA]:[C("したい"),DESU])])],
    [/^i will have the same(?: thing)?(?: please)?$/i,()=>fx([C("同じ","おなじ"),C("もの"),O,C("お願いします","おねがいします")])],
    [/^how long (?:does|will|would) it take(?: to get)?(?: to)? ?(there|here|.*)$/i,m=>{if(!m[1]||/^(there|here)$/i.test(m[1]))return fx([...(!m[1]?[]:/^here$/i.test(m[1])?[C("ここ"),C("まで")]:[C("そこ"),C("まで")]),C("どのくらい"),C("かかります"),KA]);
      const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("まで"),C("どのくらい"),C("かかります"),KA],np.used):null}],
    [/^it takes (?:about |around )?(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?)(?: (?:by (train|bus|car|taxi|bike|plane|subway)|(on foot|to walk|walking)))?$/i,m=>{const d=duration(m[1],m[2]);if(!d)return null;
      const by={train:["電車","でんしゃ"],bus:["バス"],car:["車","くるま"],taxi:["タクシー"],bike:["自転車","じてんしゃ"],plane:["飛行機","ひこうき"],subway:["地下鉄","ちかてつ"]}[(m[3]||"").toLowerCase()];
      return fx([...(by?[C(by[0],by[1]||by[0]),C("で")]:m[4]?[C("歩いて","あるいて")]:[]),d,...(/about|around/i.test(m[0])?[C("くらい")]:[]),C("かかります")])}],
    [/^(?:excuse me,? )?can i (?:get|go|squeeze) (?:through|past|by)$/i,()=>fx([C("すみません"),CM,C("通して","とおして"),KUDASAI])],
    [/^is (?:anyone|anybody|someone|somebody) sitting here$/i,()=>fx([C("ここ"),CM,C("空いて","あいて"),C("います"),KA])],
    [/^(?:my )?(.+?) (?:is|are) running late$/i,m=>{if(/^i$/i.test(m[1]))return null;const A0=who(m[1]);return A0?fx([...dropMy(A0.chunks),WA,C("遅れて","おくれて"),C("います")],A0.used):null}],
    [/^(?:this is |it is )?(?:my |our )?(second|third|fourth|fifth|2nd|3rd|4th|5th) time(?: (?:in|to|at|visiting|coming to) (.+))?$/i,m=>{const n={second:2,"2nd":2,third:3,"3rd":3,fourth:4,"4th":4,fifth:5,"5th":5}[m[1].toLowerCase()];const np=m[2]?NP(m[2]):null;if(m[2]&&(!np||np.pron))return null;
      return fx([...(np?[...np.chunks,WA]:[]),C(KJ[n]+"回目",["","にかいめ","さんかいめ","よんかいめ","ごかいめ"][n-1]),DESU],np?np.used:[])}],
    [/^(i|we) came (?:here |to (.+?) )?to (.+)$/i,m=>{const vp=VP(m[3]);const st=vp&&!vp.past&&!vp.ing&&vstems(vp.v);if(!st||!st.i)return null;const pl=m[2]?NP(m[2]):null;if(m[2]&&(!pl||pl.pron))return null;
      return fx([...dropMy(vp.pre),C(st.i[0],st.i[1]),C("に"),...(pl?[...pl.chunks,C("に")]:/ here /i.test(m[0])?[C("ここ"),C("に")]:[]),C("来ました","きました")],[...vp.used,...(pl?pl.used:[])])}],
    [/^(?:my |the |this |that )?(.+?) (?:smells|smell|smelled) (?:really |so |very )?(bad|terrible|awful|weird|strange|funny)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;return fx([...dropMy(np.chunks),WA,...(/^(bad|terrible|awful)$/i.test(m[2])?[C("臭い","くさい")]:[C("変な","へんな"),C("におい"),GA,C("します")]),...(/^(bad|terrible|awful)$/i.test(m[2])?[DESU]:[])],np.used)}],
    [/^(?:it|this|that) (?:tastes|tasted) (okay|ok|fine|alright|not bad|good|great|amazing|bad|terrible|awful)$/i,m=>{const k=m[1].toLowerCase(),p=/ed /.test(m[0]);
      return fx(/^(okay|ok|fine|alright|not bad)$/.test(k)?[C("味","あじ"),WA,C("悪くない","わるくない"),DESU]:/^(good|great|amazing)$/.test(k)?[C(p?"おいしかった":"おいしい"),DESU]:[C(p?"まずかった":"まずい"),DESU])}],
    [/^(?:i|we) (?:really )?miss (.+?)(?: (so much|so so much|a lot|too|already|terribly))?$/i,m=>{if(/^you$/i.test(m[1]))return null;const np=NP(m[1]);if(!np||np.pron&&!/^(him|her|them)$/i.test(m[1]))return null;const n=np.used[np.used.length-1]||{},per=np.pron||/(^|,)an(,|$)/.test(n.pos||"")&&!/(^|,)ani(,|$)/.test(n.pos||"");
      const so=m[2]&&!/^(too|already)$/i.test(m[2])||/really/i.test(m[0])?[C("とても")]:[];const al=/already/i.test(m[2]||"")?[C("もう")]:[];
      return fx([...(np.pron?[WHO[m[1].toLowerCase()]]:dropMy(np.chunks)),...(per||/(^|,)ani(,|$)/.test(n.pos||"")?[C("に"),...al,...so,C("会いたい","あいたい"),DESU]:[GA,...al,...so,C("恋しい","こいしい"),DESU])],np.used)}],
    [/^(.+?) asked me out$/i,m=>{const A0=who(m[1]);return A0?fx([...dropMy(A0.chunks),C("に"),C("デート"),C("に"),C("誘われました","さそわれました")],A0.used):null}],
    [/^i said yes$/i,()=>fx([C("「はい」"),C("と"),C("言いました","いいました")])],
    [/^i said no$/i,()=>fx([C("断りました","ことわりました")])],
    [/^i am (?:feeling (?:much |a lot |a little |a bit )?better|getting better|(?:much |a lot |a little |a bit )better now|feeling better now)$/i,()=>fx([C("だいぶ"),C("良く","よく"),C("なりました")])],
    [/^i had (?:a |an )?(bad |good |weird |strange |scary |nice |sweet )?dream$/i,m=>{const k={bad:["悪い","わるい"],good:["いい"],nice:["いい"],sweet:["いい"],weird:["変な","へんな"],strange:["変な","へんな"],scary:["怖い","こわい"]}[(m[1]||"").trim().toLowerCase()];
      return fx([...(k?[C(k[0],k[1]||k[0])]:[]),C("夢","ゆめ"),O,C("見ました","みました")])}],
    [/^i (?:can not|could not) stop thinking about (it|that|you|him|her|them)$/i,m=>fx([{it:C("その"),that:C("その")}[m[1].toLowerCase()]||WHO[m[1].toLowerCase()],...(/^(it|that)$/i.test(m[1])?[]:[C("の")]),C("こと"),C("ばかり"),C("考えて","かんがえて"),C("しまいます")])],
    [/^i have never been this (happy|sad|tired|scared|excited|angry|nervous)(?: in my (?:whole |entire )?life| before)?$/i,m=>{const k={happy:["幸せ","しあわせ"],sad:["悲しい","かなしい"],tired:["疲れた","つかれた"],scared:["怖い","こわい"],excited:["わくわくした"],angry:["腹が立った","はらがたった"],nervous:["緊張した","きんちょうした"]}[m[1].toLowerCase()];
      return fx([C("こんなに"),C(k[0],k[1]||k[0]),...(k[0]==="幸せ"?[C("な")]:[]),C("の"),WA,C("初めて","はじめて"),DESU])}],
    [/^it is getting (cold|colder|hot|hotter|warm|warmer|dark|darker|cool|cooler|busy|crowded)$/i,m=>{const k={cold:["寒","さむ"],colder:["寒","さむ"],hot:["暑","あつ"],hotter:["暑","あつ"],warm:["暖か","あたたか"],warmer:["暖か","あたたか"],dark:["暗","くら"],darker:["暗","くら"],cool:["涼し","すずし"],cooler:["涼し","すずし"]}[m[1].toLowerCase()];
      const ki=C("きました","きました");ki.v=byJP("来る","v");
      if(!k)return/busy/i.test(m[1])?fx([C("忙しく","いそがしく"),C("なって"),ki]):fx([C("混んで","こんで"),ki]);return fx([C(k[0]+"く",k[1]+"く"),C("なって"),ki])}],
    [/^i do not have (?:enough |any )?time (?:to|for) (.+)$/i,m=>{const vp=VP(m[1]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(d)return fx([...dropMy(vp.pre),...d,C("時間","じかん"),GA,C("ありません")],vp.used);const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("の"),C("時間","じかん"),GA,C("ありません")],np.used):null}],
    [/^(?:my |the |our )?(.+?) is taking (?:forever|so long|too long|a long time|ages)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const lj=(np.used[np.used.length-1]||{}).jp||"";
      return fx(/^(配達|料理|注文|ピザ|バス|電車|食べ物|荷物|タクシー)$/.test(lj)?[...dropMy(np.chunks),GA,C("なかなか"),C("来ません","きません")]:[...dropMy(np.chunks),C("に"),C("すごく"),C("時間","じかん"),GA,C("かかって"),C("います")],np.used)}],
    [/^(?:can you |could you |please )?(?:be quiet|keep it down|quiet down)(?: please)?$/i,m=>fx([C("静か","しずか"),C("に"),C("して"),...(/^(can|could)/i.test(m[0])?[C("もらえます"),KA]:[KUDASAI])])],
    [/^my alarm (?:did not|didn't) go off$/i,()=>fx([C("アラーム"),GA,C("鳴りません","なりません"),C("でした")])],
    [/^i am going to be late(?: for (.+))?$/i,m=>{const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;return fx([...(np?[...dropMy(np.chunks),C("に")]:[]),C("遅れ","おくれ"),C("そう"),DESU],np?np.used:[])}],
    [/^(?:my )?(.+?) is going to kill me$/i,m=>{const A0=who(m[1]);return A0?fx([...dropMy(A0.chunks),C("に"),C("絶対","ぜったい"),C("怒られます","おこられます")],A0.used,["Said as “I'll definitely get told off by …”."]):null}],
    [/^i figured it out$/i,()=>fx([C("分かりました","わかりました")])],
    [/^it (?:was|is) (easier|harder|better|worse|bigger|smaller|cheaper|faster|slower|longer|shorter|more fun|more difficult|more expensive) than i (?:thought|expected|imagined)$/i,m=>{
      const b={easier:"easy",harder:"hard",better:"good",worse:"bad",bigger:"big",smaller:"small",cheaper:"cheap",faster:"fast",slower:"slow",longer:"long",shorter:"short","more fun":"fun","more difficult":"difficult","more expensive":"expensive"}[m[1].toLowerCase()];
      const r=compose1("it "+(/ was /i.test(m[0])?"was":"is")+" "+b);return r?fx([C("思った","おもった"),C("より"),...r.chunks],r.used):null}],
    [/^i almost forgot$/i,()=>fx([C("忘れる","わすれる"),C("ところ"),C("でした")])],
    [/^i (?:completely |totally )forgot(?: about (it|that|you))?$/i,m=>fx([...(m[1]&&/you/i.test(m[1])?[C("あなた"),C("の"),C("こと"),O]:[]),C("すっかり"),C("忘れて","わすれて"),C("いました")])],
    [/^remind me$/i,()=>fx([C("また"),C("言って","いって"),KUDASAI])],
    [/^(?:please )?do not forget to (.+)$/i,m=>{const vp=VP(m[1]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");return d?fx([...dropMy(vp.pre),...d,C("の"),O,C("忘れないで","わすれないで"),KUDASAI],vp.used):null}],
    [/^i will be (?:right back|back soon|back in a minute|back)$/i,()=>(T=[],Tu=[],fx([C("すぐ"),C("戻ります","もどります")]))],
    [/^have a (good|nice|great|fun|safe|wonderful) (weekend|trip|day|night|time|holiday|vacation|flight)$/i,m=>{if(/safe/i.test(m[1]))return fx([C("気をつけて","きをつけて"),CM,C("行って","いって"),C("らっしゃい")]);
      const k={weekend:["週末","しゅうまつ"],trip:["旅","たび"],day:["一日","いちにち"],night:["夜","よる"],time:["時間","じかん"],holiday:["休日","きゅうじつ"],vacation:["休暇","きゅうか"],flight:["空の旅","そらのたび"]}[m[2].toLowerCase()];
      return fx([C("いい"),C(k[0],k[1]),O])}],
    [/^sleep (?:well|tight)$/i,()=>fx([C("ゆっくり"),C("休んで","やすんで"),KUDASAI])],
    [/^sweet dreams$/i,()=>fx([C("いい"),C("夢","ゆめ"),O,C("見て","みて"),C("ね")])],
    [/^do you (?:want|need) anything$/i,()=>fx([C("何か","なにか"),C("いります"),KA])],
    [/^(?:i|we) got (a little |a bit |kind of |slightly |totally |completely |really )?lost(?: on the way(?: (here|home)| to (?:the |my )?(.+))?)?$/i,m=>{const np=m[3]?NP(m[3]):null;if(m[3]&&(!np||np.pron))return null;const lt=/little|bit|kind|slightly/i.test(m[1]||"");
      const way=m[2]?(/here/i.test(m[2])?[C("ここ"),C("に"),C("来る","くる"),C("途中","とちゅう"),C("で")]:[C("帰る","かえる"),C("途中","とちゅう"),C("で")]):np?[...np.chunks,C("に"),C("行く","いく"),C("途中","とちゅう"),C("で")]:[];
      return fx([...way,...(lt?[C("ちょっと")]:[]),C("道","みち"),C("に"),C("迷いました","まよいました")],np?np.used:[])}],
    [/^(i do not know|do you know|can you tell me|could you tell me|tell me) where (.+?) (?:is|are)$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;const n=np.used[np.used.length-1]||{},live=/(^|,)an(,|$)/.test(n.pos||"");
      const end={"i do not know":[C("分かりません","わかりません")],"do you know":[C("知って","しって"),C("います"),KA],"can you tell me":[C("教えて","おしえて"),C("もらえます"),KA],"could you tell me":[C("教えて","おしえて"),C("もらえます"),KA],"tell me":[C("教えて","おしえて"),KUDASAI]}[m[1].toLowerCase()];
      return fx([...dropMy(np.chunks),GA,C("どこ"),C("に"),C(live?"いる":"ある"),C("か"),...end],np.used)}],
    [/^how do (?:you|i|we) (use|open|close|eat|make|cook|turn on|turn off|start|fix|play|read|do) (this|that|it)$/i,m=>{const vp=VP(m[1]+" it");const e=vp&&vend(vp.v,"masuka");return e?fx([C(/^that$/i.test(m[2])?"それ":"これ"),WA,C("どうやって"),...e],vp.used):null}],
    [/^(i want to learn|i want to know|can you show me|could you show me|can you teach me|could you teach me|please show me|please teach me|show me|teach me|i do not know|i know) how to (.+)$/i,m=>{
      const doit=/^do (it|this|that)$/i.test(m[2]),vp=doit?{v:{jp:"やる",kana:"やる",pos:"v5r"},pre:[],used:[]}:VP(m[2]);if(!vp||vp.past||vp.ing)return null;const st=doit?{i:["やり","やり"]}:vstems(vp.v);if(!st||!st.i)return null;
      let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("の"),...pre.slice(oi+1)];if(pre.length&&/^(それ|これ)$/.test(pre[0][0])&&pre.length===2)pre=[];
      if(vp.v.jp==="着く"){const k2=pre.map(c=>c[0]).lastIndexOf("に");if(k2>=0)pre=[...pre.slice(0,k2),C("まで"),C("の"),...pre.slice(k2+1)]}
      const kata=vp.v.jp==="着く"?[C("行き方","いきかた")]:/^(する|やる)$/.test(vp.v.jp)?[C("やり方","やりかた")]:st.suru?[C(vp.v.jp,vp.v.kana),C("の"),C("仕方","しかた")]:[C(st.i[0]+"方",st.i[1]+"かた")];
      const k=m[1].toLowerCase(),end=/learn/.test(k)?[O,C("習いたい","ならいたい"),DESU]:/not know/.test(k)?[GA,C("分かりません","わかりません")]:/^i know/.test(k)?[O,C("知って","しって"),C("います")]:/want to know/.test(k)?[O,C("知りたい","しりたい"),DESU]:/^(can|could)/.test(k)?[O,C("教えて","おしえて"),C("もらえます"),KA]:[O,C("教えて","おしえて"),KUDASAI];
      return fx([...pre,...kata,...end],vp.used)}],
    [/^i will pay(?: for (?:the |this |)?(.+))?$/i,m=>{const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;return fx([...(np?[...np.chunks,WA]:[]),C("私","わたし"),GA,C("払います","はらいます")],np?np.used:[])}],
    [/^(?:my |our )?(.+?) (?:is|are) coming to visit(?: me| us)?$/i,m=>{const A0=who(m[1]);return A0?fx([...dropMy(A0.chunks),GA,C("遊び","あそび"),C("に"),C("来ます","きます")],A0.used):null}],
    [/^(dinner|lunch|breakfast|the food|food|the bath|the tea|the coffee|everything) is ready$/i,m=>{const np=/^everything$/i.test(m[1])?{chunks:[C("準備","じゅんび")],used:[]}:NP(m[1]);return np?fx([...np.chunks,GA,C("できました")],np.used):null}],
    [/^(?:i am|we are) ready$/i,()=>fx([C("準備","じゅんび"),GA,C("できました")])],
    [/^are you ready$/i,()=>fx([C("準備","じゅんび"),WA,C("できました"),KA])],
    [/^i am built different$/i,()=>fx([C("私","わたし"),WA,C("格","かく"),GA,C("違います","ちがいます")],[],["Slang: “I'm on another level” is said as 格が違います."])],
    [/^(?:bro|he|she) is (?:cooking|cookin)$/i,m=>/^(he|she)$/i.test(m[0].split(" ")[0])?null:fx([C("絶好調","ぜっこうちょう"),DESU],[],["Slang: “bro is cooking” (doing great) is said as 絶好調です (on top form)."])],
    [/^it is giving (?:main character|main character energy)$/i,()=>fx([C("主人公","しゅじんこう"),C("みたい"),DESU])],
    [/^money (?:does not|do not|will not) grow on trees$/i,()=>fx([C("お金","おかね"),WA,C("簡単","かんたん"),C("に"),WA,C("手","て"),C("に"),C("入りません","はいりません")],[],["Said as “money doesn't come easily”."])],
    [/^(?:my |the |this |that )?(.+?) is judging me$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),C("に"),C("白い目","しろいめ"),C("で"),C("見られて","みられて"),C("います")],np.used,["白い目で見る = to look at someone coldly / disapprovingly."]):null}],
    [/^(?:i|he|she) burn(?:ed|t) (?:my|his|her) (.+)$/i,m=>{const np=NP(m[1]);return np&&isBody(np)?fx([...np.chunks,O,C("やけど"),C("しました")],np.used):null}],
    [/^(?:someone|somebody) took (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),O,C("持っていかれました","もっていかれました")],np.used,["Said as “I had my … taken away”."]):null}],
    [/^i am retired$/i,()=>fx([C("もう"),C("退職","たいしょく"),C("して"),C("います")])],
    [/^(?:i|we) (?:work|am working|are working) from home$/i,()=>fx([C("在宅勤務","ざいたくきんむ"),O,C("して"),C("います")])],
    [/^(?:can|could) you help me (?:with|carry) (?:my |the |this |these |our )?(bags?|luggage|suitcases?|baggage)$/i,()=>fx([C("荷物","にもつ"),O,C("運ぶ","はこぶ"),C("の"),O,C("手伝って","てつだって"),C("もらえます"),KA])],
    [/^(?:can|could) you help me with (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),O,C("手伝って","てつだって"),C("もらえます"),KA],np.used):null}],
    [/^(?:please )?stop (?:here|right here)(?: please)?$/i,()=>fx([C("ここ"),C("で"),C("止めて","とめて"),KUDASAI])],
    [/^no (?:photos|pictures|photographs)(?: please)?$/i,()=>fx([C("写真","しゃしん"),WA,C("撮らないで","とらないで"),KUDASAI])],
    [/^the (?:lights?|light) (?:does not|do not|will not|is not|are not) (?:work|working|turn on)$/i,()=>fx([C("電気","でんき"),GA,C("つきません")])],
    [/^(?:my |the )?(?:phone |phone's )?battery is (?:low|almost dead|dying|running low|almost empty)$/i,()=>fx([C("バッテリー"),GA,C("少ない","すくない"),DESU])],
    [/^my (muscles|legs|arms|whole body|body) (?:are|is) (?:so |really |very )?sore$/i,m=>{const k={legs:["足","あし"],arms:["腕","うで"],"whole body":["全身","ぜんしん"],body:["全身","ぜんしん"]}[m[1].toLowerCase()];
      return fx([...(k?[C(k[0],k[1]),GA]:[]),C("筋肉痛","きんにくつう"),DESU])}],
    [/^i am (?:way |far |getting |much )?too old for (?:this|that)$/i,()=>fx([C("もう"),C("年","とし"),DESU,C("ね")],[],["Said as “I'm getting old, huh”."])],
    [/^i am (?:addicted to|hooked on|obsessed with) (.+)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const lj=(np.used[np.used.length-1]||{}).jp||"";
      const dep=/^(スマホ|携帯|携帯電話|インターネット|ネット|お酒|酒|ギャンブル|タバコ|薬|ゲーム|カフェイン|砂糖)$/.test(lj);
      return fx([...dropMy(np.chunks),C("に"),dep?C("依存","いぞん"):C("ハマって"),dep?C("しています"):C("います")],np.used)}],
    [/^(?:my |the )?(.+?) (?:is|are) killing me$/i,m=>{const np=NP(m[1]);return np&&isBody(np)?fx([...dropMy(np.chunks),GA,C("すごく"),C("痛い","いたい"),DESU],np.used):null}],
    [/^(?:i|he|she) cut (?:my|his|her) (.+)$/i,m=>{const np=NP(m[1]);return np&&isBody(np)?fx([...np.chunks,O,C("切りました","きりました")],np.used):null}],
    [/^(?:please )?turn (left|right)(?: at (?:the |that |this )?(.+))?$/i,m=>{const at=m[2]?NP(m[2]):null;if(m[2]&&(!at||at.pron))return null;
      return fx([...(at?[...at.chunks,O]:[]),m[1].toLowerCase()==="left"?C("左","ひだり"):C("右","みぎ"),C("に"),C("曲がって","まがって"),KUDASAI],at?at.used:[])}],
    [/^(?:that |it |this )?sounds (?:like )?(?:a )?(?:really |so |very )?(fun|lot of fun|so much fun)$/i,()=>fx([C("楽しそう","たのしそう"),C("です"),C("ね")])],
    [/^(?:that |it |this )?(?:sounds|is|'s) (?:like )?(?:a |an )?(?:really |very )?(good|great|nice|excellent|brilliant|wonderful) idea$/i,()=>fx([C("いい"),C("考え","かんがえ"),C("です"),C("ね")])],
    [/^(?:that |it |this )?sounds (?:like )?(?:a |an )?(?:really |very )?(bad|terrible|awful) idea$/i,()=>fx([C("それは"),C("やめた"),C("ほうが"),C("いい"),C("と"),C("思います","おもいます")])],
    [/^(?:that |it |this )?sounds (?:really |so |very )?(good|great|fun|nice|perfect|amazing|awesome|like a plan|like a good idea|like fun|like a good plan|like a great plan)$/i,()=>fx([C("いい"),C("です"),C("ね")])],
    [/^(?:count me in|i am in|me too|i am down)$/i,()=>fx([C("私","わたし"),C("も"),C("参加","さんか"),C("します")])],
    [/^i am out$/i,()=>fx([C("私","わたし"),WA,C("やめて"),C("おきます")])],
    [/^time flies$/i,()=>fx([C("時間","じかん"),GA,C("経つ","たつ"),C("の"),WA,C("早い","はやい"),DESU,C("ね")],[],["Said as “time passes fast, doesn't it”."])],
    [/^my bad$/i,()=>fx([C("ごめんなさい")],[],["“My bad” is a casual sorry."])],
    [/^practice makes perfect$/i,()=>fx([C("継続","けいぞく"),WA,C("力","ちから"),C("なり")],[],["A Japanese proverb with the same idea: “keeping at it is strength”."])],
    [/^better late than never$/i,()=>fx([C("遅く","おそく"),C("ても"),C("やらない"),C("より"),WA,C("まし"),DESU])],
    [/^i did not mean (?:it|to)$/i,()=>fx([C("わざと"),C("じゃない"),DESU])],
    [/^i owe you(?: one)?$/i,()=>fx([C("借り","かり"),GA,C("できました")])],
    [/^you saved my life$/i,()=>fx([C("あなた"),WA,C("命","いのち"),C("の"),C("恩人","おんじん"),DESU])],
    [/^no worries$/i,()=>fx([C("気にしないで","きにしないで"),KUDASAI])],
    [/^it depends$/i,()=>fx([C("場合","ばあい"),C("に"),C("よります")])],
    [/^i am not (?:sure|certain)$/i,()=>fx([C("よく"),C("分かりません","わかりません")])],
    [/^i have no idea$/i,()=>fx([C("全然","ぜんぜん"),C("分かりません","わかりません")])],
    [/^let me think(?: about it)?$/i,()=>fx([C("ちょっと"),C("考えさせて","かんがえさせて"),KUDASAI])],
    [/^i changed my mind$/i,()=>fx([C("気","き"),GA,C("変わりました","かわりました")])],
    [/^i believe in (you|him|her|myself)$/i,m=>fx([m[1].toLowerCase()==="myself"?C("自分","じぶん"):WHO[m[1].toLowerCase()],O,C("信じて","しんじて"),C("います")])],
    [/^(?:lets|let us) do (?:this|it)$/i,()=>fx([C("やりましょう")])],
    [/^(?:we|you) can do (?:it|this)$/i,()=>fx([C("きっと"),C("できます")])],
    [/^it is getting late$/i,()=>fx([C("遅く","おそく"),C("なって"),C("きました")])],
    [/^i am running late$/i,()=>fx([C("遅れて","おくれて"),C("います")])],
    [/^is (?:this|that|the) seat (?:taken|free|available|empty)$/i,()=>fx([C("この"),C("席","せき"),WA,C("空いて","あいて"),C("います"),KA])],
    [/^can you show me (?:it |that |where )?on (?:the |a )?map$/i,()=>fx([C("地図","ちず"),C("で"),C("教えて","おしえて"),C("もらえます"),KA])],
    [/^is (?:this|it|that) vegetarian$/i,()=>fx([C("これ"),WA,C("ベジタリアン"),C("向け","むけ"),DESU,KA])],
    [/^can i (?:get|have) (?:this|it|that) to go$/i,()=>fx([C("持ち帰り","もちかえり"),C("で"),C("お願いします","おねがいします")])],
    [/^(?:a )?table for (\w+)$/i,m=>{const n=numOf(m[1]);return n&&n<=10?fx([C(KJ[n]+"人",CNT.nin[n-1]),C("で"),C("お願いします","おねがいします")]):null}],
    [/^do you take (?:credit )?cards?$/i,()=>fx([C("カード"),WA,C("使えます","つかえます"),KA])],
    [/^is (?:the )?tax included$/i,()=>fx([C("税込み","ぜいこみ"),DESU,KA])],
    [/^do you have (?:this|it|that|these|this one) in (?:a |an )?(.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,WA,C("あります"),KA],np.used):null}],
    [/^(?:it|this|they|these) (?:does not|do not) fit$/i,()=>fx([C("サイズ"),GA,C("合いません","あいません")])],
    [/^how far is (?:it|that)(?: from here)?$/i,()=>fx([C("ここ"),C("から"),C("どのくらい"),DESU,KA])],
    [/^how far is (.+?) from (here|the station|the hotel|the airport|my hotel)$/i,m=>{const np=NP(m[1]);const fr=/^here$/i.test(m[2])?{chunks:[C("ここ")],used:[]}:NP(m[2]);return np&&!np.pron&&fr?fx([...fr.chunks,C("から"),...np.chunks,C("まで"),C("どのくらい"),DESU,KA],[...fr.used,...np.used]):null}],
    [/^how far is (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("まで"),C("どのくらい"),DESU,KA],np.used):null}],
    [/^is it (?:within )?walking distance$/i,()=>fx([C("歩いて","あるいて"),C("行ける","いける"),C("距離","きょり"),DESU,KA])],
    [/^keep the change$/i,()=>fx([C("お釣り","おつり"),WA,C("いりません")])],
    [/^what is your favou?rite (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([C("一番","いちばん"),C("好き","すき"),C("な"),...np.chunks,WA,C("何","なん"),DESU,KA],np.used):null}],
    [/^(.+?) (?:is|are) my favou?rite(?: [a-z]+)?$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...dropMy(np.chunks),GA,C("一番","いちばん"),C("好き","すき"),DESU],np.used):null}],
    [/^(?:can|could) you write (?:it|that|this) down$/i,()=>fx([C("書いて","かいて"),C("もらえます"),KA])],
    [/^what is (this|that) (.+)$/i,m=>{const np=NP(m[2]);return np&&!np.pron?fx([m[1].toLowerCase()==="this"?C("この"):C("あの"),...np.chunks,WA,C("何","なん"),DESU,KA],np.used):null}],
    [/^(hello|hi|good morning|good evening|good night) (?:everyone|everybody|all|guys|y'all)$/i,m=>fx([C("みなさん"),CM,C({hello:"こんにちは",hi:"こんにちは","good morning":"おはようございます","good evening":"こんばんは","good night":"おやすみなさい"}[m[1].toLowerCase()])])],
    [/^i will be there in (\w+) (minutes?|hours?)$/i,m=>{const d=duration(m[1],m[2]);return d?fx([d,C("で"),C("着きます","つきます")]):null}],
    [/^i am here (?:on|for) (?:a )?(business|vacation|holiday|work|sightseeing|trip|study|school)$/i,m=>{const k={business:["仕事","しごと"],work:["仕事","しごと"],vacation:["休暇","きゅうか"],holiday:["休暇","きゅうか"],sightseeing:["観光","かんこう"],trip:["旅行","りょこう"],study:["留学","りゅうがく"],school:["留学","りゅうがく"]}[m[1].toLowerCase()];
      return fx([C(k[0],k[1]),C("で"),C("来ました","きました")])}],
    [/^i locked myself out(?: of (?:my |the |our )?(.+))?$/i,m=>{const np=m[1]?NP(m[1]):null;if(m[1]&&(!np||np.pron))return null;return fx([C("鍵","かぎ"),O,C("中","なか"),C("に"),C("忘れて","わすれて"),CM,...(np?[...np.chunks,C("に")]:[]),C("入れなく","はいれなく"),C("なりました")],np?np.used:[])}],
    [/^have you seen (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,O,C("見ません","みません"),C("でした"),KA],np.used):null}],
    [/^(.+?) got (cancell?ed|postponed|delayed|stolen)$/i,m=>{const np=NP(m[1]);if(!np||np.pron)return null;const k=m[2].toLowerCase();
      const e=/^cancel/.test(k)?[C("中止","ちゅうし"),C("に"),C("なりました")]:k==="postponed"?[C("延期","えんき"),C("に"),C("なりました")]:k==="delayed"?[C("遅れて","おくれて"),C("います")]:[C("盗まれました","ぬすまれました")];
      return fx([...dropMy(np.chunks),GA,...e],np.used)}],
    [/^i got (?:a )?promot(?:ed|ion)$/i,()=>fx([C("昇進","しょうしん"),C("しました")])],
    [/^(.+?) (?:is|are) out of (.+)$/i,m=>{const x=NP(m[2]);if(!x||x.pron)return null;const me=/^(i|we)$/i.test(m[1]),S0=me?null:NP(m[1]);if(!me&&(!S0||S0.pron))return null;
      return fx([...(S0?[...dropMy(S0.chunks),C("の")]:[]),...x.chunks,GA,C("切れて","きれて"),C("います")],[...(S0?S0.used:[]),...x.used])}],
    [/^(?:(can you|could you|please) )?turn (up|down) (?:the )?(music|volume|sound|tv)$/i,m=>fx([C("音量","おんりょう"),O,m[2].toLowerCase()==="up"?C("上げて","あげて"):C("下げて","さげて"),...(m[1]&&/can|could/i.test(m[1])?[C("もらえます"),KA]:[KUDASAI])])],
    [/^(.+?) turned (.+?) into (?:an? )?(.+)$/i,m=>{const A0=who(m[1]),B=NP(m[2]),X=NP(m[3]);if(!A0||!B||!X||B.pron||X.pron)return null;
      return fx([...A0.chunks,GA,...B.chunks,O,...X.chunks,C("に"),C("変えました","かえました")],[...A0.used,...B.used,...X.used])}],
    [/^(.+?) fell (?:down|off|from|out of) (?:the |a |an |my |his |her )?(.+)$/i,m=>{const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]),X=NP(m[2]);if(!A0||!X||X.pron)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[GA]:[]),...X.chunks,C("から"),C("落ちました","おちました")],[...A0.used,...X.used])}],
    [/^(he|she|they|my [a-z]+|the [a-z]+|the [a-z]+ [a-z]+|the [a-z]+ (?:near|by|at|in) (?:the )?[a-z]+|the [a-z]+ [a-z]+ (?:near|by|at|in) (?:the )?[a-z]+|[A-Z][a-z]+) (?:has|have) (?:an? |some )?(.+)$/,m=>{const rl=/^(?:really|very|such) /i.test(m[2]);let x2=m[2].replace(/^(?:really|very|such) /i,"");const A0=who(m[1]);let X=NP(x2);
      if(X&&/^(?:good|great|nice) /i.test(x2)&&(X.used[X.used.length-1]||{}).pos&&/(^|,)fd(,|$)/.test(X.used[X.used.length-1].pos))X=NP(x2.replace(/^\w+ /,"delicious "))||X;
      {const LS=x2.split(/,? and |, /);const items=LS.map(t=>{const q=/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (.+)$/i.exec(t.trim());if(!q)return null;const n=/^an?$/i.test(q[1])?1:numOf(q[1]);const np=NP(q[2].replace(/(?<=[^s])s$/,"").replace(/ies$/,"y"))||NP(q[2]);const c=np&&!np.pron&&counted(n,np);return c?{np,c}:null});
       if(A0&&LS.length>=1&&items.every(Boolean)&&(LS.length>1||/^(two|three|four|five|six|seven|eight|nine|ten|\d+) /i.test(x2))){const ani=items.every(it=>it.np.used.some(u=>/(^|,)ani(,|$)/.test(u.pos||"")));const ch=[];items.forEach((it,i)=>{ch.push(...it.np.chunks,ani?O:GA,...it.c);if(i<items.length-1)ch.push(C("と"))});
         const v=ani?byJP("飼う","v"):null,e=v&&vend(v,"teiru");return fx([...A0.chunks,WA,...ch,...(ani?(e||[null]):[C("あります")])],[...A0.used,...items.flatMap(it=>it.np.used),...(v?[v]:[])])}}
      if(!A0||!X||X.pron||X.chunks.some(c=>c[1]==null))return null;
      if(rl)X={...X,chunks:[C("本当に","ほんとうに"),...X.chunks]};
      const thing=!/^(he|she|they)$/i.test(m[1])&&!/^[A-Z]/.test(m[1].replace(/^(the|my) /i,""))&&!/(friends?|mom|dad|mother|father|sisters?|brothers?|wife|husband|boss|teachers?|sons?|daughters?|kids?|child|children|boyfriend|girlfriend|parents?|neighbou?rs?|grand\w*|uncle|aunt|cousins?|man|woman|guy|baby|family|coworkers?|classmates?|doctor|students?)$/i.test(m[1])&&!A0.used.some(u=>/(^|,)(an|ani)(,|$)/.test(u.pos||""));
      if(thing)return fx([...dropMy(A0.chunks),C("に"),WA,...X.chunks,GA,C("あります")],[...A0.used,...X.used]);
      const n=X.used[X.used.length-1]||{},an=/(^|,)an(,|$)/.test(n.pos||""),ph=/(^|,)ph(,|$)/.test(n.pos||"");
      const v=ph&&!an?byJP("持つ","v"):null,e=v&&vend(v,"teiru");
      return fx([...A0.chunks,WA,...X.chunks,...(e?[O,...e]:[GA,C(an?"います":"あります")])],[...A0.used,...X.used,...(v?[v]:[])])}],
    // "I'm trying to lose weight" -> 痩せようとしています
    [/^(i|we|he|she|they|my [a-z]+|the [a-z]+) (?:am|is|are|was|were|have been|has been) trying to (.+)$/i,m=>{const pst=/ (was|were|have been|has been) trying/i.test(m[0]);const vp=VP(m[2]);if(!vp||vp.ing||vp.past)return null;const vo=volit(vp.v);if(!vo)return null;
      const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[WA]:[]),...dropMy(vp.pre),C(vo[0],vo[1]),C("と"),C("して"),C(pst&&!/ (have|has) been trying/i.test(m[0])?"いました":"います")],[...A0.used,...vp.used],["… ようとしています = trying to …"])}],
    // "the robot is learning to dance" -> ロボットは踊ることを学んでいます
    [/^(i|we|he|she|they|my [a-z]+|the [a-z]+) (?:am|is|are) learning (?:how )?to (.+)$/i,m=>{const vp=VP(m[2]);if(!vp||vp.ing||vp.past)return null;const d=vplain(vp.v,"dict");if(!d)return null;
      const me=/^(i|we)$/i.test(m[1]),A0=me?{chunks:[],used:[]}:who(m[1]);if(!A0)return null;
      return fx([...A0.chunks,...(A0.chunks.length?[WA]:[]),...dropMy(vp.pre),...d,C("練習","れんしゅう"),O,C("して"),C("います")],[...A0.used,...vp.used])}],
    [/^(this|that|it) is (?:so )?cursed$/i,m=>fx([m[1].toLowerCase()==="this"?C("これ"):C("それ"),WA,C("呪われて","のろわれて"),C("います")])],
    [/^can i (?:have|get) your (?:phone )?number$/i,()=>fx([C("電話番号","でんわばんごう"),O,C("教えて","おしえて"),C("もらえます"),KA])],
    [/^(.+?) (?:yelled|shouted|screamed) at me$/i,m=>{const w=who(m[1]);return w?fx([...w.chunks,C("に"),C("怒鳴られました","どなられました")],w.used):null}],
    [/^(?:i|we) had (?:a |such a )?(?:really |very |so )?(?:great|good|wonderful|fun|amazing|nice|fantastic|lovely) time$/i,()=>fx([C("とても"),C("楽しかった","たのしかった"),DESU])],
    [/^it (?:does not|will not|did not|is not going to) (rain|snow)(?: (later|tomorrow|today|tonight|soon|this afternoon|this evening|this weekend|yesterday|last night))?$/i,m=>{const f=byJP("降る:ふる","v"),e=f&&vend(f,/did not/i.test(m[0])?"masendeshita":"masen");
      const tw=m[2]&&(byJP(TIME[m[2].toLowerCase()]||"","any")||TFB[m[2].toLowerCase()]);if(m[2]&&!tw)return null;
      return e?fx([...(tw?timeCh(m[2].toLowerCase(),tw):[]),/snow/i.test(m[1])?C("雪","ゆき"):C("雨","あめ"),GA,...e],[f]):null}],
    [/^it (rains|is going to rain|will rain|rained|snows|is going to snow|will snow|snowed)(?: (later|tomorrow|today|tonight|soon|this afternoon|this evening|this weekend|yesterday|last night))?$/i,m=>{const f=byJP("降る:ふる","v"),e=f&&vend(f,/ed$/i.test(m[1])?"mashita":"masu");
      const tw=m[2]&&(byJP(TIME[m[2].toLowerCase()]||"","any")||TFB[m[2].toLowerCase()]);if(m[2]&&!tw)return null;
      return e?fx([...(tw?timeCh(m[2].toLowerCase(),tw):[]),/snow/i.test(m[1])?C("雪","ゆき"):C("雨","あめ"),GA,...e],[f]):null}],
    // "it is really cold outside" -> 外はとても寒いです
    [/^it (is|was) (.+) (outside|inside|in here|out here)$/i,m=>{const P=pred(m[2],{omit:"it",chunks:[],used:[],thing:false},false,m[1].toLowerCase()==="was");if(!P)return null;
      return fx([/inside|in here/i.test(m[3])?C("中","なか"):C("外","そと"),WA,...P.chunks],P.used,P.notes)}],
    // "one beer please" -> ビールを一杯お願いします
    [/^(\w+) (.+)$/i,m=>{if(!please)return null;const n=numOf(m[1])||(/^an?$/i.test(m[1])?1:null);if(!n)return null;const np=NP(m[2]);if(!np||np.pron||np.chunks.some(c=>c[1]==null))return null;
      const cup=/^(ビール|水|お水|お茶|コーヒー|紅茶|日本酒|ワイン|ジュース|お酒|酒|牛乳|ミルク|コーラ|ご飯|味噌汁|ハイボール|カクテル|ラーメン|うどん|そば)$/.test(np.used[np.used.length-1].jp);
      const HAI=["いっぱい","にはい","さんばい","よんはい","ごはい","ろっぱい","ななはい","はっぱい","きゅうはい","じゅっぱい"];
      const c=cup&&n<=10?[C(KJ[n]+"杯",HAI[n-1])]:counted(n,np);if(!c)return null;return fx([...np.chunks,O,...c,C("お願いします","おねがいします")],np.used)}],
    // "I like pineapple on pizza" -> ピザにパイナップルをのせるのが好きです
    [/^(?:i|we) (like|love|hate) (.+?) on (?:my |the |a |an )?(.+)$/i,m=>{const a=NP(m[2]),b=NP(m[3]);if(!a||!b||a.pron||b.pron||!/(^|,)fd(,|$)/.test((b.used[b.used.length-1]||{}).pos||""))return null;
      const k=m[1].toLowerCase();return fx([...b.chunks,C("に"),...a.chunks,O,C("のせる"),C("の"),GA,k==="hate"?C("大嫌い","だいきらい"):k==="love"?C("大好き","だいすき"):C("好き","すき"),DESU],[...a.used,...b.used])}],
    // "I need more towels" -> タオルがもっと必要です
    [/^(?:i|we) need (?:some )?more (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,GA,C("もっと"),C("必要","ひつよう"),DESU],np.used):null}],
    // "my cat thinks he is a dog" -> うちの猫は自分が犬だと思っています
    [/^(.+?) thinks? (?:he|she|it|they) (?:is|are) (?:an? )?(.+)$/i,m=>{const w=who(m[1]);if(!w||/^i$/i.test(m[1]))return null;const np=NP(m[2]),a=!np&&word(m[2],"adj",{an:true});
      const body=np&&!np.pron?[...np.chunks,C("だ")]:a&&/adj-i/.test(a.pos)?[C(a.jp,a.kana)]:a?[C(a.jp,a.kana),C("だ")]:null;if(!body)return null;
      return fx([...w.chunks.map(c=>c),WA,C("自分","じぶん"),GA,...body,C("と"),C("思って","おもって"),C("います")],[...w.used,...(np?np.used:[a])],["自分 = “himself / herself”."])}],
    // "I've been to Tokyo twice" -> 東京に二回行ったことがあります
    [/^(?:i|we) have (never )?been to (.+?)(?: (once|twice|\w+ times))?$/i,m=>{const np=NP(m[2]);if(!np||np.pron)return null;const t=m[3]?timesCh(m[3]):null;if(m[3]&&!t)return null;
      return fx([...np.chunks,C("に"),...(t?[t]:[]),C("行った","いった"),C("こと"),GA,C(m[1]?"ありません":"あります")],np.used,["… たことがあります = I have (done) … before."])}],
    [/^have you (?:ever )?been to (.+)$/i,m=>{const np=NP(m[1]);return np&&!np.pron?fx([...np.chunks,C("に"),C("行った","いった"),C("こと"),GA,C("あります"),KA],np.used):null}],
    [/^(?:i|we) have never (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.ing)return null;const e=vplain(vp.v,"ta");return e?fx([...dropMy(vp.pre),...e,C("こと"),GA,C("ありません")],vp.used,["… たことがありません = I have never (done) …"]):null}],
    [/^have you ever (.+)$/i,m=>{const vp=VP(m[1]);if(!vp||vp.ing)return null;const e=vplain(vp.v,"ta");return e?fx([...vp.pre,...e,C("こと"),GA,C("あります"),KA],vp.used,["… たことがありますか = have you ever (done) …?"]):null}],
    // "I don't know what to eat" -> 何を食べたらいいか分かりません
    [/^(?:i|we) do not know (what|where|how|when) to (.+)$/i,m=>{const ml=/^(.+) for (breakfast|lunch|dinner)$/i.exec(m[2]),meal=ml&&findNoun(ml[2]);if(ml&&!meal)return null;const vp=VP(ml?ml[1]:m[2]);if(!vp||vp.ing||vp.past||vp.pre.some(c=>c[0]==="を"))return null;const st=vstems(vp.v);if(!st||!st.te)return null;
      const ta=C(st.te[0].replace(/て$/,"た").replace(/で$/,"だ")+"ら",st.te[1].replace(/て$/,"た").replace(/で$/,"だ")+"ら"),w=m[1].toLowerCase(),mv=/^(行く|来る|帰る)$/.test(vp.v.jp);
      const q=w==="what"?[C("何","なに"),O]:w==="where"?[C("どこ"),C(mv?"に":"で")]:w==="how"?[C("どうやって")]:[C("いつ")];
      const tm=vp.pre.filter(c=>c[0]!=="を"),FOR=/ for (breakfast|lunch|dinner)$/i.exec(m[2]);
      return fx([...(meal?[C(meal.jp,meal.kana),C("に")]:[]),...tm,...q,ta,C("いい"),C("か"),C("分かりません","わかりません")],[...(meal?[meal]:[]),...vp.used],["… たらいいか分かりません = I don't know what I should …"])}],
  ];
  for(const[re,fn]of PH){if((m=re.exec(l))){const r=fn(m);if(r)return r}}
  // the basic shop and request shapes, so they also work inside longer sentences ("my phone is dying. do you have a charger")
  {const out0=(a,b)=>{const r=out0_(a,b);if(r)r.fixed=true;return r};const bad=/\b(idea|clue|minute|second|moment|cold|flu|fever|headache|stomachache|problem|problems|plans?|it|this|that|them|one|ones|me|you|him|her|us|anything else|something else)$/i;
   {const im=/^(?:do|does) (you|he|she|your [a-z]+) have (?:a |an )?(cold|fever|headache|stomachache|stomach ache|toothache|sore throat|cough|the flu|flu|allergies|hay fever)$/i.exec(l);if(im){const W=im[1].toLowerCase(),wh=W==="you"?[]:W==="he"?[C("彼","かれ"),C("は")]:W==="she"?[C("彼女","かのじょ"),C("は")]:null;let wp=wh;if(!wp){const np=NP(im[1].replace(/^your /i,""));if(!np||np.pron)return null;wp=[...np.chunks,C("は")]}
     const k=im[2].toLowerCase(),E={cold:[["風邪","かぜ"],["を"],["ひいていますか"]],fever:[["熱","ねつ"],["が"],["ありますか"]],headache:[["頭","あたま"],["が"],["痛いですか","いたいですか"]],stomachache:[["お腹","おなか"],["が"],["痛いですか","いたいですか"]],"stomach ache":[["お腹","おなか"],["が"],["痛いですか","いたいですか"]],toothache:[["歯","は"],["が"],["痛いですか","いたいですか"]],"sore throat":[["喉","のど"],["が"],["痛いですか","いたいですか"]],cough:[["咳","せき"],["が"],["出ますか","でますか"]],"the flu":[["インフルエンザ"],["に"],["かかっていますか"]],flu:[["インフルエンザ"],["に"],["かかっていますか"]],allergies:[["アレルギー"],["が"],["ありますか"]],"hay fever":[["花粉症","かふんしょう"],["です"],["か"]]}[k];
     return out0([...wp,...E.map(x=>C(x[0],x[1]||x[0]))],[])}}
   {const im2=/^(?:is|are) there (?:any |some )?([a-z]+(?: [a-z]+)?) in (this|it|that|these|here|the [a-z]+)$/i.exec(l);if(im2&&!/^(a|an|anyone|anybody|someone|somebody)$/i.test(im2[1])){const np=NP(im2[1]);const W=im2[2].toLowerCase();const wp=W==="here"?null:/^(this|it|these)$/.test(W)?[C("これ")]:W==="that"?[C("それ")]:(()=>{const n2=NP(W.replace(/^the /,""));return n2&&!n2.pron?n2.chunks:null})();
     if(np&&!np.pron&&(W==="here"||wp)&&np.used.every(u=>!/(^|,)an(,|$)/.test(u.pos||"")))return out0([...(wp?[...wp,C("に")]:[]),...np.chunks,C("は"),C("入っていますか","はいっていますか")],np.used)}}
   const hm=/^(?:do|does) (you|they|this (?:store|shop|place|hotel|restaurant)|the (?:store|shop|hotel|restaurant)) (have|sell|carry) (?:an? |any |some |the )?(.+?)(?: here)?$/i.exec(l);
   if(hm&&!bad.test(hm[3])&&!/ (for|in|to|on|with|that|which|about|at|from|of)\b/i.test(hm[3])&&hm[3].split(" ").length<=3){
     const AN={kids:["お子さん","おこさん"],children:["お子さん","おこさん"],kid:["お子さん","おこさん"],child:["お子さん","おこさん"],boyfriend:["彼氏","かれし"],girlfriend:["彼女","かのじょ"],siblings:["兄弟","きょうだい"],"brothers or sisters":["兄弟","きょうだい"],pets:["ペット"],pet:["ペット"],dog:["犬","いぬ"],dogs:["犬","いぬ"],cat:["猫","ねこ"],cats:["猫","ねこ"]}[hm[3].toLowerCase()];
     if(AN&&/^you$/i.test(hm[1])&&/^have$/i.test(hm[2]))return out0([C(AN[0],AN[1]||AN[0]),C("は"),C("いますか")],[]);
     if(!AN){const np=NP(hm[3]);if(np&&!np.pron&&np.chunks.every(c=>c[1]!=null||/^[ァ-ヿ]+$/.test(c[0]))){const sell=/^(sell|carry)$/i.test(hm[2]);return out0([...np.chunks,C("は"),C(sell?"売っていますか":"ありますか",sell?"うっていますか":"ありますか")],np.used)}}}
   const wm=/^(?:i|we) (want|wanna|would like|'d like|need) (?:an? |some more |some |the |another |more )?(.+?)$/i.exec(l)||/^(?:can|could|may) (?:i|we) (have|get) (?:an? |some more |some |the |another |more )?(.+?)$/i.exec(l)||/^(please)?(?:an? |the )?([a-z]+(?: [a-z]+)? without (?:any |the )?[a-z]+(?: [a-z]+)?)$/i.exec(l);
   if(wm){const TSU=["","一つ|ひとつ","二つ|ふたつ","三つ|みっつ","四つ|よっつ","五つ|いつつ","六つ|むっつ","七つ|ななつ","八つ|やっつ","九つ|ここのつ"];
     const ask=(ch,used,cnt,more)=>out0(/^(want|wanna)$/i.test(wm[1]||"")?[...more,...ch,C("が"),...cnt,C("ほしいです")]:[...ch,C("を"),...more,...cnt,C("お願いします","おねがいします")],used);
     const one=t=>{const wo=/^([a-z]+(?: [a-z]+)?) without (?:any |the )?([a-z]+(?: [a-z]+)?)$/i.exec(t);if(wo){const a=NP(wo[1]),b=NP(wo[2]);if(!a||!b||a.pron||b.pron)return null;return{chunks:[...b.chunks,C("抜き","ぬき"),C("の"),...a.chunks],used:[...a.used,...b.used]}}
       const nm=/^(two|three|four|five|six|seven|eight|nine|2|3|4|5|6|7|8|9) ([a-z]+(?: [a-z]+)?)$/i.exec(t);if(nm){const n=enNum(nm[1]);const np=NP(nm[2].replace(/(?<=[^s])s$/,"").replace(/ies$/,"y"))||NP(nm[2]);if(!np||np.pron||!(n>=2&&n<=9))return null;const T2=TSU[n].split("|");return{chunks:np.chunks,used:np.used,cnt:[C(T2[0],T2[1])]}}
       const np=NP(t);if(!np||np.pron)return null;return{chunks:np.chunks,used:np.used}};
     if(/ and /i.test(wm[2])&&wm[2].split(" ").length<=7&&!/ (for|in|to|on|with|that|which|about|at|from|of)\b/i.test(wm[2])){const ps=wm[2].split(/ and (?:an? |some |the )?/i);if(ps.length===2){const A=one(ps[0]),B=one(ps[1]);if(A&&B&&!A.cnt&&!B.cnt)return ask([...A.chunks,C("と"),...B.chunks],[...A.used,...B.used],[],[])}}
     if(/ without /i.test(wm[2])||/^(two|three|four|five|six|seven|eight|nine|[2-9]) /i.test(wm[2])){const A=one(wm[2]);if(A)return ask(A.chunks,A.used,A.cnt||[],[])}}
   if(wm&&wm[1]&&!/^please$/i.test(wm[1])&&!bad.test(wm[2])&&!/^to\b/i.test(wm[2])&&!/ (for|in|to|on|with|that|which|about|at|from|of)\b/i.test(wm[2])&&wm[2].split(" ").length<=3&&!/^need$/i.test(wm[1])){
     const np=NP(wm[2]);if(np&&!np.pron&&np.chunks.every(c=>c[1]!=null||/^[ァ-ヿ]+$/.test(c[0]))&&!np.used.some(u=>/(^|,)an(,|$)/.test(u.pos||"")&&!/^(boyfriend|girlfriend|dog|cat|pet|puppy|kitten)$/i.test(wm[2]))){
       const more=/\bmore\b/i.test(l)?[C("もう少し","もうすこし")]:/\banother\b/i.test(l)?[C("もう一つ","もうひとつ")]:[];
       if(/^(want|wanna)$/i.test(wm[1]))return out0([...more,...np.chunks,C("が"),C("ほしいです")],np.used);
       return out0([...np.chunks,C("を"),...more,C("お願いします","おねがいします")],np.used)}}}
  // --- "my head hurts" ---
  if((m=/^(?:my |the )?(.+?) (?:hurts?|is hurting|aches?|is sore)$/i.exec(l))&&!/^(it|this|that|here)$/i.test(m[1])){
    const n=findNoun(m[1]),a=byJP("痛い","adj");
    if(n&&a)return out0([C(n.jp,n.kana),GA,C(a.jp,a.kana),C("です")],[n,a]);
  }
  if((m=/^(.+?) (?:is|are) (?:broken|not working)$/i.exec(l))||(m=/^(.+?) (?:does|do|will) not work$/i.exec(l))){
    const np=NP(s.slice(0,m[1].length)),v=byJP("壊れる","v"),e=v&&vend(v,"teiru");
    return np&&e&&!/^(i|he|she|we)$/.test(np.pron||"")?out0([...dropMy(np.chunks),GA,...e],[...np.used,v]):null;
  }
  // --- requests with a fixed shape ---
  if((m=/^stop ([a-z]+ing\b.*)$/i.exec(l))){   // "stop crying" -> 泣かないでください
    const vp=VP(s.slice(s.length-m[1].length));if(!vp||!vp.ing||vp.me)return null;
    const e=vend(vp.v,"naide");return e&&out0([...vp.pre,...e],vp.used);
  }
  if((m=/^be (quiet|nice|kind|gentle|careful)$/i.exec(l))){   // "be quiet" -> 静かにしてください
    const k=m[1].toLowerCase();
    if(k==="careful")return out0([C("気をつけて","きをつけて"),C("ください")],[]);
    const a=byJP(k==="quiet"?"静か":"優しい","adj");if(!a)return null;
    const st=k==="quiet"?[a.jp+"に",a.kana+"に"]:[a.jp.slice(0,-1)+"く",a.kana.slice(0,-1)+"く"];
    return out0([C(st[0],st[1]),C("して"),C("ください")],[a]);
  }
  if(please&&(m=/^no (.+)$/i.exec(l))){   // "no ice please" -> 氷なしでお願いします
    const np=NP(s.slice(s.length-m[1].length));if(!np||np.pron||np.chunks.some(c=>c[1]==null))return null;
    return out0([...np.chunks,C("なしで"),C("お願いします","おねがいします")],np.used);
  }
  if((m=/^(?:one more|another) (.+)$/i.exec(l))){   // "one more beer please" -> ビールをもう一杯お願いします
    const np=NP(s.slice(s.length-m[1].length));if(!np||np.pron||np.chunks.some(c=>c[1]==null))return null;
    const n=np.used[np.used.length-1],cup=/^(ビール|水|お水|お茶|コーヒー|紅茶|日本酒|ワイン|ジュース|お酒|酒|牛乳|ミルク|コーラ|ご飯|味噌汁|ハイボール|カクテル)$/.test(n.jp);
    return out0([...np.chunks,O,cup?C("もう一杯","もういっぱい"):C("もう一つ","もうひとつ"),C("お願いします","おねがいします")],np.used,[cup?"もう一杯 = one more glass / cup / bowl.":"もう一つ = one more (of a thing)."]);
  }
  if(/^what time is it(?: now)?$/i.test(l))return out0([C("今","いま"),C("何時","なんじ"),C("です"),KA],[]);
  // --- "this smells bad", "this tastes weird" ---
  if((m=/^(.+?) (smells?|tastes?) (good|nice|great|amazing|delicious|bad|terrible|awful|weird|strange|funny)$/i.exec(l))){
    const S=subj(m[1]);if(!S||S.omit&&S.omit!=="it")return null;
    const sm=/^smell/i.test(m[2]),q=m[3].toLowerCase(),good=/^(good|nice|great|amazing|delicious)$/.test(q),bad=/^(bad|terrible|awful)$/.test(q);
    const n=byJP(sm?"匂い":"味","n");if(!n)return null;
    let ch,u;
    if(good&&sm)ch=[C("いい"),C(n.jp,n.kana),GA,C("します")],u=[n];
    else if(good){const a=byJP("おいしい|美味しい","adj");if(!a)return null;ch=[C(a.jp,a.kana),C("です")];u=[a]}
    else if(bad){const a=byJP(sm?"臭い:くさい":"まずい|不味い","adj");if(!a)return null;ch=[C(a.jp,a.kana),C("です")];u=[a]}
    else{const a=byJP("変","adj");if(!a)return null;ch=[C(a.jp+"な",a.kana+"な"),C(n.jp,n.kana),GA,C("します")];u=[a,n]}
    return out0([...S.chunks,...ch,...(isQ?[KA]:[])],[...S.used,...u],[],true);
  }
  // --- questions: "is this wall scary?" ---
  if((m=/^(is|are|was|were) (not )?(.+)$/i.exec(l))&&!/^there /i.test(m[3])&&!/^is it (ok|okay|alright|all right|fine) (to|if i) /i.test(l)){
    const past=/^w/i.test(m[1]),ws=m[3].split(" ");
    for(let i=1;i<ws.length;i++){
      const S=subj(ws.slice(0,i).join(" "));if(!S)continue;
      const P=pred(ws.slice(i).join(" "),S,!!m[2],past);if(!P)continue;
      return out0([...(P.agent?[...S.chunks.slice(0,-1),C("に")]:S.chunks),...P.chunks,KA],[...S.used,...P.used],P.notes||[],true);
    }
    return null;
  }
  // --- "this wall is scary", "it was not expensive", "that looks delicious" ---
  if((m=/^(.+?) (is|are|am|was|were|looks?|seems?)( not)? (.+)$/i.exec(l))&&!/^(what|where|who|when|why|how|which|there|here)\b/i.test(m[1])){
    const S=subj(m[1]);
    if(S){
      const looks=/^(look|seem)/i.test(m[2]),P=pred(m[4],S,!!m[3],/^w/i.test(m[2]),looks?"looks":null);
      if(P&&!S.an)S.chunks=dropMy(S.chunks);   // "my room is messy" -> 部屋が…: Japanese leaves out "my" for your own things
      const keepI=!!P&&(!!P.desc||S.omit==="you"&&!!P.np)&&(S.omit==="i"||S.omit==="we"||S.omit==="you"&&!isQ),me=S.omit==="we"?["私たち","わたしたち","we"]:S.omit==="you"?["あなた","あなた","you"]:["私","わたし","I"];
      const sc=!P?null:keepI?[C(me[0],me[1]),WA]:P.agent?[...S.chunks.slice(0,-1),C("に")]:P.ga&&!isQ&&!S.omit&&!S.pron&&S.chunks.length&&!T.length?[...S.chunks.slice(0,-1),GA]:S.chunks;
      if(P&&P.sup&&sc.length&&sc[sc.length-1][0]==="は")sc.splice(-1,1,GA);
      if(P)return out0([...sc,...P.chunks,...(isQ?[KA]:[])],[...S.used,...P.used],[...(keepI?[`${me[0]}は (${romaji(me[1])} wa) = “${me[2]}”. Japanese often leaves out “${me[2]}”, but not here: without it, it would sound like you are talking about something else.`]:
        S.omit&&S.omit!=="it"?[`Japanese normally leaves out “${S.omit==="we"?"we":S.omit==="you"?"you":"I"}” when it is clear who you mean.`]:[]),...(P.notes||[])],!keepI);
    }
    if(!/^(i|we|you) (am|are) [a-z]+ing\b/i.test(l)&&!/^[a-z]+ing\b/i.test(m[4]))return null;
  }
  // who does a question: I / you / we are left out, he / she / they are 彼 / 彼女 / 彼ら
  const whoS=str=>{const t=str.trim().toLowerCase();
    if(/^(i|we|you)$/.test(t))return{chunks:[],used:[],thing:false};
    if(/^(he|she|they)$/.test(t))return{chunks:[t==="he"?C("彼","かれ"):t==="she"?C("彼女","かのじょ"):C("彼ら","かれら"),WA],used:[],thing:false};
    const np=t==="it"?null:NP(str.trim());if(!np||np.pron)return null;
    return{chunks:[...np.chunks,WA],used:np.used,thing:true}};
  // --- "why did the chicken cross the road?" -> どうして鶏は道を渡ったんですか ---
  if((m=/^why (do|does|did|are|is|am) (.+)$/i.exec(l))){
    const aux=m[1].toLowerCase(),ws=s.slice(s.length-m[2].length).split(" ");
    for(let i=1;i<ws.length;i++){
      const S=whoS(ws.slice(0,i).join(" "));if(!S)continue;
      const rest=ws.slice(i).join(" "),ing=/^[a-z]+ing\b/i.test(rest);
      if(/^(are|is|am)$/.test(aux)!==ing)continue;
      const vp=VP(rest);if(!vp||vp.ing!==ing||vp.past||vp.me&&vp.v.kana!=="ついてくる")continue;
      if(S.thing&&!vp.pre.some(ch=>ch[0]==="を"))viSwap(vp);
      const e=vplain(vp.v,aux==="did"?"ta":ing&&!/^(行く|来る|帰る|戻る)$/.test(vp.v.jp)?"teiru":"dict");if(!e)continue;
      return out0([C("どうして"),...S.chunks,...vp.pre,...e,C("ん"),C("です"),KA],[...S.used,...vp.used],["… んですか is the natural way to ask for a reason."]);
    }
    return null;
  }
  // --- "when does the shop open?" -> 店は何時に開きますか ---
  if((m=/^(when|what time) (do|does|did|will) (.+)$/i.exec(l))){
    const aux=m[2].toLowerCase(),wt=/^what/i.test(m[1]),ws=s.slice(s.length-m[3].length).split(" ");
    for(let i=1;i<ws.length;i++){
      const S=whoS(ws.slice(0,i).join(" "));if(!S)continue;
      const vp=VP(ws.slice(i).join(" "));if(!vp||vp.ing||vp.past||vp.me)continue;
      if(S.thing&&!vp.pre.some(ch=>ch[0]==="を"))viSwap(vp);
      const clock=wt||/^(開く|閉まる|始まる|終わる|出る|着く|出発|到着|起きる|寝る)$/.test(vp.v.jp);
      const e=vend(vp.v,aux==="did"?"mashitaka":"masuka");if(!e)continue;
      return out0([...S.chunks,clock?C("何時に","なんじに"):C("いつ"),...vp.pre,...e],[...S.used,...vp.used]);
    }
    return null;
  }
  // --- "where are you going?" -> どこに行きますか, "where do you live?" -> どこに住んでいますか ---
  if((m=/^where (do|does|did|are|is) (you|he|she|they) (.+)$/i.exec(l))){
    const aux=m[1].toLowerCase(),S=whoS(m[2]),rest=s.slice(s.length-m[3].length),ing=/^[a-z]+ing\b/i.test(rest);
    if(/^(are|is)$/.test(aux)!==ing)return null;
    const vp=VP(rest);if(!vp||vp.ing!==ing||vp.past||vp.me||vp.pre.some(ch=>ch[0]==="に"||ch[0]==="で"))return null;
    const mv=/^(行く|来る|帰る|戻る)$/.test(vp.v.jp),live=/^(住む|泊まる)$/.test(vp.v.jp);
    const e=aux==="did"?vend(vp.v,"mashitaka"):mv?vend(vp.v,"masuka"):live||ing||/^(働く|勉強)$/.test(vp.v.jp)?(vend(vp.v,"teiru")||[null]).concat([KA]):vend(vp.v,"masuka");
    return e&&e.every(Boolean)?out0([...S.chunks,C("どこ"),C(mv||live?"に":"で"),...vp.pre,...e],vp.used):null;
  }
  // --- "who is that?" -> あの人は誰ですか ---
  if((m=/^who (is|are|was) (.+)$/i.exec(l))){
    const x=m[2].toLowerCase(),past=m[1].toLowerCase()==="was";
    const head=/^(that|that person)$/.test(x)?[C("あの"),C("人","ひと")]:/^(this|this person)$/.test(x)?[C("この"),C("人","ひと")]:x==="he"?[C("彼","かれ")]:x==="she"?[C("彼女","かのじょ")]:null;
    const np=head?null:NP(s.slice(s.length-m[2].length));
    if(!head&&(!np||np.pron))return null;
    return out0([...(head||np.chunks),WA,C("誰","だれ"),past?C("でした"):C("です"),KA],head?[]:np.used);
  }
  // --- "what is the password?" -> パスワードは何ですか ---
  if((m=/^what (?:is|are) (.+)$/i.exec(l))&&!/^(this|that|it|these|those|this one|that one|your|his|her|their|our)\b/i.test(m[1])&&!/\b[a-z]+ing\b/i.test(m[1])){
    const np=NP(s.slice(s.length-m[1].length));
    if(np&&!np.pron)return out0([...np.chunks,WA,C("何","なん"),C("です"),KA],np.used);
  }
  // --- "I want to be rich" -> お金持ちになりたいです ---
  if((m=/^(?:i|we) (want|wanna|would like|wanted) to (?:be|become) (?:an? |the )?(.+)$/i.exec(l))){const wasW=/^wanted$/i.test(m[1]);m=[m[0],m[2]];
    const t=s.slice(s.length-m[1].length),a=word(t,"adj",{thing:null});let ch=null,u=[];
    if(a&&!/^(好き|嫌い|大好き|欲しい|必要)/.test(a.jp)){
      if(/adj-ix/.test(a.pos)&&a.jp.endsWith("いい"))ch=[C(a.jp.slice(0,-2)+"よく",a.kana.slice(0,-2)+"よく")];
      else if(/adj-i/.test(a.pos)&&a.jp.endsWith("い"))ch=[C(a.jp.slice(0,-1)+"く",a.kana.slice(0,-1)+"く")];
      else if(/adj-na/.test(a.pos))ch=[C(a.jp+"に",a.kana+"に")];u=[a]}
    else{const np=NP(t);if(np&&!np.pron){ch=[...np.chunks,C("に")];u=np.used}}
    return ch?out0([...ch,C(wasW?"なりたかった":"なりたい"),C("です")],u):null;
  }
  // --- "I have a crush on her" -> 彼女のことが好きです ---
  if((m=/^(?:i|we) have a crush on (.+)$/i.exec(l))){
    const w=m[1].toLowerCase(),np=w==="him"?{chunks:[C("彼","かれ")],used:[]}:w==="her"?{chunks:[C("彼女","かのじょ")],used:[]}:NP(s.slice(s.length-m[1].length)),a=byJP("好き","adj");
    if(np&&a&&!np.pron)return out0([...np.chunks,C("の"),C("こと"),GA,C(a.jp,a.kana),C("です")],[...np.used,a],["… のことが好き is how people say they like someone."]);
    return null;
  }
  // --- "she likes cats" -> 彼女は猫が好きです (someone else likes something) ---
  if((m=/^(.+?) (likes|loves|like|love|hates|hate) (.+)$/i.exec(l))&&!/\b(smells?|looks?|sounds?|tastes?|feels?|seems?|is|are|was|were|just)$/i.test(m[1])&&!/^(i|we|you|it|this|that|do|does|did|would|will)$/i.test(m[1])&&!/^(to|it|me|him|her|them|us|you)\b/i.test(m[3])){
    const who=m[1].toLowerCase(),s3=/s$/i.test(m[2]),PN={he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")};
    const many=who==="they"||/s$/.test(who.split(" ").pop())&&!/(ss|us|is)$/.test(who)||/\b(parents|people|children|kids)$/.test(who);
    if(s3!==many){
      const S=PN[who]?{chunks:[PN[who]],used:[]}:NP(s.slice(0,m[1].length));let O2=NP(s.slice(s.length-m[3].length));
      if((!O2||O2.used.some(u=>u.kind==="dictionary"))&&/^[a-z]+ing\b/i.test(m[3])){const vp=VP(m[3]),st=vp&&!vp.past&&vstems(vp.v),d=st&&vplain(vp.v,"dict");   // "my dog loves going for walks" -> 散歩が大好き
        O2=st&&st.suru&&!vp.pre.length?{chunks:[C(vp.v.jp,vp.v.kana)],used:vp.used}:d?{chunks:[...vp.pre,...d,C("の")],used:vp.used}:O2}
      if(S&&O2&&!(S.pron&&!PN[who])&&!O2.pron&&(S.chunks.every(c=>c[1]!=null)||/^[A-Z][a-z]+$/.test(m[1]))){const a=byJP(/^lov/i.test(m[2])?"大好き":/^hat/i.test(m[2])?"大嫌い":"好き","adj");
        if(a)return out0([...S.chunks,WA,...O2.chunks,GA,C(a.jp,a.kana),C("です")],[...S.used,...O2.used,a],[],true)}
    }
  }
  // --- fixed shapes with a thing ---
  const thing=(re,build)=>{const mm=re.exec(l);if(!mm)return undefined;let np=NP(s.slice(s.length-mm[1].length));if(np&&/^[a-z]+ing\b/i.test(mm[1])&&np.used.some(u=>u&&u.kind==="dictionary"))return undefined;
    if(np&&re.source.startsWith("^(?:i|we)"))np={...np,chunks:dropMy(np.chunks)};   // "I forgot my umbrella" -> 傘を忘れました
    if(np&&np.chunks.some(c=>c[1]==null)&&!/[A-Z]/.test(mm[1]))return null;
    return np&&!/^(i|he|she|we)$/.test(np.pron||"")?build(np):null};
  const fixed=[
    [/^how much (?:is|are|for) (.+)$/i,np=>out0([...np.chunks,WA,C("いくら"),C("です"),KA],np.used)],
    [/^(?:i|we) do not like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out0([...np.chunks,WA,C(a.jp,a.kana),C("じゃない"),C("です")],[...np.used,a])}],
    [/^do you like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out0([...np.chunks,WA,C(a.jp,a.kana),C("です"),KA],[...np.used,a])}],
    [/^(?:i|we) hate (.+)$/i,np=>{const a=byJP("大嫌い","adj")||byJP("嫌い","adj");return a&&out0([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) (?:really like|love) (.+)$/i,np=>{const a=byJP("大好き","adj");return a&&out0([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out0([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) need (.+)$/i,np=>{const a=byJP("必要","adj");return a&&out0([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) (?:have )?lost (.+)$/i,np=>{const n=np.used[np.used.length-1]||{};if(/\bweight$/i.test(l))return null;
      if(/^(試合|ゲーム|勝負|喧嘩|レース|戦い|戦争|選挙|裁判|賭け)$/.test(n.jp)){const v=byJP("負ける","v"),e=v&&vend(v,"mashita");return e&&out0([...np.chunks,C("に"),...e],[...np.used,v])}
      const v=byJP("なくす|無くす","v"),e=v&&vend(v,"mashita");return e&&out0([...np.chunks,O,...e],[...np.used,v])}],
    [/^(?:i|we) (?:have )?(?:forgot|forgotten) (.+)$/i,np=>{const v=byJP("忘れる","v"),e=v&&vend(v,"mashita");return e&&out0([...np.chunks,O,...e],[...np.used,v])}],
    [/^(?:i|we) do not have (?:an? |any )?(.+)$/i,np=>out0([...np.chunks,GA,C(/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")?"いません":"ありません")],np.used)],
    [/^(?:i|we) have (?:an? )?(.+)$/i,np=>{const n=np.used[np.used.length-1]||{};
      if(n.jp==="二日酔い")return out0([...np.chunks,C("です")],np.used);   // "I have a hangover" -> 二日酔いです
      if(/(^|,)an(,|$)/.test(n.pos||""))return out0([...np.chunks,GA,C("います")],np.used);   // people and animals: います
      if(/^(熱|質問|予約|時間|問題|用事|頭痛|腹痛|予定|夢|アイデア|考え|宿題|仕事|授業|会議|お金|自信|経験|趣味|アレルギー|チャンス|時差ぼけ|面接|試験|テスト|約束|デート|休み|風邪|咳|鼻水|糖尿病|喘息|彼女|彼氏)$/.test(n.jp))return out0([...np.chunks,GA,C("あります")],np.used);
      return null}],
    [/^(?:i|we) have (.+)$/i,np=>{const n=np.used[np.used.length-1]||{};if(n.kana!=null&&!/(^|,)ph(,|$)/.test(n.pos||"")&&!np.many)return out0([...np.chunks,GA,C("あります")],np.used);const v=byJP("持つ","v"),e=v&&vend(v,"teiru");return e&&out0([...np.chunks,O,...e],[...np.used,v],["This is “have” for a thing you carry or own. For a reservation, a fever or a question, say … ga arimasu. For people and pets, … ga imasu."])}],
    [/^(.+) (?:is|are) (?:broken|not working)$/i,null],
  ];
  for(const[re,build]of fixed){if(!build)continue;const r=thing(re,build);if(r)return r}
  // --- action words ---
  // --- "what" + action: 何を goes where the thing would be ---
  if((m=/^what (are|is|am|were|was|do|does|did|will) (i|we|you|they|he|she) (.+)$/i.exec(l))){
    const aux=m[1].toLowerCase(),who=m[2].toLowerCase();let rest=s.slice(s.length-m[3].length),want=false;
    if(/^(?:want|wanna|would like) to /i.test(rest)){want=true;rest=rest.replace(/^(?:want|wanna|would like) to /i,"")}
    const isDo=/^do(ing)?\b/i.test(rest),ing=/^[a-z]+ing\b/i.test(rest);
    if(/^(are|is|am|were|was)$/.test(aux)!==ing||want&&ing)return null;
    let vp;
    if(isDo){   // "doing here": する, with an optional place / time after it
      const v=byJP("する","v");if(!v)return null;
      const tail=rest.replace(/^do(ing)?\s*/i,"").toLowerCase(),pre=[];
      if(tail&&!/^(here|there|over there)$/.test(tail))return null;
      if(tail)pre.push(PRON[tail],C("で"));
      vp={v,pre,used:[v],past:false,ing};
    }else{vp=VP(rest);if(!vp||vp.pre.some(ch=>ch[0]==="を"))return null}   // it already has a thing: not a what-question
    const f=want?"tai":ing?(T.length||vp.used.some(u=>TIME[u.en]!==undefined)?"masu":"teiru"):aux==="did"?"mashita":"masu";
    if(/^(were|was)$/.test(aux))return null;
    const e=vend(vp.v,f);if(!e)return null;
    const S=who==="he"?[C("彼","かれ"),WA]:who==="she"?[C("彼女","かのじょ"),WA]:who==="they"?[C("彼ら","かれら"),WA]:[];
    if(isDo&&aux==="do"&&!vp.pre.length)return null;   // "what do you do?" usually means "what is your job": left to the cards
    const note=[];
    return out0([...S,...vp.pre,C("何","なに"),O,...e,KA],vp.used,note);
  }
  const acts=[
    [/^(?:i|we) do not want to (.+)$/i,"takunai"],[/^(?:i|we) (?:want|wanna|would like) to (.+)$/i,"tai"],
    [/^(?:can|could|may) (?:i|we) (?:please )?(.+)$/i,"temoii"],[/^is it (?:ok|okay|alright|all right|fine) (?:to|if i) (.+)$/i,"temoii"],
    [/^(?:do you want to|do you wanna|wanna|would you like to|want to) (.+)$/i,"masenka"],
    [/^can you (.+)$/i,"canyou"],[/^(?:can|could|would|will) you (?:please )?(.+)$/i,"temorau"],
    [/^(?:please )?do not (.+)$/i,"naide"],[/^please (.+)$/i,"tekudasai"],
    [/^(?:lets|let us) (.+)$/i,"mashou"],[/^shall we (.+)$/i,"mashouka"],
    [/^(?:where|what|when) should (?:i|we) (.+)$/i,"should"],[/^(?:i|we) could not (.+)$/i,"potnegpast"],[/^(?:i|we) wanted to (.+)$/i,"taikatta"],
    [/^(?:you|i|we) (?:do not|does not) have to (.+)$/i,"nakutemoii"],[/^(?:you|i) should not (.+)$/i,"naihougaii"],[/^you should (.+)$/i,"hougaii"],[/^i should (.+)$/i,"hougaii0"],[/^we should (.+)$/i,"mashou"],
    [/^where (?:can|do|could|would) (?:i|we) (.+)$/i,"where"],[/^how (?:do|can|should) (?:i|we) (.+)$/i,"how"],
    [/^(?:i|we) can not (.+)$/i,"potneg"],[/^(?:i|we) can (.+)$/i,"pot"],[/^can you (.+)$/i,"potka"],
    [/^(?:i|we) (?:have to|need to|must|gotta|have got to) (.+)$/i,"must"],[/^(?:i|we) (?:had to|needed to) (.+)$/i,"mustpast"],
    [/^(?:i|we) (?:like|love|enjoy) (?:to )?(.+)$/i,"suki"],
    [/^(?:i|we) (?:am|are) going to (.+)$/i,"masu"],[/^(?:i|we) will not (.+)$/i,"masen"],[/^(?:i|we) will (.+)$/i,"masu"],
    [/^(?:i|we) do not (.+)$/i,"masen"],[/^(?:i|we) did not (.+)$/i,"masendeshita"],
    [/^(?:i|we) (?:was|were) ([a-z]+ing\b.*)$/i,"teita"],[/^(?:i|we) have been ([a-z]+ing\b.*)$/i,"teiru"],[/^(?:i|we) have (?:already |finally |just )?((?:lost|gained|finished|done|eaten|seen|read|made|bought|forgotten|broken|changed|decided|found|gotten|got|become|left|arrived|started|grown|learned|learnt|written|met|heard|sent|taken|given|spent|saved|moved|booked|paid|cleaned|watched|visited|tried|stopped|quit|passed|failed|won|fallen|hurt|cut|burned|lost)\b.*)$/i,"perfect"],[/^(?:i|we) (?:am|are) (.+)$/i,"teiru"],[/^(?:do|will) you (.+)$/i,"masuka"],[/^did you (.+)$/i,"mashitaka"],
    [/^(?:i|we) (.+)$/i,"plain"]];
  for(const[re,f0]of acts){
    if(!(m=re.exec(l)))continue;
    let f=f0,vp=VP(s.slice(s.length-m[1].length));
    if(!vp&&/going to/.test(re.source)&&!(PREF.v[m[1].split(" ")[0].toLowerCase()]||window.PICKV&&window.PICKV[m[1].split(" ")[0].toLowerCase()]!=null))vp=VP("go to "+s.slice(s.length-m[1].length));   // "I'm going to Japan": go to
    if(f==="masenka"){   // "do you want to get coffee?" -> コーヒーを飲みに行きませんか
      const gm=/^(?:get|grab|have|go for) (?:some |a |an )?(.+)$/i.exec(m[1]);
      if(gm){const dr=/^(coffee|tea|drinks?|beer|beers|sake|a drink)$/i.test(gm[1]),np=/^drinks?$/i.test(gm[1])?{chunks:[],used:[]}:NP(gm[1]),go=byJP("行く","v"),e=go&&vend(go,"masenka");
        if(np&&e&&!np.pron)return out0([...np.chunks,...(np.chunks.length?[O]:[]),C(dr?"飲み":"食べ",dr?"のみ":"たべ"),C("に"),...e],[...np.used,go],["… に行きませんか = shall we go and …? (a friendly invitation)"])}
    }
    if(!vp)return null;
    if((f==="teiru"||f==="teita")&&!vp.ing)return null;
    if(f==="teita"&&/^(行く|来る|帰る)$/.test(vp.v.jp))return null;   // "I was going to …" is a plan, built elsewhere
    if(f==="teiru"&&/^(行く|来る|帰る|戻る|結婚|引っ越す|卒業|会う|出発|降りる|乗る)$/.test(vp.v.jp))f="masu";
    if(f==="teiru"&&vp.v.jp!=="探す"&&[...T,...vp.pre].some(c=>/^(明日|来週|来月|来年|今夜|今週末|来週末|月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|今度|明日の夜|明日の朝|明日の午後|あさって)$/.test(c[0])))f="masu";
    const keepTeiru=f==="teiru"&&/^(計画|探す|考える|準備|待つ|勉強|貯金)$/.test(vp.v.jp);
    if(f==="plain")f=vp.ing?null:vp.past?"mashita":"masu";
    if(f==="perfect")f=vp.past&&!vp.ing?"mashita":null;
    if(f==="must"&&/^(おしっこ|うんち|おなら)/.test(vp.v.jp))f="tai";
    if(vp.v.jp==="来る"&&/^(pot|potneg|potnegpast|masu|masen|mashita|masendeshita)$/.test(f)&&vp.pre.some(c=>/^(パーティー|結婚式|会議|イベント|集まり|飲み会|誕生日会|お祭り|ライブ|コンサート|お葬式)$/.test(c[0]))){const w=byJP("行く","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}
    if(f==="masu"&&(/^(昨日|先週|今朝)$/.test((T[0]||[])[0])||vp.pre.some(ch=>/^(昨日|先週|今朝)$/.test(ch[0]))||/^quit\b/i.test(m[1])&&!T.length))f="mashita";   // "yesterday", "I quit my job"
    if(f==="mashita"&&/^(住む|働く)$/.test(vp.v.jp))f="teita";   // "I lived in Canada": 住んでいました
    if(f==="masen"&&vp.v.jp==="話す"&&vp.used.some(u=>/語$/.test(u.jp||"")))f="potneg";   // "I don't speak Japanese": 話せません
    if(/^(住む|働く|後悔)$/.test(vp.v.jp)&&(!T.length||T.every(c=>/^(今|は)$/.test(c[0])))&&!vp.used.some(u=>TIME[u.en]!==undefined)){if(f==="masu")f="teiru";else if(f==="masen")f="teinai"}
    if(!f)return null;
    if(vp.ing&&f!=="teiru"&&f!=="teita"&&f!=="suki")return null;
    if(vp.past&&f!=="mashita"&&f!=="teita")return null;
    if(f==="tekudasai"||(please&&f==="masu"))f="tekudasai";
    let pre=vp.pre,e;
    if(re.source.includes("(?:i|we)"))pre=dropMy(pre);   // "I lost my passport" -> パスポートをなくしました
    if(f==="canyou"){
      const ob=vp.used.length>1?vp.used[vp.used.length-1]:null,hasO=pre.some(ch=>ch[0]==="を");
      const abil=!hasO&&/^(泳ぐ|踊る|歌う|料理|運転|飛ぶ|走る|スキー|スケート|自転車|泳ぐ)$/.test(vp.v.jp)||ob&&/語$/.test(ob.jp)&&/^(話す|読む|書く)$/.test(vp.v.jp)||ob&&/^(食べる|飲む)$/.test(vp.v.jp)&&!/^(これ|それ|あれ)$/.test(ob.jp);
      f=abil?"potka":"temorau";
    }
    if(/^pot/.test(f)&&/^(見る|聞く)$/.test(vp.v.jp)&&f!=="potka"){const w=byJP(vp.v.jp==="見る"?"見える":"聞こえる","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w;f={pot:"masu",potneg:"masen",potnegpast:"masendeshita"}[f]||f;const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),GA,...pre.slice(oi+1)]}}
    if(/^pot/.test(f)&&vp.v.jp==="見つける"){const w=byJP("見つかる","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w;f={pot:"masu",potneg:"masen",potka:"masuka"}[f];if(pre.length&&pre[pre.length-1][0]==="を")pre=[...pre.slice(0,-1),GA]}}   // can't find: 見つかりません
    if(f==="should"){   // "where should I get off?" -> どこで降りたらいいですか
      const t=vplain(vp.v,"ta");if(!t)return null;const L=t[t.length-1],w=/^\s*where/i.test(l)?[C("どこ"),C("で")]:/^\s*when/i.test(l)?[C("いつ")]:[C("何","なに")];
      let p2=pre;if(/^\s*what/i.test(l)){if(p2.length&&p2[p2.length-1][0]==="を")p2=p2.slice(0,-2);p2=[...p2,...w,O];return out0([...p2,...t.slice(0,-1),C(L[0]+"ら",L[1]+"ら"),C("いい"),C("ですか")],vp.used)}
      return out0([...pre,...w,...t.slice(0,-1),C(L[0]+"ら",L[1]+"ら"),C("いい"),C("ですか")],vp.used)}
    if(f==="where"||f==="how"){
      // "where can I buy a ticket" -> ticket wa doko de kaemasu ka
      const obj=pre.length&&pre[pre.length-1][0]==="を";
      const lead=obj?[...pre.slice(0,-1),WA]:pre;
      e=vend(vp.v,f==="where"?"potka":"masuka");
      return e&&out0([...lead,f==="where"?C("どこ"):C("どうやって"),...(f==="where"?[C("で")]:[]),...e],vp.used);
    }
    {const oi=pre.map(c=>c[0]).lastIndexOf("を");if(/^pot/.test(f)&&oi>=0)pre=[...pre.slice(0,oi),GA,...pre.slice(oi+1)]}   // "can read X": X ga yomemasu
    e=f==="tekudasai"?order({...vp,pre}):vend(vp.v,f);
    return e&&out0([...pre,...e],vp.used,f==="temorau"?["A polite way to ask someone to do something for you."]:[]);
  }
  // --- talking to someone by name: "Jarvis, open the door" / "Jarvis explode his ballsack" ---
  {const m2=/^([A-Z][A-Za-z'-]*),? (.+)$/.exec(s)||/^([a-z][a-z'-]*), (.+)$/.exec(s);
   if(m2&&isName(m2[1])){
     const rest=m2[2].replace(/^please /i,""),vp=VP(rest);
     if(vp&&!vp.ing&&!vp.past&&!vp.you&&/^[a-z]/.test(rest)){
       const e=order(vp);
       if(e)return out0([[m2[1]+"、",null,m2[1]+","],...vp.pre,...e],[{jp:m2[1],kana:null,en:"a name, said as it is"},...vp.used]);
     }
   }}
  // --- someone or something else does it: "the dinosaur ate my homework", "my dad is cooking" ---
  {const ws=l.split(" "),w0=ws[0].toLowerCase(),PN={he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら"),someone:C("誰か","だれか"),somebody:C("誰か","だれか"),everyone:C("みんな"),everybody:C("みんな")};const WA_=/^(some|every)(one|body)$/.test(w0)?GA:WA;
   // starts with an action word ("drink water", "go to sleep"): an order, not "the drink ..."
   const foodCmd=()=>{const n=findNoun(s),f=n&&n.parts&&findNoun(ws.slice(1).join(" "));return!!f&&/(^|,)fd(,|$)/.test(f.pos||"")};
   if(ws.length>=2&&(PREF.v[w0]||window.PICKV&&window.PICKV[w0]!=null)&&(!isThing(s)||foodCmd()||/^(the|my|your|a|an|some|this|that|his|her|our|their)$/i.test(ws[1]||""))){const vp=VP(s);if(vp&&!vp.ing&&!vp.past&&!vp.you){const e=order(vp);if(e)return out0([...vp.pre,...e],vp.used)}}
   for(let i=Math.min(4,ws.length-1);i>=1;i--){   // longest subject first: "the last train" before "the last"
     const head=ws.slice(0,i).join(" ");
     if(/^(i|we|you|it|this|that|there|here|what|who|where|how|why|when|which|do|does|did|can|could|will|would|please|lets|is|are|was|were)$/i.test(w0))break;
     if(PN[w0]&&i>1)continue;
     if(i>1&&/^(i|we|you|he|she|they)$/i.test(ws[i-1]||""))continue;   // "the book I bought" is a thing, not someone doing something
     let rest=s.slice(head.length).trim(),ing=false,aux=null;
     {const ax=/^(can not|cannot|can|will not|will|does not|do not|did not|never) (.+)$/i.exec(expandEn(rest));if(ax){aux=ax[1].toLowerCase();rest=ax[2]}}
     if(/^(loves|likes|hates|wants|needs|says|thinks|knows|has|does|is|was)$/i.test(ws[i-1]||""))continue;
     if(i===1&&!PN[w0]&&/^[a-z]/.test(head)&&!/s$/.test(head)&&!/^(people|children|kids|men|women|police|everyone|everybody|someone|somebody|fish|sheep|deer)$/i.test(head))continue;   // "turn left", "time flies": not someone doing something
     const am=/^(is|are|was|were) /i.exec(rest);let wasIng=false;if(am){if(!/^[a-z]+ing\b/i.test(rest.slice(am[0].length)))continue;ing=true;wasIng=/^(was|were)/i.test(am[1]);rest=rest.slice(am[0].length)}
     const np=PN[w0]?{chunks:[PN[w0]],used:[],pron:w0}:NP(s.slice(0,head.length));if(!np||np.pron&&!PN[w0])continue;
     if(np.chunks.some(c=>c[1]==null)&&!/^[A-Z0-9]/.test(head.replace(/^(the|a|an|my|your|his|her|our|their) /i,"")))continue;
     // a made-up name subject must be all capitals ("Elon Musk"), so "Bob ate" is not one name
     if(i>1&&np.chunks.some(c=>c[1]==null)&&!head.split(" ").every(x=>/^[A-Z0-9]/.test(x)||/^(the|a|an|my|your|his|her|our|their)$/i.test(x)))continue;
     let vp=VP(rest);if(!vp||vp.ing!==ing)continue;
     if(!aux&&!ing&&!vp.past&&/^(quit|hurt|cut|hit|put|set|shut|let|cost|read)\b/i.test(rest)&&(PN[w0]&&w0!=="they"||!/s$/i.test(head)))vp={...vp,past:true};
     if(!aux&&vp.v.jp==="持つ"&&!PN[w0]&&!/^[A-Z]/.test(head.replace(/^(the|a|an|my|your|his|her|our|their) /i,""))&&!/\b(friends?|mom|dad|mother|father|sisters?|brothers?|wife|husband|boss|teachers?|sons?|daughters?|kids?|child|children|boyfriend|girlfriend|parents?|neighbou?rs?|grand\w*|uncle|aunt|cousins?|people|man|woman|men|women|guy|everyone|everybody|baby|family|coworkers?|classmates?|doctor|students?)$/i.test(head)&&!np.used.some(u=>/(^|,)ani(,|$)/.test(u.pos||""))){
       const oi=vp.pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0){const obj=[...vp.pre.slice(0,oi),...vp.pre.slice(oi+1)];return out0([...dropMy(np.chunks),C("に"),WA_,...obj,GA,C(vp.past?"ありました":"あります")],[...np.used,...vp.used])}}
     if(aux){   // "my goldfish can talk" -> うちの金魚は話せます ; "my husband doesn't speak Japanese" -> 夫は日本語が話せません
       if(vp.past||vp.me&&!/^(電話|連絡|メール|手伝う|助ける|教える|待つ|返信|迎える|誘う|起こす)$/.test(vp.v.jp)||ing)continue;let f={can:"pot",cannot:"potneg","can not":"potneg",will:"masu","will not":"masen","does not":"masen","do not":"masen","did not":"masendeshita",never:"masen"}[aux];if(!f)continue;
       if(f==="masen"&&vp.v.jp==="話す"&&vp.used.some(u=>/語$/.test(u.jp||"")))f="potneg";
       let pre=vp.pre;const oi=pre.map(c=>c[0]).lastIndexOf("を");if(/^pot/.test(f)&&oi>=0)pre=[...pre.slice(0,oi),GA,...pre.slice(oi+1)];
       if(/^(着く|到着)$/.test(vp.v.jp)&&!/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")){const w=byJP("届く","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}
       const e=vend(vp.v,f);if(!e)continue;return out0([...dropMy(np.chunks),f==="masendeshita"&&!PN[w0]?GA:WA_,...pre,...e],[...np.used,...vp.used])}
     {const lj=(np.used[np.used.length-1]||{}).jp||"";
      if(vp.v.jp==="凍る"&&/^(スマホ|パソコン|ノートパソコン|携帯|タブレット|画面|ゲーム|アプリ|コンピューター)$/.test(lj))return out0([...dropMy(np.chunks),GA,C("フリーズ"),C(vp.past?"しました":"しています")],np.used,["A computer that “froze” is フリーズ in Japanese."]);}
     if(!ing&&!vp.past){   // one subject, happening now, needs the -s: "the dog runs" (but "a secret place" is just a thing)
       const v0=(rest.split(" ")[0]||"").toLowerCase(),hl=head.toLowerCase().split(" ").pop();
       const many=w0==="they"||/s$/.test(hl)&&!/(ss|us|is)$/.test(hl)||/^(people|children|kids|men|women|police|mice|feet|teeth)$/.test(hl);
       if(!many&&!/s$/.test(v0)&&!/^(will|would|can|could|should|might|must|may|did|does|do|has|have|had|always|never|usually|often|sometimes|also|really|just|still|already|finally|won'?t|can'?t|didn'?t|doesn'?t|don'?t)$/.test(v0))continue;
     }
     if(vp.v.jp==="死ぬ"&&!/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")){
       if(!vp.past||!/^(スマホ|携帯|電話|携帯電話|パソコン|ノートパソコン|タブレット|カメラ|電池|バッテリー|イヤホン|ヘッドホン)$/.test((np.used[np.used.length-1]||{}).jp))continue;
       return out0([...dropMy(np.chunks),...(/^(電池|バッテリー)$/.test(np.used[np.used.length-1].jp)?[]:[C("の"),C("電池","でんち")]),GA,C("切れました","きれました")],np.used,["A phone that “died” is said as “its battery ran out” (電池が切れました)."])}
     if(!vp.me&&!vp.pre.some(ch=>ch[0]==="を"))viSwap(vp);   // "the door opened" -> ドアが開きました
     // "the dog bit me": Japanese says "I was bitten by the dog" (犬に噛まれました), not 私を
     if(vp.me&&vp.v.kana!=="ついてくる"&&!/^(電話|連絡|メール|手伝う|助ける|教える|待つ|返信|迎える|誘う|起こす)$/.test(vp.v.jp)){
       if(/^(送る|貸す|買う|作る|見せる|教える|持ってくる|書く|あげる|渡す|紹介|案内|返す|描く|焼く|撮る|読む|歌う|選ぶ|探す|直す|修理|貸してくれる)$/.test(vp.v.jp)){const st=vstems(vp.v);if(!st||!st.te)continue;   // kind actions: 送ってくれました, not 送られました
         return out0([...dropMy(np.chunks),GA,...vp.pre.filter((c,x)=>!(/^(私|私たち)$/.test(c[0])&&/^(に|を)$/.test((vp.pre[x+1]||[])[0]||""))&&!(/^(に|を)$/.test(c[0])&&/^(私|私たち)$/.test((vp.pre[x-1]||[])[0]||""))),C(st.te[0],st.te[1]),C(ing?"くれています":vp.past?"くれました":"くれます")],[...np.used,...vp.used])}
       // only real "do it to someone" verbs (JMdict vt), and not する-nouns (電話されました sounds stiff)
       if(!vp.past&&!ing||!/(^|,)vt/.test(vp.v.pos)||/(^|,)vs(,|$)/.test(vp.v.pos)&&!/^(無視|告白|注意|侮辱|攻撃|招待|誘拐|逮捕|邪魔|説得|誘惑|挑発)$/.test(vp.v.jp)||vp.pre.some(ch=>ch[0]==="を"))continue;
       let v=vp.v;
       if(v.kana==="かく")continue;   // a cat "scratching" you is 引っかく, which the dictionary here lacks: not built
       if(v.jp==="噛む"&&/^(蚊|蜂|ハチ|虫)$/.test(np.used[np.used.length-1].jp)){const st=byJP("刺す","v");if(!st)continue;v=st;vp.used[vp.used.indexOf(vp.v)]=st}   // mosquitoes and bees "sting"
       const e=vend(v,ing?"ukemiteiru":"ukemi");if(!e)continue;
       return out0([...np.chunks,C("に"),...vp.pre,...e],[...np.used,...vp.used],["Japanese says this as “I got … by …” rather than using a word for “me”."]);
     }
     if(vp.v.jp==="歌う"&&/(^|,)ani(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")){const w=byJP("鳴く","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}   // birds 鳴く, they don't 歌う
     const hab=!ing&&!vp.past;
     if(/^(着く|到着)$/.test(vp.v.jp)&&!/(^|,)an(,|$)/.test((np.used[np.used.length-1]||{}).pos||"")){const w=byJP("届く","v");if(w){vp.used[vp.used.indexOf(vp.v)]=w;vp.v=w}}   // "the pizza arrived" -> 届きました
     const f=ing?(/^(行く|来る|帰る|戻る|結婚|引っ越す|卒業|会う|出発|降りる|乗る)$/.test(vp.v.jp)?"masu":wasIng?"teita":"teiru"):vp.past?"mashita":/^(住む|働く|知る|持つ|後悔|経営)$/.test(vp.v.jp)?"teiru":"masu";
     const e=vend(vp.v,f);if(!e)continue;
     const sc=[...dropMy(np.chunks),PN[w0]||hab?WA_:GA],r=out0([...sc,...vp.pre,...e],[...np.used,...vp.used]);
     if(r&&hab&&T.length&&r.chunks[0]===T[0]&&r.chunks.length>T.length+sc.length){const tc=r.chunks.splice(0,T.length);r.chunks.splice(sc.length,0,...tc)}   // "my cat sleeps all day" -> うちの猫は一日中寝ます
     return r;
   }}
  // --- "eat this" / "wait here", said as a request ---
  // a plain command ("explode his ballsack", "open the window"): two words or more, so a single
  // word like "run" is shown as a word rather than turned into an order
  if(please||s.split(" ").length>=2&&!isThing(s)){const vp=VP(s);if(vp&&!vp.ing&&!vp.past&&!vp.you){const e=order(vp);if(e)return out0([...vp.pre,...e],vp.used)}}
  if(!isQ&&s.split(" ").length>=2){const np=NP(s);if(np&&!np.pron&&np.chunks.length>=2&&np.chunks.every(c=>c[1]!=null)&&np.used.every(u=>u.kind!=="dictionary"))return out0(np.chunks,np.used)}
  return null;
}
// Nothing fits the whole sentence: leave out the smallest piece that stops it (a word nobody knows,
// a "-ly" word, or a last "against me" / "for …" part), and say what was left out.
function partial(q){
  q=normEn(q);const isQ=/\?\s*["”'’]?\s*$/.test(q.trim());const s=cleanQ(q).replace(/\s+/g," ");const ws=s.split(" ");if(ws.length<3||ws.length>26)return null;
  const NEG=/^(not|no|never|don't|dont|can't|cant|won't|didn't|doesn't|isn't|aren't|wasn't|weren't|nothing|nobody|nowhere|without)$/i;
  const tries=[];
  for(let i=ws.length-1;i>=2;i--)if(!(/^to$/i.test(ws[i])&&/(ing|^want|^need|^have|^has|^going|^try|^like|^love|^hate|^used|^able|^how)$/i.test(ws[i-1])))if(/^(to|at|in|on|with|for|from|about|against|by|into|like|of|as|during|after|before|around|near|behind)$/i.test(ws[i])&&!(/^like$/i.test(ws[i])&&/^(i|we|you|they|do|don't|not|really|would|i'd|also|still|just|dont|never)$/i.test(ws[i-1]))&&ws.length-i<=6&&!ws.slice(i).some(w=>NEG.test(w)||/^[A-Z]/.test(w)||/^(because|since|so|but|and|when|if|while|until|that|than|or|then|after|before)$/i.test(w)&&w!==ws[i])&&!(/^to$/i.test(ws[i])&&(PREF.v[(ws[i+1]||"").toLowerCase()]||window.PICKV&&window.PICKV[(ws[i+1]||"").toLowerCase()]!=null)))tries.push([ws.slice(0,i),ws.slice(i)]);
  for(let i=0;i<ws.length;i++){const w=ws[i].replace(/[^A-Za-z'-]/g,"");if(!w||NEG.test(w)||!/^[a-z]/.test(w))continue;let unk=false;try{unk=isName(w)}catch(e){}
    if(i>0&&/^(is|are|am|was|were|be|been|'m|'s|'re)$/i.test(ws[i-1]))continue;
    if(/^(been|got|get|have|has|had|do|does|did|will|can|could|would|should|must|be|being|going|gonna|wanna)$/i.test(w))continue;   // the word after "is" is what the sentence says: never left out
    if(/(ed|ing)$/i.test(w)&&!/ly$/i.test(w))continue;
    if(/'s$/i.test(ws[i])||/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(st|nd|rd|th)?)$/i.test(w))continue;
    if(unk&&i<=3&&ws.length>3&&!/^(pls|plz|bro|dude|lol|omg|man|yo|bruh|fr)$/i.test(w))continue;
    if(unk&&i<ws.length-1){const nx=ws[i+1].replace(/[^A-Za-z]/g,"");if(nx&&!/^(to|at|in|on|with|for|from|and|but|so|or|is|are|was|were|the|a|an|my|your|it|me|you|him|her|them|us|lol|please|pls|now|today|here|there)$/i.test(nx)){let nn=null;try{nn=findNoun(nx.toLowerCase())}catch(e){}if(nn)continue}}
    if(unk||/ly$/i.test(w)&&w.length>4||/^(literally|totally|completely|absolutely|kinda|lowkey|highkey|actually|basically|honestly|lol|bro|dude|man|like|um|uh)$/i.test(w))tries.push([[...ws.slice(0,i),...ws.slice(i+1)],[ws[i]]])}
  tries.sort((a,b)=>a[1].length-b[1].length);
  for(const[keep,drop]of tries){
    if(drop.length>keep.length||keep.length<2)continue;
    if(drop.some(w=>/^(like|likes|love|loves|hate|hates|want|wants|need|needs|not|never|no|without|except|only|don't|didn't|can't|won't|isn't|aren't|wasn't)$/i.test(w)))continue;
    if(/^like$/i.test(drop[0]||"")&&/\b(sounds?|looks?|smells?|tastes?|feels?|seems?)\b/i.test(keep.join(" ")))continue;
    if(/^(for|about|with|at|to)$/i.test(drop[0]||"")&&/^(bad|happy|sorry|glad|sad|proud|worried|excited|nervous|mad|angry|upset|scared|ready|late|good)$/i.test(keep[keep.length-1]||""))continue;
    if(/^at$/i.test(drop[0]||"")&&/^(better|good|bad|worse|great|terrible)$/i.test(keep[keep.length-1]||""))continue;
    if(/^of$/i.test(drop[0]||"")&&/^(sick|tired|afraid|scared|proud|full|sure|aware|fond|jealous|ashamed|guilty|capable|careful|terrified|frightened|bored|thinking|kind|instead|out|because|made|all|one|some|most|none|each|both|any|lots|lot|front|top|back|middle|end|rest|part)$/i.test(keep[keep.length-1]||""))continue;
    if(keep.length<2||/^(is|are|am|was|were|be|the|a|an|my|your|to|of|and|but|so|i'm|it's|that's|he's|she's|always|never|usually|often|sometimes|still|already|just|really|very|too|also|leaves|leave|starts|start|arrives|arrive|closes|opens|meeting)$/i.test(keep[keep.length-1]))continue;let r=null;try{r=compose(keep.join(" ")+(isQ?"?":""))}catch(e){}
    if(r)return{...r,dropped:drop.join(" "),en:s.charAt(0).toUpperCase()+s.slice(1)+(isQ?"?":"")};
  }
  // a long sentence: build each part on its own (fully where possible), so one hard part does not lose the rest
  if(!(partial.depth>0)){partial.depth=1;try{
    const END=/(です|ます|ました|ません|ませんでした|ますか|ですか|ください|でした|ましょう|ませんか|か|ね|よ)$/;const okE=r=>r&&!r.single&&!r.np&&r.chunks.length>=2&&END.test((r.chunks[r.chunks.length-1]||[""])[0]);
    const one=x=>{let r=null;try{r=compose(x)}catch(e){}if(okE(r))return{r,dropped:[]};let p=null;try{p=partial(x)}catch(e){}return okE(p)?{r:p,dropped:[p.dropped]}:null};
    const raw=q.trim().replace(/[?!.]+$/,"");const W=raw.split(/\s+/);const cands=[];
    for(let i=2;i<=W.length-2;i++){const w=W[i].toLowerCase().replace(/[,.!?]/g,""),pv=W[i-1];
      if(/[,.;!?]$/.test(pv))cands.push([i,null,0]);
      else if(w==="and"&&/^then$/i.test(W[i+1]||"")&&i<=W.length-4)cands.push([i+2,"then",1]);
      else if(/^(and|but|so|because|cause|then|when|if|after|before)$/.test(w)&&i<=W.length-3)cands.push([i+1,w,1]);
      else if(/^(i|i'm|im|i've|i'll|we|we're|you|you're|it's|its|my|he|she|they|can|could|do|does|did|is|are|what|where|how|why|let's|please)$/.test(w)&&!/^(the|a|an|my|your|to|of|in|on|at|for|with|and|but|or|that|if|i|you|we|think|know|said|hope|guess|wish|when|where|what|how|why|is|are|was|were|be|do|does|did|can|could|will|would|should|really|so|very|just|let|make|made|help|want|need|like|love)$/i.test(pv.replace(/[,.!?]/g,"")))cands.push([i,null,2])}
    cands.sort((a,b)=>a[2]-b[2]);
    for(const[i,k]of cands){const A0=W.slice(0,k?(k==="then"&&/^and$/i.test(W[i-2]||"")?i-2:i-1):i).join(" ").replace(/[,;]$/,""),B0=W.slice(i).join(" ")+(isQ?"?":"");if(A0.split(" ").length<2||B0.split(" ").length<2)continue;
      const a=one(A0);if(!a)continue;const b=one(B0);if(!b)continue;if(!a.dropped.length&&!b.dropped.length)continue;
      let ch=null;const kk=k==="cause"?"because":k;if(kk&&/^(and|but|so|because|then|when|if|after|before)$/.test(kk)){try{ch=join(kk,a.r,b.r,false)}catch(e){ch=null}}
      if(!ch)ch=[...a.r.chunks,["。",null,"."],...(kk==="but"?[C("でも"),CM]:kk==="so"?[C("だから"),CM]:[]),...b.r.chunks];
      const dr=[...a.dropped,...b.dropped].filter(Boolean);return{chunks:ch,used:[...(a.r.used||[]),...(b.r.used||[])],notes:[...(a.r.notes||[]),...(b.r.notes||[])],dropped:dr.join(", "),en:s.charAt(0).toUpperCase()+s.slice(1)+(isQ?"?":"")}}
  }finally{partial.depth=0}}
  return null;
}
const tone=u=>/(^|,)vulg(,|$)/.test(u.pos||"")?" · rude word":/(^|,)sl(,|$)/.test(u.pos||"")?" · slang / casual word":"";
function compose(q){
  q=normEn(q);let r=null;try{r=compose1(q)}catch(e){r=null}
  if(r)return r;
  {const parts=q.split(/(?<=[.?!])\s+(?=[A-Za-z])/).map(x=>x.trim()).filter(Boolean);if(parts.length>=2&&parts.length<=4){const rs=parts.map(x=>{try{return compose(x)}catch(e){return null}});
    if(rs.every(Boolean))return{chunks:rs.flatMap((x,i)=>i?[["。",null,"."],...x.chunks]:x.chunks),used:rs.flatMap(x=>x.used||[]),notes:rs.flatMap(x=>x.notes||[]),en:q}}}
  try{r=clauses(q,0)}catch(e){r=null}
  if(r)return r;
  {const om=/^(ngl|tbh|honestly|lowkey|omg|oh my god|oh my gosh|wow|bro|dude|bruh|man|yo|lol|lmao|ok so|okay so|so|well|hey|oh|guys|then|and then|after that)[,!]* (.+)$/i.exec(q.trim());if(om){let r2=null;try{r2=compose(om[2])}catch(e){}
    if(r2){const k=om[1].toLowerCase(),pre=/^(ngl|tbh|honestly|lowkey)$/.test(k)?[C("正直","しょうじき"),CM]:/^(omg|oh my god|oh my gosh)$/.test(k)?[C("えっ"),CM]:/^wow$/.test(k)?[C("わあ"),CM]:/^(well)$/.test(k)?[C("まあ"),CM]:/^(then|and then|after that)$/.test(k)?[C("それから"),CM]:/^(hey|yo|guys)$/.test(k)?[C("ねえ"),CM]:/^oh$/.test(k)?[C("あ"),CM]:[];return{...r2,chunks:[...pre,...r2.chunks],en:q.trim().replace(/^./,c=>c.toUpperCase())}}}}
  {const gm=/^(.+?)[,!.]* (good ?night|night night|bye|bye bye|see you|see you later|see you tomorrow|see ya|talk later|take care|have a good night|sleep well)[.!]*$/i.exec(q.trim());if(gm&&gm[1].split(" ").length>=2){let r2=null;try{r2=compose(gm[1])}catch(e){}
    const G={goodnight:["おやすみなさい"],"good night":["おやすみなさい"],"night night":["おやすみ"],bye:["じゃあね"],"bye bye":["バイバイ"],"see you":["またね"],"see you later":["また後で","またあとで"],"see you tomorrow":["また明日","またあした"],"see ya":["またね"],"talk later":["また後で","またあとで"],"take care":["気をつけてね","きをつけてね"],"have a good night":["おやすみなさい"],"sleep well":["おやすみなさい"]}[gm[2].toLowerCase()];
    if(r2&&G)return{...r2,chunks:[...r2.chunks,["。",null,"."],C(G[0],G[1]||G[0])],en:q.trim()}}}
  {const tm=/^(.+?)[,!.]* (thanks|thank you|thx|ty)[.!]*$/i.exec(q.trim());if(tm&&tm[1].split(" ").length>=2){let r2=null;try{r2=compose(tm[1])}catch(e){}if(r2)return{...r2,chunks:[...r2.chunks,["。",null,"."],C("ありがとうございます")],en:q.trim().replace(/^./,c=>c.toUpperCase())}}}
  {const tg=/^(.+?),? (isn't it|aren't they|isn't he|isn't she|right|don't you think|huh|wasn't it|eh)\??$/i.exec(q.trim());if(tg&&tg[1].split(" ").length>=2){let r2=null;try{r2=compose(tg[1])}catch(e){}if(r2){const L=r2.chunks[r2.chunks.length-1];if(L&&/^(です|でした)$/.test(L[0]))return{...r2,chunks:[...r2.chunks,C("ね")]};if(L&&L[0]==="ね")return r2}}}
  {const sm=/^(.+?)[,!.]* (sorry|sry|my bad)[.!]*$/i.exec(q.trim());if(sm&&sm[1].split(" ").length>=2&&!/^(i'm|i am|im|we're|we are)( (so|really|very|truly|terribly|super|extremely|deeply))*$/i.test(sm[1])&&!/ (so|really|very|truly|terribly|super|extremely)$/i.test(sm[1])){let r2=null;try{r2=compose(sm[1])}catch(e){}if(r2)return{...r2,chunks:[...r2.chunks,["。",null,"."],C("すみません")]}}}
  {const lm=/^(.+?)[,!]* (lol|lmao|haha|hahaha|bro|dude|man|fr|for real|tbh|ngl)$/i.exec(q.trim());if(lm){let r2=null;try{r2=compose(lm[1])}catch(e){}if(r2)return{...r2,en:q.trim().replace(/^./,c=>c.toUpperCase())}}}
  // a very long sentence: split at "and then" / "so" / "but" and build each side on its own (each may split again)
  if(!((compose.jdepth||0)>2)){const w=q.trim().replace(/[?!.]+$/,"").split(/\s+/),qm=/\?\s*$/.test(q.trim());
    if(w.length>=9)for(let i=w.length-3;i>=3;i--){const x=w[i].toLowerCase().replace(/[,]/g,"");let k=null,n=1;
      if(x==="and"&&/^then$/i.test(w[i+1]||"")){k="then";n=2}else if(x==="so"&&!/^(so)$/i.test(w[i-1]))k="so";else if(x==="but")k="but";else continue;
      const A0=w.slice(0,i).join(" ").replace(/,$/,""),B0=w.slice(i+n).join(" ")+(qm?"?":"");if(A0.split(" ").length<3||B0.split(" ").length<3)continue;
      compose.jdepth=(compose.jdepth||0)+1;let ra=null,rb=null;try{ra=compose(A0);if(ra)rb=compose(B0)}catch(e){ra=null}finally{compose.jdepth--}
      if(!ra||!rb||ra.single||rb.single)continue;let j=null;try{j=join(k,ra,rb,false)}catch(e){j=null}
      if(j)return{chunks:j,used:[...(ra.used||[]),...(rb.used||[])],notes:[...(ra.notes||[]),...(rb.notes||[])],en:q}}}
  if(!(compose.depth>0)){const w=q.trim().replace(/[?!.]+$/,"").split(/\s+/),qm=/\?\s*$/.test(q.trim());
    const ST=/^(hope|i|i'm|i've|i'll|i'd|we|we're|we've|we'll|you|you're|it's|its|it|my|our|your|the|this|he|she|he's|she's|they|they're|there's|can|could|would|will|do|does|did|didn't|don't|have|has|is|are|was|were|what|what's|where|where's|how|why|when|let's|please|sorry|thanks|thank)$/i;
    const NOT=/^(really|very|totally|just|also|still|actually|literally|pretty|super|kinda|too|always|never|so|a|an|the|my|your|our|his|her|their|to|of|in|on|at|for|with|and|but|or|that|if|because|cause|when|than|as|is|are|was|were|am|be|been|do|does|did|can|could|will|would|should|think|thought|know|knew|said|say|says|hope|guess|wish|sure|believe|feel|felt|mean|tell|told|ask|asked|where|what|how|why|who|which|whether|until|before|after|while|since|let|make|made|help|see|saw|watch|hear|heard|want|need|like|love|hate)$/i;
    const END=/(です|ます|ました|ません|ませんでした|ますか|ですか|ください|でした|ましょう|ませんか|か|ね|よ|たい|ない|た|だ)$/;
    if(w.length>=5&&w.length<=26)for(let i=2;i<=w.length-3;i++){const wi=w[i].replace(/[,.!?]/g,""),wp=w[i-1].replace(/[,.!?]/g,"");if(!ST.test(wi)||NOT.test(wp))continue;
      if(/^(the|this|my|our|your|it)$/i.test(wi)&&/^(i|we|you|he|she|they)$/i.test(w[i+1]||""))continue;
      const A0=w.slice(0,i).join(" ").replace(/[,]$/,""),B0=w.slice(i).join(" ")+(qm?"?":"");let ra=null,rb=null;compose.depth=1;
      const ex=x=>{try{const e=typeof exactSent==="function"&&exactSent(x);if(e&&e.b&&e.b.jp&&!/[〜~]/.test(e.b.jp))return{chunks:[[e.b.jp,e.b.kana||null,e.b.romaji||null]],used:[],notes:[]}}catch(e){}return null};
      try{ra=compose(A0)||ex(A0);if(ra)rb=compose(B0)||ex(B0)}catch(e){ra=null}finally{compose.depth=0}
      const la=ra&&ra.chunks[ra.chunks.length-1],lb=rb&&rb.chunks[rb.chunks.length-1];if(la&&lb&&/[。？！?!]$/.test(la[0]))la[0]=la[0];
      if(ra&&rb&&!ra.single&&!rb.single&&la&&lb&&END.test(la[0].replace(/[。？！?!]+$/,""))&&END.test(lb[0].replace(/[。？！?!]+$/,"")))return{chunks:[...ra.chunks,["。",null,"."],...rb.chunks],used:[...(ra.used||[]),...(rb.used||[])],notes:[...(ra.notes||[]),...(rb.notes||[])],en:q}}}
  {const t=cleanQ(q).replace(/^(a|an|the|some|my) /i,"");if(t&&t.split(" ").length<=3&&!/\?\s*$/.test(q)&&/^[a-z][a-z' -]*$/i.test(t)&&!/\b(i|you|he|she|we|they|it|me|him|her|us|them|is|are|was|am|do|does|did|can|will)\b/i.test(t)){let np=null;try{np=NP(t)}catch(e){}
    const L=np&&np.used[np.used.length-1];
    if(np&&!np.pron&&L&&np.chunks.every(c=>c[1]!=null)&&(L.kind!=="dictionary"||gkey((L.en||"").split(/[\/;]/)[0])===gkey(t.split(" ").pop()).replace(/s$/,"")||gkey((L.en||"").split(/[\/;]/)[0])===gkey(t.split(" ").pop())))
      return{chunks:np.chunks,used:np.used,notes:[],single:true,en:t.charAt(0).toUpperCase()+t.slice(1)}}}
  return null;
}
// texting shorthand and missing apostrophes, as people type on a phone: "im hungry", "idk", "u ok?"
const SHORT={im:"I'm",ive:"I've",dont:"don't",cant:"can't",wont:"won't",didnt:"didn't",doesnt:"doesn't",isnt:"isn't",arent:"aren't",wasnt:"wasn't",werent:"weren't",shouldnt:"shouldn't",couldnt:"couldn't",wouldnt:"wouldn't",havent:"haven't",hasnt:"hasn't",
  whats:"what's",wheres:"where's",hows:"how's",whos:"who's",thats:"that's",theres:"there's",youre:"you're",theyre:"they're",hes:"he's",shes:"she's",ur:"your",u:"you",r:"are",pls:"please",plz:"please",pleas:"please",
  luv:"love",idk:"I don't know",ik:"I know",rn:"right now",tmr:"tomorrow",tmrw:"tomorrow",tmw:"tomorrow",tomorow:"tomorrow",tommorow:"tomorrow",tommorrow:"tomorrow","2moro":"tomorrow",tonite:"tonight",nite:"night",bc:"because",cuz:"because",coz:"because",
  ppl:"people",msg:"message",omw:"I'm on my way",brb:"I'll be right back",ttyl:"talk to you later",nvm:"never mind",ofc:"of course",ily:"I love you",hbu:"how about you",wbu:"how about you",hav:"have",gud:"good",tho:"though",thru:"through",
  mutch:"much",muhc:"much",mcuh:"much",englsh:"English",englis:"English",engish:"English",japanes:"Japanese",japenese:"Japanese",japaneese:"Japanese",wensday:"Wednesday",wendsday:"Wednesday",febuary:"February",beacuse:"because",becaus:"because",thier:"their",hwo:"how",whta:"what",wehre:"where",waer:"where",somthing:"something",sumthing:"something",anythin:"anything",nothin:"nothing",everythin:"everything",goin:"going",gonna:"going to",wanna:"want to",doin:"doing",nothng:"nothing",tonigth:"tonight",yesturday:"yesterday",yesterdy:"yesterday",tomorroww:"tomorrow",tomarrow:"tomorrow",tommorw:"tomorrow",pleace:"please",plese:"please",pleese:"please",becuz:"because",bcuz:"because",cuz:"because",thanku:"thank you",thankyou:"thank you",sorr:"sorry",sorrry:"sorry",helo:"hello",hii:"hi",heyy:"hey",okk:"ok",kk:"ok",
  thx:"thanks",sry:"sorry",soz:"sorry",srry:"sorry",thnx:"thanks",ty:"thank you",tysm:"thank you so much",thanx:"thanks",bday:"birthday",pic:"picture",pics:"pictures",convo:"conversation",fav:"favorite",fave:"favorite",prob:"probably",def:"definitely",obv:"obviously",abt:"about",bf:"boyfriend",gf:"girlfriend",
  becuase:"because",becasue:"because",freind:"friend",freinds:"friends",recieve:"receive",beleive:"believe",wierd:"weird",untill:"until",alot:"a lot",realy:"really",definately:"definitely",tounge:"tongue",begining:"beginning",goverment:"government",wich:"which",
  resturant:"restaurant",restraunt:"restaurant",hospitol:"hospital",bathrom:"bathroom",staton:"station",stasion:"station",hotle:"hotel",toliet:"toilet",tiolet:"toilet",whare:"where",wher:"where",wat:"what",wut:"what",waht:"what",hw:"how",yu:"you",yuo:"you",teh:"the",adn:"and",nad:"and",wiht:"with",jsut:"just",knwo:"know"};
function normEn(q){if(!q)return q;let t=q.replace(/[’‘]/g,"'").replace(/\s+/g," ").trim();
  t=t.replace(/\b(i|we|you|they)'ve got (?=(a|an|some|no|two|three|time|money|work|homework|plans|class|school)\b)/gi,"$1 have ").replace(/\b(i|we|you|they) have got (?=(a|an|some|no)\b)/gi,"$1 have ");
  t=t.replace(/\b(he|she|it|that|this|there|what|who|everyone|someone)'s been\b/gi,"$1 has been").replace(/\b(he|she|it|that|this|there|what|who)'s got\b/gi,"$1 has got");
  if(/^[^a-z]*[A-Z][^a-z]*$/.test(t)&&/[A-Z]{3}/.test(t))t=t.toLowerCase();   // ALL CAPS
  t=t.replace(/[?]{2,}/g,"?").replace(/[!]{2,}/g,"!").replace(/\.{2,}/g,"…").replace(/\s+([?!.,])/g,"$1");
  t=t.replace(/(^|[\s,])([A-Za-z0-9']+)(?=$|[\s,?!.])/g,(x,a,w)=>{const k=w.toLowerCase();const r=SHORT[k];if(r==null)return x;if(k==="r"&&!/^(r)$/i.test(w))return x;return a+(w[0]===w[0].toUpperCase()&&/^[a-z]/.test(r)?r[0].toUpperCase()+r.slice(1):r)});
  t=t.replace(/\b(to|will|can|could|should|i'll|wanna|gonna|i) by (?=(a|an|the|some|this|that|it|them|tickets?|food|water|milk|bread|clothes|souvenirs?|presents?|gifts?)\b)/gi,"$1 buy ");
  t=t.replace(/\b(want|going|have|need|got|go|come|like|love|try) 2 (?=[a-z])/gi,"$1 to ").replace(/\b(i|you|we|they) wanna\b/gi,"$1 want to").replace(/\bi'?m gonna\b/gi,"I'm going to");
  t=t.replace(/^were (is|are|can|do)\b/i,"where $1").replace(/(^|\b(?:but|and|so|because|cause|cuz|if|when|since|though|although|think|guess|hope) )its (?=(so|very|too|really|not|a|an|the|cold|hot|ok|okay|fine|good|bad|raining|snowing|late|early|my|your|time|over|here|there|true|free|cheap|expensive|hard|easy|fun|boring|difficult|nice|great|amazing|beautiful|weird|strange|crowded|busy|closed|open|getting|going)\b)/gi,"$1it's ").replace(/^ill (?=(be|call|text|go|do|see|tell|send|pay|wait|get|try|have|take|make|come|check|let)\b)/i,"I'll ");
  t=t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) thirty\b/gi,(x,a)=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12})[a.toLowerCase()]+":30");
  t=t.replace(/\b(he|she|it|they|my [a-z]+|[A-Z][a-z]+) (has|have) been ((?:so |really |very )?(?:sick|ill|busy|tired|stressed|sad|quiet|cold|hot|rainy|crazy|weird))(?= (all (?:day|week|month|morning|night)|lately|recently|these days)\b)/g,(x,a,b,c)=>a+(/^(they|my [a-z]+s)$/i.test(a)?" are ":" is ")+c);
  t=t.replace(/\b(i|we)(?:'ve| have) had (a (?:headache|cold|fever|stomachache|stomach ache|toothache|sore throat|runny nose|cough|backache))(?= (all (?:day|week|morning|night)|since|for|lately|recently)\b)/gi,"$1 have $2");
  t=t.replace(/\bturn (?:the |your |that )?(music|tv|radio|volume|sound|tv volume) (down|up)\b/gi,"turn $2 the $1");
  t=t.replace(/\b(i'm|i am|we're|we are) not sure (what|where|which|how|when|who) to\b/gi,(x,a,b)=>(/^we/i.test(a)?"we":"I")+" don't know "+b+" to");
  t=t.replace(/\b(i|we)'ve been trying to\b/gi,"$1 have been trying to");
  t=t.replace(/\b((?:my [a-z]+|they|he|she|[A-Z][a-z]+) (?:is|are)) visiting(?=( (next|this|tomorrow|tonight|soon|on|in|for)\b)|[?!.]?$)/g,"$1 coming to visit");
  t=t.replace(/\b(i|you|he|she|we|they|it)'d (?=(be|like|love|go|come|do|call|help|make|take|get|see|try|say|rather|prefer|need|want|buy|eat|have to|never|probably|definitely|really)\b)/gi,"$1 would ");
  t=t.replace(/\b(i|we) have a lot in common\b/gi,"$1 have a lot in common");
  t=t.replace(/( for (?:about |almost |over |nearly |more than )?[a-z0-9-]+ (?:years?|months?|weeks?|days?|hours?|minutes?)) now$/i,"$1");
  t=t.replace(/\b(be right back|on my way|talk to you later) (?=(i|we|my|the|it|let's|can|do)\b)/gi,"$1, ");
  t=t.replace(/^(i'm|i am|we're|we are) just looking(?= ?[,.!]| thanks| thank you|$)/i,"$1 just browsing");
  t=t.replace(/^(can|could|would|will) you please (?=[a-z])/i,"$1 you ");
  t=t.replace(/\b(i'm|i am) (?:gonna|going to) be (?:a little|a bit|kinda|kind of) late\b/gi,"I'll be a little late");
  t=t.replace(/\b((?:before|after|when|since|until|because|if) (?:i|we|you|they|he|she|my [a-z]+) )(move|moves|moved)(?=$|[,.!?]| (?:away|out|soon|next|this|back home)\b)/gi,"$1$2 house");
  t=t.replace(/\bway too\b/gi,"too").replace(/\bsuper (?=(long|short|good|bad|hot|cold|expensive|cheap|busy|crowded|tired|fun|nice|easy|hard|big|small|late|early)\b)/gi,"really ");
  t=t.replace(/^(my phone is (?:dying|almost dead|about to die)) (?=(do you|can i|is there|could i)\b)/i,"$1. ");
  t=t.replace(/([a-z]) (thanks|thank you|thx)$/i,"$1, $2");
  t=t.replace(/\b(is|are) visiting(?= (?:next|this|tomorrow|tonight|soon|on|in)\b|$)/gi,"$1 coming to visit");
  t=t.replace(/^(?:can|could) you (?:please )?(?:tell|teach) me how (?:to|do you|you) say (.+?) in japanese\??$/i,"how do you say $1 in Japanese").replace(/^is it possible (?:for (?:me|us) )?to /i,"can I ").replace(/\bhope to see you\b/gi,"I hope to see you").replace(/\bI I hope\b/g,"I hope");
  {const DBL=/^(good|cool|soon|too|see|feel|need|sleep|sweet|food|look|book|all|will|well|tell|still|really|happy|sorry|pretty|little|coffee|cheese|three|free|tree|week|keep|meet|beer|feet|boss|miss|kiss|pass|less|dress|guess|class|glass|grass|call|fall|small|tall|hello|yummy|funny|silly|dinner|summer|better|butter|bigger|sooo)$/i;
   t=t.replace(/\b([a-z]*?)([a-z])\2{2,}([a-z]*)\b/gi,(x,a,c,b)=>{const two=a+c+c+b,one=a+c+b;return DBL.test(two)?two:DBL.test(one)?one:/^(so|no|yes|ok|hi|hey|oh|please|love|cute|nice|yay|wow|omg|lol|what|why|ugh|bye|thanks|plz|pls)$/i.test(one)?one:x})}
  t=t.replace(/\b(kinda|kind of|sorta|sort of) (?=(mid|good|bad|boring|cold|hot|tired|hungry|expensive|cheap|weird|scary|hard|easy|far|big|small|sad|fun|nice|cute|annoying|busy|sleepy|late|slow|fast)\b)/gi,"a little ");
  t=t.replace(/\b(was|is|are|were) (?:a little |pretty |so |really )?mid\b/gi,"$1 so-so");
  t=t.replace(/\bthey're\b/gi,"they are").replace(/\bthey've\b/gi,"they have").replace(/\bthey'll\b/gi,"they will");
  t=t.replace(/\b(was|am|is|were|are|'m|'re) in the shower\b/gi,"$1 taking a shower").replace(/\bphone battery is (almost|nearly) dead\b/gi,"phone is $1 dead");
  t=t.replace(/\b((?:i'm|i am|we're|we are|they are|he is|she is|he's|she's|my [a-z]+ (?:is|are)) )(moving|leaving)(?=( (tomorrow|tonight|soon|next|this|on|in|at|later|today)\b)|[?!.]?$)/gi,(x,a,b)=>a+(/moving/i.test(b)?"moving house":"departing"));
  t=t.replace(/\b((?:i|we|they|he|she) )(moved)(?=( (last|in|recently|a few|two|three)\b)|[?!.]?$)/gi,"$1moved house");
  t=t.replace(/^i(?= )/,"I");return t}
const CM=["、",null,","];
// "I went to the store and bought some bread" -> 店に行って、パンを買いました
// "I want to go to Japan but I don't have money" -> 日本に行きたいですけど、お金がありません
function clauses(q,depth){
  if(depth>2)return null;
  const isQ=/\?\s*$/.test(q.trim());let s=expandEn(cleanQ(q)).replace(/\s+/g," ");
  if(!s||s.split(" ").length>26)return null;
  const any=t=>{let r=null;try{r=compose1(t)}catch(e){r=null}return r||clauses(t,depth+1)};
  const last=t=>any(t+(isQ?"?":""));
  // "if you are tired" / "when you get home": Japanese leaves out who, so it is built like "if I am tired"
  const sub=t=>any(t)||(/^you\b/i.test(t)?any(t.replace(/^you are\b/i,"i am").replace(/^you were\b/i,"i was").replace(/^you\b/i,"i")):null);
  const PRO=/^((i|we|you|he|she|they|it|my|the|a|an|this|that|there|his|her|our|their|your|let's|lets|please)\b|(can|could|do|did|is|are|was|were|will|would) (you|i|we|he|she|they|it|my|the|this|that|there)\b|(now|today|yesterday|tomorrow|tonight|later|someone|somebody|everyone|do not|don't|never) |[A-Z])/;
  const subjOf=a0=>{const a=a0.replace(/^(?:(?:yesterday|today|tomorrow|tonight|last night|this morning|this afternoon|this evening|then|so|and|after that|later|first|finally|suddenly|recently|usually|sometimes|honestly)[,]? )+/i,"");const m=/^(i|we|he|she|they|you)\b/i.exec(a);const m2=/^(my|the|his|her|our|their) (?:(?:little|big|older|younger|best|new|old|baby|twin|elder|next-door) )?[a-z]+/i.exec(a);return m?m[1]:m2?m2[0]:null};
  const fin=(ch,used,notes)=>({chunks:ch,used,notes,en:s.charAt(0).toUpperCase()+s.slice(1)+(isQ?"?":"")});
  let m;
  // "when I was a kid, ..." -> 子供の頃、...
  {const KW="(?:a |an )?(kid|child|little|young|small|teenager|student|baby|in high school|in middle school|in junior high|in elementary school|in college|in university|at university|in school)s?";
   const m1=new RegExp("^when (?:i was|we were) "+KW+",? (.+)$","i").exec(s),m2=!m1&&new RegExp("^(.+?),? when (?:i was|we were) "+KW+"$","i").exec(s);m=m1?m1:m2?[m2[0],m2[2],m2[1]]:null}
  if(m){
    let r=last(m[2]);if(r&&r.chunks[0]&&r.chunks[0][0]==="昔"&&(r.chunks[1]||[])[0]==="は")r={...r,chunks:r.chunks.slice(2)};
    if(r){const k={kid:["子供","こども"],child:["子供","こども"],little:["子供","こども"],small:["子供","こども"],young:["若い","わかい"],teenager:["十代","じゅうだい"],student:["学生","がくせい"],baby:["赤ちゃん","あかちゃん"],"in high school":["高校","こうこう"],"in middle school":["中学","ちゅうがく"],"in junior high":["中学","ちゅうがく"],"in elementary school":["小学校","しょうがっこう"],"in college":["大学","だいがく"],"in university":["大学","だいがく"],"at university":["大学","だいがく"],"in school":["学生","がくせい"]}[m[1].toLowerCase()];
      return fin([C(k[0],k[1]),...(k[0]==="若い"?[]:[C("の")]),C("頃","ころ"),CM,...r.chunks],r.used,r.notes||[])}}
  // "I think this is good" -> これはいいと思います ; "my friend said this place is famous" -> 友達はここが有名だと言っていました
  if((m=/^(?:i|we) (think|guess|believe|feel like) (?:that )?(.+)$/i.exec(s))&&!/^(so|not)$/i.test(m[2])&&!/, (can|could|would|will|do|does|is|are|please|where|what|how|should)\b/i.test(m[2])){
    const r=any(m[2]),p=r&&toPlain(r.chunks);if(p)return fin([...p,C("と"),C("思います","おもいます")],r.used,[...(r.notes||[]),"… と思います = I think …"])}
  if((m=/^they (told me|said) (?:that )?(.+)$/i.exec(s))){const r=any(m[2].replace(/^(he|she|they|i|we|it) would /i,"$1 will ")),p0=r&&toPlain(r.chunks);if(p0){const wi=p0.findIndex((c,i)=>c[0]==="は"&&(p0[i-1]||[])[0]!=="に"&&i<4);const p=wi>0?[...p0.slice(0,wi),C("が"),...p0.slice(wi+1)]:p0;
    const L=p[p.length-1];const p3=L&&L[1]!=null&&/ていなかった$/.test(L[0])?[...p.slice(0,-1),C(L[0].replace(/ていなかった$/,"ていない"),L[1].replace(/ていなかった$/,"ていない"))]:p;
    return fin([...dropMy(p3),C("と"),C(/told/i.test(m[1])?"言われました":"言っていました",/told/i.test(m[1])?"いわれました":"いっていました")],r.used,r.notes||[])}}
  if((m=/^(.+?) (said|says|told me) (?:that )?(.+)$/i.exec(s))&&!/(, (but|so)\b|\bbut\b)/i.test(m[3])){
    const W=/^(he|she|they)$/i.test(m[1])?{chunks:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()]],used:[]}:NP(m[1]);
    const r=W&&!W.pron&&any(m[3].replace(/^(he|she|they|i|we|it) would /i,"$1 will ")),p0=r&&toPlain(r.chunks),wi=p0?p0.findIndex((c,i)=>c[0]==="は"&&(p0[i-1]||[])[0]!=="に"):-1,p=p0&&wi>0?[...p0.slice(0,wi),C("が"),...p0.slice(wi+1)]:p0;
    const p2=p&&W.chunks[0]&&p[0]&&p[0][0]===W.chunks[0][0]&&/^(が|は)$/.test((p[1]||[])[0])?p.slice(2):p;
    if(p2)return fin([...dropMy(W.chunks),WA0,...p2,C("と"),C(m[2].toLowerCase()==="says"?"言っています":"言っていました",m[2].toLowerCase()==="says"?"いっています":"いっていました")],[...W.used,...r.used],[...(r.notes||[]),"… と言っていました = said that …"])}
  if((m=/^(i|we|he|she|they|my [a-z]+|[A-Z][a-z]+)(?: have| has|'ve|'s| is(?= been)) (?:been )?(.+?) for (an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|\d+) (minutes?|hours?|days?|weeks?|months?|years?)$/i.exec(s))){
    const d=duration(m[3],m[4]),W=/^(i|we)$/i.test(m[1])?{chunks:[],used:[]}:/^(he|she|they)$/i.test(m[1])?{chunks:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()]],used:[]}:NP(m[1]);
    let te=null,pre=[],used=[];
    if(/^married$/i.test(m[2]))te=C("結婚して","けっこんして");
    else{const ws=m[2].split(" "),w=ws[0].toLowerCase();const bases=IRR[w]?[IRR[w]]:/ing$/.test(w)?[w.slice(0,-3),w.slice(0,-3)+"e",w.slice(0,-4)]:/ied$/.test(w)?[w.slice(0,-3)+"y"]:/ed$/.test(w)?[w.slice(0,-1),w.slice(0,-2),w.slice(0,-3)]:[];
      for(const b of bases){const vp=VP([b,...ws.slice(1)].join(" "));const st=vp&&!vp.me&&vstems(vp.v);if(st&&st.te){te=C(st.te[0],st.te[1]);pre=vp.pre;used=vp.used;break}}}
    if(d&&W&&!W.pron&&te&&/^(minutes?|hours?)$/i.test(m[4])&&/ing\b/i.test(m[2]))return fin([...dropMy(W.chunks),...(W.chunks.length?[WA0]:[]),d,C("ずっと"),...pre,te,C("います")],[...W.used,...used]);
    if(d&&W&&!W.pron&&te)return fin([...dropMy(W.chunks),...(W.chunks.length?[WA0]:[]),...pre,te,d,C("に"),C("なります")],[...W.used,...used],["… て N年になります = it's been N years since …"])}
  // "I usually wake up at seven, eat breakfast, and then go to work" -> 起きて、朝ご飯を食べて、それから仕事に行きます
  {const parts=s.split(/,\s*(?:and then |and |then )?|\s+and then\s+/i).map(x=>x.trim()).filter(Boolean);
   if(parts.length>=3){const sj=subjOf(parts[0]);if(sj){const rs=[];let ok=true;for(let i=0;i<parts.length;i++){let t=parts[i];if(i>0&&!PRO.test(t))t=sj+" "+t;const r=any(i===parts.length-1?t+(isQ?"?":""):t);if(!r){ok=false;break}rs.push(r)}
     if(ok){const ch=[];for(let i=0;i<rs.length;i++){if(i<rs.length-1){const te=toTe(rs[i].chunks);if(!te){ok=false;break}ch.push(...(i>0&&rs[i].chunks[0]&&rs[i].chunks[0][0]===rs[0].chunks[0][0]&&rs[i].chunks[1]&&rs[i].chunks[1][0]==="は"?te.slice(2):te),CM)}else ch.push(...(rs[i].chunks[0]&&rs[0].chunks[0]&&rs[i].chunks[0][0]===rs[0].chunks[0][0]&&(rs[i].chunks[1]||[])[0]==="は"?rs[i].chunks.slice(2):rs[i].chunks))}
       if(ok)return fin(ch,rs.flatMap(r=>r.used),rs.flatMap(r=>r.notes||[]))}}}}
  // "we'll go to the museum instead of the park" -> 公園の代わりに博物館に行きます
  if((m=/^(.+) instead of (?:the |a |an |my )?(.+)$/i.exec(s))&&!/\b(if|when|because|but|so|and|after|before)\b/i.test(m[1])){const r=any(m[1]),np=r&&NP(m[2]);if(np&&!np.pron){const t0=r.chunks.findIndex(c=>c[1]!=null&&!/^(今日|明日|昨日|今夜|今朝|来週|週末)$/.test(c[0]));const k=t0<0?0:t0;return fin([...r.chunks.slice(0,k),...np.chunks,C("の"),C("代わり","かわり"),C("に"),...r.chunks.slice(k)],[...np.used,...r.used],r.notes||[])}}
  if((m=/^(i|we|you) can (.+?) and (.+)$/i.exec(s))&&!/\b(if|when|because|but|so)\b/i.test(m[2])){const va=VP(m[2]),vb=VP(m[3]),st=va&&!va.past&&!va.ing&&vstems(va.v),eb=vb&&!vb.past&&!vb.ing&&vend(vb.v,"pot");
    if(st&&st.te&&eb){let pre=dropMy(vb.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=(pre[oi-1]||[])[0]==="何か"?[...pre.slice(0,oi),...pre.slice(oi+1)]:[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];return fin([...dropMy(va.pre),C(st.te[0],st.te[1]),...pre,...eb,...(isQ?[C("か")]:[])],[...va.used,...vb.used])}}
  if(/\b(excited|happy|glad|sad|sorry|ready|nervous|afraid|scared|able|eager|lucky|surprised|sure|willing|proud|free|about|going|want|wants|wanted|need|needs|have|has|had|like|love|hate|try|trying)\s+to\s/i.test(s)&&/\b(excited|happy|glad|sad|sorry|ready|nervous|afraid|scared|able|eager|lucky|surprised|willing|proud)\s+to\s/i.test(s)){}else
  if((m=/^(.+?) (?:in order )?to (avoid|catch|see|meet|buy|save|visit|study|learn|find|watch|celebrate|check|help|pick up|make it|get there|get home|be on time|go|travel|come|pay|live|work) ?(.*)$/i.exec(s))&&!/\b(me|you|him|her|us|them|someone|everyone)$/i.test(m[1])&&!/\b(too|so|enough|very|down|ready|happy|glad|sad|sorry)\b/i.test(m[1])&&!/\b(want|wants|wanted|need|needs|needed|have|has|had|going|try|tried|trying|like|love|plan|planning|hope|decided|forgot|remember|used|able|about|how|way|time|went|go|come|came|got|is|are|was|were|am|ready|nice|good|easy|hard|wait)$/i.test(m[1])){
    let ra=/\benough\b/i.test(m[1])?null:any(m[1]);{const L=ra&&ra.chunks[ra.chunks.length-1],P=ra&&ra.chunks[ra.chunks.length-2];if(ra&&!(/(ます|ました|ましょう|ください|ません)$/.test(L[0])||L[0]==="でした"&&P&&/ません$/.test(P[0])))ra=null}let vp=null;if(ra){if(/^be on time$/i.test(m[2]))vp={pre:[C("間に合う","まにあう")],d:[]};else{const v=VP((m[2]+" "+m[3]).trim()),d=v&&!v.past&&!v.ing&&vplain(v.v,"dict");if(d)vp={pre:[...dropMy(v.pre),...d],used:v.used}}}
    if(vp)return fin([...vp.pre,C("ために"),CM,...ra.chunks],[...(vp.used||[]),...ra.used],[...(ra.notes||[]),"… ために = in order to …"])}
  // "let me know so I can pick you up" -> 迎えに行けるように、教えてください
  if((m=/^(.+?),? so (?:that )?(i|we|you) can (.+)$/i.exec(s))){const ra=any(m[1]),vp=ra&&VP(m[3]);const st=vp&&!vp.past&&vstems(vp.v),pt=st&&(NOPOT.has(vp.v.jp)?null:st.pot);if(pt){let pre=vp.pre;const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];
    return fin([...pre,C(pt[0]+"る",pt[1]+"る"),C("ように"),CM,...ra.chunks],[...vp.used,...ra.used],[...(ra.notes||[]),"… ように = so that …"])}}
  if((m=/^(.+?) (?:is|are|was|were) supposed to (be .+|[a-z].+)$/i.exec(s))&&!/^(i|we|you)$/i.test(m[1])){const r=any(m[1]+" "+(/^be /i.test(m[2])?"is "+m[2].slice(3):"will "+m[2])),p=r&&toPlain(r.chunks);if(p){let q=p;const L=q[q.length-1];if(L&&L[0]==="だ")q=[...q.slice(0,-1),C("だ")];return fin([...q,C("そう"),C("です")],r.used,[...(r.notes||[]),"… そうです = I hear that … / it's supposed to …"])}}
  // "my friend and I are going to Osaka" -> 友達と大阪に行きます
  if((m=/^(.+?) and i (.+)$/i.exec(s))&&!/ /.test(m[1].replace(/^(my|our|your|his|her) /i,""))){const np=NP(m[1]),r=np&&!np.pron&&any("we "+m[2]);if(r){const tk=r.chunks.findIndex(c=>/^(今日|明日|昨日|今週末|来週|先週|来月|今夜|今朝|週末|今年|来年)$/.test(c[0]));const lead=tk===0?(r.chunks[1]&&r.chunks[1][0]==="は"?2:1):0;return fin([...r.chunks.slice(0,lead),...(lead?[CM]:[]),...dropMy(np.chunks),C("と"),...dropMy(r.chunks.slice(lead))],[...np.used,...r.used],r.notes||[])}}
  // "I just arrived in Japan" -> 日本に着いたばかりです
  if((m=/^(i|we) just (.+)$/i.exec(s))){const r=any(m[1]+" "+m[2]),L=r&&r.chunks[r.chunks.length-1];if(L&&/ました$/.test(L[0])){const p=toPlain(r.chunks);if(p)return fin([...p,C("ばかり"),C("です")],r.used,[...(r.notes||[]),"… たばかりです = just did …"])}}
  // "it was so cold that I couldn't sleep" -> 寒くて眠れませんでした
  if((m=/^(.+?) (is|was|are|were) (?:so|too) (\w+) (?:that )?(.+)$/i.exec(s))&&/^(i|we|you|he|she|they|it|my|the)\b/i.test(m[4])){const r1=any(m[1]+" "+m[2]+" "+m[3]),a=r1&&adjTe(r1.chunks),r2=a&&last(m[4]);if(r2){let c2=r2.chunks;if(a[0]&&c2[0]&&a[0][0]===c2[0][0]&&/^(は|が)$/.test((c2[1]||[])[0]||""))c2=c2.slice(2);return fin([...a,...c2],[...r1.used,...r2.used],r1.notes||[])}}
  // "it's too hot to go outside" -> 暑すぎて外に行けません
  if((m=/^(it|this|that) (is|was) too (\w+) to (.+)$/i.exec(s))){const r1=any(m[1]+" "+m[2]+" too "+m[3]),L=r1&&r1.chunks[r1.chunks.length-1],vp=VP(m[4]),e=vp&&!vp.past&&vend(vp.v,/was/i.test(m[2])?"potnegpast":"potneg");
    if(L&&/すぎ(ます|ました)$/.test(L[0])&&e){let pre=vp.pre;const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];
      return fin([...r1.chunks.slice(0,-1),C(L[0].replace(/(ます|ました)$/,"て"),L[1]&&L[1].replace(/(ます|ました)$/,"て")),...pre,...e],[...r1.used,...vp.used])}}
  // "I can't sleep because of the noise" -> 騒音のせいで眠れません
  if((m=/^(.+) because of (?:the |my |a |an |this |that |his |her )?(.+)$/i.exec(s))){const r=any(m[1]),np=r&&NP(m[2]);if(np&&!np.pron)return fin([...np.chunks,C("の"),C("せい"),C("で"),...r.chunks],[...np.used,...r.used],r.notes||[])}
  // "I want to quit my job and travel the world" -> 仕事を辞めて世界を旅行したいです
  if((m=/^(i|we) want to (.+?) and (.+)$/i.exec(s))){const va=VP(m[2]),vb=VP(m[3]),st=va&&!va.past&&!va.ing&&vstems(va.v),eb=vb&&!vb.past&&vend(vb.v,"tai");
    if(st&&st.te&&eb)return fin([...dropMy(va.pre),C(st.te[0],st.te[1]),...dropMy(vb.pre),...eb],[...va.used,...vb.used])}
  // "I hope she likes it" -> 気に入ってくれるといいですね
  if((m=/^i hope (he|she|they|you) (?:like|likes|love|loves) it$/i.exec(s)))return fin([...(/you/i.test(m[1])?[]:[{he:C("彼","かれ"),she:C("彼女","かのじょ"),they:C("彼ら","かれら")}[m[1].toLowerCase()],C("が")]),C("気に入って","きにいって"),C("くれる"),C("と"),C("いい"),C("です"),C("ね")],[]);
  // "the homework is due tomorrow" -> 宿題は明日までです
  if((m=/^(.+?) (?:is|are) due (.+)$/i.exec(s))){const np=NP(m[1]),t=m[2].toLowerCase(),tw=TIME[t]&&(byJP(TIME[t],"any")||TFB[t]);if(np&&!np.pron&&tw)return fin([...dropMy(np.chunks),WA0,C(tw.jp,tw.kana),C("まで"),C("です")],[...np.used,tw])}
  if((m=/^(.+?) (is|are|was|were) (?:so |very |really )?([a-z]+) and (?:also |very |so |really )?([a-z]+)$/i.exec(s))&&!/^(i|we|you|he|she|they)$/i.test(m[1])){
    const r1=any(m[1]+" "+m[2]+" "+m[3]),r2=r1&&any("it "+(/^(was|were)$/i.test(m[2])?"was":"is")+" "+m[4]),te=r1&&r2&&toTe(r1.chunks);
    if(te&&r2&&r2.chunks.length<=3)return fin([...te,...r2.chunks],[...r1.used,...r2.used],[...(r1.notes||[])])}
  // "studying Japanese is hard but fun" -> 日本語を勉強するのは難しいけど、楽しいです
  if((m=/^(.+?) (is|are|was|were) (?:so |very |really )?([a-z]+) but (?:also |still )?((?:a little |a bit |kind of |pretty |too |very |so |really )?[a-z]+)$/i.exec(s))){
    const r1=any(m[1]+" "+m[2]+" "+m[3]),r2=r1&&any("it "+(/^(was|were)$/i.test(m[2])?"was":"is")+" "+m[4]),p=r1&&r2&&toPlain(r1.chunks);
    if(p)return fin([...p,C("けど"),CM,...r2.chunks],[...r1.used,...r2.used],[...(r1.notes||[])])}
  // "I hope it doesn't rain tomorrow" -> 明日雨が降らないといいですね
  if((m=/^i hope (?:that )?(.+)$/i.exec(s))&&!/^you have (?:a )?(great|good|nice|fun|safe|wonderful|lovely|amazing) /i.test(m[1])){const r=any(m[1].replace(/^you\b/i,"i")),p=r&&toPlain(r.chunks);if(p)return fin([...p,C("と"),C("いい"),C("です"),C("ね")],r.used,[...(r.notes||[]),"… といいですね = I hope …"])}
  // "if I were rich, I would buy a house" -> お金持ちだったら、家を買います
  if((m=/^if (i|we|you) (?:were|was|had) (.+?),? (?:i|we|you) would (.+)$/i.exec(s))){const had=/ had /i.test(s.split(",")[0]+" "),ra=any((had?"i have ":"i am ")+m[2]),rb=ra&&any("i will "+m[3]),p=ra&&toPlain(ra.chunks,true);
    if(p&&rb){const L=p[p.length-1];return fin([C("もし"),...p.slice(0,-1),C(L[0]+"ら",L[1]!=null?L[1]+"ら":null),CM,...rb.chunks],[...ra.used,...rb.used],["もし…たら = if … (imagining)"])}}
  // "I wish I could speak Japanese" -> 日本語が話せたらいいのに ; "I wish I was taller" -> もっと背が高かったらいいのに
  if((m=/^i wish (?:i|we) (could|was|were|had) (.+)$/i.exec(s))){const k=m[1].toLowerCase(),CMP={taller:"tall",shorter:"short",richer:"rich",smarter:"smart",younger:"young",stronger:"strong",thinner:"thin",prettier:"pretty",braver:"brave",happier:"happy"},cb=CMP[m[2].toLowerCase()];
    const r=any(k==="could"?"i can "+m[2]:k==="had"?"i have "+m[2]:"i am "+(cb||m[2])),p=r&&toPlain(r.chunks,true);
    if(p){const L=p[p.length-1];const p2=p[0]&&p[0][0]==="私"&&(p[1]||[])[0]==="は"?p.slice(2):p;return fin([...(cb?[C("もっと")]:[]),...p2.slice(0,-1),C(L[0]+"ら",L[1]!=null?L[1]+"ら":null),C("いい"),C("のに")],r.used,["… たらいいのに = I wish …"])}}
  // "I should have studied more" -> もっと勉強すればよかった ; "I shouldn't have eaten so much" -> あんなに食べなければよかった
  if((m=/^(i|we) should (not )?have ([a-z]+?)(?:ed|d|en)?( .*)?$/i.exec(s))){const w=m[3].toLowerCase(),cands=[IRR[w+"ed"]||IRR[w+"en"]||IRR[w]||w,w,w+"e",w.replace(/i$/,"y"),w.replace(/(.)\1$/,"$1")];let vp=null;const rest=(m[4]||"").trim(),mo=/^(.*?)\s*\b(more|so much|earlier|harder|that)$/i.exec(rest);
    for(const c of cands){vp=VP([c,mo?mo[1]:rest].join(" ").trim());if(vp)break}
    if(vp){const st=vstems(vp.v),ba=!m[2]&&baForm(vp.v);const ex=mo?{more:[C("もっと")],"so much":[C("あんなに")],earlier:[C("もっと"),C("早く","はやく")],harder:[C("もっと"),C("頑張って","がんばって")],that:[]}[mo[2].toLowerCase()]:[];
      if(m[2]&&st&&st.a)return fin([...ex,...dropMy(vp.pre),C(st.a[0]+"なければ",st.a[1]+"なければ"),C("よかった")],vp.used,["… なければよかった = I shouldn't have …"]);
      if(ba)return fin([...ex,...dropMy(vp.pre),C(ba[0],ba[1]),C("よかった")],vp.used,["… ばよかった = I should have …"])}}
  // "I regret not going" -> 行かなかったことを後悔しています
  if((m=/^i regret (not )?([a-z]+ing)( .*)?$/i.exec(s))){const w=m[2].toLowerCase().slice(0,-3);let vp=null;for(const c of [w,w+"e",w.replace(/(.)\1$/,"$1")]){vp=VP((c+(m[3]||"")).trim());if(vp)break}
    const st=vp&&vstems(vp.v);if(st){const t=vplain(vp.v,"ta"),neg2=m[1]&&st.a?[C(st.a[0]+"なかった",st.a[1]+"なかった")]:t;if(neg2)return fin([...dropMy(vp.pre),...neg2,C("こと"),C("を","お"),C("後悔","こうかい"),C("して"),C("います")],vp.used)}}
  // "I'm thinking about moving to Japan" -> 日本に引っ越そうかと思っています ; "I'm planning to travel" -> 旅行するつもりです
  if((m=/^(i|we) (?:am|are) (thinking about|thinking of|planning to|planning on) (.+)$/i.exec(s))){let x=m[3].replace(/^([a-z]+?)(?:ing)\b/i,(a,b)=>b);let vp=null;for(const c of [x,x.replace(/^(\w+)/,"$1e"),x.replace(/^(\w)(\1)/,"$1")]){vp=VP(c);if(vp&&!vp.past)break;vp=null}
    if(!vp)vp=VP(m[3]);if(vp){if(/thinking/i.test(m[2])){const vo=volit(vp.v);if(vo)return fin([...dropMy(vp.pre),C(vo[0],vo[1]),C("か"),C("と"),C("思って","おもって"),C("います")],vp.used,["… ようかと思っています = I'm thinking about …"])}
      else{const d=vplain(vp.v,"dict");if(d)return fin([...dropMy(vp.pre),...d,C("つもり"),C("です")],vp.used,["… つもりです = I plan to …"])}}}
  if((m=/^(?:i am not sure|i do not know|i wonder|i forgot|i can not remember|i do not remember|do you know|does anyone know|do you remember|can you tell me|could you tell me) (what time|where|when|why|how much|how many|how long|how|who|what|which) ((?:the|this|that|my|your|his|her|our) (?!means|is|are|was|were|does|did|do|costs?|says?|opens?|closes?|starts?)[a-z]+|it|he|she|they|we|you|i|the [a-z]+|this|that) (.+)$/i.exec(s))&&!(/tell me/i.test(s)&&/^when$/i.test(m[1]))){
    const sj=m[2],rest=m[3].split(" "),w0=rest[0].toLowerCase();let q2=null;
    if(/^(is|are|was|were|will|can|should)$/.test(w0))q2=m[1]+" "+w0+" "+sj+" "+rest.slice(1).join(" ");
    else{const ev=enVerb(w0);const base=ev.c.find(c=>window.PICKV&&window.PICKV[c]!=null||PREF.v[c])||ev.c[0];q2=m[1]+" "+(ev.past?"did":ev.s3?"does":"do")+" "+sj+" "+[base,...rest.slice(1)].join(" ")}
    const r=q2&&any(q2.trim()+"?");let p=r&&toPlain(r.chunks);if(p&&p.length>2&&/^(の|ん)$/.test(p[p.length-2][0])&&p[p.length-1][0]==="だ")p=p.slice(0,-2);if(p&&p.length>1&&p[p.length-1][0]==="だ")p=p.slice(0,-1);
    if(p&&/(can not|cannot|can't) remember/i.test(s)&&!/^(do you|does anyone|can you|could you)/i.test(s))return fin([...p,C("か"),C("思い出せません","おもいだせません")],r.used,r.notes||[]);
    if(p&&/^(do you know|does anyone know|do you remember|can you tell me|could you tell me)\b/i.test(s)){const k=/^(do you know|does anyone know)/i.test(s)?["知っています","しっています"]:/remember/i.test(s)?["覚えています","おぼえています"]:["教えてもらえます","おしえてもらえます"];return fin([...p,C("か"),C(k[0],k[1]),C("か")],r.used,r.notes||[])}
    if(p){const wish=/wonder/i.test(s),fg=/forgot|remember/i.test(s);return fin([...p,C("か"),C(wish?"気になります":fg?(/forgot/i.test(s)?"忘れました":"覚えていません"):"分かりません",wish?"きになります":fg?(/forgot/i.test(s)?"わすれました":"おぼえていません"):"わかりません")],r.used,r.notes||[])}}
  // "I'm not sure if I can come" -> 来られるかどうか分かりません
  if((m=/^(?:do you know|does anyone know) (?:if|whether) (.+?)\??$/i.exec(s))){const r=any(m[1]),p=r&&toPlain(r.chunks);if(p){const L=p[p.length-1],q2=L&&L[0]==="だ"?p.slice(0,-1):p;return fin([...q2,C("か"),C("どうか"),C("知っています","しっています"),C("か")],r.used,r.notes||[])}}
  if((m=/^(?:i am not sure|i do not know|i don't know|i wonder) (?:if|whether) (.+)$/i.exec(s))){const r=any(m[1]),p=r&&toPlain(r.chunks);if(p){const L=p[p.length-1],q2=L&&L[0]==="だ"?p.slice(0,-1):p;return fin([...q2,C("か"),C("どうか"),C(/wonder/i.test(s)?"気になります":"分かりません",/wonder/i.test(s)?"きになります":"わかりません")],r.used,r.notes||[])}}
  // "why is the sky blue?" -> どうして空は青いのですか
  if((m=/^why (is|are|was|were) (?!you\b)(.+)$/i.exec(s))){const ws2=m[2].split(" ");for(let i=1;i<ws2.length;i++){const sj=ws2.slice(0,i).join(" "),np=NP(sj);if(!np||np.pron&&!/^(he|she|it|this|that|they)$/i.test(sj))continue;
      const r=any(sj+" "+m[1]+" "+ws2.slice(i).join(" ")),p=r&&toPlain(r.chunks);if(p){const L=p[p.length-1];const q2=L&&L[0]==="だ"?[...p.slice(0,-1),C("な")]:p;return fin([C("どうして"),...q2,C("の"),C("ですか")],r.used,r.notes||[])}}}
  // "can dogs eat chocolate?" -> 犬はチョコレートを食べられますか
  if((m=/^can (?!i\b|we\b|you\b)(.+)$/i.exec(s))){const ws2=m[1].split(" ");for(let i=1;i<ws2.length&&i<=3;i++){const r=any(ws2.slice(0,i).join(" ")+" can "+ws2.slice(i).join(" ")),L=r&&r.chunks[r.chunks.length-1];
      if(L&&/ます$/.test(L[0]))return fin([...r.chunks,C("か")],r.used,r.notes||[])}}
  // "I'm too shy to talk to her" -> 恥ずかしくて彼女と話せません
  if((m=/^(i|we) (am|are|was|were) (?:way )?too (shy|tired|scared|busy|nervous|lazy|full|sleepy|embarrassed) to (.+)$/i.exec(s))){const k={shy:["恥ずかしくて","はずかしくて"],embarrassed:["恥ずかしくて","はずかしくて"],tired:["疲れていて","つかれていて"],scared:["怖くて","こわくて"],busy:["忙しくて","いそがしくて"],nervous:["緊張して","きんちょうして"],lazy:["面倒くさくて","めんどうくさくて"],full:["お腹がいっぱいで","おなかがいっぱいで"],sleepy:["眠くて","ねむくて"]}[m[3].toLowerCase()];
    const vp=VP(m[4]),e=vp&&!vp.past&&vend(vp.v,/^(was|were)$/i.test(m[2])?"potnegpast":"potneg");if(e){let pre=dropMy(vp.pre);const oi=pre.map(c=>c[0]).lastIndexOf("を");if(oi>=0)pre=[...pre.slice(0,oi),C("が"),...pre.slice(oi+1)];return fin([C(k[0],k[1]),...pre,...e],vp.used)}}
  // "why are you sad?" -> どうして悲しいのですか
  if((m=/^why (?:are|were) you (.+)$/i.exec(s))){const r=any("i "+(/^why were/i.test(s)?"was":"am")+" "+m[1]),p=r&&toPlain(r.chunks);if(p)return fin([C("どうして"),...p,C("の"),C("ですか")],r.used,r.notes||[])}
  // "I was going to call you" -> 電話するつもりでした
  if((m=/^(i|we) (?:was|were) going to (.+)$/i.exec(s))){const vp=VP(m[2]),d=vp&&!vp.past&&!vp.ing&&vplain(vp.v,"dict");if(d)return fin([...dropMy(vp.pre),...d,C("つもり"),C("でした")],vp.used,["… つもりでした = I was going to …"])}
  // "I'm sorry I broke your cup" -> あなたのコップを割ってすみません
  if((m=/^(?:i am |i'm )?(?:so |really |very )?sorry (?:that |for )?(i .+)$/i.exec(s))){const r=any(m[1]),te=r&&toTe(r.chunks);if(te)return fin([...te,C("すみません")],r.used,r.notes||[])}
  // "it might rain later" -> 後で雨が降るかもしれません
  if((m=/^(.+?) (?:might|may) (not )?(.+)$/i.exec(s))&&!/^(i|we|can|could)$/i.test(m[1])||(m=/^(i|we) might (not )?(.+)$/i.exec(s))){
    const r=any(m[1]+" will "+(m[2]?"not ":"")+m[3]),p=r&&toPlain(r.chunks);if(p)return fin([...p,C("かも"),C("しれません")],r.used,[...(r.notes||[]),"… かもしれません = might …"])}
  // "if it rains tomorrow I will stay home" / "when I get home, I'll call you"
  if((m=/^(if|when|after|before|because|since|once|as soon as) (.+)$/i.exec(s))){
    const k=m[1].toLowerCase()==="as soon as"?"assoon":m[1].toLowerCase(),ws=m[2].replace(/,/g," ,").split(" ");
    {const ci=m[2].indexOf(",");if(ci>0){const a=m[2].slice(0,ci).trim(),b=m[2].slice(ci+1).trim().replace(/^then /i,"");const ra=sub(a),rb=ra&&last(b);if(rb){const j=join(k,ra,rb,true);if(j)return fin(j,[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])])}}}
    for(let i=1;i<ws.length;i++){
      const a=ws.slice(0,i).join(" ").replace(/ ,$/,""),b=ws.slice(i).join(" ").replace(/^, /,"").replace(/^then /i,"");
      if(!b||!PRO.test(b)&&!(PREF.v[b.split(" ")[0].toLowerCase()]||window.PICKV&&window.PICKV[b.split(" ")[0].toLowerCase()]!=null))continue;
      if(/^((this|next|last) (weekend|week|month|year|morning|evening|afternoon|summer|winter|spring|fall)|today|tomorrow|tonight|yesterday|later|now)\b/i.test(b))continue;
      const ra=sub(a),rb=ra&&last(b);if(!rb)continue;
      const j=join(k,ra,rb,true);if(j)return fin(j,[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])])}
  }
  // "A and B", "A but B", "A because B", "A so B"
  const ws=s.replace(/,/g," ,").split(" ");
  // "A because B and then C": the sentence splits at "and then" / "so" first, so B stays the reason for A only
  const ORDER=[...Array(Math.max(ws.length-2,0)).keys()].map(x=>x+1);
  if(/\b(because|since|cause)\b/i.test(s))ORDER.sort((x,y)=>{const pr=i=>{const w=ws[i].toLowerCase();return w==="and"&&/^then$/i.test(ws[i+1]||"")||w==="so"||w==="then"&&!/^and$/i.test(ws[i-1]||"")?0:1};return pr(x)-pr(y)||x-y});
  for(const i of ORDER){
    const w=ws[i].toLowerCase();let n=1;
    if(/^as$/i.test(w)&&/^soon$/i.test(ws[i+1]||"")&&/^as$/i.test(ws[i+2]||"")){const a=ws.slice(0,i).join(" ").replace(/ ,$/,"").trim(),b=ws.slice(i+3).join(" ").replace(/^, ?/,"").trim();const ra=a&&any(a),rb=ra&&b&&sub(b);const j=rb&&join("assoon",ra,rb,false);if(j)return fin(j,[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])]);continue}
    if(!/^(and|but|because|cause|so|then|if|when|after|before|until|since|while)$/.test(w))continue;
    if(w==="when"&&/^(is|are|was|were|does|do|did|will|can|should)\b/i.test(ws[i+1]||""))continue;
    if(w==="and"&&/^then$/i.test(ws[i+1]||""))n=2;
    const a=ws.slice(0,i).join(" ").replace(/ ,$/,"").trim();let b=ws.slice(i+n).join(" ").replace(/^, ?/,"").trim();
    if(!a||!b)continue;if(/ ,/.test(a)&&/^(i am sorry|i'm sorry|sorry|excuse me|yes|no|well|oh|okay|ok|hey|thanks|thank you)\b/i.test(a))continue;
    let hon=false;if(/^(honestly|frankly|to be honest|tbh),? /i.test(b)){b=b.replace(/^(honestly|frankly|to be honest|tbh),? /i,"");hon=true}
    let sore=false;if(w==="but"&&/^(i|we|he|she|they|my \w+) still (\w+ed|failed|lost|forgot|missed|got|went|came|did|was|were|had)\b/i.test(b)){b=b.replace(/ still /i," ");sore=true}
    if(!PRO.test(b)||!isQ&&/^(did |does |do (?!not\b))/i.test(b)){const sj=subjOf(a);if(!sj)continue;b=sj+" "+b}   // "I fought a bear and won": I won
    const ra=any(a);if(!ra)continue;let rb=/^(if|when|after|before|until|because|since|while)$/.test(w)?sub(b+(isQ?"?":"")):last(b);
    if(!rb&&/^(and|but|so|then)$/.test(w)&&/^(gave|took|went|made|bought|said|told|showed|brought|helped|found|called|sent|left|came|got|ate|drank|is|was|has|had|can|will|always|never|started|stopped|asked|cooked|fell|broke|lost|forgot)\b/i.test(b)){const sm=/^((?:the|my|our|your|his|her|their|this|that) [a-z]+|i|we|you|he|she|they|it|[A-Z][a-z]+)\b/i.exec(a);if(sm&&!/^(and|but|so|then|if|when)$/i.test(sm[1]))rb=last(sm[1]+" "+b)}
    if(!rb)continue;
    if(ra.used.some(u=>/(^|,)ani(,|$)/.test(u.pos||""))){const k=rb.chunks.findIndex((c,i)=>/^(彼|彼女)$/.test(c[0])&&/^(が|を)$/.test((rb.chunks[i+1]||[])[0]||""));if(k>=0)rb={...rb,chunks:[...rb.chunks.slice(0,k),...rb.chunks.slice(k+2)]}}
    if(sore)rb={...rb,chunks:[C("それでも"),...rb.chunks]};
    if(hon)rb={...rb,chunks:[C("正直","しょうじき"),CM,...rb.chunks]};
    if(/\b(read|put|cut|hit|let|set|shut|quit|hurt|cost)\b/i.test(b)&&/^(and|then)$/.test(w)&&/(ました|でした)$/.test((ra.chunks[ra.chunks.length-1]||[""])[0])&&/ます$/.test((rb.chunks[rb.chunks.length-1]||[""])[0]))rb={...rb,chunks:[...rb.chunks.slice(0,-1),C(rb.chunks[rb.chunks.length-1][0].replace(/ます$/,"ました"),(rb.chunks[rb.chunks.length-1][1]||"").replace(/ます$/,"ました")||null)]};
    const j=join(w==="cause"?"because":n===2?"then":w,ra,rb,false);if(j)return fin(j,[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])]);
  }
  if(!/,/.test(s)&&depth===0){const ws2=s.split(" ");for(let i=2;i<ws2.length-1;i++){if(!/^(can|could|would|will|do|does|is|are|where|what|how|why|when|who|please|let's|lets)$/i.test(ws2[i]))continue;if(/^(can|could|would|will|do|does|is|are)$/i.test(ws2[i])&&!/^(you|i|we|he|she|it|they|this|that|there)$/i.test(ws2[i+1]||""))continue;
     const a=ws2.slice(0,i).join(" "),b=ws2.slice(i).join(" ");let ra=null,rb=null;try{ra=compose1(a)}catch(e){}if(!ra)continue;try{rb=compose1(b+(isQ||/^(can|could|would|will|do|does|is|are|where|what|how|why|when|who)$/i.test(ws2[i])?"?":""))}catch(e){}if(!rb)continue;
     return fin([...ra.chunks,["。",null,"."],...rb.chunks],[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])])}}
  // two sentences with a comma: "I'm hungry, let's eat" -> お腹が空きました。食べましょう
  {const cm=s.split(/, ?/);const cj=cm.length===2&&/^(so|but|and|because|then)\s+/i.exec(cm[1]);if(cj){const k=cj[1].toLowerCase(),ra=any(cm[0]),rb=ra&&last(cm[1].slice(cj[0].length));const j=rb&&join(k,ra,rb,false);if(j)return fin(j,[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])])}}
  {const cm=s.split(/, ?/);if(cm.length===2&&cm[1].split(" ").length>=2&&(cm[0].split(" ").length>=2||window.PICKV&&window.PICKV[cm[0].toLowerCase()]!=null||PREF.v[cm[0].toLowerCase()])){const ra=cm[0].split(" ").length>=2?any(cm[0]):any("please "+cm[0]),rb=ra&&last(cm[1]);if(rb)return fin([...ra.chunks,["。",null,"."],...rb.chunks],[...ra.used,...rb.used],[...(ra.notes||[]),...(rb.notes||[])])}}
  return null;
}
const WA0=C("は","わ");
// "it was cold" -> 寒くて ; "it was quiet" -> 静かで
// "study" -> 勉強すれば ; "eat" -> 食べれば ; "go" -> 行けば
function baForm(w){const s=vstems(w);if(!s)return null;const p=w.pos||"",jp=w.jp,k=w.kana;
  if(s.suru)return[jp+"すれば",k+"すれば"];if(/vs-i/.test(p))return[jp.slice(0,-2)+"すれば",k.slice(0,-2)+"すれば"];
  if(/(^|,)vk/.test(p))return[jp.slice(0,-2)+(jp.endsWith("来る")?"来れば":"くれば"),k.slice(0,-2)+"くれば"];
  if(/(^|,)v1/.test(p))return[s.i[0]+"れば",s.i[1]+"れば"];
  const L=jp.slice(-1);if(!ROW[L]||k.slice(-1)!==L)return null;return[jp.slice(0,-1)+ROW[L][3]+"ば",k.slice(0,-1)+ROW[L][3]+"ば"]}
function adjTe(ch){const n=ch.length,L=ch[n-1];if(!L)return null;
  if(/^(です|でした)$/.test(L[0])){const X=ch[n-2];if(!X)return null;const h=ch.slice(0,n-2),k=X[1];
    if(/よかった$|いい$/.test(X[0]))return[...h,C(X[0].replace(/(よかった|いい)$/,"よくて"),k&&k.replace(/(よかった|いい)$/,"よくて"))];
    if(/かった$/.test(X[0]))return[...h,C(X[0].slice(0,-3)+"くて",k&&k.slice(0,-3)+"くて")];
    if(/い$/.test(X[0])&&!/(きれい|嫌い|有名|綺麗)$/.test(X[0]))return[...h,C(X[0].slice(0,-1)+"くて",k&&k.slice(0,-1)+"くて")];
    return[...h,X,C("で")]}
  return toTe(ch)}
function join(k,ra,rb,lead){   // lead: the joining word came first ("if A, B")
  let A=ra.chunks,B=rb.chunks,p;
  if(!lead&&/^(when|if|after|before|once)$/.test(k)&&A[1]&&A[1][0]==="は"&&B[0]&&/^(彼|彼女|彼ら)$/.test(B[0][0])&&(B[1]||[])[0]==="は"&&A[0][0]!==B[0][0]){const j=join(k,{chunks:A.slice(2)},{chunks:B.slice(2)},lead);return j?[...A.slice(0,2),...j]:null}
  {const TW=/^(今日|明日|昨日|今朝|今夜|来週|先週|今週末|来月|来年|先月|去年)$/,dropWa=X=>X[0]&&TW.test(X[0][0])&&(X[1]||[])[0]==="は"?[X[0],...X.slice(2)]:X;
   if(/^(when|after|before|if|once|because|since|until)$/.test(k)){if(lead)A=dropWa(A);else B=dropWa(B)}}
  // the same person in both parts is said once: 彼女はそれを開けた時、泣きました
  if(k==="so"&&A[0]&&B[0]&&A[0][0]===B[0][0]&&/^(は|が)$/.test((A[1]||[])[0]||"")&&/^(は|が)$/.test((B[1]||[])[0]||""))B=B.slice(2);
  if((k==="and"||k==="but")&&A[1]&&(A[1][0]==="は"||A[1][0]==="が")&&B[0]&&/^(彼|彼女|彼ら)$/.test(B[0][0])&&(B[1]||[])[0]==="は")B=B.slice(2);
  else if((k==="and"||k==="but")&&A[1]&&(A[1][0]==="は"||A[1][0]==="が")&&B[0]&&B[0][0]===A[0][0]&&/^(は|が)$/.test((B[1]||[])[0]||""))B=B.slice(2);
  if(k==="but"&&A[0]&&B[0]&&A[0][0]===B[0][0]&&/^(彼|彼女|彼ら)$/.test(A[0][0])&&(A[1]||[])[0]==="は"&&(B[1]||[])[0]==="は")B=B.slice(2);
  if(/^(when|after|before|if|because|since)$/.test(k)&&A[0]&&B[0]&&A[0][0]===B[0][0]&&A[0][1]!=null&&(A[1]||[])[0]==="は"&&(B[1]||[])[0]==="は")B=B.slice(2);
  {const ga=X=>{const i=X.findIndex((c,j)=>j<=3&&c[0]==="は");return i>=1&&!/^(今日|明日|昨日|今朝|今夜|今週末|来週|先週|週末|今)$/.test((X[i-1]||[])[0])?[...X.slice(0,i),C("が"),...X.slice(i+1)]:X};
   if(/^(when|if|after|before|once|because|since|while)$/.test(k)){if(lead)A=ga(A);else B=ga(B)}}
  switch(k){
    case"and":{
      // a coming event and how I feel about it: 来月姉が結婚するので、とても緊張しています
      {const en=(ra&&ra.en)||"",bl=B.map(c=>c[0]).join("");if(/(緊張|楽しみ|不安|心配|わくわく|ドキドキ|嬉しい|うれしい|寂しい|さびしい|怖い|こわい)/.test(bl)&&/ます$/.test((A[A.length-1]||[""])[0])&&/\b(next|tomorrow|tonight|soon|will|'ll|going to|getting|this weekend|later)\b/i.test(en)){let A2=A;if(A2[0]&&/^(今日|明日|今夜|来週|今週末|来月|来年|週末)$/.test(A2[0][0])&&(A2[1]||[])[0]==="は")A2=[A2[0],...A2.slice(2)];const d=toPlain(A2);if(d)return[...d,C("ので"),CM,...B]}}
      const te=toTe(A);return te?[...te,CM,...B]:[...A,["。",null,"."],C("そして"),CM,...B]}
    case"then":{const te=toTe(A);return te?[...te,CM,C("それから"),...B]:[...A,["。",null,"."],C("それから"),CM,...B]}
    case"but":{if(A.length<=2&&/^(すみません|ごめんなさい|ごめん|申し訳ありません)$/.test(A[A.length-1][0]))return[...A,CM,...B];if(B[0]&&/^(今日|昨日|明日|今|今朝|今夜|今週|今年|今回|最近)$/.test(B[0][0])&&!/^(は|の|から|まで)$/.test((B[1]||[])[0]||""))B=[B[0],C("は","わ"),...B.slice(1)];return[...A,C("けど"),CM,...B]}
    case"since":{const M=lead?B:A,S0=lead?A:B,ml=M[M.length-1],mp=M[M.length-2],sl=S0[S0.length-1];
      if(ml&&mp&&/^(いません|います)$/.test(ml[0])&&/(て|で)$/.test(mp[0])&&sl&&/ました$/.test(sl[0])){const te=toTe(S0);if(te)return[...te,C("から"),CM,...M]}}
    case"because":if(lead){p=toPlain(A);return p?[...p,C("から"),CM,...B]:null}p=toPlain(B);return p?[...p,C("から"),CM,...A]:null;
    case"so":p=toPlain(A);return p?[...p,C("から"),CM,...B]:null;
    case"if":case"once":if(lead){p=toPlain(A,true);if(p&&p.length>=2&&p[p.length-2][0]==="晴れ"&&p[p.length-1][0]==="だった")p=[...p.slice(0,-2),C("晴れた","はれた")];return p?[...p.slice(0,-1),C(p[p.length-1][0]+"ら",p[p.length-1][1]!=null?p[p.length-1][1]+"ら":null),CM,...B]:null}
      p=toPlain(B,true);return p?[...p.slice(0,-1),C(p[p.length-1][0]+"ら",p[p.length-1][1]!=null?p[p.length-1][1]+"ら":null),CM,...A]:null;
    case"when":{const X=lead?A:B,Y=lead?B:A,yp=/(ました|でした)$/.test((Y[Y.length-1]||[""])[0]);
      {const en=((ra&&ra.en)||"")+" "+((rb&&rb.en)||"");   // a general truth / habit, both in the plain present: 雷が鳴ると、犬は怖がります
       if(!yp&&/(ます|ません)$/.test((Y[Y.length-1]||[""])[0])&&/ます$/.test((X[X.length-1]||[""])[0])&&!/\b(will|'ll|going to|gonna|tomorrow|tonight|later|next|soon|want|wanna|need|have to|can|could)\b/i.test(en)&&/\b[a-z]+s\b/i.test(en.replace(/\b(is|was|this|his|its|has|does|always|sometimes|days|weekends|nights|mornings|evenings)\b/gi,""))){const d=toPlain(X);if(d)return[...d,C("と"),CM,...Y]}}
      if(!yp&&Y.length>=2&&(Y[Y.length-1]||[])[0]==="です"&&/い$/.test((Y[Y.length-2]||[""])[0])&&!/(たい|ない|ほしい)$/.test((Y[Y.length-2]||[""])[0])&&/ます$/.test((X[X.length-1]||[""])[0])){const d=toPlain(X);if(d)return[...d,C("と"),...Y]}
      if(!yp&&Y.some(c=>/^(いつも|毎日|毎朝|毎晩|普段|必ず)$/.test(c[0]))&&/ます$/.test((Y[Y.length-1]||[""])[0])&&/ます$/.test((X[X.length-1]||[""])[0])){const d=toPlain(X);if(d)return[...d,C("と"),CM,...Y]}
      if(/たい$/.test((Y[Y.length-2]||[""])[0])&&(Y[Y.length-1]||[])[0]==="です"&&/(いる|ている)$/.test((toPlain(X)||[[""]]).slice(-1)[0][0])){const d=toPlain(X);return[...d,C("時","とき"),C("に"),CM,...Y]}
      p=toPlain(X,true);if(!p)return null;
      return yp?[...p,C("時","とき"),CM,...Y]:[...p.slice(0,-1),C(p[p.length-1][0]+"ら",p[p.length-1][1]!=null?p[p.length-1][1]+"ら":null),CM,...Y]}
    case"after":{const X=lead?A:B,Y=lead?B:A;p=toPlain(X,true);return p?[...p,C("後","あと"),C("で"),CM,...Y]:null}
    case"before":{const X=lead?A:B,Y=lead?B:A;p=toPlain(X,false);return p?[...p,C("前","まえ"),C("に"),CM,...Y]:null}
    case"until":{p=toPlain(B,false);return p?[...p,C("まで"),CM,...A]:null}
    case"assoon":{const X=lead?A:B,Y=lead?B:A,yp=/(ました|でした)$/.test((Y[Y.length-1]||[""])[0]);p=toPlain(X,true);if(!p)return null;
      return yp?[...p,C("途端","とたん"),C("に"),CM,...Y]:[...p.slice(0,-1),C(p[p.length-1][0]+"ら",p[p.length-1][1]!=null?p[p.length-1][1]+"ら":null),C("すぐ"),CM,...Y]}
    case"while":{const X=lead?A:B,Y=lead?B:A;p=toPlain(X,/(ました|でした)$/.test((Y[Y.length-1]||[""])[0]));return p?[...p,C("時","とき"),C("に"),CM,...Y]:null}
  }
  return null;
}
function composeHTML(q,fixedOnly,part){
  let r=null;try{r=part?partial(q):compose(q)}catch(e){r=null}
  if(!r||fixedOnly&&!r.fixed)return null;
  const jp=r.chunks.map(c=>c[0]).join(""),rom=r.chunks.map(c=>c[2]!=null?c[2]:c[1]==null?c[0]:romaji(c[1]));
  if(rom.some(x=>x==null))return null;
  fillHTML.last=jp;fillHTML.used=r.used.map(u=>u.jp);
  const seen=new Set(),used=r.used.filter(u=>!seen.has(u.jp)&&seen.add(u.jp)).map(u=>`<span lang="ja">${esc(u.jp)}</span>${u.kana?" ("+esc(romaji(u.kana)||"")+")":""} = ${esc(short(u.en,70))}${tone(u)}`).join("<br>");
  return`<div class="card dict"><div class="where">${r.dropped?`Built from most of your sentence: I left out “${esc(r.dropped)}” because I couldn't fit it in naturally · not checked by a person`:"Built by the app: grammar rules + words from the cards and dictionary · the whole sentence was not checked by a person"}</div>${ttsBlock(jp,rom.join(" "),(()=>{const a=r.chunks.map(c=>c[2]!=null?c[2]:c[1]==null?c[0]:sayWord(c[1]));return a.some(x=>x==null)?"":a.join(" ")})())}<div class="en">${esc(r.en)}</div><div class="note">Words used (check they mean what you want):<br>${used}</div>${r.notes.map(n=>`<div class="note">${esc(n)}</div>`).join("")}<div class="tags"><span>built sentence</span></div></div>`;
}
// When no sentence could be built: every important word on its own, to point at or say one by one.
function wordsHTML(q){
  wix();if(!JPX)return"";
  const ws=[...new Set(words(q.replace(/’/g,"'")).filter(w=>!QSTOP.has(w)&&!/^(is|are|was|were|am|not|very|really|and|or|but|with|from|have|has|will|hello|hi|there|here|they|them|he|she|we|on|at|by|if|so|just)$/.test(w)&&w.length>=2&&/^[a-z']+$/.test(w)))].slice(0,6);
  let rows="",n=0;const seen=new Set();
  for(let i=0;i<ws.length;i++){
    let w=ws[i],x=null;
    // two words that are one thing ("vending machine") when a card or the everyday list knows them
    if(ws[i+1]){const two=w+" "+ws[i+1],t=findNoun(two);if(t){x=t;w=two;i++}}
    const ev=enVerb(w);
    if(!x)x=findNoun(w)||word(w,"adj",{thing:true})||supl(w,{thing:true});
    if(!x)for(const c of ev.c){if(VBLOCK.has(c))continue;x=word(c,"v");if(x)break}
    if(x&&x.kind==="dictionary"){const first=gkey((x.en||"").split(/[\/;]/)[0]);if(first!==gkey(w)&&first!==gkey(w).replace(/s$/,"")&&first!==ev.c[0])x=null}   // "even" -> 水平 (level): wrong sense, skip
    if(!x||seen.has(x.jp))continue;seen.add(x.jp);
    const r=x.kana?romaji(x.kana):null;if(!r)continue;
    rows+=`<div class="sub"><div class="label">${esc(w)}</div>${ttsBlock(x.jp,r,sayWord(x.kana)||"")}<div>${esc(short(x.en,70))}${tone(x)}</div></div>`;n++;
  }
  return n>=1?`<div class="card dict"><div class="where">${ws.length===1&&n===1?"Word":"Word by word · I couldn't build this as one sentence, so here is each word"}</div>${rows}<div class="tags"><span>words</span></div></div>`:"";
}

const SYSTEM=`You are the helper inside "Pocket Japanese", an offline phrasebook for an English-speaking traveller in Japan who cannot read Japanese.
Each message gives you PHRASEBOOK ENTRIES (checked by humans, always correct) and a QUESTION.

Reply using ONLY these four kinds of lines:
CARD <number>
FILL <letter> <English word>
SAY <Japanese sentence> = <English meaning>
NOTE <one or two short English sentences>

How to choose:
- If an entry already says what the user wants, reply with CARD and its number. This is always the best answer. Use at most 3 CARD lines, best first.
- Check who is speaking: some entries are what YOU say, others are replies to someone else (read the English and the note). Pick the one that fits the user's situation.
- Entries marked "dictionary word" are single words, not phrases.
- NOTE lines must be in English.
- If no entry says it but a SENTENCE PATTERN below fits, use FILL. It is safer than SAY.
- Write a SAY line only when no entry says it and no pattern fits. Make one short, natural, polite sentence (desu/masu style) the way a Japanese person would really say it. Use the words from the entries when they fit. Write it in normal Japanese script only.
- Add a NOTE line when a tip helps (when to use it, politeness, a warning).

Strict rules:
- Never write romaji or pronunciation. The app adds that itself.
- Never invent or guess a Japanese word. If you are not sure of a word or of the sentence, do not write SAY. Write: NOTE I'm not sure how to say that.
- Do not copy an entry into a SAY line. Use CARD for entries.
- If the question is not about Japanese or travelling in Japan, write: NOTE I can only help with Japanese.
- Keep it short: at most 4 lines in total. Never repeat a line.
- No greetings, no extra text, nothing outside the four line types.

${FILL_RULES}`;

// ---------- page furniture ----------
const css=document.createElement("style");
css.textContent=`#tabs{display:flex;gap:8px;margin:0 0 10px}
#tabs button{flex:1;font:inherit;font-size:15px;min-height:44px;padding:8px 0;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--mute)}
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
tabs.innerHTML=`<button data-t="search" class="on">Search</button><button data-t="ask">Ask</button>`;
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
// Optional online helper: Google Gemini with the user's own API key.
let busy=false,tok=null,tokP=null;
let showSettings=false,gList=null;
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
function loadTokenizer(){
  return new Promise((ok,no)=>{
    const s=document.createElement("script");s.src="ai/kuromoji.js";
    s.onload=()=>window.kuromoji.builder({dicPath:"ai/dict/"}).build((err,t)=>err?no(err):ok(t));
    s.onerror=()=>no(new Error("word checker failed to load"));
    document.head.appendChild(s)});
}
const ensureTok=()=>tokP=tokP||loadTokenizer().then(t=>{tok=t}).catch(()=>{tokP=null});
const usable=()=>true;   // works with no AI at all (cards + pattern builder); AI adds to it
function drawPanel(){
  const key=gKey();
  let h=`<div class="aimeta">I take the words and sentences in this app and put together the closest match to your question. No AI and no internet needed. <a href="#" id="aiset">${showSettings?"hide options":key?"online AI: on":"options"}</a></div>`;
  if(showSettings){
    h+=`<div class="card"><div class="en">Optional: online AI</div>
<div class="note">For sentences the app can't build by itself, it can ask Google's Gemini over the internet. Those answers are marked “AI-made”.<br>
It needs your own API key, free from <b>aistudio.google.com/apikey</b>. The key is saved on this device only. Your questions are sent to Google.</div>`;
    if(key){
      const list=gList||[gModel()];
      h+=`<div class="note">Key saved. Model: <select id="gmodel">${list.map(m=>`<option${m===gModel()?" selected":""}>${esc(m)}</option>`).join("")}</select></div>
<div style="margin-top:10px"><button class="aibtn plain" id="gdel">Remove key</button></div>`;
    }else h+=`<div style="margin-top:10px;display:flex;gap:8px"><input id="gkey" type="password" placeholder="Paste your Gemini API key" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="aibtn" id="gsave">Save</button></div>`;
    h+=`<div class="note" id="gmsg"></div></div>`;
  }
  panel.innerHTML=h;
  const $=id=>panel.querySelector("#"+id),click=(id,f)=>{const el=$(id);if(el)el.onclick=ev=>{ev.preventDefault();f()}};
  click("aiset",()=>{showSettings=!showSettings;drawPanel()});
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
  if(usable()){if(gKey())ensureTok();   // the analyzer is only needed to check an online AI's sentences
    if(!log.innerHTML)log.innerHTML=`<div class="ainote">Type what you want to say, for example:<br>• this wall is scary<br>• where can I buy a ticket?<br>• I want to eat ramen<br>• what do I say when I bump into someone?</div>`}
}
function openAsk(){drawPanel();cleanOld();if(usable())aq.focus()}
// earlier versions could download an on-device AI model: remove anything it left behind
let cleaned=false;
async function cleanOld(){
  if(cleaned)return;cleaned=true;LS.set("pj-ai-model",null);
  try{for(const k of await caches.keys())if(k.startsWith("webllm"))await caches.delete(k)}catch(e){}
  try{if(indexedDB.databases)for(const d of await indexedDB.databases())if(/webllm/i.test(d.name||""))indexedDB.deleteDatabase(d.name)}catch(e){}
}

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
// "Say it like" guide (koh-nee-chee-wah) for one spoken word in kana.
// Same rules as tools/kana.py say_word, which makes the guides on the hand-written cards.
function sayWord(k){
  k=hira(k);const m=[];
  for(let i=0;i<k.length;i++){
    const c=k[i],n=k[i+1];
    if(c==="っ"){m.push("Q");continue}
    if(c==="ん"){m.push("N");continue}
    if(c==="ー"){const p=[...m].reverse().find(x=>/[aiueo]$/.test(x));if(!p)return null;m.push(p.slice(-1));continue}
    if(n&&Y[n]&&R[c]&&/i$/.test(R[c])&&c!=="い"){const b=R[c];m.push((/^(sh|ch|j)/.test(b)?b.slice(0,-1):b.slice(0,-1)+"y")+Y[n]);i++;continue}
    if(n&&"ぁぃぅぇぉ".includes(n)&&(c==="ふ"||c==="て"||c==="で"||c==="う"||c==="ゔ")){m.push(({ふ:"f",て:"t",で:"d",う:"w",ゔ:"v"})[c]+R[n]);i++;continue}
    if(R[c]==null)return null;
    m.push(R[c]);
  }
  const SAY={a:"ah",i:"ee",u:"oo",e:"eh",o:"oh"},close=s=>s.endsWith("eh")?s.slice(0,-1):s,syl=[];
  for(let i=0;i<m.length;){
    const t=m[i],nx=m[i+1]||"";
    if(t==="Q"){if(syl.length&&nx&&nx!=="Q"&&nx!=="N")syl[syl.length-1]=close(syl[syl.length-1])+(/^(ch|ts)/.test(nx)?"t":/^sh/.test(nx)?"sh":nx[0]);i++;continue}
    if(t==="N"){if(syl.length)syl[syl.length-1]=close(syl[syl.length-1])+"n";else syl.push("n");i++;continue}
    const v=t.slice(-1),c=t.slice(0,-1),nv=/^[aiueo]$/.test(nx)?nx:"";
    if((t==="de"||t==="ma")&&nx==="su"&&i+2===m.length){syl.push(t==="de"?"dess":"mahss");i+=2;continue}
    if((t==="de"||t==="ma")&&nx==="shi"&&m[i+2]==="ta"){syl.push(t==="de"?"desh":"mahsh","tah");i+=3;continue}
    if(nv){const p=v+nv;
      if(["aa","ii","uu","ee","oo","ou"].includes(p)){syl.push(c+SAY[v]);i+=2;continue}
      if(p==="ei"){syl.push(c+"ay");i+=2;continue}
      if(p==="ai"){syl.push(c+"ai");i+=2;continue}
      if(p==="oi"){syl.push(c+"oy");i+=2;continue}
    }
    syl.push(c+SAY[v]);i++;
  }
  return syl.join("-");
}
const sayAll=kanas=>{const a=kanas.map(k=>k==null?null:sayWord(k));return a.some(x=>x==null)?"":a.join(" ")};
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
  return{jp:jp.replace(/。$/,""),romaji:rom.join(" "),say:sayAll(grp),warn};
}

// ---------- chat ----------
function render(text,items,allowSay,already){
  let html="",shown=0,cards=0,notes=0,says=0,bads=0;const usedJP=new Set(already||[]),seenLine=new Set();
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
    if((m=/^FILL\s*[:\-]?\s*[\[(]?([A-Za-z])[\])]?[\s,:\-]+(.+)$/i.exec(line))){
      const f=says<2?fillHTML(m[1],m[2]):null;
      if(f&&!usedJP.has(fillHTML.last)){usedJP.add(fillHTML.last);says++;shown++;html+=f}
      continue;
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
    html+=`<div class="card dict"><div class="where">AI-made sentence · every word was checked against the dictionary, but no person has checked the sentence</div>${ttsBlock(c.jp,c.romaji,c.say||"")}<div class="en">${esc(en)}</div>${c.warn.length?`<div class="note">Not in the dictionary (probably a name or borrowed word): ${esc(c.warn.join(", "))}</div>`:""}<div class="tags"><span class="careful">AI-made</span></div></div>`;
    shown++;
  }
  if(!shown)html=`<div class="ainote">I'm not sure how to help with that one. Try the Search tab, or ask in different words.</div>`;
  return html;
}
const xnorm=t=>t.toLowerCase().replace(/’/g,"'").replace(/\((?:i|you|we|it)\)/g," ").replace(/\b(it|that|this|he|she|there|what|where)'s\b/g,"$1 is").replace(/\bi'm\b/g,"i am").replace(/n't\b/g," not").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
function exactSent(q){
  const k=xnorm(cleanQ(q));
  if(!k)return null;
  return sentIndex().find(s=>s.b.en.split(" / ").some(p=>!/^\(.*\)$/.test(p.trim())&&!/___/.test(p)&&xnorm(p)===k))||null;
}
async function send(q0){
  if(busy||!q0.trim())return;const q=(typeof normEn==="function"?normEn(q0):q0)||q0;
  busy=true;aq.value="";
  log.innerHTML="";
  const you=document.createElement("div");you.className="you";you.textContent=q0;log.appendChild(you);
  const out=document.createElement("div");out.innerHTML=`<div class="ainote dots">Looking it up</div>`;log.appendChild(out);
  you.scrollIntoView({block:"start",behavior:"smooth"});
  try{
    const core=quoted(q);   // text in quotes is the whole sentence to look for
    const items=retrieve(core||q);
    const ctx=items.length?items.map(itemText).join("\n"):"(no matching entries)";
    const msgs=[{role:"system",content:SYSTEM}];
    msgs.push({role:"user",content:`PHRASEBOOK ENTRIES:\n${ctx}\n\nQUESTION: ${q}`});
    // the word checker is needed to build sentences: wait for it (it loads once, in a few seconds)
    if(!window.DICT){out.innerHTML=`<div class="ainote dots">Getting ready</div>`;await Promise.race([lexWait(),new Promise(r=>setTimeout(r,25000))])}
    if(gKey()&&!tok)await Promise.race([ensureTok(),new Promise(r=>setTimeout(r,8000))]);
    const noTok=!window.DICT?`<div class="ainote">The sentence builder could not load, so I can only show cards for now. Close and reopen the app to try again.</div>`:"";
    fillHTML.last=null;fillHTML.used=null;
    // a hand-written sentence that says exactly this wins over anything built
    const same=exactSent(q);
    const longQ=q.trim().split(/\s+/).length>9||/\b(need|needs|needed|have|has|had) to\b/i.test(q);
    let built=same?"":(composeHTML(q,true)||(longQ?"":ruleFill(q))||composeHTML(q)||composeHTML(q,false,true)||"");
    const already=built&&fillHTML.last?[fillHTML.last]:[];
    if(same)built=`<div class="aimeta">A hand-written card says exactly this:</div>`+(same.main?"":`<div class="aimeta">Found on this card: <b lang="ja">${esc(same.b.jp)}</b> = ${esc(same.b.en)}</div>`)+cardHTML(same.x.e,same.x.where);
    if(built&&gKey())out.innerHTML=built+`<div class="ainote dots">Checking for more</div>`;
    let text=null,by="",gErr=null;
    if(gKey()){
      if(navigator.onLine===false)gErr=new Error("offline");
      else try{text=await gAsk(msgs);by="Gemini ("+gModel()+")"}catch(e){gErr=e}
    }
    if(text==null){
      const skip=same?same.x.e.jp:null;
      const uw=built&&fillHTML.used?fillHTML.used.filter(Boolean).map(w=>w.length>=3&&/[いるうくぐすつぬぶむ]$/.test(w)?w.slice(0,-1):w):null;   // 食べる -> 食べ (matches 食べたい)
      const shares=it=>{const t=itemCard(it).e.jp+(it.kind==="sent"?it.o.b.jp:"");return uw.some(w=>t.includes(w))};
      const cards=items.filter(it=>it.kind!=="dict"&&itemCard(it).e.jp!==skip&&(!uw||shares(it))).slice(0,built?1:2);
      const wordsH=built?"":wordsHTML(core||q);
      out.innerHTML=noTok+built+wordsH+(gErr?`<div class="ainote">Gemini couldn't answer because ${esc(gWhy(gErr))}${gErr.status&&gErr.status!==429?" ("+esc(gErr.message).slice(0,140)+")":""}.</div>`:"")+
        (cards.length?`<div class="aimeta">${built||wordsH?"Related":"Closest"} hand-written card${cards.length>1?"s":""}:</div>`+cards.map(it=>{const c=itemCard(it);return(it.kind==="sent"?`<div class="aimeta">Found on this card: <b lang="ja">${esc(it.o.b.jp)}</b> = ${esc(it.o.b.en)}</div>`:"")+cardHTML(c.e,c.where)}).join("")
          :built||wordsH?"":`<div class="ainote">I found nothing for that. Try shorter, simpler words, or the Search tab.</div>`);
      window.__lastAI={q,ctx,text:null,by:"no AI"};
      busy=false;return;
    }
    window.__lastAI={q,ctx,text,by};
    {const r=render(text,items,by.startsWith("Gemini"),already);out.innerHTML=built+(built&&/I'm not sure how to help/.test(r)?"":r)}
    out.innerHTML+=`<div class="aimeta">Answered by ${esc(by)}</div>`;
  }catch(e){
    out.innerHTML=`<div class="ainote">Something went wrong (${esc(String(e&&e.message||e)).slice(0,120)}). Try again.</div>`;
  }
  busy=false;
}
bar.addEventListener("submit",ev=>{ev.preventDefault();send(aq.value)});
// Used by the Search tab: the built sentence (or the exact hand-written card) for a whole sentence.
function buildFor(q0){const q=(typeof normEn==="function"?normEn(q0||""):q0)||q0;
  if(!window.DICT){   // the dictionary is still loading: redo the search when it is ready
    lexWait().then(()=>{const el=document.getElementById("q");if(el&&el.value.trim()===q0&&window.search)window.search()});
    return"";
  }
  try{
    const same=exactSent(q);
    if(same)return quoted(q)?`<div class="aimeta">A hand-written card says exactly this:</div>`+cardHTML(same.x.e,same.x.where):"";
    return composeHTML(q,true)||(q.trim().split(/\s+/).length>9||/\b(need|needs|needed|have|has|had) to\b/i.test(q)?"":ruleFill(q))||composeHTML(q)||"";
  }catch(e){return""}
}
let lexP=null;
const lexWait=()=>lexP=lexP||new Promise(ok=>{const t=setInterval(()=>{if(window.DICT){clearInterval(t);ok()}},60)});
window.__ask={build:buildFor,ruleFill,retrieve,check:s=>check(s),render,romaji,send,show,drawPanel,bestModel,
  compose:q=>{const r=compose(q);return r&&{jp:r.chunks.map(c=>c[0]).join(""),romaji:r.chunks.map(c=>c[2]!=null?c[2]:c[1]==null?c[0]:romaji(c[1])).join(" "),used:r.used.map(u=>u.jp+"="+u.en),fixed:!!r.fixed,notes:r.notes}},
  findNoun,enVerb,VP:s=>VP(s),isName,cl:q=>clauses(q,0),c1:q=>compose1(q),np:s=>NP(s),norm:q=>normEn(q),
  partial:q=>{const r=partial(q);return r&&r.chunks.map(c=>c[0]).join("")+"  [left out: "+r.dropped+"]"},
  wordsHTML,word:(e,t)=>word(e,t),pref:()=>PREF,byJP,exactSent,
  state:()=>({key:!!gKey(),model:gModel(),tok:!!tok}),ready:()=>lexWait()};
})();
