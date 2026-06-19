"use strict";

/* =============== V32: packs de varios servicios en una factura =============== */
function invoiceServiceKeys(inv){
  if(inv&&Array.isArray(inv.serviceKeys)&&inv.serviceKeys.length) return inv.serviceKeys;
  if(inv&&Array.isArray(inv.packItems)&&inv.packItems.length) return inv.packItems.map(function(x){return x.serviceKey}).filter(Boolean);
  return inv&&inv.serviceKey?[inv.serviceKey]:[];
}
function invoiceMatchesService(inv,key){return invoiceServiceKeys(inv).indexOf(key)!==-1 || inv.serviceKey===key}
function invoiceFilteredAmount(inv){
  if(S.filterSvc==='todos') return invoiceAmount(inv);
  var key=S.filterSvc.replace('svc_','');
  if(!invoiceMatchesService(inv,key)) return 0;
  if(inv.packItems&&inv.packPriceMode==='individual'){
    return inv.packItems.filter(function(x){return x.serviceKey===key}).reduce(function(s,x){return s+(Number(x.amount)||0)},0);
  }
  return invoiceAmount(inv);
}
function packServiceLabels(inv){
  return invoiceServiceKeys(inv).map(function(k){var d=serviceDefByKey(k);return d?d.label:k}).filter(Boolean);
}
invoiceServiceLabel=function(inv){
  if(inv&&Array.isArray(inv.serviceKeys)&&inv.serviceKeys.length>1){
    return inv.concept || ('Pack: '+packServiceLabels(inv).join(' + '));
  }
  var d=serviceDefByKey(inv.serviceKey);return inv.concept||inv.serviceLabel||(d?d.label:'Otro');
};
filteredInvoices=function(){
  var q=(S.search||'').trim().toLowerCase(),mk=S.month;
  return (S.invoices||[]).filter(function(inv){
    var c=invoiceClient(inv);
    if(invoiceMonth(inv)!==mk) return false;
    if(q){
      var hay=(c.nombreComercial+' '+c.razonSocial+' '+invoiceServiceLabel(inv)+' '+packServiceLabels(inv).join(' ')+' '+(inv.description||'')+' '+invoiceComercial(inv)).toLowerCase();
      if(hay.indexOf(q)===-1) return false;
    }
    if(S.filterResp!=='todos'&&invoiceComercial(inv)!==S.filterResp) return false;
    if(S.filterStatus!=='all'){
      if(S.filterStatus==='sin') return false;
      if(invoiceStatus(inv)!==S.filterStatus) return false;
    }
    if(S.filterSvc!=='todos'){
      var key=S.filterSvc.replace('svc_','');
      if(!invoiceMatchesService(inv,key)) return false;
    }
    return true;
  }).sort(function(a,b){
    if(S.sortBy==='cliente') return (invoiceClient(a).nombreComercial||'').localeCompare(invoiceClient(b).nombreComercial||'');
    if(S.sortBy==='comercial') return invoiceComercial(a).localeCompare(invoiceComercial(b));
    if(S.sortBy==='dia') return (invoiceDueDate(a)||'').localeCompare(invoiceDueDate(b)||'');
    if(S.sortBy==='servicio') return invoiceServiceLabel(a).localeCompare(invoiceServiceLabel(b));
    if(S.sortBy==='importe') return invoiceFilteredAmount(b)-invoiceFilteredAmount(a);
    var order={facturaEnviada:0,pendiente:1,pagado:2,cancelado:3};
    return (order[invoiceStatus(a)]||9)-(order[invoiceStatus(b)]||9);
  });
};
totalFilteredInvoices=function(){return filteredInvoices().reduce(function(s,inv){return s+invoiceFilteredAmount(inv)},0)};

