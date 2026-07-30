# Regular Expressions (`std/regex`)

```milo
from "std/regex" import { Regex, RegexMatch }
```

`Regex` is a compiled regular expression. Compilation is fallible; searching a
valid expression may simply find no match. Keeping those outcomes separate is
the module's error model.

## API

```milo
fn Regex.compile(pattern: string): Result<Regex>
fn Regex.compileFlags(pattern: string, flags: i32): Result<Regex>
fn Regex.isMatch(self: &Regex, input: &string): bool
fn Regex.find(self: &Regex, input: &string): Option<RegexMatch>
fn Regex.findAll(self: &Regex, input: &string): Vec<RegexMatch>
```

`RegexMatch.start` and `.end` are byte offsets into the input string.

```milo
let re = Regex.compile("[0-9]+")?
if re.isMatch("abc123") {
    let first = re.find("abc123")!
    print("abc123"[first.start..first.end])
}
```

Compile once and reuse the value. Windows currently fails loudly because the
pure-Milo regex engine remains planned; macOS and Linux use POSIX regex.
