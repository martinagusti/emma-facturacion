"use strict";

/* ═══════════════════════════════════════
   FACTURAS INDIVIDUALES · V27
   Vista principal por factura/cobro vinculado a cliente
═══════════════════════════════════════ */
var _ovOldLoadData=loadData;
var _ovOldRenderModal=renderModal;
var _ovOldBindEvents=bindEvents;
var _ovOldRenderTopbar=renderTopbar;

function invoiceId(){return 'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function serviceDefByKey(k){return SVC_DEFS.find(function(d){return d.key===k})||SVC_DEFS[SVC_DEFS.length-1]}
function invoiceMonth(inv){return inv.month||monthFromDate(inv.issueDate)||monthFromDate(inv.dueDate)||S.month}
function invoiceClient(inv){return getClient(inv.clientId)||{nombreComercial:'CLIENTE ELIMINADO',razonSocial:'',responsable:'',formaCobro:''}}
function invoiceComercial(inv){var c=invoiceClient(inv);return inv.responsable||responsableText(c)||''}
function invoiceServiceLabel(inv){var d=serviceDefByKey(inv.serviceKey);return inv.concept||inv.serviceLabel||(d?d.label:'Otro')}
function invoiceAmount(inv){return Number(inv.amount||inv.importe)||0}
function invoiceStatus(inv){return inv.status||'pendiente'}
function invoiceDueDate(inv){return inv.dueDate||inv.fechaVencimiento||''}
function invoiceIssueDate(inv){return inv.issueDate||inv.fechaFactura||''}
function invoiceRecurringKey(clientId,svcKey,mk){return clientId+'|'+svcKey+'|'+mk}
function saveInvoices(){try{return storageSet('ov_invoices',JSON.stringify(S.invoices||[]),true).then(function(){S.lastSync=new Date()})}catch(e){toast('Error al guardar facturas');return Promise.resolve()}}
function canEditInvoices(){return canEditData()}
function invoiceForma(inv){var c=invoiceClient(inv);return inv.formaCobro||defaultFormaCobro(c)||''}
function mkDate(mk,day){var p=mk.split('-');var d=Math.min(Math.max(parseInt(day||1,10)||1,1),28);return p[0]+'-'+p[1]+'-'+pad(d)}
function nextInvoiceStatus(st){if(st==='pendiente')return 'facturaEnviada';if(st==='facturaEnviada')return 'pagado';if(st==='sin')return 'pendiente';return 'pagado'}

function normalizeInvoices(){
  S.invoices=(S.invoices||[]).map(function(inv){
    inv.id=inv.id||invoiceId();
    inv.status=inv.status||'pendiente';
    inv.amount=Number(inv.amount||inv.importe)||0;
    inv.month=invoiceMonth(inv);
    inv.period=normalizeServicePeriod(inv.period||inv.periodicidad||'unico');
    inv.serviceKey=inv.serviceKey||'otros';
    return inv;
  });
}

async function autoGenerateInvoicesForMonth(mk){
  if(!S.invoices) S.invoices=[];
  var created=0;
  S.clients.forEach(function(c){
    if(!c.active||!c.services) return;
    Object.keys(c.services).forEach(function(k){
      var sv=c.services[k];
      if(!sv||!Number(sv.price)) return;
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
        id:invoiceId(),originKey:origin,clientId:c.id,serviceKey:k,
        concept:(k==='otros'?(sv.otrosLabel||'Otros'):d.label),
        description:'',amount:Number(sv.price)||0,period:period,month:mk,
        issueDate:mkDate(mk,1),dueDate:mkDate(mk,day),
        status:'pendiente',formaCobro:sv.formaCobro||c.formaCobro||'',
        responsable:responsableText(c),createdAt:new Date().toISOString()
      });
      created++;
    });
  });
  if(created>0) await saveInvoices();
}

loadData=async function(silent){
  await _ovOldLoadData(silent);
  try{
    var inv=await storageGet('ov_invoices',true);
    S.invoices=inv&&inv.value?JSON.parse(inv.value):[];
    normalizeInvoices();
    await autoGenerateInvoicesForMonth(S.month);
  }catch(e){S.invoices=S.invoices||[];}
  renderApp();
};

