/**
 * A minimal WebAssembly text-format (WAT) assembler, zero dependencies.
 *
 * It exists so the one binary in IttyBitz — the Argon2id core in
 * scripts/build/argon2.wat — is built from readable source by plain Node,
 * with no compiler toolchain to trust or install. The output is a pure
 * function of the input text, so `npm run build` reproduces the embedded
 * bytes exactly and CI can check them.
 *
 * It supports only what argon2.wat uses, written in FOLDED form:
 *   (module
 *     (memory (export "memory") <pages>)
 *     (func $name (export "name")? (param $p i32|i64)* (result i32|i64)?
 *               (local $l i32|i64)* <instr>*))
 * Instructions: block, loop, if/then/else (with optional $label and
 * (result t)), br, br_if, return, call, local.get/set/tee, i32/i64 const,
 * load/store (offset=N), and the plain numeric ops in OPCODES below.
 * Anything else is rejected with an error rather than guessed at.
 */

const VALTYPE = { i32: 0x7f, i64: 0x7e };

// Plain instructions: no immediates; operands come from folded children.
const OPCODES = {
  'select': 0x1b, 'drop': 0x1a,
  'i32.eqz': 0x45, 'i32.eq': 0x46, 'i32.ne': 0x47, 'i32.lt_u': 0x49, 'i32.gt_u': 0x4b,
  'i32.le_u': 0x4d, 'i32.ge_u': 0x4f,
  'i64.eqz': 0x50, 'i64.eq': 0x51, 'i64.ne': 0x52,
  'i32.add': 0x6a, 'i32.sub': 0x6b, 'i32.mul': 0x6c, 'i32.div_u': 0x6e, 'i32.rem_u': 0x70,
  'i32.and': 0x71, 'i32.or': 0x72, 'i32.xor': 0x73, 'i32.shl': 0x74, 'i32.shr_u': 0x76,
  'i64.add': 0x7c, 'i64.sub': 0x7d, 'i64.mul': 0x7e, 'i64.div_u': 0x80, 'i64.rem_u': 0x82,
  'i64.and': 0x83, 'i64.or': 0x84, 'i64.xor': 0x85, 'i64.shl': 0x86, 'i64.shr_u': 0x88,
  'i64.rotl': 0x89, 'i64.rotr': 0x8a,
  'i32.wrap_i64': 0xa7, 'i64.extend_i32_u': 0xad,
};
// Memory access: opcode and natural alignment (log2 bytes).
const MEMOPS = {
  'i32.load': [0x28, 2], 'i64.load': [0x29, 3],
  'i32.store': [0x36, 2], 'i64.store': [0x37, 3],
};

// ---- Tokens and s-expressions ----
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ';' && src[i + 1] === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '(' && src[i + 1] === ';') {
      const end = src.indexOf(';)', i + 2);
      if (end < 0) throw new Error('wat: unterminated block comment');
      i = end + 2; continue;
    }
    if (c === '(' || c === ')') { out.push(c); i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new Error('wat: unterminated string');
      out.push({ str: src.slice(i + 1, end) }); i = end + 1; continue;
    }
    let j = i;
    while (j < src.length && !/[\s()]/.test(src[j])) j++;
    out.push(src.slice(i, j)); i = j;
  }
  return out;
}

function parse(tokens) {
  let pos = 0;
  function node() {
    const t = tokens[pos++];
    if (t !== '(') return t;
    const list = [];
    while (tokens[pos] !== ')') {
      if (pos >= tokens.length) throw new Error('wat: unbalanced parentheses');
      list.push(node());
    }
    pos++;
    return list;
  }
  const tree = node();
  if (pos !== tokens.length) throw new Error('wat: trailing tokens after module');
  return tree;
}

// ---- Binary encoding ----
function uleb(n) {
  const out = [];
  n = BigInt(n);
  if (n < 0n) throw new Error('wat: negative unsigned LEB');
  do { let b = Number(n & 0x7fn); n >>= 7n; if (n !== 0n) b |= 0x80; out.push(b); } while (n !== 0n);
  return out;
}
function sleb(n) {
  const out = [];
  n = BigInt(n);
  for (;;) {
    const b = Number(n & 0x7fn);
    n >>= 7n;
    const done = (n === 0n && (b & 0x40) === 0) || (n === -1n && (b & 0x40) !== 0);
    out.push(done ? b : b | 0x80);
    if (done) return out;
  }
}
function name(s) { const b = [...new TextEncoder().encode(s)]; return [...uleb(b.length), ...b]; }
function vec(items) { return [...uleb(items.length), ...items.flat()]; }
function section(id, bytes) { return [id, ...uleb(bytes.length), ...bytes]; }

