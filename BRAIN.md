# CineLog System Blueprint (BRAIN.md)

This document serves as the absolute single source of truth for the **Cinelog** application. It reverse-engineers the system architecture, state flow, database models, integrations, caching policies, and performance strategies for future developers or AI agents.

---

## 1. System Architecture Overview

Cinelog is built as a highly performant, minimalist, single-page application leveraging **React**, **Vite**, **Tailwind CSS v4**, and **Zustand** state management, integrated directly with a real-time **Google Firebase Firestore** persistence layer.

### System Topography Diagram
```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT-SIDE FRONTEND                          │
│                                                                        │
│   ┌───────────────────┐    Reads / Writes    ┌──────────────────────┐  │
│   │    React Views    │ ◄──────────────────► │  Zustand State Store │  │
│   │ (Dashboard, etc.) │                      │  (store/useStore.ts) │  │
│   └─────────┬─────────┘                      └──────────┬───────────┘  │
│             │                                           │              │
│             │ Calls                                     │ Syncs        │
│             ▼                                           ▼              │
│   ┌───────────────────┐                      ┌──────────────────────┐  │
│   │ API Proxy Service │                      │  Window Bridge API   │  │
│   │ (services/api.ts) │                      │ (index.html Script)  │  │
│   └─────────┬─────────┘                      └──────────┬───────────┘  │
└─────────────┼───────────────────────────────────────────┼──────────────┘
              │                                           │
              │ Fetch / Cache (TMDB)                      │ Real-time Sync
              ▼                                           ▼
┌───────────────────────────────────────┐   ┌────────────────────────────┐
│          EXTERNAL TMDB API            │   │  FIREBASE CLOUD FIRESTORE  │
│  (Media Search, Details, Cast, etc.)  │   │  (movies, watchLists, etc.)│
│  Protected by client QueryCache       │   │  Multiplexed WebSocket     │
└───────────────────────────────────────┘   └────────────────────────────┘
```

### Core Architecture Highlights
* **Direct Script Bridging**: Firebase is loaded from Google CDN as native ES Modules directly in `index.html`. It exposes CRUD actions and subscriptions on the global `window` object (`window.addMovie`, `window.subscribeToEntries`, etc.), which are wrapped by the `/services/api.ts` module. This design guarantees instant Firestore database boottimes while decoupling React components from script load states.
* **Hybrid Storage Pattern**: Data is stored both in **Cloud Firestore** and backup **LocalStorage** (`cinelog_local_entries`, `cinelog_local_lists`, etc.). Zustand handles non-blocking writes and fallback resolution. If Firestore is offline or fails, local caching acts as the secondary offline-first engine.
* **Smart Performance Interactivity**: Includes touch targets ($\ge 48\text{px}$), smooth hardware-accelerated animations using `transform` and `opacity` (with custom `cubic-bezier(0.4, 0, 0.2, 1)` easing), and native CSS animations wrapped inside `@media (prefers-reduced-motion: no-preference)`.

---

## 2. File & Directory Guide

```
├── App.tsx                  # Root router, visual core, custom responsive sidebar navigation.
├── index.html               # Firebase client-side SDK init, window binding, global layout styles.
├── index.tsx                # Frontend mounting entrypoint.
├── index.css                # Global styles, Tailwind v4 imports, premium micro-interaction classes.
├── types.ts                 # Strong TypeScript type definitions (WatchEntry, CustomList, etc.).
├── vite.config.ts           # Development server proxying, alias setups, and Tailwind integration.
├── metadata.json            # Frame permissions and system capability descriptor metadata.
├── services/
│   └── api.ts               # Core external communication proxy with robust Query Cache mechanism.
├── store/
│   ├── useStore.ts          # Central state engine managing list merging, local persistence, syncs.
│   └── useToastStore.ts     # Minimalist toast-based feedback manager.
├── components/
│   ├── CachedImage.tsx      # Pre-fetching, fallback support, layout shift-guarded image system.
│   ├── EntryCard.tsx        # Card display showing individual log metadata, posters, action buttons.
│   ├── GlassSurface.tsx     # Custom glassmorphic blur using SVG-filtered layers.
│   ├── StreamSourcesModal.tsx# Watch provider information search (JustWatch/TMDB integration).
│   ├── EditEntryModal.tsx   # Inline film review/score updates and local persistence writes.
│   └── logo.tsx             # Inline SVG branding asset.
└── pages/
    ├── Dashboard.tsx        # Chronological timeline feed of logs with filtering & display controls.
    ├── ExplorePage.tsx      # TMDB search feed, trending charts, modular person & company credits.
    ├── WatchListPage.tsx    # Unwatched titles wishlist & custom lists manager.
    ├── Profile.tsx          # Advanced genre radar DNA graphs, watch velocity lines, backup tools.
    └── RecapPage.tsx        # Highlight generator, annual stats, shareable visual recap canvases.
```