function filteredInvoices(){
  var q=(S.search||'').trim().toLowerCase(),mk=S.month;
  return (S.invoices||[]).filter(function(inv){
    var c=invoiceClient(inv);
    if(invoiceMonth(inv)!==mk) return false;
    if(q){
      var hay=(c.nombreComercial+' '+c.razonSocial+' '+invoiceServiceLabel(inv)+' '+(inv.description||'')+' '+invoiceComercial(inv)).toLowerCase();
      if(hay.indexOf(q)===-1) return false;
    }
    if(S.filterResp!=='todos'&&invoiceComercial(inv)!==S.filterResp) return false;
    if(S.filterStatus!=='all'){
      if(S.filterStatus==='sin') return false;
      if(invoiceStatus(inv)!==S.filterStatus) return false;
    }
    if(S.filterSvc!=='todos'){
      var key=S.filterSvc.replace('svc_','');
      if(inv.serviceKey!==key) return false;
    }
    return true;
  }).sort(function(a,b){
    if(S.sortBy==='cliente') return (invoiceClient(a).nombreComercial||'').localeCompare(invoiceClient(b).nombreComercial||'');
    if(S.sortBy==='comercial') return invoiceComercial(a).localeCompare(invoiceComercial(b));
    if(S.sortBy==='dia') return (invoiceDueDate(a)||'').localeCompare(invoiceDueDate(b)||'');
    if(S.sortBy==='servicio') return invoiceServiceLabel(a).localeCompare(invoiceServiceLabel(b));
    if(S.sortBy==='importe') return invoiceAmount(b)-invoiceAmount(a);
    var order={facturaEnviada:0,pendiente:1,pagado:2,cancelado:3};
    return (order[invoiceStatus(a)]||9)-(order[invoiceStatus(b)]||9);
  });
}
function invoiceMonthTotal(mk){return (S.invoices||[]).filter(function(inv){return invoiceMonth(inv)===mk&&invoiceStatus(inv)!=='cancelado'}).reduce(function(s,inv){return s+invoiceAmount(inv)},0)}
function invoiceMonthPaid(mk){return (S.invoices||[]).filter(function(inv){return invoiceMonth(inv)===mk&&invoiceStatus(inv)==='pagado'}).reduce(function(s,inv){return s+invoiceAmount(inv)},0)}
function invoiceOldPending(){
  var mk=S.month, acc={};
  (S.invoices||[]).forEach(function(inv){
    var im=invoiceMonth(inv);if(im>=mk) return;
    var st=invoiceStatus(inv);if(st==='pagado'||st==='cancelado') return;
    if(!acc[im]) acc[im]={month:im,count:0,total:0};
    acc[im].count++;acc[im].total+=invoiceAmount(inv);
  });
  return Object.keys(acc).sort().map(function(k){return acc[k]}).reverse();
}
function totalFilteredInvoices(){return filteredInvoices().reduce(function(s,inv){return s+invoiceAmount(inv)},0)}

renderKpis=function(){
  var mk=S.month, total=invoiceMonthTotal(mk), paid=invoiceMonthPaid(mk), pct=total>0?Math.round(paid/total*100):0;
  var old=invoiceOldPending(), oldTotal=old.reduce(function(s,x){return s+x.total},0);
  return '<div class="kpis compact-kpis">'+
    '<div class="kpi"><p class="kpi-label">Facturas del mes</p><div class="kpi-value blue">'+(S.invoices||[]).filter(function(i){return invoiceMonth(i)===mk}).length+'</div><p class="kpi-note">'+monthLabel(mk)+'</p></div>'+ 
    '<div class="kpi"><p class="kpi-label">Cobrado · '+monthLabel(mk)+'</p><div class="kpi-value green">'+dispM(paid)+' / '+dispM(total)+'</div><div class="kpi-bar"><div class="kpi-bar-fill" style="width:'+pct+'%"></div></div><p class="kpi-note">'+pct+'% cobrado</p></div>'+ 
    '<div class="kpi"><p class="kpi-label">Pendiente mes</p><div class="kpi-value red">'+dispM(Math.max(total-paid,0))+'</div><p class="kpi-note">facturas no pagadas</p></div>'+ 
    '<div class="kpi clickable-kpi" data-action="toggle-old-pending"><p class="kpi-label">Pendiente acumulado</p><div class="kpi-value amber">'+dispM(oldTotal)+'</div><p class="kpi-note">'+(old.length?old.length+' meses con pendientes':'sin atrasos')+'</p></div>'+ 
  '</div>'+(S.showOldPending?renderOldPendingSummary(old):'');
};
function renderOldPendingSummary(old){
  if(!old.length) return '<div class="mini-panel">No hay facturas pendientes de meses anteriores.</div>';
  return '<div class="mini-panel"><b>Resumen pendientes anteriores</b>'+old.map(function(x){return '<div class="mini-line"><span>'+monthLabel(x.month)+' · '+x.count+' facturas</span><b>'+dispM(x.total)+'</b></div>'}).join('')+'</div>';
}

