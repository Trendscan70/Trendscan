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

## Lettura dentro TrendScan e filtri di qualità
- **Pagina articolo interna.** Cliccando una notizia si resta su TrendScan (indirizzo `/#a/ID`, condivisibile). Si vedono titolo, fonte, data, immagine, categoria e la breve anteprima pubblicata dalla testata. Il pulsante «Torna alla home di TrendScan» è in cima e in fondo; il tasto indietro del browser riporta alla stessa posizione della home. Il testo integrale **non** viene riprodotto (diritto d'autore, e i giornali non permettono l'incorporamento in iframe): un pulsante rimanda all'articolo sul sito della fonte, che è citata in ogni card e in ogni pagina.
- **Cosa viene scartato** (in `scripts/build-feeds.mjs`, soglie in `config/sources.json` → `articles`):
  - `minSummaryChars` (90): notizie con anteprima più corta, o che ripete solo il titolo.
  - `excludeTitle`: flash di borsa/spread del tipo «Borsa: Milano chiude in rialzo…».
  - `similarTitle` (0,6): doppioni sullo stesso fatto, anche da testate diverse (resta il più recente).
  - fuori tema: dalle testate non `trusted` passano solo gli articoli che corrispondono a una categoria (su titolo e anteprima).
  - **a pagamento** (`checkPaywall`): la pagina originale viene visitata una sola volta e si scarta l'articolo se dichiara di non essere gratuito (JSON-LD `isAccessibleForFree: false` o meta `article:content_tier` = `locked`/`metered`). Se la pagina non risponde o non dichiara nulla, l'articolo resta. Per escludere del tutto una testata aggiungi `"paywall": "skip"` alla sua riga in `sources`.
- Il log della raccolta (Actions) elenca quanti articoli sono stati scartati e per quale motivo. I risultati dei controlli sono salvati in `articles.json` (campi `pw` e `blocked`), così le pagine non vengono rivisitate a ogni ora.

## Mercati e Termometro TrendScan
Fascia «Mercati» in home e pagina `#mercati`: **cambi BCE** (EUR/USD, EUR/GBP, EUR/CHF, EUR/JPY) e **Termometro TrendScan** (0-100, tono delle notizie raccolte).
- **Zero crediti Netlify.** `scripts/build-markets.mjs` gira nello stesso workflow degli articoli (dopo di essi, perché il termometro li legge), scrive `markets.json` nel ramo `data` e il sito lo legge da lì, come per articoli e video. Nessun deploy.
- **Cambi: fonte primaria BCE** (file XML ufficiali `eurofxref-hist-90d.xml`, con `eurofxref-daily.xml` di riserva). Politica di riutilizzo del SEBC (verificata il 17/10/2026): riutilizzo gratuito, anche commerciale, **citando la fonte e senza modificare le statistiche**. Per questo i tassi sono salvati e mostrati cifra per cifra come pubblicati (cambia solo il separatore decimale), con la dicitura «Source: ECB statistics.» sempre visibile; variazioni % e grafici sono etichettati come elaborazioni TrendScan. I tassi sono «solo a scopo informativo»: nel sito c'è sempre l'avviso che non vanno usati per transazioni. La BCE viene interrogata al massimo ogni `refreshHours` (3) ore.
- **Termometro:** conteggio di parole chiave positive/negative su titolo (peso doppio) e anteprima delle notizie delle ultime 48 h, con peso che si dimezza ogni 24 h; inversione per spread/inflazione/bollette (un calo è una buona notizia). Dizionario, soglie e pesi sono in `config/markets.json` → `sentiment`. Nel risultato non compare nessun testo degli articoli, solo conteggi. Lo storico giornaliero (180 giorni) è dentro `markets.json`. Metodo e limiti sono spiegati ai lettori in `/metodo/#termometro`. **Le soglie 40/60 sono provvisorie**: rivedile dopo qualche settimana di storico.
- **Aggiungere un'altra fonte (indici, BTP, materie prime…).** Ogni fonte in `config/markets.json` → `sources` gira solo se `enabled: true` **e** `license.verified: true`. Procedura: (1) leggi e verifica le condizioni d'uso della fonte (ridistribuzione pubblica? uso commerciale? attribuzione? divieto di modifica? limiti di richieste?); (2) compila `license` con link, attribuzione e condizioni; (3) aggiungi il tipo in `PROVIDERS` dentro `build-markets.mjs`; (4) metti `verified: true`. Attenzione: gli indici (es. FTSE MIB) e molti prezzi di borsa sono dati con licenza, anche se visibili gratis su altri siti.
- **Se qualcosa non risponde:** i cambi restano quelli precedenti e il sito li segna come «non aggiornati»; senza dati la fascia in home si nasconde da sola. Il log di Actions riporta una riga per fonte e per termometro.

## Pagina Criptovalute (`/criptovalute/`)
Guida per principianti, raggiungibile dalla voce «Criptovalute» del menu (accanto a «Mercati»): cosa sono, quante ce ne sono, le più consolidate e meno volatili, come si custodiscono, exchange italiani e internazionali. È una pagina statica (`public/criptovalute/index.html`), quindi non consuma crediti e non dipende dai dati orari.
- **Contiene numeri e fatti che invecchiano** (prezzi di Bitcoin ed Ethereum, numero di criptovalute, aliquota fiscale, elenco degli operatori autorizzati MiCA). Ogni dato riporta la sua data, e la pagina dichiara «Aggiornata il …». **Rivedila almeno ogni 1-2 mesi** e a ogni novità normativa, aggiornando anche `dateModified` nel JSON-LD, la data in `sitemap.xml` e le FAQ strutturate.
- **Fonti primarie** da riverificare a ogni revisione: comunicato congiunto Consob-Banca d'Italia sugli operatori italiani abilitati (30/06/2026) e registro ESMA dei CASP. L'elenco degli exchange esteri si basa su tracker che leggono il registro ESMA (30/09 e 7/10/2026): è un punto di partenza, non una verifica, e lo dice la pagina stessa.
- **Linee guida editoriali già applicate:** elenchi in ordine alfabetico e dichiarati «non una classifica»; nessun link di affiliazione né link diretto agli exchange (solo registri ufficiali delle autorità); avviso sui rischi in cima; nessuna promessa di rendimento; tasse e consulenza rimandate a un commercialista.
- **Menu:** le etichette «Video Educativi» e «Guide & Calcolatore» sono state accorciate in «Video» e «Guide» (come già sul telefono) per fare spazio alla settima voce senza far sbordare l'intestazione; il titolo completo resta nel tooltip e nelle pagine.