---

## 3. Data Flow & Synchronization Engine

The state architecture is designed around non-blocking local state mutations backed up by real-time cloud streams.

### Synchronization Workflow (Zustand + Firestore)
1. **Frontend Request**: User adds, modifies, or deletes an entry.
2. **Optimistic Local Update**: Zustand immediately updates local state, pushes an offline JSON backup to `localStorage`, and triggers any reactive UI components.
3. **Async Cloud Update**: The corresponding promise wrapper in `services/api.ts` sends the request across the native Firestore socket.
4. **Subscription Merging**: Real-time snapshots received from `onSnapshot` inside `index.html` fire a callback to `api.ts`, which notifies the Zustand store listeners.
5. **Conflict Resolution**: Local-only entries (IDs prefixed with `local-`) are automatically merged with cloud entries to prevent data overwriting when internet connection drops and returns.

---

## 4. Query Caching Protocol (Network Optimization)

To optimize network traffic, prevent API rate limits, and provide a native-app speed sensation, `/services/api.ts` implements a centralized, in-memory **Query Cache Layer (`QueryCache`)**.

### Caching Rules & TTL Config
| Cache Prefix Key | Extent | Target Data | TTL (Time-To-Live) |
| :--- | :--- | :--- | :--- |
| `media_by_id_` | Global | TMDB Film/Show Basic Metadata | 1 Hour (`3600000ms`) |
| `collection_` | Global | Movie franchise sequence maps | 1 Hour (`3600000ms`) |
| `search_` | Parameter | Multi-resource search queries | 5 Minutes (`300000ms`) |
| `trending_` | Combined | Daily TMDB Discover/Trending Feed | 10 Minutes (`600000ms`) |
| `top_rated_` | Combined | Highly Rated Discover listings | 30 Minutes (`1800000ms`) |
| `details_` | Global | Rich overview, runtimes, studio lists | 1 Hour (`3600000ms`) |
| `credits_` | Global | Actor listings, directors, crew | 1 Hour (`3600000ms`) |
| `search_people_` | Parameter | Actor/Crew directory lookups | 10 Minutes (`600000ms`) |
| `company_media_`| Parameter | Production house search arrays | 1 Hour (`3600000ms`) |

### Pending Promise Deduplication
The `QueryCache` tracks ongoing fetch promises within a private `pending` map. If three components request the details for the same movie simultaneously, they are bound to the exact same promise instance. This reduces redundant concurrent requests down to a single fetch.

---

## 5. Critical Database & Data Models

### 1. WatchEntry (Collection: `movies`)
```typescript
interface WatchEntry {
  id: string;             // Firestore document ID or "local-*" prefix
  tmdbId: number;         // External reference to TMDB database
  type: 'movie' | 'tv';   // Media category
  title: string;          // Main title
  posterUrl: string;      // Image link
  watchDate: string;      // ISO String or YYYY-MM-DD watch log
  rating: Rating;         // BAD | MID | GOOD | PEAK | VAGUE
  isVague?: boolean;      // Marks subjective rating
  isAbsoluteCinema?: boolean; // Highlights top-tier cinematic achievements
  isRewatch?: boolean;    // Rewatched indicator
  isFavorite?: boolean;   // Appears in profile hero cards
  isBlurred?: boolean;    // Spoilers or preference blur
  review?: string;        // Textual writeup
  year: number;           // Calculated watch year
  releaseYear?: string;   // Media publication year
  genres: string[];       // Calculated genre names
  runtime: number;        // Media length (in minutes)
  studios?: string[];     // Production houses
  createdAt?: string;     // Record creation timestamp
}
```

### 2. CustomList & WatchList (Collections: `customLists` & `watchLists`)
```typescript
interface CustomList {
  id: string;             // Document ID or "local-custom-*" prefix
  name: string;           // Custom list name
  items: WatchListItem[]; // Array of bookmarked media items
  description?: string;   // Explanatory summary text
  createdAt?: string;     // Creation timestamp
}
```

---

## 6. Performance & UX Optimization Blueprint

