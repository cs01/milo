# Error Handling

Milo has no exceptions and no null. Errors are values — the type system makes you handle them explicitly. If a function can fail, its return type says so, and the compiler ensures you deal with it.

## Result basics

Functions that can fail return `Result<T>`. This is an enum with two variants: `Result.Ok(value)` on success, `Result.Err(message)` on failure. You can never accidentally ignore an error.

```milo
from "std/fs" import { readFile }
from "std/strconv" import { parseInt }

fn readNumber(path: &string): Result<i64, IoError> {
    let text = readFile(path)?
    match parseInt(text.trim()) {
        Option.Some(n) => { return Result.Ok(n) }
        Option.None => { return Result.Err(IoError.Other("not a number")) }
    }
}
```

## The `?` operator — propagate errors

The `?` operator says "if this failed, return the error to my caller." It only works inside functions that themselves return `Result`. This is the most common way to handle errors — let them bubble up to the right level.

```milo
from "std/fs" import { readFile }

fn loadConfig(path: &string): Result<string, IoError> {
    let text = readFile(path)?     // error? return it to our caller
    return Result.Ok(text)
}
```

## The `!` operator — unwrap or panic

The `!` operator says "I'm sure this will succeed — crash if it doesn't." Use it in top-level code, quick scripts, or when you've already validated the input. In production code, prefer `?` or `??`.

```milo
from "std/fs" import { readFile }
from "std/strconv" import { parseInt }

fn readNumber(path: &string): Result<i64, IoError> {
    let text = readFile(path)?
    match parseInt(text.trim()) {
        Option.Some(n) => { return Result.Ok(n) }
        Option.None => { return Result.Err(IoError.Other("not a number")) }
    }
}

fn main(): i32 {
    let n = readNumber("count.txt")!   // panic if file missing
    print(n)
    return 0
}
```

## The `??` operator — provide a default

The `??` operator says "if this failed, use this value instead." The error is silently discarded. Good for cases where a sensible fallback exists.

```milo
from "std/fs" import { readFile }
from "std/strconv" import { parseInt }

fn readNumber(path: &string): Result<i64, IoError> {
    let text = readFile(path)?
    match parseInt(text.trim()) {
        Option.Some(n) => { return Result.Ok(n) }
        Option.None => { return Result.Err(IoError.Other("not a number")) }
    }
}

fn main(): i32 {
    let n = readNumber("count.txt") ?? 0   // missing file? just use 0
    print(n)
    return 0
}
```

## Matching on results

When you need to handle success and failure differently, use `match`. This gives you full control — you can inspect the error, log it, recover, or take different paths.

```milo
from "std/fs" import { readFile }
from "std/strconv" import { parseInt }

fn readNumber(path: &string): Result<i64, IoError> {
    let text = readFile(path)?
    match parseInt(text.trim()) {
        Option.Some(n) => { return Result.Ok(n) }
        Option.None => { return Result.Err(IoError.Other("not a number")) }
    }
}

fn run(): Result<i32, IoError> {
    let n = readNumber("count.txt")?
    return Result.Ok(n as i32)
}

fn main(): i32 {
    match run() {
        Result.Ok(code)  => { return code }
        Result.Err(msg)  => {
            print("error: ", msg)
            return 1
        }
    }
}
```

## Typed errors with `Result<T, E>`

The default `Result<T>` carries a string error message. When you need to branch on the *cause* of a failure — not just whether it failed — define a custom error enum and use `Result<T, E>`.

```milo skip
// Sketch: `...` stands in for the body. std/io already defines IoError with these
// variants plus IsDirectory, AlreadyExists and Other.
enum IoError {
    NotFound(string),
    PermissionDenied(string),
}

fn readFile(path: string): Result<string, IoError> { ... }
```

Now callers can match on specific failure modes. Patterns do not nest, so bind the error and match it in a second step:

```milo
from "std/fs" import { readFile }

fn parse(data: string) {
    print("parsed ", data.len, " bytes")
}

fn useDefaults() {
    print("using defaults")
}

match readFile("config.toml") {
    Result.Ok(data) => { parse(data) }
    Result.Err(e) => {
        match e {
            IoError.NotFound(_)         => { useDefaults() }
            IoError.PermissionDenied(p) => { print("denied: ", p) }
            _                           => { print("other error") }
        }
    }
}
```

## Auto-conversion with `?`

When your function's error enum has a variant that wraps another error type, `?` auto-converts for you. No conversion boilerplate needed.

```milo
enum ParseError {
    BadNumber(string),
}

enum AppError {
    Io(IoError),         // wraps IoError
    Parse(ParseError),   // wraps ParseError
}
```

The compiler sees that `AppError` has an `Io(IoError)` variant, so `?` on a `Result<_, IoError>` automatically wraps the error into `AppError.Io(e)`:

```milo
from "std/fs" import { readFile }

enum ParseError {
    BadNumber(string),
}

enum AppError {
    Io(IoError),
    Parse(ParseError),
}

fn parseNum(text: string): Result<i32, ParseError> {
    return Result.Ok(text.len as i32)
}

fn process(path: string): Result<i32, AppError> {
    let text = readFile(path)?        // IoError -> AppError.Io, automatic
    let n = parseNum(text)?           // ParseError -> AppError.Parse, automatic
    return Result.Ok(n)
}
```

In Rust, this requires the `thiserror` crate or hand-written `From` implementations. In Milo, the compiler generates the conversion automatically.

Next: [Ownership](./ownership)
