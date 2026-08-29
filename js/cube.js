// drives wasm/cube.wasm: cube's own C renderer, rasterising a character grid
// that we drop straight into <pre id="cube"> as text.
//
// no colour, no opacity, no per-glyph anything: the shading is the characters
// themselves, exactly as the terminal draws it. style #cube however you like,
// but it has to stay monospace with a line-height of twice the character
// width, because cube bakes that 2:1 cell aspect into its projection.

(function () {
	'use strict';

	var el = document.getElementById('cube');
	var errEl = document.getElementById('demo-error');
	if (!el)
		return;

	var SPIN_PERIOD = 40 * Math.PI; // matches cube's own wrap point
	var CELL_ASPECT = 2;
	var STILL_T = 3.4;              // three faces visible: where we open, and hold when motion is reduced

	var wasm = null;
	var cells = null;               // Uint8Array view of the wasm grid
	var maxW = 0, maxH = 0;
	var cols = 0, rows = 0;
	var shape = 0;

	var running = false, visible = true, onscreen = true, paused = false;
	var raf = 0, t0 = 0, tFrozen = STILL_T;

	var reduced = matchMedia('(prefers-reduced-motion: reduce)');

	function fail(msg) {
		if (errEl) {
			errEl.textContent = msg;
			errEl.hidden = false;
		}
		el.hidden = true;
	}

	// measure a real character cell through the layout engine, so this tracks
	// whatever font the css actually resolved to
	function cell() {
		var probe = document.createElement('span');

		probe.textContent = new Array(201).join('#');
		probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;display:inline-block';
		el.appendChild(probe);

		var w = probe.getBoundingClientRect().width / 200;
		el.removeChild(probe);

		var lh = parseFloat(getComputedStyle(el).lineHeight);
		if (!(lh > 0))
			lh = w * CELL_ASPECT;

		return { w: w, h: lh };
	}

	function layout() {
		if (!wasm)
			return false;

		var c = cell();
		if (!(c.w > 0) || !(c.h > 0))
			return false;

		var cs = getComputedStyle(el);
		var w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
		var h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);

		cols = Math.max(20, Math.min(maxW, Math.floor(w / c.w)));
		rows = Math.max(8, Math.min(maxH, Math.floor(h / c.h)));

		return true;
	}

	function paint(t) {
		if (!cols || !rows || wasm.cube_render(shape, cols, rows, t))
			return;

		var base = wasm.cube_grid();
		var buf = wasm.memory.buffer;
		if (!cells || cells.buffer !== buf)
			cells = new Uint8Array(buf);

		var out = '';
		for (var y = 0; y < rows; y++) {
			var row = base + y * cols;
			out += String.fromCharCode.apply(null, cells.subarray(row, row + cols));
			if (y < rows - 1)
				out += '\n';
		}

		el.textContent = out;
	}

	function frame(now) {
		tFrozen = ((now - t0) / 1000) % SPIN_PERIOD;
		paint(tFrozen);
		raf = requestAnimationFrame(frame);
	}

	function sync() {
		var want = !paused && visible && onscreen && !reduced.matches;

		if (want && !running) {
			running = true;
			// keep the phase we stopped at instead of jumping back
			t0 = performance.now() - tFrozen * 1000;
			raf = requestAnimationFrame(frame);
		} else if (!want && running) {
			running = false;
			cancelAnimationFrame(raf);
			paint(tFrozen);
		} else if (!want) {
			paint(tFrozen);
		}
	}

	function buildControls() {
		var host = document.getElementById('shapes');
		var mem = new Uint8Array(wasm.memory.buffer);

		var read = function (p) {
			var s = '';
			for (var i = p; mem[i]; i++)
				s += String.fromCharCode(mem[i]);
			return s;
		};

		var btns = [];
		var n = wasm.cube_shape_count();

		for (var i = 0; i < n; i++) {
			var b = document.createElement('button');

			b.type = 'button';
			b.className = 'shape';
			b.textContent = read(wasm.cube_shape_name(i));
			b.setAttribute('aria-pressed', String(i === 0));
			b.dataset.index = String(i);

			b.addEventListener('click', function () {
				var self = this;
				shape = Number(self.dataset.index);
				btns.forEach(function (o) {
					o.setAttribute('aria-pressed', String(o === self));
				});
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
				toggle.textContent = paused ? 'play' : 'pause';
				toggle.setAttribute('aria-pressed', String(paused));
				sync();
			});
			if (reduced.matches) {
				toggle.textContent = 'play';
				toggle.disabled = true;
			}
		}

		document.addEventListener('visibilitychange', function () {
			visible = !document.hidden;
			sync();
		});

		if ('IntersectionObserver' in window) {
			new IntersectionObserver(function (e) {
				onscreen = e[0].isIntersecting;
				sync();
			}, { threshold: 0 }).observe(el);
		}

		var relayout = function () { if (layout()) paint(tFrozen); };

		if ('ResizeObserver' in window)
			new ResizeObserver(relayout).observe(el);
		else
			addEventListener('resize', relayout);

		if (reduced.addEventListener)
			reduced.addEventListener('change', sync);

		// the cell size changes once a webfont lands
		if (document.fonts && document.fonts.ready)
			document.fonts.ready.then(relayout);
	}

	function load() {
		var url = 'wasm/cube.wasm';
		var buffered = function () {
			return fetch(url)
				.then(function (r) { return r.arrayBuffer(); })
				.then(function (b) { return WebAssembly.instantiate(b, {}); });
		};

		// instantiateStreaming needs application/wasm; fall back if the host lies
		return WebAssembly.instantiateStreaming
			? WebAssembly.instantiateStreaming(fetch(url), {}).catch(buffered)
			: buffered();
	}

	if (!window.WebAssembly) {
		fail('this browser has no WebAssembly.');
		return;
	}

	load().then(function (res) {
		wasm = res.instance.exports;
		maxW = wasm.cube_max_width();
		maxH = wasm.cube_max_height();

		buildControls();
		wire();

		if (!layout()) {
			fail('could not measure the character cell.');
			return;
		}

		sync();
	}, function () {
		fail(location.protocol === 'file:'
			? 'serve this over http to load cube.wasm (file:// blocks it).'
			: 'could not load cube.wasm.');
	});
})();
