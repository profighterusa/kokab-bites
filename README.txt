KOKAB BITES — Premium Restaurant Website
=========================================
Preview:
Open index.html in a modern browser. Internet access is needed for Google Fonts and the remote Unsplash food photos.

Features:
- Premium responsive design for desktop and mobile
- Hero section, categories, search, category filters
- Menu cards with favourite/save hearts
- Add-to-order cart and quantity controls
- Customer name, phone, delivery/pickup address, notes
- WhatsApp order message to +92 325 5791010
- Menu prices transcribed from the supplied menu image, with corrected spelling and consistent typography
- Six combo deals displayed with prices (Rs. 790, 850, 900, 1,610, 830 and 2,700)
- Classic pizza sizes: 7-inch Rs. 290, 10-inch Rs. 390, 13-inch Rs. 790, 16-inch Rs. 1,200
- Special pizza sizes: Small Rs. 450, Medium Rs. 850, Large Rs. 1,250, Family Rs. 1,700
- Featured combo: 2 Shami Burgers + 2 Special Shawarmas + 1L Next Cola — Rs. 900
- Location and Google Maps directions link
- Mobile sticky order controls and WhatsApp button

Before publishing:
1. The header and footer use the supplied high-resolution KOKAB BITES chef logo. The site includes favicon.ico, favicon-32.png, and apple-touch-icon.png generated from the same logo.
2. Verify Deal 2 wording and all menu prices against the restaurant’s original price list before public launch; the supplied poster text is low-resolution in a few places.
3. Images are illustrative stock photos, not verified photos of your actual menu. Replace with real KOKAB BITES food photos for stronger brand trust.
4. The current project includes a Node.js backend, private admin dashboard, JSON menu/order storage, product uploads and website order records. It does not process online payments or automatically import WhatsApp chats started outside website checkout.
5. Do not deploy this as a static-only site. Deploy the complete Node.js project on a host with persistent storage, HTTPS and a strong ADMIN_PASSWORD.

- Pizza size selectors on each pizza card with size-specific prices
- Loaded fries size selector and wings portion selector
- Live cart subtotal and estimated bill before WhatsApp
- Unpriced items clearly flagged instead of being assigned invented prices
- Build-your-own-deal section with optional target budget/discount request
- WhatsApp message includes itemized prices, selected sizes, subtotal and requested deal price
- Custom discounts are requests only and must be confirmed by the restaurant

Current development/testing notes:
- All website WhatsApp links currently point to the temporary testing number 03184345994 (international format +92 318 4345994).
- This is a static prototype; final production deployment still requires hosting and a backend for real admin/order management.
- Drink size can be selected (1 litre or 1.5 litre), but individual drink prices are intentionally not invented and must be confirmed by the restaurant.
- JavaScript syntax checked with Node.js after the ordering-flow updates.


Phase 2 — Node.js server and admin panel:
- Run `node server.js` from this folder. Set ADMIN_PASSWORD to a strong private password before using the admin panel.
- Open /admin.html to manage menu prices and review website-submitted orders.
- Menu edits are saved to menu-data.json and are served to the website by /api/menu.
- Website orders can be recorded by POST /api/orders. Production deployment should use HTTPS, secure hosting, backups, and a private strong admin password.
- WhatsApp messages initiated outside website checkout do not automatically appear in the dashboard.
- Orders store customer-provided name, contact, address, and item details; restrict access and delete records when no longer needed.

Windows quick start:
1. Install Node.js 18 or newer.
2. Double-click start-server.bat and enter a private admin password.
3. Open http://localhost:3000 for the site.
4. Open http://localhost:3000/admin.html for the admin panel.
Do not publish the server to the public internet until deployed behind HTTPS with a strong secret and proper backups.

Security improvement — first review iteration:
- Admin login has server-side throttling: up to 5 failed/successful attempts per IP within 15 minutes before a temporary 429 response.

