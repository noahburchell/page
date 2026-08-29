// drives wasm/cube.wasm: cube's own C renderer, rasterising an ASCII grid we
// paint onto a canvas one run of equal characters at a time.

(function () {
	'use strict';

	var canvas = document.getElementById('cube');
	var stage  = canvas && canvas.parentElement;
	var errEl  = document.getElementById('demo-error');
	if (!canvas)
		return;

	var SPIN_PERIOD = 40 * Math.PI; // matches cube's own wrap point
	var CELL_ASPECT = 2;            // cube assumes cells are 2x taller than wide
	var STILL_T     = 3.4;          // three faces visible: the angle we open on, and hold when motion is reduced

	// cube's shading ramp, dimmest first
	var RAMP = '.:-+*#';

	var PALETTE = {
		dark:  ['#33404f', '#42596a', '#4c7c74', '#57a68a', '#5fcda3', '#aef7da'],
		light: ['#c4ccc7', '#9aa8a1', '#6f8a7e', '#477060', '#245740', '#0a3524']
	};

	var ctx = canvas.getContext('2d', { alpha: true });
	var wasm = null;
	var cells = null;   // Uint8Array view of the wasm grid
	var maxW = 0, maxH = 0;

	var cols = 0, rows = 0, charW = 0, lineH = 0, fontPx = 0, dpr = 1;
	var shape = 0;
	var colors = PALETTE.dark;

	var running = false, visible = true, onscreen = true, paused = false;
	var raf = 0, t0 = 0, tFrozen = STILL_T;

	var reduced = matchMedia('(prefers-reduced-motion: reduce)');

	function fail(msg) {
		if (!errEl)
			return;
		errEl.textContent = msg;
		errEl.hidden = false;
		canvas.hidden = true;
	}

	function pickColors() {
		var name = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
		colors = PALETTE[name];
	}

	function fontStack() {
		return getComputedStyle(document.documentElement)
			.getPropertyValue('--mono').trim() || 'monospace';
	}

	// advance width of the mono font, per px of font-size
	function advanceRatio(stack) {
		ctx.font = '100px ' + stack;
		return ctx.measureText('##########').width / 1000;
	}

	function layout() {
		var w = stage.clientWidth, h = stage.clientHeight;
		if (!w || !h || !wasm)
			return false;

		dpr = Math.min(window.devicePixelRatio || 1, 2);

		var stack = fontStack();
		var ratio = advanceRatio(stack) || 0.6;

		var want = Math.round(w / 8.5);
		cols = Math.max(44, Math.min(maxW, want));

		charW = w / cols;
		lineH = charW * CELL_ASPECT;
		rows  = Math.max(12, Math.min(maxH, Math.floor(h / lineH)));

		fontPx = charW / ratio;

		canvas.width  = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.font = fontPx + 'px ' + stack;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';

		return true;
	}

	function paint(t) {
		if (!cols || !rows)
			return;
		if (wasm.cube_render(shape, cols, rows, t))
			return;

		var base = wasm.cube_grid();
		var buf = wasm.memory.buffer;
		if (!cells || cells.buffer !== buf)
			cells = new Uint8Array(buf);

		var w = cols * charW;
		var yoff = (stage.clientHeight - rows * lineH) / 2;

		ctx.clearRect(0, 0, w, stage.clientHeight);

		for (var y = 0; y < rows; y++) {
			var row = base + y * cols;
			var cy = yoff + y * lineH + lineH / 2;
			var x = 0;

			while (x < cols) {
				var ch = cells[row + x];
				if (ch === 32) { x++; continue; }

				var start = x;
				do { x++; } while (x < cols && cells[row + x] === ch);

				var glyph = String.fromCharCode(ch);
				var shade = RAMP.indexOf(glyph);

				ctx.fillStyle = colors[shade < 0 ? colors.length - 1 : shade];
				ctx.fillText(glyph.repeat(x - start), start * charW, cy);
			}
		}
	}

	function frame(now) {
		if (!t0)
			t0 = now;

		tFrozen = ((now - t0) / 1000) % SPIN_PERIOD;
		paint(tFrozen);

		raf = requestAnimationFrame(frame);
	}

	function shouldRun() {
		return !paused && visible && onscreen && !reduced.matches;
	}

	function sync() {
		if (shouldRun()) {
			if (!running) {
				running = true;
				// keep the phase we stopped at instead of jumping back
				t0 = performance.now() - tFrozen * 1000;
				raf = requestAnimationFrame(frame);
			}
		} else if (running) {
			running = false;
			cancelAnimationFrame(raf);
			paint(tFrozen);
		} else {
			paint(tFrozen);
		}
	}

	function buildControls() {
		var host = document.getElementById('shapes');
		var title = document.getElementById('demo-title');
		var mem = new Uint8Array(wasm.memory.buffer);

		var read = function (p) {
			var s = '';
			for (var i = p; mem[i]; i++)
				s += String.fromCharCode(mem[i]);
			return s;
		};

		var n = wasm.cube_shape_count();
		var btns = [];

		for (var i = 0; i < n; i++) {
			var name = read(wasm.cube_shape_name(i));
			var b = document.createElement('button');

			b.type = 'button';
			b.textContent = name;
			b.setAttribute('aria-pressed', String(i === 0));
			b.dataset.index = String(i);
			b.dataset.name = name;

			b.addEventListener('click', function () {
				shape = Number(this.dataset.index);
				btns.forEach(function (o) {
					o.setAttribute('aria-pressed', String(o === this));
				}, this);
				if (title)
					title.textContent = 'cube --' + this.dataset.name;
				if (!running)
					paint(tFrozen);
			});

			btns.push(b);
			if (host)
				host.appendChild(b);
		}
	}

	function wire() {
		var toggle = document.getElementById('toggle');
		if (toggle) {
			toggle.addEventListener('click', function () {
				paused = !paused;
				toggle.classList.toggle('paused', paused);
				toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
				toggle.title = paused ? 'Play' : 'Pause';
				sync();
			});
			if (reduced.matches) {
				toggle.classList.add('paused');
				toggle.disabled = true;
			}
		}

		document.addEventListener('visibilitychange', function () {
			visible = !document.hidden;
			sync();
		});

		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (entries) {
				onscreen = entries[0].isIntersecting;
				sync();
			}, { threshold: 0 }).observe(canvas);
		}

		var relayout = function () { if (layout()) paint(tFrozen); };

		if ('ResizeObserver' in window)
			new ResizeObserver(relayout).observe(stage);
		else
			addEventListener('resize', relayout);

		addEventListener('themechange', function () {
			pickColors();
			paint(tFrozen);
		});

		if (reduced.addEventListener)
			reduced.addEventListener('change', sync);

		document.fonts && document.fonts.ready.then(relayout);
	}

	function start(exports) {
		wasm = exports;
		maxW = wasm.cube_max_width();
		maxH = wasm.cube_max_height();

		pickColors();
		buildControls();
		wire();

		if (!layout()) {
			fail('could not size the canvas');
			return;
		}

		sync();
	}

	function load() {
		var url = 'wasm/cube.wasm';

		if (WebAssembly.instantiateStreaming) {
			return WebAssembly.instantiateStreaming(fetch(url), {})
				.catch(function () {
					// wrong MIME type from the host; fall back to the buffer path
					return fetch(url).then(function (r) { return r.arrayBuffer(); })
						.then(function (b) { return WebAssembly.instantiate(b, {}); });
				});
		}

		return fetch(url)
			.then(function (r) { return r.arrayBuffer(); })
			.then(function (b) { return WebAssembly.instantiate(b, {}); });
	}

	if (!window.WebAssembly || !canvas.getContext) {
		fail('this browser has no WebAssembly, so the cube stayed home.');
		return;
	}

	load().then(function (res) {
		start(res.instance.exports);
	}, function () {
		fail(location.protocol === 'file:'
			? 'serve this page over http to load cube.wasm (file:// blocks it).'
			: 'could not load cube.wasm.');
	});
})();
