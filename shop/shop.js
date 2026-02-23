(() => {
	const qs = (sel) => document.querySelector(sel);
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

	const normalizeCategory = (c) => {
		if (!c || typeof c !== "object") return null;
		if (c.slug && (c.title || c.name)) {
			return {
				slug: String(c.slug),
				title: String(c.title || c.name || c.slug),
				order: Number.isFinite(Number(c.order)) ? Number(c.order) : (Number.isFinite(Number(c.sortOrder)) ? Number(c.sortOrder) : 999),
				isActive: c.isActive !== false,
			};
		}
		if (c.slug && c.name) {
			return {
				slug: String(c.slug),
				title: String(c.name),
				order: Number.isFinite(Number(c.sortOrder)) ? Number(c.sortOrder) : 999,
				isActive: c.isActive !== false,
			};
		}
		return null;
	};

	const normalizeProduct = (p) => {
		if (!p || typeof p !== "object") return null;

		// Folder-style placeholder schema
		if (p.slug && p.title && ("price_sek" in p || "category" in p || "published" in p)) {
			const isActive = p.published !== false;
			return {
				slug: String(p.slug),
				title: String(p.title),
				categorySlug: String(p.category || ""),
				price: Number(p.price_sek ?? NaN),
				currency: "SEK",
				excerpt: String(p.excerpt || ""),
				description: String(p.description || ""),
				images: Array.isArray(p.images) ? p.images : [],
				isActive,
			};
		}

		// Legacy aggregated schema
		if (p.slug && p.title) {
			return {
				slug: String(p.slug),
				title: String(p.title),
				categorySlug: String(p.categorySlug || p.category || ""),
				price: Number(p.price ?? NaN),
				currency: String(p.currency || "SEK"),
				excerpt: String(p.excerpt || ""),
				description: String(p.description || ""),
				images: Array.isArray(p.images) ? p.images : [],
				isActive: p.isActive !== false,
			};
		}

		return null;
	};

	const loadCatalog = async () => {
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
		const categoryFilter = qs("#categoryFilter");
		const searchInput = qs("#searchInput");
		const grid = qs("#productGrid");
		if (!categoryFilter || !searchInput || !grid) return;

		grid.innerHTML = "<div class=\"card\">Loading…</div>";

		let catalog;
		try {
			catalog = await loadCatalog();
		} catch (err) {
			grid.innerHTML = `<div class=\"card\">Could not load shop data.<br><small>${esc(err?.message || err)}</small></div>`;
			return;
		}

		const categoriesSorted = [...catalog.categories]
			.filter((c) => c.isActive)
			.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));

		const productsAll = [...catalog.products]
			.filter((p) => p.isActive)
			.sort((a, b) => a.title.localeCompare(b.title));

		categoryFilter.innerHTML = "";
		categoryFilter.appendChild(new Option("All", ""));
		for (const c of categoriesSorted) categoryFilter.appendChild(new Option(c.title, c.slug));

		const render = () => {
			const selectedCategory = String(categoryFilter.value || "").trim();
			const q = String(searchInput.value || "").trim().toLowerCase();

			const products = productsAll.filter((p) => {
				if (selectedCategory && p.categorySlug !== selectedCategory) return false;
				if (q && !String(p.title || "").toLowerCase().includes(q) && !String(p.excerpt || "").toLowerCase().includes(q)) return false;
				return true;
			});

			if (!products.length) {
				grid.innerHTML = "<div class=\"card\">No products found.</div>";
				return;
			}

			grid.innerHTML = products.map((p) => {
				const img = (p.images && p.images[0]) ? String(p.images[0]) : "";
				const price = formatPrice(p.price, p.currency);
				const href = `/shop/product.html?slug=${encodeURIComponent(p.slug)}`;
				return `
					<a class=\"card product\" href=\"${href}\">
						${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\">` : `<div class=\"thumb\"></div>`}
						<div>
							<div style=\"font-weight:800\">${esc(p.title)}</div>
							${p.excerpt ? `<div class=\"badge\">${esc(p.excerpt)}</div>` : ""}
						</div>
						<div class=\"meta\">
							<div class=\"badge\">${esc(p.categorySlug || "")}</div>
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
		const view = qs("#productView");
		if (!view) return;

		const slug = new URLSearchParams(window.location.search).get("slug") || "";
		if (!slug) {
			view.innerHTML = "Missing product slug.";
			return;
		}

		view.innerHTML = "Loading…";

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
			view.innerHTML = `Could not find product: <code>${esc(slug)}</code>`;
			return;
		}

		const img = (product.images && product.images[0]) ? String(product.images[0]) : "";
		const price = formatPrice(product.price, product.currency);

		view.innerHTML = `
			<h1 style=\"margin-bottom:10px\">${esc(product.title)}</h1>
			<div class=\"price\" style=\"font-size:18px; margin-bottom:14px\">${esc(price)}</div>
			${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\" style=\"max-width:520px\">` : ""}
			${product.description ? `<div style=\"margin-top:14px; white-space:pre-wrap\">${esc(product.description)}</div>` : ""}
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
