// Unit tests for the @cSig signature splitter. Both the checker (arity) and codegen
// (per-parameter width asserts) read it, and a splitter that is off by one compares
// parameter i against parameter i+1 — a guard that reports a mismatch on the wrong
// parameter, or agrees by luck, is worse than no guard.
import { test, expect } from "bun:test";
import { cSigParams, countCSigParams, headerLabel } from "../src/csig";

test("(void) is zero parameters, not one", () => {
  expect(cSigParams("GLenum glGetError(void)")).toEqual([]);
  expect(cSigParams("int f()")).toEqual([]);
});

test("splits a plain type-only list", () => {
  expect(cSigParams("ssize_t read(int, void *, size_t)")).toEqual(["int", "void *", "size_t"]);
});

test("strips parameter names but not type keywords", () => {
  // `fd` and `n` are names; `int` in `unsigned int` is the type's own last token, and a
  // lone `size_t` must be the type since a prototype may omit the name but never the type.
  expect(cSigParams("int f(int fd, unsigned int, size_t n, size_t)"))
    .toEqual(["int", "unsigned int", "size_t", "size_t"]);
});

test("keeps the star when the name is glued to it", () => {
  expect(cSigParams("int f(char *buf, const char *s)")).toEqual(["char *", "const char *"]);
});

test("const-qualified pointer-to-pointer survives intact", () => {
  expect(cSigParams("void glShaderSource(GLuint, GLsizei, const GLchar *const*, const GLint *)"))
    .toEqual(["GLuint", "GLsizei", "const GLchar * const *", "const GLint *"]);
});

test("an array parameter is adjusted to a pointer", () => {
  // `sizeof(double [])` is ill-formed; C adjusts the parameter to `double *` anyway.
  expect(cSigParams("int getloadavg(double [], int)")).toEqual(["double *", "int"]);
  expect(cSigParams("int f(char buf[16])")).toEqual(["char *"]);
});

test("a variadic list keeps ... as its own entry, and arity excludes it", () => {
  expect(cSigParams("int printf(const char *, ...)")).toEqual(["const char *", "..."]);
  expect(countCSigParams("int printf(const char *, ...)")).toBe(1);
});

test("gives up on a function-pointer parameter rather than mis-splitting", () => {
  // Commas inside the nested parens would make a naive split report three parameters.
  expect(cSigParams("void (*signal(int, void (*)(int)))(int)")).toBeNull();
  expect(countCSigParams("void (*signal(int, void (*)(int)))(int)")).toBeNull();
});

test("headerLabel drops the preprocessor mechanics a reader shouldn't decode", () => {
  expect(headerLabel("unistd.h")).toBe("unistd.h");
  expect(headerLabel("OpenGL/gl3.h|GL_GLEXT_PROTOTYPES+GL/glcorearb.h"))
    .toBe("OpenGL/gl3.h or GL/glcorearb.h");
});