function intLiteral(tok, bits) {
  if (typeof tok !== 'string' || !/^-?(0x[0-9a-fA-F_]+|[0-9_]+)$/.test(tok)) {
    throw new Error('wat: bad integer literal ' + JSON.stringify(tok));
  }
  const neg = tok.startsWith('-');
  let v = BigInt(tok.replace(/[-_]/g, ''));
  if (neg) v = -v;
  // Accept unsigned spellings (e.g. 0xffffffffffffffff) by wrapping to signed.
  const mod = 1n << BigInt(bits);
  v = ((v % mod) + mod) % mod;
  if (v >= mod / 2n) v -= mod;
  return v;
}

// ---- Assembler ----
export function assemble(src) {
  const mod = parse(tokenize(src));
  if (!Array.isArray(mod) || mod[0] !== 'module') throw new Error('wat: expected (module ...)');

  const types = [], typeKeys = new Map();
  const funcs = [], funcIndex = new Map();
  const exports = [];
  let memory = null;

  function typeIndex(params, results) {
    const key = params.join(',') + '->' + results.join(',');
    if (!typeKeys.has(key)) {
      typeKeys.set(key, types.length);
      types.push([0x60, ...vec(params.map((t) => [VALTYPE[t]])), ...vec(results.map((t) => [VALTYPE[t]]))]);
    }
    return typeKeys.get(key);
  }

  // First pass: signatures, so calls can refer to functions defined later.
  for (const field of mod.slice(1)) {
    if (!Array.isArray(field)) throw new Error('wat: unexpected token in module');
    if (field[0] === 'memory') {
      let rest = field.slice(1);
      if (Array.isArray(rest[0]) && rest[0][0] === 'export') { exports.push({ name: rest[0][1].str, kind: 0x02, index: 0 }); rest = rest.slice(1); }
      memory = Number(intLiteral(rest[0], 33));
    } else if (field[0] === 'func') {
      const f = { name: null, params: [], results: [], locals: [], body: [] };
      let k = 1;
      if (typeof field[k] === 'string' && field[k].startsWith('$')) f.name = field[k++];
      for (; k < field.length; k++) {
        const it = field[k];
        if (Array.isArray(it) && it[0] === 'export') exports.push({ name: it[1].str, kind: 0x00, index: funcs.length });
        else if (Array.isArray(it) && it[0] === 'param') f.params.push({ name: it[1], type: it[2] });
        else if (Array.isArray(it) && it[0] === 'result') f.results.push(it[1]);
        else if (Array.isArray(it) && it[0] === 'local') f.locals.push({ name: it[1], type: it[2] });
        else f.body.push(it);
      }
      for (const v of [...f.params, ...f.locals]) {
        if (!(v.type in VALTYPE)) throw new Error('wat: bad type ' + v.type + ' in ' + f.name);
      }
      f.type = typeIndex(f.params.map((p) => p.type), f.results);
      if (f.name) funcIndex.set(f.name, funcs.length);
      funcs.push(f);
    } else {
      throw new Error('wat: unsupported module field ' + field[0]);
    }
  }
  if (memory === null) throw new Error('wat: module needs a memory');

  function compileFunc(f) {
    const localIndex = new Map();
    [...f.params, ...f.locals].forEach((v, i) => localIndex.set(v.name, i));
    const labels = [];
    const code = [];

    const local = (tok) => {
      if (!localIndex.has(tok)) throw new Error('wat: unknown local ' + tok + ' in ' + f.name);
      return uleb(localIndex.get(tok));
    };
    const depth = (tok) => {
      for (let i = labels.length - 1; i >= 0; i--) if (labels[i] === tok) return uleb(labels.length - 1 - i);
      throw new Error('wat: unknown label ' + tok + ' in ' + f.name);
    };
    // Optional "$label" and "(result t)" at the head of a structured instr.
    const blockHead = (items) => {
      let k = 1, label = null, bt = 0x40;
      if (typeof items[k] === 'string' && items[k].startsWith('$')) label = items[k++];
      if (Array.isArray(items[k]) && items[k][0] === 'result') bt = VALTYPE[items[k++][1]];
      return { k, label, bt };
    };

    function instr(n) {
      if (!Array.isArray(n)) throw new Error('wat: expected a folded instruction, got ' + JSON.stringify(n) + ' in ' + f.name);
      const op = n[0];
      if (op === 'block' || op === 'loop') {
        const { k, label, bt } = blockHead(n);
        code.push(op === 'block' ? 0x02 : 0x03, bt);
        labels.push(label);
        n.slice(k).forEach(instr);
        labels.pop();
        code.push(0x0b);
      } else if (op === 'if') {
        const { k, label, bt } = blockHead(n);
        const rest = n.slice(k);
        const thenIdx = rest.findIndex((x) => Array.isArray(x) && x[0] === 'then');
        if (thenIdx < 0) throw new Error('wat: (if) needs (then ...) in ' + f.name);
        rest.slice(0, thenIdx).forEach(instr); // condition
        code.push(0x04, bt);
        labels.push(label);
        rest[thenIdx].slice(1).forEach(instr);
        const els = rest[thenIdx + 1];
        if (els) {
          if (!(Array.isArray(els) && els[0] === 'else')) throw new Error('wat: expected (else ...) in ' + f.name);
          code.push(0x05);
          els.slice(1).forEach(instr);
        }
        labels.pop();
        code.push(0x0b);
      } else if (op === 'br' || op === 'br_if') {
        n.slice(2).forEach(instr);
        code.push(op === 'br' ? 0x0c : 0x0d, ...depth(n[1]));
      } else if (op === 'return') {
        n.slice(1).forEach(instr);
        code.push(0x0f);
      } else if (op === 'call') {
        if (!funcIndex.has(n[1])) throw new Error('wat: unknown function ' + n[1]);
        n.slice(2).forEach(instr);
        code.push(0x10, ...uleb(funcIndex.get(n[1])));
      } else if (op === 'local.get') {
        code.push(0x20, ...local(n[1]));
      } else if (op === 'local.set' || op === 'local.tee') {
        n.slice(2).forEach(instr);
        code.push(op === 'local.set' ? 0x21 : 0x22, ...local(n[1]));
      } else if (op === 'i32.const') {
        code.push(0x41, ...sleb(intLiteral(n[1], 32)));
      } else if (op === 'i64.const') {
        code.push(0x42, ...sleb(intLiteral(n[1], 64)));
      } else if (op in MEMOPS) {
        const [opc, align] = MEMOPS[op];
        let k = 1, offset = 0;
        if (typeof n[k] === 'string' && n[k].startsWith('offset=')) offset = Number(n[k++].slice(7));
        n.slice(k).forEach(instr);
        code.push(opc, ...uleb(align), ...uleb(offset));
      } else if (op in OPCODES) {
        n.slice(1).forEach(instr);
        code.push(OPCODES[op]);
      } else {
        throw new Error('wat: unsupported instruction ' + op + ' in ' + f.name);
      }
    }

    f.body.forEach(instr);
    code.push(0x0b);
    if (labels.length) throw new Error('wat: unbalanced labels in ' + f.name);

    // Locals, run-length encoded by type.
    const groups = [];
    for (const v of f.locals) {
      const last = groups[groups.length - 1];
      if (last && last.type === v.type) last.count++;
      else groups.push({ type: v.type, count: 1 });
    }
    const body = [...vec(groups.map((g) => [...uleb(g.count), VALTYPE[g.type]])), ...code];
    return [...uleb(body.length), ...body];
  }

  const bytes = [
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, vec(types)),
    ...section(3, vec(funcs.map((f) => uleb(f.type)))),
    ...section(5, vec([[0x00, ...uleb(memory)]])),
    ...section(7, vec(exports.map((e) => [...name(e.name), e.kind, ...uleb(e.index)]))),
    ...section(10, vec(funcs.map(compileFunc))),
  ];
  return Uint8Array.from(bytes);
}
