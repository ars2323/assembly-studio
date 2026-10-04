# Stores in a loop: words, halves and bytes into an array, a running sum
# in memory, the stack used as a scratch pad.  For step back's tests.
        .data
array:  .space  64
bytes:  .space  16
sum:    .word   0
        .text
        .globl  main
main:
        la   $s0, array
        la   $s1, bytes
        li   $t0, 0              # i
        li   $t1, 16             # n
loop:
        mul  $t2, $t0, $t0       # i*i
        sll  $t3, $t0, 2
        addu $t4, $s0, $t3
        sw   $t2, 0($t4)         # array[i] = i*i
        addu $t5, $s1, $t0
        sb   $t0, 0($t5)         # bytes[i] = i
        lw   $t6, sum
        addu $t6, $t6, $t2
        sw   $t6, sum            # sum += i*i
        addiu $sp, $sp, -8
        sw   $t0, 0($sp)
        sh   $t2, 4($sp)
        addiu $sp, $sp, 8
        addiu $t0, $t0, 1
        blt  $t0, $t1, loop
done:
        lw   $a0, sum
        li   $v0, 1
        syscall
        li   $v0, 10
        syscall
