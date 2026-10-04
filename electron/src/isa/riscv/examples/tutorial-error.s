# 튜토리얼 예제: 어딘가 한 줄이 틀렸습니다 (읽기 전용)
        .text
main:   li      t0, 8
        adi     t1, t0, 1       # 1을 더하기
        li      a7, 10
        ecall
