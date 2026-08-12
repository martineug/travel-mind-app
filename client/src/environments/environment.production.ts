export const environment = {
    production: true,
    // Relative, not absolute — resolves against whatever origin actually serves the page,
    // so it works through nginx's own /api/ proxy (see client/nginx.conf) without needing
    // to know the real deployment domain in advance, and stays same-origin (no CORS needed).
    apiUrl: '/api'
};
