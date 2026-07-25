const std = @import("std");
const N: i64 = 500000;

fn quicksort(arr: []f64, lo: i64, hi: i64) void {
    if (lo >= hi) return;
    const pivot = arr[@intCast(hi)];
    var i = lo;
    var j = lo;
    while (j < hi) : (j += 1) {
        if (arr[@intCast(j)] < pivot) {
            const tmp = arr[@intCast(i)];
            arr[@intCast(i)] = arr[@intCast(j)];
            arr[@intCast(j)] = tmp;
            i += 1;
        }
    }
    const tmp = arr[@intCast(i)];
    arr[@intCast(i)] = arr[@intCast(hi)];
    arr[@intCast(hi)] = tmp;
    quicksort(arr, lo, i - 1);
    quicksort(arr, i + 1, hi);
}

pub fn main() !void {
    const alloc = std.heap.smp_allocator;
    var arr = try std.ArrayList(f64).initCapacity(alloc, 0);
    var seed: i64 = 42;
    var i: i64 = 0;
    while (i < N) : (i += 1) {
        seed = @rem(seed * 16807, 2147483647);
        try arr.append(alloc, @as(f64, @floatFromInt(seed)) / 2147483647.0);
    }
    quicksort(arr.items, 0, N - 1);
    std.debug.print("first: {d:.6}\nlast: {d:.6}\n", .{ arr.items[0], arr.items[@intCast(N - 1)] });
}
