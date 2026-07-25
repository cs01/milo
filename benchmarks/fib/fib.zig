const std = @import("std");

fn fib(n: i64) i64 {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}

pub fn main() void {
    const n: i64 = 35;
    std.debug.print("fib({d}) = {d}\n", .{ n, fib(n) });
}
