// The workload Milo bans: N threads writing disjoint ranges of ONE shared
// buffer in place. Zero copies, zero extra memory.
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/time.h>

#define N 20000000L
#define WORKERS 4

static double *a;

typedef struct { long lo, hi; } Range;

static void *work(void *arg) {
    Range *r = (Range *)arg;
    for (long i = r->lo; i < r->hi; i++)
        a[i] = a[i] * 1.0000001 + 0.5;
    return NULL;
}

static long now_ms(void) {
    struct timeval tv; gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000L + tv.tv_usec / 1000L;
}

int main(void) {
    a = malloc(N * sizeof(double));
    for (long i = 0; i < N; i++) a[i] = 1.0;

    long t0 = now_ms();
    pthread_t ts[WORKERS];
    Range rs[WORKERS];
    long chunk = N / WORKERS;
    for (int k = 0; k < WORKERS; k++) {
        rs[k].lo = k * chunk;
        rs[k].hi = (k == WORKERS - 1) ? N : rs[k].lo + chunk;
        pthread_create(&ts[k], NULL, work, &rs[k]);
    }
    for (int k = 0; k < WORKERS; k++) pthread_join(ts[k], NULL);
    long t1 = now_ms();

    double sum = 0;
    for (long i = 0; i < N; i++) sum += a[i];
    printf("c_par ms=%ld sum=%.1f\n", t1 - t0, sum);
    return 0;
}
