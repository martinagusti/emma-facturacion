"use strict";

/* ═══════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════ */
var SVC_DEFS=[
  {key:'web',            label:'Web',                   cat:'desarrollo', color:'#B5524A', recurring:false},
  {key:'cuotaSetup',     label:'Cuota inicial / setup', cat:'desarrollo', color:'#3E7C82', recurring:false},
  {key:'hosting',        label:'Hosting',               cat:'infraestructura', color:'#0E7490', recurring:true},
  {key:'dominio',        label:'Dominio',               cat:'infraestructura', color:'#0F766E', recurring:false},
  {key:'mantenimientoWeb',label:'Mantenimiento web',     cat:'desarrollo', color:'#C2992F', recurring:true},
  {key:'crm',            label:'CRM',                   cat:'software', color:'#8A5A2B', recurring:true},
  {key:'seo',            label:'SEO',                   cat:'marketing', color:'#5B4B8A', recurring:true},
  {key:'redesSociales',  label:'Redes sociales',         cat:'marketing', color:'#A23E7C', recurring:true},
  {key:'creacionAnuncios',label:'Creación de anuncios',  cat:'marketing', color:'#4C8F5B', recurring:true},
  {key:'gestionMeta',    label:'Gestión Meta',           cat:'publicidad', color:'#4567B8', recurring:true},
  {key:'gestionAds',     label:'Gestión Google Ads',     cat:'publicidad', color:'#B23A3A', recurring:true},
  {key:'otros',          label:'Otros',                  cat:'otros', color:'#6B7280', recurring:false}
];
var SVC_CATS=['todos','desarrollo','infraestructura','software','marketing','publicidad','otros'];
var SVC_CAT_LABELS={'todos':'Todos los servicios','desarrollo':'Desarrollo','infraestructura':'Infraestructura','software':'Software','marketing':'Marketing','publicidad':'Publicidad','otros':'Otros'};
var STATUS_LABEL={pendiente:'Pendiente fra.',facturaEnviada:'Factura enviada',pagado:'Pagado',cancelado:'Cancelado'};
var STATUS_CYCLE=['pendiente','facturaEnviada','pagado'];
var FORMA_COBRO=['Transferencia','Domiciliación bancaria','Tarjeta','Stripe','Clónico','Bizum','Efectivo','Cheque','Otro'];
var PERIOD_LABEL={mensual:'Mensual',trimestral:'Trimestral',semestral:'Semestral',anual:'Anual',unico:'Único'};
var IVA=0.21;
var MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var AUTO_INTERVAL=null;
var BACKUP_INTERVAL=null;
var AUTO_MS=30000; /* 30 segundos */
var BACKUP_MS=300000; /* copia de seguridad cada 5 minutos */
var DEFAULT_COMERCIALES=[
  {name:'Emma',color:'#EC4899'},
  {name:'Carlos',color:'#DC2626'},
  {name:'Cristian',color:'#7C3AED'},
  {name:'Jordi',color:'#B98900'}
];

/* ═══════════════════════════════════════
   AUTH STATE
═══════════════════════════════════════ */
var auth={users:[],current:null,tab:'login',err:null,ok:null};

/* ═══════════════════════════════════════
   APP STATE
═══════════════════════════════════════ */
var S={
  clients:[],payments:{},deletedClients:[],comerciales:[],
  loading:true,error:null,
  search:'',filterStatus:'all',filterSvc:'todos',filterResp:'todos',sortBy:'estado',sortDir:'asc',
  month:curMonthKey(),
  expanded:null,expandedTab:{}, /* clientId -> 'servicios'|'historial'|'notas' */
  showIva:false,lastSync:null,lastBackup:null,modal:null,
  alerts:[]
};

/* ═══════════════════════════════════════
   HELPERS
═══════════════════════════════════════ */
function curMonthKey(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)}
function pad(n){return String(n).padStart(2,'0')}
function monthLabel(mk){var p=mk.split('-');return MONTHS[parseInt(p[1],10)-1]+' '+p[0]}
function todayHuman(){var d=new Date();return d.getDate()+' '+MONTHS[d.getMonth()].toLowerCase()+' '+d.getFullYear()}
function shiftMonth(mk,d){var p=mk.split('-').map(Number);var x=new Date(p[0],p[1]-1+d,1);return x.getFullYear()+'-'+pad(x.getMonth()+1)}
function monthFromDate(v){if(!v)return '';var m=String(v).match(/^(\d{4})-(\d{2})/);return m?m[1]+'-'+m[2]:''}
function genId(){return 'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function normalizeClientName(s){return String(s==null?'':s).trim().replace(/\s+/g,' ').toLocaleUpperCase('es-ES')}
function normalizeServicePeriod(p){return p==='anual'||p==='unico'||p==='mensual'?p:'mensual'}
function fmtM(n){n=Number(n)||0;return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n)}
function dispM(n){return fmtM(S.showIva?n*(1+IVA):n)}
function hashP(s){var h=0;for(var i=0;i<s.length;i++){h=Math.imul(31,h)+s.charCodeAt(i)|0}return 'h'+Math.abs(h).toString(16)+'_'+s.length}
function toast(m,dur){
  var el=document.getElementById('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.className='toast';document.body.appendChild(el)}
  el.textContent=m;el.classList.add('show');
  clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('show')},dur||2600)
}

function storageGet(key,globalScope){
  if(window.storage&&typeof window.storage.get==='function') return window.storage.get(key,globalScope);
  var v=localStorage.getItem(key);
  return Promise.resolve(v==null?null:{value:v});
}
function storageSet(key,value,globalScope){
  if(window.storage&&typeof window.storage.set==='function') return window.storage.set(key,value,globalScope);
  localStorage.setItem(key,value);
  return Promise.resolve(true);
}
function defaultFormaCobro(c){return c&&c.formaCobro?c.formaCobro:''}
function effectiveFormaCobro(c,own){return own||defaultFormaCobro(c)}

/* period helpers */
function periodMonths(p){return{mensual:1,anual:12,unico:0}[normalizeServicePeriod(p)]||1}
function serviceStartMonth(client,svc){return (svc&&svc.startMonth)||monthFromDate(client&&client.fechaAlta)||S.month||curMonthKey()}
function clientAltaMonth(client){return monthFromDate(client&&client.fechaAlta)||serviceStartMonth(client,{})}
function isServiceDueInMonth(svc,mk,client){
  if(!svc||!Number(svc.price)) return false;
  var period=normalizeServicePeriod(svc.period||'mensual');
  if(period==='unico') return false;
  var start=serviceStartMonth(client,svc);
  if(mk<start) return false;
  if(period==='mensual') return true;
  if(period==='anual') return mk.slice(5,7)===clientAltaMonth(client).slice(5,7);
  return false;
}
function isOneTimeDueInMonth(svc,mk,client){
  if(!svc||!Number(svc.price)) return false;
  return normalizeServicePeriod(svc.period||'unico')==='unico' && mk===serviceStartMonth(client,svc);
}

/* totals */
function recTotalForMonth(client,mk){
  var t=0;
  SVC_DEFS.forEach(function(d){
    var s=client.services[d.key];
    if(s&&isServiceDueInMonth(s,mk,client)&&Number(s.price)) t+=Number(s.price);
  });
  return t;
}
function recTotal(client){return recTotalForMonth(client,S.month)}
function oneTimeTotal(client,mk){
  mk=mk||S.month;
  var t=0;
  SVC_DEFS.forEach(function(d){var s=client.services[d.key];if(s&&isOneTimeDueInMonth(s,mk,client)&&Number(s.price))t+=Number(s.price)});
  return t;
}
function totalDueForMonth(client,mk){return recTotalForMonth(client,mk)+oneTimeTotal(client,mk)}
function clientTotal(c){return totalDueForMonth(c,S.month)}
function globalMRR(){
  return S.clients.filter(function(c){return c.active}).reduce(function(s,c){
    var t=0;
    SVC_DEFS.forEach(function(d){var sv=c.services[d.key];if(sv&&sv.period==='mensual'&&Number(sv.price))t+=Number(sv.price)});
    return s+t;
  },0);
}
function globalPendiente(){
  var t=0;
  S.clients.forEach(function(c){
    var p=(S.payments[c.id]||{})[S.month];
    if(p&&p.status!=='pagado'&&p.status!=='cancelado') t+=Number(p.importe)||0;
  });
  return t;
}
function globalCobrado(){
  var t=0;
  S.clients.forEach(function(c){
    var p=(S.payments[c.id]||{})[S.month];
    if(p&&p.status==='pagado') t+=Number(p.importe)||0;
  });
  return t;
}
function paymentAmountForMonth(c,mk){
  var p=(S.payments[c.id]||{})[mk];
  var stored=p&&Number(p.importe)>0?Number(p.importe):0;
  var due=totalDueForMonth(c,mk);
  return stored||due;
}
function globalTotalMes(){
  var t=0,mk=S.month;
  S.clients.forEach(function(c){if(c.active)t+=paymentAmountForMonth(c,mk)});
  return t;
}
function globalCobradoMes(){
  var t=0,mk=S.month;
  S.clients.forEach(function(c){var p=(S.payments[c.id]||{})[mk];if(p&&p.status==='pagado')t+=paymentAmountForMonth(c,mk)});
  return t;
}
function pendingOlderBreakdown(){
  var map={},current=S.month;
  S.clients.forEach(function(c){
    var hist=S.payments[c.id]||{};
    Object.keys(hist).forEach(function(mk){
      var p=hist[mk];
      if(mk>=current) return;
      if(!p||p.status==='pagado'||p.status==='cancelado') return;
      var amount=paymentAmountForMonth(c,mk);
      if(amount<=0) return;
      if(!map[mk]) map[mk]={month:mk,total:0,count:0};
      map[mk].total+=amount;map[mk].count++;
    });
  });
  return Object.keys(map).sort().reverse().map(function(k){return map[k]});
}
function pendingOlderTotal(){return pendingOlderBreakdown().reduce(function(a,x){return a+x.total},0)}
function oneTimePendingGlobal(){
  var t=0;
  S.clients.forEach(function(c){
    SVC_DEFS.forEach(function(d){
      var s=c.services[d.key];
      if(s&&isOneTimeDueInMonth(s,S.month,c)&&Number(s.price)&&s.status!=='pagado') t+=Number(s.price);
    });
  });
  return t;
}
function activeServices(c){
  return SVC_DEFS.filter(function(d){var s=c.services[d.key];return s&&Number(s.price)>0});
}
function getCobroDia(c){var d=parseInt(c.cobroDia,10);return (d>=1&&d<=31)?d:''}
function servicesText(c){return activeServices(c).map(function(d){var s=c.services[d.key]||{};return d.key==='otros'?(s.otrosLabel||'Otros'):d.label}).join(', ')}
function responsableText(c){return (c.responsable||c.comercialResponsable||'').trim()}
function responsablesList(){return comercialesList().map(function(c){return c.name})}
function getLastResponsable(){try{return localStorage.getItem('ov_last_responsable')||responsablesList()[0]||''}catch(e){return responsablesList()[0]||''}}
function setLastResponsable(v){try{if(v)localStorage.setItem('ov_last_responsable',v)}catch(e){}}
function createAutoBackup(){try{var data={createdAt:new Date().toISOString(),clients:S.clients,payments:S.payments,deletedClients:S.deletedClients||[]};var raw=localStorage.getItem('ov_backups');var arr=raw?JSON.parse(raw):[];arr.unshift(data);arr=arr.slice(0,24);localStorage.setItem('ov_backups',JSON.stringify(arr));localStorage.setItem('ov_backup_latest',JSON.stringify(data));S.lastBackup=new Date()}catch(e){}}
function currentServiceLabel(){if(S.filterSvc==='todos') return 'Todos los servicios';var key=S.filterSvc.replace('svc_','');var d=SVC_DEFS.find(function(x){return x.key===key});return d?d.label:'Servicio'}
function serviceAmountForFilter(c){
  if(S.filterSvc==='todos') return totalDueForMonth(c,S.month);
  var key=S.filterSvc.replace('svc_','');
  var s=c.services[key];
  return (s&&(isServiceDueInMonth(s,S.month,c)||isOneTimeDueInMonth(s,S.month,c)))?Number(s.price)||0:0;
}
function visibleAmountForRow(c){return S.filterSvc==='todos'?totalDueForMonth(c,S.month):serviceAmountForFilter(c)}
function filteredAmountTotal(list){return list.reduce(function(acc,c){return acc+visibleAmountForRow(c)},0)}
function sortIndicator(k){return S.sortBy===k?(S.sortDir==='asc'?' ▲':' ▼'):''}
function sortList(list){
  var dir=S.sortDir==='asc'?1:-1;
  var statusPriority={facturaEnviada:0,pendiente:1,sin:2,pagado:3,cancelado:4};
  return list.slice().sort(function(a,b){
    var av,bv;
    if(S.sortBy==='estado'){
      var pa=(S.payments[a.id]||{})[S.month];
      var pb=(S.payments[b.id]||{})[S.month];
      av=statusPriority[pa?pa.status:'sin'];
      bv=statusPriority[pb?pb.status:'sin'];
      if(av!==bv) return (av-bv)*dir;
      return (a.nombreComercial||a.razonSocial||'').localeCompare((b.nombreComercial||b.razonSocial||''),'es');
    }
    if(S.sortBy==='cliente'){av=(a.nombreComercial||a.razonSocial||'').toLowerCase();bv=(b.nombreComercial||b.razonSocial||'').toLowerCase()}
    else if(S.sortBy==='dia'){av=getCobroDia(a)||99;bv=getCobroDia(b)||99}
    else if(S.sortBy==='servicio'){av=servicesText(a).toLowerCase();bv=servicesText(b).toLowerCase()}
    else if(S.sortBy==='comercial'){av=responsableText(a).toLowerCase();bv=responsableText(b).toLowerCase()}
    else if(S.sortBy==='importe'){av=visibleAmountForRow(a);bv=visibleAmountForRow(b)}
    else {av=(a.nombreComercial||a.razonSocial||'').toLowerCase();bv=(b.nombreComercial||b.razonSocial||'').toLowerCase()}
    if(av<bv) return -1*dir; if(av>bv) return 1*dir; return 0;
  });
}


