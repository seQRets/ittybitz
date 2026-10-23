;; ── Argon2id memory filling (RFC 9106, version 0x13) ─────────────────────
;; The one part of Argon2id that must be fast: filling the memory matrix.
;; Everything around it — the BLAKE2b hashes H0, H' and the final tag — is
;; plain JavaScript in argon2-core.template.js, which writes the first two
;; blocks of every lane, calls fill(), and reads the last blocks back.
;;
;; Assembled by scripts/wat.mjs (no external toolchain) into the base64
;; embedded in both shipped pages; `npm run build` reproduces it exactly and
;; CI checks that it does. Each step follows the reference implementation
;; (phc-winner-argon2, src/core.c and src/ref.c); the regression suite holds
;; the result to Node's own Argon2id and to the RFC 9106 test vector.
;;
;; Memory layout (byte offsets; every block is 1024 bytes = 128 x u64 LE):
;;      0  ZERO   an all-zero block, never written
;;   1024  INPUT  the address-generator input block (Argon2i addressing)
;;   2048  ADDR   the current block of 128 pseudo-random addresses
;;   3072  R      scratch for the compression function G
;;   4096  TMP    scratch for the compression function G
;;   8192  BASE   the memory matrix: lane L, column C is block L*laneLen + C
(module
  (memory (export "memory") 1)

  ;; fBlaMka(x, y) = x + y + 2 * lo32(x) * lo32(y), all mod 2^64.
  (func $bla (param $x i64) (param $y i64) (result i64)
    (i64.add
      (i64.add (local.get $x) (local.get $y))
      (i64.shl
        (i64.mul (i64.and (local.get $x) (i64.const 0xffffffff))
                 (i64.and (local.get $y) (i64.const 0xffffffff)))
        (i64.const 1))))

  ;; The BlaMka quarter-round on four 64-bit words, given their addresses.
  (func $G (param $pa i32) (param $pb i32) (param $pc i32) (param $pd i32)
    (local $a i64) (local $b i64) (local $c i64) (local $d i64)
    (local.set $a (i64.load (local.get $pa)))
    (local.set $b (i64.load (local.get $pb)))
    (local.set $c (i64.load (local.get $pc)))
    (local.set $d (i64.load (local.get $pd)))
    (local.set $a (call $bla (local.get $a) (local.get $b)))
    (local.set $d (i64.rotr (i64.xor (local.get $d) (local.get $a)) (i64.const 32)))
    (local.set $c (call $bla (local.get $c) (local.get $d)))
    (local.set $b (i64.rotr (i64.xor (local.get $b) (local.get $c)) (i64.const 24)))
    (local.set $a (call $bla (local.get $a) (local.get $b)))
    (local.set $d (i64.rotr (i64.xor (local.get $d) (local.get $a)) (i64.const 16)))
    (local.set $c (call $bla (local.get $c) (local.get $d)))
    (local.set $b (i64.rotr (i64.xor (local.get $b) (local.get $c)) (i64.const 63)))
    (i64.store (local.get $pa) (local.get $a))
    (i64.store (local.get $pb) (local.get $b))
    (i64.store (local.get $pc) (local.get $c))
    (i64.store (local.get $pd) (local.get $d)))

  ;; BLAKE2_ROUND_NOMSG over sixteen words: columns, then diagonals.
  (func $round
    (param $v0 i32) (param $v1 i32) (param $v2 i32) (param $v3 i32)
    (param $v4 i32) (param $v5 i32) (param $v6 i32) (param $v7 i32)
    (param $v8 i32) (param $v9 i32) (param $v10 i32) (param $v11 i32)
    (param $v12 i32) (param $v13 i32) (param $v14 i32) (param $v15 i32)
    (call $G (local.get $v0) (local.get $v4) (local.get $v8) (local.get $v12))
    (call $G (local.get $v1) (local.get $v5) (local.get $v9) (local.get $v13))
    (call $G (local.get $v2) (local.get $v6) (local.get $v10) (local.get $v14))
    (call $G (local.get $v3) (local.get $v7) (local.get $v11) (local.get $v15))
    (call $G (local.get $v0) (local.get $v5) (local.get $v10) (local.get $v15))
    (call $G (local.get $v1) (local.get $v6) (local.get $v11) (local.get $v12))
    (call $G (local.get $v2) (local.get $v7) (local.get $v8) (local.get $v13))
    (call $G (local.get $v3) (local.get $v4) (local.get $v9) (local.get $v14)))

  ;; The permutation P on a 1024-byte block: eight rounds over each run of
  ;; 16 consecutive words, then eight rounds over the interleaved "rows"
  ;; (words 2i, 2i+1, 2i+16, 2i+17, ..., 2i+112, 2i+113).
  (func $permute (param $blk i32)
    (local $i i32) (local $b i32)
    (loop $cols
      (local.set $b (i32.add (local.get $blk) (i32.mul (local.get $i) (i32.const 128))))
      (call $round
        (local.get $b)
        (i32.add (local.get $b) (i32.const 8))   (i32.add (local.get $b) (i32.const 16))
        (i32.add (local.get $b) (i32.const 24))  (i32.add (local.get $b) (i32.const 32))
        (i32.add (local.get $b) (i32.const 40))  (i32.add (local.get $b) (i32.const 48))
        (i32.add (local.get $b) (i32.const 56))  (i32.add (local.get $b) (i32.const 64))
        (i32.add (local.get $b) (i32.const 72))  (i32.add (local.get $b) (i32.const 80))
        (i32.add (local.get $b) (i32.const 88))  (i32.add (local.get $b) (i32.const 96))
        (i32.add (local.get $b) (i32.const 104)) (i32.add (local.get $b) (i32.const 112))
        (i32.add (local.get $b) (i32.const 120)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $cols (i32.lt_u (local.get $i) (i32.const 8))))
    (local.set $i (i32.const 0))
    (loop $rows
      (local.set $b (i32.add (local.get $blk) (i32.mul (local.get $i) (i32.const 16))))
      (call $round
        (local.get $b)                           (i32.add (local.get $b) (i32.const 8))
        (i32.add (local.get $b) (i32.const 128)) (i32.add (local.get $b) (i32.const 136))
        (i32.add (local.get $b) (i32.const 256)) (i32.add (local.get $b) (i32.const 264))
        (i32.add (local.get $b) (i32.const 384)) (i32.add (local.get $b) (i32.const 392))
        (i32.add (local.get $b) (i32.const 512)) (i32.add (local.get $b) (i32.const 520))
        (i32.add (local.get $b) (i32.const 640)) (i32.add (local.get $b) (i32.const 648))
        (i32.add (local.get $b) (i32.const 768)) (i32.add (local.get $b) (i32.const 776))
        (i32.add (local.get $b) (i32.const 896)) (i32.add (local.get $b) (i32.const 904)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $rows (i32.lt_u (local.get $i) (i32.const 8)))))

  ;; The compression function G(prev, ref), as fill_block() in ref.c:
  ;;   R = ref XOR prev;  next = (R [XOR old next, after the first pass]) XOR P(R)
  (func $fill_block (param $prev i32) (param $ref i32) (param $next i32) (param $xor i32)
    (local $o i32) (local $r i64) (local $t i64)
    (loop $load
      (local.set $r (i64.xor (i64.load (i32.add (local.get $ref) (local.get $o)))
                             (i64.load (i32.add (local.get $prev) (local.get $o)))))
      (i64.store (i32.add (i32.const 3072) (local.get $o)) (local.get $r))
      (local.set $t (local.get $r))
      (if (local.get $xor)
        (then (local.set $t (i64.xor (local.get $t)
                                     (i64.load (i32.add (local.get $next) (local.get $o)))))))
      (i64.store (i32.add (i32.const 4096) (local.get $o)) (local.get $t))
      (local.set $o (i32.add (local.get $o) (i32.const 8)))
      (br_if $load (i32.lt_u (local.get $o) (i32.const 1024))))
    (call $permute (i32.const 3072))
    (local.set $o (i32.const 0))
    (loop $store
      (i64.store (i32.add (local.get $next) (local.get $o))
        (i64.xor (i64.load (i32.add (i32.const 4096) (local.get $o)))
                 (i64.load (i32.add (i32.const 3072) (local.get $o)))))
      (local.set $o (i32.add (local.get $o) (i32.const 8)))
      (br_if $store (i32.lt_u (local.get $o) (i32.const 1024)))))

  ;; next_addresses(): bump the counter, then ADDR = G(ZERO, G(ZERO, INPUT)).
  (func $next_addresses
    (i64.store (i32.const 1072) (i64.add (i64.load (i32.const 1072)) (i64.const 1)))
    (call $fill_block (i32.const 0) (i32.const 1024) (i32.const 2048) (i32.const 0))
    (call $fill_block (i32.const 0) (i32.const 2048) (i32.const 2048) (i32.const 0)))

  ;; index_alpha(): map a 32-bit pseudo-random value to a reference column.
  (func $index_alpha
    (param $pass i32) (param $slice i32) (param $index i32) (param $rand i32)
    (param $same i32) (param $seg i32) (param $laneLen i32) (result i32)
    (local $area i32) (local $rel i64) (local $start i32)
    (if (i32.eqz (local.get $pass))
      (then
        (if (i32.eqz (local.get $slice))
          (then (local.set $area (i32.sub (local.get $index) (i32.const 1))))
          (else
            (if (local.get $same)
              (then (local.set $area
                (i32.sub (i32.add (i32.mul (local.get $slice) (local.get $seg)) (local.get $index))
                         (i32.const 1))))
              (else (local.set $area
                (i32.sub (i32.mul (local.get $slice) (local.get $seg)) (i32.eqz (local.get $index)))))))))
      (else
        (if (local.get $same)
          (then (local.set $area
            (i32.sub (i32.add (i32.sub (local.get $laneLen) (local.get $seg)) (local.get $index))
                     (i32.const 1))))
          (else (local.set $area
            (i32.sub (i32.sub (local.get $laneLen) (local.get $seg)) (i32.eqz (local.get $index))))))))
    (local.set $rel (i64.extend_i32_u (local.get $rand)))
    (local.set $rel (i64.shr_u (i64.mul (local.get $rel) (local.get $rel)) (i64.const 32)))
    (local.set $rel
      (i64.sub (i64.sub (i64.extend_i32_u (local.get $area)) (i64.const 1))
               (i64.shr_u (i64.mul (i64.extend_i32_u (local.get $area)) (local.get $rel))
                          (i64.const 32))))
    (if (local.get $pass)
      (then
        (if (i32.ne (local.get $slice) (i32.const 3))
          (then (local.set $start
            (i32.mul (i32.add (local.get $slice) (i32.const 1)) (local.get $seg)))))))
    (i32.wrap_i64
      (i64.rem_u (i64.add (i64.extend_i32_u (local.get $start)) (local.get $rel))
                 (i64.extend_i32_u (local.get $laneLen)))))

  ;; fill_segment(): one lane's quarter of one pass. Argon2id uses
  ;; data-independent addresses in the first two slices of the first pass,
  ;; and data-dependent ones (from the previous block) everywhere else.
  (func $fill_segment
    (param $pass i32) (param $slice i32) (param $lane i32) (param $lanes i32)
    (param $laneLen i32) (param $seg i32) (param $passes i32)
    (local $indep i32) (local $start i32) (local $i i32) (local $curr i32) (local $prev i32)
    (local $rand i64) (local $refLane i32) (local $refIndex i32) (local $o i32)
    (local.set $indep (i32.and (i32.eqz (local.get $pass)) (i32.lt_u (local.get $slice) (i32.const 2))))
    (if (local.get $indep)
      (then
        (loop $zero
          (i64.store (i32.add (i32.const 1024) (local.get $o)) (i64.const 0))
          (local.set $o (i32.add (local.get $o) (i32.const 8)))
          (br_if $zero (i32.lt_u (local.get $o) (i32.const 1024))))
        (i64.store (i32.const 1024) (i64.extend_i32_u (local.get $pass)))
        (i64.store (i32.const 1032) (i64.extend_i32_u (local.get $lane)))
        (i64.store (i32.const 1040) (i64.extend_i32_u (local.get $slice)))
        (i64.store (i32.const 1048) (i64.extend_i32_u (i32.mul (local.get $lanes) (local.get $laneLen))))
        (i64.store (i32.const 1056) (i64.extend_i32_u (local.get $passes)))
        (i64.store (i32.const 1064) (i64.const 2))))
    ;; The first two blocks of every lane were written by the caller.
    (if (i32.and (i32.eqz (local.get $pass)) (i32.eqz (local.get $slice)))
      (then
        (local.set $start (i32.const 2))
        (if (local.get $indep) (then (call $next_addresses)))))
    (local.set $curr
      (i32.add (i32.add (i32.mul (local.get $lane) (local.get $laneLen))
                        (i32.mul (local.get $slice) (local.get $seg)))
               (local.get $start)))
    (if (i32.eqz (i32.rem_u (local.get $curr) (local.get $laneLen)))
      (then (local.set $prev (i32.sub (i32.add (local.get $curr) (local.get $laneLen)) (i32.const 1))))
      (else (local.set $prev (i32.sub (local.get $curr) (i32.const 1)))))
    (local.set $i (local.get $start))
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $seg)))
        (if (i32.eq (i32.rem_u (local.get $curr) (local.get $laneLen)) (i32.const 1))
          (then (local.set $prev (i32.sub (local.get $curr) (i32.const 1)))))
        (if (local.get $indep)
          (then
            (if (i32.eqz (i32.and (local.get $i) (i32.const 127))) (then (call $next_addresses)))
            (local.set $rand (i64.load (i32.add (i32.const 2048)
                                                (i32.shl (i32.and (local.get $i) (i32.const 127)) (i32.const 3))))))
          (else
            (local.set $rand (i64.load (i32.add (i32.const 8192) (i32.shl (local.get $prev) (i32.const 10)))))))
        (local.set $refLane
          (i32.wrap_i64 (i64.rem_u (i64.shr_u (local.get $rand) (i64.const 32))
                                   (i64.extend_i32_u (local.get $lanes)))))
        (if (i32.and (i32.eqz (local.get $pass)) (i32.eqz (local.get $slice)))
          (then (local.set $refLane (local.get $lane))))
        (local.set $refIndex
          (call $index_alpha (local.get $pass) (local.get $slice) (local.get $i)
                             (i32.wrap_i64 (local.get $rand))
                             (i32.eq (local.get $refLane) (local.get $lane))
                             (local.get $seg) (local.get $laneLen)))
        (call $fill_block
          (i32.add (i32.const 8192) (i32.shl (local.get $prev) (i32.const 10)))
          (i32.add (i32.const 8192)
                   (i32.shl (i32.add (i32.mul (local.get $refLane) (local.get $laneLen)) (local.get $refIndex))
                            (i32.const 10)))
          (i32.add (i32.const 8192) (i32.shl (local.get $curr) (i32.const 10)))
          (i32.ne (local.get $pass) (i32.const 0)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $curr (i32.add (local.get $curr) (i32.const 1)))
        (local.set $prev (i32.add (local.get $prev) (i32.const 1)))
        (br $next))))

  ;; fill(lanes, laneLen, passes): every pass, every slice, every lane.
  (func $fill (export "fill") (param $lanes i32) (param $laneLen i32) (param $passes i32)
    (local $pass i32) (local $slice i32) (local $lane i32) (local $seg i32)
    (local.set $seg (i32.shr_u (local.get $laneLen) (i32.const 2)))
    (block $passesDone
      (loop $passLoop
        (br_if $passesDone (i32.ge_u (local.get $pass) (local.get $passes)))
        (local.set $slice (i32.const 0))
        (loop $sliceLoop
          (local.set $lane (i32.const 0))
          (loop $laneLoop
            (call $fill_segment (local.get $pass) (local.get $slice) (local.get $lane)
                                (local.get $lanes) (local.get $laneLen) (local.get $seg)
                                (local.get $passes))
            (local.set $lane (i32.add (local.get $lane) (i32.const 1)))
            (br_if $laneLoop (i32.lt_u (local.get $lane) (local.get $lanes))))
          (local.set $slice (i32.add (local.get $slice) (i32.const 1)))
          (br_if $sliceLoop (i32.lt_u (local.get $slice) (i32.const 4))))
        (local.set $pass (i32.add (local.get $pass) (i32.const 1)))
        (br $passLoop))))
)
