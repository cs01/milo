// Differential self-test for tools/wasm/runtime.c's float conversions, at the
// C level. Compiled twice from this one source: once natively against the
// host libc (the oracle) and once for wasm64 against runtime.c. Diff the two
// stdouts byte for byte — tools/wasm/float-diff.sh does that.
//
// This is the counterpart to tools/wasm/float-diff.milo, which covers the same
// ground through the compiler. Milo only ever emits "%.*g", so without this
// file %f, %e, every non-default precision, and strtod's endptr/edge behaviour
// would ship untested.
//
// Deliberately includes no headers: the wasm build is freestanding and has
// none. The three prototypes below are the whole libc surface it needs, and
// they are ABI-compatible with the host's on any LP64 target.
int snprintf(char *buf, __SIZE_TYPE__ cap, const char *fmt, ...);
int printf(const char *fmt, ...);
double strtod(const char *s, char **end);
float strtof(const char *s, char **end);

typedef unsigned long long u64;
typedef unsigned int u32;

static double bitsToF64(u64 b) { double d; __builtin_memcpy(&d, &b, 8); return d; }
static u64 f64ToBits(double d) { u64 b; __builtin_memcpy(&b, &d, 8); return b; }
static u32 f32ToBits(float f) { u32 b; __builtin_memcpy(&b, &f, 4); return b; }

static u64 rngState = 0x853C49E6748FEA9BULL;
static u64 nextRand(void) {
    rngState ^= rngState << 13;
    rngState ^= rngState >> 7;
    rngState ^= rngState << 17;
    return rngState;
}

// Never uses a width or a flag: runtime.c parses those and drops them (see its
// section header), so a padded specifier would diverge for a reason that has
// nothing to do with float conversion.
static char buf[4096];

static const char *CONVS = "fFeEgG";
static const int PRECS[] = { -1, 0, 1, 2, 3, 5, 6, 9, 15, 17, 20, 30, 50, 100, 400 };
#define NPRECS ((int)(sizeof(PRECS) / sizeof(PRECS[0])))

static void formatOne(double v) {
    for (const char *c = CONVS; *c; c++) {
        for (int i = 0; i < NPRECS; i++) {
            char fmt[8];
            int n;
            if (PRECS[i] < 0) { fmt[0] = '%'; fmt[1] = *c; fmt[2] = 0; n = snprintf(buf, sizeof buf, fmt, v); }
            else { fmt[0] = '%'; fmt[1] = '.'; fmt[2] = '*'; fmt[3] = *c; fmt[4] = 0; n = snprintf(buf, sizeof buf, fmt, PRECS[i], v); }
            printf("%llx %c %d %d [%s]\n", f64ToBits(v), *c, PRECS[i], n, buf);
        }
    }
    // Round-trip: 17 significant digits always reads back bit-identical, and
    // this is exactly the property codegen's print/re-parse search depends on.
    snprintf(buf, sizeof buf, "%.17e", v);
    printf("rt %llx -> %llx\n", f64ToBits(v), f64ToBits(strtod(buf, 0)));
}

static void parseOne(const char *s) {
    char *end = 0;
    double d = strtod(s, &end);
    long consumed = end ? (long)(end - s) : -1;
    printf("p [%s] %llx %ld", s, f64ToBits(d), consumed);
    end = 0;
    float f = strtof(s, &end);
    printf(" | %x %ld\n", f32ToBits(f), end ? (long)(end - s) : -1);
}

