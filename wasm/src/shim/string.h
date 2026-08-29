#ifndef SHIM_STRING_H
#define SHIM_STRING_H

#include <stddef.h>

void *memset(void *dst, int c, size_t n);
int strcmp(const char *a, const char *b);

#endif
