# page

nburch.org — hand-written, no framework, no build step for the site itself.

```
index.html
css/style.css
js/main.js      theme toggle, install tabs, copy button
js/cube.js      loads cube.wasm and paints the character grid onto a canvas
wasm/
  build.sh      builds cube.wasm
  src/          the freestanding wasm entry point
  cube.wasm     checked in, so the site needs no toolchain to deploy
```

## the cube demo

`wasm/cube.wasm` is [cube](https://github.com/noahburchell/cube)'s own renderer
built for `wasm32` with plain clang — no emscripten, no libc, no imports. It
pulls `shapes.c` straight from the cube checkout; the rasteriser in
`wasm/src/cube_wasm.c` is vendored from cube's `main.c` and has to be re-synced
by hand if that changes.

Rebuild it after changing cube:

```sh
wasm/build.sh                       # expects cube at ../../C/cube
CUBE_SRC=/path/to/cube/src wasm/build.sh
```

Needs clang 19+ (for C23 `constexpr` and a wasm32 target). Output is ~3.4 KB and
renders a frame in about a microsecond.

## running it locally

`file://` will not load the wasm, so serve the directory:

```sh
python3 -m http.server 8000
```
