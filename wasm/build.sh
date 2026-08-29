#!/bin/sh
# builds cube's renderer to a freestanding wasm32 module. no emscripten needed.
set -e

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CUBE_SRC=${CUBE_SRC:-$here/../../../C/cube/src}
CC=${CC:-clang}

[ -f "$CUBE_SRC/shapes.c" ] || {
	echo "build.sh: no cube source at $CUBE_SRC (set CUBE_SRC=)" >&2
	exit 1
}

EXPORTS="cube_grid cube_render cube_max_width cube_max_height cube_shape_count cube_shape_name"

set -- \
	--target=wasm32 -std=gnu23 -ffreestanding -nostdlib \
	-O3 -flto -fno-builtin-memset -mbulk-memory \
	-Wall -Wextra \
	-I "$CUBE_SRC" -I "$here/src/shim" \
	-Wl,--no-entry -Wl,--lto-O3 -Wl,--strip-all -Wl,--gc-sections

for e in $EXPORTS; do
	set -- "$@" -Wl,--export=$e
done

"$CC" "$@" -o "$here/cube.wasm" "$here/src/cube_wasm.c"

echo "wasm/cube.wasm  $(wc -c < "$here/cube.wasm") bytes"
