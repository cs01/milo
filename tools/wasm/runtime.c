// Freestanding wasm64 runtime for Milo programs — the wasm64 analog of
// tools/cortex-m/startup.c. There is no OS, no libc, no crt0: this file
// supplies every symbol Milo's codegen (src/codegen.ts) can auto-declare
// (see its declaredExterns pass), plus a JS/host I/O boundary, so that
// `clang --target=wasm64-unknown-unknown -nostdlib` can link a Milo module
// straight to a runnable .wasm.
//
// Design mirrors startup.c: a bump allocator (no reclamation), hand-rolled
// mem*/str* primitives, and every host interaction (write, randomness,
// process exit) funneled through a small number of `import_module("env")`
// declarations that tools/wasm/run.mjs implements in JS.
//
// wasm64 was chosen over wasm32 because Milo's codegen assumes an 8-byte
// size_t/pointer everywhere (see CLAUDE.md's target-selection note): malloc,
// memcpy, memcmp, memchr, fwrite, write are all declared with i64 size
// params, which matches wasm64 exactly and mismatches wasm32 on every one
// of them.
//
// Explicit non-goals, called out rather than silently botched:
//   - No float formatting/parsing. A correct freestanding dtoa/strtod
//     round-trip converter is a project in itself, and this repo's rule is
//     "fail loudly, never print a plausible-looking wrong number" (see
//     project_milo_float_roundtrip in memory / codegen.ts's ensureFloatFormatHelper).
//     Every float-producing or float-consuming entry point here aborts with
//     a clear message instead of guessing. src/codegen.ts's own float->string
//     path (@milo.fmt.f64) round-trips through snprintf("%.*g", ...) and
//     strtod to verify it — both abort here, so any Milo float ends up
//     visibly aborting rather than silently truncating to 6 significant
//     digits (the historical bug this repo already fixed once).
//   - No threads/async/net/fs/sockets: those need std/runtime's green-thread
//     scheduler (getcontext/makecontext/swapcontext + mmap) and std/os's BSD
//     socket calls, neither of which has a wasm equivalent short of an
//     Asyncify/CPS rewrite. std/platform.wasm.milo aborts those by name
//     rather than linking a stub that pretends to work.

typedef unsigned long long u64;
typedef long long i64;

// ── host imports (implemented in tools/wasm/run.mjs) ──────────────────────

// Byte-exact write of `n` bytes at `buf` to file descriptor `fd` (1=stdout,
// 2=stderr — the only two fds any Milo program can reach). Returns the
// number of bytes written, mirroring POSIX write(2). This is the ONE I/O
// primitive the whole runtime is built on: fwrite/putchar/dprintf/printf all
// funnel through it, so fd 1 vs fd 2 stay distinct all the way to the host
// (see src/codegen.ts's emitFdWrite/emitStdoutWrite/emitFdPrintf, which pick
// fd 1 for print()'s raw-string path and fd 2 for every panic/bounds/
// overflow message).
__attribute__((import_module("env"), import_name("fd_write")))
i64 __milo_fd_write(int fd, const void *buf, u64 n);

// Fills `n` bytes at `buf` with cryptographically-strong randomness. Backs
// getentropy(), which std/collections' HashMap uses to seed its DoS-resistant
// hash — a constant seed here would silently defeat that, so this must be a
// real host RNG call (crypto.getRandomValues in run.mjs), not a stub.
__attribute__((import_module("env"), import_name("get_random")))
void __milo_get_random(void *buf, u64 n);

// Terminates the host process with `code`, WASI proc_exit style. This is a
// real exit, not a wasm trap: it lets exit()/abort()/a checked-panic unwind
// out of arbitrarily deep Milo call frames by just ending the host process,
// exactly like _exit(2) does on a hosted target. run.mjs implements it as
// `process.exit(code)`.
__attribute__((import_module("env"), import_name("proc_exit")))
__attribute__((noreturn))
void __milo_proc_exit(int code);

// ── fatal-error helpers ────────────────────────────────────────────────────

static u64 milo_strlen(const char *s) {
    const char *p = s;
    while (*p) p++;
    return (u64)(p - s);
}

