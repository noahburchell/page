// theme toggle, install tabs, copy button, sticky header

(function () {
	'use strict';

	var root = document.documentElement;

	var themeBtn = document.getElementById('theme');
	if (themeBtn) {
		themeBtn.addEventListener('click', function () {
			var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
			root.dataset.theme = next;
			try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
			window.dispatchEvent(new CustomEvent('themechange', { detail: next }));
		});
	}

	var bar = document.querySelector('.topbar');
	if (bar) {
		var onScroll = function () { bar.classList.toggle('stuck', window.scrollY > 8); };
		addEventListener('scroll', onScroll, { passive: true });
		onScroll();
	}

	var tabs = document.querySelectorAll('.tabs button');
	var panels = document.querySelectorAll('.panels pre');

	tabs.forEach(function (tab, i) {
		tab.addEventListener('click', function () {
			tabs.forEach(function (t, j) {
				t.setAttribute('aria-selected', String(j === i));
				panels[j].hidden = j !== i;
			});
		});
	});

	var copy = document.getElementById('copy');
	if (copy && navigator.clipboard) {
		copy.addEventListener('click', function () {
			var open = document.querySelector('.panels pre:not([hidden]) code');
			if (!open)
				return;

			navigator.clipboard.writeText(open.textContent).then(function () {
				copy.textContent = 'copied';
				copy.classList.add('done');
				setTimeout(function () {
					copy.textContent = 'copy';
					copy.classList.remove('done');
				}, 1400);
			}, function () {
				copy.textContent = 'failed';
				setTimeout(function () { copy.textContent = 'copy'; }, 1400);
			});
		});
	} else if (copy) {
		copy.hidden = true;
	}

	var year = document.getElementById('year');
	if (year)
		year.textContent = String(new Date().getFullYear());
})();
