export const origin = "https://www.innovatio-brutalis.se";

export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

export const areaServed = [
  { "@type": "City", name: "Malmö" },
  { "@type": "AdministrativeArea", name: "Skåne" },
  { "@type": "Place", name: "Southern Sweden" },
  { "@type": "Country", name: "Sweden", identifier: "SE" },
];

const safeUrl = (value) => {
  const url = String(value).trim();
  if (/[\u0000-\u0020]/.test(url) || !/^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#|\.{1,2}\/)/i.test(url)) {
    throw new Error(`Unsupported content URL: ${url}`);
  }
  return escapeHtml(url);
};

export const inlineMarkdown = (text) => {
  const tokens = /`([^`]+)`|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let result = "";
  let end = 0;
  for (const match of String(text).matchAll(tokens)) {
    result += escapeHtml(text.slice(end, match.index));
    const [, code, alt, image, label, link, strong, emphasis] = match;
    if (code !== undefined) result += `<code>${escapeHtml(code)}</code>`;
    else if (image !== undefined) result += `<img src="${safeUrl(image)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;">`;
    else if (link !== undefined) result += `<a href="${safeUrl(link)}">${inlineMarkdown(label)}</a>`;
    else if (strong !== undefined) result += `<strong>${inlineMarkdown(strong)}</strong>`;
    else result += `<em>${inlineMarkdown(emphasis)}</em>`;
    end = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(end));
};

// Content uses a small, escaped Markdown subset; raw HTML never becomes executable.
export const renderMarkdown = (body, title = "") => {
  const lines = String(body).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  let fence = null;
  let code = [];
  const flush = () => {
    if (paragraph.length) output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (fence !== null) {
        output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        fence = null;
        code = [];
      } else {
        flush();
        fence = line.slice(3).trim();
      }
      continue;
    }
    if (fence !== null) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (!line.trim()) flush();
    else if (heading) {
      flush();
      if (heading[1] === "#" && heading[2] === title) continue;
      const level = Math.max(2, heading[1].length);
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (paragraph.length) {
        output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
      const type = /^\d/.test(bullet[1]) ? "ol" : "ul";
      if (list !== type) {
        if (list) output.push(`</${list}>`);
        output.push(`<${type}>`);
        list = type;
      }
      output.push(`<li>${inlineMarkdown(bullet[2])}</li>`);
    } else if (/^>\s?/.test(line)) {
      flush();
      output.push(`<blockquote><p>${inlineMarkdown(line.replace(/^>\s?/, ""))}</p></blockquote>`);
    } else if (/^---+$/.test(line)) {
      flush();
      output.push('<hr class="sep">');
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  if (fence !== null) throw new Error("Unclosed Markdown code fence");
  flush();
  return output.join("\n");
};

export const serviceBodyHtml = (page) => {
  let html = renderMarkdown(page.body);
  for (const section of page.sections || []) {
    const anchor = renderMarkdown(`## ${section.before_heading}`);
    if (!section.before_heading || html.split(anchor).length !== 2) {
      throw new Error(`Section needs a unique body heading: ${section.before_heading}`);
    }
    let content;
    if (section.video) {
      const video = section.video;
      if (!/^[A-Za-z0-9_-]{11}$/.test(video.youtube_id) || !video.heading || !video.intro || !video.title) {
        throw new Error("Invalid service video");
      }
      content = `<section>
  <h2>${escapeHtml(video.heading)}</h2>
  <p>${escapeHtml(video.intro)}</p>
  <div class="video-feature"><div class="video-frame">
    <iframe data-consent-src="https://www.youtube-nocookie.com/embed/${video.youtube_id}" title="${escapeHtml(video.title)}" loading="lazy" allowfullscreen></iframe>
  </div></div>
</section>`;
    } else {
      if (typeof section.body !== "string" || !section.body.trim()) throw new Error("Missing service section body");
      content = renderMarkdown(section.body);
    }
    html = html.replace(anchor, content + "\n" + anchor);
  }
  return html;
};