renderFilterSummary=function(){
  var list=filteredInvoices();
  return '<div class="filter-summary highlight-summary"><div class="sum-card"><div class="sum-label">Total selección</div><div class="sum-value">'+dispM(totalFilteredInvoices())+'</div></div><div class="sum-card"><div class="sum-label">Facturas filtradas</div><div class="sum-value">'+list.length+'</div></div></div>';
};

renderToolbar=function(){
  return '<div class="toolbar list-head"><div class="list-head-title">Listado de facturas</div>'+(!canEditData()?'<span class="readonly-hint">Solo consulta</span>':'')+'<span class="ml-auto today-display">'+todayHuman()+'</span></div>';
};

renderFiltersBar=function(){
  var statusOptions=[{k:'all',label:'Todos los estados'},{k:'facturaEnviada',label:'Factura enviada'},{k:'pendiente',label:'Pendiente fra.'},{k:'pagado',label:'Pagado'},{k:'cancelado',label:'Cancelado'}].map(function(f){return '<option value="'+f.k+'"'+(S.filterStatus===f.k?' selected':'')+'>'+f.label+'</option>'}).join('');
  var indivOptions=SVC_DEFS.map(function(d){return '<option value="svc_'+d.key+'"'+(S.filterSvc==='svc_'+d.key?' selected':'')+'>'+esc(d.label)+'</option>'}).join('');
  var respOptions=comercialesList().map(function(c){return '<option value="'+esc(c.name)+'"'+(S.filterResp===c.name?' selected':'')+'>'+esc(c.name)+'</option>'}).join('');
  return '<div class="filters-bar compact-filters"><div class="filters-row">'+
    (canEditData()?'<button class="btn btn-primary" data-action="add-invoice">+ Nueva factura</button><button class="btn" data-action="add">+ Nuevo cliente</button>':'')+
    '<div class="search-wrap"><input class="search" id="searchInput" type="text" placeholder="Buscar factura o cliente…" value="'+esc(S.search)+'"></div>'+ 
    '<select class="filter-select" id="statusFilter">'+statusOptions+'</select>'+ 
    '<select class="filter-select" id="svcFilter"><option value="todos"'+(S.filterSvc==='todos'?' selected':'')+'>Todos los servicios</option>'+indivOptions+'</select>'+ 
    '<select class="filter-select" id="respFilter"><option value="todos"'+(S.filterResp==='todos'?' selected':'')+'>Todos los comerciales</option>'+respOptions+'</select>'+ 
    '<div class="month-nav"><button class="month-nav-btn" data-month-nav="prev">←</button><select class="filter-select month-select" id="monthPick">'+monthOptions(S.month)+'</select><button class="month-nav-btn" data-month-nav="next">→</button></div>'+ 
    '<label class="iva-label" style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);cursor:pointer;white-space:nowrap;"><input type="checkbox" id="ivaToggle" '+(S.showIva?'checked':'')+'> Con IVA</label>'+ 
  '</div></div>';
};

