/* Тонкая обёртка над fetch: подставляет токен и разворачивает ошибки */
window.API = {
  token: localStorage.getItem('token') || null,

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
  },

  async req(method, path, body, isForm) {
    const headers = {};
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
    } catch {
      throw new ApiError('network');
    }

    let data = null;
    try { data = await res.json(); } catch { /* пустой ответ */ }

    if (!res.ok) {
      const code = (data && data.error) || 'server_error';
      if (res.status === 401 && code === 'auth_required') window.API.setToken(null);
      throw new ApiError(code, res.status);
    }
    return data;
  },

  get(p) { return this.req('GET', p); },
  post(p, b) { return this.req('POST', p, b); },
  patch(p, b) { return this.req('PATCH', p, b); },
  del(p) { return this.req('DELETE', p); },
  form(method, p, fd) { return this.req(method, p, fd, true); },
};

class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status || 0;
  }
  get text() {
    return window.t('err_' + this.code) !== 'err_' + this.code
      ? window.t('err_' + this.code)
      : window.t('err_server_error');
  }
}
window.ApiError = ApiError;
