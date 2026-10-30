// Schermata di accesso a tutto schermo: login, registrazione con codice
// d'invito e avviso del backup. Ritorna una Promise che si risolve a login fatto.
(function () {

function scaricaBackup() {
  const json = window.MyGym.store.exportData();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `mygym-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function messaggioErrore(err) {
  const m = String((err && err.message) || err || '');
  if (/database error saving new user|invite|invito/i.test(m)) return 'Codice di invito non valido.';
  if (/already registered|already been registered/i.test(m)) return 'Esiste già un account con questa mail. Prova ad accedere.';
  if (/invalid login/i.test(m)) return 'Mail o password non corretti.';
  if (/at least 6/i.test(m)) return 'La password deve avere almeno 6 caratteri.';
  if (/valid email|invalid format/i.test(m)) return 'La mail non sembra valida.';
  if (/fetch|network|raggiungibile/i.test(m)) return 'Impossibile collegarsi: controlla la connessione.';
  return 'Qualcosa è andato storto: ' + m;
}

function show() {
  return new Promise((resolve) => {
    const cloud = window.MyGym.cloud;
    let mode = 'login';

    const root = document.createElement('div');
    root.className = 'auth-screen';
    root.innerHTML = `
      <div class="auth-card glass">
        <h1 class="auth-title">MyGym</h1>
        <div class="auth-backup">
          <strong>Prima di accedere è consigliato fare un backup dei dati.</strong>
          <button type="button" class="btn btn-glass w-full" data-auth="backup">Scarica backup dei dati</button>
        </div>
        <div class="auth-tabs">
          <button type="button" class="btn btn-glass" data-auth="tab-login">Accedi</button>
          <button type="button" class="btn btn-glass" data-auth="tab-signup">Registrati</button>
        </div>
        <input class="auth-input" name="nickname" placeholder="Nickname" autocomplete="nickname" data-solo-signup hidden />
        <input class="auth-input" name="email" type="email" placeholder="Mail" autocomplete="email" />
        <div class="auth-pass">
  <input class="auth-input" name="password" type="password" placeholder="Password" autocomplete="current-password" />
  <button type="button" class="auth-eye" data-auth="occhio" aria-label="Mostra password">👁</button>
</div>
<input class="auth-input" name="password2" type="password" placeholder="Conferma password" autocomplete="new-password" data-solo-signup hidden />
        <input class="auth-input" name="code" placeholder="Codice d'invito" autocomplete="off" data-solo-signup hidden />
        <p class="auth-msg" role="alert"></p>
        <button type="button" class="btn btn-primary w-full" data-auth="invia">Accedi</button>
      </div>`;
    document.body.appendChild(root);

    const msg = root.querySelector('.auth-msg');
    const sendBtn = root.querySelector('[data-auth="invia"]');
    const field = (n) => root.querySelector(`[name="${n}"]`);
    const label = () => (mode === 'login' ? 'Accedi' : 'Crea account');

    function setMsg(text, ok) {
      msg.textContent = text || '';
      msg.classList.toggle('auth-msg-ok', !!ok);
    }
    function setMode(m) {
      mode = m;
      root.querySelectorAll('[data-solo-signup]').forEach((e) => { e.hidden = m !== 'signup'; });
      field('password').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
      root.querySelector('[data-auth="tab-login"]').classList.toggle('auth-tab-on', m === 'login');
      root.querySelector('[data-auth="tab-signup"]').classList.toggle('auth-tab-on', m === 'signup');
      sendBtn.textContent = label();
      setMsg('');
    }

    async function invia() {
      setMsg('');
      const email = field('email').value.trim();
      const password = field('password').value;
      if (!email || !password) return setMsg('Inserisci mail e password.');
      const nickname = field('nickname').value.trim();
      const code = field('code').value.trim();
      if (mode === 'signup' && (!nickname || !code)) return setMsg('Inserisci nickname e codice d\'invito.');
      if (mode === 'signup' && password !== field('password2').value) {
  return setMsg('Le due password non coincidono.');
}
      sendBtn.disabled = true;
      sendBtn.textContent = 'Attendi…';
      try {
        if (mode === 'login') {
          await cloud.signIn(email, password);
        } else {
          const r = await cloud.signUp({ nickname, email, password, code });
          if (!r.session) {
            setMode('login');
            setMsg('Account creato! Controlla la tua mail, conferma e poi accedi.', true);
            return;
          }
        }
        root.remove();
        resolve();
      } catch (e) {
        setMsg(messaggioErrore(e));
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = label();
      }
    }

    root.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-auth]');
      if (!t) return;
      const a = t.dataset.auth;
      if (a === 'backup') scaricaBackup();
      else if (a === 'tab-login') setMode('login');
      else if (a === 'tab-signup') setMode('signup');
      else if (a === 'invia') invia();
      else if (a === 'occhio') {
  const mostra = field('password').type === 'password';
  field('password').type = mostra ? 'text' : 'password';
  field('password2').type = mostra ? 'text' : 'password';
}
    });

    setMode('login');
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.authScreen = { show };

})();