// Print a NUL-terminated message to stderr and end the process. Every
// "unsupported on wasm" path below (float format/parse, oom) funnels here so
// the failure is always visible on the console the host is watching, never a
// silent wrong value or a bare wasm trap with no explanation.
__attribute__((noreturn))
static void milo_fatal(const char *msg, int code) {
    __milo_fd_write(2, msg, milo_strlen(msg));
    __milo_proc_exit(code);
    __builtin_unreachable();
}

// ── bump allocator ──────────────────────────────────────────────────────────
//
// No reclamation, same as startup.c's — free() is a no-op. Unlike Cortex-M
// (a fixed RAM span from the linker script), wasm has no static memory
// ceiling: the heap starts at the linker-provided `__heap_base` (right after
// all of the program's static data — wasm-ld computes this the same way it
// computes __heap_base for wasm32) and grows the linear memory on demand via
// memory.grow, capped by -DMILO_HEAP_SIZE exactly like startup.c's bound on
// the Cortex-M heap.
//
// Each allocation gets an 8-byte size header ahead of the returned pointer.
// startup.c doesn't need one (its free() is a no-op and nothing ever calls
// realloc on that target), but wasm's std/collections growth path
// (bufAppendFn) does call realloc, and a bump allocator with no header has no
// way to know how many bytes of the old block were actually valid — it would
// have to guess. The header makes realloc's copy exact instead of a guess.
extern unsigned char __heap_base;

static unsigned char *g_heapNext = 0;   // bump cursor; lazily set to &__heap_base
static u64 g_heapBase = 0;              // cached (u64)&__heap_base, for the MILO_HEAP_SIZE cap

#define WASM_PAGE_SIZE 65536ULL

__attribute__((noreturn))
static void milo_oom(void) {
    milo_fatal("milo: out of memory (wasm heap exhausted)\n", 12); // ENOMEM, matches startup.c's oom() exit code
}

// Grow linear memory so that at least `untilByte` bytes are addressable.
// wasm memory only grows in whole 64 KiB pages and never shrinks, matching
// the one-way nature of startup.c's bump heap (also never reclaimed).
static void milo_ensureMemory(u64 untilByte) {
    u64 haveBytes = __builtin_wasm_memory_size(0) * WASM_PAGE_SIZE;
    if (untilByte <= haveBytes) return;
#ifdef MILO_HEAP_SIZE
    if (untilByte - g_heapBase > (u64)(MILO_HEAP_SIZE)) milo_oom();
#endif
    u64 needBytes = untilByte - haveBytes;
    u64 needPages = (needBytes + WASM_PAGE_SIZE - 1) / WASM_PAGE_SIZE;
    u64 got = __builtin_wasm_memory_grow(0, needPages);
    if (got == (u64)-1) milo_oom();
}

void *malloc(u64 n) {
    if (g_heapNext == 0) {
        g_heapNext = &__heap_base;
        g_heapBase = (u64)&__heap_base;
    }
    // header (8 bytes) + payload, 8-byte aligned throughout — the widest
    // primitive Milo ever hands libc is an i64/double/pointer, all 8-byte.
    u64 payload = (n + 7ULL) & ~7ULL;
    u64 total = payload + 8ULL;
    u64 base = (u64)g_heapNext;
    milo_ensureMemory(base + total);
    u64 *hdr = (u64 *)g_heapNext;
    *hdr = n; // record the CALLER's requested size, not the padded total — realloc copies exactly this many bytes
    void *p = (void *)(g_heapNext + 8);
    g_heapNext += total;
    return p;
}

void free(void *p) { (void)p; } // no reclamation — same tradeoff as startup.c, see file header

// malloc + memcpy the old bytes forward, then leak the old block (free() is
// already a no-op, so this costs nothing free() itself wasn't already
// costing). Correct, not space-efficient: a real allocator would resize in
// place when possible, but a bump allocator has no "in place" to resize into.
void *realloc(void *p, u64 newSize) {
    if (!p) return malloc(newSize);
    u64 oldSize = ((u64 *)p)[-1];
    void *np = malloc(newSize);
    u64 copyLen = oldSize < newSize ? oldSize : newSize;
    unsigned char *d = np;
    const unsigned char *s = p;
    for (u64 i = 0; i < copyLen; i++) d[i] = s[i];
    return np;
}