function packOptionHtml(d){return '<label class="pack-check"><input type="checkbox" value="'+d.key+'" data-pack-service> '+esc(d.label)+'</label>'}
renderInvoiceModal=function(){
  var today=new Date().toISOString().slice(0,10), mk=S.month;
  var clientOptions=S.clients.filter(function(c){return c.active}).map(function(c){var label=(c.nombreComercial||c.razonSocial||'')+(c.razonSocial&&c.nombreComercial&&c.razonSocial!==c.nombreComercial?' · '+c.razonSocial:'');return '<option value="'+esc(label)+'" data-id="'+c.id+'"></option>'}).join('');
  var svcOptions=SVC_DEFS.map(function(d){return '<option value="'+d.key+'">'+esc(d.label)+'</option>'}).join('');
  var packChecks=SVC_DEFS.map(packOptionHtml).join('');
  var formaOpts=FORMA_COBRO.map(function(f){return '<option value="'+esc(f)+'">'+esc(f)+'</option>'}).join('');
  return '<div class="field-row"><div class="field"><label>Cliente *</label><div class="client-search-wrap"><input id="f_client_search" class="client-search-input" type="text" list="clientList" placeholder="Buscar cliente…" autocomplete="off"><input type="hidden" id="f_client"><datalist id="clientList">'+clientOptions+'</datalist><div class="client-search-help">Escribe y selecciona el cliente de la lista.</div></div></div><div class="field"><label>Tipo de servicio *</label><div class="service-mode-choice"><button type="button" class="on" data-service-mode="single">Un servicio</button><button type="button" data-service-mode="pack">Pack varios</button></div><input type="hidden" id="f_service_mode" value="single"></div></div>'+ 
    '<div id="f_single_service_wrap" class="field-row"><div class="field"><label>Servicio / concepto *</label><select id="f_service">'+svcOptions+'</select></div><div class="field"><label>Descripción</label><input id="f_desc" type="text" placeholder="Ej. Web corporativa"></div></div>'+ 
    '<div id="f_pack_wrap" class="pack-wrap"><div class="split-title">Servicios incluidos en el pack</div><div class="pack-grid">'+packChecks+'</div><div class="split-title">Precio del pack</div><div class="pack-pricing-choice"><button type="button" class="on" data-pack-price-mode="total">Precio total del pack</button><button type="button" data-pack-price-mode="individual">Precio por servicio</button></div><input type="hidden" id="f_pack_price_mode" value="total"><div id="f_pack_items_prices" class="pack-items-prices"></div><div class="pack-note">Si eliges precio total, la factura se cobra como un único pack. Si eliges precio por servicio, el total se calcula automáticamente con cada concepto.</div></div>'+ 
    '<div class="field-row"><div class="field"><label>Descripción</label><input id="f_pack_desc" type="text" placeholder="Ej. Pack web + SEO"></div><div class="field"><label>Importe total *</label><div class="money-input-wrap"><input id="f_amount" type="number" step="0.01" placeholder="-"><span class="money-suffix">€</span></div></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Fecha factura</label><input id="f_issue" type="date" value="'+today+'"></div><div class="field"><label>Vencimiento / fecha cobro *</label><input id="f_due" type="date" value="'+mkDate(mk,10)+'"></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Estado</label><select id="f_status"><option value="pendiente">Pendiente fra.</option><option value="facturaEnviada">Factura enviada</option><option value="pagado">Pagado</option><option value="cancelado">Cancelado</option></select></div><div class="field"><label>Forma pago</label><select id="f_forma"><option value="">La habitual del cliente</option>'+formaOpts+'</select></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Tipo de cobro</label><div class="period-choice"><button type="button" class="period-btn on" data-f-period="unico">Único</button><button type="button" class="period-btn" data-f-period="mensual">Mensual</button><button type="button" class="period-btn" data-f-period="anual">Anual</button><button type="button" class="period-btn" data-f-period="fraccionado">Fraccionado</button></div><input type="hidden" id="f_period" value="unico"></div></div>'+ 
    '<div id="f_split_wrap" class="split-wrap"><div class="split-head"><span class="split-title">Pagos fraccionados</span><div class="split-presets"><button type="button" class="split-preset on" data-split-preset="50_50">50/50</button><button type="button" class="split-preset" data-split-preset="40_30_30">40/30/30</button><button type="button" class="split-preset" data-split-add="1">+ Fase</button></div></div><div id="f_split_rows"></div><div class="split-note">Se crearán varias facturas vinculadas al mismo proyecto, cada una con su vencimiento y estado.</div></div>'+ 
    '<div class="detail-footer"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-invoice">Guardar factura</button></div>';
};

