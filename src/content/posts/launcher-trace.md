---
title: '魔改 Launcher 做启动追踪：从触摸到 Frida attach'
description: '厂商 Launcher 各不相同，业务 App 很少检测桌面进程。基于 KISS 在触摸与 doLaunch 打点，用 FRIDA_TARGET logcat 信号自动 attach，并整理脚本与局限。'
pubDate: 2026-02-20
category: 'Android'
tags: ['Launcher', 'Frida', '动态调试', 'Android Framework']
---

学过 Launcher、SystemServer、Framework 启动流程之后，会冒出一个想法：能不能基于 Launcher 做程序追踪？

搜下来的结论是：每家手机桌面都不一样，业务 App 基本上不会专门检测「当前 Launcher 是谁」。那在 Launcher 里读启动信息、打点、再自动挂 Frida，就能少踩一层「目标进程自检」的坑。下面基于开源 [KISS Launcher](https://github.com/Neamar/KISS) 的魔改思路整理，保留能落地的细节，不贴整仓代码。

## 动机

```text
用户点图标
  → Launcher 调 LauncherApps.startMainActivity
  → SystemServer / AMS
  → Zygote fork
  → 目标进程 ActivityThread
```

这是合法、稳定的启动入口。在「即将 startActivity」处拿包名，比事后扫进程列表更准时，也比一上来就 attach 目标进程更不容易被业务启动代码盯梢。

## 工程骨架

```bash
git clone https://github.com/Neamar/KISS.git TrackerLauncher
```

增量大致如下（相对原版）：

```text
TrackerLauncher/
├── app/src/main/
│   ├── AndroidManifest.xml          # HOME/DEFAULT；可按需加存储权限
│   └── java/fr/neamar/kiss/
│       ├── MainActivity.java        # dispatchTouchEvent 触摸追踪
│       ├── KissApplication.java     # 可选 Instrumentation Hook
│       ├── result/AppResult.java    # doLaunch 启动追踪
│       └── tracker/                 # 新增
│           ├── TrackerCore.java
│           ├── InstrumentationHook.java
│           ├── NetworkTracker.java
│           └── FridaLauncher.java
└── frida/
    ├── anti_detection.js
    ├── hook_network.js
    ├── hook_okhttp.js
    ├── hook_deep_trace.js
    ├── hook_storage.js
    ├── hook_crypto.js
    ├── hook_system.js
    └── hook_stalker_full.js         # 重，默认可不挂
```

`AndroidManifest` 里保持 Launcher 关键 category：

```xml
<activity android:name=".MainActivity" ...>
  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
    <category android:name="android.intent.category.HOME" />
    <category android:name="android.intent.category.DEFAULT" />
  </intent-filter>
</activity>
```

装完后要在系统设置里把默认桌面切到这个 APK，否则点图标走的还是系统桌面，埋点不会触发。

## 触摸层：`MainActivity.dispatchTouchEvent`

### 事件从哪来

```text
硬件触摸屏
  → Linux input 子系统
  → SystemServer（InputDispatcher）
  → Activity.dispatchTouchEvent()   ← 我们在这里打点
  → ViewGroup.dispatchTouchEvent()
  → View.onTouchEvent()
```

### 原逻辑在干什么

KISS 在 `ACTION_DOWN` 里处理两件事：

1. 当前焦点若是搜索框 `SearchEditText`：判断点击是否在搜索框矩形内，决定光标显隐 / 键盘意图
2. 若有 popup 且是 DOWN：`dismissPopup()` 并 `return true` 消费事件，避免点到下面的图标

`MotionEvent` 常用字段：

| 字段 | 含义 |
|------|------|
| `getAction()` | 0 DOWN / 1 UP / 2 MOVE / 3 CANCEL |
| `getX/Y()` | 相对当前 View |
| `getRawX/Y()` | 相对屏幕 |
| `getEventTime()` | 时间戳 |
| `getPressure()` | 压力 0~1 |

注意：只有按下瞬间进 `ACTION_DOWN` 分支；MOVE / UP 不会重复进那段搜索框逻辑。

### 加追踪

在原有逻辑之前打 log，即可看到桌面上每一次按下：

```java
@Override
public boolean dispatchTouchEvent(MotionEvent ev) {
    if (ev.getAction() == MotionEvent.ACTION_DOWN) {
        Log.d("AppTracker", "═══════════════════════════════");
        Log.d("AppTracker", "[触摸] MainActivity 收到 DOWN");
        Log.d("AppTracker", "  坐标: (" + ev.getX() + ", " + ev.getY() + ")");
        Log.d("AppTracker", "  原始: (" + ev.getRawX() + ", " + ev.getRawY() + ")");
        Log.d("AppTracker", "  时间: " + ev.getEventTime());

        View v = getCurrentFocus();
        if (v instanceof SearchEditText) {
            SearchEditText edit = (SearchEditText) v;
            Rect outR = new Rect();
            edit.getGlobalVisibleRect(outR);
            boolean outside = !outR.contains((int) ev.getRawX(), (int) ev.getRawY());
            edit.setCursorVisible(!outside);
        }
    }

    if (mPopup != null && ev.getActionMasked() == MotionEvent.ACTION_DOWN) {
        dismissPopup();
        return true;
    }
    return super.dispatchTouchEvent(ev);
}
```

场景对照：

- 点在搜索框内 → `contains` 为 true → 显示光标、继续分发 → 键盘弹出
- 点在应用列表 → 若搜索框曾有焦点则先藏光标 → 事件落到 RecyclerView → `onClick` → 启动应用

触摸层只回答「用户点了哪」；**真正要追踪哪个包**，还得挂钩启动点。

## 启动层：`AppResult.doLaunch`

列表点击最终进 `AppResult.doLaunch`。Android 5.0+ 走 `LauncherApps` Binder 代理，不是直接在本进程 `startActivity` 完事：

```text
[Launcher 进程]
context.getSystemService(LAUNCHER_APPS_SERVICE)
  → LauncherApps（Binder Proxy）
  → launcher.startMainActivity(...)
      → [SystemServer] LauncherAppsService / AMS
      → 权限检查 → Zygote fork
      → 目标进程 ActivityThread → Application/Activity
```

### 埋点位置

在真正 `startMainActivity` **之前**：

1. 打结构化 log：包名、Component、耗时
2. 调用 `FridaLauncher.launchWithFrida(context, packageName)`

```java
@Override
public void doLaunch(Context context, View v) {
    Log.d("AppTracker", "╔════════════════════════════════════════");
    Log.d("AppTracker", "║ [AppResult] doLaunch()");
    Log.d("AppTracker", "║ 包名: " + pojo.packageName);
    Log.d("AppTracker", "║ Activity: " + className.getClassName());
    Log.d("AppTracker", "║ 组件: " + className.flattenToString());

    FridaLauncher.launchWithFrida(context, pojo.packageName);

    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            LauncherApps launcher =
                (LauncherApps) context.getSystemService(Context.LAUNCHER_APPS_SERVICE);
            Rect sourceBounds = null;
            Bundle opts = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                View icon = v.findViewById(R.id.item_app_icon);
                if (icon == null) icon = v.findViewById(R.id.favorite);
                if (icon != null) {
                    sourceBounds = getViewBounds(icon);
                    opts = ActivityOptions
                        .makeClipRevealAnimation(icon, 0, 0,
                            icon.getMeasuredWidth(), icon.getMeasuredHeight())
                        .toBundle();
                }
            }
            long t0 = System.currentTimeMillis();
            launcher.startMainActivity(
                className, pojo.userHandle.getRealHandle(), sourceBounds, opts);
            Log.d("AppTracker", "║ startMainActivity 耗时: "
                + (System.currentTimeMillis() - t0) + "ms");
        } else {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_LAUNCHER);
            intent.setComponent(className);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            context.startActivity(intent);
        }
        Log.d("AppTracker", "╚════════════════════════════════════════");
    } catch (ActivityNotFoundException | NullPointerException | SecurityException e) {
        Log.e("AppTracker", "启动失败: " + e.getMessage());
        Toast.makeText(context, R.string.application_not_found, Toast.LENGTH_LONG).show();
    }
}
```

## FridaLauncher：信号，而不是硬注入

早期尝试过把 Gadget / injector 打进 Launcher APK（`System.loadLibrary("frida-gadget")` + native `injectGadget(pid, script)`）。体积大、兼容性折腾，调试期不如「logcat 信号 + 宿主机脚本」稳。

推荐主路径：

```java
public class FridaLauncher {
    private static final String TAG = "FridaLauncher";
    private static final String PREFS_NAME = "tracker_config";

    public static void launchWithFrida(Context context, String packageName) {
        if (!isFridaEnabled(context, packageName)) {
            Log.d(TAG, "Frida 未启用: " + packageName);
            return;
        }
        // 特殊 tag，给 auto_frida_attach.sh 吃
        Log.i("FRIDA_TARGET", packageName);
        Log.i(TAG, "已标记待追踪: " + packageName);
    }

    private static boolean isFridaEnabled(Context context, String packageName) {
        SharedPreferences prefs =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        // 调试期可默认 true；正式应读全局开关 / 白名单
        boolean global = prefs.getBoolean("frida_global_enabled", true);
        if (global) return true;
        String whitelist = prefs.getString("frida_whitelist", "");
        return whitelist.contains(packageName);
    }

    public static void enableGlobalFrida(Context context, boolean enabled) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putBoolean("frida_global_enabled", enabled).apply();
    }

    public static void addToWhitelist(Context context, String packageName) {
        SharedPreferences prefs =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String whitelist = prefs.getString("frida_whitelist", "");
        if (!whitelist.contains(packageName)) {
            prefs.edit().putString("frida_whitelist", whitelist + packageName + ",").apply();
        }
    }
}
```

若仍要在设备上找 PID（Gadget 路线或调试用）：

```java
// 方式 A：ActivityManager（前缀匹配，兼容 :push 等多进程）
List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
for (ActivityManager.RunningAppProcessInfo p : processes) {
    if (p.processName.startsWith(packageName)) return p.pid;
}

// 方式 B：root 下 ps -A 解析第二列
Process process = Runtime.getRuntime().exec(new String[]{"su", "-c", "ps -A"});
```

脚本合并顺序建议（Stalker 默认别挂）：

```text
hook_deep_trace.js → hook_network.js → hook_okhttp.js
（可选）hook_storage / hook_crypto / hook_system
（慎用）hook_stalker_full.js
```

## 宿主机：`auto_frida_attach.sh`

Launcher 只打 `FRIDA_TARGET`；电脑上监听 logcat，等进程起来再 `frida -U -p`。

```bash
#!/bin/bash
# 用法：
#   chmod +x auto_frida_attach.sh
#   ./auto_frida_attach.sh
# 后台：
#   nohup ./auto_frida_attach.sh > frida_attach.log 2>&1 &

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRIDA_DIR="${FRIDA_DIR:-$SCRIPT_DIR/frida}"

echo "Frida 自动 Attach"
echo "监听 logcat 标签: FRIDA_TARGET"

if ! adb shell "ps -A | grep -q frida-server"; then
  echo "frida-server 未运行，尝试启动..."
  adb shell "/data/local/tmp/frida-server &"
  sleep 2
fi

adb logcat -c

adb logcat -s FRIDA_TARGET:I | while read -r line; do
  TARGET=$(echo "$line" | grep -oE 'com\.[a-zA-Z0-9._]+' | head -1)
  [ -z "$TARGET" ] && continue

  echo ""
  echo "检测到目标: $TARGET @ $(date '+%F %T')"

  sleep 1.5
  PID=""
  for i in 1 2 3; do
    PID=$(adb shell "pidof $TARGET 2>/dev/null" | tr -d '\r\n' | awk '{print $1}')
    [ -n "$PID" ] && break
    echo "  重试 $i/3..."
    sleep 0.5
  done

  if [ -z "$PID" ]; then
    echo "找不到进程: $TARGET"
    continue
  fi

  LOG_FILE="frida_${TARGET}_${PID}.log"
  rm -f "frida_${TARGET}_"*.log 2>/dev/null

  nohup frida -U -p "$PID" \
    -l "$FRIDA_DIR/hook_deep_trace.js" \
    -l "$FRIDA_DIR/hook_network.js" \
    -l "$FRIDA_DIR/hook_okhttp.js" \
    -l "$FRIDA_DIR/hook_storage.js" \
    -l "$FRIDA_DIR/hook_crypto.js" \
    -l "$FRIDA_DIR/hook_system.js" \
    > "$LOG_FILE" 2>&1 &

  echo "已 attach PID=$PID，日志 $LOG_FILE"
done
```

把脚本放在工程旁，或用环境变量 `FRIDA_DIR` 指向脚本目录。不要写死本机绝对路径。

### 实测现象

- 有的包（如部分 Google 组件）冷启动很快结束或进程名与包名不一致 → `pidof` 失败，需要改成 `ps` 模糊匹配或延时加长
- 普通 App（如桌面时钟）1.5s 后能拿到 PID，attach 正常
- 对加重反调试 / 多进程的目标，自动脚本往往不够，要改 spawn、换 Gadget、或手工 attach

`hook_deep_trace` / `hook_system` 一类脚本可覆盖：剪贴板、Toast/Dialog、WebView、反射、动态加载、定位、设备信息、权限检查、Shell 等——按目标裁剪，别一次全开。

## 使用注意

1. **默认桌面**必须切到魔改 Launcher
2. `FRIDA_TARGET` 与进程出现之间有竞态：冷启动要轮询 PID
3. 设备需已跑 `frida-server`（或你改成 Gadget 路线）
4. 这不是通用反反调试银弹：目标仍可检 Frida、检调试器、检内存特征
5. KISS 是 GPLv3，公开魔改仓库时注意许可证
6. Android 10+ 写 `/sdcard/frida/` 易踩分区权限；日志优先 logcat 或应用专属目录

## 小结

| 层次 | 钩子 | 产出 |
|------|------|------|
| 触摸 | `dispatchTouchEvent` | 坐标 / 时间线 |
| 启动 | `AppResult.doLaunch` | 包名 / Component / 耗时 |
| 注入 | `FRIDA_TARGET` + `auto_frida_attach.sh` | 自动挂脚本 |

把「用户点了哪个包」固定在 Launcher 启动路径上，再把包名甩给 Frida，比在目标进程里找 `Application.onCreate` 更早。后续可加深：`Instrumentation` 旁路 Activity 生命周期，或把网络面接到本系列的透明代理方案上。
