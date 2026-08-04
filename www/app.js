if(typeof pdfjsLib !== 'undefined'){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

(function(){
  if(!window.storage){
    const PREFIX = 'garaj_defteri:';
    window.storage = {
      get: async function(key){
        try{
          const raw = localStorage.getItem(PREFIX + key);
          if(raw === null) return null;
          return {key, value: raw};
        }catch(e){ return null; }
      },
      set: async function(key, value){
        try{
          localStorage.setItem(PREFIX + key, value);
          return {key, value};
        }catch(e){ return null; }
      },
      delete: async function(key){
        try{
          localStorage.removeItem(PREFIX + key);
          return {key, deleted:true};
        }catch(e){ return null; }
      },
      list: async function(prefix){
        try{
          const keys = [];
          for(let i=0;i<localStorage.length;i++){
            const k = localStorage.key(i);
            if(k && k.startsWith(PREFIX)){
              const shortKey = k.slice(PREFIX.length);
              if(!prefix || shortKey.startsWith(prefix)) keys.push(shortKey);
            }
          }
          return {keys};
        }catch(e){ return null; }
      }
    };
  }
})();

let vehicles = [];
let editingId = null;
let tempId = null;
let selectedType = 'otomobil';
let searchTerm = '';
let summaryYearFilter = 'all';
const STORAGE_KEY_BASE = 'vehicles';
function currentStorageKey(){
  return STORAGE_KEY_BASE + '_' + (accountType || 'bireysel');
}
const OTHER = '__diger__';

const TYPE_META = [
  {key:'otomobil', label:'Otomobil', icon:'🚗'},
  {key:'arazi', label:'Arazi Aracı', icon:'🚙'},
  {key:'atv', label:'ATV / Quad', icon:'🛺'},
  {key:'motor', label:'Motor', icon:'🏍️'},
  {key:'otobus', label:'Otobüs', icon:'🚌'},
  {key:'tir', label:'Tır', icon:'🚛'},
];

const STATUS_META = [
  {key:'aktif', label:'Aktif', icon:'✅'},
  {key:'pasif', label:'Pasif (Satıldı/Devredildi)', icon:'📦'},
];

const COLOR_META = [
  {name:'Beyaz', hex:'#F2F2F0', bg:'#FDFDFD'},
  {name:'Siyah', hex:'#2B2B2E', bg:'#DDDDDE'},
  {name:'Gri', hex:'#9CA3AF', bg:'#EFF0F2'},
  {name:'Gümüş', hex:'#C7CBCF', bg:'#F6F7F7'},
  {name:'Kırmızı', hex:'#D3342D', bg:'#F8DFDD'},
  {name:'Bordo', hex:'#7A2530', bg:'#EADCDE'},
  {name:'Mavi', hex:'#2C63C9', bg:'#DDE6F6'},
  {name:'Lacivert', hex:'#1E3A5F', bg:'#DBDFE5'},
  {name:'Açık Mavi', hex:'#AEE1FA', bg:'#F2FAFE'},
  {name:'Yeşil', hex:'#3E8E56', bg:'#E0EDE4'},
  {name:'Sarı', hex:'#E8C334', bg:'#FBF5DF'},
  {name:'Turuncu', hex:'#E8792E', bg:'#FBEADE'},
  {name:'Kahverengi', hex:'#6B4A34', bg:'#E7E2DF'},
  {name:'Bej', hex:'#D8CAB0', bg:'#F9F7F2'},
  {name:'Mor', hex:'#7C5CBF', bg:'#EAE5F5'},
];
const DEFAULT_CARD_COLOR = '#AEE1FA';
const DEFAULT_CARD_BG = '#F2FAFE';

function populateColors(){
  const sel = document.getElementById('f-color');
  sel.innerHTML = '<option value="">Renk seç…</option>' +
    COLOR_META.map(c=>`<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)}</option>`).join('') +
    `<option value="${OTHER}">Listede Yok / Diğer</option>`;
  document.getElementById('f-color-other-wrap').style.display = 'none';
}
function onColorChange(){
  const v = document.getElementById('f-color').value;
  document.getElementById('f-color-other-wrap').style.display = (v === OTHER) ? 'block' : 'none';
}
function colorToHex(name){
  if(!name) return DEFAULT_CARD_COLOR;
  const match = COLOR_META.find(c=> c.name.toLowerCase() === String(name).trim().toLowerCase());
  return match ? match.hex : DEFAULT_CARD_COLOR;
}
function colorToBg(name){
  if(!name) return DEFAULT_CARD_BG;
  const match = COLOR_META.find(c=> c.name.toLowerCase() === String(name).trim().toLowerCase());
  return match ? match.bg : DEFAULT_CARD_BG;
}

function normalizeAracTuru(raw){
  if(!raw) return null;
  let v = String(raw).toLowerCase().trim();
  v = v.replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c');
  if(TYPE_META.some(t=>t.key === v)) return v;
  if(v.includes('atv') || v.includes('quad')) return 'atv';
  if(v.includes('motosiklet') || v.includes('moped') || v.includes('motor')) return 'motor';
  if(v.includes('otobus') || v.includes('minibus')) return 'otobus';
  if(v.includes('kamyon') || v.includes('cekici') || v.includes('tir') || v.includes('romork')) return 'tir';
  if(v.includes('arazi') || v.includes('suv') || v.includes('pick')) return 'arazi';
  if(v.includes('otomobil') || v.includes('binek')) return 'otomobil';
  return null;
}

let activeTab = 'dashboard';
let statusFilter = 'aktif';
let selectedStatus = 'aktif';
let expandedCards = new Set();
let accountType = null;

const INSURANCE_COMPANIES = [
  'Allianz Sigorta','Axa Sigorta','Anadolu Sigorta','Ankara Sigorta','Sompo Sigorta',
  'HDI Sigorta','Mapfre Sigorta','Türkiye Sigorta','Ziraat Sigorta','Zurich Sigorta',
  'Ray Sigorta','Neova Sigorta','Quick Sigorta','Groupama Sigorta','Doğa Sigorta',
  'Bereket Sigorta','Unico Sigorta','Orient Sigorta','Ethica Sigorta','Gulf Sigorta',
  'Türk Nippon Sigorta','Corpus Sigorta'
];

const VEHICLE_DATA = {
  otomobil: {
    'Volkswagen': ['Polo','Golf','Passat','Jetta','T-Roc','Tiguan','Arteon'],
    'Renault': ['Clio','Megane','Symbol','Taliant','Captur','Austral','Talisman','Fluence'],
    'Fiat': ['Egea','Egea Cross','500','Panda','Doblo','Tipo','Fiorino'],
    'Ford': ['Focus','Fiesta','Kuga','Puma','Mondeo','EcoSport','Courier'],
    'Opel': ['Corsa','Astra','Insignia','Mokka','Crossland','Grandland'],
    'Toyota': ['Corolla','Yaris','C-HR','RAV4','Camry','Auris'],
    'Hyundai': ['i20','i10','Elantra','Tucson','Accent','Bayon','Kona'],
    'Honda': ['Civic','City','CR-V','Jazz','HR-V','Accord'],
    'Peugeot': ['208','301','308','2008','3008','508'],
    'Citroën': ['C3','C-Elysée','C4','C5 Aircross','Berlingo'],
    'Dacia': ['Sandero','Duster','Logan','Jogger','Spring'],
    'Skoda': ['Fabia','Octavia','Superb','Kamiq','Karoq'],
    'Nissan': ['Micra','Qashqai','Juke','X-Trail','Sentra'],
    'Mercedes-Benz': ['A-Serisi','C-Serisi','E-Serisi','CLA','GLA','GLC','S-Serisi'],
    'BMW': ['1 Serisi','2 Serisi','3 Serisi','5 Serisi','X1','X3','X5'],
    'Audi': ['A3','A4','A6','Q2','Q3','Q5'],
    'Kia': ['Picanto','Rio','Ceed','Sportage','Stonic','Niro'],
    'Seat': ['Ibiza','Leon','Arona','Ateca'],
    'Mazda': ['Mazda2','Mazda3','CX-5','CX-30'],
    'Mitsubishi': ['Space Star','ASX','Outlander','Lancer'],
    'Suzuki': ['Swift','Vitara','S-Cross','Baleno'],
    'Chevrolet': ['Cruze','Aveo','Spark'],
    'Volvo': ['S60','S90','XC40','XC60','XC90'],
    'Mini': ['Cooper','Countryman','Clubman'],
    'Alfa Romeo': ['Giulietta','Giulia','Stelvio'],
    'Lexus': ['ES','NX','RX','UX'],
    'Jaguar': ['XE','XF','F-Pace'],
    'Subaru': ['Impreza','XV','Forester'],
    'Porsche': ['911','Cayenne','Macan','Panamera'],
    'Togg': ['T10X'],
  },
  arazi: {
    'Jeep': ['Wrangler','Renegade','Compass','Grand Cherokee'],
    'Land Rover': ['Defender','Discovery','Range Rover','Range Rover Sport','Range Rover Evoque'],
    'Toyota': ['Land Cruiser','Land Cruiser Prado','4Runner','Hilux'],
    'Suzuki': ['Jimny'],
    'Nissan': ['Patrol','X-Trail'],
    'Mitsubishi': ['Pajero','Pajero Sport','L200'],
    'Lada': ['Niva'],
    'UAZ': ['Patriot','Hunter'],
    'Ford': ['Bronco','Everest','Ranger'],
    'Mercedes-Benz': ['G-Serisi'],
    'Isuzu': ['D-Max'],
  },
  atv: {
    'CFMOTO': ['CForce 450','CForce 520','CForce 625','CForce 1000','ZForce 800'],
    'Can-Am': ['Outlander 450','Outlander 570','Outlander 850','Renegade 570','Maverick'],
    'Polaris': ['Sportsman 450','Sportsman 570','Sportsman 850','RZR 570','RZR XP 1000'],
    'Yamaha': ['Grizzly 700','Kodiak 450','Kodiak 700','YFZ450R'],
    'Kawasaki': ['Brute Force 300','Brute Force 750','KFX90'],
    'Kymco': ['MXU 300','MXU 550','MXU 700'],
    'Linhai': ['300 4x4','500 4x4','700 4x4'],
    'Hisun': ['Sector 450','Sector 550','Sector 750'],
    'TGB': ['Blade 500','Blade 550','Target 400'],
    'Access Motor': ['AMX 450','AMX 500','Shade 450'],
    'Adly': ['Terra 300','Terra 500'],
  },
  motor: {
    'Honda': ['CBR500R','CB650R','PCX150','Africa Twin','Forza','CB125'],
    'Yamaha': ['MT-07','MT-09','R25','NMAX','Tracer 9','XMAX'],
    'Kawasaki': ['Ninja 400','Z650','Versys 650','Ninja 650'],
    'Suzuki': ['GSX-R750','V-Strom 650','Burgman','GSX-S750'],
    'BMW Motorrad': ['R1250GS','F850GS','S1000RR','F900R'],
    'Ducati': ['Monster','Panigale V4','Multistrada','Scrambler'],
    'Harley-Davidson': ['Sportster','Street Glide','Fat Boy','Iron 883'],
    'TVS': ['Apache','Neo'],
    'Bajaj': ['Pulsar','Dominar'],
    'KTM': ['Duke 390','Adventure 390','RC390'],
    'Piaggio': ['Primavera','GTS','Sprint'],
  },
  otobus: {
    'Mercedes-Benz': ['Travego','Tourismo','Sprinter','Citaro'],
    'MAN': ["Lion's Coach","Lion's City"],
    'Iveco': ['Crossway','Magelys'],
    'Isuzu': ['Novociti','Citiport'],
    'Otokar': ['Sultan','Territo','Kent'],
    'BMC': ['Procity','Neocity'],
    'Temsa': ['Safari','HD','Avenue'],
    'Karsan': ['Atak','Jest'],
  },
  tir: {
    'Mercedes-Benz': ['Actros','Axor','Atego'],
    'MAN': ['TGX','TGS','TGM'],
    'Scania': ['R-Serisi','S-Serisi','G-Serisi'],
    'Volvo': ['FH','FM','FMX'],
    'DAF': ['XF','CF','LF'],
    'Iveco': ['Stralis','Eurocargo','S-Way'],
    'Ford Trucks': ['F-Max','Cargo'],
    'Renault Trucks': ['T-Serisi','D-Serisi'],
    'BMC': ['Pro','Tugra'],
  },
};

let pendingDocs = {sigorta:null, bakim:null, vize:null};
let existingDocs = {sigorta:null, bakim:null, vize:null};

function typeLabel(key){ const m = TYPE_META.find(t=>t.key===key); return m ? m.label : key; }
function typeIcon(key){ const m = TYPE_META.find(t=>t.key===key); return m ? m.icon : '🚗'; }

function renderTypeGrid(){
  const el = document.getElementById('typeGridBig');
  el.innerHTML = TYPE_META.map(t=>`
    <div class="type-opt ${t.key===selectedType?'active':''}" onclick="selectType('${t.key}')">
      <span class="ic">${t.icon}</span>${t.label}
    </div>`).join('');
}

function goToDocsStep(){
  document.getElementById('step-type').style.display = 'none';
  document.getElementById('step-docs').style.display = 'block';
  document.getElementById('modalBackBtn').style.display = 'inline-block';
  document.getElementById('modalActions').style.display = 'flex';
  document.getElementById('typeRecap').innerHTML = `${typeIcon(selectedType)} <strong>${escapeHtml(typeLabel(selectedType))}</strong> seçildi`;
}
function goToTypeStep(){
  document.getElementById('step-type').style.display = 'block';
  document.getElementById('step-docs').style.display = 'none';
  document.getElementById('modalActions').style.display = 'none';
}

const DOC_CARD_KEYS = ['ruhsat','sigorta','kasko','bakim','vize'];
let docCardMode = {ruhsat:'choose', sigorta:'choose', kasko:'choose', bakim:'choose', vize:'choose'};

function renderCardMode(cat){
  const mode = docCardMode[cat];
  const chooseEl = document.getElementById(cat + '-choose');
  const uploadEl = document.getElementById(cat + '-upload-block');
  const manualEl = document.getElementById(cat + '-manual-block');
  if(chooseEl) chooseEl.style.display = (mode === 'choose') ? 'flex' : 'none';
  if(uploadEl) uploadEl.style.display = (mode === 'upload' || mode === 'both') ? 'block' : 'none';
  if(manualEl) manualEl.style.display = (mode === 'manual' || mode === 'both') ? 'block' : 'none';
}
function renderAllCardModes(){ DOC_CARD_KEYS.forEach(renderCardMode); }

function chooseUpload(cat){
  docCardMode[cat] = 'upload';
  renderCardMode(cat);
  document.getElementById('f-' + cat + '-file').click();
}
function chooseManual(cat){
  docCardMode[cat] = 'manual';
  renderCardMode(cat);
}
function chooseReset(cat){
  docCardMode[cat] = 'choose';
  renderCardMode(cat);
  const note = document.getElementById(cat + '-ai-note');
  if(note) note.style.display = 'none';
}
function selectType(key){
  selectedType = key;
  renderTypeGrid();
  populateBrands();
  if(!editingId) goToDocsStep();
}

function renderStatusGrid(){
  const el = document.getElementById('statusGrid');
  el.innerHTML = STATUS_META.map(s=>`
    <div class="type-opt ${s.key===selectedStatus?'active':''}" onclick="selectStatus('${s.key}')">
      <span class="ic">${s.icon}</span>${s.label}
    </div>`).join('');
}
function selectStatus(key){ selectedStatus = key; renderStatusGrid(); }

function populateBrands(){
  const brandSel = document.getElementById('f-brand');
  const brands = Object.keys(VEHICLE_DATA[selectedType] || {});
  brandSel.innerHTML = '<option value="">Marka seç…</option>' +
    brands.map(b=>`<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`).join('') +
    `<option value="${OTHER}">Listede Yok / Diğer</option>`;
  document.getElementById('f-model-wrap').style.display = 'none';
  document.getElementById('f-model-other-wrap').style.display = 'none';
  document.getElementById('f-brand-other-wrap').style.display = 'none';
}

function onBrandChange(){
  const brand = document.getElementById('f-brand').value;
  const modelWrap = document.getElementById('f-model-wrap');
  const modelOtherWrap = document.getElementById('f-model-other-wrap');
  const brandOtherWrap = document.getElementById('f-brand-other-wrap');
  if(brand === OTHER){
    brandOtherWrap.style.display = 'block';
    modelWrap.style.display = 'none';
    modelOtherWrap.style.display = 'block';
    return;
  }
  brandOtherWrap.style.display = 'none';
  if(!brand){ modelWrap.style.display = 'none'; modelOtherWrap.style.display = 'none'; return; }
  const models = (VEHICLE_DATA[selectedType] && VEHICLE_DATA[selectedType][brand]) || [];
  const modelSel = document.getElementById('f-model');
  modelSel.innerHTML = '<option value="">Model seç…</option>' +
    models.map(m=>`<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('') +
    `<option value="${OTHER}">Listede Yok / Diğer</option>`;
  modelWrap.style.display = 'block';
  modelOtherWrap.style.display = 'none';
}
function onModelChange(){
  const model = document.getElementById('f-model').value;
  document.getElementById('f-model-other-wrap').style.display = (model === OTHER) ? 'block' : 'none';
}

function populateInsuranceSelect(prefix){
  const sel = document.getElementById('f-' + prefix + '-company');
  sel.innerHTML = '<option value="">Firma seç…</option>' +
    INSURANCE_COMPANIES.map(c=>`<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('') +
    `<option value="${OTHER}">Listede Yok / Diğer</option>`;
  document.getElementById('f-' + prefix + '-company-other-wrap').style.display = 'none';
}
function populateSigortaCompanies(){
  populateInsuranceSelect('sigorta');
  populateInsuranceSelect('kasko');
}
function onInsuranceCompanyChange(prefix){
  const v = document.getElementById('f-' + prefix + '-company').value;
  document.getElementById('f-' + prefix + '-company-other-wrap').style.display = (v === OTHER) ? 'block' : 'none';
}

function populateYears(selected){
  const yearSel = document.getElementById('f-year');
  const current = new Date().getFullYear() + 1;
  let opts = '<option value="">Yıl seç…</option>';
  for(let y = current; y >= 1970; y--){ opts += `<option value="${y}">${y}</option>`; }
  yearSel.innerHTML = opts;
  if(selected) yearSel.value = selected;
}

function escapeAttr(str){ return String(str).replace(/"/g, '&quot;'); }
function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function genId(){ return 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

let currentPhotoDataUrl = '';

function resizeImageFile(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > h && w > maxDim){ h = Math.round(h * maxDim / w); w = maxDim; }
        else if(h >= w && h > maxDim){ w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=> reject(new Error('Görsel okunamadı'));
      img.src = reader.result;
    };
    reader.onerror = ()=> reject(new Error('Dosya okunamadı'));
    reader.readAsDataURL(file);
  });
}

async function handlePhotoUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  try{
    currentPhotoDataUrl = await resizeImageFile(file, 500, 0.72);
    renderPhotoPreview();
  }catch(err){
    alert('Fotoğraf yüklenemedi, tekrar dene.');
  }
}
function removePhoto(){
  currentPhotoDataUrl = '';
  document.getElementById('f-photo-file').value = '';
  renderPhotoPreview();
}
function renderPhotoPreview(){
  const el = document.getElementById('photoPreview');
  const removeBtn = document.getElementById('photoRemoveBtn');
  if(currentPhotoDataUrl){
    el.innerHTML = `<img src="${currentPhotoDataUrl}" alt="">`;
    removeBtn.style.display = 'inline-block';
  } else {
    el.innerHTML = '';
    removeBtn.style.display = 'none';
  }
}
function clearFieldErrors(){
  ['f-plate','f-brand','f-brand-other','f-model','f-model-other','f-year'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.classList.remove('field-error');
  });
}

async function loadVehicles(){
  try{
    const result = await window.storage.get(currentStorageKey(), false);
    vehicles = result ? JSON.parse(result.value) : [];
  }catch(e){ vehicles = []; }
  vehicles.forEach(normalizeVehicle);
  render();
  await rescheduleAllReminders();
  maybeShowReminderNotification(false);
}
function normalizeVehicle(v){
  v.status = v.status || 'aktif';
  v.favorite = !!v.favorite;
  v.color = v.color || '';
  v.photo = v.photo || '';
  v.sigorta = v.sigorta || {date:'', startDate:'', company:'', amount:''};
  v.kasko = v.kasko || {date:'', startDate:'', company:'', amount:''};
  v.bakim = v.bakim || {date:'', nextDate:'', amount:'', note:''};
  v.vize = v.vize || {date:''};
  v.history = v.history || [];
  v.expenses = Array.isArray(v.expenses) ? v.expenses : [];
  v.gallery = Array.isArray(v.gallery) ? v.gallery : [];
  v.extraDocs = Array.isArray(v.extraDocs) ? v.extraDocs : [];
  v.tags = Array.isArray(v.tags) ? v.tags : [];
  v.docs = v.docs || {sigorta:null, kasko:null, bakim:null, vize:null, ruhsat:null};
  if(v.docs.kasko === undefined) v.docs.kasko = null;
  if(v.docs.ruhsat === undefined) v.docs.ruhsat = null;
  if(typeof v.sigorta === 'string'){ v.sigorta = {date:v.sigorta, startDate:'', company:'', amount:''}; }
  if(typeof v.bakim === 'string'){ v.bakim = {date:v.bakim, nextDate:'', amount:'', note:''}; }
  v.sigorta.startDate = v.sigorta.startDate || '';
  v.kasko.startDate = v.kasko.startDate || '';
  v.bakim.nextDate = v.bakim.nextDate || '';
  if(typeof v.vize === 'string'){ v.vize = {date:v.vize}; }
  return v;
}

async function persist(){
  try{ await window.storage.set(currentStorageKey(), JSON.stringify(vehicles), false); }
  catch(e){ console.error('Kaydetme hatası', e); }
}

