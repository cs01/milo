// Case runner for scripts/fuzz-frontend.ts. Lives in a Worker for one reason:
// a parser that loses its error-recovery invariant spins forever inside a
// synchronous loop, and nothing on the same thread can interrupt that. The
// driver times the worker out and terminates it, which is the only in-process
// way to detect a hang without paying process-spawn cost per case.
import { runCase } from "./fuzz-check";

let phase: Int32Array | undefined;
let doResolve = false;
let sourceDir = process.cwd();

declare const self: Worker;

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.init) {
    phase = new Int32Array(msg.sab);
    doResolve = !!msg.resolve;
    sourceDir = msg.sourceDir ?? sourceDir;
    postMessage({ ready: true });
    return;
  }
  postMessage({ id: msg.id, ...runCase(msg.src, { resolve: doResolve, sourceDir, phaseOut: phase }) });
};
