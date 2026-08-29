# 用TIM5量出按键按了多久：1us分辨率输入捕获

> 源码：[github.com/NaHSIT/STM32ZET6Project/tree/main/projects/10-pulse-width-meter](https://github.com/NaHSIT/STM32ZET6Project/tree/main/projects/10-pulse-width-meter)

7月30日，做完PWM输出后，我想从另一头理解定时器：不再生成波形，而是测量外部信号。最直观的目标就是量出WK_UP按键从按下到松开持续了多久。

TIM5以1MHz计数，在`PA0`上先捕获上升沿、再捕获下降沿，两次时间戳相减得到高电平宽度。串口根据大小自动用微秒、毫秒或秒显示结果。

---

## 1. 硬件组成

- WK_UP连接`PA0`，按下为高电平。
- `PA0`复用为TIM5_CH1输入捕获。
- TIM5计数频率1MHz，即1个tick等于1us。
- USART1输出测量结果。

定时器设置`PSC=71`、`ARR=65535`，每65.536ms回绕一次。普通按键很容易按住几百毫秒，所以只减两个CCR远远不够，必须把溢出次数也算进去。

---

## 2. 上升沿和下降沿组成一次测量

状态机只有两个状态：等待上升沿、等待下降沿。

上升沿到来时保存时间戳，并把捕获极性切为下降沿；松手产生下降沿后再次取时间戳，相减得到脉宽，再切回上升沿等待下一次。

```c
if (!waiting_for_falling_edge) {
    rise_timestamp = timestamp;
    TIM_OC1PolarityConfig(TIM5, TIM_ICPolarity_Falling);
} else {
    width = timestamp - rise_timestamp;
    TIM_OC1PolarityConfig(TIM5, TIM_ICPolarity_Rising);
}
```

小于500us的脉冲被当作按键毛刺过滤。真正测高速信号时，这个阈值要按目标频率重新设置。

---

## 3. 边沿刚好撞上溢出怎么办

早期版本单独累计`overflow_count`，然后直接算：

```c
overflow_count * 65536 + ccr_end - ccr_start
```

大多数时候正确，但如果捕获边沿和更新事件几乎同时到达，IRQ里可能同时看到`CC1IF`和`UIF`。只按固定顺序处理，CCR属于回绕前还是回绕后就可能判断错，结果会突然多或少65.536ms。

现在我在进入中断时一次性读取状态寄存器。若`UIF`已置位且CCR很小，说明边沿发生在回绕之后，生成时间戳时临时把epoch加一；若CCR很大，则边沿属于回绕之前。

```c
if ((status & TIM_SR_UIF) && capture < period / 2U) {
    ++epoch;
}
timestamp = epoch * period + capture;
```

这个判断把捕获值和溢出标志放到同一个时间语境里，解决了最难复现的边界问题。

---

## 4. 串口显示与实际误差

1us是计数分辨率，不代表用手按键真的能测到微秒级准确。机械触点抖动、输入滤波和按键动作本身都会带来误差。这个项目的价值主要是验证长脉宽累计和边沿切换。

我连续按住大约1秒，串口会显示0.98s、1.03s一类结果，符合手动操作的波动。换成信号源后，才能认真评价定时器测量误差。

---

> 输入捕获让我明白，计时不只是“结束值减开始值”。一旦计数器会回绕、中断会并发，时间本身也需要被正确建模。边界越少出现，越要在代码里提前处理。