function addYears(dateStr, years){
  if(!dateStr) return '';
  const d = new Date(dateStr);
  if(isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0,10);
}
function onBakimDateChange(){
  const v = document.getElementById('f-bakim').value;
  if(v) document.getElementById('f-bakim-next').value = addYears(v, 1);
  if(window.gbRefreshDateButtons) window.gbRefreshDateButtons();
}
function onSigortaDateChange(){
  const v = document.getElementById('f-sigorta').value;
  if(v) document.getElementById('f-sigorta-start').value = addYears(v, -1);
  if(window.gbRefreshDateButtons) window.gbRefreshDateButtons();
}
function onKaskoDateChange(){
  const v = document.getElementById('f-kasko').value;
  if(v) document.getElementById('f-kasko-start').value = addYears(v, -1);
  if(window.gbRefreshDateButtons) window.gbRefreshDateButtons();
}

function daysUntil(dateStr){
  if(!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}
function statusOf(dateStr){
  const d = daysUntil(dateStr);
  if(d === null) return {level:'none', label:'Tarih girilmedi'};
  if(d < 0) return {level:'red', label:`${Math.abs(d)} gün gecikti`};
  if(d <= 14) return {level:'red', label: d===0 ? 'Bugün doluyor' : `${d} gün kaldı`};
  if(d <= 30) return {level:'amber', label:`${d} gün kaldı`};
  return {level:'green', label:`${d} gün kaldı`};
}
function fmtDate(dateStr){
  if(!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', {day:'2-digit', month:'short', year:'numeric'});
}
function fmtMoney(n){
  if(n === '' || n === null || n === undefined || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('tr-TR') + ' ₺';
}
function nearestDays(v){
  const ds = [daysUntil(v.sigorta.date), daysUntil(v.kasko.date), daysUntil(v.bakim.nextDate), daysUntil(v.vize.date)].filter(x=>x!==null);
  return ds.length ? Math.min(...ds) : Infinity;
}

function onSearchChange(){ searchTerm = document.getElementById('searchBox').value.trim().toLowerCase(); render(); }

function onSummaryYearChange(){
  const sel = document.getElementById('summaryYearSelect');
  if(sel) summaryYearFilter = sel.value;
  render();
}

const STATUS_CAT_META = [
  {key:'sigorta', label:'Trafik Sigortası'},
  {key:'kasko', label:'Kasko'},
  {key:'vize', label:'Vize'},
  {key:'bakim', label:'Bakım'},
];

function showStatusDetail(level){
  const titles = {red:'⚠️ Acil Kalemler', amber:'🟡 Yaklaşan Kalemler', green:'✅ Sorunsuz Kalemler'};
  document.getElementById('statusDetailTitle').textContent = titles[level] || 'Detay';

  const items = [];
  getStatusVehicles().forEach(v=>{
    const rows = [
      {cat:'sigorta', label:'Trafik Sigortası', date: v.sigorta.date},
      {cat:'kasko', label:'Kasko', date: v.kasko.date},
      {cat:'vize', label:'Vize', date: v.vize.date},
      {cat:'bakim', label:'Bakım', date: v.bakim.nextDate},
    ];
    rows.forEach(r=>{
      const s = statusOf(r.date);
      if(s.level === level){
        items.push({
          vehicleId: v.id, cat: r.cat, label: r.label, statusLabel: s.label,
          plate: (v.plate || '').toUpperCase(), brandModel: [v.brand, v.model].filter(Boolean).join(' ')
        });
      }
    });
  });

  const listEl = document.getElementById('statusDetailList');
  if(items.length === 0){
    listEl.innerHTML = `<p style="color:var(--muted); font-size:13.5px; margin:6px 0 16px;">Bu kategoride kalem yok.</p>`;
  } else {
    listEl.innerHTML = items.map(it=>`
      <div class="status-detail-row" onclick="closeStatusDetail(); openModal('${it.vehicleId}','${it.cat}');">
        <div>
          <strong>${escapeHtml(it.plate)}</strong>
          <span class="sd-sub">${escapeHtml(it.brandModel)}</span>
        </div>
        <div class="sd-right">${escapeHtml(it.label)}: <strong>${escapeHtml(it.statusLabel)}</strong></div>
      </div>`).join('');
  }
  document.getElementById('statusDetailOverlay').classList.add('open');
}
function closeStatusDetail(){
  document.getElementById('statusDetailOverlay').classList.remove('open');
}


function openAppMenu(){
  const drawer=document.getElementById('appDrawer');
  const backdrop=document.getElementById('drawerBackdrop');
  drawer.classList.add('open'); backdrop.classList.add('open');
  drawer.setAttribute('aria-hidden','false');
  document.body.classList.add('drawer-open');
  const btn=document.querySelector('.app-menu-btn'); if(btn) btn.setAttribute('aria-expanded','true');
}
function closeAppMenu(){
  const drawer=document.getElementById('appDrawer');
  const backdrop=document.getElementById('drawerBackdrop');
  if(drawer) drawer.classList.remove('open'); if(backdrop) backdrop.classList.remove('open');
  if(drawer) drawer.setAttribute('aria-hidden','true');
  document.body.classList.remove('drawer-open');
  const btn=document.querySelector('.app-menu-btn'); if(btn) btn.setAttribute('aria-expanded','false');
}
function setDrawerActive(key){
  document.querySelectorAll('.drawer-item[data-menu]').forEach(el=>el.classList.toggle('active',el.dataset.menu===key));
  document.querySelectorAll('.bottomnav-item[data-menu]').forEach(el=>{
    const on=el.dataset.menu===key;
    el.classList.toggle('active',on);
    if(on) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
}
function setPageTitle(text){
  const title=document.getElementById('appTitle'); if(title) title.textContent=text;
}
function drawerNavigate(target){
  if(target==='home'){
    statusFilter='aktif'; switchTab('dashboard'); setPageTitle('Ana Sayfa'); setDrawerActive('home');
  }else if(target==='vehicles'){
    statusFilter='aktif'; switchTab('vehicles'); render(); setPageTitle('Aktif Araçlarım'); setDrawerActive('vehicles');
  }else if(target==='favorites'){
    switchTab('favorites'); setPageTitle('Favori Araçlarım'); setDrawerActive('favorites');
  }else if(target==='documents'){
    switchTab('documents'); setPageTitle('Belgelerim'); setDrawerActive('documents');
  }else if(target==='analytics'){
    switchTab('analytics'); setPageTitle('Analizler'); setDrawerActive('analytics');
  }
  closeAppMenu(); window.scrollTo({top:0,behavior:'smooth'});
}
function drawerAction(action){
  closeAppMenu();
  if(action==='dark') return toggleDarkMode();
  if(action==='notifications') return enableNotifications();
  if(action==='premium') return openPackagesScreen();
  if(action==='switch') return resetAccountType();
  if(action==='contact') return openContactEmail();
  if(action==='settings') return openSettings();
}
function openSettings(){
  closeAppMenu();
  const panel=document.getElementById('settingsOverlay');
  if(!panel) return;
  panel.classList.add('open'); panel.setAttribute('aria-hidden','false');
  document.body.classList.add('settings-open');
  syncSettingsControls();
  window.scrollTo({top:0,behavior:'smooth'});
}
function closeSettings(){
  const panel=document.getElementById('settingsOverlay');
  if(panel){panel.classList.remove('open');panel.setAttribute('aria-hidden','true');}
  document.body.classList.remove('settings-open');
}
function syncSettingsControls(){
  ['drawerDarkSwitch','settingsDarkSwitch'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',darkMode);});
  const icon=document.getElementById('settingsDarkIcon'); if(icon) icon.textContent=darkMode?'☀️':'🌙';
  const label=document.getElementById('settingsDarkLabel'); if(label) label.textContent=darkMode?'Açık Moda Geç':'Koyu Mod';
}
function showAboutGarageBook(){
  alert('Garage Book v1.3\n\nAraç, belge, bakım ve masraf takibi için geliştirilmiştir. Verileriniz bu cihazda saklanır.');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeAppMenu();closeSettings();}});

function switchTab(tab){
  activeTab = tab;
  const dashboard=document.getElementById('view-dashboard');
  if(dashboard) dashboard.style.display = tab === 'dashboard' ? '' : 'none';
  document.getElementById('view-vehicles').style.display = tab === 'vehicles' ? '' : 'none';
  document.getElementById('view-favorites').style.display = tab === 'favorites' ? '' : 'none';
  document.getElementById('view-documents').style.display = tab === 'documents' ? '' : 'none';
  document.getElementById('view-analytics').style.display = tab === 'analytics' ? '' : 'none';
  if(tab === 'dashboard') renderDashboard();
  if(tab === 'favorites') renderFavoritesTab();
  if(tab === 'documents') renderDocumentsTab();
  if(tab === 'analytics') renderAnalyticsTab();
}

function toggleFavorite(id){
  const v = vehicles.find(x=>x.id===id);
  if(!v) return;
  v.favorite = !v.favorite;
  persist();
  renderDashboard();
  if(activeTab === 'vehicles') render();
  if(activeTab === 'favorites') renderFavoritesTab();
}

function renderFavoriteCard(v){
  const brandModel = [v.brand, v.model].filter(Boolean).join(' ') || 'Marka/model belirtilmedi';
  return `
    <div class="card fav-card" style="background:${colorToBg(v.color)}; border-left:6px solid ${colorToHex(v.color)};" onclick="openVehicleProfile('${v.id}')">
      <div class="card-head">
        ${v.photo ? `<img class="card-photo" src="${v.photo}" alt="">` : `<div class="card-photo-placeholder">${typeIcon(v.type)}</div>`}
        <div class="card-head-left">
          <span class="brand-name">${escapeHtml(brandModel)}</span>
          <span class="plate-sub">${escapeHtml((v.plate || '—').toUpperCase())}${v.year ? ' · ' + escapeHtml(v.year) : ''}</span>
        </div>
        <button class="icon-btn fav-btn ${v.favorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${v.id}')" title="${v.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${v.favorite ? '⭐' : '☆'}</button>
      </div>
    </div>`;
}

function renderFavoritesTab(){
  const grid = document.getElementById('favoritesGrid');
  if(!grid) return;
  if(vehicles.length === 0){
    grid.innerHTML = `<div class="empty"><p>Henüz araç eklenmedi.</p></div>`;
    return;
  }
  const sorted = vehicles.slice().sort((a,b)=>{
    if(!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
    return (a.plate||'').localeCompare(b.plate||'', 'tr');
  });
  const favCount = sorted.filter(v=>v.favorite).length;
  const favSection = favCount ? `<div class="dash-section-sub fav-section-label">Favori Araçların (${favCount})</div>` + sorted.filter(v=>v.favorite).map(renderFavoriteCard).join('') : `<div class="empty"><p>Henüz favori araç yok. Aşağıdaki listeden ⭐ ikonuna dokunarak ekleyebilirsin.</p></div>`;
  const otherVehicles = sorted.filter(v=>!v.favorite);
  const otherSection = otherVehicles.length ? `<div class="dash-section-sub fav-section-label">Diğer Araçlar</div>` + otherVehicles.map(renderFavoriteCard).join('') : '';
  grid.innerHTML = favSection + otherSection;
}

function renderStatusFilterBar(){
  const el = document.getElementById('statusFilterBar');
  if(!el) return;
  const aktifCount = vehicles.filter(v=> (v.status||'aktif') === 'aktif').length;
  const pasifCount = vehicles.filter(v=> v.status === 'pasif').length;
  el.innerHTML = `
    <button class="sf-btn ${statusFilter==='aktif'?'active':''}" onclick="setStatusFilter('aktif')">Aktif Araçlar (${aktifCount})</button>
    <button class="sf-btn ${statusFilter==='pasif'?'active':''}" onclick="setStatusFilter('pasif')">Pasif Araçlar (${pasifCount})</button>
  `;
}
function setStatusFilter(s){ statusFilter = s; render(); }

const DOC_CAT_META = [
  {key:'ruhsat', label:'Ruhsat'},
  {key:'sigorta', label:'Trafik Sigortası'},
  {key:'kasko', label:'Kasko'},
  {key:'vize', label:'Vize'},
  {key:'bakim', label:'Bakım / Servis Belgesi'},
];

function renderDocumentsTab(){
  const wrap = document.getElementById('documentsGrid');
  if(vehicles.length === 0){
    wrap.innerHTML = `<div class="empty"><p>Henüz araç eklenmedi.</p></div>`;
    return;
  }
  const sorted = vehicles.slice().sort((a,b)=> (a.plate||'').localeCompare(b.plate||'', 'tr'));
  wrap.innerHTML = sorted.map(v=>{
    const rows = DOC_CAT_META.map(c=>{
      const doc = v.docs && v.docs[c.key];
      if(!doc) return `<div class="doc-row muted"><span>${c.label}: yüklenmedi</span><a onclick="openModal('${v.id}','${c.key}')">+ Belge Ekle</a></div>`;
      return `<div class="doc-row"><span>${c.label}: ${escapeHtml(doc.fileName || 'belge')}</span><span class="doc-row-actions"><a onclick="viewDocFor('${v.id}','${c.key}')">Görüntüle</a><a onclick="openModal('${v.id}','${c.key}')">Değiştir</a></span></div>`;
    }).join('');
    const isPasif = v.status === 'pasif';
    return `
      <div class="doc-card">
        <div class="doc-card-head">
          <span class="plate-mini">${escapeHtml((v.plate || '—').toUpperCase())}</span>
          <span class="status-chip ${isPasif ? 'pasif' : 'aktif'}">${isPasif ? 'Pasif' : 'Aktif'}</span>
        </div>
        <div class="doc-card-sub">${escapeHtml([v.brand, v.model].filter(Boolean).join(' ') || '—')}${v.year ? ' · ' + escapeHtml(v.year) : ''}</div>
        ${rows}
      </div>`;
  }).join('');
}

async function viewDocFor(vehicleId, cat){
  try{
    const key = 'doc:' + vehicleId + ':' + cat;
    const res = await window.storage.get(key, false);
    if(res){ const parsed = JSON.parse(res.value); viewDataUri(parsed.base64, parsed.mediaType); }
  }catch(e){ alert('Belge yüklenemedi.'); }
}

function buildVehicleExpenseEvents(v){
  const events = [];
  if(v.sigorta.amount && (v.sigorta.startDate || v.sigorta.date)) events.push({cat:'sigorta', date: v.sigorta.startDate || v.sigorta.date, amount: Number(v.sigorta.amount)});
  if(v.kasko.amount && (v.kasko.startDate || v.kasko.date)) events.push({cat:'kasko', date: v.kasko.startDate || v.kasko.date, amount: Number(v.kasko.amount)});
  if(v.bakim.amount && v.bakim.date) events.push({cat:'bakim', date: v.bakim.date, amount: Number(v.bakim.amount)});
  (v.history || []).forEach(h=>{
    if(!h.amount) return;
    const eventDate = (h.cat === 'sigorta' || h.cat === 'kasko') ? (h.startDate || h.date) : h.date;
    if(eventDate) events.push({cat: h.cat, date: eventDate, amount: Number(h.amount)});
  });
  return events;
}

function computeExpenseTotal(vehicleList, yearFilter){
  let total = 0;
  vehicleList.forEach(v=>{
    buildVehicleExpenseEvents(v).forEach(e=>{
      if(yearFilter === 'all' || (e.date || '').slice(0,4) === yearFilter) total += e.amount;
    });
  });
  return total;
}

function buildExpenseEvents(){
  const events = [];
  vehicles.forEach(v=>{
    const label = [v.plate, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' — ');
    buildVehicleExpenseEvents(v).forEach(e=> events.push({vehicleId: v.id, label, ...e}));
  });
  return events;
}

function renderAnalyticsTab(){
  const wrap = document.getElementById('analyticsWrap');
  const events = buildExpenseEvents();
  if(events.length === 0){
    wrap.innerHTML = `<div class="empty"><p>Henüz gider kaydı yok. Sigorta, kasko veya bakım tutarlarını girdikçe burada yıllık ve araç bazlı analiz görünecek.</p></div>`;
    return;
  }

  const totalAll = events.reduce((s,e)=> s + e.amount, 0);

  const byYear = {};
  const byYearVehicle = {};
  events.forEach(e=>{
    const y = (e.date || '').slice(0,4) || 'Bilinmiyor';
    byYear[y] = (byYear[y] || 0) + e.amount;
    byYearVehicle[y] = byYearVehicle[y] || {};
    byYearVehicle[y][e.vehicleId] = byYearVehicle[y][e.vehicleId] || {label: e.label, total: 0};
    byYearVehicle[y][e.vehicleId].total += e.amount;
  });
  const years = Object.keys(byYear).sort((a,b)=> b.localeCompare(a));
  const maxYear = Math.max(...Object.values(byYear));
  const yearsAsc = years.slice().sort();

  const compareBars = yearsAsc.map((y, idx)=>{
    const amt = byYear[y];
    const pct = maxYear ? Math.round((amt / maxYear) * 100) : 0;
    let deltaHtml = '';
    if(idx > 0){
      const prevAmt = byYear[yearsAsc[idx - 1]];
      if(prevAmt){
        const change = ((amt - prevAmt) / prevAmt) * 100;
        const arrow = change >= 0 ? '▲' : '▼';
        const cls = change >= 0 ? 'delta-up' : 'delta-down';
        deltaHtml = `<span class="year-delta ${cls}">${arrow} %${Math.abs(Math.round(change))}</span>`;
      }
    }
    return `
      <div class="compare-bar-row">
        <span class="compare-year">${escapeHtml(y)}</span>
        <div class="compare-bar-track"><div class="compare-bar-fill" style="width:${pct}%;"></div></div>
        <span class="compare-amount">${fmtMoney(amt)}</span>
        ${deltaHtml}
      </div>`;
  }).join('');

  const byVehicle = {};
  events.forEach(e=>{
    byVehicle[e.vehicleId] = byVehicle[e.vehicleId] || {label: e.label, total: 0};
    byVehicle[e.vehicleId].total += e.amount;
  });
  const vehicleRows = Object.values(byVehicle).sort((a,b)=> b.total - a.total);

  const yearBlocks = years.map(y=>{
    const pct = maxYear ? Math.round((byYear[y] / maxYear) * 100) : 0;
    const detailRows = Object.values(byYearVehicle[y]).sort((a,b)=> b.total - a.total)
      .map(r=>`<div class="analytic-detail-row"><span>${escapeHtml(r.label)}</span><span>${fmtMoney(r.total)}</span></div>`).join('');
    return `
      <details class="year-block">
        <summary>
          <span class="year-label">${escapeHtml(y)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${pct}%;"></span></span>
          <span class="year-amount">${fmtMoney(byYear[y])}</span>
        </summary>
        ${detailRows}
      </details>`;
  }).join('');

  const vehicleTable = vehicleRows.map(r=>`
    <div class="analytic-row"><span>${escapeHtml(r.label)}</span><span>${fmtMoney(r.total)}</span></div>`).join('');

  wrap.innerHTML = `
    <div class="analytics-total">Toplam kayıtlı gider (tüm araçlar, tüm zamanlar): <strong>${fmtMoney(totalAll)}</strong></div>
    <h3 class="an-h">Yıllık Karşılaştırma</h3>
    <div class="compare-chart">${compareBars}</div>
    <h3 class="an-h">Yıllara Göre Gider (Detay)</h3>
    <div class="year-blocks">${yearBlocks}</div>
    <h3 class="an-h">Araca Göre Toplam Gider</h3>
    <div class="analytic-table">${vehicleTable}</div>
  `;
}

function getStatusVehicles(){
  return vehicles.filter(v=> (v.status||'aktif') === statusFilter);
}

function getFilteredSorted(){
  let list = getStatusVehicles();
  if(searchTerm){
    list = list.filter(v=>{
      const hay = [v.plate, v.brand, v.model].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchTerm);
    });
  }
  const sortMode = document.getElementById('sortSelect') ? document.getElementById('sortSelect').value : 'urgent';
  if(sortMode === 'plate') list.sort((a,b)=> (a.plate||'').localeCompare(b.plate||'', 'tr'));
  else if(sortMode === 'brand') list.sort((a,b)=> (a.brand||'').localeCompare(b.brand||'', 'tr'));
  else if(sortMode === 'year') list.sort((a,b)=> (Number(b.year)||0) - (Number(a.year)||0));
  else list.sort((a,b)=> nearestDays(a) - nearestDays(b));
  return list;
}

function getVehicleHealth(v){
  const dates=[v.sigorta.date,v.kasko.date,v.vize.date,v.bakim.nextDate];
  const states=dates.map(statusOf).filter(x=>x.level!=='none');
  if(states.some(x=>x.level==='red')) return {level:'red',label:'Acil İşlem'};
  if(states.some(x=>x.level==='amber')) return {level:'amber',label:'Yaklaşıyor'};
  if(states.length) return {level:'green',label:'Sağlıklı'};
  return {level:'none',label:'Eksik Bilgi'};
}
function buildDashboardTasks(){
  const items=[];
  vehicles.filter(v=>(v.status||'aktif')==='aktif').forEach(v=>{
    [
      {key:'sigorta',label:'Trafik sigortası',date:v.sigorta.date},
      {key:'kasko',label:'Kasko',date:v.kasko.date},
      {key:'vize',label:'Muayene',date:v.vize.date},
      {key:'bakim',label:'Bakım',date:v.bakim.nextDate}
    ].forEach(x=>{
      const d=daysUntil(x.date); if(d===null || d>30) return;
      items.push({vehicle:v,key:x.key,label:x.label,days:d,level:d<=14?'red':'amber'});
    });
  });
  return items.sort((a,b)=>a.days-b.days);
}
function pickHeroVehicle(){
  const pool=vehicles.filter(v=>(v.status||'aktif')==='aktif');
  if(!pool.length) return vehicles[0]||null;
  return pool.slice().sort((a,b)=>nearestDays(a)-nearestDays(b))[0];
}
function renderHeroVehicle(){
  const wrap=document.getElementById('heroVehicleWrap');
  if(!wrap) return;
  const v=pickHeroVehicle();
  if(!v){
    wrap.innerHTML=`<section class="hero-vehicle empty" onclick="handleAddVehicleClick()">
      <div class="hero-vehicle-top">
        <div class="hero-vehicle-name">Henüz araç eklenmedi</div>
        <div class="hero-vehicle-plate">Filonu takip etmeye başlamak için ilk aracını ekle</div>
      </div>
      <button class="hero-vehicle-cta" onclick="event.stopPropagation();handleAddVehicleClick()">+ Araç Ekle</button>
    </section>`;
    return;
  }
  const badges=[
    v.year?`<span class="hv-badge">${escapeHtml(v.year)} model</span>`:'',
    `<span class="hv-badge">${escapeHtml(typeLabel(v.type))}</span>`,
    `<span class="hv-badge">${v.status==='pasif'?'Pasif':'Aktif'}</span>`
  ].join('');
  wrap.innerHTML=`<section class="hero-vehicle" onclick="openVehicleProfile('${v.id}')">
    <div class="hero-vehicle-top">
      <div class="hero-vehicle-name">${escapeHtml([v.brand,v.model].filter(Boolean).join(' ')||'Araç')}</div>
      <div class="hero-vehicle-plate">${escapeHtml((v.plate||'—').toUpperCase())}</div>
      <div class="hero-vehicle-badges">${badges}</div>
    </div>
    <button class="hero-vehicle-cta" onclick="event.stopPropagation();openVehicleProfile('${v.id}')">Araç Profiline Git ›</button>
  </section>`;
}

function renderFavoriteVehicles(){
  const wrap=document.getElementById('favoriteVehiclesWrap');
  if(!wrap) return;
  const favs=vehicles.filter(v=>v.favorite);
  if(!favs.length){ wrap.innerHTML=''; return; }
  wrap.innerHTML=`<section class="dash-section fav-strip-section">
    <div class="dash-section-head"><div><div class="dash-section-title">⭐ Favori Araçların</div></div><button class="dash-link" onclick="drawerNavigate('favorites')">Tümünü Gör</button></div>
    <div class="fav-strip">${favs.map(v=>`
      <div class="fav-chip" onclick="openVehicleProfile('${v.id}')">
        ${v.photo ? `<img class="fav-chip-photo" src="${v.photo}" alt="">` : `<div class="fav-chip-photo fav-chip-photo-placeholder">${typeIcon(v.type)}</div>`}
        <div class="fav-chip-name">${escapeHtml([v.brand,v.model].filter(Boolean).join(' ')||'Araç')}</div>
        <div class="fav-chip-plate">${escapeHtml((v.plate||'—').toUpperCase())}</div>
      </div>`).join('')}
    </div>
  </section>`;
}
function renderDashboard(){
  const stats=document.getElementById('dashboardStats'), tasks=document.getElementById('dashboardTasks');
  if(!stats||!tasks) return;
  renderHeroVehicle();
  renderFavoriteVehicles();
  const taskItems=buildDashboardTasks();
  const urgentVehicles=new Set(taskItems.map(x=>x.vehicle.id)).size;
  stats.innerHTML=`
    <div class="stat-card lg" onclick="drawerNavigate('vehicles')"><div class="stat-value">${vehicles.length}</div><div class="stat-label">Toplam Araç</div></div>
    <div class="stat-card lg" onclick="drawerNavigate('vehicles')"><div class="stat-value">${urgentVehicles}</div><div class="stat-label">Yaklaşan İşlem</div></div>`;
  const sub=document.getElementById('dashHeroSub');
  if(sub) sub.textContent=vehicles.length ? (urgentVehicles ? `${urgentVehicles} araç için önümüzdeki 30 gün içinde işlem gerekiyor.` : 'Yaklaşan kritik işlem görünmüyor. Araçların kontrol altında.') : 'İlk aracını ekleyerek bakım ve belge takibine başla.';
  if(!taskItems.length){
    tasks.innerHTML=`<div class="task-summary">Bugün ilgilenmen gereken araç yok 🎉</div><div class="task-empty">Yaklaşan sigorta, kasko, muayene ve bakım işlemleri burada görünecek.</div>`;
    return;
  }
  const shown=taskItems.slice(0,6);
  tasks.innerHTML=`<div class="task-summary">${urgentVehicles} araçla ilgilenmen gerekiyor</div><div class="task-timeline">`+shown.map(it=>{
    const dtext=it.days<0?`${Math.abs(it.days)} gün gecikti`:it.days===0?'Bugün':`${it.days} gün`;
    const color=it.level==='red'?'var(--red)':'var(--amber)';
    const colorBg=it.level==='red'?'var(--red-bg)':'var(--amber-bg)';
    return `<div class="timeline-item"><div class="timeline-rail"><span class="timeline-dot" style="background:${color}"></span><span class="timeline-line"></span></div><div class="timeline-card" onclick="openModal('${it.vehicle.id}','${it.key}')"><div class="timeline-card-top"><span class="timeline-plate">${escapeHtml((it.vehicle.plate||'—').toUpperCase())}</span><span class="timeline-days" style="color:${color};background:${colorBg}">${dtext}</span></div><div class="timeline-copy">${escapeHtml(it.label)} · ${escapeHtml([it.vehicle.brand,it.vehicle.model].filter(Boolean).join(' '))}</div></div></div>`;
  }).join('')+'</div>'+(taskItems.length>6?`<div class="task-empty">+${taskItems.length-6} işlem daha var. Araçlar ekranından görebilirsin.</div>`:'');
}


let profileVehicleId = null;

function vehicleHealthScore(v){
  const checks=[v.sigorta?.date,v.kasko?.date,v.vize?.date,v.bakim?.nextDate];
  let score=100, known=0;
  checks.forEach(date=>{
    const d=daysUntil(date);
    if(d===null){ score-=12; return; }
    known++;
    if(d<0) score-=28;
    else if(d<=7) score-=18;
    else if(d<=30) score-=9;
  });
  if(!v.kmGuncel) score-=4;
  return Math.max(0,Math.min(100,score));
}

function vehicleTimeline(v){
  const events=[];
  const add=(date,title,copy,icon)=>{if(date) events.push({date,title,copy,icon});};
  add(v.bakim?.date,'Periyodik bakım',v.bakim?.note || (v.bakim?.amount ? fmtMoney(v.bakim.amount) : 'Bakım kaydı'), '🛠️');
  add(v.sigorta?.startDate,'Trafik sigortası başladı',[v.sigorta?.company,v.sigorta?.amount?fmtMoney(v.sigorta.amount):''].filter(Boolean).join(' · '),'🛡️');
  add(v.kasko?.startDate,'Kasko başladı',[v.kasko?.company,v.kasko?.amount?fmtMoney(v.kasko.amount):''].filter(Boolean).join(' · '),'🔐');
  add(v.vize?.date,'Muayene geçerlilik tarihi','Geçerlilik bitiş tarihi','📋');
  (v.history||[]).forEach(h=>{
    const map={sigorta:['Trafik sigortası yenilendi','🛡️'],kasko:['Kasko yenilendi','🔐'],bakim:['Bakım yapıldı','🛠️'],vize:['Muayene kaydı','📋']};
    const m=map[h.cat]||['Araç kaydı','🚗'];
    const date=h.date||h.startDate||h.archivedAt?.slice(0,10);
    const copy=[h.company,h.note,h.amount?fmtMoney(h.amount):''].filter(Boolean).join(' · ');
    add(date,m[0],copy,m[1]);
  });
  return events.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function openVehicleProfile(id){
  const v=vehicles.find(x=>x.id===id); if(!v) return;
  profileVehicleId=id;
  const overlay=document.getElementById('vehicleProfileOverlay');
  const content=document.getElementById('vehicleProfileContent');
  const health=getVehicleHealth(v), score=vehicleHealthScore(v);
  const expenses=buildVehicleExpenseEvents(v);
  const total=expenses.reduce((sum,e)=>sum+(Number(e.amount)||0),0);
  const rows=[
    {key:'sigorta',label:'Trafik Sigortası',date:v.sigorta?.date,icon:'🛡️'},
    {key:'kasko',label:'Kasko',date:v.kasko?.date,icon:'🔐'},
    {key:'vize',label:'Muayene',date:v.vize?.date,icon:'📋'},
    {key:'bakim',label:'Bakım',date:v.bakim?.nextDate,icon:'🛠️'}
  ];
  const actionRows=rows.slice().sort((a,b)=>{
    const da=daysUntil(a.date),db=daysUntil(b.date); return (da===null?99999:da)-(db===null?99999:db);
  }).map(r=>{
    const st=statusOf(r.date),d=daysUntil(r.date),color=st.level==='red'?'var(--red)':st.level==='amber'?'var(--amber)':st.level==='green'?'var(--green)':'var(--muted)';
    return `<div class="vp-action-row" onclick="closeVehicleProfile();openModal('${v.id}','${r.key}')"><span class="vp-action-dot" style="background:${color}"></span><div class="vp-action-main"><div class="vp-action-label">${r.icon} ${r.label}</div><div class="vp-action-date">${fmtDate(r.date)}</div></div><div class="vp-action-days" style="color:${color}">${st.label}</div></div>`;
  }).join('');
  const docs=rows.map(r=>{
    const hasDoc=!!v.docs?.[r.key], st=statusOf(r.date);
    return `<div class="vp-doc" onclick="closeVehicleProfile();openModal('${v.id}','${r.key}')"><div class="vp-doc-name">${r.icon} ${r.label}</div><div class="vp-doc-state">${hasDoc?'Belge yüklü · ':''}${st.label}</div></div>`;
  }).join('')+`<div class="vp-doc" onclick="closeVehicleProfile();openModal('${v.id}','ruhsat')"><div class="vp-doc-name">📘 Ruhsat</div><div class="vp-doc-state">${v.docs?.ruhsat?'Belge yüklü':'Belge eklenmedi'}</div></div>`;
  const timeline=vehicleTimeline(v);
  const timelineHtml=timeline.length?timeline.map(e=>`<div class="vp-time-item"><span class="vp-time-dot"></span><div class="vp-time-date">${fmtDate(e.date)}</div><div class="vp-time-title">${e.icon} ${escapeHtml(e.title)}</div><div class="vp-time-copy">${escapeHtml(e.copy||'Kayıt oluşturuldu')}</div></div>`).join(''):'<div class="vp-empty">Henüz geçmiş kayıt bulunmuyor.</div>';
  const hero=v.photo?`<img class="vp-hero-photo" src="${v.photo}" alt=""><div class="vp-hero-shade"></div>`:`<div class="vp-hero-placeholder">${typeIcon(v.type)}</div><div class="vp-hero-shade"></div>`;
  content.innerHTML=`
    <section class="vp-hero">${hero}<div class="vp-hero-copy"><div class="vp-model">${escapeHtml([v.brand,v.model].filter(Boolean).join(' ')||'Araç')}</div><div class="vp-plate">${escapeHtml((v.plate||'—').toUpperCase())}</div><div class="vp-meta"><span class="vp-status">${health.level==='green'?'🟢':health.level==='amber'?'🟡':health.level==='red'?'🔴':'⚪'} ${health.label}</span>${v.year?`<span>${escapeHtml(v.year)} model</span>`:''}${v.kmGuncel?`<span>· ${Number(v.kmGuncel).toLocaleString('tr-TR')} km</span>`:''}</div></div></section>
    <div class="vp-grid">
      <section class="vp-card wide"><div class="vp-card-title"><span>❤️ Araç Sağlık Puanı</span><span class="vp-card-sub">Belge ve bakım durumuna göre</span></div><div class="vp-score-row"><div class="vp-score-ring" style="--score:${score}"><div class="vp-score-num">${score}<small>/100</small></div></div><div class="vp-score-copy"><strong>${score>=85?'Her şey yolunda':score>=60?'Yaklaşan işlemler var':'Acil olarak ilgilenilmeli'}</strong><span>${score>=85?'Belge ve bakım tarihleri kontrol altında.':score>=60?'Yaklaşan tarihleri Görev Merkezi üzerinden takip et.':'Gecikmiş veya eksik kayıtları mümkün olan en kısa sürede güncelle.'}</span></div></div></section>
      <section class="vp-card"><div class="vp-card-title">💰 Toplam Masraf</div><div class="vp-kpi">${fmtMoney(total)}</div><div class="vp-kpi-label">Kayıtlı tüm dönemler</div></section>
      <section class="vp-card"><div class="vp-card-title">📜 Geçmiş</div><div class="vp-kpi">${timeline.length}</div><div class="vp-kpi-label">Zaman tüneli kaydı</div></section>
      <section class="vp-card wide"><div class="vp-card-title"><span>📅 Yaklaşan İşlemler</span><span class="vp-card-sub">Dokunarak güncelle</span></div><div class="vp-action-list">${actionRows}</div></section>
      <section class="vp-card wide"><div class="vp-card-title"><span>📄 Belgeler</span><span class="vp-card-sub">Belge durumu</span></div><div class="vp-doc-grid">${docs}</div></section>
      <section class="vp-card wide"><div class="vp-card-title">📝 Notlar</div><div class="vp-note">${v.note?escapeHtml(v.note):'<span class="vp-empty">Bu araç için henüz not eklenmedi.</span>'}</div></section>
      <section class="vp-card wide"><div class="vp-card-title"><span>🕒 Araç Zaman Tüneli</span><span class="vp-card-sub">En yeniden eskiye</span></div><div class="vp-timeline">${timelineHtml}</div></section>
    </div>`;
  overlay.classList.add('open'); overlay.setAttribute('aria-hidden','false'); document.body.classList.add('vehicle-profile-open');
}
function closeVehicleProfile(){const o=document.getElementById('vehicleProfileOverlay');o.classList.remove('open');o.setAttribute('aria-hidden','true');document.body.classList.remove('vehicle-profile-open')}
function editProfileVehicle(){const id=profileVehicleId;closeVehicleProfile();if(id)openModal(id)}

function render(){
  renderDashboard();
  renderStatusFilterBar();
  const grid = document.getElementById('grid');
  const summary = document.getElementById('summary');

  if(vehicles.length === 0){
    grid.innerHTML = `
      <div class="empty">
        <div class="plate-ico">34 XX 000</div>
        <p>Henüz araç eklenmedi. Sigorta, bakım ve vize tarihlerini takip etmek için ilk aracını ekle.</p>
      </div>`;
    summary.innerHTML = '';
    return;
  }

  const statusVehicles = getStatusVehicles();
  if(statusVehicles.length === 0){
    grid.innerHTML = `<div class="empty"><p>${statusFilter === 'pasif' ? 'Pasif araç yok. Sattığın/devrettiğin bir aracı düzenleyip durumunu Pasif yaparsan burada görünür.' : 'Aktif araç yok.'}</p></div>`;
    summary.innerHTML = '';
    return;
  }

  let counts = {red:0, amber:0, green:0};
  statusVehicles.forEach(v=>{
    [v.sigorta.date, v.kasko.date, v.bakim.nextDate, v.vize.date].forEach(d=>{
      const s = statusOf(d);
      if(counts[s.level] !== undefined) counts[s.level]++;
    });
  });

  const expenseYears = new Set();
  statusVehicles.forEach(v=>{
    buildVehicleExpenseEvents(v).forEach(e=>{ if(e.date) expenseYears.add(e.date.slice(0,4)); });
  });
  const sortedYears = Array.from(expenseYears).sort((a,b)=> b.localeCompare(a));
  if(!sortedYears.includes(String(new Date().getFullYear()))) sortedYears.unshift(String(new Date().getFullYear()));
  if(!sortedYears.includes(summaryYearFilter) && summaryYearFilter !== 'all') summaryYearFilter = 'all';
  const totalExpense = computeExpenseTotal(statusVehicles, summaryYearFilter);
  const yearOptions = `<option value="all" ${summaryYearFilter==='all'?'selected':''}>Tüm Zamanlar</option>` +
    sortedYears.map(y=>`<option value="${y}" ${summaryYearFilter===y?'selected':''}>${y}</option>`).join('');

  summary.innerHTML = `
    <span class="pill red" onclick="showStatusDetail('red')"><span class="dot" style="background:var(--red);"></span>${counts.red} acil</span>
    <span class="pill amber" onclick="showStatusDetail('amber')"><span class="dot" style="background:var(--amber);"></span>${counts.amber} yaklaşıyor</span>
    <span class="pill green" onclick="showStatusDetail('green')"><span class="dot" style="background:var(--green);"></span>${counts.green} sorunsuz</span>
    <span class="pill money">💰
      <select id="summaryYearSelect" class="summary-year-select" onchange="onSummaryYearChange()">${yearOptions}</select>
      : ${fmtMoney(totalExpense)}
    </span>
  `;

  const list = getFilteredSorted();
  if(list.length === 0){
    grid.innerHTML = `<div class="empty"><p>Aramanla eşleşen araç bulunamadı.</p></div>`;
    return;
  }

  grid.innerHTML = list.map(v=>{
    const rows = [
      {key:'sigorta', label:'Trafik Sigortası', date:v.sigorta.date, sub: v.sigorta.company},
      {key:'kasko', label:'Kasko', date:v.kasko.date, sub: v.kasko.company},
      {key:'vize', label:'Vize', date:v.vize.date, sub:null},
      {key:'bakim', label:'Bakım', date:v.bakim.nextDate, sub: v.bakim.note ? v.bakim.note + (v.bakim.date ? ' · Son bakım: ' + fmtDate(v.bakim.date) : '') : (v.bakim.date ? 'Son bakım: ' + fmtDate(v.bakim.date) : null)}
    ];

    const rowsHtml = rows.map(row=>{
      const s = statusOf(row.date);
      const color = s.level === 'red' ? 'var(--red)' : s.level === 'amber' ? 'var(--amber)' : s.level === 'green' ? 'var(--green)' : 'var(--muted)';
      const d = daysUntil(row.date);
      const isExpired = d !== null && d < 0;
      return `
        <div class="status-row" onclick="event.stopPropagation(); openModal('${v.id}', '${row.key}')">
          <span class="status-label">
            <span class="lbl"><span class="dot" style="background:${color};"></span>${row.label}</span>
            ${row.sub ? `<span class="sub">${escapeHtml(row.sub)}</span>` : ''}
          </span>
          <span class="status-right">
            <span class="status-date">${fmtDate(row.date)}</span>
            <span class="status-days" style="color:${color};">${s.label}</span>
          </span>
        </div>
        ${isExpired ? `
        <div class="expired-alert">
          ⚠️ <strong>${escapeHtml(row.label)}</strong> ${Math.abs(d)} gündür geçerli değil.
          <button type="button" class="expired-alert-btn" onclick="event.stopPropagation(); openModal('${v.id}', '${row.key}')">+ Yeni Belge Ekle</button>
        </div>` : ''}`;
    }).join('');

    // Pick the single most urgent item to summarize on the collapsed card face
    let urgent = null;
    rows.forEach(row=>{
      const d = daysUntil(row.date);
      if(d === null) return;
      if(urgent === null || d < urgent.days){ urgent = {days: d, row, status: statusOf(row.date)}; }
    });
    const urgentLevel = urgent ? urgent.status.level : 'none';
    const urgentText = urgent
      ? (urgent.days < 0
          ? `⚠️ ${urgent.row.label} ${Math.abs(urgent.days)} gündür geçerli değil — yeni belge ekle`
          : `${urgent.row.label}: ${urgent.status.label}`)
      : 'Tarih girilmedi';

    const brandModel = [v.brand, v.model].filter(Boolean).join(' ') || 'Marka/model belirtilmedi';
    const isOpen = expandedCards.has(v.id);

    return `
      <div class="card" style="background:${colorToBg(v.color)}; border-left:6px solid ${colorToHex(v.color)};" onclick="openVehicleProfile('${v.id}')">
        <div class="card-head">
          ${v.photo ? `<img class="card-photo" src="${v.photo}" alt="">` : `<div class="card-photo-placeholder">${typeIcon(v.type)}</div>`}
          <div class="card-head-left">
            <span class="brand-name">${escapeHtml(brandModel)}</span>
            <span class="plate-sub">${escapeHtml((v.plate || '—').toUpperCase())}${v.year ? ' · ' + escapeHtml(v.year) : ''}</span>
          </div>
          <span class="health-badge ${getVehicleHealth(v).level}">${getVehicleHealth(v).level==='green'?'●':getVehicleHealth(v).level==='amber'?'●':getVehicleHealth(v).level==='red'?'●':'○'} ${getVehicleHealth(v).label}</span>
          <button class="icon-btn fav-btn ${v.favorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${v.id}')" title="${v.favorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}">${v.favorite ? '⭐' : '☆'}</button>
          <button class="icon-btn" onclick="event.stopPropagation(); openModal('${v.id}')" title="Düzenle">✎</button>
        </div>
        <div class="urgent-line level-${urgentLevel}">
          <span class="ue-dot" style="background:${urgentLevel==='red'?'var(--red)':urgentLevel==='amber'?'var(--amber)':urgentLevel==='green'?'var(--green)':'var(--muted)'};"></span>
          ${escapeHtml(urgentText)}
          <span class="expand-hint">Profili Aç ›</span>
        </div>
        <div class="card-details" style="display:none;" onclick="event.stopPropagation();">
          ${v.kmGuncel ? `<p class="km-line">🛣️ ${Number(v.kmGuncel).toLocaleString('tr-TR')} km</p>` : ''}
          ${rowsHtml}
          ${v.note ? `<p class="note-line">${escapeHtml(v.note)}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

function toggleCard(e, id){
  if(expandedCards.has(id)) expandedCards.delete(id);
  else expandedCards.add(id);
  render();
}

function handleAddVehicleClick(){
  const limit = getVehicleLimit();
  const currentCount = vehicles.length;
  if(accountType === 'kurumsal' && !kurumsalTier){
    openPackagesScreen();
    return;
  }
  if(currentCount >= limit){
    openPackagesScreen();
    return;
  }
  openModal();
}

function openModal(id, focusCat){
  editingId = id || null;
  clearFieldErrors();
  clearFocusMode();
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('deleteBtn');
  const editorModal = document.getElementById('vehicleEditorModal');
  if(editorModal) editorModal.classList.toggle('edit-mode', !!id);

  pendingDocs = {sigorta:null, kasko:null, bakim:null, vize:null, ruhsat:null};
  ['sigorta','kasko','bakim','vize','ruhsat'].forEach(cat=>{
    document.getElementById(cat+'-status').textContent = '';
    document.getElementById(cat+'-status').className = 'doc-status';
    document.getElementById(cat+'-doclinks').innerHTML = '';
    document.getElementById('f-' + cat + '-file').value = '';
    document.getElementById(cat+'-ai-note').style.display = 'none';
    setCardStatus(cat, '', '');
  });

  populateSigortaCompanies();
  populateColors();

  if(id){
    tempId = id;
    const v = vehicles.find(x=>x.id === id);
    title.textContent = 'Aracı Düzenle';
    document.getElementById('f-plate').value = v.plate || '';
    currentPhotoDataUrl = v.photo || '';
    renderPhotoPreview();
    document.getElementById('f-km').value = v.kmGuncel || '';
    document.getElementById('f-sigorta').value = v.sigorta.date || '';
    document.getElementById('f-sigorta-start').value = v.sigorta.startDate || '';
    document.getElementById('f-sigorta-amount').value = v.sigorta.amount || '';
    document.getElementById('f-kasko').value = v.kasko.date || '';
    document.getElementById('f-kasko-start').value = v.kasko.startDate || '';
    document.getElementById('f-kasko-amount').value = v.kasko.amount || '';
    document.getElementById('f-bakim').value = v.bakim.date || '';
    document.getElementById('f-bakim-next').value = v.bakim.nextDate || '';
    document.getElementById('f-bakim-amount').value = v.bakim.amount || '';
    document.getElementById('f-bakim-note').value = v.bakim.note || '';
    document.getElementById('f-vize').value = v.vize.date || '';
    document.getElementById('f-note').value = v.note || '';
    deleteBtn.style.display = 'block';

    if(v.sigorta.company && INSURANCE_COMPANIES.includes(v.sigorta.company)){
      document.getElementById('f-sigorta-company').value = v.sigorta.company;
    } else if(v.sigorta.company){
      document.getElementById('f-sigorta-company').value = OTHER;
      onInsuranceCompanyChange('sigorta');
      document.getElementById('f-sigorta-company-other').value = v.sigorta.company;
    }
    if(v.kasko.company && INSURANCE_COMPANIES.includes(v.kasko.company)){
      document.getElementById('f-kasko-company').value = v.kasko.company;
    } else if(v.kasko.company){
      document.getElementById('f-kasko-company').value = OTHER;
      onInsuranceCompanyChange('kasko');
      document.getElementById('f-kasko-company-other').value = v.kasko.company;
    }

    selectedType = v.type || 'otomobil';
    renderTypeGrid();
    populateBrands();
    populateYears(v.year || '');
    selectedStatus = v.status || 'aktif';
    renderStatusGrid();

    if(v.color && COLOR_META.some(c=>c.name === v.color)){
      document.getElementById('f-color').value = v.color;
    } else if(v.color){
      document.getElementById('f-color').value = OTHER;
      onColorChange();
      document.getElementById('f-color-other').value = v.color;
    }
    const brands = Object.keys(VEHICLE_DATA[selectedType] || {});
    if(v.brand && brands.includes(v.brand)){
      document.getElementById('f-brand').value = v.brand;
      onBrandChange();
      const models = (VEHICLE_DATA[selectedType][v.brand] || []);
      if(v.model && models.includes(v.model)){
        document.getElementById('f-model').value = v.model;
      } else if(v.model){
        document.getElementById('f-model').value = OTHER;
        onModelChange();
        document.getElementById('f-model-other').value = v.model;
      }
    } else if(v.brand){
      document.getElementById('f-brand').value = OTHER;
      onBrandChange();
      document.getElementById('f-brand-other').value = v.brand;
      document.getElementById('f-model-other').value = v.model || '';
    }

    existingDocs = v.docs || {sigorta:null, kasko:null, bakim:null, vize:null, ruhsat:null};
    ['sigorta','kasko','bakim','vize','ruhsat'].forEach(cat=>{
      renderDocLinks(cat);
      if(existingDocs[cat]) setCardStatus(cat, '✓ Belge kayıtlı', 'ok');
      else setCardStatus(cat, '', '');
    });
    renderHistory(v);

    document.getElementById('step-type').style.display = 'block';
    document.getElementById('step-docs').style.display = 'block';
    document.getElementById('modalBackBtn').style.display = 'none';
    document.getElementById('modalActions').style.display = 'flex';
    docCardMode = {ruhsat:'manual', sigorta:'manual', kasko:'manual', bakim:'manual', vize:'manual'};
    renderAllCardModes();
    if(focusCat) applyFocusMode(v, focusCat);
  } else {
    tempId = genId();
    title.textContent = 'Araç Ekle';
    document.getElementById('f-plate').value = '';
    currentPhotoDataUrl = '';
    document.getElementById('f-photo-file').value = '';
    renderPhotoPreview();
    document.getElementById('f-km').value = '';
    document.getElementById('f-sigorta').value = '';
    document.getElementById('f-sigorta-start').value = '';
    document.getElementById('f-sigorta-amount').value = '';
    document.getElementById('f-kasko').value = '';
    document.getElementById('f-kasko-start').value = '';
    document.getElementById('f-kasko-amount').value = '';
    document.getElementById('f-bakim').value = '';
    document.getElementById('f-bakim-next').value = '';
    document.getElementById('f-bakim-amount').value = '';
    document.getElementById('f-bakim-note').value = '';
    document.getElementById('f-vize').value = '';
    document.getElementById('f-note').value = '';
    deleteBtn.style.display = 'none';

    selectedType = 'otomobil';
    renderTypeGrid();
    populateBrands();
    populateYears('');
    selectedStatus = 'aktif';
    renderStatusGrid();
    document.getElementById('f-color').value = '';
    document.getElementById('f-color-other-wrap').style.display = 'none';
    document.getElementById('f-color-other').value = '';
    document.getElementById('f-brand-other').value = '';
    document.getElementById('f-model-other').value = '';

    existingDocs = {sigorta:null, kasko:null, bakim:null, vize:null, ruhsat:null};
    ['sigorta','kasko','bakim','vize','ruhsat'].forEach(cat=> renderDocLinks(cat));
    document.getElementById('historyWrap').innerHTML = '';

    document.getElementById('step-type').style.display = 'block';
    document.getElementById('step-docs').style.display = 'none';
    document.getElementById('modalBackBtn').style.display = 'none';
    document.getElementById('modalActions').style.display = 'none';
    docCardMode = {ruhsat:'choose', sigorta:'choose', kasko:'choose', bakim:'choose', vize:'choose'};
    renderAllCardModes();
  }
  setupEditorSections(!!id, focusCat);
  if(window.gbRefreshDateButtons) window.gbRefreshDateButtons();
  overlay.classList.add('open');
}

function setupEditorSections(isEdit, focusCat){
  document.querySelectorAll('#overlay .doc-card-wrap').forEach((card, index)=>{
    card.classList.remove('edit-collapsed');
    const title = card.querySelector('.doc-card-title');
    if(title && !title.dataset.simpleToggle){
      title.dataset.simpleToggle = '1';
      title.addEventListener('click', ()=> card.classList.toggle('edit-collapsed'));
    }
    if(isEdit && !focusCat && index > 0) card.classList.add('edit-collapsed');
  });
}

const CAT_META_SIMPLE = {
  ruhsat: {icon:'📘', label:'Ruhsat'},
  sigorta: {icon:'🛡️', label:'Trafik Sigortası'},
  kasko: {icon:'🚘', label:'Kasko'},
  vize: {icon:'📋', label:'Vize'},
  bakim: {icon:'🔧', label:'Bakım'},
};

function applyFocusMode(v, focusCat){
  document.getElementById('step-type').style.display = 'none';
  document.getElementById('plateFieldWrap').style.display = 'none';
  document.getElementById('photoFieldWrap').style.display = 'none';
  document.getElementById('otherInfoSection').style.display = 'none';
  document.getElementById('historyWrap').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('modalBackBtn').style.display = 'none';

  DOC_CARD_KEYS.forEach(cat=>{
    const el = document.getElementById('docwrap-' + cat);
    if(el) el.style.display = (cat === focusCat) ? 'block' : 'none';
  });

  const meta = CAT_META_SIMPLE[focusCat];
  if(meta) document.getElementById('modalTitle').textContent = `${meta.icon} ${meta.label} — ${(v.plate || '').toUpperCase()}`;

  docCardMode[focusCat] = existingDocs[focusCat] ? 'both' : 'manual';
  renderCardMode(focusCat);

  document.getElementById('focusModeBackLink').style.display = 'block';
}

function clearFocusMode(){
  document.getElementById('plateFieldWrap').style.display = '';
  document.getElementById('photoFieldWrap').style.display = '';
  document.getElementById('otherInfoSection').style.display = '';
  document.getElementById('historyWrap').style.display = '';
  DOC_CARD_KEYS.forEach(cat=>{
    const el = document.getElementById('docwrap-' + cat);
    if(el) el.style.display = 'block';
  });
  const backLink = document.getElementById('focusModeBackLink');
  if(backLink) backLink.style.display = 'none';
}

function closeModal(){
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
}
document.getElementById('overlay').addEventListener('click', (e)=>{ if(e.target.id === 'overlay') closeModal(); });
document.getElementById('packagesOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'packagesOverlay') closePackagesScreen(); });
document.getElementById('statusDetailOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'statusDetailOverlay') closeStatusDetail(); });

function renderHistory(v){
  const wrap = document.getElementById('historyWrap');
  if(!v.history || v.history.length === 0){ wrap.innerHTML = ''; return; }
  const items = v.history.slice().reverse().map(h=>{
    const catLabel = h.cat === 'sigorta' ? 'Trafik Sigortası' : h.cat === 'kasko' ? 'Kasko' : h.cat === 'bakim' ? 'Bakım' : 'Vize';
    let extra = '';
    let dateLabel = fmtDate(h.date);
    if(h.cat === 'sigorta' || h.cat === 'kasko'){
      extra = `${h.company ? h.company + ' · ' : ''}${fmtMoney(h.amount)}`;
      if(h.startDate) dateLabel = `${fmtDate(h.startDate)} → ${fmtDate(h.date)}`;
    }
    if(h.cat === 'bakim') extra = `${fmtMoney(h.amount)}${h.note ? ' · ' + h.note : ''}`;
    return `<div class="hist-item">${catLabel} — ${dateLabel} ${extra ? '· ' + extra : ''}</div>`;
  }).join('');
  wrap.innerHTML = `<details class="history"><summary>📜 Geçmiş Kayıtlar (${v.history.length})</summary>${items}</details>`;
}

function renderDocLinks(cat){
  const el = document.getElementById(cat + '-doclinks');
  const doc = existingDocs[cat];
  if(pendingDocs[cat]){
    el.innerHTML = `<span onclick="viewPendingDoc('${cat}')">📄 ${escapeHtml(pendingDocs[cat].fileName)} (yeni)</span> <span onclick="removePendingDoc('${cat}')">Kaldır</span>`;
  } else if(doc){
    el.innerHTML = `<a onclick="viewStoredDoc('${cat}')">📄 ${escapeHtml(doc.fileName || 'Belgeyi Gör')}</a> <span onclick="removeStoredDoc('${cat}')">Kaldır</span>`;
  } else {
    el.innerHTML = '';
  }
}

function readFileAsBase64(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=> resolve(r.result.split(',')[1]);
    r.onerror = ()=> reject(new Error('Dosya okunamadı'));
    r.readAsDataURL(file);
  });
}


function checkPlateMismatch(parsedPlate){
  if(!parsedPlate) return null;
  const current = document.getElementById('f-plate').value.trim().toUpperCase();
  const parsed = String(parsedPlate).trim().toUpperCase();
  if(current && parsed && current !== parsed){
    return `⚠ Belgedeki plaka (${parsed}) bu aracın plakasıyla (${current}) uyuşmuyor, kontrol et.`;
  }
  return null;
}

// ---------- Free OCR-based extraction (no external AI, runs in the browser) ----------
function trNormalize(s){
  return String(s).toUpperCase()
    .replace(/İ/g,'I').replace(/Ş/g,'S').replace(/Ğ/g,'G').replace(/Ü/g,'U').replace(/Ö/g,'O').replace(/Ç/g,'C');
}

function parseLocaleNumber(str){
  if(!str) return null;
  let s = String(str).replace(/[^0-9.,]/g, '');
  if(!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep = null;
  if(lastComma > lastDot) decimalSep = ',';
  else if(lastDot > lastComma) decimalSep = '.';
  if(decimalSep){
    const otherSep = decimalSep === ',' ? '.' : ',';
    s = s.split(otherSep).join('');
    s = s.replace(decimalSep, '.');
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

// Turkish insurance policies and ruhsat forms use fixed, regulated field labels
// (Başlangıç Tarihi, Bitiş Tarihi, Cinsi, Model Yılı, Markası...) regardless of
// which company issued them, so searching near these labels is far more reliable
// than scanning the whole document for "any date" or "any amount".
function ocrExtractDateNearLabel(normText, label){
  const re = new RegExp(label + '[^0-9]{0,20}(\\d{1,2})[.\\/](\\d{1,2})[.\\/](\\d{4})', 'i');
  const m = normText.match(re);
  if(!m) return null;
  const day = m[1].padStart(2,'0'), month = m[2].padStart(2,'0'), year = m[3];
  if(Number(month) < 1 || Number(month) > 12) return null;
  return `${year}-${month}-${day}`;
}

// Some insurers combine both dates on one line ("Başlangıç-Bitiş Tarihi 28/06/2026-28/06/2027")
// instead of two separate labeled fields.
function ocrExtractDateRangeCombined(normText){
  const re = /BASLANGIC[\s\S]{0,20}BITIS[\s\S]{0,20}TARIH[İI]?[^0-9]{0,10}(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s*-\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/i;
  const m = normText.match(re);
  if(!m) return null;
  const start = `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const end = `${m[6]}-${m[4].padStart(2,'0')}-${m[5].padStart(2,'0')}`;
  return {start, end};
}

function ocrExtractAmountNearLabel(normText, labels){
  for(const label of labels){
    const re = new RegExp(label + '\\s*[:\\.]?\\s*([0-9][0-9.,]{1,})', 'i');
    const m = normText.match(re);
    if(m){
      const val = parseLocaleNumber(m[1]);
      if(val !== null && val > 0) return val;
    }
  }
  return null;
}

function ocrExtractLabelYear(normText, label){
  const re = new RegExp(label + '[^0-9]{0,15}(19[7-9]\\d|20[0-4]\\d)', 'i');
  const m = normText.match(re);
  return m ? m[1] : null;
}

function ocrExtractVehicleTypeLabel(normText){
  const m = normText.match(/CINSI\s*[:\.]?\s*([A-Z0-9() ]{2,40})/);
  if(!m) return null;
  const w = m[1];
  if(w.includes('ATV') || w.includes('QUAD')) return 'atv';
  if(w.includes('MOTOSIKLET') || w.includes('MOPED')) return 'motor';
  if(w.includes('OTOBUS') || w.includes('MINIBUS')) return 'otobus';
  if(w.includes('KAMYON') || w.includes('CEKICI')) return 'tir';
  if(w.includes('ARAZI')) return 'arazi';
  if(w.includes('OTOMOBIL')) return 'otomobil';
  // Turkish DMV commonly files ATVs/UTVs under "Traktör" (tractor) class codes (T1-T3);
  // resolved later by cross-checking against known ATV brands.
  if(w.includes('TRAKTOR')) return 'traktor_ambiguous';
  return null;
}

function ocrExtractPlate(text){
  // Some insurers zero-pad the 2-digit il kodu ("035 BTA487" instead of "35 BTA487") —
  // strip the leading zero so the plate still matches and normalizes correctly.
  const m = text.match(/\b0?(\d{2})\s*([A-PR-VYZ]{1,3})\s*(\d{2,5})\b/);
  if(!m) return null;
  return `${m[1]} ${m[2].toUpperCase()} ${m[3]}`;
}

function ocrExtractDates(text){
  const regex = /\b(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\b/g;
  const dates = [];
  let m;
  while((m = regex.exec(text)) !== null){
    const day = m[1].padStart(2,'0');
    const month = m[2].padStart(2,'0');
    const year = m[3];
    if(Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31){
      dates.push(`${year}-${month}-${day}`);
    }
  }
  return dates;
}

function ocrExtractAmounts(text){
  const regex = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s?(?:TL|₺)/gi;
  const amounts = [];
  let m;
  while((m = regex.exec(text)) !== null){
    const val = parseLocaleNumber(m[1]);
    if(val !== null) amounts.push(val);
  }
  return amounts;
}

function ocrExtractCompany(text){
  const norm = trNormalize(text);
  // Prefer the name declared right after the "Sigorta Şirketi" label — a bare
  // whole-document substring scan is unreliable because a company key can be a
  // common word (e.g. "Türkiye" in "Türkiye Sigorta") that shows up in marketing
  // copy or another insurer's name with nothing to do with who issued this policy.
  const labelIdx = norm.search(/SIGORTA\s*SIRKETI/);
  const window = labelIdx >= 0 ? norm.slice(labelIdx, labelIdx + 120) : '';
  for(const c of INSURANCE_COMPANIES){
    const key = trNormalize(c.replace(' Sigorta',''));
    if(key && window.includes(key)) return c;
  }
  for(const c of INSURANCE_COMPANIES){
    const key = trNormalize(c.replace(' Sigorta',''));
    if(key && norm.includes(key)) return c;
  }
  return null;
}

function ocrExtractColor(text){
  const upper = text.toUpperCase();
  for(const c of COLOR_META){
    if(upper.includes(c.name.toUpperCase())) return c.name;
  }
  return null;
}

function ocrExtractVehicleType(text){
  const upper = trNormalize(text);
  if(upper.includes('ATV') || upper.includes('QUAD')) return 'atv';
  if(upper.includes('MOTOSIKLET') || upper.includes('MOPED')) return 'motor';
  if(upper.includes('OTOBUS') || upper.includes('MINIBUS')) return 'otobus';
  if(upper.includes('KAMYON') || upper.includes('CEKICI')) return 'tir';
  if(upper.includes('ARAZI')) return 'arazi';
  if(upper.includes('OTOMOBIL')) return 'otomobil';
  return null;
}

function ocrExtractBrandModel(text){
  const upper = text.toUpperCase();
  for(const typeKey of Object.keys(VEHICLE_DATA)){
    for(const brand of Object.keys(VEHICLE_DATA[typeKey])){
      if(upper.includes(brand.toUpperCase())){
        let foundModel = null;
        for(const model of VEHICLE_DATA[typeKey][brand]){
          if(upper.includes(model.toUpperCase())){ foundModel = model; break; }
        }
        return {type: typeKey, brand, model: foundModel};
      }
    }
  }
  return null;
}

function ocrExtractYear(text){
  const matches = text.match(/\b(19[7-9]\d|20[0-4]\d)\b/g);
  if(!matches || matches.length === 0) return null;
  return matches[matches.length - 1];
}

function ocrExtractKm(text){
  const m = text.match(/(\d{1,3}(?:[.,]\d{3})*)\s?km/i);
  if(!m) return null;
  const raw = m[1].replace(/[.,]/g,'');
  const num = parseInt(raw, 10);
  return isNaN(num) ? null : num;
}

// Upscales small/low-res photos and applies grayscale + contrast stretching
// (histogram normalization). This is one of the biggest, most reliable levers
// for OCR accuracy on real phone photos (uneven lighting, low contrast,
// small resolution) without needing any external service.
async function preprocessImageForOcr(fileOrBlob){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      const longSide = Math.max(w, h);
      const targetLong = 1800;
      if(longSide > 0 && longSide < targetLong){
        const scale = targetLong / longSide;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      try{
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const pixelCount = w * h;
        const gray = new Uint8ClampedArray(pixelCount);
        let min = 255, max = 0;
        for(let i = 0, p = 0; i < data.length; i += 4, p++){
          const g = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
          gray[p] = g;
          if(g < min) min = g;
          if(g > max) max = g;
        }
        const range = Math.max(1, max - min);
        for(let i = 0, p = 0; i < data.length; i += 4, p++){
          const v = Math.round((gray[p] - min) * 255 / range);
          data[i] = v; data[i+1] = v; data[i+2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
      }catch(e){
        // If pixel access fails for any reason, fall back to the plain resized image
      }

      canvas.toBlob(blob=>{
        if(blob) resolve(blob);
        else reject(new Error('Görsel işlenemedi'));
      }, 'image/png');
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('Görsel yüklenemedi')); };
    img.src = url;
  });
}

async function pdfFirstPageToImageBlob(file){
  if(typeof pdfjsLib === 'undefined'){
    throw new Error('PDF okuma modülü yüklenemedi');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  const page = await pdf.getPage(1);
  const scale = 2.2;
  const viewport = page.getViewport({scale});
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({canvasContext: ctx, viewport}).promise;
  return new Promise((resolve, reject)=>{
    canvas.toBlob(blob=>{
      if(blob) resolve(blob);
      else reject(new Error('PDF görüntüye çevrilemedi'));
    }, 'image/png');
  });
}

// Many real-world sigorta/ruhsat PDFs are born-digital (a real text layer, not a
// scan) and often bury the actual policy data past a cover/ad page (seen firsthand
// in a Quick Sigorta export where page 1 is pure marketing). Reading the embedded
// text directly — across the first several pages — is both more accurate than
// rasterizing+OCR'ing an image of the text, and page-order-independent.
// pdf.js returns text items in PDF content-stream order, which for multi-column
// tables (common in Turkish insurance policies — teminat/prim tables side by side)
// does NOT match visual reading order: a label and its value can land far apart
// in the raw stream even though they sit on the same table row. Reconstruct
// top-to-bottom, left-to-right order using each item's actual position on the
// page so label-proximity extraction (dates, amounts, company name) reads the
// value that's actually next to the label on screen.
function reconstructReadingOrder(items){
  const rows = [];
  const lineTolerance = 3; // px, groups items on the same visual line
  items.forEach(it=>{
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find(r=>Math.abs(r.y - y) <= lineTolerance);
    if(!row){ row = {y, items:[]}; rows.push(row); }
    row.items.push({x, str: it.str});
  });
  rows.sort((a,b)=> b.y - a.y); // PDF y-axis grows upward, so higher y = higher on the page
  return rows.map(r=> r.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ')).join('\n');
}

async function extractPdfText(file){
  if(typeof pdfjsLib === 'undefined'){
    throw new Error('PDF okuma modülü yüklenemedi');
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  const maxPages = Math.min(pdf.numPages, 8);
  let combined = '';
  for(let i = 1; i <= maxPages; i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    combined += reconstructReadingOrder(content.items) + '\n';
  }
  return combined;
}

async function runOcrAndFill(cat, file){
  if(typeof Tesseract === 'undefined'){
    throw new Error('OCR modülü yüklenemedi');
  }
  const result = await Tesseract.recognize(file, 'tur+eng');
  const text = (result && result.data && result.data.text) ? result.data.text : '';
  const confidence = (result && result.data && typeof result.data.confidence === 'number') ? result.data.confidence : null;
  return fillFieldsFromText(cat, text, confidence);
}

function fillFieldsFromText(cat, text, confidence){
  const normText = trNormalize(text);

  let mismatchWarning = null;
  const plate = ocrExtractPlate(text);
  const dates = ocrExtractDates(text);
  const amounts = ocrExtractAmounts(text);

  if(cat === 'ruhsat'){
    if(plate) document.getElementById('f-plate').value = plate;

    const color = ocrExtractColor(text);
    if(color){
      document.getElementById('f-color').value = color;
      document.getElementById('f-color-other-wrap').style.display = 'none';
    }

    const bm = ocrExtractBrandModel(text);
    let detectedType = ocrExtractVehicleTypeLabel(normText);
    if(detectedType === 'traktor_ambiguous'){
      detectedType = (bm && bm.type === 'atv') ? 'atv' : null;
    }
    if(!detectedType) detectedType = ocrExtractVehicleType(text);
    if(detectedType){
      selectedType = detectedType;
      renderTypeGrid();
      populateBrands();
    }

    if(bm){
      if(!detectedType){ selectedType = bm.type; renderTypeGrid(); populateBrands(); }
      const brands = Object.keys(VEHICLE_DATA[selectedType] || {});
      if(brands.includes(bm.brand)){
        document.getElementById('f-brand').value = bm.brand;
        onBrandChange();
        if(bm.model){
          const models = VEHICLE_DATA[selectedType][bm.brand] || [];
          if(models.includes(bm.model)) document.getElementById('f-model').value = bm.model;
        }
      }
    }

    const year = ocrExtractLabelYear(normText, 'MODEL YILI') || ocrExtractYear(text);
    if(year) document.getElementById('f-year').value = year;
  } else if(cat === 'sigorta' || cat === 'kasko'){
    const company = ocrExtractCompany(text);
    const companySel = document.getElementById('f-' + cat + '-company');
    const companyOtherWrap = document.getElementById('f-' + cat + '-company-other-wrap');
    if(company){
      companySel.value = company;
      companyOtherWrap.style.display = 'none';
    }
    const startDate = ocrExtractDateNearLabel(normText, 'BASLANGIC TARIHI');
    const endDate = ocrExtractDateNearLabel(normText, 'BITIS TARIHI');
    let finalStart = startDate, finalEnd = endDate;
    if(!finalStart || !finalEnd){
      const range = ocrExtractDateRangeCombined(normText);
      if(range){
        finalStart = finalStart || range.start;
        finalEnd = finalEnd || range.end;
      }
    }
    if(finalEnd) document.getElementById('f-' + cat).value = finalEnd;
    if(finalStart) document.getElementById('f-' + cat + '-start').value = finalStart;
    else if(finalEnd) document.getElementById('f-' + cat + '-start').value = addYears(finalEnd, -1);

    const amount = ocrExtractAmountNearLabel(normText, ['TOPLAM ODENECEK PRIM','ODENECEK PRIM','ODENECEK TUTAR','BRUT PRIM','TOPLAM PRIM','NET PRIM']);
    if(amount !== null) document.getElementById('f-' + cat + '-amount').value = amount;
    mismatchWarning = checkPlateMismatch(plate);
  } else if(cat === 'bakim'){
    if(dates.length) document.getElementById('f-bakim').value = dates[0];
    const bakimAmount = ocrExtractAmountNearLabel(normText, ['GENEL TOPLAM','ODENECEK TUTAR','TOPLAM TUTAR','TOPLAM']);
    const finalAmount = bakimAmount !== null ? bakimAmount : (amounts.length ? Math.max(...amounts) : null);
    if(finalAmount !== null) document.getElementById('f-bakim-amount').value = finalAmount;
    const km = ocrExtractKm(text);
    if(km) document.getElementById('f-km').value = km;
    mismatchWarning = checkPlateMismatch(plate);
  } else if(cat === 'vize'){
    // TÜVTürk-style inspection reports are a nationally standardized two-column
    // bilingual form; OCR reading order can scramble which label sits next to which
    // value. The inspection validity date ("Muayene Geçerlilik Tarihi") is always the
    // furthest-future date on the report (later than inspection date, first
    // registration, registration date), so that is a more robust signal than label
    // proximity alone.
    const labelDate = ocrExtractDateNearLabel(normText, 'GECERLILIK') || ocrExtractDateNearLabel(normText, 'MUAYENE GECERLILIK');
    const latestDate = dates.length ? dates.slice().sort().reverse()[0] : null;
    const vizeDate = labelDate || latestDate;
    if(vizeDate) document.getElementById('f-vize').value = vizeDate;
    const plateField = document.getElementById('f-plate');
    if(plate && !plateField.value.trim()) plateField.value = plate;
    else mismatchWarning = checkPlateMismatch(plate);
  }

  if(window.gbRefreshDateButtons) window.gbRefreshDateButtons();
  return {mismatchWarning, confidence};
}

async function handleUpload(cat){
  const input = document.getElementById('f-' + cat + '-file');
  const file = input.files[0];
  if(!file) return;
  const statusEl = document.getElementById(cat + '-status');

  if(file.size > 4.5 * 1024 * 1024){
    statusEl.textContent = 'Dosya çok büyük (4.5MB üzeri). Daha küçük bir dosya seç.';
    statusEl.className = 'doc-status err';
    input.value = '';
    return;
  }

  statusEl.textContent = 'Yükleniyor…';
  statusEl.className = 'doc-status';

  try{
    const base64 = await readFileAsBase64(file);
    pendingDocs[cat] = {base64, mediaType: file.type, fileName: file.name};
    renderDocLinks(cat);

    if(file.type.startsWith('image/') || file.type === 'application/pdf'){
      statusEl.textContent = 'Belge okunuyor… (ilk seferde biraz uzun sürebilir)';
      showUploadSpinner();
      try{
        let mismatchWarning, confidence, readAsText = false;
        if(file.type === 'application/pdf'){
          const pdfText = await extractPdfText(file);
          if(pdfText.replace(/\s+/g, '').length > 40){
            readAsText = true;
            ({mismatchWarning, confidence} = fillFieldsFromText(cat, pdfText, 100));
          }
        }
        if(!readAsText){
          const rawInput = file.type === 'application/pdf' ? await pdfFirstPageToImageBlob(file) : file;
          const cleanedInput = await preprocessImageForOcr(rawInput);
          ({mismatchWarning, confidence} = await runOcrAndFill(cat, cleanedInput));
        }
        docCardMode[cat] = 'both';
        renderCardMode(cat);
        showAiNote(cat);
        if(mismatchWarning){
          statusEl.textContent = mismatchWarning;
          statusEl.className = 'doc-status warn';
          setCardStatus(cat, '⚠ Kontrol et', 'warn');
        } else if(!readAsText && confidence !== null && confidence < 55){
          statusEl.textContent = '⚠ Belge net okunamadı (bulanık/eğik olabilir). Bulduklarımı doldurdum ama mutlaka kontrol et, gerekirse daha net bir fotoğrafla tekrar dene.';
          statusEl.className = 'doc-status warn';
          setCardStatus(cat, '⚠ Netlik düşük', 'warn');
        } else {
          statusEl.textContent = '✓ Belge okundu, bulduklarımı doldurdum — kontrol edip tamamla.';
          statusEl.className = 'doc-status ok';
          setCardStatus(cat, '✓ Okundu', 'ok');
        }
      }catch(ocrErr){
        docCardMode[cat] = 'both';
        renderCardMode(cat);
        showAiNote(cat);
        statusEl.textContent = '✓ Belge saklandı ama otomatik okunamadı, bilgileri aşağıya elle gir.';
        statusEl.className = 'doc-status warn';
        setCardStatus(cat, '✓ Saklandı', 'warn');
      } finally {
        hideUploadSpinner();
      }
    } else {
      statusEl.textContent = '✓ Belge saklandı. Bu dosya türünde otomatik okuma yok, bilgileri aşağıya elle gir.';
      statusEl.className = 'doc-status ok';
      setCardStatus(cat, '✓ Belge saklandı', 'ok');
      docCardMode[cat] = 'both';
      renderCardMode(cat);
    }
  }catch(e){
    statusEl.textContent = 'Belge yüklenemedi, tekrar dene.';
    statusEl.className = 'doc-status err';
    hideUploadSpinner();
  }
}

// Shown once per upload, regardless of read outcome — reminds the user this is
// still the regex/OCR pipeline (no Claude vision integration yet), so even a
// "✓ Okundu" result can be silently wrong and needs a human check before saving.
function showAiNote(cat){
  const el = document.getElementById(cat + '-ai-note');
  if(el) el.style.display = 'block';
}

function setCardStatus(cat, text, level){
  const el = document.getElementById(cat + '-card-status');
  if(!el) return;
  el.textContent = text;
  el.className = 'doc-card-status' + (level ? ' ' + level : '');
}
function showUploadSpinner(){ document.getElementById('uploadOverlay').style.display = 'flex'; }
function hideUploadSpinner(){ document.getElementById('uploadOverlay').style.display = 'none'; }

function viewDataUri(base64, mediaType){
  try{
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for(let i=0;i<byteChars.length;i++){ byteNumbers[i]=byteChars.charCodeAt(i); }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {type:mediaType});
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }catch(e){ alert('Belge açılamadı.'); }
}
function viewPendingDoc(cat){ const d = pendingDocs[cat]; if(d) viewDataUri(d.base64, d.mediaType); }
function removePendingDoc(cat){ pendingDocs[cat] = null; document.getElementById('f-' + cat + '-file').value=''; document.getElementById(cat+'-status').textContent=''; renderDocLinks(cat); }
async function viewStoredDoc(cat){
  try{
    const key = 'doc:' + tempId + ':' + cat;
    const res = await window.storage.get(key, false);
    if(res){ const parsed = JSON.parse(res.value); viewDataUri(parsed.base64, parsed.mediaType); }
  }catch(e){ alert('Belge yüklenemedi.'); }
}
async function removeStoredDoc(cat){
  if(!confirm('Bu belgeyi silmek istediğine emin misin?')) return;
  try{
    const key = 'doc:' + tempId + ':' + cat;
    await window.storage.delete(key, false);
  }catch(e){}
  existingDocs[cat] = null;
  renderDocLinks(cat);
}

async function saveVehicle(){
  clearFieldErrors();
  const plate = document.getElementById('f-plate').value.trim().toUpperCase();

  let brand = document.getElementById('f-brand').value;
  if(brand === OTHER) brand = document.getElementById('f-brand-other').value.trim();
  let model = document.getElementById('f-model-wrap').style.display === 'none' ? '' : document.getElementById('f-model').value;
  if(model === OTHER || (document.getElementById('f-model-other-wrap').style.display === 'block' && !model)){
    model = document.getElementById('f-model-other').value.trim();
  }
  const year = document.getElementById('f-year').value;

  const missing = [];
  if(!plate) missing.push({id: 'f-plate', label: 'Plaka'});
  if(!brand) missing.push({id: document.getElementById('f-brand').value === OTHER ? 'f-brand-other' : 'f-brand', label: 'Marka'});
  if(!model) missing.push({id: (document.getElementById('f-model-wrap').style.display === 'none' || document.getElementById('f-model').value === OTHER) ? 'f-model-other' : 'f-model', label: 'Model'});
  if(!year) missing.push({id: 'f-year', label: 'Model Yılı'});

  if(missing.length > 0){
    missing.forEach(m=>{
      const el = document.getElementById(m.id);
      if(el) el.classList.add('field-error');
    });
    alert('Lütfen şu alanları doldur: ' + missing.map(m=>m.label).join(', '));
    const firstEl = document.getElementById(missing[0].id);
    if(firstEl){ firstEl.focus(); firstEl.scrollIntoView({behavior:'smooth', block:'center'}); }
    return;
  }

  let sigortaCompany = document.getElementById('f-sigorta-company').value;
  if(sigortaCompany === OTHER) sigortaCompany = document.getElementById('f-sigorta-company-other').value.trim();
  let kaskoCompany = document.getElementById('f-kasko-company').value;
  if(kaskoCompany === OTHER) kaskoCompany = document.getElementById('f-kasko-company-other').value.trim();
  let color = document.getElementById('f-color').value;
  if(color === OTHER) color = document.getElementById('f-color-other').value.trim();

  const newSigorta = {date: document.getElementById('f-sigorta').value, startDate: document.getElementById('f-sigorta-start').value, company: sigortaCompany, amount: document.getElementById('f-sigorta-amount').value};
  const newKasko = {date: document.getElementById('f-kasko').value, startDate: document.getElementById('f-kasko-start').value, company: kaskoCompany, amount: document.getElementById('f-kasko-amount').value};
  const newBakim = {date: document.getElementById('f-bakim').value, nextDate: document.getElementById('f-bakim-next').value, amount: document.getElementById('f-bakim-amount').value, note: document.getElementById('f-bakim-note').value.trim()};
  const newVize = {date: document.getElementById('f-vize').value};

  const data = {
    plate, type: selectedType, brand, model,
    year: document.getElementById('f-year').value,
    kmGuncel: document.getElementById('f-km').value,
    status: selectedStatus,
    photo: currentPhotoDataUrl,
    color,
    note: document.getElementById('f-note').value.trim(),
    sigorta: newSigorta, kasko: newKasko, bakim: newBakim, vize: newVize,
  };

  let vehicle;
  let history = [];
  if(editingId){
    const idx = vehicles.findIndex(x=>x.id === editingId);
    const old = vehicles[idx];
    history = old.history || [];
    if(old.sigorta.date && old.sigorta.date !== newSigorta.date){
      history.push({cat:'sigorta', date: old.sigorta.date, startDate: old.sigorta.startDate, company: old.sigorta.company, amount: old.sigorta.amount, archivedAt: new Date().toISOString()});
    }
    if(old.kasko.date && old.kasko.date !== newKasko.date){
      history.push({cat:'kasko', date: old.kasko.date, startDate: old.kasko.startDate, company: old.kasko.company, amount: old.kasko.amount, archivedAt: new Date().toISOString()});
    }
    if(old.bakim.date && old.bakim.date !== newBakim.date){
      history.push({cat:'bakim', date: old.bakim.date, nextDate: old.bakim.nextDate, amount: old.bakim.amount, note: old.bakim.note, archivedAt: new Date().toISOString()});
    }
    if(old.vize.date && old.vize.date !== newVize.date){
      history.push({cat:'vize', date: old.vize.date, archivedAt: new Date().toISOString()});
    }
    vehicle = {...old, ...data, id: old.id, docs: old.docs || {sigorta:null,kasko:null,bakim:null,vize:null,ruhsat:null}, history};
    vehicles[idx] = vehicle;
  } else {
    if(vehicles.length >= getVehicleLimit()){
      alert('Araç limitine ulaştın. Daha fazla araç eklemek için Pro paketine geç.');
      closeModal();
      openPackagesScreen();
      return;
    }
    vehicle = {id: tempId, ...data, docs: {sigorta:null,kasko:null,bakim:null,vize:null,ruhsat:null}, history: []};
    vehicles.push(vehicle);
  }

  for(const cat of ['sigorta','kasko','bakim','vize','ruhsat']){
    if(pendingDocs[cat]){
      try{
        const key = 'doc:' + vehicle.id + ':' + cat;
        await window.storage.set(key, JSON.stringify(pendingDocs[cat]), false);
        vehicle.docs[cat] = {fileName: pendingDocs[cat].fileName};
      }catch(e){ console.error('Belge kaydedilemedi', e); }
    }
  }

  await persist();
  await cancelRemindersForVehicle(vehicle);
  await scheduleRemindersForVehicle(vehicle);
  render();
  closeModal();
}

async function deleteVehicle(){
  if(!editingId) return;
  if(!confirm('Bu aracı silmek istediğine emin misin? Kayıtlı belgeler de silinecek.')) return;
  const removedVehicle = vehicles.find(x=>x.id === editingId);
  for(const cat of ['sigorta','kasko','bakim','vize','ruhsat']){
    try{ await window.storage.delete('doc:' + editingId + ':' + cat, false); }catch(e){}
  }
  vehicles = vehicles.filter(x=>x.id !== editingId);
  await persist();
  await cancelRemindersForVehicle(removedVehicle);
  render();
  closeModal();
}

function generatePdfReport(){
  if(typeof window.jspdf === 'undefined'){
    alert('PDF oluşturucu yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const navy = [27,42,74];
  const orange = [232,121,46];
  const ink = [35,38,43];
  const muted = [107,114,128];
  const lineGray = [216,208,188];
  const totalBg = [252,235,207];

  function drawHeader(){
    doc.setFillColor(navy[0],navy[1],navy[2]);
    doc.rect(0,0,pageWidth,26,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold'); doc.setFontSize(15);
    doc.text('Garaj Defteri', 14, 12);
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
    doc.text('Arac Raporu', 14, 19);
    doc.setFontSize(8.5);
    doc.text(new Date().toLocaleDateString('tr-TR'), pageWidth - 14, 12, {align:'right'});
    doc.setTextColor(ink[0],ink[1],ink[2]);
    return 34;
  }

  let y = drawHeader();
  let totalExpense = 0;
  const list = getFilteredSorted();

  list.forEach(v=>{
    if(y > 245){ doc.addPage(); y = drawHeader(); }

    doc.setFont('helvetica','bold'); doc.setFontSize(11.5);
    doc.setTextColor(navy[0],navy[1],navy[2]);
    doc.text((v.plate || '').toUpperCase(), 16, y + 6);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
    doc.setTextColor(orange[0],orange[1],orange[2]);
    doc.text(typeLabel(v.type).toUpperCase(), 16, y + 11);
    doc.setTextColor(ink[0],ink[1],ink[2]);
    doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
    const brandModelLine = `${[v.brand,v.model].filter(Boolean).join(' ')}${v.year ? ' (' + v.year + ')' : ''}`;
    doc.text(brandModelLine, 62, y + 6);
    y += 15;

    doc.setDrawColor(lineGray[0],lineGray[1],lineGray[2]);
    doc.setLineWidth(0.3);
    doc.line(16, y, pageWidth - 16, y);
    y += 6;

    doc.setFontSize(9);
    if(v.kmGuncel){
      doc.setTextColor(muted[0],muted[1],muted[2]); doc.text('Kilometre', 16, y);
      doc.setTextColor(ink[0],ink[1],ink[2]); doc.text(`${Number(v.kmGuncel).toLocaleString('tr-TR')} km`, 55, y);
      y += 5.5;
    }

    const rowsData = [
      ['Trafik Sigortasi', `${v.sigorta.company || '-'}${v.sigorta.startDate ? '  |  ' + fmtDate(v.sigorta.startDate) + ' - ' + fmtDate(v.sigorta.date) : '  |  Bitis: ' + fmtDate(v.sigorta.date)}  |  ${fmtMoney(v.sigorta.amount)}`],
      ['Kasko', `${v.kasko.company || '-'}${v.kasko.startDate ? '  |  ' + fmtDate(v.kasko.startDate) + ' - ' + fmtDate(v.kasko.date) : '  |  Bitis: ' + fmtDate(v.kasko.date)}  |  ${fmtMoney(v.kasko.amount)}`],
      ['Vize', `Bitis: ${fmtDate(v.vize.date)}`],
      ['Bakim', `Son: ${fmtDate(v.bakim.date)}  |  Sonraki: ${fmtDate(v.bakim.nextDate)}  |  ${fmtMoney(v.bakim.amount)}${v.bakim.note ? '  |  ' + v.bakim.note : ''}`],
    ];
    rowsData.forEach(([label, value])=>{
      doc.setTextColor(muted[0],muted[1],muted[2]); doc.text(label, 16, y);
      doc.setTextColor(ink[0],ink[1],ink[2]); doc.text(value, 55, y);
      y += 5.5;
    });

    if(v.note){
      doc.setTextColor(muted[0],muted[1],muted[2]);
      const lines = doc.splitTextToSize(`Not: ${v.note}`, pageWidth - 32);
      doc.text(lines, 16, y);
      y += lines.length * 5;
      doc.setTextColor(ink[0],ink[1],ink[2]);
    }

    totalExpense += (Number(v.sigorta.amount)||0) + (Number(v.kasko.amount)||0) + (Number(v.bakim.amount)||0);
    (v.history||[]).forEach(h=> totalExpense += Number(h.amount)||0);

    y += 7;
  });

  if(y > 250){ doc.addPage(); y = drawHeader(); }
  doc.setFillColor(totalBg[0],totalBg[1],totalBg[2]);
  doc.roundedRect(14, y, pageWidth - 28, 12, 2, 2, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.setTextColor(navy[0],navy[1],navy[2]);
  doc.text(`Toplam Kayitli Gider: ${fmtMoney(totalExpense)}`, 18, y + 8);

  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++){
    doc.setPage(i);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(muted[0],muted[1],muted[2]);
    doc.text(`Garaj Defteri  ·  Sayfa ${i}/${pageCount}`, pageWidth / 2, 290, {align:'center'});
  }

  doc.save('garaj-defteri-raporu.pdf');
}

function toDateStr(val){
  if(val === null || val === undefined || val === '') return '';
  if(val instanceof Date){
    const off = val.getTimezoneOffset();
    const d2 = new Date(val.getTime() - off * 60000);
    return d2.toISOString().slice(0,10);
  }
  if(typeof val === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF){
    const d = XLSX.SSF.parse_date_code(val);
    if(d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return String(val);
}

function exportToExcel(){
  if(typeof XLSX === 'undefined'){
    alert('Excel modülü yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    return;
  }
  if(vehicles.length === 0){
    alert('Dışa aktarılacak araç bulunamadı.');
    return;
  }
  const rows = vehicles.map(v=>({
    Plaka: v.plate || '',
    Tur: v.type || '',
    Marka: v.brand || '',
    Model: v.model || '',
    Yil: v.year || '',
    KM: v.kmGuncel || '',
    Durum: v.status || 'aktif',
    Renk: v.color || '',
    SigortaFirma: v.sigorta.company || '',
    SigortaBaslangic: v.sigorta.startDate || '',
    SigortaBitis: v.sigorta.date || '',
    SigortaTutar: v.sigorta.amount || '',
    KaskoFirma: v.kasko.company || '',
    KaskoBaslangic: v.kasko.startDate || '',
    KaskoBitis: v.kasko.date || '',
    KaskoTutar: v.kasko.amount || '',
    BakimTarih: v.bakim.date || '',
    BakimSonraki: v.bakim.nextDate || '',
    BakimTutar: v.bakim.amount || '',
    BakimNot: v.bakim.note || '',
    VizeBitis: v.vize.date || '',
    Not: v.note || '',
    Gecmis: JSON.stringify(v.history || []),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Araclar');
  XLSX.writeFile(wb, 'garaj-defteri-yedek.xlsx');
}

async function deleteAllVehicles(){
  if(vehicles.length === 0){
    alert('Silinecek araç yok.');
    return;
  }
  const count = vehicles.length;
  if(!confirm(`${count} aracın TÜMÜNÜ silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
  if(!confirm('Son kez soruyorum: tüm araçlar, belgeleri ve geçmiş kayıtları kalıcı olarak silinecek. Devam edilsin mi?')) return;

  for(const v of vehicles){
    for(const cat of ['sigorta','kasko','bakim','vize','ruhsat']){
      try{ await window.storage.delete('doc:' + v.id + ':' + cat, false); }catch(e){}
    }
    await cancelRemindersForVehicle(v);
  }
  vehicles = [];
  await persist();
  render();
  if(activeTab === 'documents') renderDocumentsTab();
  if(activeTab === 'analytics') renderAnalyticsTab();
  alert(`${count} araç silindi.`);
}

async function handleExcelImport(e){
  const file = e.target.files[0];
  if(!file) return;
  if(typeof XLSX === 'undefined'){
    alert('Excel modülü yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    e.target.value = '';
    return;
  }
  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
    if(rows.length === 0){
      alert('Dosyada okunacak veri bulunamadı.');
      e.target.value = '';
      return;
    }
    if(!confirm(`${rows.length} araç bulundu. Bunlar mevcut listene EK olarak eklenecek (hiçbir şeyin üzerine yazılmaz). Devam edilsin mi?`)){
      e.target.value = '';
      return;
    }

    let importedCount = 0;
    rows.forEach(r=>{
      if(!r.Plaka) return;
      let history = [];
      try{ history = JSON.parse(r.Gecmis || '[]'); }catch(err){ history = []; }
      vehicles.push({
        id: genId(),
        plate: String(r.Plaka || '').toUpperCase(),
        type: String(r.Tur || 'otomobil'),
        brand: String(r.Marka || ''),
        model: String(r.Model || ''),
        year: String(r.Yil || ''),
        kmGuncel: String(r.KM || ''),
        status: r.Durum === 'pasif' ? 'pasif' : 'aktif',
        color: String(r.Renk || ''),
        note: String(r.Not || ''),
        sigorta: {company: String(r.SigortaFirma || ''), startDate: toDateStr(r.SigortaBaslangic), date: toDateStr(r.SigortaBitis), amount: String(r.SigortaTutar || '')},
        kasko: {company: String(r.KaskoFirma || ''), startDate: toDateStr(r.KaskoBaslangic), date: toDateStr(r.KaskoBitis), amount: String(r.KaskoTutar || '')},
        bakim: {date: toDateStr(r.BakimTarih), nextDate: toDateStr(r.BakimSonraki), amount: String(r.BakimTutar || ''), note: String(r.BakimNot || '')},
        vize: {date: toDateStr(r.VizeBitis)},
        docs: {sigorta:null, kasko:null, bakim:null, vize:null, ruhsat:null},
        history,
      });
      importedCount++;
    });

    await persist();
    await rescheduleAllReminders();
    render();
    if(activeTab === 'documents') renderDocumentsTab();
    if(activeTab === 'analytics') renderAnalyticsTab();
    alert(`${importedCount} araç başarıyla içe aktarıldı.`);
  }catch(err){
    alert('Excel dosyası okunamadı. Dosyanın bu uygulamadan alınmış bir yedek olduğundan emin ol.');
  }
  e.target.value = '';
}

let isProBireysel = false;
let kurumsalTier = null;

const IAP_PRODUCT_IDS = {
  bireyselPro: 'com.majkasolutions.garagebook.pro.yillik',
  kurumsal25: 'com.majkasolutions.garagebook.kurumsal.baslangic',
  kurumsal75: 'com.majkasolutions.garagebook.kurumsal.standart',
  kurumsal200: 'com.majkasolutions.garagebook.kurumsal.plus',
};

function hasNativeIAP(){
  return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.IAPPurchases);
}

// Cached live product info (price/name) from StoreKit, keyed by product id.
// Apple requires the price you display to match what StoreKit reports, so
// renderPackagesScreen() prefers this over the hardcoded fallback text.
let iapProductsCache = null;
function iapDebugLog(text){
  try{ window.Capacitor.Plugins.IAPPurchases.debugLog({text}); }catch(e){}
}
async function loadIAPProducts(){
  iapDebugLog('hasNativeIAP=' + hasNativeIAP());
  if(!hasNativeIAP()) return {};
  if(iapProductsCache) return iapProductsCache;
  try{
    const ids = Object.values(IAP_PRODUCT_IDS);
    iapDebugLog('calling getProducts ' + JSON.stringify(ids));
    const res = await window.Capacitor.Plugins.IAPPurchases.getProducts({productIds: ids});
    iapDebugLog('getProducts result ' + JSON.stringify(res));
    const map = {};
    (res.products || []).forEach(p => { map[p.id] = p; });
    iapProductsCache = map;
    return map;
  }catch(e){ iapDebugLog('getProducts error ' + (e && e.message)); return {}; }
}

// Reconciles local Pro/Kurumsal flags with Apple's actual subscription state
// (StoreKit is the source of truth — a renewal lapse, refund, or a purchase
// restored on a new device all show up here). Called on every app launch;
// safe to call again anytime, it just re-derives from currentEntitlements.
async function syncEntitlementsFromStore(){
  if(!hasNativeIAP()) return;
  try{
    const res = await window.Capacitor.Plugins.IAPPurchases.getActiveEntitlements();
    iapDebugLog('syncEntitlementsFromStore result ' + JSON.stringify(res));
    const active = new Set(res.activeProductIds || []);
    isProBireysel = active.has(IAP_PRODUCT_IDS.bireyselPro);
    if(active.has(IAP_PRODUCT_IDS.kurumsal200)) kurumsalTier = '200';
    else if(active.has(IAP_PRODUCT_IDS.kurumsal75)) kurumsalTier = '75';
    else if(active.has(IAP_PRODUCT_IDS.kurumsal25)) kurumsalTier = '25';
    else kurumsalTier = null;
    await saveProStatus();
  }catch(e){ iapDebugLog('syncEntitlementsFromStore error ' + (e && e.message)); }
}

function proStatusKey(){
  return 'proStatus_' + (accountType || 'bireysel');
}
async function loadProStatus(){
  try{
    const res = await window.storage.get(proStatusKey(), false);
    if(res && res.value){
      const parsed = JSON.parse(res.value);
      isProBireysel = !!parsed.isProBireysel;
      kurumsalTier = parsed.kurumsalTier || null;
    } else {
      isProBireysel = false;
      kurumsalTier = null;
    }
  }catch(e){
    isProBireysel = false;
    kurumsalTier = null;
  }
}
async function saveProStatus(){
  try{ await window.storage.set(proStatusKey(), JSON.stringify({isProBireysel, kurumsalTier}), false); }catch(e){}
}

function getVehicleLimit(){
  if(accountType === 'kurumsal'){
    if(kurumsalTier === '25') return 25;
    if(kurumsalTier === '75') return 75;
    if(kurumsalTier === '200') return 200;
    return 0;
  }
  return isProBireysel ? 10 : 1;
}

function openContactEmail(){
  const mailto = 'mailto:majkasolutionsturkey@gmail.com?subject=' + encodeURIComponent('Garage Book - Geri Bildirim');
  window.location.href = mailto;
}

function closePackagesScreen(){
  document.getElementById('packagesOverlay').classList.remove('open');
}

function renderPackagesScreen(){
  const el = document.getElementById('packagesModalContent');
  const mailto = 'mailto:majkasolutionsturkey@gmail.com?subject=' + encodeURIComponent('Garage Book - Geri Bildirim');
  const contactHtml = `<div class="pkg-contact">Sorun mu var, önerin mi var?<br><a href="${mailto}">majkasolutionsturkey@gmail.com</a></div>`;
  const privacyHtml = `<div class="pkg-contact">🔒 Tüm bilgilerin sadece bu telefonda saklanır, hiçbir yere aktarılmaz.</div>`;

  const restoreHtml = hasNativeIAP()
    ? `<button class="change-mode-link" style="display:block; text-align:center; width:100%; margin-top:4px;" onclick="restoreIAPPurchases()">Satın Almaları Geri Yükle</button>`
    : '';

  if(accountType === 'kurumsal'){
    const tiers = [
      {key:'25', productId: IAP_PRODUCT_IDS.kurumsal25, label:'Kurumsal Başlangıç', price:'899 ₺', features:['25 araca kadar kayıt','Sınırsız belge yükleme','PDF ve Excel dışa aktarma','Bildirim ve hatırlatmalar']},
      {key:'75', productId: IAP_PRODUCT_IDS.kurumsal75, label:'Kurumsal Standart', price:'1.999 ₺', features:['75 araca kadar kayıt','Sınırsız belge yükleme','PDF ve Excel dışa aktarma','Bildirim ve hatırlatmalar']},
      {key:'200', productId: IAP_PRODUCT_IDS.kurumsal200, label:'Kurumsal Plus', price:'4.999 ₺', features:['200 araca kadar kayıt (üst sınır)','Sınırsız belge yükleme','PDF ve Excel dışa aktarma','Bildirim ve hatırlatmalar']},
    ];
    const cardsHtml = tiers.map(t=>{
      const isCurrent = kurumsalTier === t.key;
      const liveProduct = iapProductsCache ? iapProductsCache[t.productId] : null;
      const priceLabel = liveProduct ? liveProduct.displayPrice : t.price;
      const buyDisabled = !hasNativeIAP() || !liveProduct;
      return `
        <div class="pkg-card ${isCurrent ? 'pkg-highlight' : ''}">
          <div class="pkg-title">${t.label}</div>
          <div class="pkg-price">${priceLabel}<span style="font-size:14px;">/yıl</span></div>
          <ul class="pkg-features">${t.features.map(f=>`<li>${f}</li>`).join('')}</ul>
          ${isCurrent
            ? `<div class="pkg-current">✓ Aktif Abonelik</div><button class="change-mode-link" style="display:block; text-align:center; margin-top:8px;" onclick="openManageSubscriptions()">Aboneliği Yönet / İptal Et</button>`
            : `<button class="pkg-buy-btn" ${buyDisabled ? 'disabled' : ''} onclick="selectKurumsalTier('${t.key}')">${buyDisabled ? 'Yakında' : 'Satın Al'}</button>`}
        </div>`;
    }).join('');
    el.innerHTML = `
      <h2>🏢 Kurumsal Paketler</h2>
      <p style="font-size:12px; color:var(--muted); margin:-10px 0 4px;">Yıllık abonelik, istediğin zaman iptal edebilirsin.</p>
      <p style="font-size:13px; color:var(--muted); margin:0 0 16px;">Filondaki araç sayısına göre bir paket seç.</p>
      ${cardsHtml}
      <div class="pkg-card">
        <div class="pkg-title">200+ Araç</div>
        <div class="pkg-price" style="font-size:16px;">Özel fiyatlandırma</div>
        <ul class="pkg-features"><li>Büyük filolar için özel teklif</li></ul>
        <a class="pkg-buy-btn" style="display:block; text-align:center; text-decoration:none;" href="${mailto}">Bize Ulaşın</a>
      </div>
      ${restoreHtml}
      ${privacyHtml}
      ${contactHtml}
      <div class="modal-actions"><button class="btn-secondary" onclick="closePackagesScreen()">Kapat</button></div>
    `;
  } else {
    const liveProduct = iapProductsCache ? iapProductsCache[IAP_PRODUCT_IDS.bireyselPro] : null;
    const priceLabel = liveProduct ? liveProduct.displayPrice : '249 ₺';
    const buyDisabled = !hasNativeIAP() || !liveProduct;
    const cardHtml = `
      <div class="pkg-card ${isProBireysel ? 'pkg-highlight' : ''}">
        <div class="pkg-title">Bireysel Pro</div>
        <div class="pkg-price">${priceLabel}<span style="font-size:14px;">/yıl</span></div>
        <ul class="pkg-features">
          <li>10 araca kadar kayıt (ücretsizde 1)</li>
          <li>Sınırsız belge yükleme</li>
          <li>PDF ve Excel dışa aktarma</li>
          <li>Bildirim ve hatırlatmalar</li>
          <li class="pkg-soon">Yapay Zeka Destekli Belge Analizi (yakında)</li>
        </ul>
        ${isProBireysel
          ? `<div class="pkg-current">✓ Pro Sürüm Aktif</div><button class="change-mode-link" style="display:block; text-align:center; margin-top:8px;" onclick="openManageSubscriptions()">Aboneliği Yönet / İptal Et</button>`
          : `<button class="pkg-buy-btn" ${buyDisabled ? 'disabled' : ''} onclick="purchaseBireyselPro()">${buyDisabled ? 'Yakında' : 'Satın Al'}</button>`}
      </div>`;
    el.innerHTML = `
      <h2>⭐ Bireysel Pro</h2>
      <p style="font-size:13px; color:var(--muted); margin:0 0 16px;">Ücretsiz sürümde 1 araca kadar kayıt yapabilirsin.</p>
      ${cardHtml}
      ${restoreHtml}
      ${privacyHtml}
      ${contactHtml}
      <div class="modal-actions"><button class="btn-secondary" onclick="closePackagesScreen()">Kapat</button></div>
    `;
  }
}

async function openPackagesScreen(){
  document.getElementById('packagesOverlay').classList.add('open');
  renderPackagesScreen();
  await loadIAPProducts();
  renderPackagesScreen();
}

async function purchaseBireyselPro(){
  if(!hasNativeIAP()){
    alert('Satın alma sadece gerçek iPhone üzerinde, App Store üzerinden yapılabilir.');
    return;
  }
  try{
    iapDebugLog('purchase() calling for ' + IAP_PRODUCT_IDS.bireyselPro);
    const res = await window.Capacitor.Plugins.IAPPurchases.purchase({productId: IAP_PRODUCT_IDS.bireyselPro});
    iapDebugLog('purchase() result ' + JSON.stringify(res));
    if(res.status === 'success'){
      isProBireysel = true;
      await saveProStatus();
      renderPackagesScreen();
      render();
      alert('Bireysel Pro aktif edildi! Artık 10 araca kadar kayıt yapabilirsin.');
    } else if(res.status === 'pending'){
      alert('Satın alma onay bekliyor (Aile Onayı gerekebilir). Onaylanınca otomatik olarak aktif olacak.');
    }
    // 'cancelled': user backed out of the sheet themselves, no alert needed.
  }catch(e){
    iapDebugLog('purchase() error ' + (e && e.message));
    alert('Satın alma sırasında bir sorun oluştu: ' + (e && e.message ? e.message : 'Bilinmeyen hata'));
  }
}

async function selectKurumsalTier(tier){
  const productId = tier === '25' ? IAP_PRODUCT_IDS.kurumsal25
    : tier === '75' ? IAP_PRODUCT_IDS.kurumsal75
    : tier === '200' ? IAP_PRODUCT_IDS.kurumsal200
    : null;
  if(!productId) return;
  if(!hasNativeIAP()){
    alert('Satın alma sadece gerçek iPhone üzerinde, App Store üzerinden yapılabilir.');
    return;
  }
  try{
    const res = await window.Capacitor.Plugins.IAPPurchases.purchase({productId});
    if(res.status === 'success'){
      kurumsalTier = tier;
      await saveProStatus();
      renderPackagesScreen();
      render();
      alert('Abonelik aktif edildi!');
    } else if(res.status === 'pending'){
      alert('Satın alma onay bekliyor. Onaylanınca otomatik olarak aktif olacak.');
    }
  }catch(e){
    alert('Satın alma sırasında bir sorun oluştu: ' + (e && e.message ? e.message : 'Bilinmeyen hata'));
  }
}

// Apple doesn't let apps cancel a subscription programmatically — cancellation
// only happens through Apple's own "Manage Subscriptions" sheet or Settings.
async function openManageSubscriptions(){
  if(!hasNativeIAP()){
    alert('Abonelik yönetimi sadece gerçek iPhone üzerinden yapılabilir.');
    return;
  }
  try{
    await window.Capacitor.Plugins.IAPPurchases.showManageSubscriptions();
  }catch(e){}
  await syncEntitlementsFromStore();
  renderPackagesScreen();
  render();
}

async function restoreIAPPurchases(){
  if(!hasNativeIAP()) return;
  try{
    await window.Capacitor.Plugins.IAPPurchases.restorePurchases();
  }catch(e){}
  await syncEntitlementsFromStore();
  renderPackagesScreen();
  render();
  alert('Satın almalar kontrol edildi.');
}

async function checkOnboarding(){
  try{
    const res = await window.storage.get('accountType', false);
    accountType = res ? res.value : null;
  }catch(e){ accountType = null; }
  if(!accountType){
    document.getElementById('onboarding').style.display = 'flex';
  } else {
    await applyAccountType();
  }
}
async function chooseAccountType(type){
  accountType = type;
  try{ await window.storage.set('accountType', type, false); }catch(e){}
  document.getElementById('onboarding').style.display = 'none';
  await applyAccountType();
  if(type === 'bireysel' && !isProBireysel){
    openPackagesScreen();
  }
  requestNotificationsOnFirstLaunch();
}

// Asked once, right after onboarding — not on every app open. Silent (no
// alert()) either way: the user just interacted with the system permission
// dialog itself, piling our own confirmation on top of that is just noise.
// Web-only visitors are left alone here since browsers expect a real user
// gesture (a button tap) before a permission prompt, not an automatic one.
async function requestNotificationsOnFirstLaunch(){
  if(!hasNativeNotifications()) return;
  try{
    const granted = await requestNativeNotificationPermission();
    if(granted) await rescheduleAllReminders();
  }catch(e){}
}
async function resetAccountType(){
  try{ await window.storage.delete('accountType', false); }catch(e){}
  accountType = null;
  document.getElementById('onboarding').style.display = 'flex';
}
async function applyAccountType(){
  const title = document.getElementById('appTitle');
  const eyebrow = document.getElementById('appEyebrow');
  title.textContent = 'Ana Sayfa';
  if(accountType === 'kurumsal'){
    eyebrow.innerHTML = '<span class="brand-navy">Garage</span> <span class="brand-orange">Book</span> · Kurumsal';
  } else {
    eyebrow.innerHTML = '<span class="brand-navy">Garage</span> <span class="brand-orange">Book</span> · Bireysel';
  }
  switchTab('dashboard'); setDrawerActive('home');
  await loadProStatus();
  await syncEntitlementsFromStore();
  await loadVehicles();
  if(accountType === 'kurumsal' && !kurumsalTier){
    openPackagesScreen();
  }
}

let darkMode = false;
function applyDarkMode(){
  document.body.classList.toggle('dark', darkMode);
  const btn = document.getElementById('darkModeBtn');
  if(btn) btn.textContent = darkMode ? '☀️' : '🌙';
  const menuIcon = document.getElementById('drawerDarkIcon');
  const menuLabel = document.getElementById('drawerDarkLabel');
  if(menuIcon) menuIcon.textContent = darkMode ? '☀️' : '🌙';
  if(menuLabel) menuLabel.textContent = darkMode ? 'Açık Mod' : 'Koyu Mod';
  syncSettingsControls();
}
async function toggleDarkMode(){
  darkMode = !darkMode;
  applyDarkMode();
  try{ await window.storage.set('darkMode', darkMode ? 'true' : 'false'); }catch(e){}
}
async function loadDarkModePref(){
  try{
    const res = await window.storage.get('darkMode');
    darkMode = !!(res && res.value === 'true');
  }catch(e){ darkMode = false; }
  applyDarkMode();
}

// Notifications only fire while the app is open (a static, backend-free app cannot
// wake the phone while closed — that needs a push server). This checks urgent items
// each time the app is opened/foregrounded, at most once per day unless just enabled.
// ---------- Native local notifications (only active once wrapped as an app via Capacitor) ----------
// These are scheduled entirely on-device (no server, no account, no data ever leaves the phone).
// On plain web they simply do nothing — the in-app "on open" reminder further below still works there.
function hasNativeNotifications(){
  return !!(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications);
}

function notifIdFor(vehicleId, cat, offsetDays){
  const str = vehicleId + ':' + cat + ':' + offsetDays;
  let hash = 0;
  for(let i = 0; i < str.length; i++){ hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff; }
  return hash;
}

const REMINDER_OFFSETS_DAYS = [30, 14, 3, 0];

async function requestNativeNotificationPermission(){
  if(!hasNativeNotifications()) return false;
  try{
    const res = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
    return res && res.display === 'granted';
  }catch(e){ return false; }
}

async function cancelRemindersForVehicle(v){
  if(!hasNativeNotifications() || !v) return;
  const ids = [];
  ['sigorta','kasko','vize','bakim'].forEach(cat=>{
    REMINDER_OFFSETS_DAYS.forEach(off=> ids.push({id: notifIdFor(v.id, cat, off)}));
  });
  try{ await window.Capacitor.Plugins.LocalNotifications.cancel({notifications: ids}); }catch(e){}
}

async function scheduleRemindersForVehicle(v){
  if(!hasNativeNotifications() || !v || (v.status || 'aktif') !== 'aktif') return;
  const items = [
    {cat:'sigorta', label:'Trafik Sigortası', date: v.sigorta.date},
    {cat:'kasko', label:'Kasko', date: v.kasko.date},
    {cat:'vize', label:'Vize', date: v.vize.date},
    {cat:'bakim', label:'Bakım', date: v.bakim.nextDate},
  ];
  const notifications = [];
  items.forEach(it=>{
    if(!it.date) return;
    const due = new Date(it.date + 'T09:00:00');
    if(isNaN(due.getTime())) return;
    REMINDER_OFFSETS_DAYS.forEach(off=>{
      const at = new Date(due.getTime() - off * 86400000);
      if(at.getTime() > Date.now()){
        notifications.push({
          id: notifIdFor(v.id, it.cat, off),
          title: 'Garage Book Hatırlatma',
          body: `${v.plate || ''} - ${it.label}${off === 0 ? ' bugün doluyor' : off === 30 ? ' 1 ay sonra doluyor' : ' ' + off + ' gün sonra doluyor'}`,
          schedule: {at}
        });
      }
    });
  });
  if(notifications.length){
    try{ await window.Capacitor.Plugins.LocalNotifications.schedule({notifications}); }catch(e){ console.error('Bildirim planlanamadı', e); }
  }
}

async function rescheduleAllReminders(){
  if(!hasNativeNotifications()) return;
  for(const v of vehicles){
    await cancelRemindersForVehicle(v);
    await scheduleRemindersForVehicle(v);
  }
}

async function enableNotifications(){
  if(hasNativeNotifications()){
    const granted = await requestNativeNotificationPermission();
    if(granted){
      await rescheduleAllReminders();
      alert('Bildirimler açıldı. Vadesi yaklaşan belgeler için, uygulama kapalıyken bile 1 ay, 14 gün, 3 gün ve son gün kala hatırlatma alacaksın.');
    } else {
      alert('Bildirim izni verilmedi.');
    }
    return;
  }
  if(!('Notification' in window)){
    alert('Bu tarayıcı bildirimleri desteklemiyor.');
    return;
  }
  if(Notification.permission === 'denied'){
    alert('Bildirim izni engellenmiş. Tarayıcı/telefon ayarlarından bu site için bildirimlere izin vermen gerekiyor.');
    return;
  }
  const perm = await Notification.requestPermission();
  if(perm === 'granted'){
    try{ await window.storage.set('notificationsEnabled', 'true'); }catch(e){}
    new Notification('Garage Book', {body: 'Bildirimler açıldı. Uygulamayı her açtığında vadesi yaklaşan/geçmiş belgeler için haber vereceğim.'});
    await maybeShowReminderNotification(true);
  } else {
    alert('Bildirim izni verilmedi.');
  }
}

async function maybeShowReminderNotification(force){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  try{
    const flag = await window.storage.get('notificationsEnabled');
    if(!flag || flag.value !== 'true') return;
  }catch(e){ return; }

  if(!force){
    try{
      const last = await window.storage.get('lastNotifyDate');
      const today = new Date().toISOString().slice(0,10);
      if(last && last.value === today) return;
    }catch(e){}
  }

  const urgentItems = [];
  vehicles.filter(v=>(v.status||'aktif') === 'aktif').forEach(v=>{
    const checks = [
      {label:'Trafik Sigortası', date: v.sigorta.date},
      {label:'Kasko', date: v.kasko.date},
      {label:'Vize', date: v.vize.date},
      {label:'Bakım', date: v.bakim.nextDate},
    ];
    checks.forEach(c=>{
      const d = daysUntil(c.date);
      if(d !== null && d <= 14){
        urgentItems.push(`${v.plate} - ${c.label}: ${d < 0 ? Math.abs(d) + ' gün gecikti' : d + ' gün kaldı'}`);
      }
    });
  });

  if(urgentItems.length === 0) return;
  const body = urgentItems.slice(0,3).join('\n') + (urgentItems.length > 3 ? `\n+${urgentItems.length - 3} kalem daha` : '');
  new Notification('Garage Book - Hatırlatma', {body});

  try{ await window.storage.set('lastNotifyDate', new Date().toISOString().slice(0,10)); }catch(e){}
}

checkOnboarding();
loadDarkModePref();

/* Garage Book v1.5 extension: 200 araç, masraf, galeri, dosya kasası ve etiketler */
(function(){
  const baseOpenVehicleProfile = window.openVehicleProfile;
  const baseRenderDashboard = window.renderDashboard;

  function vehicleByProfile(){ return vehicles.find(v=>v.id===profileVehicleId); }
  function safeDateText(d){ return d ? new Date(d+'T12:00:00').toLocaleDateString('tr-TR') : 'Tarih yok'; }
  function totalExtraExpense(v){ return (v.expenses||[]).reduce((s,x)=>s+(Number(x.amount)||0),0); }

  window.openVehicleProfile=function(id){
    baseOpenVehicleProfile(id);
    const v=vehicles.find(x=>x.id===id); if(!v) return;
    normalizeVehicle(v);
    const grid=document.querySelector('#vehicleProfileContent .vp-grid'); if(!grid) return;
    const gallery=(v.gallery||[]).slice(0,6);
    const expenses=(v.expenses||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);
    const docs=(v.extraDocs||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5);
    const tags=(v.tags||[]);
    const section=document.createElement('section'); section.className='vp-card wide';
    section.innerHTML=`
      <div class="vp-card-title"><span>✨ Filo Araçları</span><span class="vp-card-sub">Masraf, dosya, fotoğraf ve etiket</span></div>
      ${tags.length?`<div class="vp-chip-row">${tags.map(t=>`<span class="vp-chip">🏷️ ${escapeHtml(t)}</span>`).join('')}</div>`:'<div class="vp-empty">Henüz etiket eklenmedi.</div>'}
      <div class="vp-feature-grid">
        <button class="vp-feature-btn" onclick="openExpenseModal('${v.id}')"><strong>💰 Masraf Ekle</strong><span>${(v.expenses||[]).length} kayıt · ${fmtMoney(totalExtraExpense(v))}</span></button>
        <button class="vp-feature-btn" onclick="openGalleryModal('${v.id}')"><strong>📷 Fotoğraf Galerisi</strong><span>${(v.gallery||[]).length} fotoğraf</span></button>
        <button class="vp-feature-btn" onclick="openVaultModal('${v.id}')"><strong>🗂️ Dosya Kasası</strong><span>${(v.extraDocs||[]).length} ek belge</span></button>
        <button class="vp-feature-btn" onclick="openTagModal('${v.id}')"><strong>🏷️ Etiketler</strong><span>Filtreleme için özel gruplar</span></button>
      </div>
      ${expenses.length?`<div class="vp-mini-list"><div class="vp-card-sub">Son masraflar</div>${expenses.map(x=>`<div class="vp-mini-row"><div class="vp-mini-main"><div class="vp-mini-title">${escapeHtml(x.category||'Diğer')} · ${escapeHtml(x.note||'Masraf kaydı')}</div><div class="vp-mini-sub">${safeDateText(x.date)}${x.km?` · ${Number(x.km).toLocaleString('tr-TR')} km`:''}</div></div><div class="vp-mini-value">${fmtMoney(x.amount)}</div></div>`).join('')}</div>`:''}
      ${docs.length?`<div class="vp-mini-list"><div class="vp-card-sub">Dosya kasası</div>${docs.map(x=>`<div class="vp-mini-row"><div class="vp-mini-main"><div class="vp-mini-title">📄 ${escapeHtml(x.title||x.fileName||'Belge')}</div><div class="vp-mini-sub">${safeDateText(x.date)} · ${escapeHtml(x.fileName||'Dosya')}</div></div></div>`).join('')}</div>`:''}
      ${gallery.length?`<div class="vp-gallery">${gallery.map(x=>`<img src="${x.data}" alt="${escapeHtml(x.title||'Araç fotoğrafı')}">`).join('')}</div>`:''}
    `;
    grid.appendChild(section);
  };

  window.renderDashboard=function(){
    baseRenderDashboard();
    const task=document.getElementById('taskCenter');
    if(!task || document.getElementById('notificationSummary')) return;
    let urgent=0, soon=0, missing=0;
    vehicles.filter(v=>(v.status||'aktif')==='aktif').forEach(v=>{
      [v.sigorta?.date,v.kasko?.date,v.vize?.date,v.bakim?.nextDate].forEach(date=>{
        const d=daysUntil(date); if(d===null) missing++; else if(d<0) urgent++; else if(d<=30) soon++;
      });
    });
    const box=document.createElement('div'); box.id='notificationSummary'; box.className='notif-summary';
    box.innerHTML=`<div class="notif-summary-icon">🔔</div><div><strong>Akıllı Bildirim Özeti</strong><span>${urgent} gecikmiş · ${soon} yaklaşan · ${missing} eksik kayıt</span></div>`;
    task.parentNode.insertBefore(box,task);
  };

  window.closeFleetModal=function(){const m=document.getElementById('fleetModal');m.classList.remove('open');m.setAttribute('aria-hidden','true')};
  function showFleet(title,body){document.getElementById('fleetModalTitle').textContent=title;document.getElementById('fleetModalBody').innerHTML=body;const m=document.getElementById('fleetModal');m.classList.add('open');m.setAttribute('aria-hidden','false')}

  window.openExpenseModal=function(id){
    showFleet('💰 Masraf Kaydı',`<div class="fleet-field"><label>Tarih</label><input id="fx-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="fleet-field"><label>Kategori</label><select id="fx-cat"><option>Bakım</option><option>Lastik</option><option>Sigorta</option><option>Kasko</option><option>Vergi</option><option>Yakıt</option><option>Otopark</option><option>Diğer</option></select></div><div class="fleet-field"><label>Tutar (₺)</label><input id="fx-amount" type="number" min="0" step="0.01" inputmode="decimal"></div><div class="fleet-field"><label>Kilometre</label><input id="fx-km" type="number" min="0" inputmode="numeric"></div><div class="fleet-field"><label>Açıklama</label><textarea id="fx-note" placeholder="Örn. Motor yağı ve filtre değişimi"></textarea></div><div class="fleet-actions"><button class="fleet-secondary" onclick="closeFleetModal()">Vazgeç</button><button class="fleet-primary" onclick="saveExpense('${id}')">Kaydet</button></div>`)
  };
  window.saveExpense=async function(id){const v=vehicles.find(x=>x.id===id);if(!v)return;normalizeVehicle(v);const amount=document.getElementById('fx-amount').value;if(!amount){alert('Tutar giriniz.');return}v.expenses.push({id:crypto.randomUUID?crypto.randomUUID():Date.now().toString(),date:document.getElementById('fx-date').value,category:document.getElementById('fx-cat').value,amount,note:document.getElementById('fx-note').value.trim(),km:document.getElementById('fx-km').value});await persist();closeFleetModal();openVehicleProfile(id);render();};

  window.openGalleryModal=function(id){showFleet('📷 Fotoğraf Galerisi',`<div class="fleet-field"><label>Fotoğraf</label><input id="fg-file" type="file" accept="image/*"></div><div class="fleet-field"><label>Başlık</label><input id="fg-title" placeholder="Örn. Ön görünüş veya hasar fotoğrafı"></div><div class="fleet-actions"><button class="fleet-secondary" onclick="closeFleetModal()">Vazgeç</button><button class="fleet-primary" onclick="saveGalleryPhoto('${id}')">Fotoğrafı Ekle</button></div>`)};
  window.saveGalleryPhoto=async function(id){const file=document.getElementById('fg-file').files[0];if(!file){alert('Bir fotoğraf seçiniz.');return}if(file.size>3*1024*1024){alert('Fotoğraf 3 MB’dan küçük olmalıdır.');return}const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});const v=vehicles.find(x=>x.id===id);normalizeVehicle(v);v.gallery.push({id:Date.now().toString(),title:document.getElementById('fg-title').value.trim(),data});await persist();closeFleetModal();openVehicleProfile(id);};

  window.openVaultModal=function(id){showFleet('🗂️ Dosya Kasası',`<div class="fleet-field"><label>Belge adı</label><input id="fv-title" placeholder="Örn. Servis faturası"></div><div class="fleet-field"><label>Tarih</label><input id="fv-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="fleet-field"><label>Dosya</label><input id="fv-file" type="file" accept="image/*,application/pdf"></div><div class="fleet-actions"><button class="fleet-secondary" onclick="closeFleetModal()">Vazgeç</button><button class="fleet-primary" onclick="saveVaultDoc('${id}')">Belgeyi Ekle</button></div>`)};
  window.saveVaultDoc=async function(id){const file=document.getElementById('fv-file').files[0];if(!file){alert('Bir dosya seçiniz.');return}if(file.size>4*1024*1024){alert('Dosya 4 MB’dan küçük olmalıdır.');return}const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});const v=vehicles.find(x=>x.id===id);normalizeVehicle(v);v.extraDocs.push({id:Date.now().toString(),title:document.getElementById('fv-title').value.trim()||file.name,date:document.getElementById('fv-date').value,fileName:file.name,type:file.type,data});await persist();closeFleetModal();openVehicleProfile(id);};

  window.openTagModal=function(id){const v=vehicles.find(x=>x.id===id);normalizeVehicle(v);showFleet('🏷️ Araç Etiketleri',`<div class="fleet-field"><label>Etiketler</label><input id="ft-tags" value="${escapeHtml(v.tags.join(', '))}" placeholder="Örn. Kiralık, Şirket A, Elektrikli"></div><div style="font-size:12px;color:var(--muted)">Birden fazla etiketi virgülle ayırabilirsiniz.</div><div class="fleet-actions"><button class="fleet-secondary" onclick="closeFleetModal()">Vazgeç</button><button class="fleet-primary" onclick="saveTags('${id}')">Kaydet</button></div>`)};
  window.saveTags=async function(id){const v=vehicles.find(x=>x.id===id);normalizeVehicle(v);v.tags=document.getElementById('ft-tags').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12);await persist();closeFleetModal();openVehicleProfile(id);render();};

  // İlk açılışta v1.5 verilerini ve yeni özeti hazırla.
  vehicles.forEach(normalizeVehicle);
  renderDashboard();
})();

/* Garage Book v2.0 extension */
(function(){
  const oldNormalize=window.normalizeVehicle;
  window.normalizeVehicle=function(v){
    oldNormalize(v);
    v.fuel=Array.isArray(v.fuel)?v.fuel:[];
    v.createdAt=v.createdAt||'';
    return v;
  };
  vehicles.forEach(window.normalizeVehicle);

  let advancedFilters={health:'all',deadline:'all',doc:'all',tag:'all'};
  function allTags(){return [...new Set(vehicles.flatMap(v=>(v.tags||[]).map(x=>String(x).trim())).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'tr'));}
  function missingDocs(v){return ['ruhsat','sigorta','kasko','vize'].some(k=>!(v.docs&&v.docs[k]));}
  function deadlineMatch(v,mode){
    if(mode==='all')return true;
    const ds=[v.sigorta?.date,v.kasko?.date,v.vize?.date,v.bakim?.nextDate].map(daysUntil).filter(x=>x!==null);
    if(mode==='expired')return ds.some(x=>x<0);
    if(mode==='7')return ds.some(x=>x>=0&&x<=7);
    if(mode==='30')return ds.some(x=>x>=0&&x<=30);
    return true;
  }
  const baseGetFilteredSorted=window.getFilteredSorted;
  window.getFilteredSorted=function(){
    let list=baseGetFilteredSorted();
    if(advancedFilters.health!=='all') list=list.filter(v=>getVehicleHealth(v).level===advancedFilters.health);
    if(advancedFilters.deadline!=='all') list=list.filter(v=>deadlineMatch(v,advancedFilters.deadline));
    if(advancedFilters.doc==='missing') list=list.filter(missingDocs);
    if(advancedFilters.doc==='complete') list=list.filter(v=>!missingDocs(v));
    if(advancedFilters.tag!=='all') list=list.filter(v=>(v.tags||[]).includes(advancedFilters.tag));
    const sort=document.getElementById('sortSelect')?.value;
    if(sort==='expense') list.sort((a,b)=>vehicleGrandTotal(b)-vehicleGrandTotal(a));
    if(sort==='newest') list.sort((a,b)=>String(b.createdAt||b.id).localeCompare(String(a.createdAt||a.id)));
    return list;
  };
  function vehicleGrandTotal(v){
    normalizeVehicle(v);
    let n=(v.expenses||[]).reduce((s,x)=>s+(Number(x.amount)||0),0)+(v.fuel||[]).reduce((s,x)=>s+(Number(x.amount)||0),0);
    n+=(Number(v.sigorta?.amount)||0)+(Number(v.kasko?.amount)||0)+(Number(v.bakim?.amount)||0);
    (v.history||[]).forEach(x=>n+=Number(x.amount)||0); return n;
  }
  window.vehicleGrandTotal=vehicleGrandTotal;

  function ensureAdvancedFilters(){
    const controls=document.querySelector('#view-vehicles .controls'); if(!controls||document.getElementById('gbFilterPanel'))return;
    const sort=document.getElementById('sortSelect');
    if(sort&&!sort.querySelector('option[value="expense"]')) sort.insertAdjacentHTML('beforeend','<option value="expense">En yüksek masrafa göre</option><option value="newest">En yeni eklenene göre</option>');
    const panel=document.createElement('div');panel.id='gbFilterPanel';panel.className='gb-filter-panel';
    panel.innerHTML=`<div class="gb-filter-head"><div class="gb-filter-title">Gelişmiş Filtreler</div><button class="gb-filter-reset" onclick="resetAdvancedFilters()">Temizle</button></div><div class="gb-filter-grid"><select id="gbHealth" onchange="setAdvancedFilter('health',this.value)"><option value="all">Tüm durumlar</option><option value="red">Acil işlem</option><option value="amber">Yaklaşıyor</option><option value="green">Sağlıklı</option><option value="none">Eksik bilgi</option></select><select id="gbDeadline" onchange="setAdvancedFilter('deadline',this.value)"><option value="all">Tüm tarihler</option><option value="expired">Süresi geçmiş</option><option value="7">7 gün içinde</option><option value="30">30 gün içinde</option></select><select id="gbDoc" onchange="setAdvancedFilter('doc',this.value)"><option value="all">Tüm belge durumları</option><option value="missing">Belgesi eksik</option><option value="complete">Belgeleri tam</option></select></div><div class="gb-tag-filter" id="gbTagFilter"></div><div class="gb-filter-summary" id="gbFilterSummary"></div>`;
    controls.parentNode.insertBefore(panel,controls.nextSibling);renderTagFilters();
  }
  function renderTagFilters(){const el=document.getElementById('gbTagFilter');if(!el)return;const tags=allTags();el.innerHTML=`<button class="gb-tag-chip ${advancedFilters.tag==='all'?'active':''}" onclick="setAdvancedFilter('tag','all')">Tüm etiketler</button>`+tags.map(t=>`<button class="gb-tag-chip ${advancedFilters.tag===t?'active':''}" onclick="setAdvancedFilter('tag',decodeURIComponent('${encodeURIComponent(t)}'))">${escapeHtml(t)}</button>`).join('');}
  window.setAdvancedFilter=function(k,v){advancedFilters[k]=v;render();renderTagFilters();updateFilterSummary();};
  window.resetAdvancedFilters=function(){advancedFilters={health:'all',deadline:'all',doc:'all',tag:'all'};['gbHealth','gbDeadline','gbDoc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='all'});render();renderTagFilters();updateFilterSummary();};
  function updateFilterSummary(){const e=document.getElementById('gbFilterSummary');if(!e)return;const list=getFilteredSorted(),urgent=list.filter(v=>getVehicleHealth(v).level==='red').length,soon=list.filter(v=>getVehicleHealth(v).level==='amber').length;e.textContent=`${list.length} araç gösteriliyor · ${urgent} acil · ${soon} yaklaşan`;}
  const baseRender=window.render;
  window.render=function(){ensureAdvancedFilters();baseRender();renderTagFilters();updateFilterSummary();};

  function fuelStats(v){
    normalizeVehicle(v);const rows=v.fuel.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));let liters=0,amount=0,cons=[];
    rows.forEach((x,i)=>{liters+=Number(x.liters)||0;amount+=Number(x.amount)||0;if(i&&Number(x.km)>Number(rows[i-1].km)&&Number(x.liters)>0)cons.push((Number(x.liters)/(Number(x.km)-Number(rows[i-1].km)))*100)});
    return {liters,amount,avg:cons.length?cons.reduce((a,b)=>a+b,0)/cons.length:null};
  }
  const baseOpenProfile=window.openVehicleProfile;
  window.openVehicleProfile=function(id){
    baseOpenProfile(id);const v=vehicles.find(x=>x.id===id);if(!v)return;normalizeVehicle(v);const grid=document.querySelector('#vehicleProfileContent .vp-grid');if(!grid)return;
    const st=fuelStats(v),last=v.fuel.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5);const sec=document.createElement('section');sec.className='vp-card wide';
    sec.innerHTML=`<div class="vp-card-title"><span>⛽ Yakıt Takibi</span><span style="display:flex;gap:7px"><button class="vp-edit-btn" onclick="generateVehiclePdf('${id}')">PDF Rapor</button><button class="vp-edit-btn" onclick="openFuelModal('${id}')">Yakıt Ekle</button></span></div><div class="gb-fuel-kpis"><div class="gb-fuel-kpi"><strong>${st.liters.toLocaleString('tr-TR',{maximumFractionDigits:1})} L</strong><span>Toplam yakıt</span></div><div class="gb-fuel-kpi"><strong>${fmtMoney(st.amount)}</strong><span>Toplam gider</span></div><div class="gb-fuel-kpi"><strong>${st.avg?st.avg.toLocaleString('tr-TR',{maximumFractionDigits:1})+' L/100 km':'—'}</strong><span>Ortalama tüketim</span></div></div>${last.length?`<div class="vp-mini-list">${last.map(x=>`<div class="vp-mini-row"><div class="vp-mini-main"><div class="vp-mini-title">⛽ ${Number(x.liters||0).toLocaleString('tr-TR')} litre · ${escapeHtml(x.station||'İstasyon belirtilmedi')}</div><div class="vp-mini-sub">${x.date?fmtDate(x.date):'Tarih yok'}${x.km?' · '+Number(x.km).toLocaleString('tr-TR')+' km':''}</div></div><div class="vp-mini-value">${fmtMoney(x.amount)}</div></div>`).join('')}</div>`:'<div class="vp-empty">Henüz yakıt kaydı yok.</div>'}`;grid.appendChild(sec);
  };
  function gbShowFleet(title,body){document.getElementById('fleetModalTitle').textContent=title;document.getElementById('fleetModalBody').innerHTML=body;const m=document.getElementById('fleetModal');m.classList.add('open');m.setAttribute('aria-hidden','false');}
  window.openFuelModal=function(id){gbShowFleet('⛽ Yakıt Kaydı',`<div class="fleet-field"><label>Tarih</label><input id="ff-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="fleet-field"><label>Kilometre</label><input id="ff-km" type="number" min="0" inputmode="numeric"></div><div class="fleet-field"><label>Litre</label><input id="ff-liters" type="number" min="0" step="0.01" inputmode="decimal"></div><div class="fleet-field"><label>Toplam Tutar (₺)</label><input id="ff-amount" type="number" min="0" step="0.01" inputmode="decimal"></div><div class="fleet-field"><label>Akaryakıt İstasyonu</label><input id="ff-station" placeholder="Örn. Shell"></div><div class="fleet-actions"><button class="fleet-secondary" onclick="closeFleetModal()">Vazgeç</button><button class="fleet-primary" onclick="saveFuel('${id}')">Kaydet</button></div>`);};
  window.saveFuel=async function(id){const v=vehicles.find(x=>x.id===id);if(!v)return;normalizeVehicle(v);const liters=Number(document.getElementById('ff-liters').value),amount=Number(document.getElementById('ff-amount').value),km=Number(document.getElementById('ff-km').value);if(!liters||!amount){alert('Litre ve tutar giriniz.');return;}v.fuel.push({id:genId(),date:document.getElementById('ff-date').value,km,liters,amount,station:document.getElementById('ff-station').value.trim()});if(km&&km>Number(v.kmGuncel||0))v.kmGuncel=String(km);await persist();closeFleetModal();openVehicleProfile(id);render();};

  function monthKey(d){return String(d||'').slice(0,7)} function monthLabel(k){if(!k)return'';return new Date(k+'-01T12:00:00').toLocaleDateString('tr-TR',{month:'short'});}
  const baseAnalytics=window.renderAnalyticsTab;
  window.renderAnalyticsTab=function(){
    baseAnalytics();const wrap=document.getElementById('analyticsWrap');if(!wrap)return;
    const totals=vehicles.map(v=>({v,total:vehicleGrandTotal(v)})).sort((a,b)=>b.total-a.total);const all=[];vehicles.forEach(v=>{normalizeVehicle(v);(v.expenses||[]).forEach(x=>all.push({...x,plate:v.plate}));(v.fuel||[]).forEach(x=>all.push({date:x.date,category:'Yakıt',amount:x.amount,plate:v.plate}));});
    const months={};all.forEach(x=>{const k=monthKey(x.date);if(k)months[k]=(months[k]||0)+(Number(x.amount)||0)});const keys=Object.keys(months).sort().slice(-6),max=Math.max(1,...keys.map(k=>months[k]));const cats={};all.forEach(x=>cats[x.category||'Diğer']=(cats[x.category||'Diğer']||0)+(Number(x.amount)||0));
    const extra=document.createElement('div');extra.className='gb-analytics-grid';extra.style.marginTop='14px';extra.innerHTML=`<section class="gb-analytics-card wide"><div class="gb-analytics-title">Son 6 Ay Gider Eğilimi</div><div class="gb-analytics-sub">Masraf ve yakıt kayıtlarının aylık toplamı</div><div class="gb-chart">${keys.length?keys.map(k=>`<div class="gb-bar-wrap"><div class="gb-bar" style="height:${Math.max(3,months[k]/max*110)}px" title="${fmtMoney(months[k])}"></div><div class="gb-bar-label">${monthLabel(k)}</div></div>`).join(''):'<div class="vp-empty">Grafik için tarihli gider kaydı ekleyin.</div>'}</div></section><section class="gb-analytics-card"><div class="gb-analytics-title">En Maliyetli Araçlar</div><div class="gb-ranking">${totals.slice(0,5).map((x,i)=>`<div class="gb-rank-row" onclick="openVehicleProfile('${x.v.id}')"><div class="gb-rank-no">${i+1}</div><div class="gb-rank-main"><strong>${escapeHtml(x.v.plate||'—')}</strong><span>${escapeHtml([x.v.brand,x.v.model].filter(Boolean).join(' '))}</span></div><div class="gb-rank-value">${fmtMoney(x.total)}</div></div>`).join('')||'<div class="vp-empty">Araç yok.</div>'}</div></section><section class="gb-analytics-card"><div class="gb-analytics-title">Gider Kategorileri</div><div class="gb-ranking">${Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,n],i)=>`<div class="gb-rank-row"><div class="gb-rank-no">${i+1}</div><div class="gb-rank-main"><strong>${escapeHtml(k)}</strong></div><div class="gb-rank-value">${fmtMoney(n)}</div></div>`).join('')||'<div class="vp-empty">Gider kaydı yok.</div>'}</div></section>`;wrap.appendChild(extra);
  };

  window.exportFullBackup=async function(){
    const docs={};
    for(const v of vehicles){
      for(const cat of ['sigorta','kasko','bakim','vize','ruhsat']){
        const key='doc:'+v.id+':'+cat;
        try{
          const res=await window.storage.get(key,false);
          if(res) docs[key]=res.value;
        }catch(e){}
      }
    }
    const payload={app:'Garage Book',version:'2.1',exportedAt:new Date().toISOString(),accountType,isProBireysel,kurumsalTier,vehicles,docs};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='garage-book-tam-yedek-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  window.importFullBackup=async function(e){const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.vehicles))throw new Error();if(data.vehicles.length>200){alert('Yedek 200 araç sınırını aşıyor.');return;}if(!confirm(`${data.vehicles.length} araçlık tam yedek mevcut verilerin yerine yüklenecek. Devam edilsin mi?`))return;vehicles=data.vehicles.map(v=>normalizeVehicle(v));await persist();if(data.docs && typeof data.docs==='object'){for(const key of Object.keys(data.docs)){try{await window.storage.set(key,data.docs[key],false);}catch(e){}}}render();renderDashboard();alert('Tam yedek başarıyla geri yüklendi.');}catch(err){alert('Yedek dosyası okunamadı. Garage Book JSON yedeği seçiniz.');}e.target.value='';};
  window.generateVehiclePdf=function(id){
    const v=vehicles.find(x=>x.id===id);if(!v||!window.jspdf){alert('PDF modülü yüklenemedi.');return;}normalizeVehicle(v);const {jsPDF}=window.jspdf,doc=new jsPDF();let y=18;doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text('Garage Book',14,y);y+=9;doc.setFontSize(15);doc.text((v.plate||'ARAC RAPORU').toUpperCase(),14,y);y+=8;doc.setFont('helvetica','normal');doc.setFontSize(10);[["Marka / Model",[v.brand,v.model].filter(Boolean).join(' ')||'-'],['Yil',v.year||'-'],['Kilometre',v.kmGuncel?Number(v.kmGuncel).toLocaleString('tr-TR')+' km':'-'],['Durum',v.status==='pasif'?'Pasif':'Aktif'],['Saglik Puani',vehicleHealthScore(v)+'/100'],['Toplam Kayitli Gider',fmtMoney(vehicleGrandTotal(v))]].forEach(([a,b])=>{doc.setFont('helvetica','bold');doc.text(a+':',14,y);doc.setFont('helvetica','normal');doc.text(String(b),58,y);y+=6});y+=3;doc.setFont('helvetica','bold');doc.text('Yaklasan Islemler',14,y);y+=6;doc.setFont('helvetica','normal');[['Sigorta',v.sigorta?.date],['Kasko',v.kasko?.date],['Muayene',v.vize?.date],['Bakim',v.bakim?.nextDate]].forEach(([a,b])=>{doc.text(`${a}: ${b?fmtDate(b):'Tarih yok'}`,14,y);y+=5});y+=4;doc.setFont('helvetica','bold');doc.text('Son Giderler',14,y);y+=6;doc.setFont('helvetica','normal');[...(v.expenses||[]).map(x=>({...x})),...(v.fuel||[]).map(x=>({date:x.date,category:'Yakit',amount:x.amount,note:x.station}))].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,15).forEach(x=>{if(y>280){doc.addPage();y=18;}doc.text(`${x.date||'-'}  ${x.category||'Diger'}  ${fmtMoney(x.amount)}`,14,y);y+=5});doc.save('garage-book-'+(v.plate||'arac').replace(/\s+/g,'-')+'.pdf');
  };

  function addBackupSettings(){const groups=document.querySelectorAll('#settingsOverlay .settings-group');if(!groups.length||document.getElementById('gbBackupBox'))return;const box=document.createElement('div');box.id='gbBackupBox';box.className='gb-backup-box';box.innerHTML='<strong>☁️ Taşınabilir Tam Yedek</strong><span>Araçlar, yakıt, masraflar, etiketler ve tüm yerel kayıtları tek dosyada saklar. Otomatik bulut eşitleme için ileride kullanıcı hesabı ve sunucu bağlantısı gerekir.</span><div class="gb-action-row"><button onclick="exportFullBackup()">Tam Yedek Al</button><button class="secondary" onclick="document.getElementById(\'gbBackupInput\').click()">Yedeği Geri Yükle</button><input id="gbBackupInput" type="file" accept="application/json,.json" hidden onchange="importFullBackup(event)"></div>';groups[groups.length-1].appendChild(box);}
  const oldOpenSettings=window.openSettings;window.openSettings=function(){oldOpenSettings();addBackupSettings();};
  window.showAboutGarageBook=function(){alert('Garage Book v2.0\\n\\nBireysel araç sahipleri ve 200 araca kadar filolar için araç, belge, bakım, yakıt, masraf ve raporlama uygulaması. Veriler bu cihazda saklanır; tam yedek dosyasıyla taşınabilir.');};
  ensureAdvancedFilters();render();
})();

(function(){
  const trMonths=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const backdrop=document.getElementById('gbDateBackdrop');
  const grid=document.getElementById('gbDateGrid');
  const monthLabel=document.getElementById('gbDateMonth');
  let activeInput=null;
  let viewDate=new Date();
  let selectedDate=null;

  function parseISO(v){
    if(!v) return null;
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m?new Date(+m[1],+m[2]-1,+m[3]):null;
  }
  function iso(d){
    if(!d) return '';
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function display(v){
    const d=parseISO(v);
    return d?d.toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'}):'Tarih seç';
  }
  function sameDay(a,b){return !!a&&!!b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
  function updateButton(input){
    const btn=input._gbDateButton;
    if(!btn)return;
    btn.querySelector('.gb-date-text').textContent=display(input.value);
    btn.classList.toggle('is-empty',!input.value);
  }
  function render(){
    monthLabel.textContent=trMonths[viewDate.getMonth()]+' '+viewDate.getFullYear();
    grid.innerHTML='';
    const y=viewDate.getFullYear(),m=viewDate.getMonth();
    const first=new Date(y,m,1);
    const offset=(first.getDay()+6)%7;
    const start=new Date(y,m,1-offset);
    const today=new Date();
    for(let i=0;i<42;i++){
      const d=new Date(start); d.setDate(start.getDate()+i);
      const b=document.createElement('button');
      b.type='button'; b.className='gb-date-day'; b.textContent=d.getDate();
      if(d.getMonth()!==m)b.classList.add('other');
      if(sameDay(d,today))b.classList.add('today');
      if(sameDay(d,selectedDate))b.classList.add('selected');
      b.addEventListener('click',()=>{selectedDate=new Date(d);viewDate=new Date(d.getFullYear(),d.getMonth(),1);render();});
      grid.appendChild(b);
    }
  }
  function openSheet(input){
    activeInput=input;
    selectedDate=parseISO(input.value);
    const base=selectedDate||new Date();
    viewDate=new Date(base.getFullYear(),base.getMonth(),1);
    render();
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden','false');
    document.body.style.overflow='hidden';
  }
  function closeSheet(){
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
    activeInput=null;
  }
  function enhance(input){
    if(input.dataset.gbDateEnhanced==='1')return;
    input.dataset.gbDateEnhanced='1';
    input.classList.add('gb-date-native');
    const btn=document.createElement('button');
    btn.type='button'; btn.className='gb-date-button';
    btn.innerHTML='<span class="gb-date-text"></span><span class="gb-date-icon">📅</span>';
    btn.addEventListener('click',()=>openSheet(input));
    input.insertAdjacentElement('afterend',btn);
    input._gbDateButton=btn;
    input.addEventListener('change',()=>updateButton(input));
    updateButton(input);
  }
  function enhanceAll(){document.querySelectorAll('#overlay input[type="date"]').forEach(enhance)}
  document.getElementById('gbDatePrev').addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()-1);render()});
  document.getElementById('gbDateNext').addEventListener('click',()=>{viewDate.setMonth(viewDate.getMonth()+1);render()});
  document.getElementById('gbDateClose').addEventListener('click',closeSheet);
  document.getElementById('gbDateClear').addEventListener('click',()=>{
    if(activeInput){activeInput.value='';activeInput.dispatchEvent(new Event('change',{bubbles:true}));}
    closeSheet();
  });
  document.getElementById('gbDateDone').addEventListener('click',()=>{
    if(activeInput&&selectedDate){activeInput.value=iso(selectedDate);activeInput.dispatchEvent(new Event('change',{bubbles:true}));}
    closeSheet();
  });
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeSheet()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdrop.classList.contains('open'))closeSheet()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceAll);else enhanceAll();
  new MutationObserver(enhanceAll).observe(document.getElementById('overlay'),{childList:true,subtree:true});
  window.gbRefreshDateButtons=function(){document.querySelectorAll('#overlay input[type="date"]').forEach(updateButton)};
})();

/* Garage Book v2.2–v2.5 usability layer */
(function(){
  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  function addFilterDisclosure(){
    const panel=document.getElementById('gbFilterPanel');
    if(!panel || document.getElementById('gbFilterToggle')) return;
    panel.classList.add('gb-collapsed');
    const btn=document.createElement('button');
    btn.type='button'; btn.id='gbFilterToggle'; btn.className='gb-simple-toggle';
    btn.innerHTML='<span><span>Filtreler ve sıralama</span><small>Yalnızca gerektiğinde aç</small></span><span class="gb-chevron">⌄</span>';
    btn.onclick=()=>{const open=panel.classList.toggle('gb-collapsed')===false;btn.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));};
    btn.setAttribute('aria-expanded','false'); panel.parentNode.insertBefore(btn,panel);
  }
  function simplifyTasks(){
    const card=document.getElementById('dashboardTasks'); if(!card) return;
    const rows=[...card.querySelectorAll('.timeline-item')];
    card.querySelector('.gb-task-more')?.remove();
    if(rows.length<=4) return;
    rows.forEach((r,i)=>{r.style.display=i<4?'':'none';});
    const b=document.createElement('button'); b.type='button'; b.className='gb-task-more'; b.textContent=`${rows.length-4} işlemi daha göster`;
    let open=false;b.onclick=()=>{open=!open;rows.forEach((r,i)=>{r.style.display=(!open&&i>=4)?'none':'';});b.textContent=open?'Daha az göster':`${rows.length-4} işlemi daha göster`;}; card.appendChild(b);
  }
  function improveVehicleModal(){
    const title=document.querySelector('#overlay .modal h2, #overlay .modal-title');
    if(title && !title.querySelector('.gb-version-pill')) title.insertAdjacentHTML('beforeend','<span class="gb-version-pill">v2.5</span>');
    const form=document.querySelector('#overlay form, #overlay .modal-body');
    if(form && !form.querySelector('.gb-modal-section-note')) form.insertAdjacentHTML('afterbegin','<div class="gb-modal-section-note">Önce temel bilgileri doldur. Belge ve bakım alanlarını yalnızca gerektiğinde açabilirsin.</div>');
  }
  function createHelp(){
    if(document.getElementById('gbV25Help')) return;
    const el=document.createElement('section');el.id='gbV25Help';el.className='gb-v25-help';el.setAttribute('aria-hidden','true');
    el.innerHTML='<div class="gb-v25-help-card"><div class="gb-v25-help-head"><h2>Kısa Kullanım Rehberi</h2><button class="gb-v25-close" type="button" aria-label="Kapat">×</button></div><div class="gb-v25-step"><div class="gb-v25-step-icon">🚗</div><div><strong>Aracını ekle</strong><span>Plaka, marka ve modeli yaz. Belge alanlarını daha sonra da tamamlayabilirsin.</span></div></div><div class="gb-v25-step"><div class="gb-v25-step-icon">⚠️</div><div><strong>Ana Sayfayı kontrol et</strong><span>Yaklaşan sigorta, muayene ve bakım işlemleri önem sırasıyla burada görünür.</span></div></div><div class="gb-v25-step"><div class="gb-v25-step-icon">🔎</div><div><strong>Gerektiğinde filtrele</strong><span>Çok aracın varsa gelişmiş filtreleri aç; günlük kullanımda kapalı tut.</span></div></div><div class="gb-v25-step"><div class="gb-v25-step-icon">☁️</div><div><strong>Yedek al</strong><span>Ayarlar bölümünden düzenli tam yedek indirerek kayıtlarını güvenceye al.</span></div></div></div>';
    document.body.appendChild(el); const close=()=>{el.classList.remove('open');el.setAttribute('aria-hidden','true');}; el.querySelector('.gb-v25-close').onclick=close;el.onclick=e=>{if(e.target===el)close();};
    window.openGarageBookGuide=()=>{el.classList.add('open');el.setAttribute('aria-hidden','false');};
  }
  function addHelpToSettings(){
    const groups=document.querySelectorAll('#settingsOverlay .settings-group'); if(!groups.length||document.getElementById('gbGuideSetting')) return;
    const btn=document.createElement('button');btn.type='button';btn.id='gbGuideSetting';btn.className='settings-row';btn.innerHTML='<span class="settings-row-icon">❓</span><span class="settings-row-copy"><strong>Kısa Kullanım Rehberi</strong><small>Garage Book’u sade şekilde kullan</small></span><span>›</span>';btn.onclick=()=>window.openGarageBookGuide?.();groups[groups.length-1].appendChild(btn);
  }
  function observe(){
    const task=document.getElementById('dashboardTasks'); if(task)new MutationObserver(()=>simplifyTasks()).observe(task,{childList:true,subtree:false});
    const list=document.getElementById('vehicleList')||document.querySelector('.vehicle-list'); if(list)new MutationObserver(()=>addFilterDisclosure()).observe(list.parentNode,{childList:true,subtree:true});
  }
  ready(()=>{createHelp();addFilterDisclosure();simplifyTasks();improveVehicleModal();addHelpToSettings();observe();
    const oldOpenSettings=window.openSettings;if(typeof oldOpenSettings==='function')window.openSettings=function(){oldOpenSettings.apply(this,arguments);setTimeout(addHelpToSettings,0);};
    const oldOpenModal=window.openModal;if(typeof oldOpenModal==='function')window.openModal=function(){const r=oldOpenModal.apply(this,arguments);setTimeout(improveVehicleModal,0);return r;};
  });
})();

