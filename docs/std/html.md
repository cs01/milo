# std/html

## std/html

### `Html.escapeAttr`

```milo
fn Html.escapeAttr(s: &string): string
```

Escape `s` for an HTML attribute value under any quoting — double, single,
or none. Everything escapeText escapes, plus the bytes that can terminate
or extend an *unquoted* attribute value: space, tab, LF, FF, CR, `=` and
backtick (old IE treats a backtick as an attribute delimiter).

The cost is noise: `title=` with a space in the value comes out as
`hello&#32;world`. That is the same string to a browser, and the reason to
pay it is that correctness here must not depend on the caller having
remembered quotes at a call site the escaper cannot see. If your template
always quotes its attributes, escapeText produces cleaner output and is
equally safe.

Still not safe as an href/src/action value — see isSafeUrl — nor as an
event-handler attribute (onclick=…), whose value is script, not text.

### `Html.escapeText`

```milo
fn Html.escapeText(s: &string): string
```

Escape `s` for HTML element text: `&`, `<`, `>`, `"` and `'` become
character references, every other byte is copied unchanged (so UTF-8
passes through intact).

Safe in element text, in RCDATA elements such as <title> and <textarea>,
and in an attribute value **you wrote quotes around**. Quotes are escaped
even though element text does not need it, so that the common mistake of
reaching for the text escaper inside a quoted attribute is still safe.

Not safe inside <script>/<style>, in an unquoted attribute value (use
escapeAttr), or as a URL (see isSafeUrl). See the module comment.

### `Html.isSafeUrl`

```milo
fn Html.isSafeUrl(url: &string): bool
```

Whether `url` is safe to place in an href/src/action attribute: true for a
relative URL, or an absolute one whose scheme is http, https, mailto or
tel. False for `javascript:`, `data:`, `vbscript:`, `file:` and anything
else — including any input containing a C0 control byte or DEL, because
browsers strip some of those before resolving the scheme and
"java\tscript:x" navigates exactly where "javascript:x" does.

A scheme allowlist is all this is. It says nothing about *where* the URL
points, so it is not an open-redirect check and not an SSRF check; for
those, compare the parsed host against your own allowlist. A true answer
also does not remove the need to escape: run the value through escapeAttr
on the way into the document.

### `Html.unescape`

```milo
fn Html.unescape(s: &string): string
```

Decode the five predefined HTML entities (&amp; &lt; &gt; &quot; &apos;)
and numeric character references (&#39; and &#x27;), leaving every other
`&`-sequence exactly as it was.

This is a *display* decoder, not a full HTML5 named-entity table: `&nbsp;`
comes back as the literal seven characters `&nbsp;`. Numeric references to
surrogates, out-of-range code points, or U+0000 decode to U+FFFD rather
than producing bytes that would not decode back as UTF-8 — or, for
`&#0;`, a NUL that would truncate the string wherever it is next written.

Do not decode and then re-emit into HTML without escaping again, and never
decode before a security check — running a scheme or content check on
unescaped text and then emitting the *escaped* original is the classic way
to get a check and a renderer to disagree.
