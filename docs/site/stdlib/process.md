# std/process

Command execution and child process management.

```milo
from "std/process" import { Process, run, capture }
```

## Types

### Process

```milo
struct Process {
    pid: i32,
}
```

Handle to a spawned child process.

## Functions

### run

```milo
fn run(command: &string): Result<i32>
```

Execute a shell command and wait for it to finish. Returns the exit code.

### Process.spawn

```milo
fn Process.spawn(command: &string): Result<Process>
```

Start a command in the background without waiting. Returns a `Process` handle.

### p.wait

```milo
fn wait(self: &Process): Result<i32>
```

Block until the process exits. Returns the exit code.

### capture

```milo
fn capture(command: &string): Result<string>
```

Execute a command and return its stdout as a string.

### p.signal

```milo
fn signal(self: &Process, sig: i32): Result<i32>
```

Send a POSIX signal to the process. Returns 0 on success.

## Command

`Command` builds a child process: program, arguments, working directory, environment, and
where each standard stream goes. Each method takes the builder and hands it back, so calls
chain; `spawn` borrows, so one `Command` can start several children.

```milo
from "std/process" import { Command, Stdio }

let child = Command.new("git")
    .arg("status")
    .dir(repoPath)
    .env("GIT_PAGER", "cat")
    .stderr(Stdio.Pipe)
    .spawn()!
```

| Method | Effect |
|---|---|
| `Command.new(program)` | PATH-searched program, no arguments |
| `.arg(value)` / `.args(values)` | append arguments — passed verbatim, no shell |
| `.dir(path)` | run the child in `path` |
| `.env(name, value)` | set a variable for the child only |
| `.envRemove(name)` | drop an inherited variable |
| `.envClear()` | start from an empty environment instead of inheriting |
| `.stdin(mode)` / `.stdout(mode)` / `.stderr(mode)` | point one stream somewhere |
| `.spawn()` | start the child, returning `Result<Child>` |

Defaults are stdin and stdout on pipes with stderr merged into stdout — the same shape
`Child.spawn(program, args, true)` has always had. When stderr is *not* merged, drain both
streams or the child can deadlock filling an unread pipe.

### Stdio

```milo
enum Stdio {
    Pipe,            // the parent holds the other end
    Inherit,         // the parent's own stream
    Null,            // /dev/null, or NUL on Windows
    Merge,           // stderr only: wherever stdout went
    Read(string),    // stdin only: read this file
    Write(string),   // stdout/stderr only: create or truncate this file
    Append(string),  // stdout/stderr only: create or append to this file
}
```

The last four are direction-specific. Pointing one at the wrong stream is a `spawn` error
naming the stream, and no child is created — a redirection that cannot be honoured never
silently lands on your terminal instead.

Reading a stream that is not a pipe is a contract violation: `writeStdin`, `readStdout`
and `stdout()` all require their fd, checked in debug builds.

### Command.env vs Env.set

`Command.env` changes one child's environment. `Env.set` (in `std/env`) changes *this*
process's environment, which every later child inherits. Prefer `Command.env` — it has no
thread-safety caveat and no effect on anything but the child you are starting.

## Example

```milo
from "std/process" import { Command, Process, Stdio, run, capture }

fn main(): i32 {
    // Run and get exit code
    let code = run("echo hello")!

    // Capture output
    let output = capture("uname -s")!
    print(output)

    // Spawn and wait
    let proc = Process.spawn("sleep 1")!
    let exitCode = proc.wait()!

    // A child with its own cwd, environment and log file
    var child = Command.new("make")
        .arg("-j4")
        .dir("build")
        .env("CC", "clang")
        .stdout(Stdio.Write("build.log"))
        .stderr(Stdio.Merge)
        .spawn()!
    let status = child.wait()!
    child.close()

    return 0
}
```
