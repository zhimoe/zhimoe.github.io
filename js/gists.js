(() => {
  'use strict';

  const root = document.querySelector('.gist-notes');
  if (!root) return;

  const gistId = (root.dataset.gistId || '').trim();
  const gistUser = (root.dataset.gistUser || 'zhimoe').trim();
  const sourceUrl = `https://gist.github.com/${encodeURIComponent(gistUser)}/${encodeURIComponent(gistId)}`;
  const rawBase = `https://gist.githubusercontent.com/${encodeURIComponent(gistUser)}/${encodeURIComponent(gistId)}/raw/`;
  const cacheKey = `gist:${gistId}`;

  const listEl = root.querySelector('.gist-list');
  const statusEl = root.querySelector('.gist-status');
  const filterEl = root.querySelector('.gist-filter');
  const manifestEl = root.querySelector('.gist-manifest');

  if (!gistId) {
    setError('页面没有配置 Gist ID。');
    return;
  }

  let manifest = { files: [] };
  try {
    manifest = JSON.parse(manifestEl.textContent);
  } catch (error) {
    setError('无法读取 Gist 文件列表，请刷新页面重试。');
    return;
  }

  const filenames = (Array.isArray(manifest.files) ? manifest.files : [])
    .map(file => (typeof file === 'string' ? file : file && (file.filename || file.name)))
    .filter(Boolean);

  if (!filenames.length) {
    setError('这个 Gist 还没有文件。');
    return;
  }

  let notes = [];
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  const EXT_LANG = {
    py: 'python', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    jsx: 'jsx', ts: 'typescript', tsx: 'tsx', sh: 'bash', bash: 'bash',
    zsh: 'bash', fish: 'bash', yml: 'yaml', yaml: 'yaml', html: 'markup',
    htm: 'markup', xml: 'markup', svg: 'markup', md: 'markdown',
    markdown: 'markdown', rb: 'ruby', rs: 'rust', kt: 'kotlin',
    kts: 'kotlin', c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp',
    hpp: 'cpp', hxx: 'cpp', cs: 'csharp', go: 'go', java: 'java',
    json: 'json', toml: 'toml', ini: 'ini', cfg: 'ini', conf: 'ini',
    sql: 'sql', css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    php: 'php', swift: 'swift', nim: 'nim', lua: 'lua', r: 'r',
    pl: 'perl', pm: 'perl', ex: 'elixir', exs: 'elixir', erl: 'erlang',
    hs: 'haskell', scala: 'scala', clj: 'clojure', cljs: 'clojure',
    dockerfile: 'docker', makefile: 'makefile', mk: 'makefile',
    diff: 'diff', patch: 'diff', graphql: 'graphql', gql: 'graphql',
    vue: 'markup', svelte: 'markup'
  };

  const LANG_LABEL = {
    md: 'Markdown', markdown: 'Markdown', py: 'Python', js: 'JavaScript',
    mjs: 'JavaScript', cjs: 'JavaScript', jsx: 'JSX', ts: 'TypeScript',
    tsx: 'TSX', sh: 'Shell', bash: 'Shell', zsh: 'Shell', fish: 'Shell',
    yml: 'YAML', yaml: 'YAML', json: 'JSON', toml: 'TOML', html: 'HTML',
    htm: 'HTML', xml: 'XML', svg: 'SVG', css: 'CSS', scss: 'SCSS',
    sass: 'Sass', less: 'Less', go: 'Go', rs: 'Rust', java: 'Java',
    kt: 'Kotlin', kts: 'Kotlin', swift: 'Swift', nim: 'Nim', lua: 'Lua',
    rb: 'Ruby', php: 'PHP', sql: 'SQL', c: 'C', h: 'C', cc: 'C++',
    cpp: 'C++', cxx: 'C++', hpp: 'C++', cs: 'C#', scala: 'Scala',
    clj: 'Clojure', cljs: 'Clojure', ex: 'Elixir', exs: 'Elixir',
    erl: 'Erlang', hs: 'Haskell', pl: 'Perl', pm: 'Perl', r: 'R',
    dockerfile: 'Dockerfile', makefile: 'Makefile', diff: 'Diff',
    patch: 'Diff', graphql: 'GraphQL', gql: 'GraphQL', vue: 'Vue',
    svelte: 'Svelte'
  };

  function languageLabel(filename) {
    const ext = extOf(filename);
    return LANG_LABEL[ext] || ext.toUpperCase() || '文件';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function extOf(filename) {
    const match = /\.([^.]+)$/.exec(filename || '');
    return match ? match[1].toLowerCase() : '';
  }

  function isMarkdown(filename) {
    return /^(md|markdown|mdown|mkd)$/.test(extOf(filename));
  }

  function isReadme(filename) {
    return /^readme(\.[^.]+)?$/i.test(filename || '');
  }

  function langSlug(file) {
    return EXT_LANG[extOf(file.filename)] || '';
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'note';
  }

  function setStatus(text, { error = false } = {}) {
    statusEl.hidden = !text;
    statusEl.classList.toggle('is-error', error);
    statusEl.textContent = text;
  }

  function setError(message) {
    statusEl.hidden = false;
    statusEl.classList.add('is-error');
    statusEl.innerHTML = `${escapeHtml(message)} 你可以直接访问 <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">GitHub Gist</a> 查看。`;
  }

  function renderFile(file) {
    const content = file.content || '';

    if (isMarkdown(file.filename)) {
      try {
        const html = marked.parse(content, { gfm: true, breaks: false });
        return DOMPurify.sanitize(html);
      } catch (error) {
        console.error('Gist markdown render failed:', file.filename, error);
      }
    }

    const lang = langSlug(file);
    const classAttr = lang ? ` class="language-${lang}"` : '';
    return `<pre><code${classAttr}>${escapeHtml(content)}</code></pre>`;
  }

  function buildNote(file, index) {
    const filename = file.filename || `note-${index + 1}`;
    const details = document.createElement('details');
    details.className = 'gist-note';
    details.id = `note-${slugify(filename)}-${index}`;

    const summary = document.createElement('summary');

    const title = document.createElement('span');
    title.className = 'gist-note-title';
    title.textContent = filename;

    const meta = document.createElement('span');
    meta.className = 'gist-note-meta';

    const lang = document.createElement('span');
    lang.className = 'gist-note-lang';
    lang.textContent = file.language || languageLabel(filename);
    meta.append(lang);

    const size = formatBytes(file.size);
    if (size) {
      const sizeEl = document.createElement('span');
      sizeEl.className = 'gist-note-size';
      sizeEl.textContent = size;
      meta.append(sizeEl);
    }

    summary.append(title, meta);
    details.append(summary);

    const body = document.createElement('div');
    body.className = 'gist-note-body';
    body.innerHTML = renderFile(file);
    details.append(body);

    summary.addEventListener('click', () => {
      requestAnimationFrame(() => {
        if (details.open) {
          history.replaceState(null, '', `#${details.id}`);
        } else if (location.hash === `#${details.id}`) {
          history.replaceState(null, '', location.pathname + location.search);
        }
      });
    });

    return {
      el: details,
      filename,
      searchText: `${filename}\n${file.content || ''}`.toLowerCase()
    };
  }

  function addLinkTargets() {
    listEl.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    });
  }

  function highlight() {
    if (!window.Prism || typeof Prism.highlightAllUnder !== 'function') return;
    if (Prism.plugins && Prism.plugins.autoloader) {
      Prism.plugins.autoloader.languages_path = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/';
    }
    Prism.highlightAllUnder(listEl);
  }

  function hydrate(data) {
    const files = Object.values(data.files || {});
    if (!files.length) {
      setError('这个 Gist 还没有文件。');
      return;
    }

    notes = files.map((file, index) => buildNote(file, index));
    notes.sort((a, b) => {
      const aReadme = isReadme(a.filename);
      const bReadme = isReadme(b.filename);
      if (aReadme !== bReadme) return aReadme ? -1 : 1;
      return collator.compare(a.filename, b.filename);
    });

    listEl.replaceChildren(...notes.map(note => note.el));
    listEl.hidden = false;
    setStatus('');

    let hash = '';
    try {
      hash = decodeURIComponent(location.hash.slice(1));
    } catch (error) {
      hash = '';
    }
    const target = hash ? notes.find(note => note.el.id === hash) : null;

    if (target) {
      target.el.open = true;
      requestAnimationFrame(() => target.el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } else if (notes.length) {
      notes[0].el.open = true;
    }

    addLinkTargets();
    highlight();
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      return cached && cached.data && cached.data.files ? cached.data : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (error) {
      // localStorage may be unavailable; the page still works without cache.
    }
  }

  function applyFilter() {
    const query = (filterEl.value || '').trim().toLowerCase();
    let visible = 0;

    notes.forEach(note => {
      const match = !query || note.searchText.includes(query);
      note.el.hidden = !match;
      if (match) visible += 1;
    });

    if (query && visible === 0) {
      setStatus('没有匹配的笔记');
    } else {
      setStatus('');
    }
  }

  async function load() {
    if (!window.marked || !window.DOMPurify) {
      setError('Markdown 渲染组件加载失败，请检查网络后刷新。');
      return;
    }

    try {
      const results = await Promise.allSettled(filenames.map(async filename => {
        const response = await fetch(rawBase + encodeURIComponent(filename), { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const content = await response.text();
        return {
          filename,
          content,
          size: new Blob([content]).size
        };
      }));

      const files = [];
      const failed = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          files.push(result.value);
        } else {
          failed.push(filenames[index]);
          console.error('Gist file failed:', filenames[index], result.reason);
        }
      });

      if (!files.length) {
        const allMissing = results.length > 0 && results.every(result =>
          result.status === 'rejected' && /HTTP 404/.test(String(result.reason))
        );
        if (allMissing) {
          setError('Gist 文件列表已更新，请重新构建站点后查看。');
          return;
        }

        const cached = readCache();
        if (cached) {
          hydrate(cached);
          setStatus('加载失败，当前显示上次缓存的内容。', { error: true });
          return;
        }
        setError('代码笔记加载失败，请检查网络连接。');
        return;
      }

      const data = {
        files: Object.fromEntries(files.map(file => [file.filename, file]))
      };

      writeCache(data);
      hydrate(data);

      if (failed.length) {
        setStatus(`部分笔记加载失败（${failed.length} 个），其余内容已显示。`, { error: true });
      }
    } catch (error) {
      const cached = readCache();
      if (cached) {
        hydrate(cached);
        setStatus('加载失败，当前显示上次缓存的内容。', { error: true });
        return;
      }
      setError('代码笔记加载失败，请检查网络连接。');
    }
  }

  if (filterEl) {
    filterEl.addEventListener('input', applyFilter);
  }
  load();
})();
