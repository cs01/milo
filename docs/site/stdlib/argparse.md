# std/argparse

CLI argument parsing with typed flags, positional args, and auto-generated help text.

```milo
from "std/argparse" import { ArgParser, ParsedArgs }
```

## Quick start

```milo
from "std/argparse" import { ArgParser, ParsedArgs }

fn main(): i32 {
    var parser = ArgParser.new("greet", "A greeting tool")
    parser.addRequired("name", "n", "Name to greet")
    parser.addBool("loud", "l", "Shout the greeting")
    parser.addOptionalPositional("title", "Optional title prefix")

    let args = parser.parse()
    let name = args.getString("name") ?? ""

    if args.getBool("loud") {
        print($"HELLO, {name}!")
    } else {
        print($"Hello, {name}")
    }

    return 0
}
```

```bash
$ greet --name Alice --loud
HELLO, Alice!

$ greet --help
greet - A greeting tool

usage: greet [options] [title]

arguments:
  <title>                     Optional title prefix

options:
  -n, --name <value>          Name to greet (required)
  -l, --loud                  Shout the greeting
  -h, --help                  Show this help message
```

Define flags, call `parse()`, access typed values. `--help` is generated automatically. Missing required flags print an error with usage.

## Types

### FlagDef

```milo
struct FlagDef {
    longName: string,
    shortName: string,
    help: string,
    defaultVal: string,
    isBool: bool,
    isI64: bool,
    required: bool,
}
```

### PositionalDef

```milo
struct PositionalDef {
    name: string,
    help: string,
    required: bool,
}
```

### ArgEntry

```milo
struct ArgEntry {
    name: string,
    value: string,
    present: bool,
}
```

### ArgParser

```milo
struct ArgParser {
    name: string,
    description: string,
    flags: Vec<FlagDef>,
    positionals: Vec<PositionalDef>,
}
```

#### Methods

### addString

```milo
fn ArgParser.addString(self: &mut ArgParser, long: string, short: string, help: string, defaultVal: string): void
```

Register an optional string flag (e.g. `--output`, `-o`). `defaultVal` is what `getString` returns when the flag is absent; pass `""` for no default.

### addRequired

```milo
fn ArgParser.addRequired(self: &mut ArgParser, long: string, short: string, help: string): void
```

Register a required string flag. Parsing fails if omitted.

### addBool

```milo
fn ArgParser.addBool(self: &mut ArgParser, long: string, short: string, help: string): void
```

Register a boolean flag. Present = true, absent = false.

### addI64

```milo
fn ArgParser.addI64(self: &mut ArgParser, long: string, short: string, help: string, defaultVal: i64): void
```

Register an integer flag with a default value. The value is validated as numeric at parse time.

### addPositional

```milo
fn ArgParser.addPositional(self: &mut ArgParser, name: string, help: string): void
```

Register a required positional argument.

### addOptionalPositional

```milo
fn ArgParser.addOptionalPositional(self: &mut ArgParser, name: string, help: string): void
```

Register an optional positional argument.

### enableTrailingArgs

```milo
fn ArgParser.enableTrailingArgs(self: &mut ArgParser): void
```

Stop flag parsing after the first positional argument. All remaining arguments are collected as positionals without interpretation. Useful for runtimes and wrappers where flags before the command are yours, and everything after belongs to the child process.

The `--` separator is always supported regardless of this setting — arguments after `--` are never parsed as flags.

```milo
var parser = ArgParser.new("node-milo", "JS runtime")
parser.addBool("version", "v", "Print version")
parser.addOptionalPositional("script", "Script to run")
parser.enableTrailingArgs()
let args = parser.parse()
// node-milo script.js --foo  →  --foo lands in args.positional, not parsed as a flag
```

### helpText

```milo
fn ArgParser.helpText(self: &ArgParser): string
```

Generate a formatted help/usage string.

### parse

```milo
fn ArgParser.parse(self: &ArgParser): ParsedArgs
fn ArgParser.parseFrom(self: &ArgParser, argv: Vec<string>): ParsedArgs
```

`parse` reads the real process argv; `parseFrom` takes the vector, which is what a test
wants. Neither returns a `Result`: a missing required flag or a bad `--help` prints usage
and exits, so the parsed value is always usable.

### setEpilog / enableIgnoreUnknown

```milo
fn ArgParser.setEpilog(self: &mut ArgParser, text: string): void
fn ArgParser.enableIgnoreUnknown(self: &mut ArgParser): void
```

`setEpilog` appends a block of text below the generated options list. `enableIgnoreUnknown`
passes an unrecognised flag through instead of erroring — for a wrapper that forwards flags
it does not itself define.

### ParsedArgs

```milo
struct ParsedArgs {
    entries: Vec<ArgEntry>,
}
```

#### Methods

### getString

```milo
fn ParsedArgs.getString(self: &ParsedArgs, name: &string): Option<string>
```

Value of the flag or positional `name`. `None` when the name was never declared, or
was declared with no default and not supplied; `--flag ""` is `Some("")`. A declared
default is a value, so it comes back as `Some`. Use `?? "fallback"` to collapse.

### getI64

```milo
fn ParsedArgs.getI64(self: &ParsedArgs, name: &string): i64
```

Value of the flag parsed as `i64` — the default registered with `addI64` when it was not
supplied, and `0` for a name that was never declared.

### getU16

```milo
fn ParsedArgs.getU16(self: &ParsedArgs, name: &string): u16
```

The same value narrowed to `u16`, for a port or similar.

### getBool

```milo
fn ParsedArgs.getBool(self: &ParsedArgs, name: &string): bool
```

Returns `true` if the boolean flag was present.

### has

```milo
fn ParsedArgs.has(self: &ParsedArgs, name: &string): bool
```

Check whether a key exists in the parsed results.

## Functions

### ArgParser.new

```milo
fn ArgParser.new(name: string, description: string): ArgParser
```

Create a new argument parser with the given program name and description.