function selectedPackKeys(){return [].slice.call(document.querySelectorAll('[data-pack-service]:checked')).map(function(x){return x.value})}
function setServiceMode(mode){
  var hidden=document.getElementById('f_service_mode');if(hidden)hidden.value=mode;
  document.querySelectorAll('[data-service-mode]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-service-mode')===mode)});
  var sw=document.getElementById('f_single_service_wrap'), pw=document.getElementById('f_pack_wrap');
  if(sw)sw.style.display=mode==='pack'?'none':'flex';
  if(pw)pw.classList.toggle('show',mode==='pack');
  syncPackPrices();
}
function setPackPriceMode(mode){
  var hidden=document.getElementById('f_pack_price_mode');if(hidden)hidden.value=mode;
  document.querySelectorAll('[data-pack-price-mode]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-pack-price-mode')===mode)});
  var prices=document.getElementById('f_pack_items_prices');if(prices)prices.classList.toggle('show',mode==='individual');
  var amount=document.getElementById('f_amount');if(amount){amount.readOnly=(mode==='individual'&&((document.getElementById('f_service_mode')||{}).value==='pack'));}
  syncPackPrices();
}
function syncPackPrices(){
  var wrap=document.getElementById('f_pack_items_prices');if(!wrap)return;
  var keys=selectedPackKeys();
  wrap.innerHTML=keys.map(function(k){var d=serviceDefByKey(k);return '<div class="pack-item-price"><span>'+esc(d.label)+'</span><input type="number" step="0.01" placeholder="-" data-pack-item-amount="'+k+'"></div>'}).join('');
  bindPackItemAmounts();
  recalcPackAmount();
}
function recalcPackAmount(){
  var mode=(document.getElementById('f_pack_price_mode')||{}).value||'total';
  var serviceMode=(document.getElementById('f_service_mode')||{}).value||'single';
  if(serviceMode!=='pack'||mode!=='individual')return;
  var total=0;document.querySelectorAll('[data-pack-item-amount]').forEach(function(inp){total+=parseFloat(inp.value)||0});
  var amount=document.getElementById('f_amount');if(amount)amount.value=total?total.toFixed(2):'';
  recalcSplitAmounts();
}
function bindPackItemAmounts(){document.querySelectorAll('[data-pack-item-amount]').forEach(function(inp){if(inp._bound)return;inp._bound=true;inp.addEventListener('input',recalcPackAmount)})}
function collectPackData(){
  var mode=(document.getElementById('f_service_mode')||{}).value||'single';
  if(mode!=='pack')return null;
  var keys=selectedPackKeys();
  var priceMode=(document.getElementById('f_pack_price_mode')||{}).value||'total';
  var items=keys.map(function(k){var d=serviceDefByKey(k);var inp=document.querySelector('[data-pack-item-amount="'+k+'"]');return {serviceKey:k,label:d.label,amount:priceMode==='individual'?(parseFloat(inp&&inp.value)||0):0}});
  return {keys:keys,priceMode:priceMode,items:items};
}

