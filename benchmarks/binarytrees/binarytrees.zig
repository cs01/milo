const std = @import("std");

const Node = struct {
    l: ?*Node,
    r: ?*Node,
};

fn makeTree(alloc: std.mem.Allocator, d: i32) !*Node {
    const n = try alloc.create(Node);
    if (d <= 0) {
        n.l = null;
        n.r = null;
        return n;
    }
    n.l = try makeTree(alloc, d - 1);
    n.r = try makeTree(alloc, d - 1);
    return n;
}

fn check(n: *Node) i32 {
    if (n.l == null) return 1;
    return 1 + check(n.l.?) + check(n.r.?);
}

fn freeTree(alloc: std.mem.Allocator, n: *Node) void {
    if (n.l) |l| freeTree(alloc, l);
    if (n.r) |r| freeTree(alloc, r);
    alloc.destroy(n);
}

pub fn main() !void {
    const alloc = std.heap.smp_allocator;
    const depth: i32 = 15;
    const t = try makeTree(alloc, depth);
    const c = check(t);
    freeTree(alloc, t);
    std.debug.print("depth {d} check={d}\n", .{ depth, c });
}
