// Extracts i18n dictionaries (I, QBANK) from wireframe-v2.html into JSON locale files.
// Usage: node scripts/extract-i18n.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, '..', 'wireframe-v2.html'), 'utf8');
const lines = html.split('\n');

// Line ranges (1-based, inclusive) containing the pure-data dictionaries:
//  1018-2310  const I = {...} + v2 extension IIFE
//  2318-3827  const QBANK = {...} (es, en)
//  3834-5600  I_DE, QBANK_DE, I_PT, QBANK_PT, deepMergeLang, merges, resultsUI, testmode
const slice = (from, to) => lines.slice(from - 1, to).join('\n');
const code = [
  slice(1018, 2310),
  slice(2318, 3827),
  slice(3834, 5600),
  'return { I, QBANK };',
].join('\n');

const { I, QBANK } = new Function(code)();

// Convert wireframe `{name}` placeholders to i18next `{{name}}`.
const fix = (v) => {
  if (typeof v === 'string') return v.replace(/\{(\w+)\}/g, '{{$1}}');
  if (Array.isArray(v)) return v.map(fix);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]));
  return v;
};

// UI-chrome strings not present in the wireframe dictionaries (kept here so
// re-running the extractor never loses them).
const EXTRA = {
  es: {
    common: {
      appTagline: 'Bridge the AI Gap',
      loading: 'Cargando…',
      errorGeneric: 'Algo salió mal. Inténtalo de nuevo.',
      retry: 'Reintentar',
      save: 'Guardar',
      cancel: 'Cancelar',
      logout: 'Cerrar sesión',
      myAccount: 'Mi cuenta',
      language: 'Idioma',
      theme: 'Tema',
      themeLight: 'Claro',
      themeDark: 'Oscuro',
      toggleTheme: 'Cambiar tema',
      toggleMenu: 'Abrir/cerrar menú',
      todo: 'Pendiente (fase 2)',
      backendOffline: 'No se pudo contactar el backend. Puedes continuar; los datos se sincronizarán más tarde.',
    },
    auth: {
      checkInboxTitle: 'Revisa tu bandeja de entrada',
      checkInboxSub: 'Si el email existe, te enviamos un enlace mágico a {{email}}. Caduca en 15 minutos.',
      resend: 'Reenviar enlace',
      useAnotherEmail: 'Usar otro email',
      devHint: 'DEV: el backend no envía correo real en local — copia el magic link impreso en la consola de uvicorn y ábrelo aquí.',
      verifying: 'Verificando tu enlace…',
      verifyError: 'El enlace no es válido o ya expiró.',
      backToLogin: 'Volver a iniciar sesión',
      missingToken: 'Falta el token en la URL.',
      invalidEmail: 'Ingresa un email válido.',
    },
    notFound: { title: 'Página no encontrada', sub: 'La ruta que buscas no existe o fue movida.', cta: 'Ir al dashboard' },
    onboarding: {
      stepOf: 'Paso {{current}} de {{total}}',
      finish: 'Ir al dashboard',
      savedOffline: 'Guardado localmente (backend no disponible).',
      frameworksTitle: 'Marcos de cumplimiento',
      areasTitle: 'Áreas funcionales a evaluar',
      leadersTitle: 'Invita a los líderes de cada área',
      leadersSub: 'Opcional en esta fase — podrás invitarlos desde Equipo.',
      inviteName: 'Nombre',
      inviteEmail: 'Email',
      inviteAdd: 'Añadir invitación',
    },
  },
  en: {
    common: {
      appTagline: 'Bridge the AI Gap',
      loading: 'Loading…',
      errorGeneric: 'Something went wrong. Please try again.',
      retry: 'Retry',
      save: 'Save',
      cancel: 'Cancel',
      logout: 'Log out',
      myAccount: 'My account',
      language: 'Language',
      theme: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      toggleTheme: 'Toggle theme',
      toggleMenu: 'Toggle menu',
      todo: 'TODO (phase 2)',
      backendOffline: 'Could not reach the backend. You can continue; data will sync later.',
    },
    auth: {
      checkInboxTitle: 'Check your inbox',
      checkInboxSub: 'If the email exists, we sent a magic link to {{email}}. It expires in 15 minutes.',
      resend: 'Resend link',
      useAnotherEmail: 'Use another email',
      devHint: 'DEV: the backend does not send real email locally — copy the magic link printed in the uvicorn console and open it here.',
      verifying: 'Verifying your link…',
      verifyError: 'This link is invalid or has expired.',
      backToLogin: 'Back to login',
      missingToken: 'Missing token in the URL.',
      invalidEmail: 'Enter a valid email.',
    },
    notFound: { title: 'Page not found', sub: 'The route you are looking for does not exist or was moved.', cta: 'Go to dashboard' },
    onboarding: {
      stepOf: 'Step {{current}} of {{total}}',
      finish: 'Go to dashboard',
      savedOffline: 'Saved locally (backend unavailable).',
      frameworksTitle: 'Compliance frameworks',
      areasTitle: 'Functional areas to assess',
      leadersTitle: 'Invite the leaders of each area',
      leadersSub: 'Optional at this stage — you can invite them later from Team.',
      inviteName: 'Name',
      inviteEmail: 'Email',
      inviteAdd: 'Add invitation',
    },
  },
  de: {
    common: {
      appTagline: 'Bridge the AI Gap',
      loading: 'Wird geladen…',
      errorGeneric: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
      retry: 'Erneut versuchen',
      save: 'Speichern',
      cancel: 'Abbrechen',
      logout: 'Abmelden',
      myAccount: 'Mein Konto',
      language: 'Sprache',
      theme: 'Design',
      themeLight: 'Hell',
      themeDark: 'Dunkel',
      toggleTheme: 'Design wechseln',
      toggleMenu: 'Menü umschalten',
      todo: 'TODO (Phase 2)',
      backendOffline: 'Backend nicht erreichbar. Sie können fortfahren; Daten werden später synchronisiert.',
    },
    auth: {
      checkInboxTitle: 'Posteingang prüfen',
      checkInboxSub: 'Falls die E-Mail existiert, haben wir einen Magic Link an {{email}} gesendet. Er läuft in 15 Minuten ab.',
      resend: 'Link erneut senden',
      useAnotherEmail: 'Andere E-Mail verwenden',
      devHint: 'DEV: Das Backend versendet lokal keine echten E-Mails — kopiere den Magic Link aus der uvicorn-Konsole und öffne ihn hier.',
      verifying: 'Link wird verifiziert…',
      verifyError: 'Dieser Link ist ungültig oder abgelaufen.',
      backToLogin: 'Zurück zur Anmeldung',
      missingToken: 'Token in der URL fehlt.',
      invalidEmail: 'Bitte eine gültige E-Mail eingeben.',
    },
    notFound: { title: 'Seite nicht gefunden', sub: 'Die gesuchte Route existiert nicht oder wurde verschoben.', cta: 'Zum Dashboard' },
    onboarding: {
      stepOf: 'Schritt {{current}} von {{total}}',
      finish: 'Zum Dashboard',
      savedOffline: 'Lokal gespeichert (Backend nicht verfügbar).',
      frameworksTitle: 'Compliance-Frameworks',
      areasTitle: 'Zu bewertende Funktionsbereiche',
      leadersTitle: 'Lade die Leiter der Bereiche ein',
      leadersSub: 'In dieser Phase optional — Einladung später über Team möglich.',
      inviteName: 'Name',
      inviteEmail: 'E-Mail',
      inviteAdd: 'Einladung hinzufügen',
    },
  },
  pt: {
    common: {
      appTagline: 'Bridge the AI Gap',
      loading: 'A carregar…',
      errorGeneric: 'Algo correu mal. Tente novamente.',
      retry: 'Tentar novamente',
      save: 'Guardar',
      cancel: 'Cancelar',
      logout: 'Terminar sessão',
      myAccount: 'A minha conta',
      language: 'Idioma',
      theme: 'Tema',
      themeLight: 'Claro',
      themeDark: 'Escuro',
      toggleTheme: 'Alternar tema',
      toggleMenu: 'Alternar menu',
      todo: 'TODO (fase 2)',
      backendOffline: 'Não foi possível contactar o backend. Pode continuar; os dados serão sincronizados mais tarde.',
    },
    auth: {
      checkInboxTitle: 'Verifique a sua caixa de entrada',
      checkInboxSub: 'Se o email existir, enviámos um link mágico para {{email}}. Expira em 15 minutos.',
      resend: 'Reenviar link',
      useAnotherEmail: 'Usar outro email',
      devHint: 'DEV: o backend não envia email real localmente — copie o magic link impresso na consola do uvicorn e abra-o aqui.',
      verifying: 'A verificar o seu link…',
      verifyError: 'Este link é inválido ou expirou.',
      backToLogin: 'Voltar ao login',
      missingToken: 'Token em falta na URL.',
      invalidEmail: 'Introduza um email válido.',
    },
    notFound: { title: 'Página não encontrada', sub: 'A rota que procura não existe ou foi movida.', cta: 'Ir para o dashboard' },
    onboarding: {
      stepOf: 'Passo {{current}} de {{total}}',
      finish: 'Ir para o dashboard',
      savedOffline: 'Guardado localmente (backend indisponível).',
      frameworksTitle: 'Frameworks de conformidade',
      areasTitle: 'Áreas funcionais a avaliar',
      leadersTitle: 'Convide os líderes de cada área',
      leadersSub: 'Opcional nesta fase — poderá convidá-los mais tarde em Equipa.',
      inviteName: 'Nome',
      inviteEmail: 'Email',
      inviteAdd: 'Adicionar convite',
    },
  },
};

const outDir = join(root, 'src', 'i18n', 'locales');
mkdirSync(outDir, { recursive: true });
for (const lang of ['es', 'en', 'de', 'pt']) {
  const base = fix(I[lang]);
  const extra = EXTRA[lang];
  // Deep-merge one level down so EXTRA sections never clobber wireframe sections.
  const merged = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const b = merged[k];
    merged[k] = b && typeof b === 'object' && !Array.isArray(b) ? { ...b, ...v } : v;
  }
  writeFileSync(join(outDir, `${lang}.json`), JSON.stringify(merged, null, 2) + '\n');
  writeFileSync(join(outDir, `qbank.${lang}.json`), JSON.stringify(fix(QBANK[lang]), null, 2) + '\n');
  console.log(lang, 'I keys:', Object.keys(merged).length, '| QBANK keys:', Object.keys(QBANK[lang]).length);
}
console.log('Done ->', outDir);
