/* ============================================================
   claude-shim.js
   Substitui, no seu computador, os recursos que o claude.ai
   fornecia ao Portal dos Setores (window.claude.use):

     db         -> banco de dados no navegador (localStorage)
     user       -> usuário local (nome perguntado na 1a vez)
     assets     -> anexos guardados no navegador (IndexedDB)
     downloads  -> downloads normais do navegador
     sample     -> assistente Claude via API da Anthropic
                   (só se você configurar uma chave; ver README)
     mcp        -> indisponível (SharePoint precisa de servidor)

   Tudo fica salvo apenas NESTE navegador, neste computador.
   ============================================================ */
(function () {
  'use strict';

  var LS_DB = 'portal.db.v1';
  var LS_USER = 'portal.usuario.v1';
  var LS_CLAUDE = 'portal.claude.v1';
  var seed = window.PORTAL_DADOS_INICIAIS || null;
  var _fetch = window.fetch.bind(window);

  /* ---------- utilidades ---------- */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function segs(p) { return String(p).split('/').filter(Boolean); }
  function randId(n) {
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var b = crypto.getRandomValues(new Uint8Array(n || 20));
    for (var i = 0; i < b.length; i++) s += abc[b[i] % 36];
    return s;
  }
  function hex32() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  /* ---------- banco de dados (db) ---------- */
  function carregar() {
    try { var t = localStorage.getItem(LS_DB); if (t) return JSON.parse(t); } catch (e) {}
    var base = {};
    if (seed && seed.docs) for (var p in seed.docs) base[p] = clone(seed.docs[p]);
    return base;
  }
  var store = carregar();
  function salvarStore() {
    try { localStorage.setItem(LS_DB, JSON.stringify(store)); return true; }
    catch (e) { console.error('[portal] armazenamento cheio', e); return false; }
  }
  if (!localStorage.getItem(LS_DB)) salvarStore();

  var ouvintes = new Set(), agendado = false;
  function avisarMudanca() {
    if (agendado) return; agendado = true;
    setTimeout(function () {
      agendado = false;
      Array.from(ouvintes).forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    }, 0);
  }
  // outra aba do mesmo navegador mudou os dados
  window.addEventListener('storage', function (e) { if (e.key === LS_DB) { store = carregar(); avisarMudanca(); } });

  function snapDoc(path) {
    var d = store[path];
    return { id: segs(path).pop(), exists: !!d, data: function () { return d ? clone(d) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function naColecao(col, path) {
    var c = segs(col), p = segs(path);
    return p.length === c.length + 1 && p.slice(0, c.length).join('/') === c.join('/');
  }
  function compara(a, op, b) {
    switch (op) {
      case '==': return a === b; case '!=': return a !== b;
      case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
      case 'in': return Array.isArray(b) && b.indexOf(a) >= 0;
      case 'not-in': return Array.isArray(b) && b.indexOf(a) < 0;
      case 'array-contains': return Array.isArray(a) && a.indexOf(b) >= 0;
    }
    return false;
  }
  function executar(q) {
    var linhas = Object.keys(store).filter(function (p) { return naColecao(q.col, p); })
      .map(function (p) { return { id: segs(p).pop(), path: p, d: store[p] }; });
    q.where.forEach(function (w) { linhas = linhas.filter(function (r) { return compara(r.d[w[0]], w[1], w[2]); }); });
    if (q.order) {
      var f = q.order[0], s = q.order[1] === 'desc' ? -1 : 1;
      linhas.sort(function (a, b) {
        var x = a.d[f], y = b.d[f];
        if (x === undefined && y === undefined) return 0; if (x === undefined) return 1; if (y === undefined) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * s;
      });
    } else linhas.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    if (q.lim) linhas = linhas.slice(0, q.lim);
    var docs = linhas.map(function (r) { return snapDoc(r.path); });
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false },
      docChanges: function () { return docs.map(function (d, i) { return { type: 'added', doc: d, oldIndex: -1, newIndex: i }; }); } };
  }
  function consulta(col, where, order, lim) {
    var q = { col: col, where: where || [], order: order || null, lim: lim || 0 };
    return {
      where: function (f, op, v) { return consulta(col, q.where.concat([[f, op, v]]), q.order, q.lim); },
      orderBy: function (f, dir) { return consulta(col, q.where, [f, dir || 'asc'], q.lim); },
      limit: function (n) { return consulta(col, q.where, q.order, n); },
      get: function () { return Promise.resolve(executar(q)); },
      onSnapshot: function (next) {
        var ultimo = null;
        var disparar = function () {
          var s = executar(q);
          var chave = JSON.stringify(s.docs.map(function (d) { return [d.id, d.data()]; }));
          if (chave === ultimo) return; ultimo = chave; next(s);
        };
        ouvintes.add(disparar); setTimeout(disparar, 0);
        return function () { ouvintes.delete(disparar); };
      }
    };
  }
  function mesclar(t, s) {
    for (var k in s) {
      var v = s[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.__delete__ !== true && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) mesclar(t[k], v);
      else if (v && v.__delete__ === true) delete t[k];
      else t[k] = clone(v);
    }
    return t;
  }
  function gravar(path, novo) {
    var antigo = store[path];
    if (novo === undefined) delete store[path]; else store[path] = novo;
    if (!salvarStore()) {
      if (antigo === undefined) delete store[path]; else store[path] = antigo;
      return Promise.reject({ code: 'quota_exceeded', message: 'O armazenamento deste navegador está cheio.' });
    }
    avisarMudanca(); return Promise.resolve();
  }
  function refDoc(path) {
    if (segs(path).length % 2) throw new TypeError('Caminho de documento inválido: ' + path);
    return {
      id: segs(path).pop(), path: path,
      get: function () { return Promise.resolve(snapDoc(path)); },
      set: function (data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return Promise.reject({ code: 'invalid_argument', message: 'Corpo inválido' });
        return gravar(path, clone(data));
      },
      update: function (data) {
        if (!store[path]) return Promise.reject({ code: 'invalid_argument', message: 'Documento não existe' });
        return gravar(path, mesclar(clone(store[path]), data));
      },
      delete: function () { return gravar(path, undefined); },
      acquire: function () { return Promise.resolve({ acquired: true }); },
      onSnapshot: function (next) {
        var ultimo;
        var disparar = function () {
          var k = JSON.stringify(store[path] === undefined ? null : store[path]);
          if (k === ultimo) return; ultimo = k; next(snapDoc(path));
        };
        ouvintes.add(disparar); setTimeout(disparar, 0);
        return function () { ouvintes.delete(disparar); };
      },
      collection: function (p) { return refColecao(path + '/' + p); }
    };
  }
  function refColecao(path) {
    if (segs(path).length % 2 === 0) throw new TypeError('Caminho de coleção inválido: ' + path);
    var q = consulta(path);
    q.path = path;
    q.doc = function (id) { return refDoc(path + '/' + (id || randId())); };
    q.add = function (data) { var r = refDoc(path + '/' + randId()); return r.set(data).then(function () { return r; }); };
    return q;
  }
  var db = { doc: refDoc, collection: refColecao };

  /* ---------- usuário local ---------- */
  function cor(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return 'hsl(' + h + ' 45% 45%)'; }
  function avatar(nome, c) {
    var ini = String(nome || '?').trim().split(/\s+/).slice(0, 2).map(function (p) { return p[0] || ''; }).join('').toUpperCase() || '?';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="' + c + '"/><text x="32" y="41" font-family="Arial" font-size="24" font-weight="bold" fill="#fff" text-anchor="middle">' + ini.replace(/[<&>"]/g, '') + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function usuario() {
    var u = null;
    try { u = JSON.parse(localStorage.getItem(LS_USER) || 'null'); } catch (e) {}
    if (!u) {
      var nome = (window.prompt('Bem-vindo ao Portal dos Setores. Qual é o seu nome?', '') || '').trim() || 'Você';
      u = { id: (seed && seed.dono) || ('u_local_' + randId(12)), name: nome };
      try { localStorage.setItem(LS_USER, JSON.stringify(u)); } catch (e) {}
    }
    return u;
  }
  function pessoas() { var m = Object.assign({}, (seed && seed.pessoas) || {}); var u = usuario(); m[u.id] = { name: u.name }; return m; }
  function perfil(id) {
    var p = pessoas()[id], nome = p ? p.name : '', c = cor(String(id));
    return { id: id, name: nome, avatarUrl: avatar(nome || '?', c), color: c, email: null, isMe: id === usuario().id, guest: false };
  }
  var user = {
    isOwner: function () { return Promise.resolve(true); },
    canEdit: function () { return Promise.resolve(true); },
    can: function () { return Promise.resolve(true); },
    id: function () { return Promise.resolve(usuario().id); },
    name: function () { return Promise.resolve(usuario().name); },
    email: function () { return Promise.resolve(null); },
    avatarUrl: function () { return Promise.resolve(perfil(usuario().id).avatarUrl); },
    me: function () { var u = usuario(), p = perfil(u.id); return Promise.resolve({ id: u.id, name: u.name, avatarUrl: p.avatarUrl, color: p.color, email: null, isOwner: true, canEdit: true }); },
    profiles: function (ids) { var o = {}; [].concat(ids).forEach(function (id) { o[id] = perfil(id); }); return Promise.resolve(o); },
    search: function (q) {
      var todas = pessoas(), t = String(q || '').toLowerCase();
      return Promise.resolve(Object.keys(todas).filter(function (id) { return !t || todas[id].name.toLowerCase().indexOf(t) >= 0; }).slice(0, 8).map(perfil));
    }
  };

  /* ---------- anexos (IndexedDB) ---------- */
  var bancoArquivos = null;
  function abrirArquivos() {
    if (bancoArquivos) return bancoArquivos;
    bancoArquivos = new Promise(function (res, rej) {
      var r = indexedDB.open('portal-arquivos', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('a'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return bancoArquivos;
  }
  function op(modo, fn) {
    return abrirArquivos().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction('a', modo), req = fn(tx.objectStore('a'));
        tx.oncomplete = function () { res(req && req.result); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  var urls = {};
  function urlDoArquivo(id) {
    if (urls[id]) return Promise.resolve(urls[id]);
    return op('readonly', function (st) { return st.get(id); }).then(function (v) { return v ? (urls[id] = URL.createObjectURL(v.blob)) : null; });
  }
  var assets = {
    upload: function (blob, opts) {
      var id = hex32(), type = (opts && opts.type) || blob.type || 'application/octet-stream';
      var b = new Blob([blob], { type: type });
      if (b.size > 20 * 1048576) return Promise.reject({ code: 'too_large', message: 'Arquivo grande demais' });
      return op('readwrite', function (st) { return st.put({ blob: b, type: type, size: b.size, createdAt: new Date().toISOString() }, id); })
        .then(function () { return urlDoArquivo(id); })
        .then(function (url) { return { id: id, url: url, sizeBytes: b.size, contentType: type }; })
        .catch(function (e) { throw { code: 'quota_or_state', message: String(e) }; });
    },
    list: function () {
      return op('readonly', function (st) { return st.getAllKeys(); }).then(function (ids) {
        return Promise.all((ids || []).map(function (id) { return op('readonly', function (st) { return st.get(id); }).then(function (v) { return { id: id, url: '/_blob/' + id, contentType: v.type, sizeBytes: v.size, createdAt: v.createdAt }; }); }));
      }).then(function (lista) {
        var bytes = lista.reduce(function (a, x) { return a + x.sizeBytes; }, 0);
        return { assets: lista, usage: { files: lista.length, bytes: bytes, maxFiles: 10000, maxBytes: 2 * 1024 * 1048576 } };
      });
    },
    delete: function (ref) {
      var id = String(ref).replace(/^.*\/_blob\//, '');
      return op('readwrite', function (st) { return st.delete(id); }).then(function () {
        if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
        return { deleted: true };
      });
    }
  };
  // o portal lê anexos pelo endereço "/_blob/<id>": redirecionamos para o IndexedDB
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    var m = /\/_blob\/([0-9a-f]{32})/.exec(u);
    if (!m) return _fetch(input, init);
    return op('readonly', function (st) { return st.get(m[1]); }).then(function (v) {
      return v ? new Response(v.blob, { status: 200, headers: { 'Content-Type': v.type } }) : new Response('', { status: 404 });
    });
  };
  function corrigir(el) {
    ['src', 'href'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a), m = v && /^\/_blob\/([0-9a-f]{32})$/.exec(v);
      if (!m) return;
      el.removeAttribute(a);
      urlDoArquivo(m[1]).then(function (u) { if (u) el.setAttribute(a, u); });
    });
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      if (m.type === 'attributes') corrigir(m.target);
      else m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        corrigir(n);
        if (n.querySelectorAll) n.querySelectorAll('[src^="/_blob/"],[href^="/_blob/"]').forEach(corrigir);
      });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });

  /* ---------- downloads ---------- */
  var downloads = {
    save: function (req) {
      var blob = req.data instanceof Blob ? req.data : new Blob([req.data]);
      var u = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = u; a.download = req.filename || 'arquivo'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
      return Promise.resolve({ status: 'saved' });
    }
  };

  /* ---------- assistente Claude (opcional, via API da Anthropic) ---------- */
  function configClaude() { try { var c = JSON.parse(localStorage.getItem(LS_CLAUDE) || 'null'); return c && c.key ? c : null; } catch (e) { return null; } }
  function sample(input, opts) {
    opts = opts || {};
    var cfg = configClaude();
    if (!cfg) return Promise.reject({ code: 'not_granted', message: 'Chave da API não configurada' });
    var msgs = (typeof input === 'string' ? [{ role: 'user', content: input }] : input.map(function (m) { return { role: m.role, content: String(m.content) }; }))
      .reduce(function (a, m) { var l = a[a.length - 1]; if (l && l.role === m.role) l.content += '\n\n' + m.content; else a.push(m); return a; }, []);
    var ferramentas = (opts.tools || []).map(function (t) { return { name: t.name, description: t.description, input_schema: t.inputSchema || { type: 'object', properties: {} } }; });
    var texto = '', cortado = false;
    function rodada(n) {
      var corpo = { model: cfg.model || 'claude-sonnet-4-5', max_tokens: 4096, messages: msgs };
      if (ferramentas.length) corpo.tools = ferramentas;
      return _fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: opts.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(corpo)
      }).catch(function (e) {
        throw { code: opts.signal && opts.signal.aborted ? 'cancelled' : 'upstream_error', message: String(e), text: texto };
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw { code: r.status === 429 ? 'rate_limited' : r.status === 401 ? 'sampling_disabled' : 'upstream_error', message: t, text: texto }; });
        return r.json();
      }).then(function (j) {
        var blocos = j.content || [];
        var t = blocos.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        if (t) { var delta = (texto ? '\n\n' : '') + t; texto += delta; if (opts.onText) opts.onText({ text: texto, delta: delta }); }
        if (j.stop_reason === 'max_tokens') cortado = true;
        var usos = blocos.filter(function (b) { return b.type === 'tool_use'; });
        if (j.stop_reason !== 'tool_use' || !usos.length || n >= 8) return;
        msgs.push({ role: 'assistant', content: blocos });
        return Promise.all(usos.map(function (u) {
          var t = (opts.tools || []).filter(function (x) { return x.name === u.name; })[0];
          return Promise.resolve().then(function () { return t.execute(u.input || {}, { signal: opts.signal || new AbortController().signal }); })
            .then(function (out) { return { type: 'tool_result', tool_use_id: u.id, content: String(typeof out === 'string' ? out : JSON.stringify(out)).slice(0, 32000) }; },
                  function (e) { return { type: 'tool_result', tool_use_id: u.id, content: 'Error: ' + ((e && e.message) || e), is_error: true }; });
        })).then(function (res) { msgs.push({ role: 'user', content: res }); return rodada(n + 1); });
      });
    }
    return rodada(1).then(function () {
      if (!texto) throw { code: 'empty_completion', message: '' };
      return { text: texto, truncated: cortado, modelTierApplied: 'default' };
    });
  }
  sample.limits = function () { return Promise.resolve({ maxPromptBytes: 262144, tools: { maxCount: 32 } }); };
  sample.json = function (i, o) { return sample(i, o).then(function (r) { var t = r.text, a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']')); return JSON.parse(a >= 0 ? t.slice(a, b + 1) : t); }); };

  /* ---------- ponto de entrada usado pelo portal ---------- */
  window.claude = {
    use: function (nome) {
      var mapa = { db: db, user: user, assets: assets, downloads: downloads, sample: configClaude() ? sample : null };
      return Promise.resolve(mapa[nome] || null);
    }
  };

  /* ---------- ferramentas para usar no console (F12) ---------- */
  window.portalLocal = {
    exportarDados: function () {
      return downloads.save({ filename: 'portal-backup-' + new Date().toISOString().slice(0, 10) + '.json', data: JSON.stringify({ versao: 1, docs: store }, null, 1) });
    },
    importarDados: function (json) {
      var d = typeof json === 'string' ? JSON.parse(json) : json;
      store = clone(d.docs || d); salvarStore(); location.reload();
    },
    renomearUsuario: function (nome) { var u = usuario(); u.name = String(nome); localStorage.setItem(LS_USER, JSON.stringify(u)); location.reload(); },
    configurarClaude: function (chave, modelo) { localStorage.setItem(LS_CLAUDE, JSON.stringify({ key: chave, model: modelo || 'claude-sonnet-4-5' })); location.reload(); },
    removerClaude: function () { localStorage.removeItem(LS_CLAUDE); location.reload(); },
    apagarTudo: function () { if (window.confirm('Apagar TODOS os dados do portal neste navegador?')) { localStorage.removeItem(LS_DB); indexedDB.deleteDatabase('portal-arquivos'); location.reload(); } }
  };
})();