createInvoiceFromModal=async function(){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var cid=resolveInvoiceClientId(), due=document.getElementById('f_due').value, serviceMode=(document.getElementById('f_service_mode')||{}).value||'single';
  var svc=document.getElementById('f_service')?document.getElementById('f_service').value:'';
  var amount=parseFloat(document.getElementById('f_amount').value)||0;
  var pack=collectPackData();
  if(serviceMode==='pack'){
    if(!pack||!pack.keys.length){toast('Selecciona al menos un servicio para el pack');return}
    if(pack.priceMode==='individual'){
      amount=pack.items.reduce(function(s,x){return s+(Number(x.amount)||0)},0);
      if(!amount){toast('Indica el importe de cada servicio del pack');return}
    }
  }
  if(!cid||(!svc&&serviceMode!=='pack')||!amount||!due){toast('Selecciona un cliente y rellena servicio, importe y vencimiento');return}
  var c=getClient(cid), d=serviceDefByKey(svc), period=document.getElementById('f_period').value||'unico';
  var labels=serviceMode==='pack'?pack.items.map(function(x){return x.label}):[d.label];
  var concept=serviceMode==='pack'?('Pack: '+labels.join(' + ')):d.label;
  var desc=(serviceMode==='pack'?(document.getElementById('f_pack_desc').value||''):(document.getElementById('f_desc').value||''));
  var base={clientId:cid,serviceKey:serviceMode==='pack'?'pack':svc,serviceKeys:serviceMode==='pack'?pack.keys:[svc],packPriceMode:serviceMode==='pack'?pack.priceMode:'',packItems:serviceMode==='pack'?pack.items:[],concept:concept,description:desc,issueDate:document.getElementById('f_issue').value||'',status:document.getElementById('f_status').value||'pendiente',formaCobro:document.getElementById('f_forma').value||defaultFormaCobro(c),responsable:responsableText(c),createdAt:new Date().toISOString()};
  S.invoices=S.invoices||[];
  if(period==='fraccionado'){
    var rows=[].slice.call(document.querySelectorAll('.split-row'));
    if(!rows.length){toast('Añade al menos una fase de pago');return}
    var group='g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), created=[];
    for(var i=0;i<rows.length;i++){
      var row=rows[i], label=(row.querySelector('.split-label')||{}).value||('Fase '+(i+1));
      var pct=parseFloat((row.querySelector('.split-pct')||{}).value)||0;
      var partAmount=parseFloat((row.querySelector('.split-amount')||{}).value)||0;
      var partDue=(row.querySelector('.split-due')||{}).value||due;
      if(!partAmount&&pct) partAmount=amount*pct/100;
      if(!partAmount||!partDue){toast('Revisa importes y vencimientos de las fases');return}
      created.push(Object.assign({},base,{id:invoiceId(),concept:concept+' · '+label,amount:Math.round(partAmount*100)/100,period:'unico',month:monthFromDate(partDue)||S.month,dueDate:partDue,splitGroupId:group,splitIndex:i+1,splitTotal:rows.length,projectTotal:amount}));
    }
    created.forEach(function(inv){S.invoices.push(inv)});
    S.month=created[0].month;
  } else {
    var inv=Object.assign({},base,{id:invoiceId(),amount:amount,period:period,month:monthFromDate(due)||S.month,dueDate:due});
    S.invoices.push(inv);S.month=inv.month;
  }
  await saveInvoices();closeModal();renderApp();
};

var _ovV32BindEvents=bindEvents;
bindEvents=function(){
  _ovV32BindEvents();
  document.querySelectorAll('[data-service-mode]').forEach(function(el){if(el._boundV32)return;el._boundV32=true;el.addEventListener('click',function(){setServiceMode(el.getAttribute('data-service-mode'))})});
  document.querySelectorAll('[data-pack-price-mode]').forEach(function(el){if(el._boundV32)return;el._boundV32=true;el.addEventListener('click',function(){setPackPriceMode(el.getAttribute('data-pack-price-mode'))})});
  document.querySelectorAll('[data-pack-service]').forEach(function(el){if(el._boundV32)return;el._boundV32=true;el.addEventListener('change',syncPackPrices)});
  var amount=document.getElementById('f_amount');if(amount&&!amount._boundPack){amount._boundPack=true;amount.addEventListener('input',function(){recalcSplitAmounts()})}
  ['m_razon','m_comercial'].forEach(function(id){var inp=document.getElementById(id);if(inp&&!inp._upperBound){inp._upperBound=true;inp.addEventListener('blur',function(){inp.value=normalizeClientName(inp.value)})}});
};


/* =============== V33: no borrar formularios durante refresco automático =============== */
var _ovV33LoadData=loadData;
loadData=async function(silent){
  var active=document.activeElement;
  var editingModal=!!(S.modal||document.getElementById('modalOverlay')||(active&&active.closest&&active.closest('.modal')));
  if(silent&&editingModal){
    /* Se mantiene la copia de seguridad, pero no se re-renderiza mientras se crea/edita. */
    try{createAutoBackup&&createAutoBackup();}catch(e){}
    return;
  }
  return _ovV33LoadData(silent);
};