// ── mem*/str* primitives (ported from tools/cortex-m/startup.c) ───────────

void *memcpy(void *dst, const void *src, u64 n) {
    unsigned char *d = dst;
    const unsigned char *s = src;
    while (n--) *d++ = *s++;
    return dst;
}

void *memset(void *dst, int c, u64 n) {
    unsigned char *d = dst;
    while (n--) *d++ = (unsigned char)c;
    return dst;
}

// Not declared anywhere in src/codegen.ts or std/*.milo — clang's optimizer inserts
// this call ON ITS OWN. At -O2, InstCombine recognizes a malloc() immediately
// followed by memset(...,0,...) (std/collections' HashMap zeroing a fresh bucket
// array is the case that surfaced this) and rewrites the pair into one calloc()
// call, using the target's TargetLibraryInfo to decide the substitution is legal —
// which fires regardless of -ffreestanding, so simply never emitting a call to
// calloc from Milo's own output does not stop clang from inserting one anyway.
// Cheapest correct fix is to just supply it, the same way a real freestanding libc
// would (defined after malloc/memset above since it's built directly on both).
void *calloc(u64 nmemb, u64 size) {
    u64 n = nmemb * size; // no overflow-checked variant needed here — same as real calloc's baseline contract
    void *p = malloc(n);
    memset(p, 0, n);
    return p;
}

void *memchr(const void *s, int c, u64 n) {
    const unsigned char *p = s;
    while (n--) {
        if (*p == (unsigned char)c) return (void *)p;
        p++;
    }
    return 0;
}

int memcmp(const void *a, const void *b, u64 n) {
    const unsigned char *x = a, *y = b;
    while (n--) {
        if (*x != *y) return *x - *y;
        x++; y++;
    }
    return 0;
}

u64 strlen(const char *s) { return milo_strlen(s); }

// ── 128-bit multiply (compiler-rt's __multi3) ───────────────────────────────
//
// A freestanding link has no compiler-rt/libgcc to resolve the widening-
// multiply helper LLVM emits for i64*i64 overflow checks (see main.ts's
// reportMissingBuiltins, which explains the ARM sibling of this problem:
// __aeabi_* soft-float and __udivdi3-family 64-bit-divide helpers there).
// On wasm the gap is __multi3 specifically. Empirically confirmed (compiled
// this exact function standalone and inspected it with `wasm-objdump -x`)
// that clang's wasm64 backend legalizes `__int128 a * b` to straight-line
// code here rather than a recursive call to itself — the
// SelectionDAG legalizer special-cases "the library call I'd emit has the
// same name as the function I'm compiling" precisely so compiler-rt can be
// self-hosting. Confirmed via `wasm-objdump -x`: the compiled __multi3 has
// zero imports beyond memory/__stack_pointer, i.e. no self-call.
typedef __int128 ti_int;
ti_int __multi3(ti_int a, ti_int b) { return a * b; }

// ── formatted output ─────────────────────────────────────────────────────
//
// snprintf/dprintf/printf share one format-string walker. The specifier set
// is deliberately narrow — exactly what src/codegen.ts ever emits (grepped
// literal format strings in codegen.ts: %d %u %lld %llu %s %.*s %p %.*g;
// see BOUNDS_ERR_MSG, the overflow-check message, emitDisplayPart, and
// ensureFloatFormatHelper). Width/flags are parsed and skipped (accepted for
// robustness) but not applied — nothing Milo emits ever uses them.
//
// Floating conversions (%f %F %g %G %e %E %a %A) abort rather than guess:
// see the file header. This is also why %.*g specifically will always abort
// here — codegen's ONLY use of %.*g is the float round-trip formatter, so an
// aborting %.*g is exactly the "no float support" boundary, not a special case.

#include <stdarg.h>

typedef struct { char *buf; u64 cap; u64 pos; } Sink;

static void sinkPutc(Sink *s, char c) {
    if (s->buf && s->pos < s->cap) s->buf[s->pos] = c;
    s->pos++;
}

static void sinkWrite(Sink *s, const char *p, u64 n) {
    for (u64 i = 0; i < n; i++) sinkPutc(s, p[i]);
}

