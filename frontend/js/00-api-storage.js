(function(){
  "use strict";

  var API_BASE=(window.__EMMA_API_BASE__||"/api").replace(/\/$/,"");
  var TOKEN_KEY="emma_session_token";
  var USER_KEY="emma_session_user";

  function readStoredUser(){
    try{
      var raw=localStorage.getItem(USER_KEY);
      return raw?JSON.parse(raw):null;
    }catch(e){
      return null;
    }
  }

  function dispatchUnauthorized(){
    try{window.dispatchEvent(new CustomEvent("emma:unauthorized"));}catch(e){}
  }

  async function request(method,path,body){
    var options={method:method,headers:{}};
    var token=localStorage.getItem(TOKEN_KEY);
    if(token) options.headers["Authorization"]="Bearer "+token;
    if(body!==undefined){
      options.headers["Content-Type"]="application/json";
      options.body=JSON.stringify(body);
    }
    var response=await fetch(API_BASE+path,options);
    if(response.status===401&&token){
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      dispatchUnauthorized();
    }
    if(!response.ok){
      var text="";
      try{text=await response.text();}catch(e){}
      var message=text;
      try{var parsed=JSON.parse(text);message=parsed&&parsed.error?parsed.error:text}catch(e){}
      throw new Error(message||("HTTP "+response.status));
    }
    if(response.status===204) return null;
    return response.json();
  }

  window.apiClient={
    clearSession:function(){
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    getStoredSession:function(){
      var token=localStorage.getItem(TOKEN_KEY)||"";
      var user=readStoredUser();
      return token&&user?{token:token,user:user}:null;
    },
    login:async function(email,password){
      var data=await request("POST","/auth/login",{email:email,password:password});
      localStorage.setItem(TOKEN_KEY,data.token);
      localStorage.setItem(USER_KEY,JSON.stringify(data.user));
      return data;
    },
    logout:async function(){
      try{await request("POST","/auth/logout");}catch(e){}
      this.clearSession();
    },
    me:function(){
      return request("GET","/auth/me");
    },
    register:function(payload){
      return request("POST","/auth/register",payload);
    },
    request:request,
    saveSession:function(token,user){
      localStorage.setItem(TOKEN_KEY,token);
      localStorage.setItem(USER_KEY,JSON.stringify(user));
    }
  };

  window.storage={
    get:function(key,globalScope){
      return request("GET","/storage/"+encodeURIComponent(key)+(globalScope?"?scope=global":""));
    },
    set:function(key,value,globalScope){
      return request("PUT","/storage/"+encodeURIComponent(key),{value:value,scope:globalScope?"global":"local"});
    }
  };
})();
