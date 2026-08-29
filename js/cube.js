// drives wasm/cube.wasm: cube's own C renderer, rasterising an ASCII grid we
// paint onto a canvas one run of equal characters at a time.
//
// it takes its colour and font from whatever you style the canvas with:
//   #cube { color: ...; font-family: ...; }
// shading comes from the alpha ramp below, so it reads on any background.

(function () {
	'use strict';

	var canvas = document.getElementById('cube');
	var stage  = canvas && canvas.parentElement;
	var errEl  = document.getElementById('demo-error');
	if (!canvas)
		return;

	var SPIN_PERIOD = 40 * Math.PI; // matches cube's own wrap point
	var CELL_ASPECT = 2;            // cube assumes cells are 2x taller than wide
	var STILL_T     = 3.4;          // three faces visible: where we open, and hold when motion is reduced

	var RAMP  = '.:-+*#';                             // cube's ramp, dimmest first
	var ALPHA = [0.22, 0.36, 0.50, 0.66, 0.82, 1.00];

	var ctx = canvas.getContext('2d');
	var wasm = null;
	var cells = null;   // Uint8Array view of the wasm grid
	var maxW = 0, maxH = 0;

	var cols = 0, rows = 0, charW = 0, lineH = 0, height = 0;
	var shape = 0, ink = '#000';

	var running = false, visible = true, onscreen = true, paused = false;
	var raf = 0, t0 = 0, tFrozen = STILL_T;

	var reduced = matchMedia('(prefers-reduced-motion: reduce)');

	function fail(msg) {
		if (errEl) {
			errEl.textContent = msg;
			errEl.hidden = false;
		}
		canvas.hidden = true;
	}

	function layout() {
		if (!wasm)
			return false;

		var css = getComputedStyle(canvas);
		var w = stage.clientWidth || canvas.clientWidth;
		if (!w)
			return false;

		var h = stage.clientHeight || Math.round(w * 0.6);
		var font = css.fontFamily || 'monospace';
		ink = css.color || '#000';

		// advance width of that font, per px of font-size
		ctx.font = '100px ' + font;
		var ratio = ctx.measureText('##########').width / 1000 || 0.6;

		cols = Math.max(44, Math.min(maxW, Math.round(w / 8.5)));
		charW = w / cols;
		lineH = charW * CELL_ASPECT;
		rows = Math.max(12, Math.min(maxH, Math.floor(h / lineH)));
		height = h;

		var dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width  = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.font = (charW / ratio) + 'px ' + font;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';

		return true;
	}

	function paint(t) {
		if (!cols || !rows || wasm.cube_render(shape, cols, rows, t))
			return;

		var base = wasm.cube_grid();
		var buf = wasm.memory.buffer;
		if (!cells || cells.buffer !== buf)
			cells = new Uint8Array(buf);

		var yoff = (height - rows * lineH) / 2;

		ctx.clearRect(0, 0, cols * charW, height);
		ctx.fillStyle = ink;

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

				ctx.globalAlpha = shade < 0 ? 1 : ALPHA[shade];
				ctx.fillText(glyph.repeat(x - start), start * charW, cy);
			}
		}

		ctx.globalAlpha = 1;
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
			}, { threshold: 0 }).observe(canvas);
		}

		var relayout = function () { if (layout()) paint(tFrozen); };

		if ('ResizeObserver' in window)
			new ResizeObserver(relayout).observe(stage);
		else
			addEventListener('resize', relayout);

		if (reduced.addEventListener)
			reduced.addEventListener('change', sync);

		if (document.fonts)
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

	if (!window.WebAssembly || !canvas.getContext) {
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
			fail('could not size the canvas.');
			return;
		}

		sync();
	}, function () {
		fail(location.protocol === 'file:'
			? 'serve this over http to load cube.wasm (file:// blocks it).'
			: 'could not load cube.wasm.');
	});
})();