/* =============== V35: generar facturas recurrentes al cambiar de mes =============== */
function invoiceTemplateStartMonth(inv){return inv.startMonth||invoiceMonth(inv)||monthFromDate(inv.dueDate)||monthFromDate(inv.issueDate)||S.month||curMonthKey()}
function recurringInvoiceRootId(inv){return inv.recurrenceRootId||inv.sourceInvoiceId||inv.id}
function isInvoiceRecurringTemplate(inv){
  var p=normalizeServicePeriod(inv.period||'unico');
  /* Solo las facturas creadas manualmente actúan como plantilla. Las generadas llevan originKey. */
  return (p==='mensual'||p==='anual') && !inv.originKey;
}
function isRecurringInvoiceDueInMonth(inv,mk){
  var p=normalizeServicePeriod(inv.period||'unico');
  var start=invoiceTemplateStartMonth(inv);
  if(!start||mk<start) return false;
  if(p==='mensual') return true;
  if(p==='anual') return mk.slice(5,7)===start.slice(5,7);
  return false;
}
function cloneRecurringInvoiceForMonth(inv,mk){
  var root=recurringInvoiceRootId(inv);
  var dueDay=(invoiceDueDate(inv).match(/-(\d{2})$/)||[])[1]||'01';
  var issueDay=(invoiceIssueDate(inv).match(/-(\d{2})$/)||[])[1]||'01';
  var due=mkDate(mk,dueDay), issue=mkDate(mk,issueDay);
  var copy=Object.assign({},inv);
  copy.id=invoiceId();
  copy.originKey='invoice|'+root+'|'+mk;
  copy.recurrenceRootId=root;
  copy.month=mk;
  copy.issueDate=issue;
  copy.dueDate=due;
  copy.status='pendiente';
  copy.fechaPago='';
  copy.paidAt='';
  copy.createdAt=new Date().toISOString();
  return copy;
}
async function autoGenerateRecurringInvoicesForMonth(mk){
  if(!S.invoices) S.invoices=[];
  normalizeInvoices();
  var created=0;
  var templates=(S.invoices||[]).filter(isInvoiceRecurringTemplate);
  templates.forEach(function(inv){
    if(!isRecurringInvoiceDueInMonth(inv,mk)) return;
    var root=recurringInvoiceRootId(inv);
    var origin='invoice|'+root+'|'+mk;
    /* Si es el mes de la factura original, no duplicamos: la factura original ya existe. */
    if(invoiceMonth(inv)===mk) return;
    if((S.invoices||[]).some(function(x){return x.originKey===origin || (recurringInvoiceRootId(x)===root && invoiceMonth(x)===mk && x.id!==inv.id)})) return;
    S.invoices.push(cloneRecurringInvoiceForMonth(inv,mk));
    created++;
  });
  if(created>0) await saveInvoices();
  return created;
}

var _ovV35AutoGenerateInvoicesForMonth=autoGenerateInvoicesForMonth;
autoGenerateInvoicesForMonth=async function(mk){
  await _ovV35AutoGenerateInvoicesForMonth(mk); /* servicios recurrentes de la ficha del cliente */
  await autoGenerateRecurringInvoicesForMonth(mk); /* facturas recurrentes creadas desde Nueva factura */
};

var _ovV35SelectMonth=selectMonth;
selectMonth=async function(mk){
  S.month=mk;
  await autoGenerateMonth(S.month,true);
  if(typeof autoGenerateInvoicesForMonth==='function') await autoGenerateInvoicesForMonth(S.month);
  computeAlerts();
  renderApp();
};


