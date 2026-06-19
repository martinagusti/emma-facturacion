"use strict";

/* =============== V37: facturas por fecha de cobro, duración recurrente y vista de cobros pendientes =============== */
(function(){
  var st=document.createElement('style');
  st.textContent=`
    #m_razon,[data-client-field$="|razonSocial"]{text-transform:none!important}
    #m_comercial,[data-client-field$="|nombreComercial"]{text-transform:uppercase!important}
    .period-duration-note{font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.35}
     .invoice-type-row{display:block;margin-bottom:12px}
    .invoice-type-row .field{width:100%}
    .invoice-period-choice{display:grid;grid-template-columns:repeat(4,1fr);border:1.5px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface);min-height:40px}
    .invoice-period-choice button{border:0;border-right:1px solid var(--border-light);background:#fff;color:var(--text-muted);font-size:12.5px;font-weight:600;cursor:pointer;padding:10px 8px;transition:background .12s,color .12s}
    .invoice-period-choice button:last-child{border-right:0}
    .invoice-period-choice button:hover{background:var(--surface-2);color:var(--text)}
    .invoice-period-choice button.on{background:var(--accent);color:#fff}
    .billing-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .invoice-actions-stack{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
    .invoice-actions-stack .btn{box-shadow:none}
    .btn-stop-next{background:#fff;border-color:var(--border);color:var(--text-muted)}
    .btn-stop-next:hover{border-color:var(--red);color:var(--red);background:var(--red-bg)}
    .pending-month-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--amber);background:var(--amber-bg);border:1px solid var(--amber-b);border-radius:20px;padding:3px 8px;font-weight:600}
    @media(max-width:900px){.billing-row{grid-template-columns:1fr}.invoice-period-choice{grid-template-columns:repeat(2,1fr)}.invoice-period-choice button:nth-child(2){border-right:0}.invoice-period-choice button:nth-child(-n+2){border-bottom:1px solid var(--border-light)}.invoice-actions-stack{justify-content:flex-start}}
  `;
  document.head.appendChild(st);
})();

function normalizeLegalName(s){
  s=String(s==null?'':s).trim().replace(/\s+/g,' ').toLocaleLowerCase('es-ES');
  var lowerKeep={'de':1,'del':1,'la':1,'las':1,'los':1,'y':1,'el':1,'en':1};
  return s.split(' ').map(function(w,i){
    if(!w) return '';
    if(i>0&&lowerKeep[w]) return w;
    return w.charAt(0).toLocaleUpperCase('es-ES')+w.slice(1);
  }).join(' ');
}
function normalizeCommercialName(s){return String(s==null?'':s).trim().replace(/\s+/g,' ').toLocaleUpperCase('es-ES')}
function displayLegalName(s){return normalizeLegalName(s||'')}
function invoiceCobroDay(inv){var d=invoiceDueDate(inv)||'';var m=d.match(/-(\d{2})$/);return m?parseInt(m[1],10):''}
function invoiceCobroLabel(inv){var day=invoiceCobroDay(inv);return day?'Día '+day:'—'}
function monthDiff(a,b){var ap=a.split('-').map(Number),bp=b.split('-').map(Number);return (bp[0]-ap[0])*12+(bp[1]-ap[1])}
function billingDurationMonths(inv){var v=String(inv.billingDuration||inv.facturacionPeriodo||'indefinido');if(v==='3'||v==='3m')return 3;if(v==='6'||v==='6m')return 6;return 0}
function pendingInvoicesAccumulated(){
  var mk=S.month||curMonthKey(), q=(S.search||'').trim().toLowerCase();
  return (S.invoices||[]).filter(function(inv){
    if(invoiceMonth(inv)>mk) return false;
    if(invoiceStatus(inv)==='pagado'||invoiceStatus(inv)==='cancelado') return false;
    var c=invoiceClient(inv);
    if(q){var hay=(c.nombreComercial+' '+c.razonSocial+' '+invoiceServiceLabel(inv)+' '+packServiceLabels(inv).join(' ')+' '+(inv.description||'')+' '+invoiceComercial(inv)).toLowerCase();if(hay.indexOf(q)===-1)return false}
    if(S.filterResp!=='todos'&&invoiceComercial(inv)!==S.filterResp) return false;
    if(S.filterSvc!=='todos'){var key=S.filterSvc.replace('svc_','');if(!invoiceMatchesService(inv,key))return false}
    return true;
  }).sort(function(a,b){return (invoiceMonth(a)||'').localeCompare(invoiceMonth(b)||'') || (invoiceDueDate(a)||'').localeCompare(invoiceDueDate(b)||'')});
}
function pendingInvoicesTotal(){return pendingInvoicesAccumulated().reduce(function(s,inv){return s+invoiceFilteredAmount(inv)},0)}
function pendingInvoicesCount(){return pendingInvoicesAccumulated().length}

/* Normalización cliente: nombre comercial en mayúsculas; razón social en formato normal */
var normalizeExistingClients=function(){
  var changed=false;
  (S.clients||[]).forEach(function(cl){
    if(cl.razonSocial){var r=normalizeLegalName(cl.razonSocial);if(r!==cl.razonSocial){cl.razonSocial=r;changed=true}}
    if(cl.nombreComercial){var n=normalizeCommercialName(cl.nombreComercial);if(n!==cl.nombreComercial){cl.nombreComercial=n;changed=true}}
  });
  if(changed) saveClients&&saveClients();
};