int main(void) {
    static const u64 EDGES[] = {
        0x0000000000000000ULL, 0x8000000000000000ULL, 0x0000000000000001ULL,
        0x0000000000000002ULL, 0x000000000000000FULL, 0x0008000000000000ULL,
        0x000FFFFFFFFFFFFFULL, 0x0010000000000000ULL, 0x0010000000000001ULL,
        0x3FF0000000000000ULL, 0xBFF0000000000000ULL, 0x3FB999999999999AULL,
        0x3FD5555555555555ULL, 0x3FD3333333333334ULL, 0x4059000000000000ULL,
        0x4341C37937E08000ULL, 0x4406345785D8A000ULL, 0x444B1AE4D6E2EF50ULL,
        0x4480F0CF064DD592ULL, 0x3E7AD7F29ABCAF48ULL, 0x419D6F34547E6B75ULL,
        0x7FEFFFFFFFFFFFFFULL, 0xFFEFFFFFFFFFFFFFULL, 0x7FF0000000000000ULL,
        0xFFF0000000000000ULL, 0x7FF8000000000000ULL, 0xFFF8000000000000ULL,
        0x3FD0000000000000ULL, /* 0.25 — a %f rounding tie */
        0x4004000000000000ULL, /* 2.5  — another tie */
        0x43F0000000000000ULL, 0x4B18000000000000ULL, 0x7FEFFFFFFFFFFFFEULL,
    };
    for (unsigned i = 0; i < sizeof EDGES / sizeof EDGES[0]; i++) formatOne(bitsToF64(EDGES[i]));

    // Uniform bit patterns: the exponent extremes, subnormals, inf and nan.
    for (int i = 0; i < 120; i++) formatOne(bitsToF64(nextRand()));
    // Exponents crowded around 1.0, where %g stays in fixed notation.
    for (int i = 0; i < 120; i++) {
        u64 r = nextRand();
        formatOne(bitsToF64(((((r >> 52) % 61) + 993) << 52) | (r & 0x000FFFFFFFFFFFFFULL)));
    }
    // The full exponent ladder, integral and reciprocal.
    for (int e = -320; e <= 308; e += 4) {
        snprintf(buf, sizeof buf, "1e%d", e);
        formatOne(strtod(buf, 0));
    }

    static const char *PARSES[] = {
        "0", "-0", "+0", "1", "-1", "1.", ".5", "+.5", "-.5", "5.", "0.0",
        "1e10", "1e-10", "1e308", "1e309", "1e-320", "1e-324", "1e-400", "1e400",
        "4.9406564584124654e-324", "2.2250738585072011e-308", "2.2250738585072014e-308",
        "0.1", "1e22", "1e23", "9007199254740993", "9007199254740992",
        "18446744073709551616", "340282356779733661637539395458142568448",
        "0.000000000000000000000000000000000000011754943508222875",
        "1.7976931348623157e308", "1.7976931348623159e308",
        "12abc", "  3.5xyz", "\t-7.25e2rest", "1e", "1e+", "1exyz", "e5", "", " ",
        ".", "-", "+", "abc", "inf", "-inf", "INFINITY", "nan", "-NaN", "infinit",
        "0000000000000000000000000000001", "1000000000000000000000000000000e-30",
        "00.0000000000000000000000000000000000000000000000001e50",
        // 40 nines then a 5: a digit far past the cap decides nothing, but the
        // sticky bit it sets has to break the tie the leading digits create.
        "0.99999999999999999999999999999999999999995",
        "1.00000000000000000000000000000000000000005e0",
        "2.00000000000000011102230246251565404236316680908203125",  // exact midpoint, ties-to-even
        "2.000000000000000111022302462515654042363166809082031250001",
        "1.00000005960464477539062500",  // f32 midpoint, ties-to-even
        "1.000000059604644775390625000000001",
        "3.4028235677973366e38", "3.4028235677973365e38", "1.1754943508222875e-38",
        "7.0064923216240854e-46", "7.0064923216240855e-46",
    };
    for (unsigned i = 0; i < sizeof PARSES / sizeof PARSES[0]; i++) parseOne(PARSES[i]);

    // Every value printed at 17 significant digits and read back: the exact
    // property codegen's round-trip search relies on.
    for (int i = 0; i < 4000; i++) {
        double v = bitsToF64(nextRand());
        snprintf(buf, sizeof buf, "%.17g", v);
        u64 got = f64ToBits(strtod(buf, 0));
        printf("g17 %llx %s %llx\n", f64ToBits(v), buf, got);
    }
    return 0;
}