function normalizeUserRole(u){
  if(!u) return 'usuario';
  if(u.role) return u.role;
  return u.isAdmin?'admin':'usuario';
}
function isAdminUser(){return auth.current&&normalizeUserRole(auth.current)==='admin'}
function isCommercialUser(){return auth.current&&normalizeUserRole(auth.current)==='comercial'}
function canEditData(){return isAdminUser()||isCommercialUser()}
function canManageUsers(){return isAdminUser()}
function disabledIfNoEdit(){return canEditData()?'':' disabled'}
function defaultCommercialColor(name){var palette=['#2563EB','#059669','#EA580C','#0891B2','#9333EA','#BE123C','#4B5563'];var h=0;name=String(name||'');for(var i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))|0;return palette[Math.abs(h)%palette.length]}
function normalizeCommercialName(name){return String(name||'').trim().replace(/\s+/g,' ').replace(/(^|\s)(\S)/g,function(m,a,b){return a+b.toUpperCase()})}
function ensureDefaultComerciales(){var map={};(S.comerciales||[]).forEach(function(c){if(c&&c.name) map[c.name.toLowerCase()]={name:normalizeCommercialName(c.name),color:c.color||defaultCommercialColor(c.name)}});DEFAULT_COMERCIALES.forEach(function(c){if(!map[c.name.toLowerCase()]) map[c.name.toLowerCase()]={name:c.name,color:c.color}});S.comerciales=Object.keys(map).map(function(k){return map[k]}).sort(function(a,b){return a.name.localeCompare(b.name,'es')})}
function addCommercial(name,color){name=normalizeCommercialName(name);if(!name) return false;ensureDefaultComerciales();var exists=S.comerciales.some(function(c){return c.name.toLowerCase()===name.toLowerCase()});if(!exists){S.comerciales.push({name:name,color:color||defaultCommercialColor(name)});S.comerciales.sort(function(a,b){return a.name.localeCompare(b.name,'es')})}return true}
async function saveComerciales(){try{await storageSet('ov_comerciales',JSON.stringify(S.comerciales||[]),true);S.lastSync=new Date()}catch(e){}}
function syncCommercialsFromUsers(){(auth.users||[]).forEach(function(u){if(normalizeUserRole(u)==='comercial') addCommercial(u.commercialName||u.name||userDisplayName(u.email))})}
function comercialesList(){ensureDefaultComerciales();syncCommercialsFromUsers();return (S.comerciales||[]).slice().sort(function(a,b){return a.name.localeCompare(b.name,'es')})}
function commercialColor(name){var n=String(name||'').trim().toLowerCase();var c=comercialesList().find(function(x){return x.name.toLowerCase()===n});return c?c.color:defaultCommercialColor(name)}
function commercialBadge(name){return name?'<span class="comercial-badge" style="color:'+commercialColor(name)+'">'+esc(name)+'</span>':'—'}
function monthOptions(center){var opts=[];for(var i=-18;i<=18;i++){var mk=shiftMonth(center,i);opts.push('<option value="'+mk+'"'+(mk===center?' selected':'')+'>'+monthLabel(mk)+'</option>')}return opts.join('')}

/* compute alerts */
function computeAlerts(){
  var a=[];
  var mk=S.month;
  var today=new Date(), curMk=curMonthKey(), curDay=today.getDate();
  S.clients.forEach(function(c){
    if(!c.active) return;
    var p=(S.payments[c.id]||{})[mk];
    if(!p && recTotalForMonth(c,mk)>0){
      var dia=getCobroDia(c);
      a.push('Sin cobro registrado: <b>'+esc(c.razonSocial)+'</b> – '+monthLabel(mk)+(dia?' · día '+dia:''));
    }
    if(mk===curMk){
      var diaCobro=getCobroDia(c);
      if(diaCobro&&diaCobro<=curDay&&p&&p.status!=='pagado'&&p.status!=='cancelado') a.push('Cobro pendiente según día de cobro: <b>'+esc(c.razonSocial)+'</b> · día '+diaCobro);
    }
  });
  /* overdue: pagos del mes anterior aún pendientes */
  var prevMk=shiftMonth(mk,-1);
  S.clients.forEach(function(c){
    var p=(S.payments[c.id]||{})[prevMk];
    if(p&&p.status==='pendiente'){
      a.push('Pago vencido (mes anterior): <b>'+esc(c.razonSocial)+'</b> – '+monthLabel(prevMk));
    }
  });
  S.alerts=a;
}

/* auto-generate monthly entries for recurring services */
async function autoGenerateMonth(mk,silent){
  var created=0;
  S.clients.forEach(function(c){
    if(!c.active) return;
    var total=totalDueForMonth(c,mk);
    if(total<=0) return;
    if(!S.payments[c.id]) S.payments[c.id]={};
    if(!S.payments[c.id][mk]){
      S.payments[c.id][mk]={importe:total,status:'pendiente',formaCobro:defaultFormaCobro(c),fecha:'',serviceStatus:{},notas:''};
      created++;
    }
  });
  if(created>0){await savePayments();if(!silent) toast('Generados '+created+' cobros para '+monthLabel(mk))}
  return created;
}

/* ═══════════════════════════════════════
   STORAGE
═══════════════════════════════════════ */
async function loadUsers(){try{var r=await storageGet('ov_users',true);auth.users=r&&r.value?JSON.parse(r.value):[];auth.users.forEach(function(u){u.role=normalizeUserRole(u);u.isAdmin=u.role==='admin';if(u.role==='comercial'&&!u.commercialName)u.commercialName=normalizeCommercialName(u.name||userDisplayName(u.email))});}catch(e){auth.users=[]}}
async function saveUsers(){try{await storageSet('ov_users',JSON.stringify(auth.users),true)}catch(e){toast('Error al guardar usuarios')}}
async function loadData(silent){
  if(!silent){S.loading=true;S.error=null;renderApp()}
  try{
    var c=null,p=null,d=null,cm=null;
    try{c=await storageGet('ov_clients',true)}catch(e){}
    try{p=await storageGet('ov_payments',true)}catch(e){}
    try{d=await storageGet('ov_deleted_clients',true)}catch(e){}
    try{cm=await storageGet('ov_comerciales',true)}catch(e){}
    S.clients=c&&c.value?JSON.parse(c.value):[];
    S.clients.forEach(function(cl){
      if(cl.razonSocial) cl.razonSocial=normalizeClientName(cl.razonSocial);
      if(cl.nombreComercial) cl.nombreComercial=normalizeClientName(cl.nombreComercial);
      if(cl.services){Object.keys(cl.services).forEach(function(k){if(cl.services[k]) cl.services[k].period=normalizeServicePeriod(cl.services[k].period||'mensual')})}
    });
    S.payments=p&&p.value?JSON.parse(p.value):{};
    S.deletedClients=d&&d.value?JSON.parse(d.value):[];
    S.comerciales=cm&&cm.value?JSON.parse(cm.value):[];
    ensureDefaultComerciales();syncCommercialsFromUsers();await saveComerciales();
    S.lastSync=new Date();
    await autoGenerateMonth(S.month,true);
    computeAlerts();
  }catch(e){S.error='No se han podido cargar los datos.'}
  S.loading=false;renderApp();
}
async function saveClients(){try{await storageSet('ov_clients',JSON.stringify(S.clients),true);S.lastSync=new Date()}catch(e){toast('Error al guardar')}}
async function savePayments(){try{await storageSet('ov_payments',JSON.stringify(S.payments),true);S.lastSync=new Date()}catch(e){toast('Error al guardar')}}
async function saveDeletedClients(){try{await storageSet('ov_deleted_clients',JSON.stringify(S.deletedClients||[]),true);S.lastSync=new Date()}catch(e){toast('Error al guardar eliminados')}}

