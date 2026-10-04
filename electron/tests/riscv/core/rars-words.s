# Words for the decoder test (decoder.test.ts beside it): every RV32I
# instruction RARS assembles, some M and F ones, odd registers and
# immediates (negative, the 12-bit ends), and -- at the end, placed far
# apart with `.text <address>` -- branches and jumps whose offsets set every
# bit of the B and J immediates somewhere (the ends, the sign, bit 11 alone,
# alternating bits).  Bit 1 of a B or J offset is always 0 here: without the
# compressed extension every instruction is 4-byte aligned.  rars-words.json is
# this file run through the engine.
        .data
d:      .word 0
        .text
main:
# R
        add   x1, x2, x3
        sub   t6, s11, a7
        sll   a0, a1, a2
        slt   s0, s1, s2
        sltu  t0, t1, t2
        xor   x31, x30, x29
        srl   a3, a4, a5
        sra   a6, a7, s3
        or    s4, s5, s6
        and   s7, s8, s9
        mul   t3, t4, t5
        mulh  a0, a0, a0
        mulhsu a1, a2, a3
        mulhu a4, a5, a6
        div   s10, t0, t1
        divu  x5, x6, x7
        rem   x8, x9, x10
        remu  x11, x12, x13
# I: arithmetic, shifts, loads, jalr, system
        addi  a0, zero, 5
        addi  t0, t0, -1
        addi  sp, sp, -2048
        addi  ra, gp, 2047
        slti  a1, a2, -7
        sltiu a3, a4, 100
        xori  a5, a6, -1
        ori   s0, s1, 0x7ff
        andi  s2, s3, 255
        slli  t1, t2, 31
        srli  t3, t4, 1
        srai  t5, t6, 17
        lb    a0, -1(sp)
        lh    a1, 2(gp)
        lw    a2, 0(sp)
        lw    a3, 2044(s0)
        lbu   a4, -2048(t0)
        lhu   a5, 6(a7)
        jalr  ra, 0(t1)
        jalr  zero, -4(ra)
        ecall
        ebreak
        csrrw t0, 0, t1
        csrrs t0, 0, x0
        csrrc a0, 0, a1
        csrrwi t0, 0, 5
        csrrsi t1, 0, 1
        csrrci t2, 0, 31
        fence 1, 1
        fence.i
# S
        sb    a0, -1(sp)
        sh    a1, 2(gp)
        sw    a2, 2047(s0)
        sw    ra, -2048(sp)
# B
        beq   a0, a1, main
        bne   t0, zero, main
        blt   s0, s1, after
        bge   a2, a3, after
        bltu  a4, a5, main
        bgeu  t5, t6, after
after:
# U
        lui   a0, 0x12345
        lui   t0, 0xfffff
        auipc a1, 0
        auipc s0, 0x80000
# J
        jal   ra, main
        jal   zero, after
# F
        flw   ft0, 0(sp)
        fld   fa0, 8(sp)
        fsw   ft1, 4(sp)
        fsd   fs0, -8(sp)
        fadd.s ft2, ft0, ft1
        fsub.s fa1, fa2, fa3
        fmul.d fs1, fs2, fs3
        fdiv.d ft3, ft4, ft5
# S, U: more bit patterns
        sw    s1, 0x555(s2)
        sh    s3, -1366(s4)
        sb    zero, 0(zero)
        lui   a0, 0x80000
        lui   a1, 1
        lui   a2, 0xaaaaa
        auipc a3, 0x7ffff
        auipc a4, 0x55555
# B, far: from 0x00410000; each target's offset in the comment
        .text 0x00410000
bfrom:  beq   ra, sp, bmax          # +4092: every bit up to 11
        bge   t2, s0, b2048         # +2048: bit 11 alone
        bltu  s1, a0, b554          # +0x554: alternating bits
        bne   zero, ra, bfrom       # -12
        .text 0x0041055c
b554:   bgeu  a1, a2, bfrom         # -0x55c
        .text 0x00410804
b2048:  blt   t0, t1, bfrom         # -0x804
        .text 0x00410ffc
bmax:   bne   gp, tp, bmin          # -4096: the sign alone
        .text 0x0040fffc
bmin:   beq   zero, zero, bmin      # 0
# J, far: from 0x00500000
        .text 0x00500000
jfrom:  jal   ra, jmax              # +1048572: every bit up to 19
        jal   t1, j55               # +0x55554: alternating bits
        jal   s0, j800              # +0x800: bit 11 alone
        .text 0x00500808
j800:   jal   s1, j1000             # +0x1000: bit 12 alone
        .text 0x00501808
j1000:  jal   a0, j800              # -0x1000
        .text 0x00555558
j55:    jal   t2, jfrom             # -0x55558
        .text 0x005ffffc
jmax:   jal   zero, jmin            # -1048576: the sign alone
        .text 0x004ffffc
jmin:   jal   t0, jfrom             # +4
