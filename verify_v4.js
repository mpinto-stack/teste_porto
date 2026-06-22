const featureMeta = {"wc": {"emoji": "🚻", "label": "WC"}, "parking": {"emoji": "🅿️", "label": "Estacionamento"}, "parking_limited": {"emoji": "🚗", "label": "Parking limitado"}, "restaurant": {"emoji": "🍽️", "label": "Restaurante/Bar"}, "lifeguard": {"emoji": "🛟", "label": "Vigiada"}, "accessible": {"emoji": "♿", "label": "Acessível"}, "blueflag": {"emoji": "🔵", "label": "Bandeira Azul"}, "surf": {"emoji": "🏄", "label": "Surf"}, "river": {"emoji": "🏞️", "label": "Rio + mar"}, "naturism": {"emoji": "🌿", "label": "Naturismo"}, "4x4": {"emoji": "🚙", "label": "4x4 recomendado"}, "stairs": {"emoji": "🪜", "label": "Muitas escadas"}, "trail": {"emoji": "🥾", "label": "Trilho"}, "tidepools": {"emoji": "🐚", "label": "Poças de maré"}};
const storageKeyFavs = 'praias.portoexplorer2026.favs';
const storageKeySelected = 'praias.portoexplorer2026.selected';
const storageKeyCompare = 'praias.portoexplorer2026.compare';
const storageKeyMode = 'praias.portoexplorer2026.mode';
const storageKeyDay = 'praias.portoexplorer2026.day';
let installPrompt = null;

const $ = id => document.getElementById(id);
const searchEl = $('search');
const beachList = $('beachList');
const resultCount = $('resultCount');
const detail = $('detail');
const statsEl = $('stats');
const sortSelect = $('sortSelect');
const windFilter = $('windFilter');
const airTempFilter = $('airTempFilter');
const waterTempFilter = $('waterTempFilter');
const driveFilter = $('driveFilter');
const categoryFilters = [...document.querySelectorAll('#quickFilters .seg')];
const mobileTabs = [...document.querySelectorAll('.mobile-tab')];
const modeButtons = [...document.querySelectorAll('.mode-btn')];
const dayButtons = [...document.querySelectorAll('.day-btn')];

let favorites = (() => { try { return new Set(JSON.parse(localStorage.getItem(storageKeyFavs) || '[]')); } catch { return new Set(); } })();
let compareSet = (() => { try { return new Set(JSON.parse(localStorage.getItem(storageKeyCompare) || '[]')); } catch { return new Set(); } })();
let activeCategory = 'all';
let activeMode = localStorage.getItem(storageKeyMode) || 'balanced';
let activeDay = Number(localStorage.getItem(storageKeyDay) || 0);
let selected = '';
let beaches = [];
let map = null, markers = new Map(), easyIcon = null, wildIcon = null, activeIcon = null;
let datasets = { weather: {items:[]}, forecast3d: {items:[]}, ipmaDay0: {data:[]}, ipmaDay1: {data:[]}, ipmaDay2: {data:[]}, warnings:[], seaLocations:[], meta:null, history:{entries:[]} };

