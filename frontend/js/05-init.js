
(async function init(){
  renderAuth();
  var session=window.apiClient&&window.apiClient.getStoredSession?window.apiClient.getStoredSession():null;
  if(!session){
    return;
  }
  try{
    var me=await window.apiClient.me();
    auth.sessionToken=session.token;
    applyAuthenticatedUser(me&&me.user?me.user:session.user);
    await showApp();
  }catch(e){
    if(window.apiClient&&window.apiClient.clearSession) window.apiClient.clearSession();
    auth.current=null;auth.sessionToken='';
    renderAuth();
  }
})();