/* ═══════════════════════════════════════
   AUTH ACTIONS
═══════════════════════════════════════ */
async function doLogin(email,pass){
  auth.err=null;auth.ok=null;
  if(!email||!pass){auth.err='Rellena todos los campos';renderAuth();return}
  var h=hashP(pass);
  var pending=auth.users.find(function(u){return u.email.toLowerCase()===email.toLowerCase()&&u.pendingActivation});
  if(pending){auth.err='Tu acceso está pendiente. Ve a Crear cuenta con este email para activar tu contraseña.';renderAuth();return}
  var u=auth.users.find(function(u){return u.email.toLowerCase()===email.toLowerCase()&&u.passHash===h});
  if(!u){auth.err='Email o contraseña incorrectos';renderAuth();return}
  auth.current=u;showApp();
}
async function doRegister(email,pass,pass2,adminKey){
  auth.err=null;auth.ok=null;
  if(!email||!pass){auth.err='Rellena email y contraseña';renderAuth();return}
  if(pass!==pass2){auth.err='Las contraseñas no coinciden';renderAuth();return}
  if(pass.length<6){auth.err='Mínimo 6 caracteres';renderAuth();return}
  var existing=auth.users.find(function(u){return u.email.toLowerCase()===email.toLowerCase()});
  if(existing){
    if(existing.pendingActivation){
      existing.passHash=hashP(pass);
      existing.pendingActivation=false;
      existing.name=email.split('@')[0];
      await saveUsers();
      auth.ok='Cuenta activada. Ya puedes entrar.';auth.tab='login';renderAuth();return;
    }
    auth.err='Ese email ya existe';renderAuth();return
  }
  var isAdmin=(adminKey==='OV2024ADMIN');
  auth.users.push({email:email.trim().toLowerCase(),passHash:hashP(pass),pendingActivation:false,isAdmin:isAdmin,role:isAdmin?'admin':'usuario',name:email.split('@')[0]});
  await saveUsers();
  auth.ok='Cuenta creada. Ya puedes entrar.';auth.tab='login';renderAuth();
}
async function doDelUser(email){
  if(email===auth.current.email){toast('No puedes eliminarte a ti mismo');return}
  if(!confirm('¿Eliminar usuario '+email+'?')) return;
  auth.users=auth.users.filter(function(u){return u.email!==email});
  await saveUsers();renderAuth();toast('Usuario eliminado');
}

function userDisplayName(email){return String(email||'').split('@')[0]}
async function adminCreateUser(email,role,commercialName){
  email=String(email||'').trim().toLowerCase();role=role||'usuario';
  if(!email||email.indexOf('@')===-1){toast('Introduce un email válido');return false}
  if(auth.users.find(function(u){return u.email.toLowerCase()===email})){toast('Ese usuario ya existe');return false}
  commercialName=normalizeCommercialName(commercialName||userDisplayName(email));
  var u={email:email,passHash:'',pendingActivation:true,role:role,isAdmin:role==='admin',name:userDisplayName(email),createdBy:auth.current?auth.current.email:'admin'};
  if(role==='comercial'){u.commercialName=commercialName;addCommercial(commercialName);await saveComerciales();}
  auth.users.push(u);
  await saveUsers();toast('Invitación creada');renderApp();return true;
}
async function adminUpdateUserRole(email,role,commercialName){
  var u=auth.users.find(function(u){return u.email===email});if(!u) return;
  if(auth.current&&email===auth.current.email&&role!=='admin'){toast('No puedes quitarte permisos de admin a ti misma');renderApp();return}
  u.role=role;u.isAdmin=(role==='admin');
  if(role==='comercial'){u.commercialName=normalizeCommercialName(commercialName||u.commercialName||u.name||userDisplayName(email));addCommercial(u.commercialName);await saveComerciales();}
  await saveUsers();renderApp();
}
async function adminResetPassword(email,pass){
  var u=auth.users.find(function(u){return u.email===email});pass=String(pass||'').trim();if(!u) return;
  if(!pass||pass.length<6){toast('La contraseña debe tener mínimo 6 caracteres');return}
  u.passHash=hashP(pass);await saveUsers();toast('Contraseña actualizada');renderApp();
}
async function adminReactivateUser(email){
  var u=auth.users.find(function(u){return u.email===email});if(!u) return;
  u.pendingActivation=true;u.passHash='';await saveUsers();toast('Acceso pendiente de activar');renderApp();
}
async function adminDeleteUser(email){
  if(auth.current&&email===auth.current.email){toast('No puedes eliminarte a ti misma');return}
  if(!confirm('¿Quitar acceso a '+email+'?')) return;
  auth.users=auth.users.filter(function(u){return u.email!==email});await saveUsers();toast('Acceso eliminado');renderApp();
}
function doLogout(){
  auth.current=null;
  clearInterval(AUTO_INTERVAL);
  clearInterval(BACKUP_INTERVAL);
  document.getElementById('appWrap').style.display='none';
  document.getElementById('authWrap').style.display='flex';
  renderAuth();
}
function showApp(){
  document.getElementById('authWrap').style.display='none';
  document.getElementById('appWrap').style.display='block';
  loadData();
  /* auto-refresh */
  clearInterval(AUTO_INTERVAL);
  AUTO_INTERVAL=setInterval(function(){
    /* No refrescar mientras se está rellenando un modal/formulario: evita borrar campos a medio crear cliente/factura. */
    var active=document.activeElement;
    var editingModal=!!(S.modal||document.getElementById('modalOverlay')||(active&&active.closest&&active.closest('.modal')));
    if(editingModal) return;
    loadData(true);
  },AUTO_MS);
  clearInterval(BACKUP_INTERVAL);
  createAutoBackup();
  BACKUP_INTERVAL=setInterval(createAutoBackup,BACKUP_MS);
}

/* ═══════════════════════════════════════
   AUTH RENDER
═══════════════════════════════════════ */
function renderAuth(){
  var el=document.getElementById('authContent');if(!el) return;
  var h='';
  if(auth.err) h+='<div class="auth-err">'+esc(auth.err)+'</div>';
  if(auth.ok)  h+='<div class="auth-ok">'+esc(auth.ok)+'</div>';
  h+='<div class="auth-tabs">';
  h+='<button class="auth-tab '+(auth.tab==='login'?'active':'')+'" data-atab="login">Entrar</button>';
  h+='<button class="auth-tab '+(auth.tab==='register'?'active':'')+'" data-atab="register">Crear cuenta</button>';
  h+='</div>';
  if(auth.tab==='login'){
    h+='<div class="auth-field"><label>Email</label><input type="email" id="lEmail" placeholder="tu@email.com" autocomplete="username"></div>';
    h+='<div class="auth-field"><label>Contraseña</label><input type="password" id="lPass" placeholder="••••••••" autocomplete="current-password"></div>';
    h+='<button class="auth-btn" id="loginBtn">Entrar al panel</button>';
    if(!auth.users.length) h+='<p class="auth-hint">Sin usuarios todavía. Ve a "Crear cuenta" para registrar el primer administrador.</p>';
  } else {
    h+='<div class="auth-field"><label>Email</label><input type="email" id="rEmail" placeholder="tu@email.com"></div>';
    h+='<div class="auth-field"><label>Contraseña</label><input type="password" id="rPass" placeholder="Mínimo 6 caracteres"></div>';
    h+='<div class="auth-field"><label>Repetir contraseña</label><input type="password" id="rPass2" placeholder="••••••••"></div>';
    h+='<div class="auth-field"><label>Clave de admin <span style="font-weight:400;color:var(--text-faint)">(opcional)</span></label><input type="password" id="rAdminKey" placeholder="Solo si tienes acceso de admin"></div>';
    h+='<button class="auth-btn" id="registerBtn">Crear cuenta</button>';
    h+='<p class="auth-hint">Necesitas que un administrador te facilite la clave para obtener permisos de admin. Sin ella tendrás acceso de usuario.</p>';
  }
  if(auth.current&&auth.current.isAdmin){
    h+='<div class="admin-section"><p class="admin-title">Usuarios ('+auth.users.length+')</p>';
    h+='<ul class="user-list">';
    auth.users.forEach(function(u){
      h+='<li class="user-item"><div><div class="user-email">'+esc(u.email)+'</div></div>';
      h+='<div style="display:flex;align-items:center;gap:8px;"><span class="user-role">'+(u.isAdmin?'admin':'usuario')+'</span>';
      if(u.email!==auth.current.email) h+='<button class="icon-btn" data-del-user="'+esc(u.email)+'">✕</button>';
      h+='</div></li>';
    });
    h+='</ul></div>';
  }
  el.innerHTML=h;
  el.querySelectorAll('[data-atab]').forEach(function(b){b.addEventListener('click',function(){auth.tab=b.getAttribute('data-atab');auth.err=null;auth.ok=null;renderAuth()})});
  var lb=document.getElementById('loginBtn');
  if(lb) lb.addEventListener('click',function(){doLogin(document.getElementById('lEmail').value,document.getElementById('lPass').value)});
  var rb=document.getElementById('registerBtn');
  if(rb) rb.addEventListener('click',function(){doRegister(document.getElementById('rEmail').value,document.getElementById('rPass').value,document.getElementById('rPass2').value,document.getElementById('rAdminKey').value)});
  el.querySelectorAll('[data-del-user]').forEach(function(b){b.addEventListener('click',function(){doDelUser(b.getAttribute('data-del-user'))})});
  el.querySelectorAll('input').forEach(function(inp){inp.addEventListener('keydown',function(e){if(e.key==='Enter'){if(auth.tab==='login'&&lb) lb.click();else if(rb) rb.click()}})});
}

/* ═══════════════════════════════════════
   APP ACTIONS
═══════════════════════════════════════ */
function getClient(id){return S.clients.find(function(c){return c.id===id})}
function openAddModal(){S.modal={type:'add'};renderApp()}
function openUsersModal(){S.modal={type:'users'};renderApp()}
function closeModal(){S.modal=null;renderApp()}