const beachByName = n => beaches.find(b => b.name === n);
const normal = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c');
function saveFavorites(){ localStorage.setItem(storageKeyFavs, JSON.stringify([...favorites])); }
function saveCompare(){ localStorage.setItem(storageKeyCompare, JSON.stringify([...compareSet])); }
function saveMode(){ localStorage.setItem(storageKeyMode, activeMode); }
function saveDay(){ localStorage.setItem(storageKeyDay, String(activeDay)); }
function weatherByName(name){ return (datasets.weather.items || []).find(x => x.name === name) || {}; }
function forecastByName(name){ return (datasets.forecast3d.items || []).find(x => x.name === name) || {days:[]}; }
function toggleFavorite(name, rerender=true){ if (favorites.has(name)) favorites.delete(name); else favorites.add(name); saveFavorites(); if (rerender) rerenderEverything(); }
function toggleCompare(name){ if (compareSet.has(name)) compareSet.delete(name); else { if (compareSet.size >= 3){ const [first] = compareSet; compareSet.delete(first); } compareSet.add(name); } saveCompare(); rerenderEverything(); }
function haversine(lat1, lon1, lat2, lon2){ const R=6371; const p1=lat1*Math.PI/180, p2=lat2*Math.PI/180; const dphi=(lat2-lat1)*Math.PI/180, dl=(lon2-lon1)*Math.PI/180; const a=Math.sin(dphi/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return 2*R*Math.asin(Math.sqrt(a)); }
function nearestSeaIdForBeach(b){
  const locs=(datasets.seaLocations||[]).filter(x=>x.latitude&&x.longitude).map(x=>({...x, latitude:Number(x.latitude), longitude:Number(x.longitude)}));
  if(!locs.length){
    if(['Praia de Odeceixe','Praia das Adegas','Praia da Zambujeira do Mar','Praia dos Alteirinhos','Praia do Almograve','Praia do Malhão','Praia do Farol','Praia da Franquia','Praia das Furnas','Praia do Carvalhal (Odemira)','Praia dos Aivados','Praia da Ilha do Pessegueiro','Praia Grande de Porto Covo','Praia de São Torpes'].includes(b.name)) return 1151326;
    if(['Praia da Luz','Praia de Porto de Mós','Meia Praia','Praia Dona Ana','Praia do Camilo','Praia da Rocha','Praia do Vau','Praia dos Três Irmãos','Praia da Galé','Praia dos Salgados','Praia de São Rafael'].includes(b.name)) return 1080526;
    return 1081526;
  }
  let best=locs[0], bestD=Infinity;
  for(const l of locs){ const d=haversine(b.lat,b.lon,l.latitude,l.longitude); if(d<bestD){ bestD=d; best=l; } }
  return Number(best.globalIdLocal);
}
function nearestSeaNameForBeach(b){ const id=nearestSeaIdForBeach(b); const l=(datasets.seaLocations||[]).find(x=>Number(x.globalIdLocal)===Number(id)); return l?l.local:'zona costeira IPMA'; }
function seaDatasetForOffset(offset){ if(offset===1) return datasets.ipmaDay1||{data:[]}; if(offset===2) return datasets.ipmaDay2||{data:[]}; return datasets.ipmaDay0||{data:[]}; }
function seaRowForBeachByOffset(b, offset){ const id=nearestSeaIdForBeach(b); return (seaDatasetForOffset(offset).data||[]).find(x=>Number(x.globalIdLocal)===Number(id)) || null; }
function warnAreaForSeaId(id){ const byId={1081526:'FAR',1080526:'FAR',1151326:'STB',1111026:'LSB',1060526:'CBR',1130826:'PTO',1160926:'VCT'}; return byId[Number(id)] || 'FAR'; }
function waterAvgForBeach(b, offset=0){ const r=seaRowForBeachByOffset(b, offset); if(!r) return null; const a=Number(r.sstMin), c=Number(r.sstMax); if(Number.isFinite(a)&&Number.isFinite(c)) return (a+c)/2; if(Number.isFinite(a)) return a; if(Number.isFinite(c)) return c; return null; }
function waveAvgForBeach(b, offset=0){ const r=seaRowForBeachByOffset(b, offset); if(!r) return null; const a=Number(r.waveHighMin), c=Number(r.waveHighMax); if(Number.isFinite(a)&&Number.isFinite(c)) return (a+c)/2; if(Number.isFinite(a)) return a; if(Number.isFinite(c)) return c; return null; }
function windForBeach(b, offset=0){ if(offset===0){ const w=Number(weatherByName(b.name).wind_speed_10m); return Number.isFinite(w)?w:null; } const day=(forecastByName(b.name).days||[])[offset]; const w=Number(day && day.wind_speed_10m_max); return Number.isFinite(w)?w:null; }
function airTempForBeach(b, offset=0){ if(offset===0){ const t=Number(weatherByName(b.name).temperature_2m); return Number.isFinite(t)?t:null; } const day=(forecastByName(b.name).days||[])[offset]; const tmax=Number(day && day.temp_max), tmin=Number(day && day.temp_min); if(Number.isFinite(tmax)&&Number.isFinite(tmin)) return (tmax+tmin)/2; if(Number.isFinite(tmax)) return tmax; if(Number.isFinite(tmin)) return tmin; return null; }
function weatherCodeForBeach(b, offset=0){ if(offset===0) return weatherByName(b.name).weather_code; const day=(forecastByName(b.name).days||[])[offset]; return day ? day.weather_code : null; }
function dirToText(deg){ if(deg==null || Number.isNaN(deg)) return '—'; const dirs=['N','NE','E','SE','S','SO','O','NO']; return dirs[Math.round(((deg%360)/45))%8]; }
function weatherCodeText(code){ const map={0:'céu limpo',1:'pouco nublado',2:'parcialmente nublado',3:'nublado',45:'nevoeiro',48:'nevoeiro',51:'chuvisco fraco',53:'chuvisco',55:'chuvisco forte',61:'chuva fraca',63:'chuva',65:'chuva forte',80:'aguaceiros',81:'aguaceiros',82:'aguaceiros fortes',95:'trovoada'}; return map[code] || 'condições variáveis'; }
function maritimeWarnLabel(level){ const map={green:'Sem aviso',yellow:'Amarelo',orange:'Laranja',red:'Vermelho'}; return map[level] || level || 'Sem aviso'; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function formatLocal(ts){ if(!ts) return '—'; return new Intl.DateTimeFormat('pt-PT',{dateStyle:'short', timeStyle:'short'}).format(new Date(ts)); }
function formatDay(dateStr){ return new Intl.DateTimeFormat('pt-PT',{weekday:'short', day:'2-digit', month:'2-digit'}).format(new Date(dateStr + 'T12:00:00')); }
function formatDayLabel(offset){ return ['Hoje','Amanhã','Daqui a 2 dias'][offset] || 'Dia'; }


function computeFreshness(){
  const t = datasets.meta && datasets.meta.generated_at_local;
  if(!t) return {level:'bad', label:'🔴 sem update', ageH:999};
  const ageH = (Date.now() - new Date(t).getTime()) / 3600000;
  if(ageH <= 4.5) return {level:'ok', label:'🟢 dados frescos', ageH};
  if(ageH <= 8.5) return {level:'warn', label:'🟡 precisa de refresh', ageH};
  return {level:'bad', label:'🔴 dados antigos', ageH};
}
function refreshFreshnessUi(){
  const st = computeFreshness();
  const pill = $('freshnessPill');
  pill.className = `status-pill ${st.level==='ok'?'ok':st.level==='warn'?'warn':'bad'}`;
  pill.textContent = st.label;
  $('lastUpdateText').textContent = datasets.meta && datasets.meta.generated_at_local ? `Último update: ${formatLocal(datasets.meta.generated_at_local)}` : 'Último update: ainda não existe';
}
async function loadBeaches(){
  const data = await fetch('data/beaches_source.json', {cache:'no-store'}).then(r=>r.json());
  if(!Array.isArray(data)) throw new Error('beaches_source.json inválido');
  beaches = data;
}
async function loadLocalData(){
  const [weather, forecast3d, ipmaDay0, ipmaDay1, ipmaDay2, warnings, seaLocations, meta, history] = await Promise.all([
    fetch('data/weather_snapshot.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({items:[]})),
    fetch('data/weather_forecast_3d.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({items:[]})),
    fetch('data/ipma/sea_day0.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({data:[]})),
    fetch('data/ipma/sea_day1.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({data:[]})),
    fetch('data/ipma/sea_day2.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({data:[]})),
    fetch('data/ipma/warnings.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>[]),
    fetch('data/ipma/sea_locations.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>[]),
    fetch('data/meta.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>null),
    fetch('data/update_history.json', {cache:'no-store'}).then(r=>r.json()).catch(()=>({entries:[]})),
  ]);
  datasets = {weather, forecast3d, ipmaDay0, ipmaDay1, ipmaDay2, warnings, seaLocations, meta, history};
  refreshFreshnessUi();
}
function parseUrlState(){
  const url = new URL(location.href);
  selected = decodeURIComponent((url.hash || '').replace('#',''));
  searchEl.value = url.searchParams.get('q') || '';
  activeCategory = url.searchParams.get('cat') || 'all';
  activeMode = url.searchParams.get('mode') || localStorage.getItem(storageKeyMode) || 'balanced';
  activeDay = Number(url.searchParams.get('day') || localStorage.getItem(storageKeyDay) || 0);
  if(![0,1,2].includes(activeDay)) activeDay = 0;
  sortSelect.value = url.searchParams.get('sort') || 'drive';
  windFilter.value = url.searchParams.get('wind') || 'all';
  airTempFilter.value = url.searchParams.get('air') || 'all';
  waterTempFilter.value = url.searchParams.get('water') || 'all';
  driveFilter.value = url.searchParams.get('drive') || 'all';
  const cmp = (url.searchParams.get('cmp') || '').split('|').map(s=>s.trim()).filter(Boolean);
  if(cmp.length) compareSet = new Set(cmp);
}
function updateUrl(){
  const url = new URL(location.href);
  if(selected) url.hash = encodeURIComponent(selected); else url.hash = '';
  const setOrDelete = (k,v,def='') => { if(v!==undefined && v!==null && String(v)!==String(def) && String(v)!=='') url.searchParams.set(k,String(v)); else url.searchParams.delete(k); };
  setOrDelete('q', searchEl.value.trim());
  setOrDelete('cat', activeCategory, 'all');
  setOrDelete('mode', activeMode, 'balanced');
  setOrDelete('day', activeDay, 0);
  setOrDelete('sort', sortSelect.value, 'drive');
  setOrDelete('wind', windFilter.value, 'all');
  setOrDelete('air', airTempFilter.value, 'all');
  setOrDelete('water', waterTempFilter.value, 'all');
  setOrDelete('drive', driveFilter.value, 'all');
  if(compareSet.size) url.searchParams.set('cmp', [...compareSet].join('|')); else url.searchParams.delete('cmp');
  history.replaceState(null, '', url.toString());
}


function redFlagsForBeach(b){
  const flags = [];
  const f = new Set(b.features || []);
  if(f.has('stairs')) flags.push({type:'bad', label:'🪜 muitas escadas'});
  if(f.has('trail')) flags.push({type:'warn', label:'🥾 trilho'});
  if(f.has('4x4')) flags.push({type:'bad', label:'🚙 4x4 recomendado'});
  if(f.has('parking_limited')) flags.push({type:'warn', label:'🚗 parking limitado'});
  if((b.drive_min || 0) >= 60) flags.push({type:'warn', label:'🕒 deslocação longa'});
  if((b.family_score || 0) < 4.5) flags.push({type:'bad', label:'👶 pouca praticidade familiar'});
  const caution = normal(b.caution || '');
  if(caution.includes('vento')) flags.push({type:'warn', label:'💨 exposta ao vento'});
  if(caution.includes('mar forte') || caution.includes('ondula') || caution.includes('correntes')) flags.push({type:'bad', label:'🌊 mar mais exigente'});
  if(caution.includes('cheia') || caution.includes('concorrid')) flags.push({type:'warn', label:'👥 pode encher'});
  return flags.slice(0,5);
}
function scoreBeach(b, mode=activeMode, dayOffset=activeDay){
  const family=(b.family_score||5)/10*30;
  const air=airTempForBeach(b,dayOffset), water=waterAvgForBeach(b,dayOffset), wind=windForBeach(b,dayOffset), wave=waveAvgForBeach(b,dayOffset);
  const airScore=air==null?10:clamp(1-Math.abs(air-24)/10,0,1)*20;
  const waterScore=water==null?8:clamp((water-15)/8,0,1)*20;
  const windScore=wind==null?8:clamp(1-wind/35,0,1)*20;
  const waveScore=wave==null?6:clamp(1-Math.abs(wave-0.9)/1.2,0,1)*10;
  const easyBonus=b.category==='Acesso fácil + facilidades'?3:0;
  const webcamBonus=b.livecam?2:0;
  const driveScore=clamp(1-(b.drive_min||120)/120,0,1)*5;
  let total=family+airScore+waterScore+windScore+waveScore+easyBonus+webcamBonus+driveScore;
  if(mode==='family') total += family*0.45 + easyBonus*4 + ((b.features||[]).includes('accessible')?4:0) + ((b.features||[]).includes('wc')?3:0);
  if(mode==='easy') total += easyBonus*8 + ((b.features||[]).includes('parking')?4:0) + ((b.features||[]).includes('restaurant')?4:0) + driveScore*2;
  if(mode==='quiet') total += (b.category==='Mais selvagem / mais sossegada'?16:0) + ((b.drive_min||0)>35?2:0) - ((b.features||[]).includes('blueflag')?1:0);
  if(mode==='near') total += clamp(60-(b.drive_min||120),0,60)*0.6;
  if(mode==='surf') total += ((b.features||[]).includes('surf')?14:0) + (wave??0.9)*4;
  return total;
}
function decisionForBeach(b, dayOffset=activeDay){
  const sc=scoreBeach(b,activeMode,dayOffset);
  const freshness=computeFreshness();
  const flags=redFlagsForBeach(b);
  let status='maybe'; let label='🟡 Maybe';
  if(sc>=74 && freshness.level!=='bad' && flags.filter(x=>x.type==='bad').length<2){ status='go'; label='🟢 Go'; }
  else if(sc<58 || (freshness.level==='bad'&&dayOffset===0) || flags.filter(x=>x.type==='bad').length>=2){ status='nogo'; label='🔴 No-Go'; }
  return {status, label, score:sc};
}
function topReasons(b, mode=activeMode, dayOffset=activeDay){
  const reasons=[];
  if(mode==='family') reasons.push(`família ${b.family_score.toFixed(1)}/10`);
  if(mode==='easy' && b.category==='Acesso fácil + facilidades') reasons.push('acesso simples');
  if(mode==='quiet' && b.category==='Mais selvagem / mais sossegada') reasons.push('mais sossegada');
  if(mode==='near') reasons.push(`~${b.drive_min} min de carro`);
  if(mode==='surf' && (b.features||[]).includes('surf')) reasons.push('boa para ondas');
  const wind=windForBeach(b,dayOffset), air=airTempForBeach(b,dayOffset), water=waterAvgForBeach(b,dayOffset);
  if(Number.isFinite(wind)) reasons.push(`${wind.toFixed(0)} km/h vento`);
  if(Number.isFinite(water)) reasons.push(`${water.toFixed(1)}°C água`);
  if(Number.isFinite(air)) reasons.push(`${air.toFixed(0)}°C ar`);
  if(b.livecam) reasons.push('com webcam');
  if((b.features||[]).includes('river')) reasons.push('rio + mar');
  return [...new Set(reasons)].slice(0,3);
}
function explainScore(b, dayOffset=activeDay){
  const parts = topReasons(b, activeMode, dayOffset);
  return parts.length ? parts.join(' · ') : 'bom equilíbrio geral';
}
function topThreeBeachesForOffset(offset){ return [...beaches].sort((a,b)=>scoreBeach(b,activeMode,offset)-scoreBeach(a,activeMode,offset)).slice(0,3); }
function getBestWindow(b){ const scores=[0,1,2].map(d=>({d,score:scoreBeach(b,activeMode,d)})); scores.sort((a,b)=>b.score-a.score); return scores[0]; }
function bestAlternatives(name){
  const b = beachByName(name); if(!b) return [];
  const others = beaches.filter(x=>x.name!==name);
  const byWind=[...others].filter(x=>windForBeach(x,activeDay)!=null).sort((a,b)=>(windForBeach(a,activeDay)??999)-(windForBeach(b,activeDay)??999))[0];
  const byFamily=[...others].sort((a,b)=>(b.family_score||0)-(a.family_score||0))[0];
  const byNear=[...others].sort((a,b)=>(a.drive_min||999)-(b.drive_min||999))[0];
  const uniq=[]; [byWind,byFamily,byNear].forEach(x=>{ if(x && !uniq.some(y=>y.name===x.name)) uniq.push(x); });
  return uniq.slice(0,3);
}


function renderStats(){
  const total=beaches.length, easy=beaches.filter(b=>b.category==='Acesso fácil + facilidades').length, webcams=beaches.filter(b=>!!b.livecam).length, upTo60=beaches.filter(b=>b.drive_min<=60).length;
  statsEl.innerHTML = `<div class="stat"><div class="k">Total</div><div class="v">${total}</div></div><div class="stat"><div class="k">Até 60 min</div><div class="v">${upTo60}</div></div><div class="stat"><div class="k">Acesso fácil</div><div class="v">${easy}</div></div><div class="stat"><div class="k">Com webcam</div><div class="v">${webcams}</div></div>`;
}
function renderBriefing(){
  const holder=$('briefingWrap');
  const briefTop=topThreeBeachesForOffset(activeDay);
  const best=briefTop[0];
  const bestFamily=[...beaches].sort((a,b)=>scoreBeach(b,'family',activeDay)-scoreBeach(a,'family',activeDay))[0];
  const bestEasy=[...beaches].sort((a,b)=>scoreBeach(b,'easy',activeDay)-scoreBeach(a,'easy',activeDay))[0];
  const lowWind=[...beaches].sort((a,b)=>(windForBeach(a,activeDay)??999)-(windForBeach(b,activeDay)??999))[0];
  const beachLink = (b) => b ? `<a href="#${encodeURIComponent(b.name)}" class="brief-link" data-open-beach="${b.name}">${b.name}</a>` : '—';
  holder.innerHTML = `<div class="grid2"><div class="briefing-card"><div class="brief-title">Resumo principal — ${formatDayLabel(activeDay)}</div><div class="brief-line"><strong>Melhor geral:</strong> ${beachLink(best)} ${best?`(${decisionForBeach(best,activeDay).label})`:''}</div><div class="brief-line"><strong>Melhor para família:</strong> ${beachLink(bestFamily)}</div><div class="brief-line"><strong>Opção mais simples:</strong> ${beachLink(bestEasy)}</div><div class="brief-line"><strong>Plano B com menos vento:</strong> ${beachLink(lowWind)}</div><div class="brief-line"><strong>Modo ativo:</strong> ${activeMode}</div></div><div class="briefing-card"><div class="brief-title">Top 3 rápido</div>${briefTop.map((b,i)=>`<div class="brief-line"><a href="#${encodeURIComponent(b.name)}" class="inline-beach-link" data-open-beach="${b.name}"><strong>#${i+1} ${b.name}</strong></a> — ${decisionForBeach(b,activeDay).label} — ${explainScore(b,activeDay)}</div>`).join('') || '<div class="brief-line">Sem dados.</div>'}</div></div>`;
  bindOpenBeachLinks(holder);
}
function renderHealth(){
  const holder=$('healthWrap');
  const freshness=computeFreshness();
  const entries=(datasets.history&&datasets.history.entries)||[];
  holder.innerHTML = `<div class="grid2"><div class="health-card"><div class="brief-title">Estado</div><div class="brief-line"><span class="status-pill ${freshness.level==='ok'?'ok':freshness.level==='warn'?'warn':'bad'}">${freshness.label}</span></div><div class="brief-line"><strong>Último update:</strong> ${datasets.meta&&datasets.meta.generated_at_local?formatLocal(datasets.meta.generated_at_local):'—'}</div><div class="brief-line"><strong>Idade dos dados:</strong> ${Number.isFinite(freshness.ageH)?freshness.ageH.toFixed(1)+' h':'—'}</div><div class="brief-line"><strong>Cadência esperada:</strong> ≤ 4 horas</div></div><div class="health-card"><div class="brief-title">Cobertura</div><div class="brief-line"><strong>Praias base:</strong> ${beaches.length}</div><div class="brief-line"><strong>Snapshot tempo:</strong> ${(datasets.weather.items||[]).length}</div><div class="brief-line"><strong>Previsão 3 dias:</strong> ${(datasets.forecast3d.items||[]).length}</div><div class="brief-line"><strong>Pontos IPMA:</strong> ${(datasets.ipmaDay0.data||[]).length}</div><div class="brief-line"><strong>Entradas de histórico:</strong> ${entries.length}</div></div></div>`;
}
function renderTemporal(){
  const holder=$('temporalWrap');
  holder.innerHTML = [0,1,2].map(offset => {
    const top=topThreeBeachesForOffset(offset);
    return `<div class="temporal-col"><h3>${formatDayLabel(offset)}</h3>${top.map((b,i)=>`<div class="temporal-item"><a href="#${encodeURIComponent(b.name)}" class="inline-beach-link" data-open-beach="${b.name}"><strong>#${i+1} ${b.name}</strong></a><div class="brief-line">${decisionForBeach(b,offset).label} · ${explainScore(b,offset)}</div></div>`).join('') || '<div class="temporal-item">Sem dados.</div>'}</div>`;
  }).join('');
  bindOpenBeachLinks(holder);
}
function buildPopupHtml(b){
  const dec=decisionForBeach(b,activeDay);
  return `<div><strong>${b.name}</strong><br>${dec.label}<br>${b.drive_min} min de carro<br><a href="${b.gmaps}" target="_blank" rel="noopener">Google Maps</a></div>`;
}
function initMap(){
  if(!window.L) return;
  if(map){ map.remove(); markers=new Map(); }
  map=L.map('map',{scrollWheelZoom:true}).setView([41.16,-8.58],10.1);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
  easyIcon=L.divIcon({className:'beach-pin',html:'<div style="width:16px;height:16px;border-radius:999px;background:#0f766e;border:3px solid white;box-shadow:0 0 0 3px rgba(15,118,110,.22)"></div>',iconSize:[16,16],iconAnchor:[8,8]});
  wildIcon=L.divIcon({className:'beach-pin',html:'<div style="width:16px;height:16px;border-radius:999px;background:#c2410c;border:3px solid white;box-shadow:0 0 0 3px rgba(194,65,12,.22)"></div>',iconSize:[16,16],iconAnchor:[8,8]});
  activeIcon=L.divIcon({className:'beach-pin',html:'<div style="width:18px;height:18px;border-radius:999px;background:#1d4ed8;border:4px solid white;box-shadow:0 0 0 4px rgba(29,78,216,.22)"></div>',iconSize:[18,18],iconAnchor:[9,9]});
  beaches.forEach(b => {
    const icon=b.category.includes('fácil')?easyIcon:wildIcon;
    const m=L.marker([b.lat,b.lon],{icon}).addTo(map).bindPopup(buildPopupHtml(b));
    m.on('click',()=>selectBeach(b.name,true));
    markers.set(b.name,m);
  });
  const g=L.featureGroup([...markers.values()]);
  if(g.getLayers().length) map.fitBounds(g.getBounds().pad(0.08));
}
function getSorted(data){
  const copy=[...data];
  if(sortSelect.value==='alpha') return copy.sort((a,b)=>a.name.localeCompare(b.name,'pt'));
  if(sortSelect.value==='family') return copy.sort((a,b)=>b.family_score-a.family_score||a.drive_min-b.drive_min);
  if(sortSelect.value==='warm') return copy.sort((a,b)=>(waterAvgForBeach(b,activeDay)??-999)-(waterAvgForBeach(a,activeDay)??-999));
  if(sortSelect.value==='low_wind') return copy.sort((a,b)=>(windForBeach(a,activeDay)??999)-(windForBeach(b,activeDay)??999));
  if(sortSelect.value==='rank') return copy.sort((a,b)=>scoreBeach(b,activeMode,activeDay)-scoreBeach(a,activeMode,activeDay));
  if(activeMode!=='balanced') return copy.sort((a,b)=>scoreBeach(b,activeMode,activeDay)-scoreBeach(a,activeMode,activeDay));
  return copy.sort((a,b)=>a.drive_min-b.drive_min||a.name.localeCompare(b.name,'pt'));
}
function filteredBeaches(){
  const term=normal(searchEl.value.trim());
  const maxWind=windFilter.value==='all'?null:Number(windFilter.value);
  const minAir=airTempFilter.value==='all'?null:Number(airTempFilter.value);
  const minWater=waterTempFilter.value==='all'?null:Number(waterTempFilter.value);
  const maxDrive=driveFilter.value==='all'?null:Number(driveFilter.value);
  return getSorted(beaches.filter(b=>{
    const okCat=activeCategory==='all'||(activeCategory==='favorites'?favorites.has(b.name):activeCategory==='webcam'?!!b.livecam:activeCategory==='family_top'?b.family_score>=7:b.category===activeCategory);
    const bag=normal([b.name,b.category,b.notes,b.access,b.facilities,(b.best_for||[]).join(' '),(b.features||[]).join(' '),String(b.family_score),nearestSeaNameForBeach(b)].join(' '));
    const okSearch=!term||bag.includes(term);
    const wind=windForBeach(b,activeDay), air=airTempForBeach(b,activeDay), water=waterAvgForBeach(b,activeDay);
    const okWind=maxWind==null||(wind!=null&&wind<=maxWind);
    const okAir=minAir==null||(air!=null&&air>=minAir);
    const okWater=minWater==null||(water!=null&&water>=minWater);
    const okDrive=maxDrive==null||(b.drive_min<=maxDrive);
    return okCat&&okSearch&&okWind&&okAir&&okWater&&okDrive;
  }));
}
function badgesHtml(b){
  const dec=decisionForBeach(b,activeDay);
  return `<span class="badge ${b.category.includes('fácil')?'easy':'wild'}">${b.category.includes('fácil')?'Fácil':'Selvagem'}</span><span class="badge family-badge">Família ${b.family_score.toFixed(1)}/10</span><span class="decision ${dec.status==='go'?'go':dec.status==='maybe'?'maybe':'nogo'}">${dec.label}</span>`;
}
function cardMetricsHtml(b){
  const sea=seaRowForBeachByOffset(b,activeDay), water=waterAvgForBeach(b,activeDay), arr=[];
  const air=airTempForBeach(b,activeDay), wind=windForBeach(b,activeDay);
  if(Number.isFinite(air)) arr.push(`<span class="metric">🌡️ ${air.toFixed(0)}°C</span>`);
  if(Number.isFinite(wind)) arr.push(`<span class="metric">💨 ${wind.toFixed(0)} km/h</span>`);
  if(Number.isFinite(water)) arr.push(`<span class="metric">🌊 água ${water.toFixed(1)}°C</span>`);
  if(sea && sea.waveHighMax!=null) arr.push(`<span class="metric">↕️ onda ${sea.waveHighMin ?? '—'}–${sea.waveHighMax ?? '—'} m</span>`);
  if(b.livecam) arr.push(`<span class="metric">📷 webcam</span>`);
  return arr.join('');
}
function renderList(){
  const data=filteredBeaches();
  resultCount.textContent=`${data.length} praia${data.length===1?'':'s'} encontrada${data.length===1?'':'s'}`;
  beachList.innerHTML=data.map(b=>`<article class="card-item ${selected===b.name?'active':''}" data-name="${b.name}"><div class="title"><div class="title-stack"><button class="fav-btn" data-fav="${b.name}">${favorites.has(b.name)?'⭐':'☆'}</button><div style="flex:1"><h3>${b.name}</h3><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${badgesHtml(b)}</div></div></div><button class="compare-btn" data-compare="${b.name}">${compareSet.has(b.name)?'🆚':'＋'} comparar</button></div><div class="metric-row">${cardMetricsHtml(b)}</div><div class="card-desc">${sortSelect.value==='family'||activeCategory==='family_top'?b.family_note:b.notes}</div><div class="drive">🚗 ~${b.drive_min} min • ${explainScore(b)}</div></article>`).join('');
  document.querySelectorAll('.card-item').forEach(el=>el.addEventListener('click',ev=>{ if(ev.target.closest('.fav-btn')||ev.target.closest('.compare-btn')) return; selectBeach(el.dataset.name,true); if(window.innerWidth<=820) showMobileSection('detailSection'); }));
  document.querySelectorAll('.fav-btn').forEach(btn=>btn.addEventListener('click',ev=>{ ev.stopPropagation(); toggleFavorite(btn.dataset.fav); }));
  document.querySelectorAll('.compare-btn').forEach(btn=>btn.addEventListener('click',ev=>{ ev.stopPropagation(); toggleCompare(btn.dataset.compare); }));
  if(map && markers.size){
    const names=new Set(data.map(b=>b.name));
    markers.forEach((m,n)=>{ const bb=beachByName(n); m.setPopupContent(buildPopupHtml(bb)); names.has(n)?m.addTo(map):map.removeLayer(m); });
  }
  if((!selected || !data.some(b=>b.name===selected)) && data.length) selectBeach(data[0].name,false);
}


function forecast3Html(name){
  const f=(forecastByName(name).days)||[];
  if(!f.length) return `<div class="live-panel"><div class="st">Previsão próximos 3 dias</div><div class="foot">Ainda sem previsão publicada.</div></div>`;
  return `<div class="live-panel"><div class="live-head"><div><div class="st">Previsão próximos 3 dias</div><div class="count">Tempo estimado específico desta praia</div></div></div><div class="grid3">${f.map((day,idx)=>`<div class="live-card ${idx===activeDay?'winner-card':''}"><div class="live-label">${formatDay(day.date)}</div><div class="live-value">${day.temp_max ?? '—'}° / ${day.temp_min ?? '—'}°</div><div class="live-sub">${weatherCodeText(day.weather_code)} · 💨 ${day.wind_speed_10m_max ?? '—'} km/h</div></div>`).join('')}</div></div>`;
}
function alternativesHtml(name){
  const recs=bestAlternatives(name);
  if(!recs.length) return '';
  return `<div class="live-panel"><div class="st">Plano B automático</div><div class="grid3">${recs.map(x=>`<div class="live-card"><div class="live-label">${x.name}</div><div class="live-sub">${topReasons(x).join(' • ')}</div><div class="foot"><a href="#${encodeURIComponent(x.name)}" data-planb="${x.name}">Abrir esta praia</a></div></div>`).join('')}</div></div>`;
}
function renderWeatherPanel(name){
  const b=beachByName(name), holder=$('weatherDataWrap'); if(!b||!holder) return;
  const w=weatherByName(name)||{};
  const freshness=datasets.meta&&datasets.meta.generated_at_local?formatLocal(datasets.meta.generated_at_local):'sem update';
  const freshState = computeFreshness();
  const weatherPillClass = freshState.level==='ok'?'ok':freshState.level==='warn'?'warn':'bad';
  const weatherPillIcon = freshState.level==='ok'?'🟢':freshState.level==='warn'?'🟡':'🔴';
  holder.innerHTML=`<div class="live-panel"><div class="live-head"><div><div class="st">Tempo snapshot</div><div class="count">Último update: ${freshness}</div></div><span class="status-pill ${weatherPillClass}">${weatherPillIcon}</span></div><div class="live-grid"><div class="live-card"><div class="live-label">Ar</div><div class="live-value">${Number.isFinite(Number(w.temperature_2m))?Number(w.temperature_2m).toFixed(0):'—'}°C</div><div class="live-sub">${weatherCodeText(w.weather_code)}</div></div><div class="live-card"><div class="live-label">Vento</div><div class="live-value">${Number.isFinite(Number(w.wind_speed_10m))?Number(w.wind_speed_10m).toFixed(0):'—'} km/h</div><div class="live-sub">${dirToText(w.wind_direction_10m)} · ${w.wind_direction_10m ?? '—'}°</div></div><div class="live-card"><div class="live-label">Decisão</div><div class="live-value">${decisionForBeach(b,activeDay).label}</div><div class="live-sub">modo ${activeMode}</div></div><div class="live-card"><div class="live-label">Melhor janela</div><div class="live-value">${formatDayLabel(getBestWindow(b).d)}</div><div class="live-sub">score ${getBestWindow(b).score.toFixed(0)}</div></div></div><div class="foot">O briefing e o Top 3 mudam conforme o modo e o dia selecionados.</div></div>` + forecast3Html(name);
}
function renderSeaPanel(name){
  const b=beachByName(name), holder=$('seaDataWrap'); if(!b||!holder) return;
  const r=seaRowForBeachByOffset(b,activeDay);
  const seaId=nearestSeaIdForBeach(b);
  const warnArea=warnAreaForSeaId(seaId);
  const warn=(datasets.warnings||[]).find(w=>w.awarenessTypeName==='Agitação Marítima'&&w.idAreaAviso===warnArea);
  const seaName=nearestSeaNameForBeach(b);
  if(!r){ holder.innerHTML='<div class="live-panel"><div class="live-head"><div><div class="st">Mar (IPMA)</div><div class="count">Ainda sem dados locais</div></div><span class="status-pill warn">⚠️</span></div><div class="foot">Confirma a workflow e os ficheiros IPMA no repositório.</div></div>'; return; }
  holder.innerHTML=`<div class="live-panel"><div class="live-head"><div><div class="st">Mar (IPMA)</div><div class="count">Zona usada: ${seaName} · ${formatDayLabel(activeDay)}</div></div><span class="status-pill ${warn&&warn.awarenessLevelID&&warn.awarenessLevelID!=='green'?'warn':'ok'}">🌊 ${maritimeWarnLabel(warn&&warn.awarenessLevelID)}</span></div><div class="live-grid"><div class="live-card"><div class="live-label">Onda</div><div class="live-value">${r.waveHighMin ?? '—'}–${r.waveHighMax ?? '—'} m</div><div class="live-sub">altura prevista</div></div><div class="live-card"><div class="live-label">Período</div><div class="live-value">${r.wavePeriodMin ?? '—'}–${r.wavePeriodMax ?? '—'} s</div><div class="live-sub">IPMA day${activeDay}</div></div><div class="live-card"><div class="live-label">Direção</div><div class="live-value">${r.predWaveDir ?? '—'}</div><div class="live-sub">ondulação predominante</div></div><div class="live-card"><div class="live-label">Água</div><div class="live-value">${r.sstMin ?? '—'}–${r.sstMax ?? '—'}°C</div><div class="live-sub">SST prevista</div></div></div><div class="foot">Atualização automática configurada para correr no mínimo a cada 4 horas via GitHub Actions.</div></div>`;
}
function renderDetail(name){
  const b=beachByName(name); if(!b) return;
  const featureChips=(b.features||[]).map(f=>`<span class="fi">${(featureMeta[f]&&featureMeta[f].emoji)||'•'} ${(featureMeta[f]&&featureMeta[f].label)||f}</span>`).join('') + (b.livecam?`<span class="fi">📷 Webcam</span>`:'');
  const redFlags=redFlagsForBeach(b).map(x=>`<span class="flag ${x.type}">${x.label}</span>`).join('');
  const dec=decisionForBeach(b,activeDay);
  detail.innerHTML=`<div class="detail-top"><div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">${badgesHtml(b)}</div><h2>${favorites.has(b.name)?'⭐ ':''}${b.name}</h2><div class="subline"><span>🚗 ~${b.drive_min} min de carro</span><span>📍 ${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}</span><span>🥇 score ${scoreBeach(b,activeMode,activeDay).toFixed(0)}</span><span>📣 ${explainScore(b)}</span></div><div class="feature-icons">${featureChips}</div>${redFlags?`<div class="redflags">${redFlags}</div>`:''}</div><div class="cta"><button type="button" class="btn" id="favDetailBtn">${favorites.has(b.name)?'⭐ Favorita':'☆ Guardar favorita'}</button><button type="button" class="btn" id="compareDetailBtn">${compareSet.has(b.name)?'🆚 No comparador':'＋ Comparar'}</button><button type="button" class="btn" id="navigateBtn">🧭 Navegar</button><button type="button" class="btn secondary" id="refreshUIBtn">🔄 Recarregar dados</button><a class="btn primary" href="${b.gmaps}" target="_blank" rel="noopener">Abrir no Google Maps</a>${b.livecam?`<a class="btn secondary" href="${b.livecam.url}" target="_blank" rel="noopener">📷 ${b.livecam.label}</a>`:''}</div><div class="decision ${dec.status==='go'?'go':dec.status==='maybe'?'maybe':'nogo'}" style="margin-top:10px">${dec.label}</div></div><div class="detail-grid"><div class="box"><div class="st">Como chegar</div><p>${b.directions}</p></div><div class="box"><div class="st">Acesso</div><p>${b.access}</p></div><div class="box"><div class="st">Facilidades</div><p>${b.facilities}</p></div><div class="box"><div class="st">Família</div><p><strong>${b.family_score.toFixed(1)}/10</strong> · ${b.family_note}</p></div><div class="box"><div class="st">Melhor para</div><p>${(b.best_for||[]).join(' • ')}</p></div><div class="box"><div class="st">Atenção</div><p>${b.caution}</p></div></div><div id="weatherDataWrap"></div><div id="seaDataWrap"></div>${alternativesHtml(name)}`;
  $('favDetailBtn')?.addEventListener('click',()=>toggleFavorite(b.name));
  $('compareDetailBtn')?.addEventListener('click',()=>toggleCompare(b.name));
  $('navigateBtn')?.addEventListener('click',()=>{ const href=buildNavigateHref(b); try{ if(/Android/i.test(navigator.userAgent||'')) window.location.href=href; else window.open(href,'_blank','noopener'); } catch { window.open(b.gmaps,'_blank','noopener'); } });
  $('refreshUIBtn')?.addEventListener('click',()=>refreshDataWithFeedback());
  renderWeatherPanel(name); renderSeaPanel(name);
  document.querySelectorAll('[data-planb]').forEach(a=>a.addEventListener('click',ev=>{ ev.preventDefault(); selectBeach(a.dataset.planb,true); }));
}
function buildNavigateHref(b){ const geo=`geo:${b.lat},${b.lon}?q=${b.lat},${b.lon}(${encodeURIComponent(b.name)})`; const googleDir=`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lon}`; return /Android/i.test(navigator.userAgent||'') ? geo : googleDir; }
function renderCompare(){
  const holder=$('compareWrap');
  const items=[...compareSet].map(beachByName).filter(Boolean);
  if(!items.length){ holder.innerHTML='<div class="foot">Ainda não tens praias no comparador.</div>'; return; }
  const winner=[...items].sort((a,b)=>scoreBeach(b,activeMode,activeDay)-scoreBeach(a,activeMode,activeDay))[0];
  holder.innerHTML=`<div class="winner-card"><div class="brief-title">Conclusão automática</div><div class="brief-line">Melhor no modo <strong>${activeMode}</strong> para <strong>${formatDayLabel(activeDay)}</strong>: <strong>${winner.name}</strong> — ${decisionForBeach(winner,activeDay).label} — ${explainScore(winner)}</div></div><div class="grid3" style="margin-top:12px">${items.map(b=>`<div class="compare-col"><div class="compare-name">${b.name}</div><div class="compare-metric">🚗 ${b.drive_min} min</div><div class="compare-metric">👶 família ${b.family_score.toFixed(1)}/10</div><div class="compare-metric">🌡️ ar ${airTempForBeach(b,activeDay)==null?'—':airTempForBeach(b,activeDay).toFixed(0)+'°C'}</div><div class="compare-metric">💨 vento ${windForBeach(b,activeDay)==null?'—':windForBeach(b,activeDay).toFixed(0)+' km/h'}</div><div class="compare-metric">🌊 água ${waterAvgForBeach(b,activeDay)==null?'—':waterAvgForBeach(b,activeDay).toFixed(1)+'°C'}</div><div class="compare-metric">↕️ onda ${waveAvgForBeach(b,activeDay)==null?'—':waveAvgForBeach(b,activeDay).toFixed(1)+' m'}</div><div class="compare-metric">📣 ${explainScore(b)}</div><div class="compare-metric"><strong>${decisionForBeach(b,activeDay).label}</strong></div><div class="foot"><button class="mini-btn" data-remove-compare="${b.name}">Remover</button></div></div>`).join('')}</div>`;
  document.querySelectorAll('[data-remove-compare]').forEach(btn=>btn.addEventListener('click',()=>toggleCompare(btn.dataset.removeCompare)));
}
function renderHistory(){
  const entries=(datasets.history&&datasets.history.entries)||[];
  const holder=$('historyWrap');
  if(!entries.length){ holder.innerHTML='<div class="foot">Sem histórico ainda. A primeira execução da workflow vai preencher este painel.</div>'; return; }
  holder.innerHTML=`<div class="history-list">${entries.slice(0,8).map(e=>`<div class="history-item"><strong>${formatLocal(e.generated_at_local)}</strong> • praias: ${e.beaches_count ?? '—'} • tempo: ${e.weather_items ?? '—'} • previsão 3d: ${e.forecast_items ?? '—'} • mar: ${e.sea_points ?? '—'}</div>`).join('')}</div>`;
}


function selectBeach(name, fly){
  const b=beachByName(name); if(!b) return;
  selected=name; localStorage.setItem(storageKeySelected,name); updateUrl();
  if(map && markers.size){
    markers.forEach((m,beachName)=>{ const bb=beachByName(beachName); m.setIcon(beachName===name?activeIcon:(bb.category.includes('fácil')?easyIcon:wildIcon)); m.setPopupContent(buildPopupHtml(bb)); });
    const marker=markers.get(name); if(marker){ if(fly) map.flyTo([b.lat,b.lon],Math.max(map.getZoom(),11),{duration:0.8}); marker.openPopup(); }
  }
  renderDetail(name);
  document.querySelectorAll('.card-item').forEach(el=>el.classList.toggle('active', el.dataset.name===name));
}
function setCategory(btn){ categoryFilters.forEach(b=>b.classList.toggle('active',b===btn)); activeCategory=btn.dataset.filter; updateUrl(); renderList(); }
function setMode(btn){ modeButtons.forEach(b=>b.classList.toggle('active',b===btn)); activeMode=btn.dataset.mode; saveMode(); updateUrl(); rerenderEverything(); }
function setDay(btn){ dayButtons.forEach(b=>b.classList.toggle('active',b===btn)); activeDay=Number(btn.dataset.day); saveDay(); updateUrl(); rerenderEverything(); }
function resetFilters(){
  searchEl.value=''; windFilter.value='all'; airTempFilter.value='all'; waterTempFilter.value='all'; driveFilter.value='all'; sortSelect.value='drive'; activeCategory='all'; activeMode='balanced'; activeDay=0;
  categoryFilters.forEach((b,i)=>b.classList.toggle('active',i===0)); modeButtons.forEach((b,i)=>b.classList.toggle('active',i===0)); dayButtons.forEach((b,i)=>b.classList.toggle('active',i===0));
  saveMode(); saveDay(); updateUrl(); rerenderEverything();
}
function showMobileSection(id){ mobileTabs.forEach(t=>t.classList.toggle('active',t.dataset.target===id)); document.getElementById(id).scrollIntoView({behavior:'smooth',block:'start'}); }
async function refreshDataWithFeedback(){
  const before=datasets.meta&&datasets.meta.generated_at_local;
  await Promise.all([loadLocalData(), loadBeaches()]);
  const after=datasets.meta&&datasets.meta.generated_at_local;
  const nowTxt=new Intl.DateTimeFormat('pt-PT',{timeStyle:'short'}).format(new Date());
  $('reloadStatusText').textContent = before!==after ? `Recarregado às ${nowTxt} — foram encontrados dados novos.` : `Recarregado às ${nowTxt} — leitura feita, mas o último update continua igual.`;
  rerenderEverything();
}
function copyShareLink(){ updateUrl(); navigator.clipboard.writeText(location.href).then(()=>{ $('reloadStatusText').textContent='Link do estado atual copiado.'; }).catch(()=>{ $('reloadStatusText').textContent='Não consegui copiar automaticamente, mas o URL já ficou atualizado.'; }); }
function exportSummary(){
  const top=topThreeBeachesForOffset(activeDay);
  const lines=[];
  lines.push(`# Resumo do dia — ${formatDayLabel(activeDay)}`);
  lines.push(`Modo: ${activeMode}`);
  lines.push(`Último update: ${datasets.meta&&datasets.meta.generated_at_local?formatLocal(datasets.meta.generated_at_local):'—'}`);
  lines.push('');
  lines.push('## Top 3');
  top.forEach((b,i)=>lines.push(`${i+1}. ${b.name} — ${decisionForBeach(b,activeDay).label} — ${explainScore(b)}`));
  if(selected){
    lines.push(''); lines.push(`## Praia aberta: ${selected}`);
    bestAlternatives(selected).forEach(x=>lines.push(`Plano B: ${x.name} — ${explainScore(x)}`));
  }
  const blob = new Blob([lines.join('\n')], {type:'text/markdown;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`resumo_praias_${['hoje','amanha','dia2'][activeDay]}.md`; a.click(); URL.revokeObjectURL(a.href);
}
function rerenderEverything(){ renderStats(); renderBriefing(); renderHealth(); renderTemporal(); renderList(); renderCompare(); renderHistory(); if(selected) renderDetail(selected); refreshFreshnessUi(); }
function setupPwa(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.error);
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installPrompt=e; $('installAppBtn').style.display='inline-flex'; });
  $('installAppBtn').addEventListener('click', async ()=>{ if(!installPrompt){ $('reloadStatusText').textContent='Instalação não disponível neste browser/dispositivo agora.'; return; } installPrompt.prompt(); await installPrompt.userChoice.catch(()=>null); installPrompt=null; });
  window.addEventListener('online',()=> $('offlineBanner').style.display='none');
  window.addEventListener('offline',()=> $('offlineBanner').style.display='block');
  if(!navigator.onLine) $('offlineBanner').style.display='block';
}
async function initApp(){
  parseUrlState();
  await Promise.all([loadBeaches(), loadLocalData()]);
  selected = beachByName(selected) ? selected : (localStorage.getItem(storageKeySelected) || beaches[0].name);
  categoryFilters.forEach(btn=>btn.classList.toggle('active',btn.dataset.filter===activeCategory));
  const mb = modeButtons.find(btn=>btn.dataset.mode===activeMode) || modeButtons[0]; modeButtons.forEach(btn=>btn.classList.toggle('active',btn===mb));
  const db = dayButtons.find(btn=>Number(btn.dataset.day)===activeDay) || dayButtons[0]; dayButtons.forEach(btn=>btn.classList.toggle('active',btn===db));
  initMap(); rerenderEverything(); selectBeach(selected,false); setupPwa();
}
$('refreshLocalBtn').addEventListener('click',()=>refreshDataWithFeedback());
$('resetFilters').addEventListener('click',resetFilters);
$('showMapAll').addEventListener('click',()=>{ if(!map||!markers.size) return; const visible=filteredBeaches().map(b=>markers.get(b.name)).filter(Boolean); if(visible.length) map.fitBounds(L.featureGroup(visible).getBounds().pad(0.12)); if(window.innerWidth<=820) showMobileSection('mapSection'); });
$('shareStateBtn').addEventListener('click',copyShareLink);
$('clearCompareBtn').addEventListener('click',()=>{ compareSet=new Set(); saveCompare(); updateUrl(); rerenderEverything(); });
$('exportSummaryBtn').addEventListener('click',exportSummary);
mobileTabs.forEach(btn=>btn.addEventListener('click',()=>showMobileSection(btn.dataset.target)));
categoryFilters.forEach(btn=>btn.addEventListener('click',()=>setCategory(btn)));
modeButtons.forEach(btn=>btn.addEventListener('click',()=>setMode(btn)));
dayButtons.forEach(btn=>btn.addEventListener('click',()=>setDay(btn)));
searchEl.addEventListener('input',()=>{ updateUrl(); renderList(); });
sortSelect.addEventListener('change',()=>{ updateUrl(); rerenderEverything(); });
windFilter.addEventListener('change',()=>{ updateUrl(); renderList(); });
airTempFilter.addEventListener('change',()=>{ updateUrl(); renderList(); });
waterTempFilter.addEventListener('change',()=>{ updateUrl(); renderList(); });
driveFilter.addEventListener('change',()=>{ updateUrl(); renderList(); });
window.addEventListener('hashchange',()=>{ const name=decodeURIComponent(location.hash.replace('#','')); if(beachByName(name)) selectBeach(name,true); });
initApp().catch(err=>{ console.error(err); $('reloadStatusText').textContent='Erro ao carregar dados do site. Verifica console e ficheiros JSON publicados.'; });