/* =========================================================
   Garage Book v3.0 — Premium Experience layer
   ========================================================= */
(function initPremiumExperience(){
  const ready=()=>{
    requestAnimationFrame(()=>document.body.classList.add('gb-ready'));
    window.setTimeout(()=>{
      const splash=document.getElementById('gbLaunchScreen');
      if(splash) splash.remove();
      document.body.classList.remove('gb-starting');
    },700);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ready,{once:true});
  else ready();

  window.gbHaptic=function gbHaptic(kind='light'){
    if(!('vibrate' in navigator)) return;
    const patterns={light:8,medium:14,success:[10,35,12],warning:[18,45,18]};
    try{ navigator.vibrate(patterns[kind]||patterns.light); }catch(_e){}
  };

  let toastTimer;
  window.gbToast=function gbToast(message){
    let el=document.getElementById('gbToast');
    if(!el){
      el=document.createElement('div');
      el.id='gbToast'; el.className='gb-toast'; el.setAttribute('role','status');
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
  };

  document.addEventListener('click',e=>{
    const target=e.target.closest('button,.drawer-item,.hero-vehicle,.stat-card,.timeline-card,.vp-doc,.vp-action-row,.quick-action');
    if(target && !target.disabled) window.gbHaptic('light');
  },{passive:true});

  const profile=document.getElementById('vehicleProfileOverlay');
  if(profile){
    const observer=new MutationObserver(()=>{
      const isOpen=profile.getAttribute('aria-hidden')==='false' || profile.style.display==='block' || profile.classList.contains('open');
      profile.classList.toggle('open',isOpen);
    });
    observer.observe(profile,{attributes:true,attributeFilter:['aria-hidden','style','class']});
  }
})();
