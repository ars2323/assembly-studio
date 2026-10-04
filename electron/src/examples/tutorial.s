# MIPS 튜토리얼 예제 (읽기 전용)
# 5 + 7 을 계산해 메모리와 스택에 넣고, 결과를 출력합니다.

        .data
msg:    .asciiz "sum = "        # 출력할 문자열
total:  .word   0               # 계산 결과를 넣을 자리

        .text
        .globl  main
main:
        li      $t1, 5          # $t1 = 5 (작은 상수: 명령 하나)
        li      $t2, 7          # $t2 = 7
        add     $t3, $t1, $t2   # $t3 = 5 + 7 = 12
        sub     $t4, $t2, $t1   # $t4 = 7 - 5 = 2
        li      $t0, 0x12345678 # 큰 상수: lui + ori 두 명령이 됩니다
        sw      $t3, total      # 메모리의 total 자리에 $t3 을 씁니다
        lw      $s0, total      # total 자리에서 다시 읽어 $s0 에
        addi    $sp, $sp, -4    # 스택에 한 칸(4바이트)을 만들고
        sw      $s0, 0($sp)     # 그 칸에 $s0 을 넣습니다
        li      $v0, 4          # syscall 4: 문자열 출력
        la      $a0, msg        # 출력할 문자열의 주소
        syscall
        lw      $a0, 0($sp)     # 스택에서 값을 꺼내
        li      $v0, 1          # syscall 1: 정수 출력
        syscall
        addi    $sp, $sp, 4     # 스택을 원래대로 돌려놓습니다
        li      $v0, 10         # syscall 10: 프로그램 끝
        syscall
