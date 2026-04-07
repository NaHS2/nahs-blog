# 零基础：在 VS Code 中开发 Keil 的 STM32 工程，并实现代码补全（STM32F103C8T6 / StdPeriph）

很多人习惯在 Keil（uVision5）里创建 STM32 工程，但更想用 VS Code 的编辑体验（搜索、跳转、插件生态）。本文一步步教你：**Keil 建工程 → VS Code 编写 → STM32 标准库函数/寄存器能正常补全与跳转**。

> 核心结论  
> VS Code 的“代码补全”不是 Keil 提供的，而是 VS Code 的 **C/C++ 插件 IntelliSense** 提供的。  
> 要让它补全 STM32 库，必须让 IntelliSense 知道：  
> **头文件路径（includePath）+ 宏定义（defines）+ 一个可用的编译器（推荐 arm-none-eabi-gcc）**。

---

## 1. 准备工作

- 已安装 **Keil uVision5（MDK）**，并能正常编译 STM32 工程
- 建议工程目录结构固定（本文示例）：
  - `Start/`
  - `Library/`
  - `User/`
  - `Hardware/`
  - `System/`

> 目录一致的好处：后面可以做成“全局配置”，新工程几乎零操作。

---

## 2. 安装 VS Code 与必备插件

1. 安装 **Visual Studio Code**
2. 在 VS Code 扩展（Extensions）里安装：
   - **C/C++**（`ms-vscode.cpptools`）  
     > 这是实现补全、跳转、报错提示的核心插件
   - **Keil Assistant**（em-ide.com 的 Keil Assistant）  
     > 用于在 VS Code 中辅助打开/管理 Keil 工程（可选但很方便）

---

## 3. 配置 Keil Assistant（让 VS Code 找到 Keil）

打开 VS Code 设置（Settings），搜索 `KeilAssistant`，配置 uVision 路径，例如：

- `KeilAssistant.MDK.Uv4Path = E:\Keil5\UV4\UV4.exe`
- `KeilAssistant.C51.Uv4Path = E:\Keil5\UV4\UV4.exe`（如果你也用 51）

---

## 4. 安装 GNU Arm 工具链（强烈推荐）

为了让 IntelliSense 更稳定、更接近真实嵌入式开发环境，建议安装 **Arm GNU Toolchain（arm-none-eabi-gcc）**。

### 4.1 把工具链加入 PATH

安装完成后，把工具链的 `bin` 目录加入系统 PATH（安装器有的会自动加，有的不会）。

常见例子（以你机器实际安装位置为准）：

- `C:\Program Files (x86)\Arm\GNU Toolchain ...\bin`

### 4.2 验证是否成功

打开 PowerShell 或 VS Code 终端运行：

```powershell
arm-none-eabi-gcc --version
```

能输出版本号即表示成功。

---

## 5. 一劳永逸：写 VS Code 全局补全配置（推荐做法）

如果你的每个工程目录结构都固定为：

`Start/Library/User/Hardware/System`

那最省事的方式是：把 IntelliSense 配置写进 **用户设置 settings.json**，以后新工程不用每次改项目配置。

### 5.1 打开用户设置 JSON

- `Ctrl + Shift + P`
- 搜索并打开：`Preferences: Open User Settings (JSON)`

### 5.2 添加/覆盖下面配置

> 适用场景：**STM32F103C8T6 + StdPeriph 标准库**  
> 其中 `STM32F10X_MD` 是 F103C8T6 必须的芯片宏（中密度 MD）。

```json
"C_Cpp.default.compilerPath": "arm-none-eabi-gcc",
"C_Cpp.default.intelliSenseMode": "gcc-arm",
"C_Cpp.default.cStandard": "c11",
"C_Cpp.default.cppStandard": "c++17",
"C_Cpp.default.includePath": [
  "${workspaceFolder}/Start",
  "${workspaceFolder}/Library",
  "${workspaceFolder}/User",
  "${workspaceFolder}/Hardware",
  "${workspaceFolder}/System"
],
"C_Cpp.default.defines": [
  "USE_STDPERIPH_DRIVER",
  "STM32F10X_MD"
]
```

> 注意  
> - **不要把** `C_Cpp.default.compilerPath` 填成 `UV4.exe`（那是 IDE，不是编译器）。  
> - `intelliSenseMode` 请用 `gcc-arm`，因为某些版本不支持 `armcc/armclang` 之类的模式值。

---

## 6. 刷新 IntelliSense（很多人漏掉导致不生效）

配置完成后一定要执行：

1. `Ctrl + Shift + P` → `C/C++: Reset IntelliSense Database`
2. `Ctrl + Shift + P` → `Developer: Reload Window`

---

## 7. 打开工程并验证补全是否正常

1. VS Code：**打开工程根目录文件夹**
2. 在代码里尝试输入或跳转：
   - `GPIO_Init`
   - `USART_Init`
   - `RCC_APB2PeriphClockCmd`
3. 能出现补全列表、`F12` 能跳转定义，说明配置成功。

---

## 8. 常见问题与坑

### 8.1 `intelliSenseMode` 报错“值不被接受”
`intelliSenseMode` 必须是 C/C++ 插件支持的值。建议直接使用：

- `gcc-arm`（最常用、最稳）

### 8.2 为什么必须加 `STM32F10X_MD`
STM32 头文件会用条件编译（`#if defined(...)`）根据芯片宏决定是否声明寄存器/外设定义。  
不加正确芯片宏，会导致“函数/寄存器补全不全”。

### 8.3 某些工程补全不对，可能被项目配置覆盖
如果工程目录里存在 `.vscode/c_cpp_properties.json`，它可能覆盖全局设置。  
解决：

- 删除它，统一使用全局设置
- 或确保它的 `includePath/defines` 不与全局冲突

---

## 9. 后续扩展：换芯片/换库怎么办？

- 换成别的 F1 型号：需要调整芯片宏（不一定是 `STM32F10X_MD`）
- 换 HAL 库：宏通常变成 `USE_HAL_DRIVER` + `STM32F1xx`/具体型号宏，并且 includePath 也会换成 HAL/CMSIS 的目录结构

---

## 附：快速检查清单（排错用）

- [ ] `arm-none-eabi-gcc --version` 能输出版本号（PATH 生效）
- [ ] `settings.json` 里 `compilerPath = arm-none-eabi-gcc`
- [ ] `intelliSenseMode = gcc-arm`
- [ ] `defines` 包含：`USE_STDPERIPH_DRIVER`、`STM32F10X_MD`
- [ ] `includePath` 包含：`Start/Library/User/Hardware/System`
- [ ] 执行过：Reset IntelliSense Database + Reload Window
- [ ] 工程没有被 `.vscode/c_cpp_properties.json` 意外覆盖

---
