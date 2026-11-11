import { State } from '../domain/models';
import { DataRepository } from '../domain/repository';

export interface ServerSession { userId:string; businessId:string; role:'owner'|'demo'; csrf:string; expiresAt:number; }
declare global { interface Window { __ALMENDROS_API__?: string; __ALMENDROS_SESSION__?: ServerSession; } }
export const serverMode = () => Boolean(window.__ALMENDROS_API__);
export const serverSession = () => window.__ALMENDROS_SESSION__;
let mutationEpoch=0;
export async function api<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T> {
  const response=await fetch(`${window.__ALMENDROS_API__}${path}`,{
    method,credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json',...(serverSession()?{'X-CSRF-Token':serverSession()!.csrf}:{})},
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  if(!response.ok) {
    const problem=await response.json().catch(()=>({error:'No se pudo conectar con el servidor.'}));
    if(response.status===401 && serverSession()) {
      delete window.__ALMENDROS_SESSION__;
      window.dispatchEvent(new Event('almendros-session-expired'));
    }
    throw new Error(problem.error ?? 'No se pudo completar la operación.');
  }
  return response.status===204 ? undefined as T : response.json();
}
export async function command<T>(feature:string,action:string,args:unknown[]):Promise<T> {
  const value=JSON.stringify(args);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  const key=`almendros-command:${serverSession()!.businessId}:${feature}:${action}:${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}`;
  // Retain only an opaque request ID across retries; never persist payloads or credentials.
  const id=sessionStorage.getItem(key) ?? crypto.randomUUID();sessionStorage.setItem(key,id);
  mutationEpoch++;
  try {
    const result=await api<{result:T}>(`/${feature}/${action}`,{id,args});
    sessionStorage.removeItem(key);return result.result;
  } finally {mutationEpoch++;}
}
export function remoteService<T>(feature:string):T {
  return new Proxy({}, {get:(_target,key)=> (...args:unknown[])=>command(feature,String(key),args)}) as T;
}
export class RemoteRepository implements DataRepository {
  read():Promise<State> {return api<State>('/state');}
  transact<T>(_operation:(state:State)=>T):Promise<T> {return Promise.reject(new Error('Usa una operación del servidor.'));}
  replace(_state:State):Promise<void> {return Promise.reject(new Error('Usa la importación inicial del servidor.'));}
  observe(next:(state:State)=>void,error:(error:unknown)=>void):()=>void {
    let stopped=false,active=false;
    const refresh=async()=>{if(stopped || active || document.hidden || !serverSession() || mutationEpoch%2)return;active=true;const epoch=mutationEpoch;try{const state=await this.read();if(!stopped && epoch===mutationEpoch)next(state);}catch(e){if(!stopped)error(e);}finally{active=false;}};
    const timer=setInterval(()=>void refresh(),15000);
    return ()=>{stopped=true;clearInterval(timer);};
  }
}