async function createClient(form){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var c={id:genId(),razonSocial:normalizeClientName(form.razon),nombreComercial:normalizeClientName(form.comercial||form.razon),
    contactoNombre:form.contacto||'',contactoEmail:form.email||'',contactoTel:form.tel||'',cobroDia:form.cobroDia||'',
    responsable:form.responsable||'',formaCobro:form.formaCobro||'',fechaAlta:form.fecha||new Date().toISOString().slice(0,10),
    active:true,services:{},notas:''};
  SVC_DEFS.forEach(function(d){c.services[d.key]={price:0,period:d.recurring?'mensual':'unico',status:'pendiente',formaCobro:'',fecha:'',otrosLabel:'',startMonth:S.month}});
  S.clients.push(c);
  setLastResponsable(c.responsable);
  await saveClients();S.modal=null;S.expanded=c.id;S.expandedTab[c.id]='servicios';
  renderApp();
}
async function deleteClient(id){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var c=getClient(id);if(!c) return;
  if(!confirm('¿Mover este cliente a eliminados?\nPodrás verlo y restaurarlo más adelante.')) return;
  if(!S.deletedClients) S.deletedClients=[];
  S.deletedClients.unshift({client:JSON.parse(JSON.stringify(c)),payments:JSON.parse(JSON.stringify(S.payments[id]||{})),deletedAt:new Date().toISOString(),deletedBy:auth.current?auth.current.email:''});
  S.clients=S.clients.filter(function(x){return x.id!==id});delete S.payments[id];
  await saveDeletedClients();await saveClients();await savePayments();if(S.expanded===id) S.expanded=null;
  renderApp();
}
async function restoreDeletedClient(idx){
  idx=parseInt(idx,10);var item=(S.deletedClients||[])[idx];if(!item) return;
  var c=item.client;if(!c.id||getClient(c.id)) c.id=genId();
  S.clients.push(c);S.payments[c.id]=item.payments||{};
  S.deletedClients.splice(idx,1);
  await saveDeletedClients();await saveClients();await savePayments();S.expanded=c.id;S.expandedTab[c.id]='servicios';closeModal();renderApp();
}
async function removeDeletedForever(idx){
  idx=parseInt(idx,10);var item=(S.deletedClients||[])[idx];if(!item) return;
  if(!confirm('¿Eliminar definitivamente este registro? Esta acción no se puede deshacer.')) return;
  S.deletedClients.splice(idx,1);await saveDeletedClients();renderApp();
}
function openDeletedModal(){S.modal={type:'deleted'};renderApp()}
async function toggleActive(id){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var c=getClient(id);if(!c) return;c.active=!c.active;await saveClients();renderApp();
}
async function updateClientField(id,field,val){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var c=getClient(id);if(!c) return;
  if(field==='razonSocial'||field==='nombreComercial') val=normalizeClientName(val);
  c[field]=val;await saveClients();renderApp();
}
async function updateSvcField(clientId,key,field,val){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var c=getClient(clientId);if(!c) return;
  if(!c.services[key]) c.services[key]={price:0,period:'unico',status:'pendiente',formaCobro:'',fecha:'',otrosLabel:'',startMonth:S.month};
  if(field==='period'){
    val=normalizeServicePeriod(val);
    c.services[key][field]=val;
    c.services[key].recurring=(val!=='unico');
    if(val==='anual') c.services[key].startMonth=clientAltaMonth(c)||S.month;
    else if(!c.services[key].startMonth) c.services[key].startMonth=S.month;
  }
  else c.services[key][field]=val;
  await saveClients();renderApp();
}
async function updateSvcForma(clientId,key,val){
  var c=getClient(clientId);if(!c) return;
  if(!c.services[key]) c.services[key]={price:0,period:'unico',status:'pendiente',formaCobro:'',fecha:'',otrosLabel:'',startMonth:S.month};
  if(val&&!c.formaCobro){
    c.formaCobro=val;
    c.services[key].formaCobro='';
  }else{
    c.services[key].formaCobro=val;
  }
  await saveClients();renderApp();
}
async function setMonthlyStatus(clientId,mk,field,val){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  if(!S.payments[clientId]) S.payments[clientId]={};
  var c=getClient(clientId);
  if(!S.payments[clientId][mk]){
    S.payments[clientId][mk]={importe:c?totalDueForMonth(c,mk):0,status:'pendiente',formaCobro:defaultFormaCobro(c),fecha:'',serviceStatus:{},notas:''};
  }
  if(field==='formaCobro'&&val&&c&&!c.formaCobro){
    c.formaCobro=val;
    S.payments[clientId][mk][field]='';
    await saveClients();
  }else{
    S.payments[clientId][mk][field]=val;
  }
  if(field==='status'&&val==='pagado'&&!S.payments[clientId][mk].fecha)
    S.payments[clientId][mk].fecha=new Date().toISOString().slice(0,10);
  computeAlerts();
  await savePayments();renderApp();
}
async function setSvcMonthStatus(clientId,mk,svcKey,val){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  if(!S.payments[clientId]) S.payments[clientId]={};
  if(!S.payments[clientId][mk]){
    var c=getClient(clientId);
    S.payments[clientId][mk]={importe:c?totalDueForMonth(c,mk):0,status:'pendiente',formaCobro:defaultFormaCobro(c),fecha:'',serviceStatus:{},notas:''};
  }
  if(!S.payments[clientId][mk].serviceStatus) S.payments[clientId][mk].serviceStatus={};
  S.payments[clientId][mk].serviceStatus[svcKey]=val;
  /* si todos los servicios activos están pagados, marca global como pagado */
  var c=getClient(clientId);
  if(c){
    var actSvcs=activeServices(c);
    var allPaid=actSvcs.every(function(d){return S.payments[clientId][mk].serviceStatus[d.key]==='pagado'});
    if(allPaid){
      S.payments[clientId][mk].status='pagado';
      if(!S.payments[clientId][mk].fecha) S.payments[clientId][mk].fecha=new Date().toISOString().slice(0,10);
    }
  }
  computeAlerts();await savePayments();renderApp();
}
function nextPaymentStatus(current){if(current==='pendiente') return 'facturaEnviada';if(current==='facturaEnviada') return 'pagado';if(current==='pagado') return 'pagado';return 'pendiente'}
async function quickPay(clientId){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  var mk=S.month;
  if(!S.payments[clientId]) S.payments[clientId]={};
  var c=getClient(clientId);
  var existed=!!S.payments[clientId][mk];
  if(!existed){
    S.payments[clientId][mk]={importe:c?totalDueForMonth(c,mk):0,status:'pendiente',formaCobro:defaultFormaCobro(c),fecha:'',serviceStatus:{},notas:''};
    computeAlerts();await savePayments();renderApp();return;
  }
  var cur=S.payments[clientId][mk].status||'pendiente';
  var next=nextPaymentStatus(cur);
  S.payments[clientId][mk].status=next;
  if(next==='pagado'&&!S.payments[clientId][mk].fecha) S.payments[clientId][mk].fecha=new Date().toISOString().slice(0,10);
  var cl=getClient(clientId);
  if(cl&&next==='pagado'){activeServices(cl).forEach(function(d){S.payments[clientId][mk].serviceStatus[d.key]='pagado'})}
  computeAlerts();await savePayments();renderApp();
}
async function addManualMonth(clientId,mk){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  if(!mk){toast('Selecciona un mes');return}
  var c=getClient(clientId);
  if(!S.payments[clientId]) S.payments[clientId]={};
  if(S.payments[clientId][mk]){toast('Ese mes ya existe');return}
  S.payments[clientId][mk]={importe:c?totalDueForMonth(c,mk):0,status:'pendiente',formaCobro:defaultFormaCobro(c),fecha:'',serviceStatus:{},notas:''};
  computeAlerts();await savePayments();renderApp();
}
async function deleteMonth(clientId,mk){
  if(!canEditData()){toast('Tu acceso es de solo consulta');return;}
  if(!confirm('¿Eliminar el registro de '+monthLabel(mk)+'?')) return;
  if(S.payments[clientId]) delete S.payments[clientId][mk];
  computeAlerts();await savePayments();renderApp();
}
function exportCsv(){
  var rows=[['Razón social','Nombre comercial','Responsable / comercial','Contacto','Email','Día cobro','Servicios','Cuota mensual','Mes','Importe','Estado','Forma cobro','Fecha pago','Notas']];
  S.clients.forEach(function(c){
    var hist=S.payments[c.id]||{},months=Object.keys(hist).sort();
    if(!months.length){rows.push([c.razonSocial,c.nombreComercial,responsableText(c),c.contactoNombre||'',c.contactoEmail||'',getCobroDia(c),servicesText(c),recTotal(c).toFixed(2),'','','','','','']);return}
    months.forEach(function(mk){var p=hist[mk];rows.push([c.razonSocial,c.nombreComercial,responsableText(c),c.contactoNombre||'',c.contactoEmail||'',getCobroDia(c),servicesText(c),recTotal(c).toFixed(2),mk,p.importe.toFixed(2),STATUS_LABEL[p.status]||p.status,effectiveFormaCobro(c,p.formaCobro),p.fecha||'',p.notas||''])});
  });
  var html='<html><head><meta charset="UTF-8"></head><body><table border="1">'+rows.map(function(r){return '<tr>'+r.map(function(v){return '<td>'+esc(v)+'</td>'}).join('')+'</tr>'}).join('')+'</table></body></html>';
  var blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='control-facturacion-onlinevalles.xls';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════
   APP RENDER
═══════════════════════════════════════ */
function root(){return document.getElementById('root')}
function renderApp(){
  S._sf=document.activeElement&&document.activeElement.id==='searchInput';
  var r=root();if(!r) return;
  if(S.loading){r.innerHTML='<div class="loading-state">Cargando datos…</div>';return}
  var h='';
  h+=renderTopbar();
  if(S.error) h+='<div class="error-banner"><span>'+esc(S.error)+'</span><button class="btn btn-sm" data-action="retry">Reintentar</button></div>';
  /* Avisos internos calculados, pero no se muestran arriba para que el panel no se mueva al editar. */
  h+=renderKpis();
  h+='<div class="list-controls">'+renderToolbar()+renderFilterSummary()+renderFiltersBar()+'</div>';
  h+=renderTable();
  r.innerHTML=h;
  var ov=document.getElementById('modalOverlay');if(ov) ov.remove();
  if(S.modal) renderModal();
  bindEvents();
}

function renderTopbar(){
  var init=auth.current?auth.current.email.slice(0,2).toUpperCase():'??';
  var lastStr=S.lastSync?S.lastSync.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'—';
  return '<div class="topbar">'+
    '<div class="brand">'+
      '<div><div class="brand-name">CONTROL FACTURACIÓN ONLINEVALLES</div></div>'+
    '</div>'+
    '<div class="topbar-right">'+
      '<div class="sync-info"><span class="sync-dot"></span> Actualizado '+lastStr+'</div>'+
      '<div class="user-badge"><div class="user-avatar">'+init+'</div><span>'+(auth.current?auth.current.email:'')+'</span></div>'+
      (auth.current&&auth.current.isAdmin?'<button class="btn-top-secondary" data-action="deleted-clients">Clientes eliminados'+((S.deletedClients||[]).length?' ('+S.deletedClients.length+')':'')+'</button>':'')+
      (canManageUsers()?'<button class="btn-users-top" data-action="users-access">Usuarios y accesos</button>':'')+
      '<button class="btn-logout" id="logoutBtn">Salir</button>'+
    '</div>'+
  '</div>';
}

function renderAlerts(){
  if(!S.alerts.length) return '';
  return '<div class="alerts-banner">'+
    '<span class="alerts-banner-icon">⚠️</span>'+
    '<ul>'+S.alerts.slice(0,5).map(function(a){return '<li>'+a+'</li>'}).join('')+
    (S.alerts.length>5?'<li>…y '+(S.alerts.length-5)+' más</li>':'')+
    '</ul>'+
  '</div>';
}

function renderKpis(){
  var mrr=globalMRR(),cob=globalCobradoMes(),totalMes=globalTotalMes(),pend=globalPendiente();
  var pct=totalMes>0?Math.round(cob/totalMes*100):0;
  var active=S.clients.filter(function(c){return c.active}).length;
  var mk=S.month;
  /* count estados del mes */
  var nPagado=0,nEnviada=0,nPendiente=0;
  S.clients.forEach(function(c){
    var p=(S.payments[c.id]||{})[mk];if(!p) return;
    if(p.status==='pagado') nPagado++;
    else if(p.status==='facturaEnviada') nEnviada++;
    else if(p.status==='pendiente') nPendiente++;
  });
  var older=pendingOlderBreakdown(),olderTotal=older.reduce(function(a,x){return a+x.total},0);
  var olderHtml=older.length?older.map(function(x){return '<div class="kpi-detail-row"><span>'+monthLabel(x.month)+' · '+x.count+' cuota'+(x.count===1?'':'s')+'</span><b>'+fmtM(x.total)+'</b></div>'}).join(''):'<div class="kpi-detail-row"><span>No hay cuotas pendientes de meses anteriores</span><b>'+fmtM(0)+'</b></div>';
  return '<div class="kpis">'+
    '<div class="kpi"><p class="kpi-label">Clientes activos</p><div class="kpi-value blue">'+active+'</div><p class="kpi-note">'+S.clients.length+' en total</p></div>'+
    '<div class="kpi"><p class="kpi-label">MRR (mensual)</p><div class="kpi-value">'+dispM(mrr)+'</div><p class="kpi-note">cuotas mensuales activas</p></div>'+
    '<div class="kpi"><p class="kpi-label">Cobrado · '+monthLabel(mk)+'</p><div class="kpi-value green ratio">'+dispM(cob)+' / '+dispM(totalMes)+'</div>'+
      '<div class="kpi-bar"><div class="kpi-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<p class="kpi-note">'+pct+'% del mes · '+nPagado+' clientes</p></div>'+
    '<div class="kpi"><p class="kpi-label">Pendiente · '+monthLabel(mk)+'</p><div class="kpi-value red">'+dispM(pend)+'</div><p class="kpi-note">'+nPendiente+' pendiente fra. · '+nEnviada+' factura enviada</p></div>'+
    '<div class="kpi"><p class="kpi-label">Pendiente acumulado</p><div class="kpi-value amber">'+fmtM(olderTotal)+'</div><p class="kpi-note">meses anteriores sin cobrar</p><details class="kpi-details"><summary>Ver resumen</summary><div class="kpi-detail-panel">'+olderHtml+'</div></details></div>'+
  '</div>';
}

function renderFiltersBar(){
  var statusOptions=[
    {k:'all',label:'Todos los clientes'},
    {k:'pagado',label:'Pagados'},
    {k:'facturaEnviada',label:'Factura enviada'},
    {k:'pendiente',label:'Pendientes'},
    {k:'cancelado',label:'Cancelados'},
    {k:'sin',label:'Sin registro'}
  ].map(function(f){return '<option value="'+f.k+'"'+(S.filterStatus===f.k?' selected':'')+'>'+f.label+'</option>'}).join('');
  var indivOptions=SVC_DEFS.map(function(d){return '<option value="svc_'+d.key+'"'+(S.filterSvc==='svc_'+d.key?' selected':'')+'>'+esc(d.label)+'</option>'}).join('');
  var respOptions=comercialesList().map(function(c){return '<option value="'+esc(c.name)+'"'+(S.filterResp===c.name?' selected':'')+'>'+esc(c.name)+'</option>'}).join('');
  return '<div class="filters-bar compact-filters">'+
    '<div class="filters-row">'+
      (canEditData()?'<button class="btn btn-round-add" data-action="add">+ Nuevo cliente</button>':'')+ 
      '<div class="search-wrap"><input class="search" id="searchInput" type="text" placeholder="Buscar cliente…" value="'+esc(S.search)+'"></div>'+ 
      '<select class="filter-select" id="statusFilter" title="Filtrar por estado">'+statusOptions+'</select>'+ 
      '<select class="filter-select" id="svcFilter" title="Filtrar por servicio"><option value="todos"'+(S.filterSvc==='todos'?' selected':'')+'>Todos los servicios</option>'+indivOptions+'</select>'+ 
      '<select class="filter-select" id="respFilter" title="Filtrar por comercial"><option value="todos"'+(S.filterResp==='todos'?' selected':'')+'>Todos los comerciales</option>'+respOptions+'</select>'+ 
      '<div class="month-nav"><button class="month-nav-btn" data-month-nav="prev">←</button><select class="filter-select month-select" id="monthPick">'+monthOptions(S.month)+'</select><button class="month-nav-btn" data-month-nav="next">→</button></div>'+ 
      '<label class="iva-label" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;white-space:nowrap;"><input type="checkbox" id="ivaToggle" '+(S.showIva?'checked':'')+'> Con IVA</label>'+ 
    '</div>'+ 
  '</div>';
}

function renderFilterSummary(){
  var list=filteredClients();
  var total=filteredAmountTotal(list);
  var active=list.filter(function(c){return c.active}).length;
  return '<div class="filter-summary">'+
    '<div class="sum-card"><div class="sum-label">Total selección</div><div class="sum-value">'+dispM(total)+'</div></div>'+ 
    '<div class="sum-card"><div class="sum-label">Clientes filtrados</div><div class="sum-value">'+list.length+'</div></div>'+ 
  '</div>';
}

function renderToolbar(){
  return '<div class="toolbar list-head">'+
    '<div class="list-head-title">Listado de clientes</div>'+(!canEditData()?'<span class="readonly-hint">Solo consulta</span>':'')+ 
    '<span class="ml-auto today-display">'+todayHuman()+'</span>'+ 
  '</div>';
}

function filteredClients(){
  var q=S.search.trim().toLowerCase(),mk=S.month;
  return S.clients.filter(function(c){
    if(q){var h=(c.razonSocial+' '+c.nombreComercial+' '+(c.contactoNombre||'')+' '+responsableText(c)).toLowerCase();if(h.indexOf(q)===-1) return false}
    if(S.filterResp!=='todos'&&responsableText(c)!==S.filterResp) return false;
    /* status filter */
    if(S.filterStatus!=='all'){
      var p=(S.payments[c.id]||{})[mk];
      if(S.filterStatus==='sin'){if(p) return false}
      else{if(!p||p.status!==S.filterStatus) return false}
    }
    /* service filter: only include clients whose selected service is due in the selected month */
    if(S.filterSvc!=='todos'){
      if(serviceAmountForFilter(c)<=0) return false;
    }
    return true;
  });
}

function renderTable(){
  var list=sortList(filteredClients());
  if(!S.clients.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin clientes</h3><p>Añade el primero para empezar.</p><button class="btn btn-primary" data-action="add" style="margin-top:14px;">+ Nuevo cliente</button></div></div>';
  if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin resultados</h3><p>Ningún cliente coincide con los filtros actuales.</p></div></div>';
  var heatMks=[];for(var i=5;i>=0;i--) heatMks.push(shiftMonth(S.month,-i));
  var rowsHtml=list.map(function(c){return renderClientRow(c,heatMks)+(S.expanded===c.id?renderDetailRow(c):'')}).join('');
  return '<div class="table-wrap"><div class="table-scroll"><table>'+
    '<thead><tr>'+
      '<th style="width:26px;"></th>'+
      '<th><button class="th-sort" data-sort="cliente">Cliente'+sortIndicator('cliente')+'</button></th>'+
      '<th><button class="th-sort" data-sort="comercial">Comercial'+sortIndicator('comercial')+'</button></th>'+
      '<th><button class="th-sort" data-sort="dia">Día cobro'+sortIndicator('dia')+'</button></th>'+
      '<th><button class="th-sort" data-sort="servicio">Servicio'+sortIndicator('servicio')+'</button></th>'+
      '<th style="text-align:right"><button class="th-sort" data-sort="importe">Total mensual'+sortIndicator('importe')+'</button></th>'+
      '<th>Últimos 6 meses</th>'+
      '<th><button class="th-sort" data-sort="estado">Estado'+sortIndicator('estado')+'</button></th>'+
      '<th style="text-align:right">Acción rápida</th>'+
    '</tr></thead>'+
    '<tbody>'+rowsHtml+'</tbody>'+
  '</table></div></div>';
}

function renderClientRow(c,heatMks){
  var mk=S.month,p=(S.payments[c.id]||{})[mk];
  var total=recTotalForMonth(c,mk),oneT=oneTimeTotal(c,mk),totalCliente=visibleAmountForRow(c);
  var rowServicesText=(S.filterSvc==='todos')?servicesText(c):(function(){var key=S.filterSvc.replace('svc_','');var d=SVC_DEFS.find(function(x){return x.key===key});var sv=c.services[key]||{};return d?(d.key==='otros'?(sv.otrosLabel||'Otros'):d.label):servicesText(c)})();

  /* status select */
  var stHtml;
  if(p){
    stHtml='<select class="st-sel '+p.status+'" data-month-status="'+c.id+'"'+disabledIfNoEdit()+'>'+
      Object.keys(STATUS_LABEL).map(function(s){return'<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select>';
  } else {
    stHtml='<span class="badge sin">Sin registro</span>';
  }
  /* next-step quick action */
  var qpHtml='';
  var curStatus=p?p.status:'sin';
  if(curStatus==='pagado'){
    qpHtml='<span style="font-size:11.5px;color:var(--green);font-weight:700;">✓ Pagado</span>';
  } else {
    var ns=nextPaymentStatus(curStatus);
    qpHtml=canEditData()?'<button class="qp-btn next-'+ns+'" data-qp="'+c.id+'">'+STATUS_LABEL[ns]+'</button>':'<span style="font-size:11px;color:var(--text-faint);">Solo consulta</span>';
  }
  /* service pills */
  var actSvcs=activeServices(c);
  var svcStatus=p&&p.serviceStatus?p.serviceStatus:{};
  var pillsHtml=actSvcs.length?'<div class="svc-pills">'+actSvcs.map(function(d){
    var st=svcStatus[d.key]||(p?p.status:'sin');
    var lbl=d.key==='otros'?(c.services['otros'].otrosLabel||'Otros'):d.label;
    return '<button class="service-tag" style="color:'+d.color+';border-color:'+d.color+';background:color-mix(in srgb, '+d.color+' 10%, white);" data-svc-pill="'+c.id+'|'+d.key+'" title="'+esc(lbl)+' · estado: '+(STATUS_LABEL[st]||st)+'">'+esc(lbl)+'</button>';
  }).join('')+'</div>':'';

  /* heat */
  var heatHtml='<div class="hmap">'+heatMks.map(function(hmk){
    var hp=(S.payments[c.id]||{})[hmk];
    var col=hp?({pagado:'#16A34A',facturaEnviada:'#2563EB',pendiente:'#D97706',cancelado:'#DC2626'}[hp.status]||'#9AAAB6'):'#DDE3E8';
    return '<div class="hcell" style="background:'+col+'" title="'+monthLabel(hmk)+': '+(hp?STATUS_LABEL[hp.status]:'sin registro')+'"></div>';
  }).join('')+'</div>';

  return '<tr class="cr '+(c.active?'':'inactive-row')+'" data-expand="'+c.id+'">'+
    '<td><span class="chevron '+(S.expanded===c.id?'open':'')+'">▸</span></td>'+
    '<td class="name-cell">'+
      '<div class="razon">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+(c.active?'':'<span class="inactive-tag">Inactivo</span>')+'</div>'+
      '<div class="comercial">'+esc((c.razonSocial||'').toUpperCase())+(c.contactoNombre?' · '+esc(c.contactoNombre):'')+'</div>'+ 
      pillsHtml+
    '</td>'+
    '<td>'+commercialBadge(responsableText(c))+'</td>'+
    '<td><span class="day-pill">'+(getCobroDia(c)?'Día '+getCobroDia(c):'—')+'</span></td>'+
    '<td style="font-size:12px;color:var(--text-muted);max-width:190px;">'+(rowServicesText?esc(rowServicesText):'—')+'</td>'+
    '<td class="money-cell total-only">'+dispM(totalCliente)+'</td>'+
    '<td>'+heatHtml+'</td>'+
    '<td>'+stHtml+'</td>'+
    '<td style="text-align:right">'+qpHtml+'</td>'+
  '</tr>';
}

function renderDetailRow(c){return '<tr class="dr"><td colspan="9">'+renderDetail(c)+'</td></tr>'}

function renderDetail(c){
  var tab=S.expandedTab[c.id]||'servicios';
  var tabs=[{k:'servicios',label:'Servicios y precios'},{k:'historial',label:'Historial de cobros'},{k:'notas',label:'Notas y contacto'}];
  var tabsHtml=tabs.map(function(t){return '<button class="detail-tab '+(tab===t.k?'active':'')+'" data-dtab="'+c.id+'|'+t.k+'">'+t.label+'</button>'}).join('');
  var content='';
  if(tab==='servicios') content=renderTabServicios(c);
  else if(tab==='historial') content=renderTabHistorial(c);
  else content=renderTabNotas(c);
  return '<div class="detail-inner">'+
    '<div class="detail-tabs">'+tabsHtml+'</div>'+
    content+
    '<div class="detail-footer">'+
      '<div style="display:flex;gap:8px;align-items:center;">'+
        '<button class="btn btn-sm" data-action="toggle-active" data-id="'+c.id+'">'+(c.active?'Marcar inactivo':'Marcar activo')+'</button>'+
      '</div>'+
      '<button class="btn btn-sm btn-danger" data-action="delete" data-id="'+c.id+'">Eliminar cliente</button>'+
    '</div>'+
  '</div>';
}

function renderTabServicios(c){
  var svcsHtml=SVC_DEFS.map(function(d){
    var s=c.services[d.key]||{price:0,period:d.recurring?'mensual':'unico',status:'pendiente',formaCobro:'',fecha:'',otrosLabel:'',startMonth:S.month};
    var labelHtml='<div class="svc-label">'+d.label+'</div>';
    if(d.key==='otros'){
      labelHtml='<input class="otros-input" type="text" placeholder="Concepto personalizado…" value="'+esc(s.otrosLabel||'')+'" data-otros-label="'+c.id+'">';
    }
    var oneTimeBlock='';
    /* Los conceptos únicos usan el mismo estado y forma de cobro del cliente/mes; no necesitan selector propio. */
    return '<div class="svc-row">'+
      '<span class="dot" style="background:'+d.color+'"></span>'+
      '<div>'+labelHtml+oneTimeBlock+'</div>'+
      '<input class="price-input" type="number" min="0" step="0.01" placeholder="-" value="'+(Number(s.price)>0?s.price:'')+'" data-svc-price="'+c.id+'|'+d.key+'">'+
      '<div class="rec-wrap">'+
        '<div class="rec-toggle" title="Periodicidad del cobro">'+
          ['unico','mensual','anual'].map(function(pk){
            var currentPeriod=normalizeServicePeriod(s.period||'mensual');
            var shortLbl={unico:'Único',mensual:'Mensual',anual:'Anual'}[pk];
            return '<button type="button" class="'+(currentPeriod===pk?'on':'')+'" data-svc-rec="'+c.id+'|'+d.key+'|'+pk+'">'+shortLbl+'</button>';
          }).join('')+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');

  var rec=recTotalForMonth(c,S.month),oneT=oneTimeTotal(c,S.month);
  return '<div class="detail-grid">'+
    '<div>'+
      '<p class="detail-section-title">Servicios contratados <span style="font-weight:400;color:var(--text-faint);text-transform:none;letter-spacing:0;">· Click en precio para editar</span></p>'+
      '<div class="mini-note">Cobro habitual: <b>'+(defaultFormaCobro(c)||'sin definir')+'</b> · cambia solo si hay excepción.</div>'+
      '<div class="services-editor">'+svcsHtml+'</div>'+
    '</div>'+
    '<div>'+
      '<p class="detail-section-title">Vista rápida servicios activos</p>'+
      '<div style="display:flex;flex-direction:column;gap:6px;">'+
        (activeServices(c).length===0?'<p style="font-size:12.5px;color:var(--text-faint);">Sin servicios con precio configurado.</p>':
          activeServices(c).map(function(d){
            var s=c.services[d.key];
            var lbl=d.key==='otros'?(s.otrosLabel||'Otros'):d.label;
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--surface);border:1px solid var(--border);border-radius:8px;">'+
              '<div style="display:flex;align-items:center;gap:8px;">'+
                '<span class="dot" style="background:'+d.color+'"></span>'+
                '<span style="font-size:12.5px;font-weight:500;">'+esc(lbl)+'</span>'+
                '<span style="font-size:10.5px;color:var(--text-faint);font-family:var(--mono);">'+PERIOD_LABEL[s.period||'unico']+'</span>'+
              '</div>'+
              '<span style="font-family:var(--mono);font-size:13px;font-weight:600;">'+dispM(Number(s.price))+'</span>'+
            '</div>';
          }).join(''))+
      '</div>'+
      '<div class="totals-box side-total">'+
        (rec>0?'<div class="total-line"><span>Recurrente este mes</span><b>'+dispM(rec)+'</b></div>':'')+
        (oneT>0?'<div class="total-line"><span>Único este mes</span><b>'+dispM(oneT)+'</b></div>':'')+
        '<div class="total-line big"><span>Total</span><b>'+dispM(rec+oneT)+'</b></div>'+
        (S.showIva?'<div class="total-line" style="font-size:11px;color:var(--text-faint)"><span>Base imponible</span><b>'+fmtM(rec+oneT)+'</b></div>':'')+
      '</div>'+
    '</div>'+
  '</div>';
}

function renderTabHistorial(c){
  var hist=S.payments[c.id]||{},months=Object.keys(hist).sort().reverse();
  var actSvcs=activeServices(c);
  var histRows=months.map(function(mk){
    var p=hist[mk];var svcSt=p.serviceStatus||{};
    var svcPillsHtml=actSvcs.map(function(d){
      var st=svcSt[d.key]||(p?p.status:'sin');
      var lbl=d.key==='otros'?(c.services['otros'].otrosLabel||'Otros'):d.label;
      return '<button class="svc-pill '+st+'" data-hist-svc="'+c.id+'|'+mk+'|'+d.key+'" title="'+esc(lbl)+'">'+esc(lbl.slice(0,10))+'</button>';
    }).join('');
    return '<tr>'+
      '<td style="font-weight:500;white-space:nowrap;">'+monthLabel(mk)+'</td>'+
      '<td><input type="number" step="0.01" min="0" style="width:86px;text-align:right;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:4px 7px;font-size:12px;font-family:var(--mono);" placeholder="-" value="'+(Number(p.importe)>0?p.importe:'')+'" data-hist-importe="'+c.id+'|'+mk+'"></td>'+
      '<td><select class="st-sel '+p.status+'" data-hist-status="'+c.id+'|'+mk+'">'+Object.keys(STATUS_LABEL).map(function(s){return'<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select></td>'+
      '<td><select data-hist-forma="'+c.id+'|'+mk+'" title="Vacío = forma habitual del cliente" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:4px 7px;font-size:11.5px;"><option value="">Habitual'+(defaultFormaCobro(c)?' ('+esc(defaultFormaCobro(c))+')':'')+'</option>'+FORMA_COBRO.map(function(f){return'<option value="'+f+'"'+(p.formaCobro===f?' selected':'')+'>'+f+'</option>'}).join('')+'</select></td>'+
      '<td><input type="date" value="'+(p.fecha||'')+'" data-hist-fecha="'+c.id+'|'+mk+'" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:4px 7px;font-size:11.5px;"></td>'+
      '<td><div class="svc-pills">'+svcPillsHtml+'</div></td>'+
      '<td><input type="text" placeholder="Nota…" value="'+esc(p.notas||'')+'" data-hist-notas="'+c.id+'|'+mk+'" style="width:110px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:4px 7px;font-size:11.5px;"></td>'+
      '<td><button class="icon-btn" data-del-month="'+c.id+'|'+mk+'" title="Eliminar mes">✕</button></td>'+
    '</tr>';
  }).join('');
  return '<div>'+
    (months.length?
      '<div style="overflow:auto;max-height:340px;">'+
      '<table class="hist-table"><thead><tr><th>Mes</th><th>Importe</th><th>Estado</th><th>Forma cobro</th><th>Fecha pago</th><th>Por servicio</th><th>Nota</th><th></th></tr></thead>'+
      '<tbody>'+histRows+'</tbody></table></div>'
      :'<p style="font-size:12.5px;color:var(--text-faint);margin-bottom:12px;">Sin cobros registrados todavía. Los cobros recurrentes se generan automáticamente al entrar cada mes.</p>')+
    '<div class="add-row">'+
      '<span style="font-size:12px;color:var(--text-muted);">Añadir mes manualmente:</span>'+
      '<input type="month" class="month-pick" id="manMo-'+c.id+'">'+
      '<button class="btn btn-sm" data-add-month="'+c.id+'">+ Añadir mes</button>'+
    '</div>'+
  '</div>';
}

function renderTabNotas(c){
  return '<div class="detail-grid">'+
    '<div>'+
      '<p class="detail-section-title">Datos de contacto</p>'+
      '<div class="field-row">'+
        '<div class="field"><label>Razón social</label><input type="text" value="'+esc(c.razonSocial)+'" data-client-field="'+c.id+'|razonSocial"></div>'+
        '<div class="field"><label>Nombre comercial *</label><input type="text" value="'+esc(c.nombreComercial)+'" data-client-field="'+c.id+'|nombreComercial"></div>'+
      '</div>'+
      '<div class="field-row">'+
        '<div class="field"><label>Persona de contacto</label><input type="text" value="'+esc(c.contactoNombre||'')+'" data-client-field="'+c.id+'|contactoNombre" placeholder="Nombre…"></div>'+
        '<div class="field"><label>Responsable / comercial</label><input type="text" value="'+esc(responsableText(c))+'" data-client-field="'+c.id+'|responsable" placeholder="Comercial que lo vendió"></div>'+
      '</div>'+
      '<div class="field-row">'+
        '<div class="field"><label>Email de contacto</label><input type="email" value="'+esc(c.contactoEmail||'')+'" data-client-field="'+c.id+'|contactoEmail" placeholder="email@empresa.com"></div>'+
        '<div class="field"><label>Teléfono</label><input type="text" value="'+esc(c.contactoTel||'')+'" data-client-field="'+c.id+'|contactoTel" placeholder="6xx xxx xxx"></div>'+
      '</div>'+
      '<div class="field-row">'+
        '<div class="field"><label>Fecha de alta</label><input type="date" value="'+esc(c.fechaAlta||'')+'" data-client-field="'+c.id+'|fechaAlta"></div>'+
      '</div>'+
      '<div class="field-row">'+
        '<div class="field"><label>Forma de cobro habitual *</label><select data-client-field="'+c.id+'|formaCobro"><option value="">Sin definir</option>'+FORMA_COBRO.map(function(f){return '<option value="'+f+'"'+(c.formaCobro===f?' selected':'')+'>'+f+'</option>'}).join('')+'</select></div>'+
      '</div>'+
    '</div>'+
    '<div>'+
      '<p class="detail-section-title">Notas internas <span style="font-weight:400;color:var(--text-faint);text-transform:none;letter-spacing:0;">· Solo visible para el equipo</span></p>'+
      '<textarea class="notes-ta" rows="6" placeholder="Observaciones, acuerdos especiales, recordatorios\u2026" data-client-notes="'+c.id+'">'+esc(c.notas||'')+'</textarea>'+
    '</div>'+
  '</div>';
}

function renderUsersModal(){
  var rows=auth.users.map(function(u){
    u.role=normalizeUserRole(u);
    var canEdit=!(auth.current&&auth.current.email===u.email);
    var status=u.pendingActivation?'<span class="badge pendiente">Pendiente de activar</span>':'<span class="badge pagado">Activo</span>';
    var comercialInput='<input type="text" data-admin-commercial="'+esc(u.email)+'" value="'+esc(u.commercialName||'')+'" placeholder="Nombre comercial" '+(u.role==='comercial'&&canEdit?'':'disabled')+'>';
    return '<tr>'+
      '<td><b>'+esc(u.email)+'</b></td>'+ 
      '<td>'+status+'</td>'+ 
      '<td><select data-admin-role="'+esc(u.email)+'" '+(canEdit?'':'disabled')+'><option value="usuario"'+(u.role==='usuario'?' selected':'')+'>Usuario · solo consulta</option><option value="comercial"'+(u.role==='comercial'?' selected':'')+'>Comercial · puede editar</option><option value="admin"'+(u.role==='admin'?' selected':'')+'>Administrador</option></select></td>'+ 
      '<td>'+comercialInput+'</td>'+ 
      '<td style="text-align:right;white-space:nowrap;"><button class="btn btn-xs" data-admin-reactivate="'+esc(u.email)+'">Reactivar</button> '+(canEdit?'<button class="btn btn-xs btn-danger" data-admin-delete="'+esc(u.email)+'">Quitar</button>':'')+'</td>'+ 
    '</tr>';
  }).join('');
  var commRows=comercialesList().map(function(c){return '<tr><td>'+commercialBadge(c.name)+'</td><td><code style="font-size:11px;color:var(--text-faint)">'+esc(c.color)+'</code></td><td style="text-align:right"><button class="btn btn-xs btn-danger" data-commercial-remove="'+esc(c.name)+'">Quitar</button></td></tr>'}).join('');
  var ov=document.createElement('div');ov.className='overlay';ov.id='modalOverlay';
  ov.innerHTML='<div class="modal" style="max-width:920px;">'+
    '<button class="modal-close" data-action="close-modal">✕</button>'+
    '<h2>Usuarios y accesos</h2>'+ 
    '<div class="access-help">Tipos de acceso: <b>Usuario</b> solo consulta, <b>Comercial</b> puede editar clientes y cobros, <b>Administrador</b> gestiona usuarios, comerciales y accesos.</div>'+ 
    '<div class="field-row"><div class="field"><label>Email del usuario *</label><input type="email" id="u_email" placeholder="usuario@empresa.com"></div><div class="field"><label>Tipo de acceso</label><select id="u_role"><option value="usuario">Usuario · solo consulta</option><option value="comercial">Comercial · puede editar</option><option value="admin">Administrador</option></select></div><div class="field"><label>Nombre comercial</label><input type="text" id="u_commercial" placeholder="Ej. Jordi"></div></div>'+ 
    '<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-primary" data-action="create-user-access">Crear acceso</button></div>'+ 
    '<table class="access-table"><thead><tr><th>Email</th><th>Estado</th><th>Permisos</th><th>Comercial asociado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'+ 
    '<div style="margin-top:20px;border-top:1px solid var(--border-light);padding-top:14px;">'+
      '<h3 style="font-size:14px;margin:0 0 10px;">Comerciales</h3>'+ 
      '<div class="field-row"><div class="field"><label>Añadir comercial</label><input type="text" id="commercial_name" placeholder="Nombre"></div><div class="field"><label>Color</label><input type="text" id="commercial_color" placeholder="#2563EB"></div><div class="field" style="align-self:end"><button class="btn" data-action="create-commercial">Añadir comercial</button></div></div>'+ 
      '<table class="access-table"><thead><tr><th>Nombre</th><th>Color</th><th></th></tr></thead><tbody>'+commRows+'</tbody></table>'+ 
    '</div>'+ 
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;"><button class="btn" data-action="close-modal">Cerrar</button></div>'+ 
  '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov) closeModal()});
  setTimeout(function(){var inp=document.getElementById('u_email');if(inp) inp.focus()},50);
}

function renderDeletedModal(){
  var items=S.deletedClients||[];
  var rows=items.map(function(it,i){
    var c=it.client||{};
    var f=it.deletedAt?new Date(it.deletedAt).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
    return '<tr>'+ 
      '<td><b>'+esc(c.nombreComercial||c.razonSocial||'Cliente sin nombre')+'</b><div style="font-size:11px;color:var(--text-faint);">'+esc(c.razonSocial||'')+'</div></td>'+ 
      '<td>'+esc(responsableText(c)||'—')+'</td>'+ 
      '<td>'+f+'</td>'+ 
      '<td style="text-align:right;white-space:nowrap;"><button class="btn btn-xs" data-restore-deleted="'+i+'">Restaurar</button> <button class="btn btn-xs btn-danger" data-delete-forever="'+i+'">Borrar definitivo</button></td>'+ 
    '</tr>';
  }).join('');
  var ov=document.createElement('div');ov.className='overlay';ov.id='modalOverlay';
  ov.innerHTML='<div class="modal" style="max-width:820px;">'+
    '<button class="modal-close" data-action="close-modal">✕</button>'+ 
    '<h2>Clientes eliminados</h2>'+ 
    '<div class="access-help">Aquí quedan guardados los clientes eliminados junto con su histórico de cobros. Puedes restaurarlos si vuelven a hacer falta.</div>'+ 
    (items.length?'<table class="access-table"><thead><tr><th>Cliente</th><th>Comercial</th><th>Eliminado</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty-state" style="padding:32px 16px;"><h3>No hay clientes eliminados</h3><p>Cuando elimines un cliente, aparecerá aquí para poder restaurarlo.</p></div>')+
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;"><button class="btn" data-action="close-modal">Cerrar</button></div>'+ 
  '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov) closeModal()});
}

function renderModal(){
  if(S.modal&&S.modal.type==='users'){renderUsersModal();return}
  if(S.modal&&S.modal.type==='deleted'){renderDeletedModal();return}
  var ov=document.createElement('div');ov.className='overlay';ov.id='modalOverlay';
  ov.innerHTML='<div class="modal">'+
    '<button class="modal-close" data-action="close-modal">✕</button>'+ 
    '<h2>Nuevo cliente</h2>'+ 
    '<div class="field-row"><div class="field"><label>Razón social *</label><input type="text" id="m_razon" placeholder="Empresa S.L."></div><div class="field"><label>Nombre comercial *</label><input type="text" id="m_comercial" placeholder="Nombre corto o marca"></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Persona de contacto</label><input type="text" id="m_contacto" placeholder="Nombre y apellidos"></div><div class="field"><label>Email de contacto</label><input type="email" id="m_email" placeholder="email@empresa.com"></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Teléfono</label><input type="text" id="m_tel" placeholder="6xx xxx xxx"></div><div class="field"><label>Fecha de alta</label><input type="date" id="m_fecha" value="'+new Date().toISOString().slice(0,10)+'"></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Forma de cobro habitual *</label><select id="m_formaCobro"><option value="">Sin definir</option>'+FORMA_COBRO.map(function(f){return '<option value="'+f+'">'+f+'</option>'}).join('')+'</select></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Responsable / comercial *</label><select id="m_responsable"><option value="">Seleccionar comercial</option>'+comercialesList().map(function(c){return '<option value="'+esc(c.name)+'"'+(getLastResponsable()===c.name?' selected':'')+'>'+esc(c.name)+'</option>'}).join('')+'</select></div></div>'+ 
    '<p style="font-size:11.5px;color:var(--text-faint);margin:12px 0 0;">El día de cobro se define en cada factura, no en la ficha del cliente.</p>'+ 
    '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px;">'+
      '<button class="btn" data-action="close-modal">Cancelar</button>'+ 
      '<button class="btn btn-primary" data-action="save-client">Crear cliente</button>'+ 
    '</div>'+ 
  '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov) closeModal()});
  setTimeout(function(){var inp=document.getElementById('m_razon');if(inp) inp.focus()},50);
}

async function selectMonth(mk){
  S.month=mk;
  await autoGenerateMonth(S.month,true);
  computeAlerts();
  renderApp();
}

/* =============== EVENT BINDING =============== */
function bindEvents(){
  var r=root();
  var lb=document.getElementById('logoutBtn');if(lb) lb.addEventListener('click',doLogout);
  var si=document.getElementById('searchInput');
  if(si){si.addEventListener('input',function(e){S.search=e.target.value;renderApp()});if(S._sf){var l=si.value.length;si.focus();si.setSelectionRange(l,l)}}
  var mp=document.getElementById('monthPick');
  if(mp) mp.addEventListener('change',function(e){selectMonth(e.target.value)});
  r.querySelectorAll('[data-month-nav]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();selectMonth(shiftMonth(S.month,el.getAttribute('data-month-nav')==='prev'?-1:1))})});
  var iv=document.getElementById('ivaToggle');
  if(iv) iv.addEventListener('change',function(e){S.showIva=e.target.checked;renderApp()});
  var stf=document.getElementById('statusFilter');
  if(stf) stf.addEventListener('change',function(e){S.filterStatus=e.target.value;S.expanded=null;renderApp()});
  var sf=document.getElementById('svcFilter');
  if(sf) sf.addEventListener('change',function(e){S.filterSvc=e.target.value;S.expanded=null;renderApp()});
  var rf=document.getElementById('respFilter');
  if(rf) rf.addEventListener('change',function(e){S.filterResp=e.target.value;S.expanded=null;renderApp()});

  r.querySelectorAll('[data-filter]').forEach(function(el){el.addEventListener('click',function(){S.filterStatus=el.getAttribute('data-filter');renderApp()})});
  r.querySelectorAll('[data-sort]').forEach(function(el){el.addEventListener('click',function(){var k=el.getAttribute('data-sort');if(S.sortBy===k){S.sortDir=S.sortDir==='asc'?'desc':'asc'}else{S.sortBy=k;S.sortDir=(k==='importe')?'desc':'asc'}renderApp()})});
  r.querySelectorAll('[data-expand]').forEach(function(el){
    el.addEventListener('click',function(ev){
      var tg=ev.target;
      if(tg.tagName==='SELECT'||tg.tagName==='OPTION'||tg.tagName==='INPUT'||tg.tagName==='BUTTON') return;
      var id=el.getAttribute('data-expand');
      S.expanded=S.expanded===id?null:id;
      if(!S.expandedTab[id]) S.expandedTab[id]='servicios';
      renderApp();
    });
  });
  r.querySelectorAll('[data-dtab]').forEach(function(el){
    el.addEventListener('click',function(e){e.stopPropagation();var pts=el.getAttribute('data-dtab').split('|');S.expandedTab[pts[0]]=pts[1];renderApp()});
  });
  r.querySelectorAll('[data-month-status]').forEach(function(el){
    el.addEventListener('click',function(e){e.stopPropagation()});
    el.addEventListener('change',function(e){e.stopPropagation();setMonthlyStatus(el.getAttribute('data-month-status'),S.month,'status',el.value)});
  });
  r.querySelectorAll('[data-qp]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();quickPay(el.getAttribute('data-qp'))})});
  r.querySelectorAll('[data-svc-pill]').forEach(function(el){
    el.addEventListener('click',function(e){e.stopPropagation();
      var pts=el.getAttribute('data-svc-pill').split('|');
      var p=(S.payments[pts[0]]||{})[S.month];
      var cur=(p&&p.serviceStatus&&p.serviceStatus[pts[1]])||(p?p.status:'pendiente');
      var next=STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur)+1)%STATUS_CYCLE.length];
      setSvcMonthStatus(pts[0],S.month,pts[1],next);
    });
  });
  r.querySelectorAll('[data-svc-price]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-svc-price').split('|');updateSvcField(pts[0],pts[1],'price',parseFloat(el.value)||0)});
  });
  r.querySelectorAll('[data-svc-rec]').forEach(function(el){
    el.addEventListener('click',function(){var pts=el.getAttribute('data-svc-rec').split('|');updateSvcField(pts[0],pts[1],'period',pts[2])});
  });
  r.querySelectorAll('[data-svc-period]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-svc-period').split('|');updateSvcField(pts[0],pts[1],'period',el.value)});
  });
  r.querySelectorAll('[data-onetime-status]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-onetime-status').split('|');updateSvcField(pts[0],pts[1],'status',el.value)});
  });
  r.querySelectorAll('[data-onetime-forma]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-onetime-forma').split('|');updateSvcForma(pts[0],pts[1],el.value)});
  });
  r.querySelectorAll('[data-otros-label]').forEach(function(el){
    el.addEventListener('change',function(){updateSvcField(el.getAttribute('data-otros-label'),'otros','otrosLabel',el.value)});
  });
  r.querySelectorAll('[data-hist-status]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-hist-status').split('|');setMonthlyStatus(pts[0],pts[1],'status',el.value)});
  });
  r.querySelectorAll('[data-hist-svc]').forEach(function(el){
    el.addEventListener('click',function(e){e.stopPropagation();
      var pts=el.getAttribute('data-hist-svc').split('|');
      var p=(S.payments[pts[0]]||{})[pts[1]];
      var cur=(p&&p.serviceStatus&&p.serviceStatus[pts[2]])||(p?p.status:'pendiente');
      var next=STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur)+1)%STATUS_CYCLE.length];
      setSvcMonthStatus(pts[0],pts[1],pts[2],next);
    });
  });
  r.querySelectorAll('[data-hist-importe]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-hist-importe').split('|');setMonthlyStatus(pts[0],pts[1],'importe',parseFloat(el.value)||0)});
  });
  r.querySelectorAll('[data-hist-forma]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-hist-forma').split('|');setMonthlyStatus(pts[0],pts[1],'formaCobro',el.value)});
  });
  r.querySelectorAll('[data-hist-fecha]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-hist-fecha').split('|');setMonthlyStatus(pts[0],pts[1],'fecha',el.value)});
  });
  r.querySelectorAll('[data-hist-notas]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-hist-notas').split('|');setMonthlyStatus(pts[0],pts[1],'notas',el.value)});
  });
  r.querySelectorAll('[data-del-month]').forEach(function(el){
    el.addEventListener('click',function(){var pts=el.getAttribute('data-del-month').split('|');deleteMonth(pts[0],pts[1])});
  });
  r.querySelectorAll('[data-add-month]').forEach(function(el){
    el.addEventListener('click',function(){var id=el.getAttribute('data-add-month');var inp=document.getElementById('manMo-'+id);addManualMonth(id,inp?inp.value:'')});
  });
  r.querySelectorAll('[data-client-field]').forEach(function(el){
    el.addEventListener('change',function(){var pts=el.getAttribute('data-client-field').split('|');updateClientField(pts[0],pts[1],el.value)});
  });
  r.querySelectorAll('[data-client-notes]').forEach(function(el){
    el.addEventListener('change',function(){updateClientField(el.getAttribute('data-client-notes'),'notas',el.value)});
  });
  r.querySelectorAll('[data-action="toggle-active"]').forEach(function(el){el.addEventListener('click',function(){toggleActive(el.getAttribute('data-id'))})});
  r.querySelectorAll('[data-action="delete"]').forEach(function(el){el.addEventListener('click',function(){deleteClient(el.getAttribute('data-id'))})});
  r.querySelectorAll('[data-action="add"]').forEach(function(el){el.addEventListener('click',openAddModal)});
  r.querySelectorAll('[data-action="generate"]').forEach(function(el){el.addEventListener('click',function(){autoGenerateMonth(S.month,false).then(renderApp)})});
  r.querySelectorAll('[data-action="deleted-clients"]').forEach(function(el){el.addEventListener('click',openDeletedModal)});
  r.querySelectorAll('[data-action="retry"]').forEach(function(el){el.addEventListener('click',function(){loadData()})});
  r.querySelectorAll('[data-action="users-access"]').forEach(function(el){el.addEventListener('click',openUsersModal)});
  document.querySelectorAll('[data-action="create-user-access"]').forEach(function(el){el.addEventListener('click',function(){adminCreateUser(document.getElementById('u_email').value,document.getElementById('u_role').value,document.getElementById('u_commercial').value)})});
  document.querySelectorAll('[data-admin-role]').forEach(function(el){el.addEventListener('change',function(){var email=el.getAttribute('data-admin-role');var inp=document.querySelector('[data-admin-commercial="'+email+'"]');adminUpdateUserRole(email,el.value,inp?inp.value:'')})});
  document.querySelectorAll('[data-admin-commercial]').forEach(function(el){el.addEventListener('change',function(){var email=el.getAttribute('data-admin-commercial');var roleSel=document.querySelector('[data-admin-role="'+email+'"]');adminUpdateUserRole(email,roleSel?roleSel.value:'comercial',el.value)})});
  document.querySelectorAll('[data-action="create-commercial"]').forEach(function(el){el.addEventListener('click',async function(){var n=document.getElementById('commercial_name').value;var col=document.getElementById('commercial_color').value;if(addCommercial(n,col)){await saveComerciales();toast('Comercial añadido');renderApp()}else{toast('Introduce un nombre')}})});
  document.querySelectorAll('[data-commercial-remove]').forEach(function(el){el.addEventListener('click',async function(){var n=el.getAttribute('data-commercial-remove');S.comerciales=(S.comerciales||[]).filter(function(c){return c.name!==n});await saveComerciales();renderApp()})});
  document.querySelectorAll('[data-admin-reset]').forEach(function(el){el.addEventListener('click',function(){var email=el.getAttribute('data-admin-reset');var inp=document.querySelector('[data-admin-pass="'+email+'"]');adminResetPassword(email,inp?inp.value:'')})});
  document.querySelectorAll('[data-admin-reactivate]').forEach(function(el){el.addEventListener('click',function(){adminReactivateUser(el.getAttribute('data-admin-reactivate'))})});
  document.querySelectorAll('[data-admin-delete]').forEach(function(el){el.addEventListener('click',function(){adminDeleteUser(el.getAttribute('data-admin-delete'))})});
  document.querySelectorAll('[data-restore-deleted]').forEach(function(el){el.addEventListener('click',function(){restoreDeletedClient(el.getAttribute('data-restore-deleted'))})});
  document.querySelectorAll('[data-delete-forever]').forEach(function(el){el.addEventListener('click',function(){removeDeletedForever(el.getAttribute('data-delete-forever'))})});
  document.querySelectorAll('[data-action="close-modal"]').forEach(function(el){el.addEventListener('click',closeModal)});
  var sv=document.querySelector('[data-action="save-client"]');
  if(sv) sv.addEventListener('click',function(){
    var razon=document.getElementById('m_razon').value.trim();
    var comercial=document.getElementById('m_comercial').value.trim();
    var responsable=document.getElementById('m_responsable').value.trim();
    var formaCobro=document.getElementById('m_formaCobro').value;
    if(!razon||!comercial||!responsable||!formaCobro){toast('Rellena los campos obligatorios marcados con *');return}
    createClient({razon:razon,comercial:comercial,responsable:responsable,contacto:document.getElementById('m_contacto').value,email:document.getElementById('m_email').value,tel:document.getElementById('m_tel').value,fecha:document.getElementById('m_fecha').value,formaCobro:formaCobro});
  });
}



