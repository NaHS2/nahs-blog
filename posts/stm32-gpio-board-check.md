# 从GPIO配置到第一盏灯：STM32F103ZET6板卡自检

> 源码：[github.com/NaHSIT/STM32ZET6Project/tree/main/projects/01-gpio-board-check](https://github.com/NaHSIT/STM32ZET6Project/tree/main/projects/01-gpio-board-check)

2025年6月25日，大二暑假刚开始，我给自己定了一个目标：不再照着现成工程改几行代码，而是从最小系统开始，把STM32常用外设一层一层摸清楚。

第一个项目没有堆功能，只做板卡自检。让STM32F103ZET6上的两盏LED交替闪烁，看起来简单，但它同时验证了启动文件、72MHz系统时钟、GPIO时钟和下载链路。先把地基踩实，后面出问题才知道该从哪里排查。

---

## 1. 硬件组成

- **STM32F103ZET6**开发板，Cortex-M3内核，系统时钟72MHz。
- 板载LED1连接`PB5`，LED2连接`PE5`。
- 两盏LED都是低电平点亮，高电平熄灭。
- ST-Link负责下载和在线调试。

我先查原理图确认引脚，没有直接相信示例代码。板载LED中间通常还隔着限流电阻或三极管，弄清楚“低电平有效”后，才能解释为什么写`ResetBits`反而是点亮。

---

## 2. 最小启动流程

GPIO要工作，顺序只有三步：开外设时钟、配置输出模式、写输出电平。

```c
RCC_APB2PeriphClockCmd(
    RCC_APB2Periph_GPIOB | RCC_APB2Periph_GPIOE,
    ENABLE
);

gpio.GPIO_Pin = GPIO_Pin_5;
gpio.GPIO_Mode = GPIO_Mode_Out_PP;
gpio.GPIO_Speed = GPIO_Speed_2MHz;
GPIO_Init(GPIOB, &gpio);
GPIO_Init(GPIOE, &gpio);
```

这里把速度设为2MHz就够了。LED几百毫秒才变化一次，50MHz并不会让它更快，只会让输出边沿更陡。把配置和真实需求对应起来，比机械地填最高档更有意义。

延时没有启用SysTick中断，而是读取`COUNTFLAG`。这样第一个项目不需要额外的中断函数，也能验证`SystemCoreClock`是否正确。

---

## 3. 第一次没亮：先查时钟，再查电平

第一次下载后LED没有按预期闪，我先怀疑程序根本没跑。打断点发现主循环正常进入，最后定位到初始化后默认输出电平写反了：低电平有效的LED一上电就亮，后面的逻辑看起来像没有变化。

这次排查让我形成了一个很实用的顺序：

1. 看程序是否进入`main`。
2. 看GPIO端口时钟是否打开。
3. 看引脚模式和实际连接是否一致。
4. 最后再看高低电平逻辑。

如果一上来就反复改延时数字，通常只是在碰运气。

---

> 第一盏灯的价值不在“会闪”，而在于我亲手确认了代码从复位、时钟到GPIO输出的完整路径。后面的每个项目，都是从这条已经验证过的路径继续往前走。
