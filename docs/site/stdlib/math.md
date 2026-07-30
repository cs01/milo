# std/math

Mathematical functions and constants.

```milo
from "std/math" import { Math }
```

## Functions

### Floating-Point Math

```milo
fn Math.sqrt(x: f64): f64
fn Math.pow(base: f64, exp: f64): f64
fn Math.sin(x: f64): f64
fn Math.cos(x: f64): f64
fn Math.tan(x: f64): f64
fn Math.atan2(y: f64, x: f64): f64
fn Math.floor(x: f64): f64
fn Math.ceil(x: f64): f64
fn Math.round(x: f64): f64
fn Math.abs(x: f64): f64
fn Math.mod(x: f64, y: f64): f64
fn Math.log(x: f64): f64
fn Math.log2(x: f64): f64
fn Math.log10(x: f64): f64
fn Math.exp(x: f64): f64
```

### Integer Math

```milo
fn absI64(x: i64): i64
fn absI32(x: i32): i32
fn minI64(a: i64, b: i64): i64
fn maxI64(a: i64, b: i64): i64
fn minI32(a: i32, b: i32): i32
fn maxI32(a: i32, b: i32): i32
fn minF64(a: f64, b: f64): f64
fn maxF64(a: f64, b: f64): f64
fn clampI64(x: i64, lo: i64, hi: i64): i64
fn clampF64(x: f64, lo: f64, hi: f64): f64
```

### Constants

```milo
fn mathPi(): f64
fn mathE(): f64
fn mathInf(): f64
```