createClient=async function(form){
  var c={id:genId(),razonSocial:normalizeLegalName(form.razon),nombreComercial:normalizeCommercialName(form.comercial||form.razon),
    contactoNombre:form.contacto||'',contactoEmail:form.email||'',contactoTel:form.tel||'',
    fechaAlta:form.fecha||new Date().toISOString().slice(0,10),responsable:form.responsable||'',formaCobro:form.formaCobro||'',
    active:true,services:{},notas:''};
  SVC_DEFS.forEach(function(d){c.services[d.key]={price:0,period:d.recurring?'mensual':'unico',status:'pendiente',formaCobro:'',fecha:'',otrosLabel:'',startMonth:S.month}});
  S.clients.push(c);
  if(c.responsable){S.lastResponsable=c.responsable;try{localStorage.setItem('ov_last_responsable',c.responsable)}catch(e){}}
  await saveClients();S.modal=null;S.expanded=c.id;S.expandedTab[c.id]='servicios';
  toast('Cliente añadido ✓');renderApp();
};

var _ovV37UpdateClientField=updateClientField;
updateClientField=async function(id,field,val){
  if(field==='razonSocial') val=normalizeLegalName(val);
  if(field==='nombreComercial') val=normalizeCommercialName(val);
  return _ovV37UpdateClientField(id,field,val);
};

/* Recurrentes: mensual cada mes, anual una vez al año, con periodo de facturación opcional */
isRecurringInvoiceDueInMonth=function(inv,mk){
  var p=normalizeServicePeriod(inv.period||'unico');
  var start=invoiceTemplateStartMonth(inv);
  if(!start||mk<start) return false;
  if(invoiceRecurringStopped(inv,mk)) return false;
  var dur=billingDurationMonths(inv);
  if(dur && monthDiff(start,mk)>=dur) return false;
  if(p==='mensual') return true;
  if(p==='anual') return mk.slice(5,7)===start.slice(5,7);
  return false;
};

cloneRecurringInvoiceForMonth=function(inv,mk){
  var root=recurringInvoiceRootId(inv);
  var dueDay=(invoiceDueDate(inv).match(/-(\d{2})$/)||[])[1]||String(inv.paymentDay||1).padStart(2,'0');
  var issueDay=(invoiceIssueDate(inv).match(/-(\d{2})$/)||[])[1]||'01';
  var copy=Object.assign({},inv);
  copy.id=invoiceId();
  copy.originKey='invoice|'+root+'|'+mk;
  copy.recurrenceRootId=root;
  copy.month=mk;
  copy.issueDate=mkDate(mk,issueDay);
  copy.dueDate=mkDate(mk,dueDay);
  copy.paymentDay=parseInt(dueDay,10)||1;
  copy.status='pendiente';
  copy.fechaPago='';copy.paidAt='';copy.paidDate='';
  copy.createdAt=new Date().toISOString();
  return copy;
};

function billingDurationOptions(sel){
  sel=sel||'indefinido';
  return '<option value="indefinido"'+(sel==='indefinido'?' selected':'')+'>Indefinido · hasta que se cancele</option><option value="3"'+(sel==='3'?' selected':'')+'>3 meses</option><option value="6"'+(sel==='6'?' selected':'')+'>6 meses</option>';
}
function dayOptions(sel){
  sel=parseInt(sel||1,10)||1;var h='';
  for(var i=1;i<=31;i++) h+='<option value="'+i+'"'+(i===sel?' selected':'')+'>Día '+i+'</option>';
  return h;
}

