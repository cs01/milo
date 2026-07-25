enum Tree {
    Leaf,
    Node(Box<Tree>, Box<Tree>),
}

fn make_tree(d: i32) -> Box<Tree> {
    if d <= 0 {
        return Box::new(Tree::Leaf);
    }
    Box::new(Tree::Node(make_tree(d - 1), make_tree(d - 1)))
}

fn check(t: &Tree) -> i32 {
    match t {
        Tree::Leaf => 1,
        Tree::Node(l, r) => 1 + check(l) + check(r),
    }
}

fn main() {
    let depth: i32 = 15;
    let t = make_tree(depth);
    let c = check(&t);
    println!("depth {} check={}", depth, c);
}
