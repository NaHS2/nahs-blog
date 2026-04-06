# 我的第一篇博客：学习与开源记录

大家好！我是**硫氢化钠**，这是我的个人主页和博客。我打算在这里记录我的**学习经验**，以及参与**开源项目**的心得。

## 为什么搭建这个博客？

作为一个热爱技术的开发者，有一个记录自己技术成长的平台非常重要。这个博客的作用有：
- **积累知识**：好记性不如烂笔头，记录每天学到的新知识。
- **开源分享**：把自己的 Side Projects 展示出来，让更多人看到并参与。
- **经验总结**：记录学习过程中的踩坑与心得，帮助自己，也希望能帮助到别人。

## 博客技术栈

目前这个博客非常极简，采用**纯静态 HTML/CSS + 原生 JavaScript** 构建：
- 零构建工具，随改随看
- 借助 `marked.js` 实现 Markdown 实时解析
- 使用 `highlight.js` 实现代码高亮
- 原生 CSS 变量实现暗黑模式

### 代码高亮测试

```javascript
// 检查是不是回文串
function isPalindrome(str) {
  const cleanStr = str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleanStr === cleanStr.split('').reverse().join('');
}

console.log(isPalindrome("A man, a plan, a canal: Panama")); // true
```

## 下一步计划

接下来我会在博客中加入更多关于**系统架构设计**、**前端底层原理** 以及我个人的**开源工具**的介绍文章。欢迎大家持续关注！