renderTable=function(){
  var list=filteredInvoices();
  if(!(S.invoices||[]).length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin facturas</h3><p>Crea una factura vinculada a un cliente o añade servicios recurrentes.</p><button class="btn btn-primary" data-action="add-invoice" style="margin-top:14px;">+ Nueva factura</button></div></div>';
  if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin resultados</h3><p>Ninguna factura coincide con los filtros actuales.</p></div></div>';
  var rows=list.map(renderInvoiceRow).join('');
  return '<div class="table-wrap"><div class="table-scroll"><table><thead><tr>'+ 
    '<th><button class="th-sort" data-sort="cliente">Cliente'+sortIndicator('cliente')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="servicio">Factura / concepto'+sortIndicator('servicio')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="comercial">Comercial'+sortIndicator('comercial')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="dia">Vencimiento'+sortIndicator('dia')+'</button></th>'+ 
    '<th style="text-align:right"><button class="th-sort" data-sort="importe">Importe'+sortIndicator('importe')+'</button></th>'+ 
    '<th>Forma pago</th><th>Estado</th><th style="text-align:right">Acción rápida</th>'+ 
  '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
};

function renderInvoiceRow(inv){
  var c=invoiceClient(inv), st=invoiceStatus(inv), d=serviceDefByKey(inv.serviceKey), col=d?d.color:'#6B7280';
  var statusSel='<select class="st-sel '+st+'" data-invoice-status="'+inv.id+'"'+disabledIfNoEdit()+'>'+Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(st===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select>';
  var ns=nextInvoiceStatus(st), act=(st==='pagado')?'<span style="font-size:11.5px;color:var(--green);font-weight:700;">✓ Pagado</span>':(canEditInvoices()?'<button class="qp-btn next-'+ns+'" data-invoice-next="'+inv.id+'">'+STATUS_LABEL[ns]+'</button>':'<span style="font-size:11px;color:var(--text-faint);">Solo consulta</span>');
  return '<tr class="cr invoice-row" data-open-client="'+esc(inv.clientId||'')+'">'+
    '<td class="name-cell"><div class="razon">'+esc(c.nombreComercial||c.razonSocial)+'</div><div class="comercial">'+esc(c.razonSocial||'')+'</div></td>'+ 
    '<td><span class="svc-dot" style="background:'+col+'"></span><b>'+esc(invoiceServiceLabel(inv))+'</b>'+(inv.description?'<div class="comercial">'+esc(inv.description)+'</div>':'')+'</td>'+ 
    '<td>'+commercialBadge(invoiceComercial(inv))+'</td>'+ 
    '<td>'+esc(invoiceDueDate(inv)||'—')+'</td>'+ 
    '<td class="money-cell">'+dispM(invoiceAmount(inv))+'</td>'+ 
    '<td>'+esc(invoiceForma(inv)||'—')+'</td>'+ 
    '<td>'+statusSel+'</td>'+ 
    '<td style="text-align:right">'+act+'</td>'+ 
  '</tr>';
}

function openInvoiceModal(){S.modal={type:'invoice'};renderApp()}
function renderInvoiceModal(){
  var today=new Date().toISOString().slice(0,10), mk=S.month;
  var clientOptions=S.clients.filter(function(c){return c.active}).map(function(c){var label=(c.nombreComercial||c.razonSocial||'')+(c.razonSocial&&c.nombreComercial&&c.razonSocial!==c.nombreComercial?' · '+c.razonSocial:'');return '<option value="'+esc(label)+'" data-id="'+c.id+'"></option>'}).join('');
  var svcOptions=SVC_DEFS.map(function(d){return '<option value="'+d.key+'">'+esc(d.label)+'</option>'}).join('');
  var formaOpts=FORMA_COBRO.map(function(f){return '<option value="'+esc(f)+'">'+esc(f)+'</option>'}).join('');
  return '<div class="field-row"><div class="field"><label>Cliente *</label><div class="client-search-wrap"><input id="f_client_search" class="client-search-input" type="text" list="clientList" placeholder="Buscar cliente…" autocomplete="off"><input type="hidden" id="f_client"><datalist id="clientList">'+clientOptions+'</datalist><div class="client-search-help">Escribe y selecciona el cliente de la lista.</div></div></div><div class="field"><label>Servicio / concepto *</label><select id="f_service">'+svcOptions+'</select></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Descripción</label><input id="f_desc" type="text" placeholder="Ej. Web corporativa"></div><div class="field"><label>Importe total *</label><div class="money-input-wrap"><input id="f_amount" type="number" step="0.01" placeholder="-"><span class="money-suffix">€</span></div></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Fecha factura</label><input id="f_issue" type="date" value="'+today+'"></div><div class="field"><label>Vencimiento / fecha cobro *</label><input id="f_due" type="date" value="'+mkDate(mk,10)+'"></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Estado</label><select id="f_status"><option value="pendiente">Pendiente fra.</option><option value="facturaEnviada">Factura enviada</option><option value="pagado">Pagado</option><option value="cancelado">Cancelado</option></select></div><div class="field"><label>Forma pago</label><select id="f_forma"><option value="">La habitual del cliente</option>'+formaOpts+'</select></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Tipo de cobro</label><div class="period-choice"><button type="button" class="period-btn on" data-f-period="unico">Único</button><button type="button" class="period-btn" data-f-period="mensual">Mensual</button><button type="button" class="period-btn" data-f-period="anual">Anual</button><button type="button" class="period-btn" data-f-period="fraccionado">Fraccionado</button></div><input type="hidden" id="f_period" value="unico"></div></div>'+ 
    '<div id="f_split_wrap" class="split-wrap"><div class="split-head"><span class="split-title">Pagos fraccionados</span><div class="split-presets"><button type="button" class="split-preset on" data-split-preset="50_50">50/50</button><button type="button" class="split-preset" data-split-preset="40_30_30">40/30/30</button><button type="button" class="split-preset" data-split-add="1">+ Fase</button></div></div><div id="f_split_rows"></div><div class="split-note">Se crearán varias facturas vinculadas al mismo proyecto, cada una con su vencimiento y estado.</div></div>'+ 
    '<div class="detail-footer"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-action="save-invoice">Guardar factura</button></div>';
}

renderModal=function(){
  if(S.modal&&S.modal.type==='invoice'){
    var ov=document.createElement('div');ov.id='modalOverlay';ov.className='overlay';
    ov.innerHTML='<div class="modal"><button class="modal-close" data-action="close-modal">×</button><h2>Nueva factura</h2>'+renderInvoiceModal()+'</div>';
    document.body.appendChild(ov);setTimeout(function(){setSplitPreset('50_50')},0);return;
  }
  return _ovOldRenderModal();
};

function splitPhaseId(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function splitDefaultDate(offset){var base=document.getElementById('f_due');var d=base&&base.value?new Date(base.value):new Date();d.setMonth(d.getMonth()+offset);return d.toISOString().slice(0,10)}
function splitRowHtml(label,pct,idx){var amount=parseFloat((document.getElementById('f_amount')||{}).value)||0;var val=amount&&pct?((amount*pct/100).toFixed(2)):'';return '<div class="split-row" data-split-row="'+splitPhaseId()+'"><div><div class="split-lbl">Fase</div><input class="split-label" type="text" value="'+esc(label)+'"></div><div><div class="split-lbl">%</div><input class="split-pct" type="number" step="1" value="'+pct+'"></div><div><div class="split-lbl">Importe</div><input class="split-amount" type="number" step="0.01" value="'+val+'"></div><div class="split-date"><div class="split-lbl">Vencimiento</div><input class="split-due" type="date" value="'+splitDefaultDate(idx)+'"></div><button type="button" class="icon-btn" data-split-remove="1" title="Quitar fase">×</button></div>'}
function setSplitPreset(preset){var rows=document.getElementById('f_split_rows');if(!rows)return;document.querySelectorAll('[data-split-preset]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-split-preset')===preset)});if(preset==='40_30_30')rows.innerHTML=splitRowHtml('Inicio 40%',40,0)+splitRowHtml('Proyecto 30%',30,1)+splitRowHtml('Entrega 30%',30,2);else rows.innerHTML=splitRowHtml('Inicio 50%',50,0)+splitRowHtml('Entrega 50%',50,1);bindSplitRows()}
function addSplitRow(){var rows=document.getElementById('f_split_rows');if(!rows)return;rows.insertAdjacentHTML('beforeend',splitRowHtml('Nueva fase',0,0));bindSplitRows()}
function recalcSplitAmounts(){var amount=parseFloat((document.getElementById('f_amount')||{}).value)||0;document.querySelectorAll('.split-row').forEach(function(row){var pct=parseFloat((row.querySelector('.split-pct')||{}).value)||0;var inp=row.querySelector('.split-amount');if(inp&&document.activeElement!==inp)inp.value=amount&&pct?((amount*pct/100).toFixed(2)):''})}
function bindSplitRows(){document.querySelectorAll('[data-split-remove]').forEach(function(b){if(b._bound)return;b._bound=true;b.addEventListener('click',function(){var row=b.closest('.split-row');if(row)row.remove()})});document.querySelectorAll('.split-pct').forEach(function(inp){if(inp._bound)return;inp._bound=true;inp.addEventListener('input',recalcSplitAmounts)})}

