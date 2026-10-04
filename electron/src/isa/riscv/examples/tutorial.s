# RISC-V 튜토리얼 예제 (읽기 전용)
# 두 수를 더해 메모리에 저장하고, 결과를 출력합니다.

        .data
msg:    .string "sum = "        # 출력할 문자열
total:  .word   0               # 계산 결과를 저장할 자리

        .text
        .globl  main
main:
        li      t1, 5           # 작은 상수: 명령 하나가 됩니다
        li      t2, 7
        add     t3, t1, t2      # 덧셈: 5 + 7 = 12
        sub     t4, t2, t1      # 뺄셈: 7 - 5 = 2
        and     t5, t1, t2      # 비트마다 AND
        or      t6, t1, t2      # 비트마다 OR
        li      t0, 0x12345678  # 큰 상수: lui + addi 두 명령이 됩니다
        addi    sp, sp, -4      # 스택에 한 칸(4바이트)을 만듭니다
        la      a1, total       # total 자리의 주소
        sw      t3, 0(a1)       # 메모리에 씁니다
        lw      s0, 0(a1)       # 메모리에서 다시 읽습니다
        li      a7, 4           # ecall 4: 문자열 출력
        la      a0, msg
        ecall
        li      a7, 1           # ecall 1: 정수 출력
        mv      a0, s0
        ecall
        addi    sp, sp, 4       # 스택을 원래대로 돌려놓습니다
        li      a7, 10          # ecall 10: 프로그램 끝
        ecall
