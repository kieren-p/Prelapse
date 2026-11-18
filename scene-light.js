/* Prelapse scene lighting.
 * A self-contained layer that re-renders the home landscape with light: a sky
 * gradient and sun bloom, light shafts behind the hills, lit hill faces with
 * rim light and soft contact shadows, valley mist, a rounder sun and a fine
 * film grain. It reads the flat layers index.html draws (colour + clip path),
 * so it follows every theme, night mode and the parallax without knowing
 * the scene data. If anything it needs is missing, it does nothing and the
 * flat scene shows as before. Remove the <script> tag to switch it off.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var scene, ground, stage, behind, front;
  var uidN = 0;
  var SUNP = { x: 235, y: 196 }; // sun centre in layer coordinates (layers sit at left:-40px)

  /* ---------- colour helpers ---------- */
  function parse(c) {
    if (!c) return null;
    c = String(c).trim();
    var m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) { var n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) { var p = m[1].split(/[ ,]+/).map(parseFloat); return [p[0], p[1], p[2]]; }
    return null;
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hex(c) { return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgba(c, a) { return 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')'; }
  function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

  /* Light and shadow colours for the current time of day. */
  function look() {
    var night = scene.classList.contains('night');
    var sky = parse(scene.style.background || getComputedStyle(scene).backgroundColor) || (night ? [20, 40, 36] : [221, 232, 211]);
    return night ? {
      night: true, sky: sky,
      light: [214, 228, 240], warm: [242, 196, 98],
      shade: [4, 10, 14], shadeAmt: 0.42, lift: 0.07,
      zenith: mix(sky, [0, 0, 0], 0.45), horizon: mix(sky, [120, 150, 170], 0.12),
      rim: 0.42, pool: 0.10, mist: 0.16, contact: 0.32
    } : {
      night: false, sky: sky,
      light: [255, 243, 214], warm: [255, 214, 140],
      shade: [26, 40, 58], shadeAmt: 0.30, lift: 0.16,
      zenith: mix(sky, [96, 140, 165], 0.16), horizon: mix(sky, [255, 236, 196], 0.45),
      rim: 0.85, pool: 0.30, mist: 0.42, contact: 0.20
    };
  }

  /* ---------- tiny path reader: rough top edge, bottom and width of a layer ---------- */
  function extent(d) {
    var t = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [], i = 0, cmd = '', x = 0, y = 0, minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    function num() { return parseFloat(t[i++]); }
    function at(px, py) { x = px; y = py; if (py < minY) minY = py; if (py > maxY) maxY = py; if (px < minX) minX = px; if (px > maxX) maxX = px; }
    while (i < t.length) {
      if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
      switch (cmd) {
        case 'M': case 'L': at(num(), num()); break;
        case 'm': case 'l': at(x + num(), y + num()); break;
        case 'Q': var qx = num(), qy = num(); at(num(), num()); minY = Math.min(minY, (qy + y) / 2); break;
        case 'H': at(num(), y); break;
        case 'h': at(x + num(), y); break;
        case 'V': at(x, num()); break;
        case 'v': at(x, y + num()); break;
        case 'a': var r = num(); num(); num(); num(); num(); var ex = num(), ey = num(); minY = Math.min(minY, y - r); at(x + ex, y + ey); break;
        case 'Z': case 'z': break;
        default: i++;
      }
    }
    return { top: minY, bottom: maxY, w: maxX - minX };
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- light the landscape layers in one container ---------- */
  function lightLayers(box, isFront) {
    var old = box.querySelector(':scope > svg.sl-land'); if (old) old.remove();
    var layers = Array.prototype.slice.call(box.querySelectorAll(':scope > .ss-layer'));
    if (!layers.length) return;
    var L = look(), id = 'sl' + (++uidN);
    var svg = el('svg', { 'class': 'sl-land', viewBox: '0 0 470 600', 'aria-hidden': 'true' });
    var defs = el('defs', {}, svg);
    // Light falling off from the sun: used for the warm pool and for the rim light.
    var pool = el('radialGradient', { id: id + 'p', gradientUnits: 'userSpaceOnUse', cx: SUNP.x, cy: SUNP.y, r: 300, 'data-sun': '1' }, defs);
    el('stop', { offset: '0', 'stop-color': hex(L.warm), 'stop-opacity': L.pool }, pool);
    el('stop', { offset: '0.45', 'stop-color': hex(L.light), 'stop-opacity': L.pool * 0.35 }, pool);
    el('stop', { offset: '1', 'stop-color': hex(L.light), 'stop-opacity': 0 }, pool);
    var rim = el('radialGradient', { id: id + 'r', gradientUnits: 'userSpaceOnUse', cx: SUNP.x, cy: SUNP.y, r: 280, 'data-sun': '1' }, defs);
    el('stop', { offset: '0', 'stop-color': hex(mix(L.light, L.warm, 0.4)), 'stop-opacity': L.rim }, rim);
    el('stop', { offset: '0.5', 'stop-color': hex(L.light), 'stop-opacity': L.rim * 0.3 }, rim);
    el('stop', { offset: '1', 'stop-color': hex(L.light), 'stop-opacity': L.rim * 0.05 }, rim);
    var lastD = null, prevBase = null;
    layers.forEach(function (ly, i) {
      var d = (ly.style.clipPath || ly.style.webkitClipPath || '').replace(/^path\(["']?|["']?\)$/g, '');
      var base = parse(ly.style.background || ly.style.backgroundColor);
      if (!d || !base) return;
      var depth = +ly.dataset.d || 0, ex = extent(d), big = ex.w > 300 && ex.bottom >= 560; // a ground mass, not a row of trees or tufts
      // A darker layer at the same depth is a shadow face painted over the one before: no extra light on it.
      var face = prevBase && depth === lastD && lum(base) < lum(prevBase);
      var g = el('g', { 'class': 'sl-g', transform: ly.style.transform ? ly.style.transform.replace(/px/g, '') : '' }, svg);
      g._src = ly;
      // Valley mist: a band of light air at the foot of whatever sits behind this layer.
      if (big && lastD !== null && depth !== lastD) {
        var mg = el('linearGradient', { id: id + 'm' + i, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0', 'stop-color': hex(L.horizon), 'stop-opacity': 0 }, mg);
        el('stop', { offset: '0.6', 'stop-color': hex(L.horizon), 'stop-opacity': L.mist * (isFront ? 0.35 : 1) }, mg);
        el('stop', { offset: '1', 'stop-color': hex(L.horizon), 'stop-opacity': L.mist * (isFront ? 0.35 : 1) }, mg);
        el('rect', { x: -60, y: ex.top - 34, width: 590, height: 70, fill: 'url(#' + id + 'm' + i + ')' }, g);
      }
      // Soft contact shadow just outside the silhouette (cheap faux blur from stacked strokes).
      if ((i > 0 || isFront) && !face) {
        var sh = hex(L.shade);
        (big ? [[16, 0.05], [9, 0.07], [4, 0.10]] : []).forEach(function (s) {
          el('path', { d: d, fill: 'none', stroke: sh, 'stroke-width': s[0], 'stroke-opacity': (s[1] * L.contact / 0.2).toFixed(3), 'stroke-linejoin': 'round' }, g);
        });
      }
      // The surface itself: lit from above and behind, darker as it falls away from the light.
      var lg = el('linearGradient', { id: id + 'f' + i, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      var top = mix(base, L.light, L.lift + (big ? 0 : 0.06)), low = mix(base, L.shade, L.shadeAmt * (big ? 1 : 0.6));
      el('stop', { offset: '0', 'stop-color': hex(top) }, lg);
      el('stop', { offset: big ? '0.16' : '0.4', 'stop-color': hex(base) }, lg);
      el('stop', { offset: '1', 'stop-color': hex(low) }, lg);
      el('path', { d: d, fill: 'url(#' + id + 'f' + i + ')' }, g);
      // Warm light pooling on surfaces near the sun; further layers catch more of it.
      var far = Math.max(0, 1 - depth / 28);
      if (!face) el('path', { d: d, fill: 'url(#' + id + 'p)', opacity: (0.35 + 0.65 * far).toFixed(2) }, g);
      // Rim light along the top edge, clipped so it stays inside the shape.
      if (!face && big) {
        var cp = el('clipPath', { id: id + 'c' + i }, defs);
        el('path', { d: d }, cp);
        el('path', { d: d, fill: 'none', stroke: 'url(#' + id + 'r)', 'stroke-width': 5, 'clip-path': 'url(#' + id + 'c' + i + ')', opacity: (0.55 + 0.45 * far).toFixed(2) }, g);
      }
      lastD = depth; prevBase = base;
      if (i === layers.length - 1 && isFront) {
        // The ground below the last layer continues in its darkest tone, so there is no seam.
        scene.style.setProperty('--sl-under', hex(low));
      }
    });
    box.insertBefore(svg, box.firstChild);
    scene.classList.add('sl-on');
  }

  /* Keep the lit copy in step with the parallax shifts index.html applies to the flat layers. */
  function syncShift(box) {
    var svg = box.querySelector(':scope > svg.sl-land'); if (!svg) return;
    Array.prototype.forEach.call(svg.querySelectorAll('g.sl-g'), function (g) {
      if (g._src) g.setAttribute('transform', g._src.style.transform ? g._src.style.transform.replace(/px/g, '') : '');
    });
  }

  /* ---------- where is the sun? ---------- */
  function measureSun() {
    var s = scene.querySelector('.ss-sunwrap') || document.getElementById('ss-sun');
    if (!s || !ground) return;
    var gr = ground.getBoundingClientRect(), sr = s.getBoundingClientRect();
    if (!gr.width || !sr.width) return;
    var k = gr.width / 390;
    var x = (sr.left + sr.width / 2 - gr.left) / k, y = (sr.top + sr.height / 2 - gr.top) / k;
    if (Math.abs(x - (SUNP.x - 40)) < 0.5 && Math.abs(y - SUNP.y) < 0.5) return;
    SUNP.x = x + 40; SUNP.y = y;
    ground.style.setProperty('--slx', x + 'px');
    ground.style.setProperty('--sly', y + 'px');
    Array.prototype.forEach.call(scene.querySelectorAll('svg.sl-land [data-sun]'), function (gEl) {
      gEl.setAttribute('cx', SUNP.x); gEl.setAttribute('cy', SUNP.y);
    });
  }

  /* ---------- sky ---------- */
  function paintSky() {
    var L = look(), sky = scene.querySelector('.sl-sky'), bloom = ground.querySelector('.sl-bloom'), rays = ground.querySelector('.sl-rays');
    sky.style.background = 'linear-gradient(to bottom, ' + hex(L.zenith) + ' 0px, ' + hex(mix(L.zenith, L.sky, 0.6)) + ' 160px, ' + hex(L.sky) + ' 330px, ' + hex(mix(L.sky, L.horizon, 0.5)) + ' 620px, ' + hex(L.horizon) + ' 1000px)';
    bloom.style.background = L.night
      ? 'radial-gradient(circle at 50% 50%, ' + rgba(L.light, 0.16) + ' 0px, ' + rgba(L.light, 0.07) + ' 120px, ' + rgba(L.light, 0) + ' 300px)'
      : 'radial-gradient(circle at 50% 50%, ' + rgba([255, 250, 232], 0.95) + ' 0px, ' + rgba(L.warm, 0.55) + ' 90px, ' + rgba(L.horizon, 0.35) + ' 190px, ' + rgba(L.horizon, 0) + ' 360px)';
    rays.style.opacity = L.night ? '0.25' : '1';
    var wrap = ground.querySelector('.sl-wrap');
    wrap.style.background = 'radial-gradient(circle at var(--slx, 195px) var(--sly, 196px), ' + rgba(L.night ? L.light : L.warm, L.night ? 0.06 : 0.22) + ' 0px, ' + rgba(L.light, 0) + ' 230px)';
  }

  function grain() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 96;
      var x = c.getContext('2d'), im = x.createImageData(96, 96);
      for (var i = 0; i < im.data.length; i += 4) { var v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0);
      return 'url(' + c.toDataURL('image/png') + ')';
    } catch (e) { return 'none'; }
  }

  var CSS = [
    '#sunscene .sl-sky{position:absolute;left:0;top:0;width:390px;height:1600px;pointer-events:none}',
    '#sunscene.sl-on .ss-layer{visibility:hidden}',
    '#sunscene.sl-on .ss-under{background:var(--sl-under) !important}',
    '#sunscene svg.sl-land{position:absolute;left:-40px;top:0;width:470px;height:600px;overflow:visible;pointer-events:none}',
    '#sunscene .sl-bloom,#sunscene .sl-rays{position:absolute;pointer-events:none;left:var(--slx,195px);top:var(--sly,196px);border-radius:50%}',
    '#sunscene .sl-bloom{width:720px;height:720px;margin:-360px 0 0 -360px}',
    '#sunscene .sl-rays{width:1000px;height:1000px;margin:-500px 0 0 -500px;transition:opacity .7s;' +
      'background:repeating-conic-gradient(from 0deg,rgba(255,246,220,0) 0deg,rgba(255,246,220,.22) 5deg,rgba(255,246,220,0) 11deg,rgba(255,246,220,0) 19deg,rgba(255,246,220,.12) 23deg,rgba(255,246,220,0) 28deg);' +
      '-webkit-mask:radial-gradient(circle,#000 8%,rgba(0,0,0,.5) 30%,transparent 62%);mask:radial-gradient(circle,#000 8%,rgba(0,0,0,.5) 30%,transparent 62%);animation:sl-spin 160s linear infinite}',
    '#sunscene .sl-wrap{position:absolute;left:0;top:0;width:390px;height:700px;pointer-events:none}',
    '#sunscene .sl-grain{position:absolute;left:0;top:0;width:390px;height:1600px;pointer-events:none;opacity:.035;mix-blend-mode:overlay;background-size:96px 96px}',
    '#sunscene.night .sl-grain{opacity:.05}',
    '@keyframes sl-spin{to{transform:rotate(360deg)}}',
    /* The sun: a lit sphere with a soft bloom rather than a flat disc. */
    '#sunscene.sl-on .ss-sun{background:radial-gradient(circle at 36% 30%,#FFF0C2 0%,#F9D47E 30%,#F2C462 55%,#E6A94E 88%,#DA9A42 100%);' +
      'box-shadow:inset -8px -12px 22px rgba(190,110,40,.30),inset 6px 8px 14px rgba(255,250,230,.45),0 0 26px 6px rgba(255,214,130,.55),0 0 70px 24px rgba(255,220,150,.32)}',
    '#sunscene.sl-on .ss-hl{background:radial-gradient(circle at 45% 40%,rgba(255,252,236,.9) 0%,rgba(255,250,228,.35) 40%,rgba(255,250,228,0) 70%)}',
    '#sunscene.sl-on .ss-halo{background:radial-gradient(circle,rgba(255,250,236,.75) 30%,rgba(255,250,236,.25) 52%,rgba(255,250,236,0) 72%);opacity:.9}',
    '#sunscene.sl-on.night .ss-halo{opacity:.18}',
    '#sunscene.sl-on.night .ss-sun{box-shadow:inset -8px -12px 22px rgba(120,70,30,.35),inset 6px 8px 14px rgba(255,250,230,.35),0 0 22px 4px rgba(242,196,98,.30),0 0 60px 20px rgba(200,220,240,.10)}',
    '#sunscene.sl-on .ss-rays span{background:linear-gradient(#FFE7A8,#F2C462);box-shadow:0 0 8px rgba(255,214,130,.6)}',
    /* Clouds catch light on top and shade underneath; stars and fireflies glow. */
    '#sunscene.sl-on [style*="--co"]>div{filter:drop-shadow(0 5px 6px rgba(40,70,90,.13))}',
    '#sunscene.sl-on [style*="--co"]>div>span:first-child{background:linear-gradient(#FFFFFF 30%,#E8EEF0) !important}',
    '#sunscene.sl-on.night [style*="--co"]>div{filter:none}',
    '#sunscene.sl-on [style*="--so"]>div{box-shadow:0 0 6px 1px rgba(245,239,227,.55)}',
    '#sunscene.sl-on [style*="--fo"]>span{box-shadow:0 0 8px 3px rgba(242,196,98,.55),0 0 2px 1px #FFE9B0}',
    '@media (prefers-reduced-motion: reduce){#sunscene .sl-rays{animation:none}}'
  ].join('\n');

  /* ---------- page headers on Insights / Progress: same light, smaller ---------- */
  function lightHeader(svg) {
    if (svg.getAttribute('data-sl')) return;
    svg.setAttribute('data-sl', '1');
    var night = svg.parentNode.classList.contains('night');
    var paths = Array.prototype.slice.call(svg.querySelectorAll(':scope > path'));
    var id = 'slh' + (++uidN), defs = el('defs', {});
    svg.insertBefore(defs, svg.firstChild);
    var light = night ? [214, 228, 240] : [255, 243, 214], shade = night ? [4, 10, 14] : [26, 40, 58];
    var rim = el('radialGradient', { id: id + 'r', gradientUnits: 'userSpaceOnUse', cx: 235, cy: 196, r: 200 }, defs);
    el('stop', { offset: '0', 'stop-color': hex(light), 'stop-opacity': night ? 0.4 : 0.85 }, rim);
    el('stop', { offset: '1', 'stop-color': hex(light), 'stop-opacity': night ? 0.08 : 0.2 }, rim);
    var sg = el('radialGradient', { id: id + 's', cx: '0.38', cy: '0.32', r: '0.7' }, defs);
    el('stop', { offset: '0', 'stop-color': '#FFF0C2' }, sg); el('stop', { offset: '0.5', 'stop-color': '#F2C462' }, sg); el('stop', { offset: '1', 'stop-color': '#DA9A42' }, sg);
    var glow = el('radialGradient', { id: id + 'g', cx: '0.5', cy: '0.5', r: '0.5' }, defs);
    el('stop', { offset: '0', 'stop-color': '#FFF4D6', 'stop-opacity': night ? 0.18 : 0.8 }, glow);
    el('stop', { offset: '1', 'stop-color': '#FFF4D6', 'stop-opacity': 0 }, glow);
    paths.forEach(function (p, i) {
      var base = parse(p.getAttribute('fill')); if (!base) return;
      var d = p.getAttribute('d');
      var lg = el('linearGradient', { id: id + 'f' + i, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0', 'stop-color': hex(mix(base, light, night ? 0.07 : 0.16)) }, lg);
      el('stop', { offset: '0.2', 'stop-color': hex(base) }, lg);
      el('stop', { offset: '1', 'stop-color': hex(mix(base, shade, night ? 0.4 : 0.28)) }, lg);
      p.setAttribute('fill', 'url(#' + id + 'f' + i + ')');
      var cp = el('clipPath', { id: id + 'c' + i }, defs); el('path', { d: d }, cp);
      var r = el('path', { d: d, fill: 'none', stroke: 'url(#' + id + 'r)', 'stroke-width': 4, 'clip-path': 'url(#' + id + 'c' + i + ')' });
      p.parentNode.insertBefore(r, p.nextSibling);
    });
    var circles = svg.querySelectorAll(':scope > circle');
    if (circles[0]) {
      el('circle', { cx: 235, cy: 196, r: 110, fill: 'url(#' + id + 'g)' }).setAttribute('class', 'sl-hglow');
      svg.insertBefore(svg.lastChild, circles[0]);
      circles[0].setAttribute('fill', 'url(#' + id + 's)');
      if (circles[1]) circles[1].setAttribute('opacity', '0.35');
    }
  }

  /* ---------- set up ---------- */
  function init() {
    scene = document.getElementById('sunscene');
    if (!scene || !window.MutationObserver || !document.createElementNS) return;
    stage = scene.querySelector('.ss-stage');
    ground = scene.querySelector('.ss-ground');
    behind = document.getElementById('ss-behind');
    front = document.getElementById('ss-front');
    if (!stage || !ground || !behind || !front) return;

    var st = document.createElement('style'); st.id = 'scene-light-css'; st.textContent = CSS; document.head.appendChild(st);
    var sky = document.createElement('div'); sky.className = 'sl-sky'; stage.insertBefore(sky, stage.firstChild);
    var rays = document.createElement('div'); rays.className = 'sl-rays';
    var bloom = document.createElement('div'); bloom.className = 'sl-bloom';
    ground.insertBefore(rays, behind); ground.insertBefore(bloom, behind);
    var wrap = document.createElement('div'); wrap.className = 'sl-wrap';
    ground.insertBefore(wrap, front.nextSibling);
    var gr = document.createElement('div'); gr.className = 'sl-grain'; gr.style.backgroundImage = grain();
    var bub = stage.querySelector('.ss-bubblewrap');
    stage.insertBefore(gr, bub || null);

    var pending = 0;
    function relight() {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = 0;
        measureSun();
        lightLayers(behind, false); lightLayers(front, true);
        paintSky();
      });
    }
    var later = 0;
    function remeasure() {
      requestAnimationFrame(measureSun);
      clearTimeout(later); later = setTimeout(measureSun, 900);
    }
    // New layers (theme or day/night change) get re-lit; style changes on them are parallax.
    [behind, front].forEach(function (box) {
      new MutationObserver(function (list) {
        var rebuilt = list.some(function (m) { return m.type === 'childList' && Array.prototype.some.call(m.addedNodes, function (n) { return n.classList && n.classList.contains('ss-layer'); }); });
        if (rebuilt) relight(); else syncShift(box);
      }).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    var lastSky = '';
    new MutationObserver(function () {
      var key = scene.className + '|' + scene.style.background;
      if (key !== lastSky) { lastSky = key; relight(); }
      remeasure();
    }).observe(scene, { attributes: true, attributeFilter: ['class', 'style', 'data-mood'] });
    window.addEventListener('resize', remeasure);
    relight();

    var app = document.getElementById('app');
    if (app) {
      var hp = 0;
      new MutationObserver(function () {
        if (hp) return;
        hp = requestAnimationFrame(function () { hp = 0; Array.prototype.forEach.call(app.querySelectorAll('.phead > svg:not([data-sl])'), lightHeader); });
      }).observe(app, { childList: true, subtree: true });
      Array.prototype.forEach.call(app.querySelectorAll('.phead > svg'), lightHeader);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