PWA / UI UPDATE (13 October 2026)
- Responsive, app-like mobile navigation and a web-oriented desktop layout.
- Soft food-friendly glassmorphism/neumorphism surfaces, light/dark theme toggle, saved theme preference, reduced-motion support, and animated featured-deal/product highlights.
- PWA manifest with Android-sized app icons and service worker offline shell caching.
- After a successful first visit while online, the main page/menu shell and same-origin assets are cached for offline browsing. The cart and favourites are stored locally on the device.
- Offline order drafts can be prepared, but WhatsApp sending and server order storage require an internet connection. API/auth/order responses are deliberately not cached.
- PWA install/offline capabilities require HTTPS on a deployed host (or localhost during development); opening index.html directly as a file will not register the service worker.
- Some remote food photography and Google Fonts require an initial online visit and may not all be available offline.

PHASE 3 — ADMIN SECURITY HARDENING (13 October 2026)
- Private data/config files are blocked from direct HTTP access: orders.json, menu-data.json, server.js, package.json, README.txt and start-server.bat. The public menu is available only through GET /api/menu; order records are available only through authenticated admin API routes.
- Admin HTML responses are no-store, marked noindex/nofollow, protected against framing, and receive a restrictive Content Security Policy.
- Admin login, logout, and management mutations reject cross-origin requests. The session cookie is HttpOnly and SameSite=Strict; in NODE_ENV=production it also has Secure.
- Login attempts are rate-limited, sessions expire after 12 hours, expired sessions are cleaned on login, and the server caps active sessions.
- JSON updates are written to a temporary file and renamed into place to reduce the chance of partially-written menu/order files.
- Production mode refuses to start with an admin password shorter than 14 characters. Set NODE_ENV=production and a strong ADMIN_PASSWORD through the host's secret/environment-variable settings; never commit the password to source control.

PRODUCTION DEPLOYMENT CHECKLIST
1. Deploy this Node.js app to a host that supports Node.js 18+ and HTTPS. Keep NODE_ENV=production and set ADMIN_PASSWORD to a unique password of at least 14 characters.
2. Ensure the host supports persistent storage for menu-data.json and orders.json, or migrate these to a managed database. Ephemeral local disks can lose edits/orders on redeploy/restart. Back up order and menu data securely.
3. Open the public domain to customers. Keep /admin.html unlinked from the public UI; operators access it directly and sign in. For stronger separation, put admin behind VPN/IP allowlist or an access gateway. The sign-in page itself is not secret, and obscuring its URL is not a security boundary.
4. Verify HTTPS is active and secure cookies are set; verify /orders.json, /menu-data.json and /server.js return 404; verify unauthenticated /api/admin/menu returns 401; test login, logout, menu save, and order status changes.
5. Do not use multiple server instances with this in-memory session store; sessions will not be shared between instances. Use a shared session store before scaling horizontally.
6. Customer orders contain personal data. Limit staff access, keep backups access-controlled, and define a retention/deletion policy consistent with local requirements.

Security hardening is not a substitute for an independent production security review. A real deployment still needs host configuration, persistent storage, HTTPS validation, backups, and end-to-end testing.


PHASE 4 — OWNER DASHBOARD + PRODUCT CATALOGUE (13 October 2026)
- Replaced the generic admin page with a responsive control-room dashboard: overview stats, product catalogue, pricing/deals and website orders.
- Admin can create, edit, hide/show, and delete custom menu products; add a description/category/price/badge; preview an image; upload JPG/PNG/WebP up to 5 MB; or use an image URL.
- Uploaded product images are stored in the local uploads/ folder and served as regular image files. Back up this folder with menu-data.json. Persistent disk is required in production.
- Custom products are saved in menu-data.json and rendered into the public menu. Existing built-in menu cards remain in place. Base prices and deals are editable.
- Upload route is authenticated and validates image data/signatures. Use HTTPS in production.
- The earlier dashboard version managed only custom products; Phase 5 below supersedes that limitation by adding built-in item image, availability, details and size-price management.