function resolveInvoiceClientId(){
  var input=document.getElementById('f_client_search');
  var hidden=document.getElementById('f_client');
  var raw=(input&&input.value||'').trim().toLowerCase();
  if(hidden&&hidden.value) return hidden.value;
  if(!raw) return '';
  var active=S.clients.filter(function(c){return c.active});
  var exact=active.find(function(c){
    var label=((c.nombreComercial||c.razonSocial||'')+(c.razonSocial&&c.nombreComercial&&c.razonSocial!==c.nombreComercial?' · '+c.razonSocial:'')).toLowerCase();
    return label===raw || String(c.nombreComercial||'').toLowerCase()===raw || String(c.razonSocial||'').toLowerCase()===raw;
  });
  if(exact) return exact.id;
  var matches=active.filter(function(c){
    var hay=((c.nombreComercial||'')+' '+(c.razonSocial||'')).toLowerCase();
    return hay.indexOf(raw)!==-1;
  });
  return matches.length===1?matches[0].id:'';
}

async function createInvoiceFromModal(){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var cid=resolveInvoiceClientId(), svc=document.getElementById('f_service').value, amount=parseFloat(document.getElementById('f_amount').value)||0, due=document.getElementById('f_due').value;
  if(!cid||!svc||!amount||!due){toast('Selecciona un cliente de la lista y rellena servicio, importe y vencimiento');return}
  var c=getClient(cid), d=serviceDefByKey(svc), period=document.getElementById('f_period').value||'unico';
  var base={clientId:cid,serviceKey:svc,description:document.getElementById('f_desc').value||'',issueDate:document.getElementById('f_issue').value||'',status:document.getElementById('f_status').value||'pendiente',formaCobro:document.getElementById('f_forma').value||defaultFormaCobro(c),responsable:responsableText(c),createdAt:new Date().toISOString()};
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
      created.push(Object.assign({},base,{id:invoiceId(),concept:d.label+' · '+label,amount:Math.round(partAmount*100)/100,period:'unico',month:monthFromDate(partDue)||S.month,dueDate:partDue,splitGroupId:group,splitIndex:i+1,splitTotal:rows.length,projectTotal:amount}));
    }
    created.forEach(function(inv){S.invoices.push(inv)});
    S.month=created[0].month;
  } else {
    var inv=Object.assign({},base,{id:invoiceId(),concept:d.label,amount:amount,period:period,month:monthFromDate(due)||S.month,dueDate:due});
    S.invoices.push(inv);S.month=inv.month;
  }
  await saveInvoices();closeModal();renderApp();
}
async function setInvoiceStatus(id,status){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var inv=(S.invoices||[]).find(function(x){return x.id===id});if(!inv)return;
  inv.status=status;if(status==='pagado'&&!inv.paidDate)inv.paidDate=new Date().toISOString().slice(0,10);
  await saveInvoices();renderApp();
}

