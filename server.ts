import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route: Alternative posters
  app.get("/api/media/posters", async (req, res) => {
    try {
      const tmdbId = req.query.tmdbId as string;
      const type = req.query.type as string; // 'movie' or 'tv'
      if (!tmdbId || !type || !["movie", "tv"].includes(type)) {
        res.status(400).json({ error: "Missing or invalid tmdbId or type parameters." });
        return;
      }

      const posters: { url: string; source: string }[] = [];

      // 1. Fetch TMDB Posters
      try {
        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
        const tmdbResponse = await fetch(tmdbUrl);
        if (tmdbResponse.ok) {
          const tmdbData = await tmdbResponse.json();
          if (tmdbData.posters && Array.isArray(tmdbData.posters)) {
            tmdbData.posters.slice(0, 40).forEach((p: any) => {
              if (p.file_path) {
                posters.push({
                  url: `https://image.tmdb.org/t/p/w780${p.file_path}`,
                  source: "TMDb Alternate"
                });
              }
            });
          }
        }
      } catch (tmdbErr) {
        console.error("TMDB posters fetch error:", tmdbErr);
      }

      // 2. Map TMDB ID to IMDb ID
      let imdbId = "";
      try {
        if (type === "movie") {
          const movieDetailUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
          const detailRes = await fetch(movieDetailUrl);
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            imdbId = detailData.imdb_id || "";
          }
        } else {
          const externalIdsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
          const extRes = await fetch(externalIdsUrl);
          if (extRes.ok) {
            const extData = await extRes.json();
            imdbId = extData.imdb_id || "";
          }
        }
      } catch (idErr) {
        console.error("IMDb ID retrieval error:", idErr);
      }

      // 3. Query IMDb High-Res Databases (with failover Options)
      if (imdbId) {
        // Option A: imdb8 API (API-Dojo)
        try {
          const imdb8Url = `https://imdb8.p.rapidapi.com/title/get-images?tconst=${imdbId}&limit=40`;
          const response = await fetch(imdb8Url, {
            headers: {
              "x-rapidapi-key": "f91e3d503dmsh698c9a6917375fcp1c8dc5jsn40d873d2a23c",
              "x-rapidapi-host": "imdb8.p.rapidapi.com"
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data.images)) {
              data.images.forEach((img: any) => {
                if (img.url) {
                  posters.push({
                    url: img.url,
                    source: "IMDb Movie Database"
                  });
                }
              });
            }
          }
        } catch (imdb8Err) {
          console.warn("IMDb8 API fetch error:", imdb8Err);
        }

        // Option B: MoviesDatabase API (Failover)
        try {
          const moviesDbUrl = `https://moviesdatabase.p.rapidapi.com/titles/${imdbId}/images?limit=40`;
          const response = await fetch(moviesDbUrl, {
            headers: {
              "x-rapidapi-key": "f91e3d503dmsh698c9a6917375fcp1c8dc5jsn40d873d2a23c",
              "x-rapidapi-host": "moviesdatabase.p.rapidapi.com"
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.results && Array.isArray(data.results)) {
              data.results.forEach((item: any) => {
                const imgUrl = item.image?.url || item.url;
                if (imgUrl) {
                  posters.push({
                    url: imgUrl,
                    source: "IMDb Database"
                  });
                }
              });
            }
          }
        } catch (moviesDbErr) {
          console.warn("MoviesDatabase API fetch error:", moviesDbErr);
        }
      }

      // 4. Deduplicate poster objects by unique URLs
      const seenUrls = new Set<string>();
      const uniquePosters = posters.filter(p => {
        if (!p.url) return false;
        const urlKey = p.url.trim().toLowerCase();
        if (seenUrls.has(urlKey)) return false;
        seenUrls.add(urlKey);
        return true;
      });

      res.json(uniquePosters);
    } catch (e: any) {
      console.error("Alternative posters retrieval handler failed:", e);
      res.json([]);
    }
  });

  // Serve static/compiled frontend
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Since we're in Express v5, use '*all' as specified in instructions
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
