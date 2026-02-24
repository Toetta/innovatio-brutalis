(() => {
	const qs = (sel) => document.querySelector(sel);
	const getLang = () => {
		try {
			const params = new URLSearchParams(window.location.search || "");
			const raw = String(params.get("lang") || "").toLowerCase();
			if (raw === "en") return "en";
			if (raw === "sv") return "sv";
		} catch (_) {}
		return "sv";
	};
	const isEN = () => getLang() === "en";
	const t = (key) => {
		const en = {
			shop_title: "Shop",
			shop_intro: "Products & drops from Innovatio Brutalis.",
			category_label: "Category",
			search_label: "Search",
			search_placeholder: "Search products…",
			all_categories: "All",
			loading: "Loading…",
			not_found: "No products found.",
			load_error: "Could not load shop data.",
			missing_slug: "Missing product slug.",
			product_missing_prefix: "Could not find product:",
			back_to_shop: "← Back to shop",
		};
		const sv = {
			shop_title: "Webshop",
			shop_intro: "Produkter & drops från Innovatio Brutalis.",
			category_label: "Kategori",
			search_label: "Sök",
			search_placeholder: "Sök produkter…",
			all_categories: "Alla",
			loading: "Laddar…",
			not_found: "Inga produkter hittades.",
			load_error: "Kunde inte ladda webshop-data.",
			missing_slug: "Saknar produkt-slug.",
			product_missing_prefix: "Kunde inte hitta produkt:",
			back_to_shop: "← Tillbaka till webshop",
		};
		const dict = isEN() ? en : sv;
		return dict[key] || key;
	};
	const pickLang = (svValue, enValue, legacyValue) => {
		const sv = (svValue ?? "");
		const en = (enValue ?? "");
		const legacy = (legacyValue ?? "");
		const fallback = String(legacy || sv || en || "");
		return {
			sv: String(sv || legacy || en || fallback),
			en: String(en || legacy || sv || fallback),
		};
	};
	const normalizeImages = (imagesField, legacyImage) => {
		try {
			const arr = Array.isArray(imagesField) ? imagesField : [];
			const out = arr
				.map((x) => {
					if (typeof x === "string") return x;
					if (x && typeof x === "object") {
						// Common Decap list format: [{ image: "..." }, ...]
						return x.image || x.url || "";
					}
					return "";
				})
				.map((s) => String(s || "").trim())
				.filter(Boolean);

			if (!out.length && legacyImage) {
				out.push(String(legacyImage));
			}
			return out;
		} catch (_) {
			return legacyImage ? [String(legacyImage)] : [];
		}
	};
	const withLangQuery = (url) => {
		try {
			const u = new URL(String(url), window.location.origin);
			u.searchParams.set("lang", getLang());
			return u.pathname + (u.search ? u.search : "") + (u.hash ? u.hash : "");
		} catch (_) {
			return String(url);
		}
	};
	const applyShopI18n = () => {
		try {
			document.documentElement.lang = isEN() ? "en" : "sv";
		} catch (_) {}

		try {
			const h1 = qs(".hero h1");
			if (h1) h1.textContent = t("shop_title");
			const p = qs(".hero p");
			if (p) p.textContent = t("shop_intro");
		} catch (_) {}

		try {
			const el = qs("[data-i18n='category_label']");
			if (el) el.textContent = t("category_label");
		} catch (_) {}
		try {
			const el = qs("[data-i18n='search_label']");
			if (el) el.textContent = t("search_label");
		} catch (_) {}
		try {
			const input = qs("#searchInput");
			if (input) input.setAttribute("placeholder", t("search_placeholder"));
		} catch (_) {}
		try {
			const back = qs("a.back");
			if (back) {
				back.textContent = t("back_to_shop");
				back.setAttribute("href", withLangQuery("/shop/"));
			}
		} catch (_) {}
	};

	const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	}[ch]));

	const formatPrice = (value, currency = "SEK") => {
		const n = Number(value);
		if (!Number.isFinite(n)) return "";
		try {
			return new Intl.NumberFormat("sv-SE", { style: "currency", currency }).format(n);
		} catch (_) {
			return `${n} ${currency}`;
		}
	};

	const fetchJSON = async (url) => {
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
		return await res.json();
	};

	const fetchJSONCached = async (cacheKey, url, maxAgeMs) => {
		try {
			const key = `ib_cache:${cacheKey}`;
			const now = Date.now();
			const raw = localStorage.getItem(key);
			if (raw) {
				const parsed = JSON.parse(raw);
				const ts = Number(parsed?.ts || 0);
				if (ts && (now - ts) < (Number(maxAgeMs) || 0) && parsed?.value) {
					return parsed.value;
				}
			}
		} catch (_) {}

		const value = await fetchJSON(url);
		try {
			localStorage.setItem(`ib_cache:${cacheKey}`, JSON.stringify({ ts: Date.now(), value }));
		} catch (_) {}
		return value;
	};

	const normalizeCategory = (c) => {
		if (!c || typeof c !== "object") return null;
		if (c.slug && (c.title_sv || c.title_en || c.title || c.name)) {
			const titles = pickLang(c.title_sv, c.title_en, c.title || c.name || c.slug);
			return {
				slug: String(c.slug),
				titleSV: titles.sv,
				titleEN: titles.en,
				order: Number.isFinite(Number(c.order)) ? Number(c.order) : (Number.isFinite(Number(c.sortOrder)) ? Number(c.sortOrder) : 999),
				isActive: c.isActive !== false,
			};
		}
		return null;
	};

	const normalizeProduct = (p) => {
		if (!p || typeof p !== "object") return null;
		const tags = Array.isArray(p.tags) ? p.tags.map((x) => String(x || "").trim()).filter(Boolean) : [];

		// Folder-style placeholder schema
		if (p.slug && (p.title_sv || p.title_en || p.title) && ("price_sek" in p || "category" in p || "published" in p)) {
			const isActive = p.published !== false;
			const titles = pickLang(p.title_sv, p.title_en, p.title || p.slug);
			const excerpts = pickLang(p.excerpt_sv, p.excerpt_en, p.excerpt || "");
			const descriptions = pickLang(p.description_sv, p.description_en, p.description || "");
			const images = normalizeImages(p.images, p.image);
			return {
				slug: String(p.slug),
				titleSV: titles.sv,
				titleEN: titles.en,
				categorySlug: String(p.category || ""),
				price: Number(p.price_sek ?? NaN),
				currency: "SEK",
				excerptSV: excerpts.sv,
				excerptEN: excerpts.en,
				descriptionSV: descriptions.sv,
				descriptionEN: descriptions.en,
				images,
				tags,
				isActive,
			};
		}

		// Legacy aggregated schema
		if (p.slug && (p.title_sv || p.title_en || p.title)) {
			const titles = pickLang(p.title_sv, p.title_en, p.title || p.slug);
			const excerpts = pickLang(p.excerpt_sv, p.excerpt_en, p.excerpt || "");
			const descriptions = pickLang(p.description_sv, p.description_en, p.description || "");
			const images = normalizeImages(p.images, p.image);
			return {
				slug: String(p.slug),
				titleSV: titles.sv,
				titleEN: titles.en,
				categorySlug: String(p.categorySlug || p.category || ""),
				price: Number(p.price ?? NaN),
				currency: String(p.currency || "SEK"),
				excerptSV: excerpts.sv,
				excerptEN: excerpts.en,
				descriptionSV: descriptions.sv,
				descriptionEN: descriptions.en,
				images,
				tags,
				isActive: p.isActive !== false,
			};
		}

		return null;
	};

	const loadCatalog = async () => {
		// Best effort auto-discovery: list the folders in the GitHub repo.
		// This avoids having to manually keep content/shop-catalog.json in sync.
		const loadViaGitHub = async () => {
			const REPO = "Toetta/innovatio-brutalis";
			const REF = "main";
			const listFolder = async (folder) => {
				const apiUrl = `https://api.github.com/repos/${REPO}/contents/${folder}?ref=${encodeURIComponent(REF)}`;
				// Cache the folder listing briefly to avoid hitting rate limits,
				// but keep it short so new entries appear quickly after publishing.
				const data = await fetchJSONCached(`gh:${folder}:${REF}`, apiUrl, 60 * 1000);
				const items = Array.isArray(data) ? data : [];
				return items
					.filter((x) => x && x.type === "file" && typeof x.name === "string" && x.name.toLowerCase().endsWith(".json"))
					.map((x) => ({
						name: String(x.name),
						download_url: String(x.download_url || ""),
					}))
					.filter((x) => x.download_url);
			};

			const [categoryFiles, productFiles] = await Promise.all([
				listFolder("content/categories"),
				listFolder("content/products"),
			]);

			const categoriesRaw = await Promise.all(categoryFiles.map((f) => fetchJSON(f.download_url).catch(() => null)));
			const productsRaw = await Promise.all(productFiles.map((f) => fetchJSON(f.download_url).catch(() => null)));

			const categories = categoriesRaw.map(normalizeCategory).filter(Boolean);
			const products = productsRaw.map(normalizeProduct).filter(Boolean);
			return { categories, products };
		};

		try {
			return await loadViaGitHub();
		} catch (_) {
			// Fall back to manifest/aggregated JSON
		}

		// Preferred: manifest that lists folder-based slugs
		//   { "categorySlugs": [..], "productSlugs": [..] }
		try {
			const manifest = await fetchJSON("/content/shop-catalog.json");
			const categorySlugs = Array.isArray(manifest.categorySlugs) ? manifest.categorySlugs.map(String) : [];
			const productSlugs = Array.isArray(manifest.productSlugs) ? manifest.productSlugs.map(String) : [];

			const categoriesRaw = await Promise.all(categorySlugs.map((slug) => fetchJSON(`/content/categories/${encodeURIComponent(slug)}.json`).catch(() => null)));
			const productsRaw = await Promise.all(productSlugs.map((slug) => fetchJSON(`/content/products/${encodeURIComponent(slug)}.json`).catch(() => null)));

			const categories = categoriesRaw.map(normalizeCategory).filter(Boolean);
			const products = productsRaw.map(normalizeProduct).filter(Boolean);

			return { categories, products };
		} catch (_) {
			// Fall back to aggregated JSON files
		}

		const [categoriesDoc, productsDoc] = await Promise.all([
			fetchJSON("/content/categories.json").catch(() => ({ categories: [] })),
			fetchJSON("/content/products.json").catch(() => ({ products: [] })),
		]);

		const categories = (Array.isArray(categoriesDoc.categories) ? categoriesDoc.categories : [])
			.map(normalizeCategory)
			.filter(Boolean);
		const products = (Array.isArray(productsDoc.products) ? productsDoc.products : [])
			.map(normalizeProduct)
			.filter(Boolean);
		return { categories, products };
	};

	const renderShopIndex = async () => {
		applyShopI18n();

		const categoryFilter = qs("#categoryFilter");
		const searchInput = qs("#searchInput");
		const grid = qs("#productGrid");
		if (!categoryFilter || !searchInput || !grid) return;

		grid.innerHTML = `<div class="card">${esc(t("loading"))}</div>`;

		let catalog;
		try {
			catalog = await loadCatalog();
		} catch (err) {
			grid.innerHTML = `<div class="card">${esc(t("load_error"))}<br><small>${esc(err?.message || err)}</small></div>`;
			return;
		}

		const categoriesSorted = [...catalog.categories]
			.filter((c) => c.isActive)
			.sort((a, b) => (a.order - b.order) || String(a.titleSV || "").localeCompare(String(b.titleSV || "")));

		const productsAll = [...catalog.products]
			.filter((p) => p.isActive)
			.sort((a, b) => String(a.titleSV || "").localeCompare(String(b.titleSV || "")));

		const categoryTitleBySlug = new Map();
		for (const c of categoriesSorted) {
			const title = isEN() ? (c.titleEN || c.titleSV || c.slug) : (c.titleSV || c.titleEN || c.slug);
			categoryTitleBySlug.set(String(c.slug), String(title || c.slug));
		}

		categoryFilter.innerHTML = "";
		categoryFilter.appendChild(new Option(t("all_categories"), ""));
		for (const c of categoriesSorted) {
			const title = isEN() ? (c.titleEN || c.titleSV || c.slug) : (c.titleSV || c.titleEN || c.slug);
			categoryFilter.appendChild(new Option(String(title || c.slug), c.slug));
		}

		const render = () => {
			const selectedCategory = String(categoryFilter.value || "").trim();
			const q = String(searchInput.value || "").trim().toLowerCase();

			const products = productsAll.filter((p) => {
				const title = isEN() ? (p.titleEN || p.titleSV || "") : (p.titleSV || p.titleEN || "");
				const excerpt = isEN() ? (p.excerptEN || p.excerptSV || "") : (p.excerptSV || p.excerptEN || "");
				const tagsHaystack = Array.isArray(p.tags) ? p.tags.join(" ") : "";
				if (selectedCategory && p.categorySlug !== selectedCategory) return false;
				if (q) {
					const inTitle = String(title).toLowerCase().includes(q);
					const inExcerpt = String(excerpt).toLowerCase().includes(q);
					const inTags = String(tagsHaystack).toLowerCase().includes(q);
					if (!inTitle && !inExcerpt && !inTags) return false;
				}
				return true;
			});

			if (!products.length) {
				grid.innerHTML = `<div class="card">${esc(t("not_found"))}</div>`;
				return;
			}

			grid.innerHTML = products.map((p) => {
				const title = isEN() ? (p.titleEN || p.titleSV || p.slug) : (p.titleSV || p.titleEN || p.slug);
				const excerpt = isEN() ? (p.excerptEN || p.excerptSV || "") : (p.excerptSV || p.excerptEN || "");
				const img = (p.images && p.images[0]) ? String(p.images[0]) : "";
				const price = formatPrice(p.price, p.currency);
				const href = withLangQuery(`/shop/product.html?slug=${encodeURIComponent(p.slug)}`);
				const catLabel = categoryTitleBySlug.get(String(p.categorySlug || "")) || String(p.categorySlug || "");
				return `
					<a class=\"card product\" href=\"${href}\">
						${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\">` : `<div class=\"thumb\"></div>`}
						<div>
							<div style=\"font-weight:800\">${esc(title)}</div>
							${excerpt ? `<div class=\"badge\">${esc(excerpt)}</div>` : ""}
						</div>
						<div class=\"meta\">
							<div class=\"badge\">${esc(catLabel || "")}</div>
							<div class=\"price\">${esc(price)}</div>
						</div>
					</a>
				`;
			}).join("");
		};

		categoryFilter.addEventListener("change", render);
		searchInput.addEventListener("input", render);
		render();
	};

	const renderProductPage = async () => {
		applyShopI18n();

		const view = qs("#productView");
		if (!view) return;

		const slug = new URLSearchParams(window.location.search).get("slug") || "";
		if (!slug) {
			view.innerHTML = esc(t("missing_slug"));
			return;
		}

		view.innerHTML = esc(t("loading"));

		let product = null;
		// Prefer folder entry if it exists
		try {
			const raw = await fetchJSON(`/content/products/${encodeURIComponent(slug)}.json`);
			product = normalizeProduct(raw);
		} catch (_) {}

		// Fall back to aggregated list
		if (!product) {
			try {
				const doc = await fetchJSON("/content/products.json");
				const list = Array.isArray(doc.products) ? doc.products : [];
				product = normalizeProduct(list.find((p) => String(p.slug) === String(slug)));
			} catch (_) {}
		}

		if (!product) {
			view.innerHTML = `${esc(t("product_missing_prefix"))} <code>${esc(slug)}</code>`;
			return;
		}

		const title = isEN() ? (product.titleEN || product.titleSV || product.slug) : (product.titleSV || product.titleEN || product.slug);
		const description = isEN() ? (product.descriptionEN || product.descriptionSV || "") : (product.descriptionSV || product.descriptionEN || "");

		const img = (product.images && product.images[0]) ? String(product.images[0]) : "";
		const price = formatPrice(product.price, product.currency);

		view.innerHTML = `
			<h1 style=\"margin-bottom:10px\">${esc(title)}</h1>
			<div class=\"price\" style=\"font-size:18px; margin-bottom:14px\">${esc(price)}</div>
			${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\" style=\"max-width:520px\">` : ""}
			${description ? `<div style=\"margin-top:14px; white-space:pre-wrap\">${esc(description)}</div>` : ""}
		`;
	};

	const init = async () => {
		try {
			await renderShopIndex();
			await renderProductPage();
		} catch (_) {
			// no-op
		}
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
