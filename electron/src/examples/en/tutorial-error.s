# Tutorial example: one line somewhere is wrong (read-only)
        .text
main:   li      $t0, 8
        srll    $t1, $t0, 1     # shift right by 1 bit
        li      $v0, 10
        syscall
