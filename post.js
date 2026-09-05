// Storage can be unavailable or full; caching must never block navigation or reading.
function optionalStorage(name) {
    return {
        getItem(key) { try { return window[name].getItem(key); } catch { return null; } },
        setItem(key, value) { try { window[name].setItem(key, value); } catch {} },
        removeItem(key) { try { window[name].removeItem(key); } catch {} }
    };
}
const localStore = optionalStorage('localStorage');
// iOS Safari 必须注册 touchstart 才能让 :active 伪类生效
document.addEventListener('touchstart', function() {}, { passive: true });

// 返回按钮：优先使用浏览器后退（触发 bfcache 瞬时恢复），无历史时回退到首页
function goBackToList(e) {
    e.preventDefault();
    const from = document.referrer ? new URL(document.referrer) : null;
    if (history.length > 1 && from && from.origin === location.origin && ['/', '/index.html'].includes(from.pathname)) {
        history.back();
    } else {
        window.location.href = '/index.html';
    }
}
document.getElementById('back-btn').addEventListener('click', goBackToList);

let articleImageIndex = 0;
const renderer = new marked.Renderer();
const renderImage = renderer.image;
renderer.image = function(href, title, text) {
    const original = renderImage.call(this, href, title, text);
    const path = new URL(href, location.href).pathname;
    const size = (window.articleImageSizes || {})[decodeURI(path)];
    const dimensions = size ? ` width="${size[0]}" height="${size[1]}"` : '';
    const loading = articleImageIndex++ === 0 ? 'eager' : 'lazy';
    return original.replace('<img ', `<img loading="${loading}" decoding="async"${dimensions} `);
};
marked.setOptions({
    renderer,
    highlight(code, lang) {
        if (!window.hljs) return code;
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-'
});

const urlParams = new URLSearchParams(window.location.search);
const pathParts = window.location.pathname.split('/').filter(Boolean);
const pathPostId = pathParts[pathParts.length - 1];
const postId = urlParams.get('id') || (pathPostId && pathPostId !== 'post.html' ? pathPostId : null);
const isValidPostId = id => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '');

