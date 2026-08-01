# 用STM32F103ZET6做双LED流水灯：封装第一个GPIO驱动

> 源码：[github.com/NaHSIT/STM32ZET6Project/tree/main/projects/02-dual-led-runner](https://github.com/NaHSIT/STM32ZET6Project/tree/main/projects/02-dual-led-runner)

6月28日，板卡自检稳定跑了三天，我开始整理第一版驱动。直接在`main.c`里操作GPIO当然能用，但灯一多，初始化和高低电平会把主逻辑淹没。

这次我把LED相关代码拆成`LED.c`和`LED.h`，做了一个双灯流水效果。功能只比上次多一点，重点却从“把灯点亮”变成“怎样让代码以后还能继续加东西”。

---

## 1. 硬件组成

- STM32F103ZET6最小系统。
- LED1：`PB5`，低电平有效。
- LED2：`PE5`，低电平有效。
- SysTick毫秒延时。

两个LED分属GPIOB和GPIOE，所以两个端口时钟都要打开。初始化结束后先写高电平，让程序进入主循环前保持熄灭，避免上电瞬间乱闪。

---

## 2. 驱动层只暴露动作

我给上层留下五个接口：初始化、两盏灯各自点亮和熄灭。`main.c`不再关心哪个端口、哪个引脚，也不用反复记忆低电平有效。

```c
void LED1_ON(void)
{
    GPIO_ResetBits(GPIOB, GPIO_Pin_5);
}

void LED1_OFF(void)
{
    GPIO_SetBits(GPIOB, GPIO_Pin_5);
}
```

流水效果就变得很直白：LED1亮500ms后熄灭，再轮到LED2。主函数读起来像动作清单，而不是寄存器配置表。

这种封装不复杂，但它解决了两个问题：硬件引脚集中管理；以后更换板子时，只改驱动层，不用动业务逻辑。

---

## 3. 我踩到的初始化细节

开始时我分别声明了两个几乎一样的`GPIO_InitTypeDef`，后来发现完全可以复用同一个结构体，只替换端口和引脚。更重要的是，结构体每个成员都要明确赋值，不能依赖栈里的随机内容。

另一个细节是LED速度。最初习惯性选`GPIO_Speed_50MHz`，但这里几百毫秒才切换一次，2MHz已经绰绰有余。GPIO速度控制的是输出边沿能力，不是LED闪烁频率。

---

> 把十几行GPIO代码挪进驱动文件，看上去没有让项目更“高级”，却第一次让我感受到分层的好处：主函数说要做什么，驱动层负责怎么做到。
