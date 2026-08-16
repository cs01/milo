// one list, five different types
var stuff = [1, "two", true, nil, [3, 4]];
print stuff;
print len(stuff);

// a variable that changes type whenever it feels like it
var x = 42;
print x;
x = "now i am a string";
print x;
x = [x, x];
print x;

// functions are values
fn double(n) { return n * 2; }
fn shout(s) { return s + "!"; }
var ops = [double, shout];
print ops;
print ops[0](21);
print ops[1]("hey");

// pick a function at runtime
fn pick(which) { if (which < 1) return double; return shout; }
print pick(0)(50);
print pick(9)("dynamic dispatch");

// nested structure, mutated in place
var tree = [[1, 2], [3, [4, 5]]];
tree[1][1][0] = 99;
print tree;

// closure-ish: a list carrying its own operation
fn apply(f, v) { return f(v); }
print apply(double, 8);

// dictionaries: string keys, insertion order, values of any type
var enemy = {"name": "goblin", "hp": 12, "tags": ["cave", "fast"]};
print enemy;
print enemy["hp"];
enemy["hp"] = 3;
enemy["state"] = "flee";
print enemy;
print keys(enemy);
print len(enemy);
print has(enemy, "state");
print enemy["gold"];
print {};

// dicts and lists nest either way around
var party = [{"n": "a"}, {"n": "b"}];
party[1]["n"] = "z";
print party;
var world = {"grid": [[1, 2], [3, 4]]};
world["grid"][1][0] = 9;
print world;