if (isValidPostId(postId)) {
    window.articlePosts
        .then(posts => {
            const currentPost = posts.find(p => p.id === postId || p.legacyId === postId || (p.legacyIds && p.legacyIds.includes(postId)));
            if (!currentPost) {
                throw new Error('文章未找到');
            }

            // 旧链接继续可用，并自动替换为规范URL。
            if (currentPost.id !== postId) {
                const canonicalUrl = new URL(window.location.href);
                if (window.location.pathname.endsWith('/post.html')) {
                    canonicalUrl.searchParams.set('id', currentPost.id);
                } else {
                    canonicalUrl.pathname = `/${currentPost.id}/`;
                    canonicalUrl.search = '';
                }
                window.history.replaceState(null, '', canonicalUrl);
            }

            // 旧的 post.html?id=... 入口统一跳转到干净的目录URL。
            if (window.location.pathname.endsWith('/post.html')) {
                window.location.replace(`/${currentPost.id}/${location.hash}`);
                return new Promise(() => {});
            }

            document.title = `${currentPost.title} - 硫氢化钠`;
            document.getElementById('post-title').innerText = currentPost.title;
            
            let tagsHtml = '';
            if (currentPost.tags && currentPost.tags.length > 0) {
                tagsHtml = `<div class="tags">` + 
                    currentPost.tags.map(tag => `<span class="tag">${tag}</span>`).join('') + 
                    `</div>`;
            }
            const readTimeHtml = currentPost.readTime ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${currentPost.readTime}</span>` : '';
            
            document.getElementById('post-meta').innerHTML = `
                <span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> ${currentPost.date.replace(/-/g, '.')}</span>
                ${readTimeHtml}
                ${tagsHtml}
            `;

            initArticleShare(currentPost);

            return window.articleMarkdown;
        })
        .then(text => {
            const lines = text.split('\n');
            if(lines[0].startsWith('# ')) {
                lines.shift();
            }
            document.getElementById('content').innerHTML = marked.parse(lines.join('\n'));

            // 图片排版优化：连续图片横排展示
            wrapConsecutiveImages();

            // 初始化日月轮转 + 行舟滚动
            initScrollSky();
        })
        .catch(error => {
            document.getElementById('content').innerHTML = `<p>找不到对应的文章内容，或网络加载失败。</p>`;
            console.error('Error loading post:', error);
        });
    
} else {
    document.getElementById('content').innerHTML = '<p>未提供有效的文章 ID</p>';
}

// ---- 文章分享二维码：固定使用正式域名，避免本地预览地址被编码进去 ----
function initArticleShare(currentPost) {
    const trigger = document.getElementById('article-share-trigger');
    const modal = document.getElementById('article-share-modal');
    const dialog = modal.querySelector('.article-share-dialog');
    const canvas = document.getElementById('article-qr-canvas');
    const saveButton = document.getElementById('save-article-qr');
    const copyButton = document.getElementById('copy-article-link');
    const status = document.getElementById('article-share-status');
    const shareUrl = new URL(`/${currentPost.id}/`, 'https://nahsit.com').href;
    let closeTimer;

    trigger.hidden = false;
    trigger.addEventListener('click', openShareModal);
    modal.querySelectorAll('[data-share-close]').forEach(element => {
        element.addEventListener('click', closeShareModal);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.hidden) closeShareModal();
    });

    copyButton.addEventListener('click', async () => {
        try {
            await copyText(shareUrl);
            setShareStatus('链接已复制');
        } catch (error) {
            setShareStatus('复制失败，请从地址栏复制');
            console.error('Copy article link failed:', error);
        }
    });

    let qrReady = false;
    let qrLoading = false;
    saveButton.disabled = true;
    async function ensureQRCode() {
        if (qrReady || qrLoading) return;
        qrLoading = true;
        let qrHost;
        status.textContent = '二维码加载中…';
        try {
            await window.loadArticleScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
            canvas.width = canvas.height = 1200;
            qrHost = document.createElement('div');
            qrHost.className = 'article-qr-source';
            document.body.appendChild(qrHost);
        
            new QRCode(qrHost, {
                text: shareUrl,
                width: 1024,
                height: 1024,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        
            const sourceCanvas = qrHost.querySelector('canvas');
            if (!sourceCanvas) { qrHost.remove(); throw new Error('二维码生成失败'); }
        
            const context = canvas.getContext('2d');
            const margin = 88;
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.imageSmoothingEnabled = false;
            context.drawImage(sourceCanvas, margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
            qrHost.remove();
        
            await drawSiteLogo(context, canvas);
        
            qrReady = true;
            saveButton.disabled = false;
            status.textContent = '';
        } catch (error) {
            status.textContent = '二维码加载失败，重新打开可重试；仍可复制链接';
            console.error(error);
        } finally {
            qrHost?.remove();
            qrLoading = false;
        }
    }

    saveButton.addEventListener('click', () => {
        canvas.toBlob(blob => {
            if (!blob) {
                setShareStatus('保存失败，请长按二维码保存');
                return;
            }
            const link = document.createElement('a');
            const objectUrl = URL.createObjectURL(blob);
            link.href = objectUrl;
            link.download = `${currentPost.id}-qrcode.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            setShareStatus('二维码已保存');
        }, 'image/png');
    });

    function setShareStatus(message) {
        status.textContent = message;
        clearTimeout(setShareStatus.timer);
        setShareStatus.timer = setTimeout(() => {
            status.textContent = '';
        }, 2600);
    }

    function openShareModal() {
        ensureQRCode();
        clearTimeout(closeTimer);
        modal.hidden = false;
        document.body.classList.add('share-modal-open');
        trigger.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            modal.classList.add('open');
            dialog.focus({ preventScroll: true });
        });
    }

    function closeShareModal() {
        modal.classList.remove('open');
        document.body.classList.remove('share-modal-open');
        trigger.setAttribute('aria-expanded', 'false');
        closeTimer = setTimeout(() => {
            modal.hidden = true;
            trigger.focus({ preventScroll: true });
        }, 180);
    }
}

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Copy command was rejected');
}

