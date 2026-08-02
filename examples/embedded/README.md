# Embedded

Memory safety with no GC and no runtime, proven end to end on bare-metal ARM.

```bash
examples/embedded/prove.sh   # bun, clang+lld, qemu-system-arm, llvm-objdump
```

Six stages over `pidStep.milo`, a Q16.16 PID kernel: ISO 26262 ASIL-D check,
WCET flow facts, cycle bound, Cortex-M3 ELF, QEMU run, then `llvm-objdump`
checking the instruction count against real machine code.

Bare metal gets a bump heap (`--heap-size` caps it); `--safety` bans allocation.
