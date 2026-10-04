# RISC-V tutorial example (read-only)
# Computes 5 + 7, puts it in memory and on the stack, and prints it.

        .data
msg:    .string "sum = "        # the string to print
total:  .word   0               # where the result goes

        .text
        .globl  main
main:
        li      t1, 5           # t1 = 5 (a small constant: one instruction)
        li      t2, 7           # t2 = 7
        add     t3, t1, t2      # t3 = 5 + 7 = 12
        sub     t4, t2, t1      # t4 = 7 - 5 = 2
        li      t0, 0x12345678  # a large constant: becomes lui + addi
        la      a1, total       # a1 = the address of total
        sw      t3, 0(a1)       # writes t3 to total in memory
        lw      s0, 0(a1)       # reads total back into s0
        addi    sp, sp, -4      # makes room for one word (4 bytes) on the stack
        sw      s0, 0(sp)       # and puts s0 there
        li      a7, 4           # ecall 4: print a string
        la      a0, msg         # the address of the string
        ecall
        lw      a0, 0(sp)       # takes the value off the stack
        li      a7, 1           # ecall 1: print an integer
        ecall
        addi    sp, sp, 4       # puts the stack back as it was
        li      a7, 10          # ecall 10: end the program
        ecall