function drawSiteLogo(context, canvas) {
    const logoSize = 184;
    const tileSize = 224;
    const tileX = (canvas.width - tileSize) / 2;
    const tileY = (canvas.height - tileSize) / 2;

    context.imageSmoothingEnabled = true;
    context.fillStyle = '#ffffff';
    roundedRect(context, tileX, tileY, tileSize, tileSize, 38);
    context.fill();
    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 4;
    context.stroke();

    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20 L22 20"/><path d="M5 20 C5 20, 8 23, 14 23 C17 23, 19 20, 19 20"/><path d="M9 20 L9 9"/><path d="M9 9 L17 15 L9 17"/><path d="M10 2 A 4 4 0 0 0 5 5 A 5 5 0 0 1 10 2"/></svg>`;
    const logo = new Image();

    return new Promise(resolve => {
        logo.onload = () => {
            const logoX = (canvas.width - logoSize) / 2;
            const logoY = (canvas.height - logoSize) / 2;
            context.drawImage(logo, logoX, logoY, logoSize, logoSize);
            resolve();
        };
        logo.onerror = resolve;
        logo.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;
    });
}

function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
}

// ---- 图片排版：连续两张图片自动横排 ----
function wrapConsecutiveImages() {
    const content = document.getElementById('content');
    if (!content) return;

    const isImageParagraph = p => p && p.tagName === 'P' &&
        p.children.length === 1 && p.firstElementChild.tagName === 'IMG' && !p.textContent.trim();
    for (const p of content.querySelectorAll('p')) {
        if (!p.isConnected || !isImageParagraph(p)) continue;
        const next = p.nextElementSibling;
        if (!isImageParagraph(next)) continue;
        const row = document.createElement('div');
        row.className = 'image-row';
        row.append(p.firstElementChild, next.firstElementChild);
        p.replaceWith(row);
        next.remove();
    }
}