## Trend Radar (dentro Mercati)
Blocco «Trend Radar» nella sezione Mercati della home (4 classifiche compatte) e classifiche complete nella pagina `#mercati`. **Nessuna voce nuova nel menu.** Descrive cosa sta crescendo adesso: non è una previsione né un consiglio (il sito lo dichiara ovunque; evita di presentarlo come «previsione delle tendenze»).
- **Tre misure separate, mai sommate** (colonne, etichette e colori distinti nel sito): 🔎 **Interesse** = letture settimanali delle pagine Wikipedia in italiano (API ufficiale Wikimedia, dati CC0, `scripts/build-radar.mjs`); 📰 **Notizie** = quota di articoli che citano un tema e numero di testate diverse che raccontano la stessa storia (da `articles.json`); 💹 **Prezzi** = variazione a 30 giorni dei cambi BCE (da `markets.json`, già presenti).
- **Perché non le «ricerche».** Google Trends non ha un'API pubblica (l'API ufficiale è in alpha su candidatura) e gli scraper non ufficiali sono fragili e contrari ai termini: non si usano. Wikipedia misura la lettura di un'enciclopedia, non le ricerche: il sito lo dice.
- **«ETF più cercati»: dato non disponibile.** Non esiste (che sappiamo) una fonte gratuita e riutilizzabile di ricerche per singolo ETF: il sito lo dichiara invece di inventare una classifica, e mostra interesse e menzioni per «ETF» in generale e per gli indici di riferimento (S&P 500, Nasdaq, MSCI World, FTSE MIB, DAX). Se in futuro avrai una fonte con licenza, si aggiunge in `config/radar.json` → `sources` (cancello `license.verified`).
- **Zero crediti Netlify:** `build-radar.mjs` gira nello stesso workflow, dopo gli articoli; scrive `radar.json` (pubblico) e `radar-state.json` (storico interno) nel ramo `data`. Wikipedia viene interrogata al massimo ogni 12 ore (~30 richieste, con User-Agent identificabile e pause di ~0,5 s, sotto i limiti Wikimedia).
- **Temi:** l'elenco (33 argomenti: «established», «emerging», «index») è in `config/radar.json`, ciascuno con la pagina Wikipedia e un'espressione regolare per le notizie (scritta senza accenti). I titoli Wikipedia sono risolti a ogni raccolta (redirect seguiti, pagine mancanti o di disambiguazione scartate): **controlla nel log di Actions le righe «pagina … mancante/disambigua»** e correggi il titolo in `config/radar.json`.
- **Primi giorni:** la misura delle notizie ha bisogno di storico. Il sito mostra «in costruzione» finché non ci sono almeno 4 giorni, un confronto parziale fino a 14 giorni e poi 7 contro 7. L'interesse (Wikipedia) è disponibile fin dal primo giorno.
- **Copertura delle testate:** `build-feeds.mjs` conta, prima di scartare i doppioni, quante testate diverse hanno un titolo molto simile (parole di routine escluse, almeno 3 parole in comune, entro 36 h) e salva `covBy` negli articoli. Soglie in `config/sources.json` (`coverageSimilarity`, `coverageMinShared`, `coverageHours`).
- **Cosa controllare dopo il primo giro di Actions:** righe «Calcola il Trend Radar» (pagine Wikipedia risolte, notizie contate) e che il blocco compaia in home sotto i cambi. Limiti noti: temi scelti dalla redazione (il Radar non scopre temi fuori elenco), notizie solo delle testate seguite, coperture a volte unite o perse per titoli molto diversi. Metodo spiegato ai lettori in `/metodo/#radar`.

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


## SEO
- **Indirizzo del sito**: `https://trendscan26.netlify.app` è scritto in `public/index.html` (canonical, Open Graph, JSON-LD), `public/robots.txt` e `public/sitemap.xml`. Se passi a un dominio proprio, sostituiscilo in questi tre file.
- **Search Console**: aggiungi il sito su https://search.google.com/search-console (proprietà «Prefisso URL»), verifica la proprietà, invia `sitemap.xml` e usa «Controllo URL → Richiedi indicizzazione». Fai lo stesso su Bing Webmaster Tools.
- **Plugin Netlify «Sitemap»**: rigenera `sitemap.xml` a ogni pubblicazione e può sovrascrivere questa versione; conviene disinstallarlo (Netlify → Integrations).
- Quando le sezioni avranno indirizzi propri (`/guide/...`) vanno aggiunte alla sitemap.

## Pagine di fiducia
`/chi-siamo/`, `/contatti/` (email trendscan@proton.me), `/metodo/`, `/privacy/`, `/cookie/`, `/avvertenze/` sono pagine HTML statiche (cartelle in `public/`), collegate dal footer e presenti in `sitemap.xml`. Prima dell'attivazione di pubblicità o statistiche vanno aggiornate privacy e cookie policy. Nella privacy c'è un commento HTML «TODO» per inserire nome e recapito del titolare del trattamento.
