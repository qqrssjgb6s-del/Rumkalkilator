// === Konstanten ===
const HOURLY = { unterhalt: 35, sonder: 60 };
const SOIL = { S1: 0.8, S2: 1.0, S3: 1.3, S4: 1.7, S5: 2.2 };
const BASE_MIN = { Büro: 1.2, Bad: 2.5, Küche: 2.2, Flur: 0.8, Wohnraum: 1.0, Treppenhaus: 1.5, Sonstiges: 1.2 };
const FLOOR_MUL = { Fliesen: 1.0, Teppich: 1.3, Parkett: 1.1, PVC: 1.0, Naturstein: 1.4 };

// === Utils ===
const E = (v)=> (v||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
function minToHH(min){ if(!min||min<=0) return '–'; const h=Math.floor(min/60), m=Math.round(min%60); return `${h}h ${m}m`; }
function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function closestRoom(el){ return el.closest('.room'); }
function num(id, def=0){ const el=document.getElementById(id); const v=parseFloat(el?.value); return isNaN(v)?def:v; }
function showMsg(text, isErr=false){ const m=q('#msg'); if(!m) return; m.textContent = text; m.className = 'muted' + (isErr?' danger':''); setTimeout(()=>{ m.textContent=''; }, 3000); }

// === State ===
let rooms = [];

// === DOM Ready ===
document.addEventListener('DOMContentLoaded', ()=>{
  // Delegated clicks
  document.body.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const act = btn.getAttribute('data-action');
    if(act === 'add-room') return onAddRoom();
    if(act === 'add-images') return onAddImages(btn);
    if(act === 'ai-suggest') return onAiSuggest(btn);
  });

  // Recalculate on inputs
  document.body.addEventListener('input', (e)=>{
    if(e.target.matches('input, select')) calcAll();
  });

  const printBtn = q('#printBtn');
  if (printBtn) printBtn.addEventListener('click', ()=> window.print());

  // Create first room automatically
  onAddRoom();
});

// === Raum hinzufügen ===
function onAddRoom(){
  try{
    const tpl = q('#roomTemplate');
    const node = tpl.content.firstElementChild.cloneNode(true);
    q('#rooms').appendChild(node);
    rooms.push(node);
    calcAll();
    showMsg('Raum hinzugefügt.');
  } catch(e){
    showMsg('Fehler beim Hinzufügen des Raums.', true);
    console.error(e);
  }
}

// === Bilder hinzufügen ===
function onAddImages(btn){
  const room = closestRoom(btn);
  if (!room) return;
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true;
  picker.onchange = async ()=>{
    for (const f of picker.files){
      const url = await fileToDataURL(f);
      const img = new Image(); img.src = url; q('[data-thumbs]', room).appendChild(img);
      const arr = JSON.parse(room.dataset.images||'[]'); arr.push(url); room.dataset.images = JSON.stringify(arr);
    }
    calcAll();
  };
  picker.click();
}