// ---- 日月轮转 + 孤舟进度条 ----
function initScrollSky() {
    const header = document.getElementById('scroll-header');
    const boat = document.getElementById('scroll-boat');
    const sunEl = document.getElementById('sun');
    const moonEl = document.getElementById('moon');
    const moonLit = document.getElementById('moon-lit');
    const starsLayer = document.getElementById('stars-layer');
    if (!header || !boat) return;

    // ====== 天空色标 ======
    const skyStops = [
        { p: 0.00, top: [26, 26, 46],    bot: [45, 27, 78]   },  // 深夜
        { p: 0.05, top: [200, 95, 80],   bot: [245, 180, 140] },  // 破晓
        { p: 0.18, top: [135, 190, 220], bot: [200, 228, 242] },  // 早晨
        { p: 0.48, top: [74, 144, 217],  bot: [175, 215, 240] },  // 正午
        { p: 0.70, top: [240, 175, 85],  bot: [250, 218, 165] },  // 午后
        { p: 0.88, top: [200, 85, 115],  bot: [235, 160, 178] },  // 黄昏
        { p: 1.00, top: [26, 26, 46],    bot: [45, 27, 78]   },  // 入夜
    ];

    function lerpColor(a, b, t) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t),
        ];
    }

    function getSkyColors(scrollPct) {
        const p = Math.max(0, Math.min(1, scrollPct));
        let lo = skyStops[0], hi = skyStops[skyStops.length - 1];
        for (let i = 0; i < skyStops.length - 1; i++) {
            if (p >= skyStops[i].p && p <= skyStops[i + 1].p) {
                lo = skyStops[i]; hi = skyStops[i + 1]; break;
            }
        }
        const range = hi.p - lo.p;
        const t = range === 0 ? 0 : (p - lo.p) / range;
        return { top: lerpColor(lo.top, hi.top, t), bot: lerpColor(lo.bot, hi.bot, t) };
    }

    // ====== 月相计算（简化天文算法） ======
    function getMoonPhase(date) {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        let jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d - 1524;
        if (m <= 2) {
            jd = Math.floor(365.25 * (y + 4715)) + Math.floor(30.6001 * (m + 13)) + d - 1524;
        }
        const knownNewMoon = 2451550.1; // 2000-01-06 新月
        const daysSince = jd - knownNewMoon;
        let phase = (daysSince % 29.53058867) / 29.53058867;
        if (phase < 0) phase += 1;
        return phase; // 0=新月 0.25=上弦 0.5=满月 0.75=下弦
    }

    function getMoonPath(phase) {
        const R = 10, cx = 12, cy = 12;
        const cosT = Math.cos(2 * Math.PI * phase);
        const rx = Math.abs(cosT) * R;

        if (phase < 0.003 || phase > 0.997) {
            return ''; // 新月不可见
        }
        if (Math.abs(phase - 0.5) < 0.003) {
            // 满月：完整圆
            return `M ${cx} ${cy-R} A ${R} ${R} 0 1 1 ${cx} ${cy+R} A ${R} ${R} 0 1 1 ${cx} ${cy-R}`;
        }
        if (phase < 0.5) {
            // 盈月：右侧亮
            const sw = cosT >= 0 ? 0 : 1;
            return `M ${cx} ${cy-R} A ${R} ${R} 0 0 1 ${cx} ${cy+R} A ${rx} ${R} 0 0 ${sw} ${cx} ${cy-R}`;
        } else {
            // 亏月：左侧亮
            const sw = cosT >= 0 ? 1 : 0;
            return `M ${cx} ${cy-R} A ${R} ${R} 0 0 0 ${cx} ${cy+R} A ${rx} ${R} 0 0 ${sw} ${cx} ${cy-R}`;
        }
    }

    // 初始化月亮形态（当天真实月相）
    const todayPhase = getMoonPhase(new Date());
    moonLit.setAttribute('d', getMoonPath(todayPhase));

    // ====== 生成星星 ======
    const starCount = 28;
    const starFrags = [];
    for (let s = 0; s < starCount; s++) {
        const left = Math.random() * 96 + 2;
        const top = Math.random() * 55 + 4;
        const dur = 1.8 + Math.random() * 3.5;
        const delay = Math.random() * 4;
        starFrags.push(
            `<div class="star" style="left:${left}%;top:${top}%;--twinkle-dur:${dur}s;--twinkle-delay:${delay}s"></div>`
        );
    }
    starsLayer.innerHTML = starFrags.join('');

    // ====== 滚动驱动 ======
    let ticking = false;

    let lastAmbientPct = -1;

    function pad(n){return n<10?'0'+n:''+n;}

    function updateClock() {
        if (document.hidden || document.body.classList.contains('pure-reading')) return;
        // 左上角时间 + 日期
        const now = new Date();
        document.getElementById('header-time').textContent =
            pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
        const mo = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const od = (n) => { const s=['th','st','nd','rd']; const v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); };
        document.getElementById('header-date').textContent =
            mo[now.getMonth()]+' '+od(now.getDate())+' · '+wd[now.getDay()];

    }
    updateClock();
    setInterval(updateClock, 1000);
    document.addEventListener('visibilitychange', updateClock);

    function update() {
        if (document.body.classList.contains('pure-reading')) return 0;
        const scrollTop = window.scrollY;
        const docH = document.body.scrollHeight - window.innerHeight;
        const scrollPct = docH > 0 ? Math.max(0, Math.min(1, scrollTop / docH)) : 0;
        const hh = header.offsetHeight;

        // -- 天空颜色 --
        const colors = getSkyColors(scrollPct);
        header.style.setProperty('--sky-top', `rgb(${colors.top.join(',')})`);

        // -- 全局环境色（节流：滚动变化 >1.5% 才更新，避免每帧重绘） --
        if (Math.abs(scrollPct - lastAmbientPct) > 0.015) {
            lastAmbientPct = scrollPct;
            const aR = Math.round(colors.top[0] * 0.18 + 209);
            const aG = Math.round(colors.top[1] * 0.18 + 209);
            const aB = Math.round(colors.top[2] * 0.18 + 209);
            document.body.style.setProperty('--page-ambient', `rgb(${aR},${aG},${aB})`);

            const dR = Math.round(colors.top[0] * 0.30 + 179);
            const dG = Math.round(colors.top[1] * 0.30 + 179);
            const dB = Math.round(colors.top[2] * 0.30 + 179);
            document.body.style.setProperty('--page-accent', `rgb(${dR},${dG},${dB})`);
        }

        // -- 太阳 --
        const sunRise = 0.03, sunSet = 0.90;
        const sunVis = scrollPct >= sunRise && scrollPct <= sunSet ? 1 : 0;
        sunEl.style.opacity = sunVis;
        if (sunVis > 0) {
            const sunT = (scrollPct - sunRise) / (sunSet - sunRise);
            const sunX = 5 + sunT * 88; // % of header width
            const sunArc = Math.sin(Math.PI * sunT);
            const sunYmin = hh * 0.12, sunYmax = hh * 0.58;
            const sunY = sunYmax - sunArc * (sunYmax - sunYmin);
            sunEl.style.left = sunX + '%';
            sunEl.style.top = sunY + 'px';
        }

        // -- 月亮 & 星星 --
        const moonRise = 0.88, moonSet = 0.06;
        let moonT;
        if (scrollPct > moonRise) moonT = (scrollPct - moonRise) / (1 - moonRise + moonSet);
        else if (scrollPct < moonSet) moonT = (1 - moonRise + scrollPct) / (1 - moonRise + moonSet);
        else moonT = -1;
        const moonVis = moonT < 0 ? 0 : moonT < 0.1 ? moonT / 0.1 : moonT > 0.9 ? (1 - moonT) / 0.1 : 1;
        moonEl.style.opacity = moonVis.toString();
        const night = scrollPct < 0.04 || scrollPct > 0.86 ? 1
            : scrollPct < 0.09 ? 1 - (scrollPct - 0.04) / 0.05
            : scrollPct > 0.80 ? (scrollPct - 0.80) / 0.06 : 0;
        starsLayer.style.opacity = Math.max(0, Math.min(1, night)).toString();
        if (moonT >= 0) {
            moonT = Math.max(0, Math.min(1, moonT));
            moonEl.style.left = (5 + moonT * 88) + '%';
            moonEl.style.right = 'auto';
            moonEl.style.top = (hh * .58 - Math.sin(Math.PI * moonT) * (hh * .46)) + 'px';
        }

        // -- 小船 --
        if (docH > 0) {
            boat.style.left = (scrollPct * 100) + '%';
        }

        return scrollPct;
    }

    // 水花飞溅
    let lastSplashPct = -1;
    function maybeSplash(scrollPct) {
        if (!header || Math.abs(scrollPct - lastSplashPct) < 0.08) return;
        lastSplashPct = scrollPct;
        const bx = parseFloat(boat.style.left) || 0;
        const dot = document.createElement('div');
        dot.className = 'water-splash';
        dot.style.left = (bx + Math.random() * 6 - 3) + '%';
        dot.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
        header.appendChild(dot);
        setTimeout(() => dot.remove(), 800);
    }

    function requestSkyUpdate() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            const pct = update();
            toggleBackToTop();
            if (!document.body.classList.contains('pure-reading')) maybeSplash(pct);
        });
    }
    window.addEventListener('scroll', requestSkyUpdate, { passive: true });
    window.addEventListener('resize', requestSkyUpdate, { passive: true });
    if ('ResizeObserver' in window) {
        new ResizeObserver(requestSkyUpdate).observe(document.getElementById('content'));
    }

    // ====== 回到顶部按钮 ======
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.setAttribute('aria-label', '回到顶部');
    backToTop.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>';
    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(backToTop);

    function toggleBackToTop() {
        backToTop.classList.toggle('visible', window.scrollY > 400);
    }

    // ====== 纯净阅读切换 ======
    const pureToggle = document.getElementById('pure-toggle');
    if (pureToggle) {
        // 从 localStorage 恢复状态
        if (localStore.getItem('pure-reading') === '1') {
            document.body.classList.add('pure-reading');
            pureToggle.classList.add('active');
        }
        pureToggle.addEventListener('click', () => {
            const isPure = document.body.classList.toggle('pure-reading');
            pureToggle.classList.toggle('active', isPure);
            localStore.setItem('pure-reading', isPure ? '1' : '0');
            updateClock();
            requestSkyUpdate();
        });
    }

    // 初始调用
    update();
}
