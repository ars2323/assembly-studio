# RISC-V tutorial example (read-only)
# Adds 5 + 7 and a number you type, using memory and the stack.

        .data
msg:    .string "number? "      # the string to print
total:  .word   0               # where the result goes

        .text
        .globl  main
main:
        li      t1, 5           # t1 = 5 (small: one instruction)
        li      t2, 7           # t2 = 7
        add     t3, t1, t2      # t3 = 5 + 7 = 12
        sub     t4, t2, t1      # t4 = 7 - 5 = 2
        li      t0, 0x12345678  # a large constant: becomes lui + addi
        la      a1, total       # a1 = the address of total
        sw      t3, 0(a1)       # writes t3 to total in memory
        lw      s0, 0(a1)       # reads total back into s0
        addi    sp, sp, -4      # makes room on the stack (4 bytes)
        sw      s0, 0(sp)       # and puts s0 there
        li      a7, 4           # ecall 4: print a string
        la      a0, msg         # the address of the string
        ecall
        li      a7, 5           # ecall 5: read an integer (into a0)
        ecall
        lw      t5, 0(sp)       # takes 12 off the stack
        addi    sp, sp, 4       # and puts the stack back as it was
        add     a0, a0, t5      # adds it to the number that was read
        li      a7, 1           # ecall 1: print an integer
        ecall
        li      a7, 10          # ecall 10: end the program
        ecall
