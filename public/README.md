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
3. Una Netlify Function legge i file da lì con un token server-side. Se non sono raggiungibili usa `public/data/`.

Il sito viene quindi pubblicato **una volta** e poi si aggiorna da solo.

## Messa online (circa 15 minuti)
**1. GitHub**
- Carica il contenuto di questa cartella nella radice del repository, con le cartelle nascoste (`.github`). Il repository può essere privato.
- *Settings → Actions → General → Workflow permissions* → **Read and write**.
- *Actions → Aggiorna articoli e video → Run workflow*. Quando è verde nel repository compare il ramo `data`.

**2. Accesso Netlify al repository privato**
- Crea un **fine-grained personal access token** GitHub limitato a questo repository, con permesso **Contents: Read-only**. Il token serve solo alla Function per leggere i file; non inserirlo nel codice né in `public/index.html`.
- In Netlify apri *Site configuration → Environment variables* e aggiungi `GITHUB_DATA_TOKEN` con quel token. Rendi la variabile disponibile al contesto Production (e agli eventuali Deploy Previews che vuoi abilitare).
- `public/index.html` è già configurato per leggere tramite la Function. I dati sono comunque pubblici sul sito, ma il token rimane server-side.

**3. Netlify**
- *Add new project → Import an existing project* → scegli il repository.
- Le impostazioni arrivano da `netlify.toml` (cartella `public`, Function in `netlify/functions`). **Deploy**.
- Un deploy manuale della sola cartella `public` non include la Function: serve solo per provare il sito statico con i dati già presenti in `public/data`.

Se il sito deve restare privato anche nei contenuti, non esporre questa Function: il sito pubblico è progettato per mostrare gli articoli e i dati a chiunque.

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
