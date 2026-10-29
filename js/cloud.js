// Sincronizzazione cloud (Supabase). Si aggancia a store.onChange: non serve
// toccare state.js. Se il cloud non e' raggiungibile l'app resta locale.
(function () {

const SUPABASE_URL = 'https://qzqnrtjrmxfpvkbineup.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eAG5KOwXd3XbtwR3zAklnQ_J6KeykU-';
const META_KEY = 'mygym.cloud.v1';

let client = null;
let applying = false;
let pushTimer = null;

function getClient() {
  if (client) return client;
  if (!window.supabase) return null;
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

function getMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; }
}
function setMeta(patch) {
  try { localStorage.setItem(META_KEY, JSON.stringify({ ...getMeta(), ...patch })); } catch (e) {}
}

function store() { return window.MyGym.store; }

function hasData(s) {
  return !!s && !!(
    (s.days || []).length || (s.exercises || []).length || (s.workouts || []).length ||
    (s.measurements || []).length || (s.meals || []).length || s.activeWorkout
  );
}

async function getSession() {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session || null;
}

async function signUp({ nickname, email, password, code }) {
  const c = getClient();
  if (!c) throw new Error('Cloud non raggiungibile. Controlla la connessione.');
  const { data, error } = await c.auth.signUp({
    email, password,
    options: { data: { nickname, invite_code: code } },
  });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const c = getClient();
  if (!c) throw new Error('Cloud non raggiungibile. Controlla la connessione.');
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  const c = getClient();
  if (c) await c.auth.signOut();
  setMeta({ synced: false, userId: null, dirty: false });
}

async function push() {
  const c = getClient();
  const session = await getSession();
  if (!c || !session) return false;
  const now = new Date().toISOString();
  const { error } = await c.from('mygym_data').upsert({
    user_id: session.user.id,
    nickname: (session.user.user_metadata || {}).nickname || null,
    data: store().get(),
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (error) { setMeta({ dirty: true }); return false; }
  setMeta({ synced: true, userId: session.user.id, lastSyncedAt: now, dirty: false });
  return true;
}

function applyCloud(row, uid) {
  applying = true;
  try { store().importData(JSON.stringify(row.data)); } finally { applying = false; }
  setMeta({ synced: true, userId: uid, lastSyncedAt: row.updated_at, dirty: false });
}

// Da chiamare dopo il login e a ogni apertura dell'app.
// Ritorna { status } con: offline | loggedout | error | uploaded | downloaded | kept-local | ok
async function sync() {
  const c = getClient();
  if (!c) return { status: 'offline' };
  const session = await getSession();
  if (!session) return { status: 'loggedout' };
  const uid = session.user.id;

  const { data: row, error } = await c.from('mygym_data')
    .select('data, updated_at').eq('user_id', uid).maybeSingle();
  if (error) return { status: 'error', error };

  const meta = getMeta();
  const local = store().get();
  const cloudHas = !!row && hasData(row.data);
  const knownDevice = meta.synced && meta.userId === uid;

  // Account vuoto: salgono i dati di questo dispositivo.
  if (!cloudHas) { await push(); return { status: 'uploaded' }; }

  // Primo accesso di questo dispositivo con questo account.
  if (!knownDevice) {
    if (!hasData(local)) { applyCloud(row, uid); return { status: 'downloaded' }; }
    if (JSON.stringify(local) === JSON.stringify(row.data)) {
      setMeta({ synced: true, userId: uid, lastSyncedAt: row.updated_at, dirty: false });
      return { status: 'ok' };
    }
    const keepCloud = window.confirm(
      'Su questo dispositivo e nel cloud ci sono dati diversi.\n\n' +
      'OK = tieni i dati del CLOUD (sostituiscono quelli di questo dispositivo)\n' +
      'Annulla = tieni i dati di QUESTO DISPOSITIVO (sostituiscono quelli nel cloud)'
    );
    if (keepCloud) { applyCloud(row, uid); return { status: 'downloaded' }; }
    await push();
    return { status: 'kept-local' };
  }

  // Dispositivo gia' collegato: vince l'ultima modifica.
  if (meta.dirty) { await push(); return { status: 'uploaded' }; }
  if (!meta.lastSyncedAt || row.updated_at > meta.lastSyncedAt) {
    applyCloud(row, uid);
    return { status: 'downloaded' };
  }
  return { status: 'ok' };
}

function start() {
  store().onChange(() => {
    if (applying) return;
    setMeta({ dirty: true });
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') push();
  });
}

window.MyGym = window.MyGym || {};
window.MyGym.cloud = { signUp, signIn, signOut, getSession, sync, push, start };

})();