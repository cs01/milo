# Examples

Runnable Milo programs. They double as integration smoke tests for the standard library.

```bash
./milo run examples/hello.milo
./milo build examples/graphics/donut.milo -o /tmp/donut
```

| Folder | What's in it |
|--------|--------------|
| [`hello.milo`](hello.milo) | The canonical first program |
| [`basics/`](basics) | Language and stdlib fundamentals: fib, fizzbuzz, json, arenas, a small interpreter |
| [`cli-tools/`](cli-tools) | Coreutils-style tools, one `.milo` file each: grep, jq, tree, fmt, pkg |
| [`graphics/`](graphics) | Truecolor terminal rendering: donut, plasma, aquarium, raytracers |
| [`simulation/`](simulation) | Physics and numerical simulation: cloth, rigid bodies, phase space |
| [`terminal/`](terminal) | TUIs and PTY work: tetris, sysmon, a mini tmux |
| [`net/`](net) | HTTP servers and clients, plus the weather and termpair apps |
| [`embedded/`](embedded) | Bare-metal and control code: PID step, flight controller |
| [`runtimes/`](runtimes) | Language runtimes written in Milo: milojs (a JS engine), minibun |
| [`tools/`](tools) | Developer tools: java-dap (JVM debug adapter) |

Network examples need an internet connection.

The three biggest Milo programs outgrew this directory and have their own repos:
[emulators](https://github.com/milo-language/emulators) (NES/SNES/Genesis),
[milojs](https://github.com/milo-language/milojs) (JS engine + runtime), and
[dapweb](https://github.com/milo-language/dapweb) (DAP debugger with a web UI).
