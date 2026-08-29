// freestanding wasm32 build of cube's renderer.
// mesh data comes from cube's own shapes.c; the rasteriser below is vendored
// from cube's main.c (keep in sync if that changes).

#include <stddef.h>
#include <stdint.h>

#define WASM_EXPORT __attribute__((visibility("default"), used))

void *memset(void *dst, int c, size_t n) {
        __builtin_memset(dst, c, n);
        return dst;
}

int strcmp(const char *a, const char *b) {
        while (*a && *a == *b) {
                a++;
                b++;
        }

        return (int)(unsigned char)*a - (int)(unsigned char)*b;
}

#include "shapes.c"

constexpr int MAX_W = 320;
constexpr int MAX_H = 160;

constexpr float CAM_DIST    = 4.0f;
constexpr float CELL_ASPECT = 2.0f;
constexpr float FILL        = 0.85f;

static_assert(MESH_MAX_RADIUS < CAM_DIST);

constexpr float SPIN_X = 0.70f;
constexpr float SPIN_Y = 1.10f;
constexpr float SPIN_Z = 0.35f;

typedef struct mat3 {
        vec3 cx, cy, cz;
} mat3;

typedef struct pvert {
        float x, y;
} pvert;

typedef struct window {
        int width, height;
        char *grid;
} window;

static char grid[MAX_W * MAX_H];

// no libm here: reduce to |x| <= pi/4 in double, then two short taylor series
static void sincosf_(float xf, float *restrict sp, float *restrict cp) {
        constexpr double PI_2 = 1.57079632679489662;

        double x = (double)xf;
        const double k = __builtin_nearbyint(x * (1.0 / PI_2));
        x -= k * PI_2;

        const double x2 = x * x;
        const double s = x * (1.0 + x2 * (-1.0 / 6 + x2 * (1.0 / 120 + x2 * (-1.0 / 5040 + x2 * (1.0 / 362880)))));
        const double c = 1.0 + x2 * (-0.5 + x2 * (1.0 / 24 + x2 * (-1.0 / 720 + x2 * (1.0 / 40320))));

        switch ((int)k & 3) {
        case 0:  *sp = (float)s;  *cp = (float)c;  break;
        case 1:  *sp = (float)c;  *cp = (float)-s; break;
        case 2:  *sp = (float)-s; *cp = (float)-c; break;
        default: *sp = (float)-c; *cp = (float)s;  break;
        }
}

static mat3 rotation(float ax, float ay, float az) {
        float sa, ca, sb, cb, sc, cc;

        sincosf_(ax, &sa, &ca);
        sincosf_(ay, &sb, &cb);
        sincosf_(az, &sc, &cc);

        return (mat3){
                .cx = { cb * cc,                cb * sc,                -sb     },
                .cy = { sa * sb * cc - ca * sc, sa * sb * sc + ca * cc, sa * cb },
                .cz = { ca * sb * cc + sa * sc, ca * sb * sc - sa * cc, ca * cb },
        };
}

static float fit_scale(const window *win, float r) {
        const float m = __builtin_sqrtf(CAM_DIST * CAM_DIST - r * r) / r;

        const float by_w = FILL * (float)win->width  * 0.5f * m / CELL_ASPECT;
        const float by_h = FILL * (float)win->height * 0.5f * m;

        return by_w < by_h ? by_w : by_h;
}

static inline void fill_span(char *restrict row, float xl, float xr, float wmax, char c) {
        if (xl > xr) {
                const float s = xl;
                xl = xr;
                xr = s;
        }

        if (xl < 0.0f) xl = 0.0f;
        if (xr > wmax) xr = wmax;
        if (!(xl <= xr))
                return;

        int a = (int)xl;
        a += ((float)a < xl);

        const int b = (int)xr;
        if (a <= b)
                memset(row + a, (unsigned char)c, (size_t)(b - a + 1));
}

