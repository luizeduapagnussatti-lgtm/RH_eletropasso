/** Product branding for this Eletropasso deployment. */
export const APP_NAME = 'RH_Eletropasso';
export const APP_SHORT_NAME = 'RH Eletropasso';
export const APP_TAGLINE = 'Gestão de RH — Eletropasso';

/** Official support inbox — always use this (not store/loja addresses). */
export const SUPPORT_EMAIL = 'suporte@eletropasso.com.br';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

/** Eletropasso logo red (wordmark / PWA). */
export const BRAND_RED = '#c41e24';
/** Brighter “mirror” of brand red — icons & active nav on dark chrome. */
export const BRAND_RED_MIRROR = '#e23d42';
/** App shell chrome (sidebar + top header). */
export const CHROME_BG = '#182230';
export const CHROME_BORDER = '#243044';

/**
 * Eletropasso store wordmark — used in app screen headers and login.
 * Source: public/img/logo-eletropasso-source.png
 */
export const STORE_LOGO_PATH = '/img/logo-header.webp';
export const STORE_LOGO_FALLBACK = '/img/logo.webp';

/**
 * Circular RH system icon — PWA install, favicon, sidebar, HTML, exports.
 * Source: public/img/logo-rh-source.png (background removed → app-icon.png)
 * Do NOT use on the login screen.
 */
export const APP_ICON_PATH = '/img/app-icon.png';
export const APP_ICON_192 = '/img/icon-192.png';

/** @deprecated Prefer STORE_LOGO_PATH — kept for older imports */
export const APP_LOGO_PATH = STORE_LOGO_PATH;
