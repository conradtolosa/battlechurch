// Load-order checker for the classic <script> files in index.html.
//
// All scripts share one global scope, but each runs top to bottom when it
// loads. Code that runs at load time (top-level statements, not function
// bodies) can only use globals from scripts loaded EARLIER. Using a later
// script's let/const/class throws; using a later script's function throws
// when called; `typeof laterThing` silently gives "undefined".
//
// Run after moving code between files:  node dev/tools/check_load_order.js
// Exit code 1 = problems found. Needs the global `typescript` package (used
// only as a JS parser; preinstalled in cloud sessions).
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let ts;
try {
  ts = require("typescript");
} catch {
  ts = require(path.join(execSync("npm root -g").toString().trim(), "typescript"));
}

const root = path.join(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [];
for (const m of html.matchAll(/<script([^>]*)\ssrc="([^"]+)"[^>]*>/g)) {
  if (/type="module"/.test(m[1])) continue;
  if (!scripts.includes(m[2])) scripts.push(m[2]);
}

const parsed = scripts.map((file) => {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  return { file, sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) };
});

function bindingNames(name, out) {
  if (!name) return;
  if (ts.isIdentifier(name)) out.push(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  }
}

// Top-level declarations of each file.
const declaredIn = new Map(); // name -> index of first script declaring it
parsed.forEach(({ sf }, i) => {
  for (const st of sf.statements) {
    const names = [];
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) names.push(st.name?.text);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bindingNames(d.name, names);
    for (const n of names) if (n && !declaredIn.has(n)) declaredIn.set(n, i);
  }
});

const isFn = (n) => ts.isFunctionExpression(n) || ts.isArrowFunction(n);
const unparen = (n) => (ts.isParenthesizedExpression(n) ? unparen(n.expression) : n);

// Known, harmless: the stray "mini-boss preview" block at the very top of
// renderer.js runs at load but bails out (no level manager yet), so it never
// touches canvas/ctx. Lines are 1-based, inclusive.
const KNOWN_OK = [{ file: "renderer.js", from: 1, to: 54 }];
const problems = [];
parsed.forEach(({ file, sf }, i) => {
  // Walk code that runs at load. `locals` = names declared inside an IIFE.
  const visit = (node, locals) => {
    if (!node) return;
    // Function bodies run later, unless the function is called right away (IIFE).
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) ||
        ts.isSetAccessor(node) || ts.isConstructorDeclaration(node)) return;
    if (isFn(node)) return;
    if (ts.isCallExpression(node) && isFn(unparen(node.expression))) {
      const fn = unparen(node.expression);
      const inner = new Set(locals);
      fn.parameters.forEach((p) => { const a = []; bindingNames(p.name, a); a.forEach((n) => inner.add(n)); });
      const body = fn.body;
      if (body && ts.isBlock(body)) {
        for (const st of body.statements) {
          if (ts.isFunctionDeclaration(st) && st.name) inner.add(st.name.text);
          if (ts.isClassDeclaration(st) && st.name) inner.add(st.name.text);
          if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => { const a = []; bindingNames(d.name, a); a.forEach((n) => inner.add(n)); });
        }
        body.statements.forEach((st) => visit(st, inner));
      } else visit(body, inner);
      node.arguments.forEach((a) => visit(a, locals));
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      node.heritageClauses?.forEach((h) => h.types.forEach((t) => visit(t.expression, locals)));
      node.members.forEach((m) => {
        if (ts.isPropertyDeclaration(m) && m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword)) visit(m.initializer, locals);
      });
      return;
    }
    if (ts.isPropertyAccessExpression(node)) { visit(node.expression, locals); return; }
    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) visit(node.name.expression, locals);
      visit(node.initializer, locals);
      return;
    }
    if (ts.isVariableDeclaration(node)) { visit(node.initializer, locals); return; }
    if (ts.isIdentifier(node)) {
      const name = node.text;
      const j = declaredIn.get(name);
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      const known = KNOWN_OK.some((k) => k.file === file && line + 1 >= k.from && line + 1 <= k.to);
      if (j !== undefined && j > i && !locals.has(name) && !known) {
        const isTypeof = node.parent && ts.isTypeOfExpression(node.parent);
        problems.push(`${file}:${line + 1} uses ${name} at load time, but it is declared later in ${scripts[j]}${isTypeof ? " (typeof: silently 'undefined')" : ""}`);
      }
      return;
    }
    ts.forEachChild(node, (c) => visit(c, locals));
  };
  sf.statements.forEach((st) => visit(st, new Set()));
});

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} load-order problem(s)`);
  process.exit(1);
}
console.log(`load order OK (${scripts.length} classic scripts checked)`);
