# page

nburch.org

```
index.html
css/style.css   near-empty: just enough for the canvas to have a box
js/cube.js      loads cube.wasm, paints the character grid onto the canvas
wasm/
  build.sh      builds cube.wasm
  src/          the freestanding wasm entry point
  cube.wasm     checked in, so deploying needs no toolchain
```

## the cube demo

`wasm/cube.wasm` is [cube](https://github.com/noahburchell/cube)'s own renderer
built for `wasm32` with plain clang — no emscripten, no libc, no imports. It
pulls `shapes.c` straight from the cube checkout; the rasteriser in
`wasm/src/cube_wasm.c` is copied from cube's `main.c` and has to be re-synced by
hand if that changes.

Rebuild after changing cube:

```sh
wasm/build.sh                       # expects cube at ../../C/cube
CUBE_SRC=/path/to/cube/src wasm/build.sh
```

Needs clang 19+ (C23 `constexpr`, wasm32 target).

The grid goes into `<pre id="cube">` as plain text — the shading is the
characters themselves, same as the terminal. Style it however, but it has to
stay monospace with a line-height of twice the character width, because cube
bakes that 2:1 cell aspect into its projection:

```css
#cube { font-family: monospace; line-height: 2ch; }
```

## locally

`file://` will not load the wasm, so serve the directory:

```sh
python3 -m http.server 8000
```
