        .data
result: .word   0
        .text
        .globl  main
main:
        li   t0, 0xF0F0F0F0
        li   t1, 0x00FF00FF
        and  t2, t0, t1
        or   t3, t0, t1
        xor  t4, t0, t1
        not  t5, t3

        li   t6, 0x80000001
        slli s0, t6, 1
        srli s1, t6, 1
        srai s2, t6, 1

        la   a1, result
        sw   t2, 0(a1)
        lw   a0, 0(a1)
        li   a7, 1
        ecall

        li   a7, 10
        ecall