static void emitUnsigned(Sink *s, u64 v, int base, int upper) {
    char digitsBuf[32];
    int i = 0;
    const char *digits = upper ? "0123456789ABCDEF" : "0123456789abcdef";
    if (v == 0) digitsBuf[i++] = '0';
    while (v) { digitsBuf[i++] = digits[v % (u64)base]; v /= (u64)base; }
    while (i > 0) sinkPutc(s, digitsBuf[--i]);
}

static void emitSigned(Sink *s, i64 v) {
    if (v < 0) {
        sinkPutc(s, '-');
        // avoid UB negating INT64_MIN: fold the "+1" back in after negating the rest
        u64 uv = (u64)(-(v + 1)) + 1ULL;
        emitUnsigned(s, uv, 10, 0);
    } else {
        emitUnsigned(s, (u64)v, 10, 0);
    }
}

static void vformatTo(Sink *s, const char *fmt, va_list ap) {
    for (const char *f = fmt; *f; ) {
        if (*f != '%') { sinkPutc(s, *f++); continue; }
        f++; // skip '%'
        if (*f == '%') { sinkPutc(s, '%'); f++; continue; }
        // flags (accepted, not applied — see file header)
        while (*f == '-' || *f == '+' || *f == ' ' || *f == '0' || *f == '#') f++;
        // width
        if (*f == '*') { (void)va_arg(ap, int); f++; }
        else while (*f >= '0' && *f <= '9') f++;
        // precision
        int prec = -1;
        if (*f == '.') {
            f++;
            prec = 0;
            if (*f == '*') { prec = va_arg(ap, int); f++; }
            else while (*f >= '0' && *f <= '9') { prec = prec * 10 + (*f - '0'); f++; }
        }
        // length modifier
        int lenMod = 0; // 0 = int, 1 = long, 2 = long long
        if (*f == 'l') { f++; if (*f == 'l') { lenMod = 2; f++; } else lenMod = 1; }
        else if (*f == 'h') { f++; if (*f == 'h') f++; }
        else if (*f == 'z' || *f == 'j' || *f == 't') { lenMod = 2; f++; }
        char conv = *f ? *f++ : 0;
        switch (conv) {
            case 'd': case 'i': {
                i64 v = lenMod == 2 ? va_arg(ap, long long)
                       : lenMod == 1 ? va_arg(ap, long)
                       : va_arg(ap, int);
                emitSigned(s, v);
                break;
            }
            case 'u': case 'x': case 'X': case 'o': {
                u64 v = lenMod == 2 ? va_arg(ap, unsigned long long)
                       : lenMod == 1 ? va_arg(ap, unsigned long)
                       : va_arg(ap, unsigned int);
                int base = conv == 'o' ? 8 : (conv == 'u' ? 10 : 16);
                emitUnsigned(s, v, base, conv == 'X');
                break;
            }
            case 'p': {
                void *v = va_arg(ap, void *);
                sinkPutc(s, '0'); sinkPutc(s, 'x');
                emitUnsigned(s, (u64)v, 16, 0);
                break;
            }
            case 'c': {
                int v = va_arg(ap, int);
                sinkPutc(s, (char)v);
                break;
            }
            case 's': {
                const char *str = va_arg(ap, const char *);
                // %.*s: precision is an exact byte count, not "stop at NUL" —
                // codegen relies on this to print length-counted Milo strings
                // (which may contain embedded NULs) byte-exactly.
                u64 n = prec >= 0 ? (u64)prec : milo_strlen(str);
                sinkWrite(s, str, n);
                break;
            }
            case 'f': case 'F': case 'g': case 'G': case 'e': case 'E': case 'a': case 'A':
                // See file header: no freestanding dtoa/strtod. Loud abort, never a
                // plausible-looking wrong number.
                milo_fatal("milo: wasm target has no float formatting support (freestanding runtime has no dtoa) — a float reached printf/snprintf\n", 70);
                break;
            default:
                milo_fatal("milo: unsupported printf format specifier on wasm runtime\n", 70);
                break;
        }
    }
}

int vsnprintf(char *buf, u64 cap, const char *fmt, va_list ap) {
    Sink s = { buf, cap, 0 };
    vformatTo(&s, fmt, ap);
    if (buf && cap > 0) buf[s.pos < cap ? s.pos : cap - 1] = 0;
    return (int)s.pos;
}

