# MIPS tutorial example (read-only)
# Adds 5 + 7 and a number you type, using memory and the stack.

        .data
msg:    .asciiz "number? "      # the string to print
total:  .word   0               # where the result goes

        .text
        .globl  main
main:
        li      $t1, 5          # $t1 = 5 (small: one instruction)
        li      $t2, 7          # $t2 = 7
        add     $t3, $t1, $t2   # $t3 = 5 + 7 = 12
        sub     $t4, $t2, $t1   # $t4 = 7 - 5 = 2
        li      $t0, 0x12345678 # a large constant: becomes lui + ori
        sw      $t3, total      # writes $t3 to total in memory
        lw      $s0, total      # reads total back into $s0
        addi    $sp, $sp, -4    # makes room on the stack (4 bytes)
        sw      $s0, 0($sp)     # and puts $s0 there
        li      $v0, 4          # syscall 4: print a string
        la      $a0, msg        # the address of the string
        syscall
        li      $v0, 5          # syscall 5: read an integer (into $v0)
        syscall
        lw      $a0, 0($sp)     # takes 12 off the stack
        addi    $sp, $sp, 4     # and puts the stack back as it was
        add     $a0, $a0, $v0   # adds the number that was read
        li      $v0, 1          # syscall 1: print an integer
        syscall
        li      $v0, 10         # syscall 10: end the program
        syscall
