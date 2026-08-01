# 让按键不再轮询：STM32外部中断事件控制器

> 源码：[github.com/NaHSIT/STM32ZET6Project/tree/main/projects/05-exti-event-controller](https://github.com/NaHSIT/STM32ZET6Project/tree/main/projects/05-exti-event-controller)

7月9日，我把按键控制器从轮询改成了外部中断。前面的轮询每10ms检查一次按键，已经够用，但我想弄清楚GPIO怎样经过AFIO映射到EXTI，再由NVIC把请求送进CPU。

最终做成了一个事件控制器：四个按键触发四条中断线，中断函数只记录事件，主循环再控制LED。五次闪烁继续由TIM2推进，所以闪烁期间新的按键也能被处理。

---

## 1. 硬件组成与中断映射

| GPIO | EXTI线 | 触发沿 | 原因 |
|------|--------|--------|------|
| `PA0` | EXTI0 | 上升沿 | 下拉输入，按下由0变1 |
| `PE2` | EXTI2 | 下降沿 | 上拉输入，按下由1变0 |
| `PE3` | EXTI3 | 下降沿 | 上拉输入，按下由1变0 |
| `PE4` | EXTI4 | 下降沿 | 上拉输入，按下由1变0 |

输出仍是`PB5`和`PE5`。TIM2提供1秒节拍，用于推进LED闪烁状态。

---

## 2. EXTI最容易漏掉的是AFIO

EXTI线路编号只和引脚编号对应，EXTI2既可能来自PA2，也可能来自PE2。必须通过AFIO明确选择端口：

```c
RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);
GPIO_EXTILineConfig(GPIO_PortSourceGPIOE, GPIO_PinSource2);
```

我第一次配置完GPIO和EXTI后按键毫无反应，查了很久才发现忘开AFIO时钟。EXTI本身配置得再正确，映射没有生效也收不到边沿。

---

## 3. 中断和主循环之间传什么

IRQHandler里不做延时、不打印串口，也不直接跑五次闪烁，只把事件编号写进`g_exit_event`并清除pending标志。

主循环调用`Exit_GetEvent()`取走事件。读取和清零时短暂关中断，避免刚读完还没清零就被新的IRQ改写。

```c
__disable_irq();
event = g_exit_event;
g_exit_event = 0U;
__enable_irq();
```

这里用的是单槽事件，不是完整队列。如果几个按键在极短时间内同时触发，后来的事件可能覆盖前一个。对人手按键已经足够；真要接高速信号，应该换环形队列或直接用硬件捕获。

---

## 4. 闪烁任务也改成事件驱动

旧版本在按键处理里等待定时器标志五次，虽然不再用`Delay_ms`，主循环依然被那个`for`循环占住。我把它改为`flash_toggles`计数，每次TIM2更新只推进一步。

这个修改很小，却让结构彻底顺了：外部中断产生输入事件，TIM2产生时间事件，主循环统一消费。每一部分都很短，也更容易单独排查。

---

> 外部中断不是为了炫技，也不一定比轮询更好。它真正教会我的是：中断负责及时记录，主循环负责完整处理。守住这条边界，系统才不会越加功能越乱。
