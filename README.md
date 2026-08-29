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

The canvas takes its colour and font from CSS, so it follows whatever you style:

```css
#cube { color: #eee; font-family: ui-monospace, monospace; }
```

Shading is an alpha ramp over that one colour, so it reads on any background.

## locally

`file://` will not load the wasm, so serve the directory:

```sh
python3 -m http.server 8000
```