bindEvents=function(){
  _ovOldBindEvents();
  var r=root();
  r.querySelectorAll('[data-action="add-invoice"]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();openInvoiceModal()})});
  r.querySelectorAll('[data-action="toggle-old-pending"]').forEach(function(el){el.addEventListener('click',function(){S.showOldPending=!S.showOldPending;renderApp()})});
  r.querySelectorAll('[data-invoice-status]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation()});el.addEventListener('change',function(e){e.stopPropagation();setInvoiceStatus(el.getAttribute('data-invoice-status'),el.value)})});
  r.querySelectorAll('[data-invoice-next]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();var inv=(S.invoices||[]).find(function(x){return x.id===el.getAttribute('data-invoice-next')});if(inv)setInvoiceStatus(inv.id,nextInvoiceStatus(invoiceStatus(inv)))})});
  r.querySelectorAll('[data-open-client]').forEach(function(el){el.addEventListener('dblclick',function(){var id=el.getAttribute('data-open-client');if(id){S.expanded=id;S.expandedTab[id]='servicios';}})});
  var fClientSearch=document.getElementById('f_client_search');
  if(fClientSearch){
    fClientSearch.addEventListener('input',function(){
      var hidden=document.getElementById('f_client');if(hidden) hidden.value='';
      var raw=fClientSearch.value.trim().toLowerCase();
      var active=S.clients.filter(function(c){return c.active});
      var found=active.find(function(c){
        var label=((c.nombreComercial||c.razonSocial||'')+(c.razonSocial&&c.nombreComercial&&c.razonSocial!==c.nombreComercial?' · '+c.razonSocial:'')).toLowerCase();
        return label===raw || String(c.nombreComercial||'').toLowerCase()===raw || String(c.razonSocial||'').toLowerCase()===raw;
      });
      if(found&&hidden) hidden.value=found.id;
    });
    fClientSearch.addEventListener('change',function(){var id=resolveInvoiceClientId();var hidden=document.getElementById('f_client');if(hidden) hidden.value=id;});
  }
  document.querySelectorAll('[data-f-period]').forEach(function(el){el.addEventListener('click',function(){document.querySelectorAll('[data-f-period]').forEach(function(b){b.classList.remove('on')});el.classList.add('on');var p=el.getAttribute('data-f-period');document.getElementById('f_period').value=p;var wr=document.getElementById('f_split_wrap');if(wr)wr.classList.toggle('show',p==='fraccionado');if(p==='fraccionado')recalcSplitAmounts()})});
  document.querySelectorAll('[data-split-preset]').forEach(function(el){el.addEventListener('click',function(){setSplitPreset(el.getAttribute('data-split-preset'))})});
  document.querySelectorAll('[data-split-add]').forEach(function(el){el.addEventListener('click',addSplitRow)});
  var amt=document.getElementById('f_amount');if(amt)amt.addEventListener('input',recalcSplitAmounts);
  document.querySelectorAll('[data-action="save-invoice"]').forEach(function(el){el.addEventListener('click',createInvoiceFromModal)});
};



/* =============== V31: vista de clientes + importe integrado =============== */
S.mainView=S.mainView||'facturas';

function clientInvoices(c){
  return (S.invoices||[]).filter(function(inv){return inv.clientId===c.id});
}
function clientMonthInvoices(c,mk){
  return clientInvoices(c).filter(function(inv){return invoiceMonth(inv)===mk&&invoiceStatus(inv)!=='cancelado'});
}
function clientMonthTotalFromInvoices(c,mk){
  return clientMonthInvoices(c,mk).reduce(function(sum,inv){return sum+invoiceAmount(inv)},0);
}
function clientPendingTotalFromInvoices(c){
  return clientInvoices(c).filter(function(inv){var st=invoiceStatus(inv);return st!=='pagado'&&st!=='cancelado'}).reduce(function(sum,inv){return sum+invoiceAmount(inv)},0);
}
function clientServicesChips(c){
  var act=activeServices(c);
  if(!act.length) return '<span style="font-size:12px;color:var(--text-faint);">Sin servicios configurados</span>';
  return '<div class="client-services-list">'+act.map(function(d){
    var sv=c.services[d.key]||{};
    var lbl=d.key==='otros'?(sv.otrosLabel||'Otros'):d.label;
    return '<span class="client-service-chip" style="color:'+d.color+';border-color:'+d.color+'">'+esc(lbl)+'</span>';
  }).join('')+'</div>';
}
function filteredClientsDirectory(){
  var q=(S.search||'').trim().toLowerCase();
  return (S.clients||[]).filter(function(c){
    if(!c.active) return false;
    if(q){
      var hay=((c.nombreComercial||'')+' '+(c.razonSocial||'')+' '+responsableText(c)+' '+(c.contactoEmail||'')).toLowerCase();
      if(hay.indexOf(q)===-1) return false;
    }
    if(S.filterResp!=='todos'&&responsableText(c)!==S.filterResp) return false;
    if(S.filterSvc!=='todos'){
      var key=S.filterSvc.replace('svc_','');
      if(!(c.services&&c.services[key]&&Number(c.services[key].price)>0)) return false;
    }
    return true;
  }).sort(function(a,b){
    if(S.sortBy==='comercial') return responsableText(a).localeCompare(responsableText(b));
    if(S.sortBy==='dia') return (Number(getCobroDia(a))||99)-(Number(getCobroDia(b))||99);
    if(S.sortBy==='importe') return clientMonthTotalFromInvoices(b,S.month)-clientMonthTotalFromInvoices(a,S.month);
    return String(a.nombreComercial||a.razonSocial||'').localeCompare(String(b.nombreComercial||b.razonSocial||''));
  });
}
function renderClientsDirectory(){
  var list=filteredClientsDirectory();
  if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin clientes</h3><p>Ningún cliente coincide con los filtros actuales.</p></div></div>';
  var rows=list.map(function(c){
    var monthTotal=clientMonthTotalFromInvoices(c,S.month);
    var pending=clientPendingTotalFromInvoices(c);
    return '<tr class="cr clients-table" data-client-row="'+c.id+'">'+
      '<td><div class="client-main">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div><div class="client-sub">'+esc((c.razonSocial||'').toUpperCase())+'</div></td>'+ 
      '<td>'+commercialBadge(responsableText(c))+'</td>'+ 
      '<td>'+esc(defaultFormaCobro(c)||'—')+'</td>'+ 
      '<td>'+clientServicesChips(c)+'</td>'+ 
      '<td class="client-total-mini">'+dispM(monthTotal)+'</td>'+ 
      '<td class="client-total-mini" style="color:var(--amber)">'+dispM(pending)+'</td>'+ 
      '<td style="text-align:right"><button class="client-open-btn" data-client-open="'+c.id+'">Ver ficha</button></td>'+ 
    '</tr>'+(S.expanded===c.id?renderDetailRow(c):'');
  }).join('');
  return '<div class="table-wrap"><div class="table-scroll"><table><thead><tr>'+ 
    '<th><button class="th-sort" data-sort="cliente">Cliente'+sortIndicator('cliente')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="comercial">Comercial'+sortIndicator('comercial')+'</button></th>'+ 
    '<th>Forma pago</th><th>Servicios activos</th>'+ 
    '<th style="text-align:right"><button class="th-sort" data-sort="importe">Total mes'+sortIndicator('importe')+'</button></th>'+ 
    '<th style="text-align:right">Pendiente total</th><th></th>'+ 
  '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

var _ovV31RenderToolbar=renderToolbar;
renderToolbar=function(){
  return '<div class="toolbar list-head"><div class="view-tabs"><button class="view-tab-btn '+(S.mainView!=='clientes'?'active':'')+'" data-action="view-invoices">Facturas</button><button class="view-tab-btn '+(S.mainView==='clientes'?'active':'')+'" data-action="view-clients">Clientes</button></div><div class="list-head-title">'+(S.mainView==='clientes'?'Listado de clientes':'Listado de facturas')+'</div>'+(!canEditData()?'<span class="readonly-hint">Solo consulta</span>':'')+'<span class="ml-auto today-display">'+todayHuman()+'</span></div>';
};

var _ovV31RenderTable=renderTable;
renderTable=function(){
  if(S.mainView==='clientes') return renderClientsDirectory();
  return _ovV31RenderTable();
};

var _ovV31RenderFilterSummary=renderFilterSummary;
renderFilterSummary=function(){
  if(S.mainView==='clientes'){
    var list=filteredClientsDirectory();
    var total=list.reduce(function(sum,c){return sum+clientMonthTotalFromInvoices(c,S.month)},0);
    return '<div class="filter-summary highlight-summary"><div class="sum-card"><div class="sum-label">Total clientes selección</div><div class="sum-value">'+dispM(total)+'</div></div><div class="sum-card"><div class="sum-label">Clientes filtrados</div><div class="sum-value">'+list.length+'</div></div></div>';
  }
  return _ovV31RenderFilterSummary();
};

var _ovV31BindEvents=bindEvents;
bindEvents=function(){
  _ovV31BindEvents();
  var r=root();
  r.querySelectorAll('[data-action="view-invoices"]').forEach(function(el){el.addEventListener('click',function(){S.mainView='facturas';S.expanded=null;renderApp()})});
  r.querySelectorAll('[data-action="view-clients"]').forEach(function(el){el.addEventListener('click',function(){S.mainView='clientes';S.expanded=null;renderApp()})});
  r.querySelectorAll('[data-client-open]').forEach(function(el){el.addEventListener('click',function(e){e.stopPropagation();var id=el.getAttribute('data-client-open');S.expanded=S.expanded===id?null:id;S.expandedTab[id]='servicios';renderApp()})});
  r.querySelectorAll('[data-client-row]').forEach(function(el){el.addEventListener('dblclick',function(){var id=el.getAttribute('data-client-row');S.expanded=S.expanded===id?null:id;S.expandedTab[id]='servicios';renderApp()})});
};

var _ovOldCreateAutoBackup=createAutoBackup;
createAutoBackup=function(){
  try{_ovOldCreateAutoBackup&&_ovOldCreateAutoBackup();}catch(e){}
  try{localStorage.setItem('ov_backup_invoices_latest',JSON.stringify({createdAt:new Date().toISOString(),invoices:S.invoices||[]}));}catch(e){}
};

window.addEventListener('beforeunload',function(){createAutoBackup()});