/* =============== V36: edición rápida de facturas + baja próximo mes =============== */
(function(){
  var st=document.createElement('style');
  st.textContent=`
    .invoice-edit-row td{padding:0!important;background:var(--surface-2);border-bottom:1px solid var(--border)}
    .invoice-quick-edit{padding:14px 18px;display:grid;grid-template-columns:1.15fr .7fr .8fr .8fr 1fr auto;gap:10px;align-items:end;border-top:1px solid var(--border-light)}
    .invoice-quick-edit .field{min-width:0;margin:0}
    .invoice-quick-edit .field label{font-size:9.5px;margin-bottom:4px;color:var(--text-faint)}
    .invoice-quick-edit input,.invoice-quick-edit select{height:36px;background:#fff;border:1.5px solid var(--border);border-radius:8px;color:var(--text);padding:7px 10px;font-size:12.5px;width:100%}
    .invoice-quick-edit input:focus,.invoice-quick-edit select:focus{border-color:var(--accent);outline:none}
    .invoice-actions-mini{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
    .btn-warning-soft{background:var(--amber-bg);border-color:var(--amber-b);color:var(--amber)}
    .btn-muted-soft{background:var(--surface);border-color:var(--border);color:var(--text-muted)}
    .recurrence-note{grid-column:1/-1;font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:8px;margin-top:-2px}
    .recurrence-note input{width:auto;height:auto}
    .invoice-row.open{background:var(--surface-2)}
    @media(max-width:1050px){.invoice-quick-edit{grid-template-columns:1fr 1fr}.invoice-actions-mini{justify-content:flex-start}.recurrence-note{grid-column:1/-1}}
  `;
  document.head.appendChild(st);
})();

