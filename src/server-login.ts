import { api, serverMode, ServerSession } from './app/core/server-connection';
export async function requireServerSession():Promise<void> {
  if(!serverMode()) return;
  try {window.__ALMENDROS_SESSION__=await api<ServerSession>('/auth/session');return;}catch{ /* Show sign in; never fall back to a local database. */ }
  await new Promise<void>(resolve=>{
    const panel=document.createElement('section');panel.className='server-login';
    panel.innerHTML=`<style>
    .server-login{max-width:420px;margin:10vh auto;padding:28px;background:white;border:1px solid #d8d0c7;border-radius:8px;font:16px system-ui;color:#35281f}
    .server-login input,.server-login button{box-sizing:border-box;display:block;width:100%;padding:12px;margin:8px 0 18px;font:inherit}
    .server-login button{background:#5c4034;color:white;border:0;border-radius:4px;cursor:pointer}.server-login p{line-height:1.5}.server-login [role=alert]{color:#a02020}
    </style><h1>Almendros POS</h1><p>Acceso al servidor. Las operaciones de esta versión requieren conexión.</p>
    <form id="owner-login"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button>Iniciar sesión</button></form>
    <details><summary>Probar una demo con código temporal</summary><p>Usa únicamente datos ficticios. El código funciona una sola vez y el acceso vence.</p><form id="demo-login"><label>Código de 12 dígitos<input name="code" inputmode="numeric" pattern="[0-9]{12}" autocomplete="off" required></label><button>Entrar a la demo</button></form></details><p role="alert"></p>`;
    document.body.append(panel);
    for(const name of ['owner','demo']) panel.querySelector<HTMLFormElement>(`#${name}-login`)!.addEventListener('submit',async(event)=>{
      event.preventDefault();const form=event.currentTarget as HTMLFormElement;
      const button=form.querySelector('button')!;button.disabled=true;
      const input=Object.fromEntries(new FormData(form));
      try {window.__ALMENDROS_SESSION__=await api<ServerSession>(`/auth/${name==='owner'?'login':'demo'}`,input);form.reset();panel.remove();resolve();}
      catch(error){panel.querySelector('[role=alert]')!.textContent=error instanceof Error?error.message:'No se pudo iniciar sesión.';}
      finally{button.disabled=false;}
    });
  });
}