int snprintf(char *buf, u64 cap, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int r = vsnprintf(buf, cap, fmt, ap);
    va_end(ap);
    return r;
}

// Shared by dprintf/printf: two-pass (count, then fill) so a single write()
// carries the whole message — no interleaving risk from multiple small
// writes, and no arbitrary truncation the way a fixed stack buffer would risk.
static int vfdprintf(int fd, const char *fmt, va_list ap) {
    va_list apCount;
    va_copy(apCount, ap);
    Sink counter = { 0, 0, 0 };
    vformatTo(&counter, fmt, apCount);
    va_end(apCount);

    u64 need = counter.pos;
    char stackBuf[512];
    char *buf = stackBuf;
    int heapAllocated = 0;
    if (need + 1 > sizeof(stackBuf)) { buf = malloc(need + 1); heapAllocated = 1; }

    Sink s = { buf, need + 1, 0 };
    vformatTo(&s, fmt, ap);
    __milo_fd_write(fd, buf, need);
    if (heapAllocated) free(buf);
    return (int)need;
}

int dprintf(int fd, const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int r = vfdprintf(fd, fmt, ap);
    va_end(ap);
    return r;
}

int printf(const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    int r = vfdprintf(1, fmt, ap);
    va_end(ap);
    return r;
}

// ── stdio surface print()/eprint() need ─────────────────────────────────────

long long write(int fd, const void *buf, u64 n) { return __milo_fd_write(fd, buf, n); }

int putchar(int c) {
    char ch = (char)c;
    __milo_fd_write(1, &ch, 1);
    return c;
}

// fwrite always sees size==1 in codegen's emitStdoutWrite (print()'s scalar/
// struct/container path) — nmemb IS the byte count there. `stream` is always
// our own dummy `stdout` object (see below), so it's ignored rather than
// dispatched on: there is nothing else it could be.
u64 fwrite(const void *ptr, u64 size, u64 nmemb, void *stream) {
    (void)stream;
    u64 n = size * nmemb;
    __milo_fd_write(1, ptr, n);
    return nmemb;
}

int fflush(void *stream) { (void)stream; return 0; } // no userland buffering to flush — every write above is already unbuffered

// codegen's stdoutSymbol getter emits "stdout" (glibc-style) for every OS
// except darwin (which gets "__stdoutp"); target.os is "wasm" here, so this
// is the symbol that gets referenced, not __stdoutp. It just needs to be a
// non-null FILE*-shaped value — fwrite above never dereferences it.
static int g_stdoutDummy = 1;
void *stdout = &g_stdoutDummy;

// ── process termination ─────────────────────────────────────────────────

__attribute__((noreturn)) void exit(int code) { __milo_proc_exit(code); __builtin_unreachable(); }
__attribute__((noreturn)) void _exit(int code) { __milo_proc_exit(code); __builtin_unreachable(); }

__attribute__((noreturn)) void abort(void) {
    milo_fatal("milo: abort()\n", 134); // 134 = 128+SIGABRT, matching a native abort()'s shell-visible exit code
}

// ── randomness ─────────────────────────────────────────────────────────────

int getentropy(void *buf, u64 n) {
    __milo_get_random(buf, n);
    return 0;
}

// ── float parsing: no freestanding dtoa/strtod, so loud abort (see file header) ──
//
// strtod/strtof are only ever reached from codegen's own float->string
// round-trip helper (@milo.fmt.f64/@milo.fmt.f32 in src/codegen.ts), which
// already calls snprintf("%.*g", ...) first — that call aborts before strtod
// would ever run. These exist only to satisfy the linker.
double strtod(const char *s, char **end) {
    (void)s; (void)end;
    milo_fatal("milo: wasm target has no float parsing support (strtod)\n", 70);
}

float strtof(const char *s, char **end) {
    (void)s; (void)end;
    milo_fatal("milo: wasm target has no float parsing support (strtof)\n", 70);
}

// std/string.milo's parseFloat() calls this directly.
double atof(const char *s) {
    (void)s;
    milo_fatal("milo: wasm target has no float parsing support (atof) — string-to-float conversion is unavailable on this target\n", 70);
}
