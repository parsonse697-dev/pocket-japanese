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
const isNounJP=jp=>!!tok&&!/[〜~\/\s]/.test(jp)&&tok.tokenize(jp).every(t=>t.pos==="名詞"||t.pos==="接頭詞");
// order: the everyday word list, then hand-written cards, then the dictionary; plural forms too
function findNoun(w){
  const base=w.toLowerCase().normalize("NFKC").replace(/[.?!"“”]/g,"").trim().replace(/^(a|an|the|some|any|my|your|this|that) /,"");
  if(!base||base.startsWith("to ")||NOTNOUN.has(base))return null;   // "to go", "to eat": actions don't fit these patterns
  const forms=[...new Set([base,base.replace(/ies$/,"y"),base.replace(/(es|s)$/,""),base.replace(/s$/,"")])].filter(Boolean);
  for(const f of forms){const P=PREF.n[f];if(P){const n=byJP(P,"n");if(n)return n}}
  for(const f of forms){const n=findNoun1(f,"card");if(n)return n}
  for(const f of forms){const n=findNoun1(f,"dict");if(n)return n}
  return null;
}
function findNoun1(w,only){
  const r=only==="dict"?null:rank(w).find(a=>a[0]>=18&&a[1].f.single&&isNounJP(a[1].e.jp));
  if(r)return{jp:r[1].e.jp,kana:r[1].e.kana,en:r[1].e.en,kind:"card"};
  if(only==="card")return null;
  const d=dictWord(w,"n");
  if(d&&isNounJP(d.jp))return d;
  // two words like "kyoto station": try the pieces as one Japanese compound (京都 + 駅)
  const ps=w.split(" ");
  // only when the result is a known word, or a place name + 駅 (station)
  if(ps.length===2){const a=findNoun(ps[0]),b=findNoun(ps[1]);
    if(a&&b){const j=a.jp+b.jp;vocab();
      if(VOCAB.has(j)||CORPUS.includes(j)||(b.jp==="駅"&&tok.tokenize(a.jp).every(t=>t.pos_detail_2==="地域"||t.pos_detail_1==="固有名詞")))return{jp:j,kana:a.kana+b.kana,en:w,kind:"dictionary"}}}
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
  word=word.replace(/\s*[=＝(（].*$/,"").trim();if(!tok||!word||/[ぁ-ヿ一-鿿]/.test(word))return null;   // no word checker, no sentence
  const n=findNoun(word)||npNoun(word),label=`<div class="where">Built by the app: a hand-written pattern + a ${n?n.kind:""} word · the whole sentence was not checked by a person</div>`;
  const en=esc(p[1].split("___").join(word));
  const base=ENTRIES.find(x=>x.e.jp===p[0]);if(!base)return null;
  if(n){
    // reading comes from the card/dictionary and the hand-written pattern: nothing is guessed
    const wr=n.rom||romaji(n.kana);if(wr==null)return null;
    fillHTML.last=p[0].replace("〜",n.jp);
    return`<div class="card dict">${label}${ttsBlock(p[0].replace("〜",n.jp),base.e.romaji.replace("~",wr),patSay(base.e,n.say||sayWord(n.kana)))}<div class="en">${en}</div><div class="note">Word used: <span lang="ja">${esc(n.jp)}</span> (${esc(wr)}) = ${esc(n.en)}</div><div class="tags"><span>pattern + word</span></div></div>`;
  }
  // not in the cards or dictionary: names and brands are said as they are
  // only for real names ("Nutella", "Tokyo Dome"): capitalised, and unknown to both the cards and the dictionary
  if(!isName(word))return null;
  fillHTML.last=p[0].replace("〜",word);
  return`<div class="card dict"><div class="where">Built by the app: a hand-written pattern + your word as it is</div>${ttsBlock(p[0].replace("〜",word),base.e.romaji.replace("~",word),patSay(base.e,word))}<div class="en">${en}</div><div class="note">“${esc(word)}” is not in the dictionary. Names, brands and borrowed words are usually said as they are, with a Japanese accent.</div><div class="tags"><span>pattern + word</span></div></div>`;
}

// ---------- sentence builder without any AI ----------
// Common question shapes are recognised from the English itself and mapped to a
// hand-written pattern. First matching rule wins, so specific shapes come first.
const RULES=[
  ["K",/\bis there (?:an? |any )?(.+?) (?:near(?:by)?|around|close)\b/i],["K",/\b(?:nearest|closest) (.+)/i],
  ["I",/\ballerg(?:ic|y) to (.+)/i],["I",/\b([a-z]+) allergy\b/i],
  ["J",/\b(?:medicine|something|anything|pills?|tablets?) for (?:an? |my |the )?(.+)/i],
  ["F",/\bwithout (?:the |any )?(.+)/i],["F",/\b(?:hold|skip|leave out|remove) the (.+)/i],
  ["G",/\b(?:can'?t|cannot|don'?t|do not|doesn'?t|does not) eat (.+)/i],
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
    const w=m[1].replace(/[,.]? please$/i,"").replace(/\s+(?:here|around here|near here|nearby|for me|today|now|right now)$/i,"").replace(/["”']$/,"")
      .replace(/\s+(?:at|to|located|from|in|on)$/i,"").trim();   // "where is the vending machine at"
    if(!w||/^to /i.test(w)||w.split(" ").length>3)return null;
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
  for(const jp of alts.split("|")){
    const d=JPX.get(jp);
    if(d&&okType(d,type))return{jp:d[0],kana:d[1],pos:d[6]||"",en:gloss(d),kind:"dictionary"};
    const x=ENTRIES.find(x=>x.e.jp===jp&&x.f.single);
    if(x){const w=fromCard(x,type);if(w)return w}
  }
  return null;
}
function fromCard(x,type){
  const jp=x.e.jp,kana=x.e.kana;wix();if(!JPX)return null;
  let d=JPX.get(jp);
  if(!d&&tok&&type==="v"){const ts=tok.tokenize(jp);   // cards give verbs in the polite form: 行きます -> 行く
    if(ts.length&&ts[0].pos==="動詞"&&ts.slice(1).every(t=>t.pos==="助動詞"))d=JPX.get(ts[0].basic_form)}
  if(d)return okType(d,type)?{jp:d[0],kana:d[1],pos:d[6]||"",en:x.e.en,kind:"card"}:null;
  if(!tok||!kana)return null;
  const ts=tok.tokenize(jp);
  if(type==="adj"&&ts.length===1){
    if(ts[0].pos==="形容詞"&&ts[0].basic_form===jp&&jp.endsWith("い"))return{jp,kana,pos:"adj-i",en:x.e.en,kind:"card"};
    if(ts[0].pos_detail_1==="形容動詞語幹")return{jp,kana,pos:"adj-na",en:x.e.en,kind:"card"};
  }
  return null;
}
// The usual word for very common meanings (so "big" is always 大きい, not a rarer
// synonym). Each one is looked up, never trusted blindly: see byJP.
const PREF={n:{wall:"壁",door:"ドア",window:"窓",room:"部屋",house:"家",home:"家",bag:"かばん|鞄",soup:"スープ",chair:"椅子|いす",table:"テーブル",desk:"机",bed:"ベッド",key:"鍵",money:"お金",
  car:"車",bike:"自転車",bicycle:"自転車",train:"電車",bus:"バス",taxi:"タクシー",plane:"飛行機",airplane:"飛行機",boat:"船",ship:"船",station:"駅",airport:"空港",hotel:"ホテル",shop:"店",store:"店",
  restaurant:"レストラン",hospital:"病院",pharmacy:"薬局",school:"学校",bank:"銀行","post office":"郵便局",park:"公園",temple:"お寺|寺",shrine:"神社",castle:"城",museum:"博物館",library:"図書館",
  toilet:"トイレ",bathroom:"トイレ",restroom:"トイレ",water:"水",tea:"お茶",coffee:"コーヒー",beer:"ビール",food:"食べ物",rice:"ご飯",bread:"パン",meat:"肉",fish:"魚",egg:"卵",vegetable:"野菜",fruit:"果物",
  book:"本",phone:"電話",smartphone:"スマホ",photo:"写真",picture:"写真",map:"地図",wallet:"財布",passport:"パスポート",umbrella:"傘",hat:"帽子",shoe:"靴",shoes:"靴",clothes:"服",shirt:"シャツ",towel:"タオル",
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
  good:"いい",nice:"いい",great:"すごい",amazing:"すごい",awesome:"すごい",bad:"悪い",new:"新しい",old:"古い",fast:"速い|早い",quick:"速い|早い",early:"早い",slow:"遅い",late:"遅い",near:"近い",close:"近い",far:"遠い",
  delicious:"おいしい|美味しい",tasty:"おいしい|美味しい",yummy:"おいしい|美味しい",cute:"かわいい|可愛い",pretty:"きれい|綺麗|奇麗",beautiful:"きれい|綺麗|奇麗",clean:"きれい|綺麗|奇麗",dirty:"汚い",
  quiet:"静か",noisy:"うるさい",loud:"うるさい",busy:"忙しい",fun:"楽しい",enjoyable:"楽しい",interesting:"面白い",funny:"面白い",boring:"つまらない",difficult:"難しい",hard:"難しい",easy:"簡単",simple:"簡単",
  heavy:"重い",light:"軽い",long:"長い",short:"短い",wide:"広い",spacious:"広い",narrow:"狭い",cramped:"狭い",strong:"強い",weak:"弱い",sweet:"甘い",salty:"しょっぱい|塩辛い",bitter:"苦い",sour:"酸っぱい|すっぱい",
  safe:"安全",dangerous:"危ない",scary:"怖い",frightening:"怖い",cool:"かっこいい",strange:"変",weird:"変",odd:"変",famous:"有名",convenient:"便利",handy:"便利",kind:"優しい",gentle:"優しい",
  sleepy:"眠い",painful:"痛い",sore:"痛い",happy:"嬉しい",glad:"嬉しい",sad:"悲しい",lonely:"寂しい",warm:"暖かい",bright:"明るい",dark:"暗い",soft:"柔らかい",thick:"厚い",thin:"薄い",young:"若い",
  important:"大切",popular:"人気",rare:"珍しい",unusual:"珍しい",wonderful:"素敵",lovely:"素敵",terrible:"ひどい|酷い",awful:"ひどい|酷い",perfect:"完璧",correct:"正しい",
  hot:c=>c&&c.thing?"熱い":"暑い",cold:c=>c&&c.thing?"冷たい":"寒い",fine:"大丈夫",okay:"大丈夫",ok:"大丈夫",smelly:"臭い",stinky:"臭い",embarrassing:"恥ずかしい",embarrassed:"恥ずかしい",
  necessary:"必要",impossible:"無理",complicated:"複雑",polite:"丁寧",rude:"失礼",special:"特別",fresh:"新鮮",comfortable:"快適",cheerful:"明るい"},
 v:{go:"行く",come:"来る",eat:"食べる",drink:"飲む",see:"見る",watch:"見る","look at":"見る",buy:"買う",use:"使う",read:"読む",write:"書く",speak:"話す",talk:"話す","listen to":"聞く",listen:"聞く",hear:"聞く",
  sleep:"寝る",wait:"待つ","wait for":"待つ",walk:"歩く",run:"走る",sit:"座る","sit down":"座る",stand:"立つ","stand up":"立つ",open:"開ける",close:"閉める",shut:"閉める",pay:"払う",try:"試す",
  wear:"着る","put on":"着る",meet:"会う","go home":"帰る","go back":"帰る","come back":"戻る",return:"帰る",study:"勉強",work:"働く",play:"遊ぶ",swim:"泳ぐ",sing:"歌う",rest:"休む",
  send:"送る",show:"見せる",teach:"教える",tell:"教える",enter:"入る","go in":"入る","go into":"入る","go out":"出かける",ride:"乗る","get on":"乗る","get off":"降りる",wash:"洗う",cut:"切る",borrow:"借りる",rent:"借りる",lend:"貸す",
  find:"見つける",lose:"なくす|無くす",forget:"忘れる",remember:"覚える",learn:"習う",change:"変える",choose:"選ぶ",pick:"選ぶ",help:"手伝う",carry:"持つ",hold:"持つ",climb:"登る|上る",start:"始める",begin:"始める",
  stay:"泊まる",touch:"触る","try on":"試着",order:"注文",reserve:"予約",book:"予約",cancel:"キャンセル",check:"確認",confirm:"確認",charge:"充電",exchange:"交換",call:"電話",phone:"電話",
  "wake up":"起きる","get up":"起きる",sell:"売る",cook:"料理",drive:"運転",travel:"旅行",shop:"買い物","go shopping":"買い物",smoke:"吸う",throw:"捨てる","throw away":"捨てる",
  push:"押す",press:"押す",pull:"引く",stop:"止まる",hurry:"急ぐ",ask:"聞く",answer:"答える",practice:"練習",explain:"説明",translate:"翻訳",repeat:"繰り返す",bring:"持ってくる|持って来る",
  "pick up":"拾う",search:"探す","look for":"探す","search for":"探す",die:"死ぬ",laugh:"笑う",cry:"泣く",dance:"踊る",fly:"飛ぶ",win:"勝つ",lose2:"負ける",join:"参加",clean:"掃除",fix:"直す",repair:"直す",
  "take a photo":"撮る","take a picture":"撮る","take photos":"撮る","take pictures":"撮る","take a shower":"浴びる","take a bath":"入る","take a break":"休む","take a rest":"休む"}};
const FIXOBJ={"take a photo":"写真","take a picture":"写真","take photos":"写真","take pictures":"写真","take a shower":"シャワー","take a bath":"お風呂|風呂"};
// English verbs whose Japanese depends too much on the situation to build safely
const VBLOCK=new Set("be have get do make take put set let keep feel become seem think know say want like need mean turn give leave miss mind care would could should will can may might must am is are was were love hate hope wish look".split(" "));
const NIOBJ=new Set(["会う","乗る","入る","触る","登る","座る","着く","行く","来る","帰る","戻る","泊まる","住む","電話","参加","勝つ","負ける"]);
const GAOBJ=new Set(["わかる","分かる","できる","出来る","見える","聞こえる"]);
const NOPOT=new Set(["わかる","分かる","できる","出来る","ある","いる","見える","聞こえる"]);
// states that English says with "is ..." but Japanese says with a verb: left to the hand-written cards
const PBLOCK=new Set("tired hungry thirsty lost broken crowded open closed full ready married sick ill drunk here there late gone done finished over sure sorry right wrong left welcome back home out in on off up down single alone free available busy2 healthy shy uncomfortable worried excited bored interested scared afraid surprised confused angry mad nervous annoyed".split(" "));
// Dictionary choice: the word must list this meaning among its first ones, and of
// those the most commonly used word wins (壁 before 塀 for "wall"). Meaning match
// only: a look-alike romaji spelling never counts.
function dictWord(en,type){
  const rows=(wix().get(gkey(en))||[]).filter(r=>r[0]<=2&&okType(r[1],type)&&!/(^|,)x$/.test(r[1][6]||""));
  if(!rows.length)return null;
  const sc=r=>r[0]*25+Math.min(r[1][7]==null?999:r[1][7],600);
  rows.sort((a,b)=>sc(a)-sc(b));
  if((rows[0][1][7]==null?999:rows[0][1][7])>560)return null;   // too rare to trust without a person checking
  const d=rows[0][1];return{jp:d[0],kana:d[1],pos:d[6]||"",en:gloss(d),kind:"dictionary"};
}
const NOTNOUN=new Set("you me him her them us it i we they he she what who whom which whose one ones thing things something anything everything nothing someone anyone everyone somebody anybody everybody nobody here there now then that this these those all both each many much more most some any no not yes ok okay very too so".split(" "));
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
  en=en.trim().toLowerCase();if(!en||!tok||NOTWORD.has(en)||NOTNOUN.has(en))return null;wix();if(!JPX)return null;
  const P=PREF[type][en];
  if(P){const w=byJP(typeof P==="function"?P(ctx):P,type);if(w)return w}
  return cardWord(en,type)||dictWord(en,type);
}
// ----- nouns and noun phrases -----
const C=(jp,kana)=>[jp,kana===undefined?jp:kana];
const DET={this:[C("この")],these:[C("この")],that:[C("その")],those:[C("その")],my:[C("私","わたし"),C("の")],our:[C("私たち","わたしたち"),C("の")],his:[C("彼","かれ"),C("の")],her:[C("彼女","かのじょ"),C("の")]};
const PRON={this:C("これ"),that:C("それ"),it:C("それ"),these:C("これ"),those:C("それ"),"this one":C("これ"),"that one":C("それ"),here:C("ここ"),there:C("そこ"),"over there":C("あそこ"),
  he:C("彼","かれ"),she:C("彼女","かのじょ"),we:C("私たち","わたしたち"),i:C("私","わたし"),"this place":C("ここ"),"that place":C("そこ")};
// A word with no dictionary meaning at all and no card ("Nutella", "nutella", "Tokyo Dome")
// is treated as a name or brand and said as it is. Capital letters are not required.
function isName(w){
  if(!/^[A-Za-z0-9][A-Za-z0-9'&.-]*( [A-Za-z0-9][A-Za-z0-9'&.-]*){0,2}$/.test(w))return false;
  const l=w.toLowerCase(),X=wix();
  if(NOTNOUN.has(l)||NOTWORD.has(l)||TIME[l]!==undefined||PBLOCK.has(l)||l.split(" ").some(p=>NOTWORD.has(p)||NOTNOUN.has(p)||STOP.has(p)))return false;
  for(const f of[l,l.replace(/s$/,""),l.replace(/es$/,""),l.replace(/ing$/,""),l.replace(/ed$/,""),l.replace(/ly$/,"")])if(X.get(gkey(f))||window.SYN&&window.SYN[f])return false;
  return!dictLookup(l).length&&!rank(l).some(a=>a[0]>=18);
}
function NP(s){
  s=s.trim();const l=s.toLowerCase();
  if(PRON[l])return{chunks:[PRON[l]],used:[],pron:l};
  let det=null,rest=s,m=/^(this|that|these|those|my|our|his|her|the|an?|some|any|your) (.+)$/i.exec(s);
  if(m){det=m[1].toLowerCase();rest=m[2]}
  let far=false;if(/ over there$/i.test(rest)){far=true;rest=rest.replace(/ over there$/i,"")}
  const ws=rest.split(" ");if(ws.length>4||/\b(and|or|of|who|which|that)\b/i.test(rest))return null;
  const chunks=[],used=[];
  if(NOTNOUN.has(rest.toLowerCase())||TIME[rest.toLowerCase()]!==undefined)return null;
  let n=findNoun(rest);
  if(!n&&ws.length>=2&&TIME[ws.slice(1).join(" ").toLowerCase()]===undefined){   // describing word + noun: "big bag"
    const a=word(ws[0],"adj",{thing:true}),n2=a&&findNoun(ws.slice(1).join(" "));
    if(n2){const at=/adj-i/.test(a.pos)?C(a.jp,a.kana):/adj-na/.test(a.pos)?C(a.jp+"な",a.kana+"な"):C(a.jp+"の",a.kana+"の");chunks.push(at);used.push(a);n=n2}
  }
  if(n){chunks.push(C(n.jp,n.kana));used.push(n)}
  else{   // a real name ("Kyoto Tower", "Nutella") is said as it is
    if(!isName(rest))return null;
    chunks.push([rest,null]);used.push({jp:rest,kana:null,en:"not in the dictionary: names and brands are said as they are, with a Japanese accent"});
  }
  if(det&&DET[det])chunks.unshift(...(far&&det==="that"?[C("あの")]:DET[det]));
  return{chunks,used,en:rest};
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
function vend(w,f){
  const s=vstems(w);if(!s)return null;
  const J=(a,x)=>a?C(a[0]+x,a[1]+x):null,ok=a=>a.every(Boolean)?a:null;
  const pot=NOPOT.has(w.jp)?s.i:s.pot;
  switch(f){
    case"masu":return ok([J(s.i,"ます")]);case"masen":return ok([J(s.i,"ません")]);case"mashita":return ok([J(s.i,"ました")]);
    case"masendeshita":return ok([J(s.i,"ません"),C("でした")]);
    case"masuka":return ok([J(s.i,"ます"),C("か")]);case"mashitaka":return ok([J(s.i,"ました"),C("か")]);
    case"mashou":return ok([J(s.i,"ましょう")]);case"mashouka":return ok([J(s.i,"ましょう"),C("か")]);
    case"tai":return ok([J(s.i,"たい"),C("です")]);case"takunai":return ok([J(s.i,"たくない"),C("です")]);
    case"tekudasai":return ok([s.te&&C(s.te[0],s.te[1]),C("ください")]);
    case"temorau":return ok([s.te&&C(s.te[0],s.te[1]),C("もらえます"),C("か")]);
    case"temoii":return ok([s.te&&C(s.te[0],s.te[1]),C("も"),C("いい"),C("です"),C("か")]);
    case"teiru":return ok([s.te&&C(s.te[0],s.te[1]),C("います")]);
    case"naide":return ok([J(s.a,"ないで"),C("ください")]);
    case"must":return ok([J(s.a,"ない"),C("と"),C("いけません")]);
    case"pot":return ok([J(pot,"ます")]);case"potneg":return ok([J(pot,"ません")]);case"potka":return ok([J(pot,"ます"),C("か")]);
    case"suki":return ok([C(w.jp+(s.suru?"する":""),w.kana+(s.suru?"する":"")),C("の"),C("が"),C("好き","すき"),C("です")]);
  }
  return null;
}
const IRR={ate:"eat",went:"go",came:"come",saw:"see",bought:"buy",drank:"drink",slept:"sleep",met:"meet",paid:"pay",ran:"run",sat:"sit",stood:"stand",lost:"lose",forgot:"forget",found:"find",sent:"send",wore:"wear",swam:"swim",sang:"sing",taught:"teach",heard:"hear",brought:"bring",chose:"choose",drove:"drive",flew:"fly",held:"hold",rode:"ride",sold:"sell",woke:"wake",won:"win",began:"begin",spoke:"speak",wrote:"write",told:"tell",threw:"throw",cut:"cut",read:"read",broke:"break",caught:"catch"};
function enVerb(w){
  if(IRR[w]&&w!=="cut"&&w!=="read")return{c:[IRR[w]],past:true};
  if(/ing$/.test(w)&&w.length>4){const b=w.slice(0,-3);return{c:[b,b+"e",b.replace(/(.)\1$/,"$1")],ing:true}}
  if(/ed$/.test(w)&&w.length>3){const b=w.slice(0,-2);return{c:[b,w.slice(0,-1),b.replace(/(.)\1$/,"$1"),b.replace(/i$/,"y")],past:true}}
  return{c:[w]};
}
const TIME={today:"今日",tomorrow:"明日",yesterday:"昨日",now:"今",later:"後で",tonight:"今夜","every day":"毎日",again:"もう一度",slowly:"ゆっくり",together:"一緒に",soon:"もうすぐ","this morning":"今朝","next week":"来週","last week":"先週","tomorrow morning":null};
const PREP={to:"に",at:"で","in":"で","with":"と",from:"から",by:"で"};
// "eat ramen", "go to Kyoto tomorrow", "buying a ticket"  ->  {v, chunks before the verb, used, past, ing}
function VP(s){
  let l=s.trim().replace(/\s+/g," "),pre=[],used=[],note="";
  for(const t of Object.keys(TIME).sort((a,b)=>b.length-a.length)){
    const re=new RegExp("(^| )"+t+"$","i");
    if(re.test(l)){const w=TIME[t]&&byJP(TIME[t],"any");if(!w)return null;pre.push(C(w.jp,w.kana));used.push(Object.assign(w,{en:t}));l=l.replace(re,"").trim();break}
  }
  let ws=l.split(" ");if(!ws[0])return null;
  // the verb: up to four words ("take a photo"), longest first
  let v=null,info=null,nv=0,key="";
  const head=enVerb(ws[0].toLowerCase());
  for(let n=Math.min(4,ws.length);n>=1&&!v;n--){
    for(const c of head.c){
      const k=[c,...ws.slice(1,n).map(x=>x.toLowerCase())].join(" ");
      if(n===1&&VBLOCK.has(c))continue;
      if(n>1&&!PREF.v[k])continue;
      const w=word(k,"v");if(w){v=w;info=head;nv=n;key=k;break}
    }
  }
  if(!v||!vstems(v))return null;
  used.push(v);
  let rest=ws.slice(nv).join(" ").replace(/^(me|us|you)( |$)/i,"").trim();
  const mv=/^(行く|来る|帰る|戻る)$/.test(v.jp);
  // "here" / "there": where it happens
  const pm=/(?:^| )(over there|here|there)$/i.exec(rest);
  if(pm){pre.push(PRON[pm[1].toLowerCase()],C(mv||/^(泊まる|住む|座る|入る|置く|止まる)$/.test(v.jp)?"に":"で"));rest=rest.slice(0,pm.index).trim()}
  if(FIXOBJ[key]){const o=byJP(FIXOBJ[key],"n");if(!o)return null;pre.push(C(o.jp,o.kana),key==="take a bath"?C("に"):C("を","お"));used.push(o)}
  if(rest){
    if(FIXOBJ[key])return null;
    const m=/^(.*?)(?:(?:^| )(to|at|in|with|from|by) (.+))?$/i.exec(rest);if(!m)return null;
    let obj=m[1].trim(),pp=m[2]?[m[2].toLowerCase(),m[3]]:null;
    if(pp&&/\b(to|at|in|with|from|by|on|for|about|into)\b/i.test(pp[1]))return null;   // two "to/at/with" parts: too complex
    if(/\b(on|for|about|into|because|and|but|if|when|so)\b/i.test(obj)||/ly$/i.test(obj)&&!PREF.n[obj.toLowerCase()])return null;   // "quickly", "carefully": how-words are not things
    if(pp){
      const np=NP(pp[1]);if(!np||np.pron==="i")return null;
      let part=PREP[pp[0]];
      if((pp[0]==="at"||pp[0]==="in")&&/^(泊まる|住む|座る|入る|いる|ある)$/.test(v.jp))part="に";
      if(pp[0]==="to"&&!mv&&!/^(送る|電話|教える|見せる)$/.test(v.jp))return null;
      pre.push(...np.chunks,C(part));used.push(...np.used);
    }
    if(obj){
      if(mv){
        if(/^(home)$/i.test(obj)&&v.jp!=="帰る"){const h=byJP("家","n");if(!h)return null;pre.push(C(h.jp,h.kana),C("に"));used.push(h)}
        else if(/^(home)$/i.test(obj)){}
        else return null;
      }else{
        const np=NP(obj);if(!np||np.pron==="i"||np.pron==="we"||np.pron==="he"||np.pron==="she")return null;
        let part;
        if(NIOBJ.has(v.jp))part=C("に");else if(GAOBJ.has(v.jp))part=C("が");
        else if(/(^|,)vt/.test(v.pos)||(/(^|,)vs/.test(v.pos)&&!/(^|,)vi/.test(v.pos)))part=C("を","お");
        else return null;   // this verb takes no direct object: not built
        pre.push(...np.chunks,part);used.push(...np.used);
      }
    }
  }
  return{v,pre,used,past:!!info.past,ing:!!info.ing};
}
// ----- whole sentences -----
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
// 'Hello, how do I say "this wall is scary" in Japanese?' -> 'this wall is scary'
// Text inside quotation marks is the exact sentence the user wants: nothing outside it is used.
function quoted(q){
  const m=/["“”„‟«»＂「『]\s*([^"“”„‟«»＂」』]{2,}?)\s*(?:["“”„‟«»＂」』]|$)/.exec(q)||/(?:^|\s)['‘](.{2,}?)['’]\s*[?.!]*\s*(?:in japanese)?\s*[?.!]*$/i.exec(q);
  return m?m[1].trim():null;
}
function cleanQ(q){
  const inq=quoted(q);
  if(inq)return inq.replace(/\s+/g," ").replace(/[?!.。]+$/,"").trim();
  return q.trim().replace(/\s+/g," ").replace(/[?!.]+$/,"")
    .replace(/^(?:hello|hi|hey|excuse me|sorry|um|well|ok|okay|so|please tell me)[,!. ]+/i,"")
    .replace(/^(?:how (?:do|can|would|should) (?:i|you|we) (?:say|ask|write)|how to (?:say|ask)|what(?:'s| is) the japanese (?:word )?for|what(?:'s| is)|how do you say|translate|say)\s*(?=["“'‘])/i,"")
    .replace(/^(?:how (?:do|can|would|should) (?:i|you|we) (?:say|ask)|how to (?:say|ask)|what(?:'s| is) the japanese (?:word )?for|how do you say|translate|say)\s*(?:if|whether|for|that|:)?\s*/i,"")
    .replace(/\s+in japanese$/i,"").replace(/^["“'‘]+|["”'’]+$/g,"").replace(/\s+in japanese$/i,"").replace(/[?!.]+$/,"").replace(/^["“'‘]+|["”'’]+$/g,"").trim();
}
function compose(q){
  if(!tok)return null;wix();if(!JPX)return null;
  let s0=cleanQ(q);
  if(!s0||s0.split(" ").length>10)return null;
  const isQ=/\?\s*["”'’」]?\s*$/.test(quoted(q)!=null?(/["“„‟«＂「『'‘]\s*([^"“”„‟«»＂」』]*)/.exec(q)||["",""])[1].replace(/["”’'」』\s]+$/,""):q);
  let please=false;if(/[, ]+please$/i.test(s0)){please=true;s0=s0.replace(/[, ]+please$/i,"")}
  const en=cap(s0)+(isQ?"?":"");
  const l0=s0.replace(/’/g,"'").replace(/\b(it|that|this|he|she|there|what|where|who)'s\b/gi,"$1 is").replace(/\bi'm\b/gi,"i am").replace(/\b(we|they|you)'re\b/gi,"$1 are")
    .replace(/\b(is|are|was|were|do|does|did|would|could|should|wo|ca)n't\b/gi,(m,a)=>({wo:"will",ca:"can"}[a.toLowerCase()]||a)+" not").replace(/\bcannot\b/gi,"can not").replace(/\bi'll\b/gi,"i will").replace(/\bi'd like\b/gi,"i would like").replace(/\bi've\b/gi,"i have").replace(/\blet's\b/gi,"lets");
  const KA=C("か"),WA=C("は","わ"),GA=C("が"),O=C("を","お");
  // a time word at the end ("... today") goes first in Japanese
  let T=[],Tu=[],l=l0,s=s0;
  for(const t of Object.keys(TIME).sort((a,b)=>b.length-a.length)){
    const re=new RegExp(" "+t+"$","i");
    if(re.test(l)){const w=TIME[t]&&byJP(TIME[t],"any");if(!w)return null;T=[C(w.jp,w.kana)];Tu=[Object.assign(w,{en:t})];l=l.replace(re,"");s=s.replace(re,"");break}
  }
  const out=(chunks,used,notes,twa)=>chunks&&chunks.every(Boolean)?{chunks:[...T,...(twa&&T.length?[WA]:[]),...chunks],used:[...Tu,...used].filter(u=>u&&u.jp),notes:notes||[],en}:null;
  const subj=str=>{   // -> {chunks (with は), used, thing} ; I / you / it are left out, as Japanese does
    const t=str.trim().toLowerCase();
    if(/^(i|we|you|it)$/.test(t))return{chunks:[],used:[],thing:t==="it"?false:null,omit:t};
    const np=NP(str.trim());if(!np)return null;
    return{chunks:[...np.chunks,T.length?GA:WA],used:np.used,thing:!np.pron||/^(this|that|these|those)/.test(np.pron)};
  };
  const pred=(str,S,neg,past,mode)=>{   // what comes after is/are
    let t=str.trim(),adv=null,m;
    if((m=/^(very|really|so|extremely|super|too|a little|a bit|a little bit|slightly|kind of|pretty|quite|that) (.+)$/i.exec(t))){adv=m[1].toLowerCase();t=m[2]}
    if(PBLOCK.has(t.toLowerCase())||/^(in|on|at|under|near|next|behind|with|from|for|to|of|by|inside|outside|above|below|between|across)\b/i.test(t))return null;
    const a=word(t,"adj",{thing:S.thing});
    if(a){
      if(/^好き|^嫌い|^欲しい|^必要/.test(a.jp))return null;
      let ch=[];
      if(adv==="too")mode="too";
      else if(adv&&neg&&/^(very|really|so|that)$/.test(adv))ch.push(C("あまり"));
      else if(adv&&/^(very|really|so|extremely|super)$/.test(adv))ch.push(C("とても"));
      else if(adv&&/^(a little|a bit|a little bit|slightly|kind of)$/.test(adv))ch.push(C("ちょっと"));
      else if(adv&&/^(pretty|quite)$/.test(adv))ch.push(C("けっこう"));
      else if(adv)return null;
      const p=adjPred(a,neg,past,mode);if(!p)return null;
      return{chunks:[...ch,...p],used:[a]};
    }
    if(adv||mode)return null;
    if(/^[a-z]+ing\b/i.test(t)){const vp=VP(t);if(vp&&vp.ing){const e=vend(vp.v,/^(行く|来る|帰る|戻る)$/.test(vp.v.jp)?"masu":"teiru");if(e&&!neg&&!past)return{chunks:[...vp.pre,...e],used:vp.used}}return null}
    const np=NP(t);if(!np||np.pron==="i")return null;
    return{chunks:[...np.chunks,...(neg?[C(past?"じゃなかった":"じゃない"),C("です")]:[past?C("でした"):C("です")])],used:np.used};
  };
  let m;
  // --- "my head hurts" ---
  if((m=/^(?:my |the )?(.+?) (?:hurts?|is hurting|aches?|is sore)$/i.exec(l))&&!/^(it|this|that|here)$/i.test(m[1])){
    const n=findNoun(m[1]),a=byJP("痛い","adj");
    if(n&&a)return out([C(n.jp,n.kana),GA,C(a.jp,a.kana),C("です")],[n,a]);
  }
  if((m=/^(.+?) (?:is|are) (?:broken|not working)$/i.exec(l))||(m=/^(.+?) (?:does|do|will) not work$/i.exec(l))){
    const np=NP(s.slice(0,m[1].length)),v=byJP("壊れる","v"),e=v&&vend(v,"teiru");
    return np&&e&&!/^(i|he|she|we)$/.test(np.pron||"")?out([...np.chunks,GA,...e],[...np.used,v]):null;
  }
  // --- questions: "is this wall scary?" ---
  if((m=/^(is|are|was|were) (not )?(.+)$/i.exec(l))&&!/^there /i.test(m[3])&&!/^is it (ok|okay|alright|all right|fine) (to|if i) /i.test(l)){
    const past=/^w/i.test(m[1]),ws=m[3].split(" ");
    for(let i=1;i<ws.length;i++){
      const S=subj(ws.slice(0,i).join(" "));if(!S)continue;
      const P=pred(ws.slice(i).join(" "),S,!!m[2],past);if(!P)continue;
      return out([...S.chunks,...P.chunks,KA],[...S.used,...P.used],[],true);
    }
    return null;
  }
  // --- "this wall is scary", "it was not expensive", "that looks delicious" ---
  if((m=/^(.+?) (is|are|am|was|were|looks?|seems?)( not)? (.+)$/i.exec(l))&&!/^(what|where|who|when|why|how|which|there|here)\b/i.test(m[1])){
    const S=subj(m[1]);
    if(S){
      const looks=/^(look|seem)/i.test(m[2]),P=pred(m[4],S,!!m[3],/^w/i.test(m[2]),looks?"looks":null);
      if(P)return out([...S.chunks,...P.chunks,...(isQ?[KA]:[])],[...S.used,...P.used],S.omit&&S.omit!=="it"?[`Japanese normally leaves out “${S.omit==="we"?"we":S.omit==="you"?"you":"I"}” when it is clear who you mean.`]:[],true);
    }
    if(!/^(i|we|you) (am|are) [a-z]+ing\b/i.test(l))return null;
  }
  // --- fixed shapes with a thing ---
  const thing=(re,build)=>{const mm=re.exec(l);if(!mm)return undefined;const np=NP(s.slice(s.length-mm[1].length));return np&&!/^(i|he|she|we)$/.test(np.pron||"")?build(np):null};
  const fixed=[
    [/^how much (?:is|are|for) (.+)$/i,np=>out([...np.chunks,WA,C("いくら"),C("です"),KA],np.used)],
    [/^(?:i|we) do not like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out([...np.chunks,WA,C(a.jp,a.kana),C("じゃない"),C("です")],[...np.used,a])}],
    [/^do you like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out([...np.chunks,WA,C(a.jp,a.kana),C("です"),KA],[...np.used,a])}],
    [/^(?:i|we) (?:really like|love) (.+)$/i,np=>{const a=byJP("大好き","adj");return a&&out([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) like (.+)$/i,np=>{const a=byJP("好き","adj");return a&&out([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) need (.+)$/i,np=>{const a=byJP("必要","adj");return a&&out([...np.chunks,GA,C(a.jp,a.kana),C("です")],[...np.used,a])}],
    [/^(?:i|we) (?:have )?lost (.+)$/i,np=>{const v=byJP("なくす|無くす","v"),e=v&&vend(v,"mashita");return e&&out([...np.chunks,O,...e],[...np.used,v])}],
    [/^(?:i|we) (?:have )?(?:forgot|forgotten) (.+)$/i,np=>{const v=byJP("忘れる","v"),e=v&&vend(v,"mashita");return e&&out([...np.chunks,O,...e],[...np.used,v])}],
    [/^(?:i|we) do not have (?:an? |any )?(.+)$/i,np=>out([...np.chunks,GA,C("ありません")],np.used)],
    [/^(?:i|we) have (.+)$/i,np=>{const v=byJP("持つ","v"),e=v&&vend(v,"teiru");return e&&out([...np.chunks,O,...e],[...np.used,v],["This is “have” for a thing you carry or own. For a reservation, a fever or a question, say … ga arimasu. For people and pets, … ga imasu."])}],
    [/^(.+) (?:is|are) (?:broken|not working)$/i,null],
  ];
  for(const[re,build]of fixed){if(!build)continue;const r=thing(re,build);if(r)return r}
  // --- action words ---
  const acts=[
    [/^(?:i|we) do not want to (.+)$/i,"takunai"],[/^(?:i|we) (?:want|wanna|would like) to (.+)$/i,"tai"],
    [/^(?:can|could|may) (?:i|we) (?:please )?(.+)$/i,"temoii"],[/^is it (?:ok|okay|alright|all right|fine) (?:to|if i) (.+)$/i,"temoii"],
    [/^(?:can|could|would|will) you (?:please )?(.+)$/i,"temorau"],
    [/^(?:please )?do not (.+)$/i,"naide"],[/^please (.+)$/i,"tekudasai"],
    [/^(?:lets|let us) (.+)$/i,"mashou"],[/^shall we (.+)$/i,"mashouka"],
    [/^where (?:can|do|could|should|would) (?:i|we) (.+)$/i,"where"],[/^how (?:do|can|should) (?:i|we) (.+)$/i,"how"],
    [/^(?:i|we) can not (.+)$/i,"potneg"],[/^(?:i|we) can (.+)$/i,"pot"],[/^can you (.+)$/i,"potka"],
    [/^(?:i|we) (?:have to|need to|must|gotta|have got to) (.+)$/i,"must"],
    [/^(?:i|we) (?:like|love|enjoy) (?:to )?(.+)$/i,"suki"],
    [/^(?:i|we) (?:am|are) going to (.+)$/i,"masu"],[/^(?:i|we) will not (.+)$/i,"masen"],[/^(?:i|we) will (.+)$/i,"masu"],
    [/^(?:i|we) do not (.+)$/i,"masen"],[/^(?:i|we) did not (.+)$/i,"masendeshita"],
    [/^(?:i|we) (?:am|are) (.+)$/i,"teiru"],[/^(?:do|will) you (.+)$/i,"masuka"],[/^did you (.+)$/i,"mashitaka"],
    [/^(?:i|we) (.+)$/i,"plain"]];
  for(const[re,f0]of acts){
    if(!(m=re.exec(l)))continue;
    let f=f0;const vp=VP(s.slice(s.length-m[1].length));if(!vp)return null;
    if(f==="teiru"&&!vp.ing)return null;
    if(f==="teiru"&&/^(行く|来る|帰る|戻る)$/.test(vp.v.jp))f="masu";
    if(f==="plain")f=vp.ing?null:vp.past?"mashita":"masu";
    if(!f)return null;
    if(vp.ing&&f!=="teiru"&&f!=="suki")return null;
    if(vp.past&&f!=="mashita")return null;
    if(f==="tekudasai"||(please&&f==="masu"))f="tekudasai";
    let pre=vp.pre,e;
    if(f==="where"||f==="how"){
      // "where can I buy a ticket" -> ticket wa doko de kaemasu ka
      const obj=pre.length&&pre[pre.length-1][0]==="を";
      const lead=obj?[...pre.slice(0,-1),WA]:pre;
      e=vend(vp.v,f==="where"?"potka":"masuka");
      return e&&out([...lead,f==="where"?C("どこ"):C("どうやって"),...(f==="where"?[C("で")]:[]),...e],vp.used);
    }
    if(/^pot/.test(f)&&pre.length&&pre[pre.length-1][0]==="を")pre=[...pre.slice(0,-1),GA];   // "can read X": X ga yomemasu
    e=vend(vp.v,f);
    return e&&out([...pre,...e],vp.used,f==="temorau"?["A polite way to ask someone to do something for you."]:[]);
  }
  // --- "eat this" / "wait here", said as a request ---
  if(please){const vp=VP(s);if(vp&&!vp.ing&&!vp.past){const e=vend(vp.v,"tekudasai");if(e)return out([...vp.pre,...e],vp.used)}}
  return null;
}
function composeHTML(q){
  let r=null;try{r=compose(q)}catch(e){r=null}
  if(!r)return null;
  const jp=r.chunks.map(c=>c[0]).join(""),rom=r.chunks.map(c=>c[1]==null?c[0]:romaji(c[1]));
  if(rom.some(x=>x==null))return null;
  fillHTML.last=jp;
  const seen=new Set(),used=r.used.filter(u=>!seen.has(u.jp)&&seen.add(u.jp)).map(u=>`<span lang="ja">${esc(u.jp)}</span>${u.kana?" ("+esc(romaji(u.kana)||"")+")":""} = ${esc(short(u.en,70))}`).join("<br>");
  return`<div class="card dict"><div class="where">Built by the app: grammar rules + words from the cards and dictionary · the whole sentence was not checked by a person</div>${ttsBlock(jp,rom.join(" "),(()=>{const a=r.chunks.map(c=>c[1]==null?c[0]:sayWord(c[1]));return a.some(x=>x==null)?"":a.join(" ")})())}<div class="en">${esc(r.en)}</div><div class="note">Words used (check they mean what you want):<br>${used}</div>${r.notes.map(n=>`<div class="note">${esc(n)}</div>`).join("")}<div class="tags"><span>built sentence</span></div></div>`;
}
// When no sentence could be built: every important word on its own, to point at or say one by one.
function wordsHTML(q){
  if(!tok)return"";wix();if(!JPX)return"";
  const ws=[...new Set(words(q.replace(/’/g,"'")).filter(w=>!QSTOP.has(w)&&!/^(is|are|was|were|am|not|very|really|and|or|but|with|from|have|has|will|hello|hi|there|here|they|them|he|she|we|on|at|by|if|so|just)$/.test(w)&&w.length>=2&&/^[a-z']+$/.test(w)))].slice(0,6);
  let rows="",n=0;const seen=new Set();
  for(let i=0;i<ws.length;i++){
    let w=ws[i],x=null;
    // two words that are one thing ("vending machine") when a card or the everyday list knows them
    if(ws[i+1]){const two=w+" "+ws[i+1],t=PREF.n[two]?byJP(PREF.n[two],"n"):findNoun1(two,"card")||findNoun1(two.replace(/s$/,""),"card");if(t){x=t;w=two;i++}}
    const ev=enVerb(w);
    if(!x)x=findNoun(w)||word(w,"adj",{thing:true});
    if(!x)for(const c of ev.c){if(VBLOCK.has(c))continue;x=word(c,"v");if(x)break}
    if(!x||seen.has(x.jp))continue;seen.add(x.jp);
    const r=x.kana?romaji(x.kana):null;if(!r)continue;
    rows+=`<div class="sub"><div class="label">${esc(w)}</div>${ttsBlock(x.jp,r,sayWord(x.kana)||"")}<div>${esc(short(x.en,70))}</div></div>`;n++;
  }
  return n>=1?`<div class="card dict"><div class="where">Word by word · I couldn't build this as one sentence, so here is each word</div>${rows}<div class="tags"><span>words</span></div></div>`:"";
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
let busy=false,tok=null,tokP=null,history=[];
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
  if(usable()){ensureTok();
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
  return sentIndex().find(s=>s.b.en.split(" / ").some(p=>xnorm(p)===k))||null;
}
async function send(q){
  if(busy||!q.trim())return;
  busy=true;aq.value="";
  const you=document.createElement("div");you.className="you";you.textContent=q;log.appendChild(you);
  const out=document.createElement("div");out.innerHTML=`<div class="ainote dots">Looking it up</div>`;log.appendChild(out);
  you.scrollIntoView({block:"start",behavior:"smooth"});
  try{
    const core=quoted(q);   // text in quotes is the whole sentence to look for
    const items=retrieve(core||q);
    const ctx=items.length?items.map(itemText).join("\n"):"(no matching entries)";
    const msgs=[{role:"system",content:SYSTEM}];
    history.slice(-2).forEach(h=>msgs.push({role:"user",content:"QUESTION: "+h.q},{role:"assistant",content:h.a}));
    msgs.push({role:"user",content:`PHRASEBOOK ENTRIES:\n${ctx}\n\nQUESTION: ${q}`});
    // the word checker is needed to build sentences: wait for it (it loads once, in a few seconds)
    if(!tok){out.innerHTML=`<div class="ainote dots">Getting ready</div>`;await Promise.race([ensureTok(),new Promise(r=>setTimeout(r,25000))])}
    const noTok=!tok?`<div class="ainote">The sentence builder could not load, so I can only show cards for now. Close and reopen the app to try again.</div>`:"";
    fillHTML.last=null;
    // a hand-written sentence that says exactly this wins over anything built
    const same=exactSent(q);
    let built=same?"":(ruleFill(q)||composeHTML(q)||"");
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
      const cards=items.filter(it=>it.kind!=="dict"&&itemCard(it).e.jp!==skip).slice(0,built?1:2);
      const wordsH=built?"":wordsHTML(core||q);
      out.innerHTML=noTok+built+wordsH+(gErr?`<div class="ainote">Gemini couldn't answer because ${esc(gWhy(gErr))}${gErr.status&&gErr.status!==429?" ("+esc(gErr.message).slice(0,140)+")":""}.</div>`:"")+
        (cards.length?`<div class="aimeta">${built||wordsH?"Related":"Closest"} hand-written card${cards.length>1?"s":""}:</div>`+cards.map(it=>{const c=itemCard(it);return(it.kind==="sent"?`<div class="aimeta">Found on this card: <b lang="ja">${esc(it.o.b.jp)}</b> = ${esc(it.o.b.en)}</div>`:"")+cardHTML(c.e,c.where)}).join("")
          :built||wordsH?"":`<div class="ainote">I found nothing for that. Try shorter, simpler words, or the Search tab.</div>`);
      window.__lastAI={q,ctx,text:null,by:"no AI"};
      busy=false;return;
    }
    window.__lastAI={q,ctx,text,by};
    history.push({q,a:text});history=history.slice(-2);
    {const r=render(text,items,by.startsWith("Gemini"),already);out.innerHTML=built+(built&&/I'm not sure how to help/.test(r)?"":r)}
    out.innerHTML+=`<div class="aimeta">Answered by ${esc(by)}</div>`;
  }catch(e){
    out.innerHTML=`<div class="ainote">Something went wrong (${esc(String(e&&e.message||e)).slice(0,120)}). Try again.</div>`;
  }
  busy=false;
}
bar.addEventListener("submit",ev=>{ev.preventDefault();send(aq.value)});
// Used by the Search tab: the built sentence (or the exact hand-written card) for a whole sentence.
function buildFor(q){
  if(!tok){   // the word checker is still loading: redo the search when it is ready
    ensureTok().then(()=>{const el=document.getElementById("q");if(tok&&el&&el.value.trim()===q&&window.search)window.search()});
    return"";
  }
  try{
    const same=exactSent(q);
    if(same)return quoted(q)?`<div class="aimeta">A hand-written card says exactly this:</div>`+cardHTML(same.x.e,same.x.where):"";
    return ruleFill(q)||composeHTML(q)||"";
  }catch(e){return""}
}
(window.requestIdleCallback||setTimeout)(()=>ensureTok(),{timeout:5000});   // load the word checker in the background at startup
window.__ask={build:buildFor,ruleFill,retrieve,check:s=>check(s),render,romaji,send,show,drawPanel,bestModel,
  compose:q=>{const r=compose(q);return r&&{jp:r.chunks.map(c=>c[0]).join(""),romaji:r.chunks.map(c=>c[1]==null?c[0]:romaji(c[1])).join(" "),used:r.used.map(u=>u.jp+"="+u.en)}},
  wordsHTML,word:(e,t)=>word(e,t),pref:()=>PREF,byJP,exactSent,
  state:()=>({key:!!gKey(),model:gModel(),tok:!!tok}),ready:()=>ensureTok(),clear:()=>{history=[]}};
})();