function invoiceIsRecurring(inv){
  var p=normalizeServicePeriod(inv.period||'unico');
  return p==='mensual'||p==='anual'||!!inv.originKey||!!inv.recurrenceRootId;
}
function invoiceRootMatch(inv,root){
  return inv&&root&&(inv.id===root||inv.recurrenceRootId===root||inv.sourceInvoiceId===root||(inv.originKey&&String(inv.originKey).indexOf('|'+root+'|')>-1));
}
function parseClientServiceOrigin(inv){
  if(!inv||!inv.originKey) return null;
  var parts=String(inv.originKey).split('|');
  if(parts.length===3 && parts[0]!=='invoice') return {clientId:parts[0],serviceKey:parts[1],month:parts[2]};
  return null;
}
function invoiceRecurringStopped(inv,mk){
  var stop=inv&&inv.cancelAfterMonth;
  return !!(stop&&mk>stop);
}
function invoiceQuickEditHtml(inv){
  var statusOpts=Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(invoiceStatus(inv)===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('');
  var formaOpts='<option value="">Habitual del cliente</option>'+FORMA_COBRO.map(function(f){return '<option value="'+esc(f)+'"'+(invoiceForma(inv)===f?' selected':'')+'>'+esc(f)+'</option>'}).join('');
  var rec=invoiceIsRecurring(inv);
  return '<tr class="invoice-edit-row"><td colspan="7"><div class="invoice-quick-edit" data-invoice-edit-box="'+esc(inv.id)+'">'+
    '<div class="field"><label>Concepto</label><input type="text" data-edit-concept="'+esc(inv.id)+'" value="'+esc(invoiceServiceLabel(inv))+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Importe</label><input type="number" step="0.01" data-edit-amount="'+esc(inv.id)+'" value="'+esc(invoiceAmount(inv)||'')+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Vencimiento</label><input type="date" data-edit-due="'+esc(inv.id)+'" value="'+esc(invoiceDueDate(inv))+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Estado</label><select data-edit-status="'+esc(inv.id)+'" '+disabledIfNoEdit()+'>'+statusOpts+'</select></div>'+ 
    '<div class="field"><label>Forma pago</label><select data-edit-forma="'+esc(inv.id)+'" '+disabledIfNoEdit()+'>'+formaOpts+'</select></div>'+ 
    '<div class="invoice-actions-mini">'+
      (canEditInvoices()?'<button class="btn btn-sm btn-success" data-save-invoice-quick="'+esc(inv.id)+'">Guardar</button>':'')+
      (canEditInvoices()?'<button class="btn btn-sm btn-warning-soft" data-cancel-current-invoice="'+esc(inv.id)+'">Cancelar actual</button>':'')+
      (canEditInvoices()&&rec?'<button class="btn btn-sm btn-muted-soft" data-stop-next-invoice="'+esc(inv.id)+'">Dar de baja próximo mes</button>':'')+
    '</div>'+ 
  '</div></td></tr>';
}

renderInvoiceRow=function(inv){
  var c=invoiceClient(inv), st=invoiceStatus(inv), keys=invoiceServiceKeys(inv), d=serviceDefByKey(keys[0]||inv.serviceKey), col=d?d.color:'#6B7280';
  var statusSel='<select class="st-sel '+st+'" data-invoice-status="'+inv.id+'"'+disabledIfNoEdit()+'>'+Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(st===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select>';
  var ns=nextInvoiceStatus(st), act=(st==='pagado')?'<span style="font-size:11.5px;color:var(--green);font-weight:700;">✓ Pagado</span>':(canEditInvoices()?'<button class="qp-btn next-'+ns+'" data-invoice-next="'+inv.id+'">'+STATUS_LABEL[ns]+'</button>':'<span style="font-size:11px;color:var(--text-faint);">Solo consulta</span>');
  var open=S.expandedInvoice===inv.id;
  var stopped=inv.cancelAfterMonth?'<div class="comercial" style="color:var(--red);font-weight:600;">Baja desde '+esc(monthLabel(shiftMonth(inv.cancelAfterMonth,1)))+'</div>':'';
  return '<tr class="cr invoice-row '+(open?'open':'')+'" data-invoice-row="'+esc(inv.id)+'" data-open-client="'+esc(inv.clientId||'')+'">'+
    '<td><div class="client-main">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div><div class="client-sub">'+esc((c.razonSocial||'').toUpperCase())+'</div></td>'+ 
    '<td><span class="svc-dot" style="background:'+col+'"></span><b>'+esc(invoiceServiceLabel(inv))+'</b>'+(inv.description?'<div class="comercial">'+esc(inv.description)+'</div>':'')+stopped+'</td>'+ 
    '<td>'+commercialBadge(invoiceComercial(inv))+'</td>'+ 
    '<td>'+esc(invoiceDueDate(inv)||'—')+'</td>'+ 
    '<td class="money-cell">'+dispM(invoiceAmount(inv))+'</td>'+ 
    '<td>'+esc(invoiceForma(inv)||'—')+'</td>'+ 
    '<td>'+statusSel+'</td>'+ 
    '<td style="text-align:right">'+act+'</td>'+ 
  '</tr>'+(open?invoiceQuickEditHtml(inv):'');
};

async function saveInvoiceQuick(id){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var inv=(S.invoices||[]).find(function(x){return x.id===id});if(!inv)return;
  var concept=document.querySelector('[data-edit-concept="'+CSS.escape(id)+'"]');
  var amount=document.querySelector('[data-edit-amount="'+CSS.escape(id)+'"]');
  var due=document.querySelector('[data-edit-due="'+CSS.escape(id)+'"]');
  var status=document.querySelector('[data-edit-status="'+CSS.escape(id)+'"]');
  var forma=document.querySelector('[data-edit-forma="'+CSS.escape(id)+'"]');
  if(concept) inv.concept=concept.value||invoiceServiceLabel(inv);
  if(amount) inv.amount=parseFloat(amount.value)||0;
  if(due&&due.value){inv.dueDate=due.value;inv.month=monthFromDate(due.value)||inv.month;}
  if(status) inv.status=status.value;
  if(forma) inv.formaCobro=forma.value;
  if(inv.status==='pagado'&&!inv.paidDate) inv.paidDate=new Date().toISOString().slice(0,10);
  if(invoiceIsRecurring(inv)){
    applyInvoiceChangesToFuture(inv);
  }
  await saveInvoices();renderApp();
}
function applyInvoiceChangesToFuture(inv){
  var root=recurringInvoiceRootId(inv);
  var dueDay=(invoiceDueDate(inv).match(/-(\d{2})$/)||[])[1];
  (S.invoices||[]).forEach(function(x){
    if(!invoiceRootMatch(x,root)) return;
    if(invoiceMonth(x)<invoiceMonth(inv)) return;
    x.amount=invoiceAmount(inv);
    x.formaCobro=inv.formaCobro||'';
    x.concept=inv.concept;
    if(dueDay&&invoiceDueDate(x)) x.dueDate=mkDate(invoiceMonth(x),dueDay);
  });
}
async function cancelCurrentInvoice(id){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var inv=(S.invoices||[]).find(function(x){return x.id===id});if(!inv)return;
  inv.status='cancelado';
  await saveInvoices();renderApp();
}
async function stopInvoiceNextMonth(id){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var inv=(S.invoices||[]).find(function(x){return x.id===id});if(!inv)return;
  var stopMonth=invoiceMonth(inv);
  var svcOrigin=parseClientServiceOrigin(inv);
  if(svcOrigin){
    var c=getClient(svcOrigin.clientId);
    if(c&&c.services&&c.services[svcOrigin.serviceKey]){
      c.services[svcOrigin.serviceKey].cancelAfterMonth=stopMonth;
      c.services[svcOrigin.serviceKey].active=false;
      c.services[svcOrigin.serviceKey].cancelReason='Baja desde próximo mes';
      saveClients&&saveClients();
    }
  }
  var root=recurringInvoiceRootId(inv);
  (S.invoices||[]).forEach(function(x){if(invoiceRootMatch(x,root)) x.cancelAfterMonth=stopMonth;});
  inv.cancelAfterMonth=stopMonth;
  await saveInvoices();renderApp();
}

async function autoGenerateInvoicesForMonth(mk){
  if(!S.invoices) S.invoices=[];
  normalizeInvoices();
  var created=0;
  S.clients.forEach(function(c){
    if(!c.active||!c.services) return;
    Object.keys(c.services).forEach(function(k){
      var sv=c.services[k];
      if(!sv||!Number(sv.price)) return;
      if(sv.cancelAfterMonth&&mk>sv.cancelAfterMonth) return;
      var period=normalizeServicePeriod(sv.period||'mensual');
      var start=serviceStartMonth(c,sv);
      var due=false;
      if(period==='mensual') due=(mk>=start);
      else if(period==='anual') due=(mk>=start && mk.slice(5,7)===clientAltaMonth(c).slice(5,7));
      else if(period==='unico') due=(mk===start);
      if(!due) return;
      var origin=invoiceRecurringKey(c.id,k,mk);
      if(S.invoices.some(function(inv){return inv.originKey===origin})) return;
      var d=serviceDefByKey(k);
      var day=sv.cobroDia||c.cobroDia||1;
      S.invoices.push({
        id:invoiceId(),originKey:origin,clientId:c.id,serviceKey:k,serviceKeys:[k],
        concept:(k==='otros'?(sv.otrosLabel||'Otros'):d.label),description:'',amount:Number(sv.price)||0,period:period,month:mk,
        issueDate:mkDate(mk,1),dueDate:mkDate(mk,day),status:'pendiente',formaCobro:sv.formaCobro||c.formaCobro||'',
        responsable:responsableText(c),createdAt:new Date().toISOString()
      });
      created++;
    });
  });
  await autoGenerateRecurringInvoicesForMonth(mk);
  if(created>0) await saveInvoices();
}

isRecurringInvoiceDueInMonth=function(inv,mk){
  var p=normalizeServicePeriod(inv.period||'unico');
  var start=invoiceTemplateStartMonth(inv);
  if(!start||mk<start) return false;
  if(invoiceRecurringStopped(inv,mk)) return false;
  if(p==='mensual') return true;
  if(p==='anual') return mk.slice(5,7)===start.slice(5,7);
  return false;
};

var _ovV36BindEvents=bindEvents;
bindEvents=function(){
  _ovV36BindEvents();
  var r=root();
  r.querySelectorAll('[data-invoice-row]').forEach(function(el){
    if(el._v36Bound)return;el._v36Bound=true;
    el.addEventListener('click',function(e){
      if(e.target.closest('button,select,input,a')) return;
      var id=el.getAttribute('data-invoice-row');
      S.expandedInvoice=S.expandedInvoice===id?null:id;
      renderApp();
    });
  });
  r.querySelectorAll('[data-save-invoice-quick]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();saveInvoiceQuick(el.getAttribute('data-save-invoice-quick'))})});
  r.querySelectorAll('[data-cancel-current-invoice]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();cancelCurrentInvoice(el.getAttribute('data-cancel-current-invoice'))})});
  r.querySelectorAll('[data-stop-next-invoice]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();stopInvoiceNextMonth(el.getAttribute('data-stop-next-invoice'))})});
};




