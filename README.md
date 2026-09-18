# Matemáticas en Capas

An interactive calculus tutor with progressive explanations, animated equation steps, and English/Spanish exercises.

## Live site

[Open the tutor](https://raphael-solace.github.io/math-ai-tutor/)

GitHub Pages publishes the repository root from `main`. Edit `index.html` to update the app. The original HTML filename redirects to the site root and preserves exercise links.

## Local preview

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/.

All exercises, hints, and feedback work without an AI service. Local previews optionally use an OpenAI-compatible proxy at `http://localhost:8787/v1/chat/completions`. Supply `?proxy=YOUR_ENDPOINT` to override it. Hosted pages only call a proxy when explicitly configured; use an HTTPS endpoint that permits the site's origin. Never include credentials in the URL or this repository.