function fileToDataURL(file){
  return new Promise((res, rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

// === KI-Vorschlag (heuristisch) ===
async function onAiSuggest(btn){
  const room = closestRoom(btn);
  const note = q('[data-aiNote]', room);
  try{
    const images = JSON.parse(room.dataset.images||'[]');
    if(!images.length){ note.textContent = 'Bitte zuerst Fotos hinzufügen.'; return; }
    note.textContent = 'Analysiere Fotos ...';
    const take = images.slice(0,5);
    let scores = [];
    for (const src of take){
      const img = await loadImage(src);
      const {avgLum, stdLum, avgSat} = analyzeImage(img, 192);
      let score = 0.6*norm(stdLum, 0, 80) + 0.2*(1 - norm(avgLum, 20, 220)) + 0.2*norm(avgSat, 0, 120);
      scores.push(score);
    }
    const s = scores.sort((a,b)=>b-a)[0];
    const grade = scoreToS(s);
    q('[data-soil]', room).value = grade;
    note.textContent = 'Vorschlag: ' + grade;
    calcAll();
  } catch(e){
    note.textContent = 'KI-Vorschlag nicht möglich.';
    console.error(e);
  }
}

function norm(v, lo, hi){ const x = (v - lo)/(hi - lo || 1); return Math.max(0, Math.min(1, x)); }
function scoreToS(score){ if(score<0.18) return 'S1'; if(score<0.36) return 'S2'; if(score<0.58) return 'S3'; if(score<0.78) return 'S4'; return 'S5'; }
function loadImage(src){ return new Promise((res, rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
function analyzeImage(img, size){
  const c=document.createElement('canvas'); const ctx=c.getContext('2d', { willReadFrequently: true });
  c.width=size; c.height=size;
  const ratio=Math.max(size/img.width, size/img.height);
  const w=img.width*ratio, h=img.height*ratio;
  const x=(size-w)/2, y=(size-h)/2;
  ctx.drawImage(img, x, y, w, h);
  const {data}=ctx.getImageData(0,0,size,size);
  let sumL=0, sumL2=0, sumSat=0, n=size*size;
  for(let i=0;i<data.length;i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    const lum=0.2126*r + 0.7152*g + 0.0722*b;
    const maxc=Math.max(r,g,b), minc=Math.min(r,g,b);
    const sat=maxc===0?0:(maxc-minc);
    sumL+=lum; sumL2+=lum*lum; sumSat+=sat;
  }
  const avgLum=sumL/n;
  const stdLum=Math.sqrt(sumL2/n - avgLum*avgLum);
  const avgSat=sumSat/n;
  return {avgLum,stdLum,avgSat};
}

// === Kalkulation ===
function calcAll(){
  try{
    let sumNet=0, sumVat=0, sumGross=0, sumTime=0;
    const team=Math.max(1, parseInt(q('#teamSize').value||'1',10));
    qa('.room').forEach(room=>{
      const r=readRoom(room);
      const result=calcRoom(r);
      writeRoom(room, result);
      sumNet+=result.net; sumVat+=result.vat; sumGross+=result.gross; sumTime+=result.timeMin;
    });
    q('#sumNet').textContent = E(sumNet);
    q('#sumVat').textContent = E(sumVat);
    q('#sumGross').textContent = E(sumGross);
    q('#sumTime').textContent = Math.round(sumTime) + ' Min';
    const finish = sumTime/60/team;
    q('#sumFinish').textContent = finish>0 ? (finish.toLocaleString('de-DE',{maximumFractionDigits:2}) + ' Std (Team ' + team + ')') : '–';
  } catch(e){
    showMsg('Fehler bei der Berechnung.', true);
    console.error(e);
  }
}

function readRoom(room){
  return {
    cleanType: q('#cleanType').value,
    overhead: parseFloat(q('#overhead').value||'10')/100,
    profit: parseFloat(q('#profit').value||'15')/100,
    vat: parseFloat(q('#vat').value||'19')/100,
    materialPerM2: parseFloat(q('#materialPerM2').value||'0')||0,
    machineFee: parseFloat(q('#machineFee').value||'0')||0,
    setupMin: parseFloat(q('#setupMin').value||'0')||0,
    distanceKm: parseFloat(q('#distanceKm').value||'0')||0,
    speed: Math.max(1, parseFloat(q('#speed').value||'35')),
    parkingMin: parseFloat(q('#parkingMin').value||'0')||0,
    area: parseFloat(q('[data-area]', room).value||'0')||0,
    roomtype: q('[data-roomtype]', room).value,
    floor: q('[data-floor]', room).value,
    soil: q('[data-soil]', room).value,
    windowm2: parseFloat(q('[data-windowm2]', room).value||'0')||0,
    windowmin: parseFloat(q('[data-windowmin]', room).value||'0')||0,
    special: parseFloat(q('[data-special]', room)?.value||'0')||0,
    setupExtra: parseFloat(q('[data-setup]', room)?.value||'0')||0
  };
}
function calcRoom(r){
  const hourly = HOURLY[r.cleanType] || 35;
  const base = BASE_MIN[r.roomtype] || 1.2;
  const floorMul = FLOOR_MUL[r.floor] || 1.0;
  const soilMul = SOIL[r.soil] || 1.0;

  const travelMin = (r.distanceKm*2 / r.speed)*60;
  const timeClean = r.area*base*floorMul*soilMul + r.windowm2*r.windowmin + r.special + (r.setupMin + r.setupExtra) + travelMin + r.parkingMin;
  const laborCost = (timeClean/60)*hourly;
  const materialCost = r.area*r.materialPerM2 + r.machineFee;
  const overhead = (laborCost + materialCost)*r.overhead;
  const profit = (laborCost + materialCost + overhead)*r.profit;
  const net = laborCost + materialCost + overhead + profit;
  const vat = net*r.vat;
  const gross = net + vat;

  return { timeMin: timeClean, laborCost, materialCost, overhead, profit, net, vat, gross };
}
function writeRoom(room, res){
  q('[data-time]', room).textContent = Math.round(res.timeMin);
  q('[data-labor]', room).textContent = E(res.laborCost);
  q('[data-mat]', room).textContent = E(res.materialCost);
  q('[data-oh]', room).textContent = E(res.overhead);
  q('[data-profit]', room).textContent = E(res.profit);
  q('[data-net]', room).textContent = E(res.net);
  q('[data-gross]', room).textContent = E(res.gross);
  const team = Math.max(1, parseInt(q('#teamSize').value||'1',10));
  q('[data-finish]', room).textContent = minToHH(res.timeMin/team);
  const rn = q('[data-roomname]', room).value||'Raum';
  const rt = q('[data-roomtype]', room).value||'';
  q('.room-title', room).textContent = rn + ' · ' + rt;
}
