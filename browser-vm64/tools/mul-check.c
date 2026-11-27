#include <stdio.h>
#include <stdint.h>
/* Compares the processor's overflow flag after a 32-bit signed multiply with
   the answer worked out in 64-bit arithmetic, many times, so the emulator's
   compiled (hot) code path is used as well as its interpreter. */
static uint32_t s = 12345;
static inline uint32_t rnd(void) { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return s; }
__attribute__((noinline)) int mulv(int a, int b, int *r) { return __builtin_mul_overflow(a, b, r); }
int main(void) {
  long bad = 0, n, firstn = -1; int fa = 0, fb = 0, r;
  static const int k[] = {62209, 3329, 1000, -7, 65536, 46341};
  for (n = 0; n < 6000000; n++) {
    int a = (n & 1) ? (int16_t)rnd() : (int)rnd();
    int b = k[n % 6];
    int got = mulv(a, b, &r);
    long wide = (long)a * (long)b;
    int want = wide != (long)(int)wide;
    if (got != want || (!want && r != (int)wide)) { if (!bad) { firstn = n; fa = a; fb = b; } bad++; }
  }
  printf("checked %ld multiplies, wrong: %ld", n, bad);
  if (bad) printf(" (first at %ld: %d * %d)", firstn, fa, fb);
  printf("\n");
  return 0;
}
