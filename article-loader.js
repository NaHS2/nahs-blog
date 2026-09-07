// Both article entrances share one dependency and data loading pipeline.
(() => {
    const scripts = new Map();
    window.loadArticleScript = function(src) {
        if (!scripts.has(src)) {
            const promise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                const fail = () => {
                    clearTimeout(timer);
                    script.onload = script.onerror = null;
                    scripts.delete(src);
                    script.remove();
                    reject(new Error(`脚本加载失败：${src}`));
                };
                const timer = setTimeout(fail, 15000);
                script.onload = () => { clearTimeout(timer); script.onload = script.onerror = null; resolve(); };
                script.onerror = fail;
                document.head.appendChild(script);
            });
            scripts.set(src, promise);
        }
        return scripts.get(src);
    };
    const checkedFetch = async url => {
        const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`加载失败：${url}`);
        return response;
    };
    const id = new URLSearchParams(location.search).get('id') || location.pathname.split('/').filter(Boolean).pop();
    window.articlePosts = checkedFetch('/posts.json').then(response => response.json());
    window.articleMarkdown = window.articlePosts.then(posts => {
        const post = posts.find(p => p.id === id || p.legacyId === id || p.legacyIds?.includes(id));
        if (!post) throw new Error('文章未找到');
        // The old entrance redirects; only its canonical destination needs the body.
        if (location.pathname.endsWith('/post.html')) return null;
        return checkedFetch(`/posts/${post.id}.md`).then(response => response.text());
    });
    // A failed early request is reported by the article UI once it is installed.
    window.articleMarkdown.catch(() => {});
    const template = document.getElementById('content') ? Promise.resolve() :
        checkedFetch('/post.html').then(response => response.text()).then(html => {
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            document.body.className = parsed.body.className;
            document.body.replaceChildren(...parsed.body.childNodes);
        });
    const dimensions = checkedFetch('/assets/image-dimensions.json')
        .then(response => response.json()).then(data => { window.articleImageSizes = data; })
        .catch(() => { window.articleImageSizes = {}; });
    Promise.allSettled([
        template, dimensions,
        window.loadArticleScript('https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js'),
        window.loadArticleScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js').catch(() => {})
    ]).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
        return window.loadArticleScript('/post.js?v=20260907-video');
    })
        .catch(error => {
            const content = document.getElementById('content') || document.body;
            content.textContent = '文章加载失败，请刷新页面重试。';
            console.error(error);
        });
})();