Cinelog employs advanced performance-centric constraints to maximize rendering metrics:

### Below-the-Fold Lazy Loading & High-Priority Preloading
* **LCP Prioritization**: Images in the first viewport (such as the top 4 dashboard cards) are rendered with `loading="eager"` and `fetchPriority="high"`. This reduces Largest Contentful Paint delays.
* **Native Lazy Loading**: All other media card images use native `loading="lazy"` to defer bandwidth consumption until scrolled.
* **Layout Shift Prevention**: All images are bound to explicit container aspect ratios (e.g., `aspect-[2/3]` or `w-16 h-24`) to completely eliminate Layout Shift (CLS < 0.1).

### Micro-Interactions & Hardware Acceleration
* **Layout Animations**: The application restricts heavy layout recalculations. Animations are strictly limited to `opacity` and hardware-accelerated `transform` variables using the CSS engine:
  * Scale up on hover: `transform: scale(1.05)`
  * Scale down on active touch/click: `transform: scale(0.98)`
  * Transition duration is locked between 150ms and 200ms using the cubic-bezier ease-out curve.
* **Reduced Motion Compliance**: Motion animations are wrapped in media selectors:
  ```css
  @media (prefers-reduced-motion: no-preference) {
    .premium-interactive:hover { transform: scale(1.05); }
    .premium-interactive:active { transform: scale(0.98); }
  }
  ```
* **Touch Targets**: Standardized target fields ensure all buttons, links, and interactive elements possess a minimum hit box area of $48\text{px} \times 48\text{px}$.

---

## 7. Compliance Verification & Target Solutions

### 1. Inlined SVGs & Resource preloading (Lighthouse Performance $\ge 90$)
* **Inline Graphic Elements**: All critical brand marks (such as the primary CineLog SVG brand-mark) are entirely inlined inside the markup bundle via `/components/logo.tsx` as dedicated React Functional elements. This avoids cold-fetch latency and guarantees immediate visual rendering.
* **Google Fonts Preconnecting**: Standard link preconnections `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` are added in the `<head>` of `/index.html` to eliminate DNS and SSL handshaking delays.

### 2. Database Connection Pooling (Engineered for High-Concurrency)
* **Client-Multiplexed Sockets**: Because the app is a React Single Page Application (SPA) interfacing directly with Firebase Cloud Firestore on the client side, traditional database connection pooling is managed natively by the Firebase Web SDK.
* **Connection Re-Use**: Firestore multiplexes all transactions and listening streams (e.g., `subscribeToEntries`) over a single underlying WebSocket or HTTP/2 persistent streaming connection. This completely avoids "connection per request" overhead, meaning client connection churn under heavy user traffic is zero.

### 3. In-Memory Cache Layer
* **Request Cache (`QueryCache`)**: An in-process Map caching layer is built into `/services/api.ts` to cache heavy TMDB API fetches.
* **De-duplication**: If concurrent components request details of the same movie, the pending requests are matched to the same unresolved promise, preventing redundant network requests.

### 4. Client-Side Request Cache
* **Zustand Local Sync**: The Zustand store (`store/useStore.ts`) serves as the client's ultra-fast in-memory state store. When navigating between screens, the app immediately reuses the synchronized memory state instead of triggering fresh reads from the cloud, providing a native-app speed.

### 5. Repeated Read Query Caching
* **Real-time Snapshot Subscriptions**: The application subscribes to Firestore collections (`movies`, `watchLists`, `customLists`) upon bootup. This subscription updates state via tiny cloud-pushed delta snapshots only when actual changes happen, avoiding high-frequency database read query volume.

---

## 8. Potential Failure Points & Troubleshooting

1. **Hydration / Mounted Delay**: In Recharts containers (like the RadarChart in `Profile.tsx`), rendering before browser initialization causes structural calculation bugs. A local `isMounted` hook check must guard all Recharts initial rendering.
2. **JSON Circular Reference**: Zustands local state serialization uses a custom circular-reference tracking sanitizer (`safeClone`) during backups to avoid throwing `TypeError` exceptions.
3. **Database Availability Sync Blockers**: In offline modes, document IDs starting with the prefix `local-` must remain distinct. If writing directly to Firestore, these identifiers are translated into authentic cloud document hashes and synchronized backwards to the local storage states.
4. **TMDB Key Exhaustion / Retries**: The TMDB fetch service contains a built-in automated exponential-backoff retry pattern (`fetchWithRetry`) to handle intermittent gateway timeouts or api throttling.
