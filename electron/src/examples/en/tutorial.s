# MIPS tutorial example (read-only)
# Computes 5 + 7, puts it in memory and on the stack, and prints it.

        .data
msg:    .asciiz "sum = "        # the string to print
total:  .word   0               # where the result goes

        .text
        .globl  main
main:
        li      $t1, 5          # $t1 = 5 (a small constant: one instruction)
        li      $t2, 7          # $t2 = 7
        add     $t3, $t1, $t2   # $t3 = 5 + 7 = 12
        sub     $t4, $t2, $t1   # $t4 = 7 - 5 = 2
        li      $t0, 0x12345678 # a large constant: becomes lui + ori
        sw      $t3, total      # writes $t3 to total in memory
        lw      $s0, total      # reads total back into $s0
        addi    $sp, $sp, -4    # makes room for one word (4 bytes) on the stack
        sw      $s0, 0($sp)     # and puts $s0 there
        li      $v0, 4          # syscall 4: print a string
        la      $a0, msg        # the address of the string
        syscall
        lw      $a0, 0($sp)     # takes the value off the stack
        li      $v0, 1          # syscall 1: print an integer
        syscall
        addi    $sp, $sp, 4     # puts the stack back as it was
        li      $v0, 10         # syscall 10: end the program
        syscall