renderInvoiceModal=function(){
  var today=new Date().toISOString().slice(0,10), mk=S.month;
  var clientOptions=S.clients.filter(function(c){return c.active}).map(function(c){var label=(c.nombreComercial||c.razonSocial||'')+(c.razonSocial&&c.nombreComercial&&c.razonSocial!==c.nombreComercial?' · '+c.razonSocial:'');return '<option value="'+esc(label)+'" data-id="'+c.id+'"></option>'}).join('');
  var svcOptions=SVC_DEFS.map(function(d){return '<option value="'+d.key+'">'+esc(d.label)+'</option>'}).join('');
  var packChecks=SVC_DEFS.map(packOptionHtml).join('');
  var formaOpts=FORMA_COBRO.map(function(f){return '<option value="'+esc(f)+'">'+esc(f)+'</option>'}).join('');
  return '<div class="field-row"><div class="field"><label>Cliente *</label><div class="client-search-wrap"><input id="f_client_search" class="client-search-input" type="text" list="clientList" placeholder="Buscar cliente…" autocomplete="off"><input type="hidden" id="f_client"><datalist id="clientList">'+clientOptions+'</datalist><div class="client-search-help">Escribe y selecciona el cliente de la lista.</div></div></div><div class="field"><label>Tipo de servicio *</label><div class="service-mode-choice"><button type="button" class="on" data-service-mode="single">Un servicio</button><button type="button" data-service-mode="pack">Pack varios</button></div><input type="hidden" id="f_service_mode" value="single"></div></div>'+ 
    '<div id="f_single_service_wrap" class="field-row"><div class="field"><label>Servicio / concepto *</label><select id="f_service">'+svcOptions+'</select></div></div>'+ 
    '<div id="f_pack_wrap" class="pack-wrap"><div class="split-title">Servicios incluidos en el pack</div><div class="pack-grid">'+packChecks+'</div><div class="split-title">Precio del pack</div><div class="pack-pricing-choice"><button type="button" class="on" data-pack-price-mode="total">Precio total del pack</button><button type="button" data-pack-price-mode="individual">Precio por servicio</button></div><input type="hidden" id="f_pack_price_mode" value="total"><div id="f_pack_items_prices" class="pack-items-prices"></div><div class="pack-note">Si eliges precio total, la factura se cobra como un único pack. Si eliges precio por servicio, el total se calcula automáticamente con cada concepto.</div></div>'+ 
    '<div class="field-row"><div class="field"><label>Descripción</label><input id="f_desc" type="text" placeholder="Ej. Web corporativa, Pack web + SEO…"></div><div class="field"><label>Importe total *</label><div class="money-input-wrap"><input id="f_amount" type="number" step="0.01" placeholder="-"><span class="money-suffix">€</span></div></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Fecha factura</label><input id="f_issue" type="date" value="'+today+'"></div><div class="field"><label>Día cobro cliente *</label><select id="f_payment_day">'+dayOptions(1)+'</select></div></div>'+ 
    '<div class="invoice-type-row"><div class="field"><label>Tipo de cobro</label><div class="invoice-period-choice"><button type="button" class="on" data-invoice-period="unico">Único</button><button type="button" data-invoice-period="mensual">Mensual</button><button type="button" data-invoice-period="anual">Anual</button><button type="button" data-invoice-period="fraccionado">Fraccionado</button></div><input type="hidden" id="f_period" value="unico"></div></div><div class="billing-row"><div class="field"><label>Periodo facturación</label><select id="f_billing_duration">'+billingDurationOptions('indefinido')+'</select><div class="period-duration-note">Para mensual: se repite hasta cancelar, 3 meses o 6 meses.</div></div><div class="field"><label>Estado</label><select id="f_status"><option value="pendiente">Pendiente fra.</option><option value="facturaEnviada">Factura enviada</option><option value="pagado">Pagado</option><option value="cancelado">Cancelado</option></select></div></div>'+ 
    '<div class="field-row"><div class="field"><label>Forma pago</label><select id="f_forma"><option value="">La habitual del cliente</option>'+formaOpts+'</select></div></div>'+ 
    '<div id="f_split_wrap" class="split-wrap"><div class="split-head"><span class="split-title">Pagos fraccionados</span><div class="split-presets"><button type="button" class="split-preset on" data-split-preset="50_50">50/50</button><button type="button" class="split-preset" data-split-preset="40_30_30">40/30/30</button><button type="button" class="split-preset" data-split-add="1">+ Fase</button></div></div><div id="f_split_rows"></div><div class="split-note">Se crearán varias facturas vinculadas al mismo proyecto, cada una con su fecha de cobro y estado.</div></div>'+ 
    '<div class="modal-actions"><button class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" data-create-invoice>Guardar factura</button></div>';
};

function readInvoiceModalBase(){
  var issue=document.getElementById('f_issue').value||new Date().toISOString().slice(0,10);
  var mk=monthFromDate(issue)||S.month;
  var day=parseInt(document.getElementById('f_payment_day').value,10)||1;
  return {issue:issue,mk:mk,day:day,due:mkDate(mk,day)};
}

createInvoiceFromModal=async function(){
  if(!canEditInvoices()){toast('Tu acceso es de solo consulta');return}
  var cid=resolveInvoiceClientId(), serviceMode=(document.getElementById('f_service_mode')||{}).value||'single';
  var svc=document.getElementById('f_service')?document.getElementById('f_service').value:'';
  var amount=parseFloat(document.getElementById('f_amount').value)||0;
  var baseDates=readInvoiceModalBase();
  var pack=collectPackData();
  if(serviceMode==='pack'){
    if(!pack||!pack.keys.length){toast('Selecciona al menos un servicio para el pack');return}
    if(pack.priceMode==='individual'){
      amount=pack.items.reduce(function(s,x){return s+(Number(x.amount)||0)},0);
      if(!amount){toast('Indica el importe de cada servicio del pack');return}
    }
  }
  if(!cid||(!svc&&serviceMode!=='pack')||!amount){toast('Selecciona un cliente y rellena servicio e importe');return}
  var c=getClient(cid), d=serviceDefByKey(svc), period=document.getElementById('f_period').value||'unico';
  var labels=serviceMode==='pack'?pack.items.map(function(x){return x.label}):[d.label];
  var concept=serviceMode==='pack'?('Pack: '+labels.join(' + ')):d.label;
  var desc=document.getElementById('f_desc').value||'';
  var base={clientId:cid,serviceKey:serviceMode==='pack'?'pack':svc,serviceKeys:serviceMode==='pack'?pack.keys:[svc],packPriceMode:serviceMode==='pack'?pack.priceMode:'',packItems:serviceMode==='pack'?pack.items:[],concept:concept,description:desc,issueDate:baseDates.issue,paymentDay:baseDates.day,billingDuration:document.getElementById('f_billing_duration').value||'indefinido',status:document.getElementById('f_status').value||'pendiente',formaCobro:document.getElementById('f_forma').value||defaultFormaCobro(c),responsable:responsableText(c),createdAt:new Date().toISOString()};
  S.invoices=S.invoices||[];
  if(period==='fraccionado'){
    var rows=[].slice.call(document.querySelectorAll('.split-row'));
    if(!rows.length){toast('Añade al menos una fase de pago');return}
    var group='g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), created=[];
    for(var i=0;i<rows.length;i++){
      var row=rows[i], label=(row.querySelector('.split-label')||{}).value||('Fase '+(i+1));
      var pct=parseFloat((row.querySelector('.split-pct')||{}).value)||0;
      var partAmount=parseFloat((row.querySelector('.split-amount')||{}).value)||0;
      var partDue=(row.querySelector('.split-due')||{}).value||baseDates.due;
      if(!partAmount&&pct) partAmount=amount*pct/100;
      if(!partAmount||!partDue){toast('Revisa importes y fechas de cobro de las fases');return}
      created.push(Object.assign({},base,{id:invoiceId(),concept:concept+' · '+label,amount:Math.round(partAmount*100)/100,period:'unico',month:monthFromDate(partDue)||baseDates.mk,dueDate:partDue,paymentDay:invoiceCobroDay({dueDate:partDue})||baseDates.day,splitGroupId:group,splitIndex:i+1,splitTotal:rows.length,projectTotal:amount}));
    }
    created.forEach(function(inv){S.invoices.push(inv)});S.month=created[0].month;
  } else {
    var inv=Object.assign({},base,{id:invoiceId(),amount:amount,period:period,month:baseDates.mk,dueDate:baseDates.due});
    S.invoices.push(inv);S.month=inv.month;
  }
  await saveInvoices();closeModal();renderApp();
};

