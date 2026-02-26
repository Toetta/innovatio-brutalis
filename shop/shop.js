(() => {
	const IBShop = (window.IBShop = window.IBShop || {});
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
			nav_cart: "Cart",
			nav_profile: "Profile",
			nav_login: "Login",
			nav_logout: "Logout",
			cart_title: "Cart",
			cart_empty: "Cart is empty.",
			add_to_cart: "Add to cart",
			remove: "Remove",
			qty: "Qty",
			total: "Total",
			all_categories: "All",
			loading: "Loading…",
			not_found: "No products found.",
			load_error: "Could not load shop data.",
			missing_slug: "Missing product slug.",
			product_missing_prefix: "Could not find product:",
			back_to_shop: "← Back to shop",
			checkout: "Checkout",
			vat_included_short: "incl. VAT",
			vat_included_se: "incl. VAT",
		};
		const sv = {
			shop_title: "Webshop",
			shop_intro: "Produkter & drops från Innovatio Brutalis.",
			category_label: "Kategori",
			search_label: "Sök",
			search_placeholder: "Sök produkter…",
			nav_cart: "Kundvagn",
			nav_profile: "Profil",
			nav_login: "Logga in",
			nav_logout: "Logga ut",
			cart_title: "Kundvagn",
			cart_empty: "Kundvagnen är tom.",
			add_to_cart: "Lägg i kundvagn",
			remove: "Ta bort",
			qty: "Antal",
			total: "Summa",
			all_categories: "Alla",
			loading: "Laddar…",
			not_found: "Inga produkter hittades.",
			load_error: "Kunde inte ladda webshop-data.",
			missing_slug: "Saknar produkt-slug.",
			product_missing_prefix: "Kunde inte hitta produkt:",
			back_to_shop: "← Tillbaka till webshop",
			checkout: "Till kassan",
			vat_included_short: "inkl. moms",
			vat_included_se: "inkl. moms",
		};
		const dict = isEN() ? en : sv;
		return dict[key] || key;
	};

	const apiRequest = async (method, path, body) => {
		const res = await fetch(path, {
			method,
			headers: {
				...(body ? { "content-type": "application/json" } : {}),
				"accept": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
			credentials: "include",
			cache: "no-store",
		});
		let data = null;
		const ct = res.headers.get("content-type") || "";
		if (ct.includes("application/json")) data = await res.json().catch(() => null);
		else data = await res.text().catch(() => "");
		if (!res.ok) {
			const err = new Error("API error");
			err.status = res.status;
			err.data = data;
			throw err;
		}
		return data;
	};

	// --- Cart (minimal MVP) ---
	const CART_KEY = "ib_shop_cart_v1";
	const readCart = () => {
		try {
			const raw = localStorage.getItem(CART_KEY);
			if (!raw) return { items: {} };
			const parsed = JSON.parse(raw);
			const items = (parsed && typeof parsed === "object" && parsed.items && typeof parsed.items === "object") ? parsed.items : {};
			return { items };
		} catch (_) {
			return { items: {} };
		}
	};
	const writeCart = (cart) => {
		try {
			localStorage.setItem(CART_KEY, JSON.stringify(cart));
		} catch (_) {}
	};
	const getCartQtyTotal = (cart) => {
		try {
			const items = (cart && cart.items) ? cart.items : {};
			return Object.values(items).reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0);
		} catch (_) {
			return 0;
		}
	};
	const setCartQty = (slug, qty) => {
		const s = String(slug || "").trim();
		if (!s) return;
		const q = Math.max(0, Math.floor(Number(qty) || 0));
		const cart = readCart();
		cart.items = (cart.items && typeof cart.items === "object") ? cart.items : {};
		if (q <= 0) delete cart.items[s];
		else cart.items[s] = q;
		writeCart(cart);
		try { window.dispatchEvent(new CustomEvent("ib:cart_changed", { detail: { slug: s, qty: q } })); } catch (_) {}
	};
	const addToCart = (slug, delta = 1) => {
		const s = String(slug || "").trim();
		if (!s) return;
		const cart = readCart();
		cart.items = (cart.items && typeof cart.items === "object") ? cart.items : {};
		const prev = Math.max(0, Math.floor(Number(cart.items[s]) || 0));
		const next = Math.max(0, prev + Math.max(1, Math.floor(Number(delta) || 1)));
		cart.items[s] = next;
		writeCart(cart);
		try {
			if (typeof window.gtag === "function") {
				window.gtag("event", "add_to_cart", {
					currency: "SEK",
					items: [{ item_id: s, quantity: next }],
				});
			}
		} catch (_) {}
		try { window.dispatchEvent(new CustomEvent("ib:cart_changed", { detail: { slug: s, qty: next } })); } catch (_) {}
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

		// Action buttons on index page
		try {
			const cartBtn = qs("#cartBtn");
			if (cartBtn) {
				cartBtn.setAttribute("title", t("nav_cart"));
				cartBtn.setAttribute("aria-label", t("nav_cart"));
			}
			const profile = qs("#profileLink");
			if (profile) {
				profile.setAttribute("title", t("nav_profile"));
				profile.setAttribute("aria-label", t("nav_profile"));
			}
			const authBtn = qs("#authBtn");
			const authText = qs("#authText");
			if (authBtn) {
				authBtn.setAttribute("title", t("nav_login"));
				authBtn.setAttribute("aria-label", t("nav_login"));
			}
			if (authText) authText.textContent = t("nav_login");
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

	const vatLabel = (countryCode) => {
		const c = String(countryCode || "SE").trim().toUpperCase();
		return c === "SE" ? t("vat_included_se") : t("vat_included_short");
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
		const cartCard = qs("#cartCard");
		const cartBtn = qs("#cartBtn");
		const cartCount = qs("#cartCount");
		const authBtn = qs("#authBtn");
		const authText = qs("#authText");
		const authIconLogin = qs("#authIconLogin");
		const authIconLogout = qs("#authIconLogout");
		if (!categoryFilter || !searchInput || !grid) return;

		let isLoggedIn = false;
		const setAuthUi = (loggedIn) => {
			isLoggedIn = !!loggedIn;
			try {
				if (!authBtn) return;
				authBtn.setAttribute("data-auth-mode", isLoggedIn ? "logout" : "login");
				const label = isLoggedIn ? t("nav_logout") : t("nav_login");
				authBtn.setAttribute("title", label);
				authBtn.setAttribute("aria-label", label);
				if (authText) authText.textContent = label;
				if (authIconLogin) authIconLogin.hidden = isLoggedIn;
				if (authIconLogout) authIconLogout.hidden = !isLoggedIn;
			} catch (_) {}
		};

		// Default: show login state until we know
		setAuthUi(false);

		const refreshAuthState = (() => {
			let inFlight = null;
			return () => {
				if (inFlight) return inFlight;
				inFlight = Promise.resolve()
					.then(() => apiRequest("GET", "/api/me"))
					.then((me) => {
						try {
							setAuthUi(!!(me && me.ok));
						} catch (_) {}
					})
					.catch(() => {
						try {
							setAuthUi(false);
						} catch (_) {}
					})
					.finally(() => {
						inFlight = null;
					});
				return inFlight;
			};
		})();

		// Login should return to this exact shop URL
		const getLoginUrl = () => {
			try {
				const returnTo = (window.location.pathname || "/shop/") + (window.location.search || "");
				return `/login/?return=${encodeURIComponent(returnTo)}`;
			} catch (_) {
				return "/login/";
			}
		};

		try {
			if (authBtn) {
				authBtn.addEventListener("click", async (e) => {
					e.preventDefault();
					let mode = authBtn.getAttribute("data-auth-mode") || "login";
					if (mode !== "logout") {
						// If login happened in another tab, the UI may be stale.
						// Refresh once before navigating away.
						try { await refreshAuthState(); } catch (_) {}
						mode = authBtn.getAttribute("data-auth-mode") || "login";
						if (mode === "logout") return;
						window.location.href = getLoginUrl();
						return;
					}
					try {
						authBtn.disabled = true;
						await apiRequest("POST", "/api/auth/logout", {});
					} catch (_) {
						// Ignore; we'll fall back to checking /api/me.
					} finally {
						try { authBtn.disabled = false; } catch (_) {}
					}
					setAuthUi(false);
				});
			}
		} catch (_) {}

		// Toggle login/logout based on /api/me (async; don't block page)
		try { refreshAuthState(); } catch (_) {}

		// If login happens in another tab (magic link), refresh when coming back.
		try {
			window.addEventListener("focus", () => {
				try { setTimeout(() => refreshAuthState(), 50); } catch (_) {}
			});
		} catch (_) {}
		try {
			document.addEventListener("visibilitychange", () => {
				try {
					if (!document.hidden) refreshAuthState();
				} catch (_) {}
			});
		} catch (_) {}

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

		const productBySlug = new Map();
		for (const p of productsAll) productBySlug.set(String(p.slug), p);

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
				const priceNote = vatLabel("SE");
				const href = withLangQuery(`/shop/product.html?slug=${encodeURIComponent(p.slug)}`);
				const catLabel = categoryTitleBySlug.get(String(p.categorySlug || "")) || String(p.categorySlug || "");
				return `
					<div class=\"card product\">
						<a class=\"product-link\" href=\"${href}\">
							${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\">` : `<div class=\"thumb\"></div>`}
							<div>
								<div style=\"font-weight:800\">${esc(title)}</div>
								${excerpt ? `<div class=\"badge\">${esc(excerpt)}</div>` : ""}
							</div>
							<div class=\"meta\">
								<div class=\"badge\">${esc(catLabel || "")}</div>
								<div style=\"text-align:right\">
									<div class=\"price\">${esc(price)}</div>
									<div class=\"badge\">${esc(priceNote)}</div>
								</div>
							</div>
						</a>
						<button class=\"btn primary\" type=\"button\" data-add-to-cart=\"${esc(p.slug)}\">${esc(t("add_to_cart"))}</button>
					</div>
				`;
			}).join("");

			if (cartCard) {
				const cart = readCart();
				const slugs = Object.keys(cart.items || {}).filter(Boolean);
				const totalQty = getCartQtyTotal(cart);
				try {
					if (cartCount) cartCount.textContent = totalQty ? String(totalQty) : "";
				} catch (_) {}
				if (!slugs.length) {
					const force = String(cartCard.getAttribute("data-force-visible") || "") === "1";
					if (!force) {
						cartCard.hidden = true;
						return;
					}
					cartCard.hidden = false;
					cartCard.innerHTML = `
						<div style=\"display:flex; align-items:baseline; justify-content:space-between; gap:12px\">
							<h2 style=\"margin:0\">${esc(t("cart_title"))}</h2>
							<div class=\"badge\">0</div>
						</div>
						<div style=\"margin-top:12px\" class=\"badge\">${esc(t("cart_empty"))}</div>
					`;
				} else {
					cartCard.hidden = false;
					let total = 0;
					const rows = slugs.map((slug) => {
						const qty = Math.max(0, Math.floor(Number(cart.items[slug]) || 0));
						const p = productBySlug.get(String(slug));
						const title = p ? (isEN() ? (p.titleEN || p.titleSV || p.slug) : (p.titleSV || p.titleEN || p.slug)) : String(slug);
						const line = p ? (Number.isFinite(Number(p.price)) ? (Number(p.price) * qty) : 0) : 0;
						total += line;
						return `
							<div class=\"cart-row\" data-cart-row=\"${esc(slug)}\">
								<div>
									<div class=\"cart-title\">${esc(title)}</div>
									${p ? `<div class=\"badge\">${esc(formatPrice(p.price, p.currency))}</div>` : ""}
								</div>
								<div class=\"cart-actions\">
									<label class=\"badge\" style=\"display:flex; flex-direction:column; gap:6px\">
										<span>${esc(t("qty"))}</span>
										<input class=\"qty\" type=\"number\" min=\"0\" step=\"1\" value=\"${esc(qty)}\" data-cart-qty=\"${esc(slug)}\" />
									</label>
									<button class=\"btn\" type=\"button\" data-cart-remove=\"${esc(slug)}\">${esc(t("remove"))}</button>
								</div>
							</div>
						`;
					}).join("");

					cartCard.innerHTML = `
						<div style=\"display:flex; align-items:baseline; justify-content:space-between; gap:12px\">
							<h2 style=\"margin:0\">${esc(t("cart_title"))}</h2>
							<div class=\"badge\">${esc(totalQty)}</div>
						</div>
						<div style=\"margin-top:12px\">${rows}</div>
						<div style=\"margin-top:12px; display:flex; justify-content:space-between; gap:12px\">
							<div class=\"badge\">${esc(t("total"))} · ${esc(vatLabel("SE"))}</div>
							<div class=\"price\">${esc(formatPrice(total, "SEK"))}</div>
						</div>
						<div style=\"margin-top:12px; display:flex; justify-content:flex-end\">
							<a class=\"btn primary\" href=\"${withLangQuery("/shop/checkout.html")}\">${esc(t("checkout"))}</a>
						</div>
					`;
				}
			}
		};

		try {
			if (cartBtn) {
				cartBtn.addEventListener("click", (e) => {
					e.preventDefault();
					try {
						if (cartCard) cartCard.setAttribute("data-force-visible", "1");
					} catch (_) {}
					render();
					try {
						if (cartCard) {
							cartCard.hidden = false;
							cartCard.scrollIntoView({ behavior: "smooth", block: "start" });
						}
					} catch (_) {}
				});
			}
		} catch (_) {}

		categoryFilter.addEventListener("change", render);
		searchInput.addEventListener("input", render);
		grid.addEventListener("click", (e) => {
			try {
				const target = e.target;
				const btn = target && target.closest ? target.closest("[data-add-to-cart]") : null;
				if (!btn) return;
				e.preventDefault();
				e.stopPropagation();
				addToCart(btn.getAttribute("data-add-to-cart") || "");
				render();
			} catch (_) {}
		});
		if (cartCard) {
			cartCard.addEventListener("click", (e) => {
				try {
					const target = e.target;
					const btn = target && target.closest ? target.closest("[data-cart-remove]") : null;
					if (!btn) return;
					e.preventDefault();
					setCartQty(btn.getAttribute("data-cart-remove") || "", 0);
					render();
				} catch (_) {}
			});
			cartCard.addEventListener("change", (e) => {
				try {
					const target = e.target;
					if (!target || !target.matches || !target.matches("[data-cart-qty]")) return;
					const slug = target.getAttribute("data-cart-qty") || "";
					setCartQty(slug, target.value);
					render();
				} catch (_) {}
			});
		}
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
		const priceNote = vatLabel("SE");

		view.innerHTML = `
			<h1 style=\"margin-bottom:10px\">${esc(title)}</h1>
			<div class=\"price\" style=\"font-size:18px; margin-bottom:4px\">${esc(price)}</div>
			<div class=\"badge\" style=\"margin-bottom:14px\">${esc(priceNote)}</div>
			<div style=\"margin-bottom:14px\">
				<button class=\"btn primary\" type=\"button\" data-add-to-cart-product=\"${esc(product.slug)}\">${esc(t("add_to_cart"))}</button>
			</div>
			${img ? `<img class=\"thumb\" src=\"${esc(img)}\" alt=\"\" style=\"max-width:520px\">` : ""}
			${description ? `<div style=\"margin-top:14px; white-space:pre-wrap\">${esc(description)}</div>` : ""}
		`;

		try {
			const btn = qs("[data-add-to-cart-product]");
			if (btn) {
				btn.addEventListener("click", (e) => {
					e.preventDefault();
					addToCart(btn.getAttribute("data-add-to-cart-product") || "");
				});
			}
		} catch (_) {}
	};

	const init = async () => {
		const initKey = `${window.location.pathname}${window.location.search}`;
		if (IBShop._lastInitKey === initKey) return;
		IBShop._lastInitKey = initKey;

		try {
			await renderShopIndex();
			await renderProductPage();
		} catch (_) {
			// no-op
		}
	};

	IBShop.init = init;

	// Run once on direct page loads.
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => IBShop.init());
	else IBShop.init();
})();
