# Tutorial example: one line somewhere is wrong (read-only)
        .text
main:   li      t0, 8
        adi     t1, t0, 1       # add 1
        li      a7, 10
        ecall
