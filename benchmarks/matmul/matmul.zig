const std = @import("std");
const N: usize = 256;

pub fn main() !void {
    const alloc = std.heap.smp_allocator;
    var a = try std.ArrayList(f64).initCapacity(alloc, 0);
    var b = try std.ArrayList(f64).initCapacity(alloc, 0);
    var c = try std.ArrayList(f64).initCapacity(alloc, 0);
    var i: usize = 0;
    while (i < N * N) : (i += 1) {
        try a.append(alloc, @as(f64, @floatFromInt(i % N)) + 0.1);
        try b.append(alloc, @as(f64, @floatFromInt(i / N)) + 0.1);
        try c.append(alloc, 0.0);
    }
    var r: usize = 0;
    while (r < N) : (r += 1) {
        var col: usize = 0;
        while (col < N) : (col += 1) {
            var s: f64 = 0.0;
            var k: usize = 0;
            while (k < N) : (k += 1) {
                s += a.items[r * N + k] * b.items[k * N + col];
            }
            c.items[r * N + col] = s;
        }
    }
    std.debug.print("c[0]={d:.2} c[last]={d:.2}\n", .{ c.items[0], c.items[N * N - 1] });
}
