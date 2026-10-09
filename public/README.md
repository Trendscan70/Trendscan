# TrendScan – Hub di finanza personale

Sito statico con articoli di finanza personale (da feed RSS dei giornali italiani), playlist di video educativi (canali YouTube italiani) e guide con simulatore PAC. Nessuna chiave API.

```
public/            <- il sito (è l'unica cartella pubblicata da Netlify)
scripts/           build-feeds.mjs: raccoglie articoli e video
config/            sources.json: testate, categorie, canali
.github/workflows/ update-feeds.yml: raccolta automatica ogni ora
netlify.toml       configurazione Netlify
```

## Come funzionano i dati (importante per Netlify)
Su Netlify ogni pubblicazione in produzione consuma crediti (15 ciascuna; il piano gratuito ne ha 300 al mese). Per questo gli aggiornamenti orari **non** passano dal sito:
1. GitHub Actions raccoglie articoli e video ogni ora.
2. Li salva nel ramo **`data`** del repository (un solo commit, sempre sostituito). Netlify non pubblica quel ramo (`ignore` in `netlify.toml`).
3. Il sito legge i file da lì (`DATA_BASE` in `public/index.html`). Se non sono raggiungibili usa `public/data/`.

Il sito viene quindi pubblicato **una volta** e poi si aggiorna da solo.

## Messa online (circa 15 minuti)
**1. GitHub**
- Crea un repository **pubblico** (serve per leggere i file del ramo `data`) e carica il contenuto di questa cartella nella radice, con le cartelle nascoste (`.github`).
- *Settings → Actions → General → Workflow permissions* → **Read and write**.
- *Actions → Aggiorna articoli e video → Run workflow*. Quando è verde nel repository compare il ramo `data`.

**2. Indirizzo dei dati**
In `public/index.html` imposta `DATA_BASE` con il tuo utente e repository:
`https://raw.githubusercontent.com/UTENTE/REPOSITORY/data/`  (slash finale incluso)

**3. Netlify**
- *Add new project → Import an existing project* → scegli il repository.
- Le impostazioni arrivano da `netlify.toml` (cartella `public`, nessun build command). **Deploy**.
- In alternativa, per una prova veloce: *Deploy manually* e trascina la cartella `public`.

## Personalizzare
Tutto in `config/sources.json`: testate (feed RSS, con ricerca automatica se non funzionano), categorie e parole chiave, canali YouTube (lo script controlla che il nome del canale corrisponda prima di accettarlo).

## Provare in locale
```
npm run build:feeds   # scrive in public/data
npm run serve         # http://localhost:8080
```
Dopo la raccolta leggi il log: indica testate raggiunte e canali non trovati.

## Note
- **Tailwind** è precompilato in `public/tailwind.css`; se cambi le classi: `npm install` e `npm run build:css`.
- **Diritti.** Si mostrano solo titolo, anteprima breve e link all'originale; i video sono incorporati dal player ufficiale di YouTube.
- **Avvertenza.** Contenuti informativi, non consulenza finanziaria.

## Modalità scura
Pulsante 🌙/☀️ nell'intestazione: ricorda la scelta (localStorage) e al primo accesso segue le impostazioni del dispositivo.

## Pubblicità e guadagni
Il sito è predisposto ma **non mostra annunci** finché non attivi `public/ads.js` (`enabled: true`).
1. **Requisiti AdSense**: account approvato, dominio proprio (di norma non bastano sottodomini gratuiti), contenuti originali e pagine *Privacy* e *Cookie policy*.
2. **Consenso (obbligatorio nello SEE)**: Google richiede una CMP certificata con TCF (es. iubenda, Cookiebot, Real Cookie Banner). La CMP deve emettere `document.dispatchEvent(new Event('trendscan:ads-consent'))` solo dopo il consenso: gli annunci non partono prima.
3. **Impostazioni**: in `ads.js` inserisci `client` (`ca-pub-…`) e gli ID degli annunci; sostituisci `public/ads.txt` con la riga di AdSense.
4. **Affiliazioni broker**: in `app.js` (`BROKERS`) compila `aff` con il tuo link di affiliazione: compare l'etichetta «Pubblicità», `rel="sponsored"` e la nota di trasparenza. In Italia le comunicazioni promozionali devono essere riconoscibili come tali (linee guida AGCOM, avvertenze Consob). Evita raccomandazioni personalizzate su singoli prodotti.
5. I ricavi dipendono dal traffico: con un sito nuovo sono tipicamente modesti.