static void fill_tri(const window *win, float x0, float y0, float x1, float y1,
                     float x2, float y2, char c) {
        float s;

        if (y0 > y1) { s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }
        if (y1 > y2) { s = x1; x1 = x2; x2 = s; s = y1; y1 = y2; y2 = s; }
        if (y0 > y1) { s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }

        const float dfull = y2 - y0;
        if (!(dfull > 0.0f))
                return;

        float ytf = __builtin_ceilf(y0);
        float ybf = __builtin_floorf(y2);
        if (ytf < 0.0f) ytf = 0.0f;
        if (ybf > (float)(win->height - 1)) ybf = (float)(win->height - 1);
        if (!(ytf <= ybf))
                return;

        const int w = win->width;
        const float wmax = (float)(w - 1);

        const int ytop = (int)ytf;
        const int ybot = (int)ybf;

        const float mfull = (x2 - x0) / dfull;
        const float dup = y1 - y0;
        const float dlo = y2 - y1;

        int ymid;
        if (!(dup > 0.0f))
                ymid = ytop - 1;
        else if (!(dlo > 0.0f))
                ymid = ybot;
        else {
                float ymf = __builtin_floorf(y1);
                if (ymf < (float)(ytop - 1)) ymf = (float)(ytop - 1);
                if (ymf > (float)ybot)       ymf = (float)ybot;
                ymid = (int)ymf;
        }

        char *row = win->grid + (size_t)ytop * (size_t)w;
        int y = ytop;

        if (ymid >= ytop) {
                const float mup = (x1 - x0) / dup;

                for (; y <= ymid; y++, row += w) {
                        const float d = (float)y - y0;
                        fill_span(row, x0 + d * mfull, x0 + d * mup, wmax, c);
                }
        }

        if (y <= ybot) {
                const float mlo = (x2 - x1) / dlo;

                for (; y <= ybot; y++, row += w) {
                        const float yf = (float)y;
                        fill_span(row, x0 + (yf - y0) * mfull, x1 + (yf - y1) * mlo, wmax, c);
                }
        }
}

static void draw_mesh(const window *win, const mesh *m, pvert *restrict pv, float scale, float t) {
        const float cx = (float)(win->width  - 1) * 0.5f;
        const float cy = (float)(win->height - 1) * 0.5f;

        const mat3 rot = rotation(t * SPIN_X, t * SPIN_Y, t * SPIN_Z);

        const float xx = rot.cx.x, xy = rot.cx.y, xz = rot.cx.z;
        const float yx = rot.cy.x, yy = rot.cy.y, yz = rot.cy.z;
        const float zx = rot.cz.x, zy = rot.cz.y, zz = rot.cz.z;

        const vec3 *restrict verts = m->verts;

        for (unsigned i = 0; i < m->nverts; i++) {
                const float vx = verts[i].x, vy = verts[i].y, vz = verts[i].z;
                const float k = scale / (xz * vx + yz * vy + zz * vz + CAM_DIST);

                pv[i].x = cx + (xx * vx + yx * vy + zx * vz) * k * CELL_ASPECT;
                pv[i].y = cy + (xy * vx + yy * vy + zy * vz) * k;
        }

        const tri *restrict tris = m->tris;

        for (unsigned f = 0; f < m->ntris; f++) {
                const uint8_t *v = tris[f].v;

                const float ax = pv[v[0]].x, ay = pv[v[0]].y;
                const float bx = pv[v[1]].x, by = pv[v[1]].y;
                const float dx = pv[v[2]].x, dy = pv[v[2]].y;

                if ((bx - ax) * (dy - ay) - (by - ay) * (dx - ax) >= 0.0f)
                        continue;

                fill_tri(win, ax, ay, bx, by, dx, dy, tris[f].c);
        }
}

WASM_EXPORT char *cube_grid(void) {
        return grid;
}

WASM_EXPORT int cube_max_width(void) {
        return MAX_W;
}

WASM_EXPORT int cube_max_height(void) {
        return MAX_H;
}

WASM_EXPORT int cube_shape_count(void) {
        return (int)nshapes;
}

// name of shape i, as a nul-terminated string in wasm memory
WASM_EXPORT const char *cube_shape_name(int i) {
        if (i < 0 || (size_t)i >= nshapes)
                return nullptr;

        return shapes[i].name;
}

// rasterise shape i at w*h into the grid; returns 0 on success
WASM_EXPORT int cube_render(int i, int w, int h, float t) {
        if (i < 0 || (size_t)i >= nshapes)
                return 1;
        if (w <= 0 || h <= 0 || w > MAX_W || h > MAX_H)
                return 1;

        const window win = { .width = w, .height = h, .grid = grid };

        memset(grid, ' ', (size_t)w * (size_t)h);

        pvert pv[MESH_MAX_VERTS];
        draw_mesh(&win, &shapes[i], pv, fit_scale(&win, shapes[i].radius), t);

        return 0;
}