/* Ajustes visuales en filas y edición rápida */
invoiceQuickEditHtml=function(inv){
  var statusOpts=Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(invoiceStatus(inv)===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('');
  var formaOpts='<option value="">Habitual del cliente</option>'+FORMA_COBRO.map(function(f){return '<option value="'+esc(f)+'"'+(invoiceForma(inv)===f?' selected':'')+'>'+esc(f)+'</option>'}).join('');
  var rec=invoiceIsRecurring(inv);
  return '<tr class="invoice-edit-row"><td colspan="8"><div class="invoice-quick-edit" data-invoice-edit-box="'+esc(inv.id)+'">'+
    '<div class="field"><label>Concepto</label><input type="text" data-edit-concept="'+esc(inv.id)+'" value="'+esc(invoiceServiceLabel(inv))+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Importe</label><input type="number" step="0.01" data-edit-amount="'+esc(inv.id)+'" value="'+esc(invoiceAmount(inv)||'')+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Fecha cobro</label><input type="date" data-edit-due="'+esc(inv.id)+'" value="'+esc(invoiceDueDate(inv))+'" '+disabledIfNoEdit()+'></div>'+ 
    '<div class="field"><label>Estado</label><select data-edit-status="'+esc(inv.id)+'" '+disabledIfNoEdit()+'>'+statusOpts+'</select></div>'+ 
    '<div class="field"><label>Forma pago</label><select data-edit-forma="'+esc(inv.id)+'" '+disabledIfNoEdit()+'>'+formaOpts+'</select></div>'+ 
    '<div class="invoice-actions-mini">'+
      (canEditInvoices()?'<button class="btn btn-sm btn-success" data-save-invoice-quick="'+esc(inv.id)+'">Guardar</button>':'')+
      (canEditInvoices()?'<button class="btn btn-sm btn-warning-soft" data-cancel-current-invoice="'+esc(inv.id)+'">Cancelar actual</button>':'')+
      (canEditInvoices()&&rec?'<button class="btn btn-sm btn-muted-soft" data-stop-next-invoice="'+esc(inv.id)+'">Dar de baja próximo mes</button>':'')+
    '</div>'+ 
  '</div></td></tr>';
};

renderInvoiceRow=function(inv){
  var c=invoiceClient(inv), st=invoiceStatus(inv), keys=invoiceServiceKeys(inv), d=serviceDefByKey(keys[0]||inv.serviceKey), col=d?d.color:'#6B7280';
  var statusSel='<select class="st-sel '+st+'" data-invoice-status="'+inv.id+'"'+disabledIfNoEdit()+'>'+Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(st===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select>';
  var ns=nextInvoiceStatus(st), quick=(st==='pagado')?'<span style="font-size:11.5px;color:var(--green);font-weight:700;">✓ Pagado</span>':(canEditInvoices()?'<button class="qp-btn next-'+ns+'" data-invoice-next="'+inv.id+'">'+STATUS_LABEL[ns]+'</button>':'<span style="font-size:11px;color:var(--text-faint);">Solo consulta</span>');
  var open=S.expandedInvoice===inv.id, rec=invoiceIsRecurring(inv);
  var stopped=inv.cancelAfterMonth?'<div class="comercial" style="color:var(--red);font-weight:600;">Baja desde '+esc(monthLabel(shiftMonth(inv.cancelAfterMonth,1)))+'</div>':'';
  var action='<div class="invoice-actions-stack">'+quick+(canEditInvoices()&&rec?'<button class="btn btn-xs btn-stop-next" data-stop-next-invoice="'+esc(inv.id)+'">Dar de baja próximo mes</button>':'')+'</div>';
  return '<tr class="cr invoice-row '+(open?'open':'')+'" data-invoice-row="'+esc(inv.id)+'" data-open-client="'+esc(inv.clientId||'')+'">'+
    '<td><div class="client-main">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div><div class="client-sub">'+esc(displayLegalName(c.razonSocial||''))+'</div></td>'+ 
    '<td><span class="svc-dot" style="background:'+col+'"></span><b>'+esc(invoiceServiceLabel(inv))+'</b>'+(inv.description?'<div class="comercial">'+esc(inv.description)+'</div>':'')+stopped+'</td>'+ 
    '<td>'+commercialBadge(invoiceComercial(inv))+'</td>'+ 
    '<td>'+esc(invoiceCobroLabel(inv))+'</td>'+ 
    '<td class="money-cell">'+dispM(invoiceAmount(inv))+'</td>'+ 
    '<td>'+esc(invoiceForma(inv)||'—')+'</td>'+ 
    '<td>'+statusSel+'</td>'+ 
    '<td style="text-align:right">'+action+'</td>'+ 
  '</tr>'+(open?invoiceQuickEditHtml(inv):'');
};

/* Tabla facturas: cambia vencimiento por día/fecha cobro */
function renderInvoicesTableV37(){
  var list=filteredInvoices();
  if(!(S.invoices||[]).length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin facturas</h3><p>Crea una factura vinculada a un cliente o añade servicios recurrentes.</p><button class="btn btn-primary" data-action="add-invoice" style="margin-top:14px;">+ Nueva factura</button></div></div>';
  if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin resultados</h3><p>Ninguna factura coincide con los filtros actuales.</p></div></div>';
  var rows=list.map(renderInvoiceRow).join('');
  return '<div class="table-wrap"><div class="table-scroll"><table><thead><tr>'+ 
    '<th><button class="th-sort" data-sort="cliente">Cliente'+sortIndicator('cliente')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="servicio">Factura / concepto'+sortIndicator('servicio')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="comercial">Comercial'+sortIndicator('comercial')+'</button></th>'+ 
    '<th><button class="th-sort" data-sort="dia">Día cobro'+sortIndicator('dia')+'</button></th>'+ 
    '<th style="text-align:right"><button class="th-sort" data-sort="importe">Importe'+sortIndicator('importe')+'</button></th>'+ 
    '<th>Forma pago</th><th>Estado</th><th style="text-align:right">Acción rápida</th>'+ 
  '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}
function renderPendingInvoicesTable(){
  var list=pendingInvoicesAccumulated();
  if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin cobros pendientes</h3><p>No hay facturas pendientes acumuladas hasta '+esc(monthLabel(S.month))+'.</p></div></div>';
  var rows=list.map(function(inv){
    var c=invoiceClient(inv), st=invoiceStatus(inv), keys=invoiceServiceKeys(inv), d=serviceDefByKey(keys[0]||inv.serviceKey), col=d?d.color:'#6B7280';
    var statusSel='<select class="st-sel '+st+'" data-invoice-status="'+inv.id+'"'+disabledIfNoEdit()+'>'+Object.keys(STATUS_LABEL).map(function(s){return '<option value="'+s+'"'+(st===s?' selected':'')+'>'+STATUS_LABEL[s]+'</option>'}).join('')+'</select>';
    return '<tr class="cr invoice-row" data-invoice-row="'+esc(inv.id)+'">'+
      '<td><div class="client-main">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div><div class="client-sub">'+esc(displayLegalName(c.razonSocial||''))+'</div></td>'+ 
      '<td><span class="svc-dot" style="background:'+col+'"></span><b>'+esc(invoiceServiceLabel(inv))+'</b>'+(inv.description?'<div class="comercial">'+esc(inv.description)+'</div>':'')+'</td>'+ 
      '<td><span class="pending-month-pill">'+esc(monthLabel(invoiceMonth(inv)))+' · '+esc(invoiceCobroLabel(inv))+'</span></td>'+ 
      '<td class="money-cell">'+dispM(invoiceAmount(inv))+'</td>'+ 
      '<td>'+statusSel+'</td>'+ 
    '</tr>'+(S.expandedInvoice===inv.id?invoiceQuickEditHtml(inv):'');
  }).join('');
  return '<div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Cliente</th><th>Factura / concepto</th><th>Mes y día cobro</th><th style="text-align:right">Importe</th><th>Estado</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
}

var _ovV37RenderToolbarBase=renderToolbar;
renderToolbar=function(){
  var count=pendingInvoicesCount();
  return '<div class="toolbar list-head"><div class="view-tabs"><button class="view-tab-btn '+((S.mainView!=='clientes'&&S.mainView!=='pendientes')?'active':'')+'" data-action="view-invoices">Facturas</button><button class="view-tab-btn '+(S.mainView==='clientes'?'active':'')+'" data-action="view-clients">Clientes</button><button class="view-tab-btn '+(S.mainView==='pendientes'?'active':'')+'" data-action="view-pending">Cobros pendientes'+(count?' ('+count+')':'')+'</button></div><div class="list-head-title">'+(S.mainView==='clientes'?'Listado de clientes':(S.mainView==='pendientes'?'Cobros pendientes acumulados':'Listado de facturas'))+'</div>'+(!canEditData()?'<span class="readonly-hint">Solo consulta</span>':'')+'<span class="ml-auto today-display">'+todayHuman()+'</span></div>';
};

var _ovV37RenderTableBase=renderTable;
renderTable=function(){
  if(S.mainView==='clientes') return renderClientsDirectory();
  if(S.mainView==='pendientes') return renderPendingInvoicesTable();
  return renderInvoicesTableV37();
};

var _ovV37RenderFilterSummaryBase=renderFilterSummary;
renderFilterSummary=function(){
  if(S.mainView==='pendientes'){
    return '<div class="filter-summary highlight-summary"><div class="sum-card"><div class="sum-label">Pendiente acumulado</div><div class="sum-value">'+dispM(pendingInvoicesTotal())+'</div></div><div class="sum-card"><div class="sum-label">Cobros pendientes</div><div class="sum-value">'+pendingInvoicesCount()+'</div></div></div>';
  }
  return _ovV37RenderFilterSummaryBase();
};

var _ovV37BindEventsBase=bindEvents;
bindEvents=function(){
  _ovV37BindEventsBase();
  var r=root();
  r.querySelectorAll('[data-action="view-pending"]').forEach(function(el){if(el._v38)return;el._v38=true;el.addEventListener('click',function(){S.mainView='pendientes';S.expandedInvoice=null;renderApp()})});
  ['m_razon'].forEach(function(id){var inp=document.getElementById(id);if(inp&&!inp._legalBound){inp._legalBound=true;inp.addEventListener('blur',function(){inp.value=normalizeLegalName(inp.value)})}});
  ['m_comercial'].forEach(function(id){var inp=document.getElementById(id);if(inp&&!inp._commercialBound){inp._commercialBound=true;inp.addEventListener('blur',function(){inp.value=normalizeCommercialName(inp.value)})}});
  document.querySelectorAll('[data-client-field$="|razonSocial"]').forEach(function(inp){if(inp._legalBound)return;inp._legalBound=true;inp.addEventListener('blur',function(){inp.value=normalizeLegalName(inp.value)})});
  document.querySelectorAll('[data-client-field$="|nombreComercial"]').forEach(function(inp){if(inp._commercialBound)return;inp._commercialBound=true;inp.addEventListener('blur',function(){inp.value=normalizeCommercialName(inp.value)})});
};

/* Ajustar textos de pagos fraccionados existentes: vencimiento -> fecha cobro */
if(typeof renderSplitRows==='function'){
  var _ovV37RenderSplitRowsBase=renderSplitRows;
  renderSplitRows=function(rows){
    var html=_ovV37RenderSplitRowsBase(rows);
    return String(html).replace(/Vencimiento/g,'Fecha cobro');
  };
}


/* =============== V39: ficha de cliente con información + histórico completo de facturas =============== */
(function(){
  var css=document.createElement('style');
  css.textContent=`
    .client-ficha{background:var(--surface-2);border-top:1px solid var(--border-light);padding:18px 20px 20px;}
    .client-ficha-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;}
    .client-ficha-title{font-size:16px;font-weight:800;letter-spacing:.01em;color:var(--text);margin:0;text-transform:uppercase;}
    .client-ficha-sub{font-size:12px;color:var(--text-muted);margin-top:2px;}
    .client-info-details{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:14px;overflow:hidden;}
    .client-info-details summary{cursor:pointer;list-style:none;padding:10px 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint);display:flex;align-items:center;justify-content:space-between;}
    .client-info-details summary::-webkit-details-marker{display:none;}
    .client-info-details summary:after{content:'▾';font-size:12px;color:var(--text-faint);transition:transform .15s ease;}
    .client-info-details[open] summary:after{transform:rotate(180deg);}
    .client-info-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;border-top:1px solid var(--border-light);padding:12px;}
    .client-info-item{background:var(--surface-2);border:1px solid var(--border-light);border-radius:8px;padding:8px 10px;min-height:48px;}
    .client-info-label{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint);margin-bottom:3px;}
    .client-info-value{font-size:12.5px;color:var(--text);font-weight:600;word-break:break-word;}
    .client-ficha-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(420px,1.35fr);gap:16px;align-items:start;}
    .client-section-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px;}
    .client-section-title{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-faint);margin:0 0 10px;}
    .service-summary-list{display:flex;flex-direction:column;gap:7px;}
    .service-summary-row{display:grid;grid-template-columns:12px 1fr auto auto;gap:8px;align-items:center;border:1px solid var(--border-light);background:var(--surface-2);border-radius:9px;padding:8px 10px;}
    .service-summary-name{font-size:12.5px;font-weight:700;color:var(--text);}
    .service-summary-meta{font-size:10.5px;color:var(--text-muted);font-family:var(--mono);}
    .service-summary-amount{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;}
    .period-mini{font-size:10px;font-weight:800;border:1px solid var(--border);border-radius:999px;padding:2px 7px;background:#fff;color:var(--text-muted);white-space:nowrap;}
    .client-history-wrap{max-height:132px;overflow-y:auto;overflow-x:hidden;border:1px solid var(--border);border-radius:10px;background:var(--surface);}
    .client-history-table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;}
    .client-history-table th{position:sticky;top:0;background:var(--surface-2);z-index:1;font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-faint);font-weight:800;padding:5px 8px;border-bottom:1px solid var(--border);white-space:nowrap;}
    .client-history-table td{padding:6px 8px;border-bottom:1px solid var(--border-light);vertical-align:middle;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .client-history-table tr:last-child td{border-bottom:none;}
    .client-history-table th:nth-child(1),.client-history-table td:nth-child(1){width:86px;}
    .client-history-table th:nth-child(2),.client-history-table td:nth-child(2){width:auto;}
    .client-history-table th:nth-child(3),.client-history-table td:nth-child(3){width:96px;text-align:right;}
    .client-history-table th:nth-child(4),.client-history-table td:nth-child(4){width:110px;text-align:center;}
    
    
    .client-history-status{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:999px;padding:2px 8px;font-size:10.5px;font-weight:800;background:#fff;white-space:nowrap;} .client-history-status.pagado{color:var(--green);border-color:var(--green-b);background:var(--green-bg);} .client-history-status.facturaEnviada{color:var(--blue);border-color:var(--blue-b);background:var(--blue-bg);} .client-history-status.pendiente{color:var(--amber);border-color:var(--amber-b);background:var(--amber-bg);} .client-history-status.cancelado{color:var(--red);border-color:var(--red-b);background:var(--red-bg);}
    .history-concept{font-weight:700;color:var(--text);white-space:nowrap;}
    .history-description{display:inline;font-size:10px;color:var(--text-muted);margin-left:5px;}
    .history-description:before{content:'· ';}
    .history-date{font-family:var(--mono);font-size:10.5px;color:var(--text-muted);}
    .client-history-total{display:flex;justify-content:flex-end;gap:14px;align-items:center;margin-top:7px;font-size:11.5px;color:var(--text-muted);}
    .client-history-total b{font-family:var(--mono);color:var(--text);font-size:14px;}
    @media(max-width:1100px){.client-ficha-grid{grid-template-columns:1fr}.client-info-grid{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.appendChild(css);

  function v39PeriodLabel(inv){
    var p=inv.period||inv.periodicidad||'unico';
    if(p==='mensual') return 'Mensual';
    if(p==='anual') return 'Anual';
    if(p==='fraccionado') return 'Fraccionado';
    return 'Único';
  }
  function v39ShortMonthLabel(mk){
    var p=(mk||'').split('-');
    if(p.length!==2) return monthLabel(mk);
    var names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return (names[parseInt(p[1],10)-1]||p[1])+' '+p[0];
  }
  function v39InvoiceDateLabel(inv){
    var d=(inv.fechaFactura||inv.invoiceDate||inv.createdDate||invoiceDueDate(inv)||'').slice(0,10);
    if(!d) return v39ShortMonthLabel(invoiceMonth(inv));
    var p=d.split('-');
    if(p.length!==3) return d;
    return p[2]+'/'+p[1]+'/'+p[0];
  }
  function v39StatusSelect(inv){
    var st=invoiceStatus(inv);
    return '<span class="client-history-status '+st+'">'+esc(STATUS_LABEL[st]||st)+'</span>';
  }
  function v39ClientInvoiceRows(c){
    return clientInvoices(c).slice().sort(function(a,b){
      var ma=invoiceMonth(a)||'', mb=invoiceMonth(b)||'';
      if(ma!==mb) return mb.localeCompare(ma);
      return (invoiceDueDate(a)||'').localeCompare(invoiceDueDate(b)||'');
    });
  }
  function v39ClientServices(c){
    var map={};
    activeServices(c).forEach(function(d){
      var sv=c.services[d.key]||{};
      var lbl=d.key==='otros'?(sv.otrosLabel||'Otros'):d.label;
      map[d.key]={key:d.key,label:lbl,color:d.color,period:sv.period||'unico',amount:Number(sv.price)||0,source:'config'};
    });
    clientInvoices(c).forEach(function(inv){
      invoiceServiceKeys(inv).forEach(function(k){
        var d=serviceDefByKey(k), lbl=d?d.label:k;
        if(!map[k]) map[k]={key:k,label:lbl,color:d?d.color:'#6B7280',period:inv.period||'unico',amount:0,source:'invoice'};
        if(inv.period==='mensual'||inv.period==='anual') map[k].period=inv.period;
      });
    });
    return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.label.localeCompare(b.label);});
  }
  function v39ClientInfo(c){
    return '<details class="client-info-details" open><summary>Información del cliente</summary>'+ 
      '<div class="client-info-grid">'+
        '<div class="client-info-item"><div class="client-info-label">Nombre comercial</div><div class="client-info-value">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Razón social</div><div class="client-info-value">'+esc(displayLegalName(c.razonSocial||''))+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Comercial</div><div class="client-info-value">'+(responsableText(c)?commercialBadge(responsableText(c)):'—')+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Forma pago habitual</div><div class="client-info-value">'+esc(defaultFormaCobro(c)||'—')+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Contacto</div><div class="client-info-value">'+esc(c.contactoNombre||'—')+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Email</div><div class="client-info-value">'+esc(c.contactoEmail||'—')+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Teléfono</div><div class="client-info-value">'+esc(c.contactoTel||'—')+'</div></div>'+ 
        '<div class="client-info-item"><div class="client-info-label">Alta</div><div class="client-info-value">'+esc(c.fechaAlta||'—')+'</div></div>'+ 
      '</div></details>';
  }
  function v39ServicesSummary(c){
    var svcs=v39ClientServices(c);
    if(!svcs.length) return '<p style="font-size:12px;color:var(--text-faint);margin:0;">Sin servicios asociados todavía.</p>';
    return '<div class="service-summary-list">'+svcs.map(function(s){
      return '<div class="service-summary-row">'+
        '<span class="dot" style="background:'+s.color+'"></span>'+ 
        '<div><div class="service-summary-name">'+esc(s.label)+'</div><div class="service-summary-meta">'+(s.source==='config'?'Servicio activo':'Detectado en facturas')+'</div></div>'+ 
        '<span class="period-mini">'+esc(PERIOD_LABEL[s.period]||v39PeriodLabel(s))+'</span>'+ 
        '<span class="service-summary-amount">'+(s.amount?dispM(s.amount):'—')+'</span>'+ 
      '</div>';
    }).join('')+'</div>';
  }
  function v39History(c){
    var invs=v39ClientInvoiceRows(c);
    if(!invs.length) return '<div class="empty-state" style="padding:28px 16px;"><h3>Sin facturas asociadas</h3><p>Cuando se creen facturas para este cliente aparecerán aquí.</p></div>';
    var total=invs.filter(function(inv){return invoiceStatus(inv)!=='cancelado';}).reduce(function(s,inv){return s+invoiceAmount(inv);},0);
    var pending=invs.filter(function(inv){var st=invoiceStatus(inv);return st!=='pagado'&&st!=='cancelado';}).reduce(function(s,inv){return s+invoiceAmount(inv);},0);
    var rows=invs.map(function(inv){
      var keys=invoiceServiceKeys(inv), d=serviceDefByKey(keys[0]||inv.serviceKey), col=d?d.color:'#6B7280';
      return '<tr class="invoice-row" data-invoice-row="'+esc(inv.id)+'">'+
        '<td><span class="history-date">'+esc(v39InvoiceDateLabel(inv))+'</span></td>'+ 
        '<td><span class="svc-dot" style="background:'+col+'"></span><span class="history-concept">'+esc(invoiceServiceLabel(inv))+'</span>'+(inv.description?'<span class="history-description">'+esc(inv.description)+'</span>':'')+'</td>'+ 
        '<td class="money-cell">'+dispM(invoiceAmount(inv))+'</td>'+ 
        '<td>'+v39StatusSelect(inv)+'</td>'+ 
      '</tr>';
    }).join('');
    return '<div class="client-history-wrap"><table class="client-history-table"><thead><tr><th>Fecha factura</th><th>Concepto</th><th style="text-align:right">Precio</th><th>Estado</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+ 
      '<div class="client-history-total"><span>Total histórico: <b>'+dispM(total)+'</b></span><span>Pendiente: <b>'+dispM(pending)+'</b></span></div>';
  }
  function renderClientFichaV39(c){
    return '<tr class="dr"><td colspan="7"><div class="client-ficha">'+
      '<div class="client-ficha-head"><div><h3 class="client-ficha-title">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</h3><div class="client-ficha-sub">'+esc(displayLegalName(c.razonSocial||''))+'</div></div><button class="btn btn-sm" data-action="toggle-client-ficha" data-id="'+esc(c.id)+'">Cerrar ficha</button></div>'+ 
      v39ClientInfo(c)+
      '<div class="client-ficha-grid">'+
        '<div class="client-section-card"><p class="client-section-title">Servicios asociados</p>'+v39ServicesSummary(c)+'</div>'+ 
        '<div class="client-section-card"><p class="client-section-title">Histórico de facturas y cobros</p>'+v39History(c)+'</div>'+ 
      '</div>'+ 
    '</div></td></tr>';
  }

  var oldRenderClientsDirectory=renderClientsDirectory;
  renderClientsDirectory=function(){
    var list=filteredClientsDirectory();
    if(!list.length) return '<div class="table-wrap"><div class="empty-state"><h3>Sin clientes</h3><p>Ningún cliente coincide con los filtros actuales.</p></div></div>';
    var rows=list.map(function(c){
      var monthTotal=clientMonthTotalFromInvoices(c,S.month);
      var pending=clientPendingTotalFromInvoices(c);
      return '<tr class="cr clients-table" data-client-row="'+esc(c.id)+'">'+
        '<td><div class="client-main">'+esc((c.nombreComercial||c.razonSocial||'').toUpperCase())+'</div><div class="client-sub">'+esc(displayLegalName(c.razonSocial||''))+'</div></td>'+ 
        '<td>'+commercialBadge(responsableText(c))+'</td>'+ 
        '<td>'+esc(defaultFormaCobro(c)||'—')+'</td>'+ 
        '<td>'+clientServicesChips(c)+'</td>'+ 
        '<td class="client-total-mini">'+dispM(monthTotal)+'</td>'+ 
        '<td class="client-total-mini" style="color:var(--amber)">'+dispM(pending)+'</td>'+ 
        '<td style="text-align:right"><button class="client-open-btn" data-client-open="'+esc(c.id)+'">Ver ficha</button></td>'+ 
      '</tr>'+(S.expanded===c.id?renderClientFichaV39(c):'');
    }).join('');
    return '<div class="table-wrap"><div class="table-scroll"><table><thead><tr>'+ 
      '<th><button class="th-sort" data-sort="cliente">Cliente'+sortIndicator('cliente')+'</button></th>'+ 
      '<th><button class="th-sort" data-sort="comercial">Comercial'+sortIndicator('comercial')+'</button></th>'+ 
      '<th>Forma pago</th><th>Servicios asociados</th>'+ 
      '<th style="text-align:right"><button class="th-sort" data-sort="importe">Total mes'+sortIndicator('importe')+'</button></th>'+ 
      '<th style="text-align:right">Pendiente total</th><th></th>'+ 
    '</tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  };

  var oldBindEventsV39=bindEvents;
  bindEvents=function(){
    oldBindEventsV39();
    var r=root();
    if(!r) return;
    r.querySelectorAll('[data-action="toggle-client-ficha"]').forEach(function(el){
      if(el._v39) return; el._v39=true;
      el.addEventListener('click',function(e){e.stopPropagation();S.expanded=null;S.expandedInvoice=null;renderApp();});
    });
  };
})();
