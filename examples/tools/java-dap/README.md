# java-dap

A Debug Adapter Protocol server for the JVM, ~1300 lines of Milo. The JVM ships
its own agent, so this is DAP↔JDWP translation. Notes in [design.md](design.md).

```bash
milo build examples/tools/java-dap/src/main.milo -o ~/bin/java-dap
```

Launch and attach, deferred breakpoints, stepping, stack traces, variables,
dotted-path evaluate, exception breakpoints. No conditional breakpoints, hot
reload, or Maven/Gradle classpaths. Compile with `javac -g`.