PHASE 5 — FULL LOCAL OWNER WORKFLOW UPGRADE (13 October 2026)
- The Products & photos catalogue now lists the existing built-in menu cards as well as custom products. Operators can preview and replace a built-in item's photo, edit its descriptive badge/details, and hide/show it on the public website. Built-in menu item names remain fixed to preserve the current website layout; use Add product to create a new named product, and delete custom products when they are no longer needed.
- Existing built-in photo URLs are seeded into menu-data.json so the owner dashboard displays thumbnails immediately. Replacing a photo uploads it to uploads/ and updates the public menu. Remove photo clears the stored replacement. The original supplied KOKAB BITES logo is unchanged.
- Added an operator price editor for classic/special pizza sizes, loaded fries sizes and wings portions. Pizza and size-priced side products indicate that their prices are managed in the size-pricing panel.
- Admin deal editor supports adding, renaming, changing price/details, and removing offers. The public featured-deal and deal-card grid now render from the saved menu data instead of relying only on hardcoded card text.
- Website order dashboard adds search, status filtering and CSV export. Orders created by the website checkout are stored in orders.json before WhatsApp opens; WhatsApp chats initiated outside website checkout are not automatically captured.
- Admin theme retains persistent light/dark mode, with improved variable-based surfaces for dashboard panels, stat cards, inputs and pricing cards.
- The service worker cache was versioned to v4 so updated shell assets can replace the previous cached version.
- Local testing remains JSON-file based by request. Back up menu-data.json, orders.json, and the uploads/ folder together. JSON storage is suitable for a single local server/testing instance, not concurrent multi-instance production traffic. Use persistent hosting/database migration and HTTPS before public launch.
- Temporary WhatsApp test number is preserved as 03184345994 (international format 923184345994). Do not replace it until the owner explicitly requests the production number.

PHASE 5 VERIFICATION NOTES
- Run `node --check server.js` and parse inline JavaScript in index.html/admin.html with Node to catch syntax errors.
- Test menu reads, admin login, built-in item photo/availability save, custom product create/update/delete, pizza/side size-price updates, deal save, website order submission/status update, and CSV export before public deployment.
- The product catalogue uses illustrative image URLs for existing cards until the owner uploads real food photography. Verify all menu prices and deal contents with the business before launch.


PHASE 6 — ADVANCED BUILD (13 October 2026)
Bug fixes:
- Fixed public README.txt leak: the blocked-files list compared a lowercased
  path against a mixed-case set entry, so /README.txt returned 200. All
  blocked entries are now lowercase.
- Removed the "__TEMP_TEST__" deal and the "Test Name Change" display name
  from menu-data.json (both were visible on the public website).
- Unified the pizza "special group" detection between the website, the admin
  dashboard and the server price checker (creamy/malai boti/kebabish/bbq/
  doner/cheese-stuffed). Previously the admin showed classic sizes for
  Tikka Creamy, Malai Boti, Kebabish Creamy and BBQ pizzas.
- Tikka Pizza and Hot Spicy Pizza no longer use a burger stock photo.
- WhatsApp ordering now defaults to the production number 923255791010
  (editable in the admin dashboard under Menu manager > Store settings).
  The temporary test number 03184345994 is no longer used.

New advanced features:
- Store settings (admin > Menu manager > Store settings): WhatsApp number,
  opening/closing hour, delivery fee, free-delivery threshold, prep time.
- Open/closed badge in the announcement bar (Asia/Karachi time); checkout is
  blocked while closed.
- Delivery fee shown in the cart, included in the WhatsApp message and stored
  on the order. Free above the configured threshold.
- Pakistani mobile number validation at checkout.
- Server-side price verification: the server recomputes every order total
  from menu-data.json and stores serverTotal + per-item verified flags, so
  tampered browser prices cannot skew the dashboard. Unverified items are
  flagged in the admin order list.
- Customer order tracking: new "Track your order" section on the website;
  GET /api/track/:id returns status and items (no personal data).
- Urdu/English language toggle for the main website UI.
- Open Graph tags + Restaurant JSON-LD for better link previews and SEO.
- Custom 404 page (404.html) served for unknown routes.
- Admin one-click backup download (menu + orders as JSON).
- Prep-time estimate shown in the cart flow and on the tracking page.
- Service worker cache bumped to v8.

Notes:
- Change the WhatsApp number in Store settings if 0325 5791010 is not the
  correct order-receiving number.
- Set the real opening/closing hours in Store settings (defaults 11:00-23:00).
- Deal 2 wording and all prices should still be verified against the printed
  menu before public launch.