export const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data, null, 2).replace(/</g, "\\u003c")}</script>`;

export const pageHtml = (page, content, schemas = []) => {
  const en = page.lang === "en";
  const url = origin + page.route;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = new URL(page.image || "/assets/og-image.jpg", origin).href;
  const alternates = page.alternate
    ? `<link rel="alternate" hreflang="sv-se" href="${origin}${en ? page.alternate : page.route}">
  <link rel="alternate" hreflang="en" href="${origin}${en ? page.route : page.alternate}">
  <link rel="alternate" hreflang="x-default" href="${origin}${en ? page.alternate : page.route}">`
    : "";
  return `<!doctype html>
<!-- Generated by tools/build-seo.mjs. Edit the corresponding content JSON. -->
<html lang="${en ? "en" : "sv"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${page.indexable === false ? '<meta name="robots" content="noindex">' : ""}
  <link rel="canonical" href="${url}">
  ${alternates}
  <meta property="og:type" content="${page.kind === "articles" ? "article" : "website"}">
  <meta property="og:site_name" content="Innovatio Brutalis">
  <meta property="og:locale" content="${en ? "en_GB" : "sv_SE"}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:alt" content="${escapeHtml(page.image_alt || page.heading)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${escapeHtml(image)}">
  <meta name="ib-nav-section" content="${page.nav || page.kind || (en ? "prototyping" : "prototypframtagning")}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/logo-square-180x180.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="theme-color" content="#262425">
  <link rel="stylesheet" href="/css/style.css">
  <script defer src="/assets/consent.js"></script>
  <link rel="stylesheet" href="/assets/consent.css">
  ${schemas.map(jsonLd).join("\n  ")}
</head>
<body>
  <div class="container">
    <div id="site-topbar"></div>
    <script defer src="/assets/site.js"></script>
    <script defer src="/assets/site-deeplinks.js"></script>
    <section class="hero" style="text-align:left;">
      <div class="brand-hero"><picture>
        <source srcset="/assets/logo.webp" type="image/webp">
        <img src="/assets/logo.png" alt="Innovatio Brutalis">
      </picture></div>
      <h1>${escapeHtml(page.heading)}</h1>
      <p class="tagline">${escapeHtml(page.intro || page.description)}</p>
    </section>
    ${content}
    <section class="card" id="${en ? "contact" : "kontakt"}" data-card-id="contact" style="margin-top:28px;">
      <h2>${en ? "Contact" : "Kontakt"}</h2>
      <p>${en ? "Email" : "E-post"}: <a href="mailto:m.arlemark@innovatio-brutalis.se">m.arlemark@innovatio-brutalis.se</a></p>
      <p>Innovatio Brutalis · Malmö, Skåne, ${en ? "Sweden" : "Sverige"}</p>
    </section>
    <footer>
      <div>Innovatio Brutalis™ — ${en ? "Trademark pending registration with PRV (Sweden)." : "Varumärket är föremål för registrering hos PRV (Sverige)."}</div>
      <div>© <span id="y"></span> Innovatio Brutalis</div>
    </footer>
  </div>
</body>
</html>
`.replace(/^[ \t]+$/gm, "");
};

export const cardsHtml = (entries, kind) => `<div class="project-grid">
${entries.map((entry) => `<article class="project-card">
  <div class="project-thumb">
    <img src="${safeUrl(entry.image || "/assets/og-image.jpg")}" alt="${escapeHtml(entry.image_alt || entry.title)}" loading="lazy" decoding="async">
    <span class="project-tag">${escapeHtml(entry.category || (kind === "case" ? "Case" : "Artikel"))}</span>
  </div>
  <div class="project-content">
    <h2><a href="/${kind}/${entry.slug}/"${kind === "articles" ? ` data-article-slug="${entry.slug}"` : ""}>${escapeHtml(entry.title)}</a></h2>
    <p>${escapeHtml(entry.description)}</p>
  </div>
</article>`).join("\n")}
</div>`;
